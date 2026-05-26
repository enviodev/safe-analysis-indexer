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

  // Match on (txHash, module) since one tx can host multiple module-tx rows
  // (one per module call).
  const indexerKey = (txHash: string, module: string) => `${txHash}:${module}`;
  const indexerByKey = new Map<string, NormalisedModuleTx>();
  for (const tx of indexerResult.txs) {
    const n = normaliseModuleFromIndexer(tx);
    indexerByKey.set(indexerKey(n.txHash, n.module), n);
  }

  for (const raw of canonicalPage.txs) {
    const canonical = normaliseModuleFromApi(chainId, raw);
    const key = indexerKey(canonical.txHash, canonical.module);
    const indexer = indexerByKey.get(key);
    if (!indexer) {
      diffs.push({
        field: `moduleTx[${key}]`,
        canonical: "present",
        indexer: "missing",
      });
      continue;
    }
    compareOne(diffs, canonical, indexer);
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
