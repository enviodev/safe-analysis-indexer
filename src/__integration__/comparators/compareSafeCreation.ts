// Compare creation context — what Safe TX Service `/v1/safes/{addr}/creation/`
// reports vs our Safe entity's creation fields (set by ProxyCreation /
// SafeSetup handlers).
//
// Notes on known gaps the comparator tolerates:
//   - setupData: our indexer stores it only on pre-1.3.0 paths (via setup
//     trace). Modern paths intentionally leave it null — see local/TODO.md.
//     So if canonical has data and we don't, it's only a mismatch when our
//     side also has it; a one-sided absence (us null, them populated) is
//     reported as a soft `setupData_missing` diff so it doesn't drown the
//     summary but is still visible.
//   - factoryAddress: legitimately null on SafeSetup-first orphans where
//     ProxyCreation never arrived. Both sides may have null — that's fine.

import * as safeApi from "../clients/safeApi";
import * as indexerApi from "../clients/indexerApi";
import {
  normaliseCreationFromApi,
  normaliseCreationFromIndexer,
} from "../normalize";
import type { ChainId, DiffResult, FieldDiff } from "../types";

export async function compareSafeCreation(
  chainId: ChainId,
  safeAddress: string,
): Promise<DiffResult> {
  const [canonicalRaw, indexerRaw] = await Promise.all([
    safeApi.getSafeCreation(chainId, safeAddress),
    indexerApi.getSafeCreation(chainId, safeAddress),
  ]);

  if (!canonicalRaw && !indexerRaw) {
    return { kind: "skipped", reason: "no_data_either_side" };
  }
  if (!canonicalRaw) {
    return { kind: "skipped", reason: "canonical_404" };
  }
  if (!indexerRaw) {
    return { kind: "skipped", reason: "not_synced" };
  }

  const canonical = normaliseCreationFromApi(chainId, safeAddress, canonicalRaw);
  const indexer = normaliseCreationFromIndexer(indexerRaw);

  const diffs: FieldDiff[] = [];

  if (canonical.creationTxHash !== indexer.creationTxHash) {
    diffs.push({
      field: "creationTxHash",
      canonical: canonical.creationTxHash,
      indexer: indexer.creationTxHash,
    });
  }
  if (canonical.factoryAddress !== indexer.factoryAddress) {
    diffs.push({
      field: "factoryAddress",
      canonical: canonical.factoryAddress,
      indexer: indexer.factoryAddress,
    });
  }
  if (canonical.masterCopy !== indexer.masterCopy) {
    diffs.push({
      field: "masterCopy",
      canonical: canonical.masterCopy,
      indexer: indexer.masterCopy,
    });
  }
  if (canonical.creator !== indexer.creator) {
    diffs.push({
      field: "creator/initiator",
      canonical: canonical.creator,
      indexer: indexer.creator,
    });
  }
  // setupData: tolerate the documented modern-path null gap on our side. Only
  // flag a real mismatch when both sides have it AND they differ.
  if (canonical.setupData != null && indexer.setupData != null) {
    if (canonical.setupData !== indexer.setupData) {
      diffs.push({
        field: "setupData",
        canonical: canonical.setupData,
        indexer: indexer.setupData,
      });
    }
  } else if (canonical.setupData != null && indexer.setupData == null) {
    // Known gap from local/TODO.md — surface as a separate field so it can be
    // filtered out of "real" diffs by a CSV/grep step.
    diffs.push({
      field: "setupData_missing_indexer",
      canonical: "<populated>",
      indexer: null,
    });
  }

  return diffs.length === 0 ? { kind: "passed" } : { kind: "mismatched", diffs };
}
