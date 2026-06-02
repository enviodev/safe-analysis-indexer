// Compare module transactions: total count + top-N most recent field-level
// compare keyed by (txHash, module).
//
// Field coverage (per matched tx):
//   - blockNumber, executionTimestamp
//   - to, value, data, operation
//
// success is intentionally not compared: our SafeModuleTransaction schema
// doesn't track success on module txs (the contract event doesn't carry it
// the way ExecutionSuccess/Failure does for multisig txs).

import * as safeApi from "../clients/safeApi";
import * as indexerApi from "../clients/indexerApi";
import {
  normaliseModuleFromApi,
  normaliseModuleFromIndexer,
} from "../normalize";
import { DEFAULT_TOP_N_TX_COMPARE } from "../sampling.config";
import type {
  ChainId,
  ComparisonCeiling,
  DiffResult,
  FieldDiff,
  NormalisedModuleTx,
} from "../types";

function diffField(
  diffs: FieldDiff[],
  field: string,
  canonical: unknown,
  indexer: unknown,
): void {
  if (canonical !== indexer) {
    diffs.push({ field, canonical, indexer });
  }
}

function compareOne(
  diffs: FieldDiff[],
  canonical: NormalisedModuleTx,
  indexer: NormalisedModuleTx,
): void {
  const tag = `${canonical.txHash}:${canonical.module}`;
  diffField(diffs, `blockNumber[${tag}]`, canonical.blockNumber, indexer.blockNumber);
  diffField(diffs, `to[${tag}]`, canonical.to, indexer.to);
  diffField(diffs, `value[${tag}]`, canonical.value, indexer.value);
  diffField(diffs, `data[${tag}]`, canonical.data, indexer.data);
  diffField(diffs, `operation[${tag}]`, canonical.operation, indexer.operation);
  if (Math.abs(canonical.executionTimestamp - indexer.executionTimestamp) > 1) {
    diffs.push({
      field: `executionTimestamp[${tag}]`,
      canonical: canonical.executionTimestamp,
      indexer: indexer.executionTimestamp,
    });
  }
}

export async function compareModuleTxs(
  chainId: ChainId,
  safeAddress: string,
  ceiling: ComparisonCeiling,
): Promise<DiffResult> {
  const [canonicalPage, indexerResult] = await Promise.all([
    safeApi.getModuleTransactions(chainId, safeAddress, {
      limit: DEFAULT_TOP_N_TX_COMPARE,
      blockNumberLte: ceiling.block,
    }),
    indexerApi.getModuleTransactions(chainId, safeAddress, ceiling.block, 1000),
  ]);

  if (!canonicalPage) {
    return indexerResult.txs.length === 0
      ? { kind: "skipped", reason: "no_data_either_side" }
      : { kind: "skipped", reason: "canonical_404" };
  }

  if (canonicalPage.total === 0 && indexerResult.txs.length === 0) {
    return { kind: "passed" };
  }

  if (canonicalPage.total > 0 && indexerResult.txs.length === 0) {
    return { kind: "skipped", reason: "not_synced" };
  }

  const diffs: FieldDiff[] = [];

  const canonicalCount = Math.min(canonicalPage.total, 1000);
  const indexerCount = indexerResult.txs.length;
  if (!indexerResult.capped && canonicalCount !== indexerCount) {
    diffs.push({ field: "count", canonical: canonicalCount, indexer: indexerCount });
  }

  // Rows are grouped by (txHash, module) — one tx can host multiple module-tx
  // rows when a module calls multiple sub-targets in a single execution
  // (e.g. a module orchestrating a MultiSend bundle). Safe TX Service
  // doesn't expose a logIndex, and canonical pages at
  // `DEFAULT_TOP_N_TX_COMPARE` while we fetch up to 1000 from the indexer,
  // so position-based pairing within a group is unreliable (canonical's
  // dropped rows would knock all subsequent positions out of alignment).
  //
  // Instead, for each canonical row we look up an indexer row that matches
  // exactly on content (to, value, data, operation) and consume it. Indexer
  // rows that find no canonical counterpart are tolerated — canonical may
  // have paginated them out. Real divergence surfaces as a "no match" diff
  // per canonical row. Total-count divergence is already flagged separately
  // above.
  const groupKey = (txHash: string, module: string) => `${txHash}:${module}`;
  const contentKey = (r: NormalisedModuleTx) =>
    `${r.to}|${r.value}|${r.data}|${r.operation}`;

  function groupRows(
    rows: NormalisedModuleTx[],
  ): Map<string, NormalisedModuleTx[]> {
    const out = new Map<string, NormalisedModuleTx[]>();
    for (const r of rows) {
      const k = groupKey(r.txHash, r.module);
      const arr = out.get(k);
      if (arr) arr.push(r);
      else out.set(k, [r]);
    }
    return out;
  }

  const canonicalGroups = groupRows(
    canonicalPage.txs.map((raw) => normaliseModuleFromApi(chainId, raw)),
  );
  const indexerGroups = groupRows(
    indexerResult.txs.map((tx) => normaliseModuleFromIndexer(tx)),
  );

  for (const [k, canonRows] of canonicalGroups) {
    // Mutable copy — we splice matched rows out so duplicates (same content,
    // multiple rows) get paired one-for-one.
    const indexerRows = (indexerGroups.get(k) ?? []).slice();
    for (const c of canonRows) {
      const target = contentKey(c);
      const matchIdx = indexerRows.findIndex(
        (i) => contentKey(i) === target,
      );
      if (matchIdx === -1) {
        // Surface the canonical row's key fields so the diff is greppable
        // without the indexer-side noise of the dropped position counter.
        diffs.push({
          field: `moduleTx[${k}:to=${c.to}]`,
          canonical: contentKey(c),
          indexer: "no content match in indexer",
        });
        continue;
      }
      const i = indexerRows.splice(matchIdx, 1)[0]!;
      // Content already matches; compareOne only finds diffs on
      // blockNumber / executionTimestamp at this point.
      compareOne(diffs, c, i);
    }
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
