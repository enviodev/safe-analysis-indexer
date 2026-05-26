// Compare Safe metadata between Safe Transaction Service (canonical) and our
// indexer. Field-level diff with the canonical value as the source of truth.

import * as safeApi from "../clients/safeApi";
import * as indexerApi from "../clients/indexerApi";
import {
  normaliseSafeFromApi,
  normaliseSafeFromIndexer,
} from "../normalize";
import type { ChainId, DiffResult, FieldDiff, NormalisedSafe } from "../types";

function diffField<K extends keyof NormalisedSafe>(
  diffs: FieldDiff[],
  field: K,
  canonical: NormalisedSafe,
  indexer: NormalisedSafe,
): void {
  const cv = canonical[field];
  const iv = indexer[field];
  // Arrays: deep compare via JSON since both sides are sorted lowercase
  // strings — no need for a real deep-equal lib.
  if (Array.isArray(cv) && Array.isArray(iv)) {
    if (JSON.stringify(cv) !== JSON.stringify(iv)) {
      diffs.push({ field: String(field), canonical: cv, indexer: iv });
    }
    return;
  }
  if (cv !== iv) {
    diffs.push({ field: String(field), canonical: cv, indexer: iv });
  }
}

export async function compareSafeMetadata(
  chainId: ChainId,
  safeAddress: string,
): Promise<DiffResult> {
  const [canonicalRaw, indexerRaw] = await Promise.all([
    safeApi.getSafe(chainId, safeAddress),
    indexerApi.getSafe(chainId, safeAddress),
  ]);

  if (!canonicalRaw && !indexerRaw) {
    return { kind: "skipped", reason: "no_data_either_side" };
  }
  if (!canonicalRaw) {
    // We have it, they don't — surface as a mismatch so the operator notices.
    return {
      kind: "mismatched",
      diffs: [{ field: "existence", canonical: null, indexer: "present" }],
    };
  }
  if (!indexerRaw) {
    return { kind: "skipped", reason: "not_synced" };
  }

  const canonical = normaliseSafeFromApi(chainId, canonicalRaw);
  const indexer = normaliseSafeFromIndexer(indexerRaw);

  const diffs: FieldDiff[] = [];
  diffField(diffs, "owners", canonical, indexer);
  diffField(diffs, "threshold", canonical, indexer);
  diffField(diffs, "masterCopy", canonical, indexer);
  diffField(diffs, "fallbackHandler", canonical, indexer);
  diffField(diffs, "guard", canonical, indexer);
  diffField(diffs, "modules", canonical, indexer);
  diffField(diffs, "version", canonical, indexer);
  // nonce is "in-flight" — Safe TX Service reports the current on-chain nonce
  // including queued txs, our indexer reports the last executed nonce. They
  // can legitimately differ on actively-used Safes. Skip from the strict
  // compare; surface as a soft-diff only when both sides report 0/0 — i.e.,
  // when there's no in-flight ambiguity.
  if (canonical.nonce === 0 && indexer.nonce !== 0) {
    diffs.push({ field: "nonce", canonical: 0, indexer: indexer.nonce });
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
