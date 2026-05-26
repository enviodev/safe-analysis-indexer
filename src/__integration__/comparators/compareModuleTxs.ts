// Compare module transactions: total count + top-N most recent field-level
// compare keyed by (txHash, module).

import * as safeApi from "../clients/safeApi";
import * as indexerApi from "../clients/indexerApi";
import {
  normaliseModuleFromApi,
  normaliseModuleFromIndexer,
} from "../normalize";
import { DEFAULT_TOP_N_TX_COMPARE } from "../sampling.config";
import type { ChainId, DiffResult, FieldDiff } from "../types";

export async function compareModuleTxs(
  chainId: ChainId,
  safeAddress: string,
): Promise<DiffResult> {
  const [canonicalPage, indexerResult] = await Promise.all([
    safeApi.getModuleTransactions(chainId, safeAddress, DEFAULT_TOP_N_TX_COMPARE, 0),
    indexerApi.getModuleTransactions(chainId, safeAddress, 1000),
  ]);

  if (!canonicalPage) {
    return indexerResult.txs.length === 0
      ? { kind: "skipped", reason: "no_data_either_side" }
      : {
          kind: "mismatched",
          diffs: [
            {
              field: "existence",
              canonical: "not_found",
              indexer: `${indexerResult.txs.length} txs`,
            },
          ],
        };
  }

  // Most Safes have zero module transactions — that's a valid pass, not a skip.
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

  // Top-N field compare. Match on (txHash, module) since the Safe TX Service
  // module endpoint can have multiple module-tx rows per containing tx (one
  // per module call).
  const indexerKey = (txHash: string, module: string) => `${txHash}:${module}`;
  const indexerByKey = new Map<
    string,
    ReturnType<typeof normaliseModuleFromIndexer>
  >();
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
    if (canonical.blockNumber !== indexer.blockNumber) {
      diffs.push({
        field: `blockNumber[${key}]`,
        canonical: canonical.blockNumber,
        indexer: indexer.blockNumber,
      });
    }
    // success isn't tracked on our SafeModuleTransaction — skip.
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
