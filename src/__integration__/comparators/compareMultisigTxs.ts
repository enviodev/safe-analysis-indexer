// Compare multisig transactions: total executed count + top-N most recent
// field-level compare keyed by safeTxHash.

import * as safeApi from "../clients/safeApi";
import * as indexerApi from "../clients/indexerApi";
import {
  normaliseMultisigFromApi,
  normaliseMultisigFromIndexer,
} from "../normalize";
import { DEFAULT_TOP_N_TX_COMPARE } from "../sampling.config";
import type { ChainId, DiffResult, FieldDiff, NormalisedMultisigTx } from "../types";

function indexBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    if (k) out.set(k, r);
  }
  return out;
}

export async function compareMultisigTxs(
  chainId: ChainId,
  safeAddress: string,
): Promise<DiffResult> {
  const [canonicalPage, indexerResult] = await Promise.all([
    safeApi.getMultisigTransactions(chainId, safeAddress, DEFAULT_TOP_N_TX_COMPARE, 0, true),
    indexerApi.getMultisigTransactions(chainId, safeAddress, 1000),
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

  // If canonical has data but indexer doesn't, the Safe likely hasn't been
  // synced yet for this chain. Skip with reason so the summary tracks it.
  if (canonicalPage.total > 0 && indexerResult.txs.length === 0) {
    return { kind: "skipped", reason: "not_synced" };
  }

  const diffs: FieldDiff[] = [];

  // Count compare. Cap canonical count at 1000 for parity with what we
  // pulled from the indexer (otherwise long-running Safes would always
  // diff on count and drown the signal).
  const canonicalCount = Math.min(canonicalPage.total, 1000);
  const indexerCount = indexerResult.txs.length;
  if (indexerResult.capped) {
    // Both sides hit the cap — count compare is meaningless.
  } else if (canonicalCount !== indexerCount) {
    diffs.push({ field: "count", canonical: canonicalCount, indexer: indexerCount });
  }

  // Top-N compare: walk the canonical list (already ordered -execution_date)
  // and match each to the indexer's by safeTxHash. Skip canonical rows
  // without a transactionHash (not yet executed; the indexer wouldn't see
  // them).
  const canonicalNorm: NormalisedMultisigTx[] = canonicalPage.txs
    .map((tx) => normaliseMultisigFromApi(chainId, tx))
    .filter((tx) => tx.txHash !== "");

  const indexerByHash = indexBy(
    indexerResult.txs.map((tx) => normaliseMultisigFromIndexer(tx)),
    (tx) => tx.safeTxHash,
  );

  for (const canonical of canonicalNorm) {
    if (!canonical.safeTxHash) continue;
    const indexer = indexerByHash.get(canonical.safeTxHash);
    if (!indexer) {
      diffs.push({
        field: `safeTxHash[${canonical.safeTxHash}]`,
        canonical: "present",
        indexer: "missing",
      });
      continue;
    }
    // Compare the fields where divergence would be a real bug.
    if (canonical.txHash !== indexer.txHash) {
      diffs.push({
        field: `txHash[${canonical.safeTxHash}]`,
        canonical: canonical.txHash,
        indexer: indexer.txHash,
      });
    }
    // success: Safe TX Service may report null briefly; only diff when both sides have it.
    if (canonical.success != null && indexer.success != null && canonical.success !== indexer.success) {
      diffs.push({
        field: `success[${canonical.safeTxHash}]`,
        canonical: canonical.success,
        indexer: indexer.success,
      });
    }
    if (canonical.nonce !== indexer.nonce) {
      diffs.push({
        field: `nonce[${canonical.safeTxHash}]`,
        canonical: canonical.nonce,
        indexer: indexer.nonce,
      });
    }
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
