// Cross-reference integration suite.
//
// Reads sample size + chain set from env, samples Safes per chain (at module
// load time so `it.each` can register a row per Safe), runs all three
// comparators against each, and prints a summary table at the end.
//
// Run with: `pnpm test:integration`
//
// Env vars (all optional):
//   INTEGRATION_SAMPLE_SIZE       default 10
//   INTEGRATION_CHAINS            comma-separated, default "1,100"
//   INTEGRATION_INDEXER_ENDPOINT  override the indexer GraphQL URL
//   INTEGRATION_SKIP_PING         if "1", skip the indexer-reachable precondition

import { afterAll, describe, expect, it } from "vitest";
import { buildSample } from "./samplers";
import { compareSafeMetadata } from "./comparators/compareSafeMetadata";
import { compareSafeCreation } from "./comparators/compareSafeCreation";
import { compareMultisigTxs } from "./comparators/compareMultisigTxs";
import { compareModuleTxs } from "./comparators/compareModuleTxs";
import { ping, indexerEndpoint } from "./clients/indexerApi";
import {
  DEFAULT_CHAINS,
  DEFAULT_SAMPLE_SIZE,
} from "./sampling.config";
import type { ChainId, DiffResult, SampleEntry } from "./types";

const SAMPLE_SIZE = process.env.INTEGRATION_SAMPLE_SIZE
  ? Number(process.env.INTEGRATION_SAMPLE_SIZE)
  : DEFAULT_SAMPLE_SIZE;

const CHAINS: ChainId[] = (process.env.INTEGRATION_CHAINS
  ? process.env.INTEGRATION_CHAINS.split(",").map((s) => Number(s.trim()))
  : DEFAULT_CHAINS) as ChainId[];

type ComparatorName = "metadata" | "creation" | "multisigTxs" | "moduleTxs";

interface RunRow {
  chainId: ChainId;
  safeAddress: string;
  comparator: ComparatorName;
  result: DiffResult;
}

const results: RunRow[] = [];

// Top-level await: vitest is ESM and supports this. We need the samples to
// exist BEFORE the describe block so `it.each` can register a row per Safe.
// If the indexer is unreachable or sampling yields nothing, the
// preflight/empty-sample assertions inside the describe still report the
// problem.
const preflightOk =
  process.env.INTEGRATION_SKIP_PING === "1" ? true : await ping();

const samples: SampleEntry[] = preflightOk
  ? (
      await Promise.all(CHAINS.map((chainId) => buildSample(chainId, SAMPLE_SIZE)))
    ).flat()
  : [];

describe("cross-reference integration (Safe TX Service ↔ Envio indexer)", () => {
  it("preflight: indexer endpoint is reachable", () => {
    if (!preflightOk) {
      console.warn(`[cross-ref] indexer not reachable at ${indexerEndpoint()}`);
    }
    expect(preflightOk).toBe(true);
  });

  it("sample set is non-empty", () => {
    if (samples.length === 0) {
      console.warn(
        `[cross-ref] no samples built for chains ${CHAINS.join(",")} — ` +
          `curate seed owners in sampling.config.ts or check the indexer has data on these chains`,
      );
    }
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — metadata",
    async ({ chainId, safeAddress }) => {
      const result = await compareSafeMetadata(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "metadata", result });
      if (result.kind === "mismatched") {
        throw new Error(formatMismatch("metadata", chainId, safeAddress, result));
      }
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — creation",
    async ({ chainId, safeAddress }) => {
      const result = await compareSafeCreation(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "creation", result });
      if (result.kind === "mismatched") {
        throw new Error(formatMismatch("creation", chainId, safeAddress, result));
      }
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — multisig txs",
    async ({ chainId, safeAddress }) => {
      const result = await compareMultisigTxs(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "multisigTxs", result });
      if (result.kind === "mismatched") {
        throw new Error(formatMismatch("multisigTxs", chainId, safeAddress, result));
      }
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — module txs",
    async ({ chainId, safeAddress }) => {
      const result = await compareModuleTxs(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "moduleTxs", result });
      if (result.kind === "mismatched") {
        throw new Error(formatMismatch("moduleTxs", chainId, safeAddress, result));
      }
    },
  );
});

afterAll(() => {
  if (samples.length === 0) return;
  // vitest reporters swallow console.log in afterAll — write to stderr
  // directly so the summary always surfaces, regardless of reporter.
  const write = (line: string) => process.stderr.write(line + "\n");
  write("\n[cross-ref] summary by (chain, comparator):");
  const counts = new Map<
    string,
    { passed: number; mismatched: number; skipped: number; total: number }
  >();
  for (const r of results) {
    const k = `chain=${r.chainId} comparator=${r.comparator}`;
    const c = counts.get(k) ?? { passed: 0, mismatched: 0, skipped: 0, total: 0 };
    c.total++;
    c[r.result.kind]++;
    counts.set(k, c);
  }
  for (const key of [...counts.keys()].sort()) {
    const c = counts.get(key)!;
    write(
      `  ${key.padEnd(38)} total=${c.total} passed=${c.passed} mismatched=${c.mismatched} skipped=${c.skipped}`,
    );
  }
  // Also break down skip reasons — useful for triaging "indexer is behind".
  const skipReasons = new Map<string, number>();
  for (const r of results) {
    if (r.result.kind !== "skipped") continue;
    const k = `chain=${r.chainId} reason=${r.result.reason}`;
    skipReasons.set(k, (skipReasons.get(k) ?? 0) + 1);
  }
  if (skipReasons.size > 0) {
    write("[cross-ref] skip reasons:");
    for (const key of [...skipReasons.keys()].sort()) {
      write(`  ${key.padEnd(38)} count=${skipReasons.get(key)}`);
    }
  }
});

function formatMismatch(
  comparator: ComparatorName,
  chainId: ChainId,
  safeAddress: string,
  result: Extract<DiffResult, { kind: "mismatched" }>,
): string {
  const header = `[${comparator}] chain=${chainId} safe=${safeAddress}`;
  const lines = result.diffs.map(
    (d) =>
      `  - ${d.field}: canonical=${JSON.stringify(d.canonical)} indexer=${JSON.stringify(d.indexer)}`,
  );
  return [header, ...lines].join("\n");
}
