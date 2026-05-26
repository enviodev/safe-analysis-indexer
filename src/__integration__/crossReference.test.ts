// Cross-reference integration suite.
//
// Reads sample size + chain set from env, samples Safes per chain (at module
// load time so `it.each` can register a row per Safe), runs all four
// comparators against each, and prints a summary at the end.
//
// Run with: `pnpm test:integration`
//
// Env vars (read from `.env` at the project root if present; shell vars win):
//   INTEGRATION_INDEXER_ENDPOINT  (required) indexer GraphQL URL — no default
//   INTEGRATION_SAMPLE_SIZE       default 10
//   INTEGRATION_CHAINS            comma-separated, default "1,100"
//   INTEGRATION_SKIP_PING         if "1", skip the indexer-reachable precondition

// Side-effect import — populates process.env from `.env` BEFORE the env reads
// further down execute. Existing shell-set vars are preserved (dotenv default).
// Must stay at the very top: any import below could touch process.env at
// module-init time.
import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import { buildSample } from "./samplers";
import { compareSafeMetadata } from "./comparators/compareSafeMetadata";
import { compareSafeCreation } from "./comparators/compareSafeCreation";
import { compareMultisigTxs } from "./comparators/compareMultisigTxs";
import { compareModuleTxs } from "./comparators/compareModuleTxs";
import {
  ping,
  isIndexerEndpointConfigured,
  indexerEndpoint,
} from "./clients/indexerApi";
import {
  DEFAULT_CHAINS,
  DEFAULT_SAMPLE_SIZE,
} from "./sampling.config";
import {
  formatMismatchBlock,
  formatMismatchShort,
  formatSummary,
  summariseSamples,
  type RunRow,
} from "./formatting";
import type { ChainId, DiffResult, SampleEntry } from "./types";

const SAMPLE_SIZE_RAW = process.env.INTEGRATION_SAMPLE_SIZE;
const SAMPLE_SIZE =
  SAMPLE_SIZE_RAW == null || SAMPLE_SIZE_RAW.trim() === ""
    ? DEFAULT_SAMPLE_SIZE
    : Number(SAMPLE_SIZE_RAW);
if (!Number.isInteger(SAMPLE_SIZE) || SAMPLE_SIZE <= 0) {
  throw new Error(
    `Invalid INTEGRATION_SAMPLE_SIZE="${SAMPLE_SIZE_RAW}". Expected a positive integer.`,
  );
}

const CHAINS_RAW = process.env.INTEGRATION_CHAINS;
const CHAINS: ChainId[] = (() => {
  if (CHAINS_RAW == null || CHAINS_RAW.trim() === "") return DEFAULT_CHAINS;
  const parsed = CHAINS_RAW.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
  if (parsed.length === 0 || parsed.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(
      `Invalid INTEGRATION_CHAINS="${CHAINS_RAW}". Expected comma-separated positive integers.`,
    );
  }
  return parsed as ChainId[];
})();

type ComparatorName = "metadata" | "creation" | "multisigTxs" | "moduleTxs";

const results: RunRow[] = [];
const writeErr = (line: string) => process.stderr.write(line + "\n");

// Top-level await: vitest is ESM and supports this. We need the samples to
// exist BEFORE the describe block so `it.each` can register a row per Safe.
const endpointConfigured = isIndexerEndpointConfigured();
if (!endpointConfigured) {
  writeErr(
    "[cross-ref] INTEGRATION_INDEXER_ENDPOINT is not set. " +
      "Provide your indexer GraphQL URL via env, e.g. " +
      "INTEGRATION_INDEXER_ENDPOINT=https://indexer.eu.hyperindex.xyz/<hash>/v1/graphql",
  );
} else {
  writeErr(`[cross-ref] indexer endpoint: ${indexerEndpoint()}`);
  writeErr(`[cross-ref] chains: ${CHAINS.join(",")}   sample size per chain: ${SAMPLE_SIZE}`);
}

const preflightOk =
  process.env.INTEGRATION_SKIP_PING === "1"
    ? endpointConfigured
    : endpointConfigured && (await ping());

if (endpointConfigured && !preflightOk) {
  writeErr(`[cross-ref] indexer not reachable at ${indexerEndpoint()}`);
}

const samples: SampleEntry[] = preflightOk
  ? (
      await Promise.all(CHAINS.map((chainId) => buildSample(chainId, SAMPLE_SIZE)))
    ).flat()
  : [];

if (preflightOk) {
  const breakdown = summariseSamples(samples);
  if (breakdown.length === 0) {
    writeErr(`[cross-ref] no samples built — sampling.config.ts seed owners may be empty and indexer-direct fallback returned nothing`);
  } else {
    for (const b of breakdown) {
      writeErr(
        `[cross-ref] sample chain=${b.chainId}: total=${b.total}` +
          ` owner-anchored=${b.bySource["owner-anchored"]}` +
          ` recent-activity=${b.bySource["recent-activity"]}` +
          ` indexer-direct=${b.bySource["indexer-direct"]}`,
      );
    }
  }
}

// Handle a mismatched comparator result: log the readable block to stderr,
// then throw a short error so Vitest's failure tail stays scannable.
function reportMismatch(
  comparator: ComparatorName,
  chainId: ChainId,
  safeAddress: string,
  result: Extract<DiffResult, { kind: "mismatched" }>,
): never {
  writeErr("");
  writeErr(formatMismatchBlock(comparator, chainId, safeAddress, result.diffs));
  throw new Error(formatMismatchShort(comparator, result.diffs));
}

describe("cross-reference integration (Safe TX Service ↔ Envio indexer)", () => {
  it("preflight: INTEGRATION_INDEXER_ENDPOINT is set and reachable", () => {
    if (!endpointConfigured) {
      throw new Error(
        "INTEGRATION_INDEXER_ENDPOINT is not set. " +
          "Set it to the indexer GraphQL URL you want to cross-reference against, e.g. " +
          "INTEGRATION_INDEXER_ENDPOINT=https://indexer.eu.hyperindex.xyz/<hash>/v1/graphql " +
          "pnpm test:integration",
      );
    }
    if (!preflightOk) {
      throw new Error(`indexer not reachable at ${indexerEndpoint()}`);
    }
    expect(preflightOk).toBe(true);
  });

  it("sample set is non-empty", () => {
    if (samples.length === 0) {
      writeErr(
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
      if (result.kind === "mismatched") reportMismatch("metadata", chainId, safeAddress, result);
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — creation",
    async ({ chainId, safeAddress }) => {
      const result = await compareSafeCreation(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "creation", result });
      if (result.kind === "mismatched") reportMismatch("creation", chainId, safeAddress, result);
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — multisig txs",
    async ({ chainId, safeAddress }) => {
      const result = await compareMultisigTxs(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "multisigTxs", result });
      if (result.kind === "mismatched") reportMismatch("multisigTxs", chainId, safeAddress, result);
    },
  );

  it.each(samples)(
    "[chain $chainId][$source] $safeAddress — module txs",
    async ({ chainId, safeAddress }) => {
      const result = await compareModuleTxs(chainId, safeAddress);
      results.push({ chainId, safeAddress, comparator: "moduleTxs", result });
      if (result.kind === "mismatched") reportMismatch("moduleTxs", chainId, safeAddress, result);
    },
  );
});

afterAll(() => {
  if (samples.length === 0 && !endpointConfigured) return;
  const url = endpointConfigured ? indexerEndpoint() : "<unset>";
  writeErr(formatSummary(url, samples, results));
});
