// Compare multisig transactions: total count + top-N most recent field-level
// compare keyed by safeTxHash, against every comparable field both sources
// expose.
//
// Field coverage (per matched tx):
//   - txHash, executionDate, blockNumber, success, nonce
//   - to, value, data, operation
//   - safeTxGas, baseGas, gasPrice, gasToken, refundReceiver
//   - signatures
//   - threshold (= canonical confirmationsRequired snapshot)
//   - executor (= canonical executor / indexer msgSender)
//
// Tolerance notes:
//   - signatures: indexer captures whatever bytes the SafeMultiSigTransaction
//     event carries; Safe TX Service can return server-merged confirmations
//     for some Safes. If both are populated and they differ, flag — but
//     because divergence here is expected on partially-synced data, the diff
//     surfaces under a distinct field name so it can be filtered.
//   - executionDate: ±1 second drift tolerated (both sources truncate to
//     seconds, but timezone/parse roundtrips can shift by 1).

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

// Compare every field on a single matched pair. The label prefix makes
// diff lines greppable to a specific safeTxHash.
function compareOne(
  diffs: FieldDiff[],
  canonical: NormalisedMultisigTx,
  indexer: NormalisedMultisigTx,
): void {
  const tag = canonical.safeTxHash ?? "?";
  diffField(diffs, `txHash[${tag}]`, canonical.txHash, indexer.txHash);
  if (canonical.success != null && indexer.success != null) {
    diffField(diffs, `success[${tag}]`, canonical.success, indexer.success);
  }
  diffField(diffs, `nonce[${tag}]`, canonical.nonce, indexer.nonce);
  diffField(diffs, `to[${tag}]`, canonical.to, indexer.to);
  diffField(diffs, `value[${tag}]`, canonical.value, indexer.value);
  diffField(diffs, `data[${tag}]`, canonical.data, indexer.data);
  diffField(diffs, `operation[${tag}]`, canonical.operation, indexer.operation);
  diffField(diffs, `safeTxGas[${tag}]`, canonical.safeTxGas, indexer.safeTxGas);
  diffField(diffs, `baseGas[${tag}]`, canonical.baseGas, indexer.baseGas);
  diffField(diffs, `gasPrice[${tag}]`, canonical.gasPrice, indexer.gasPrice);
  diffField(diffs, `gasToken[${tag}]`, canonical.gasToken, indexer.gasToken);
  diffField(diffs, `refundReceiver[${tag}]`, canonical.refundReceiver, indexer.refundReceiver);
  diffField(diffs, `signatures[${tag}]`, canonical.signatures, indexer.signatures);
  diffField(diffs, `threshold[${tag}]`, canonical.threshold, indexer.threshold);
  if (canonical.executor != null && indexer.executor != null) {
    diffField(diffs, `executor[${tag}]`, canonical.executor, indexer.executor);
  }
  if (canonical.blockNumber != null) {
    diffField(diffs, `blockNumber[${tag}]`, canonical.blockNumber, indexer.blockNumber);
  }
  // executionDate: tolerate ±1s
  if (Math.abs(canonical.executionDate - indexer.executionDate) > 1) {
    diffs.push({
      field: `executionDate[${tag}]`,
      canonical: canonical.executionDate,
      indexer: indexer.executionDate,
    });
  }
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
      : { kind: "skipped", reason: "canonical_404" };
  }

  if (canonicalPage.total > 0 && indexerResult.txs.length === 0) {
    return { kind: "skipped", reason: "not_synced" };
  }

  if (canonicalPage.total === 0 && indexerResult.txs.length === 0) {
    return { kind: "passed" };
  }

  const diffs: FieldDiff[] = [];

  // Count compare. Cap canonical count at our indexer-side limit (1000) so
  // long-running Safes don't always count-diff.
  const canonicalCount = Math.min(canonicalPage.total, 1000);
  const indexerCount = indexerResult.txs.length;
  if (!indexerResult.capped && canonicalCount !== indexerCount) {
    diffs.push({ field: "count", canonical: canonicalCount, indexer: indexerCount });
  }

  const canonicalNorm: NormalisedMultisigTx[] = canonicalPage.txs
    .map((tx) => normaliseMultisigFromApi(chainId, tx))
    .filter((tx) => tx.txHash !== ""); // skip queued-but-not-executed

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
    compareOne(diffs, canonical, indexer);
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
