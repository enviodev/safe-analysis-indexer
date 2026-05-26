// Shared types for the cross-reference integration suite.
//
// Both sources (Safe Transaction Service REST + our Envio GraphQL) get
// projected into the *Normalised* shapes below before comparison, so the
// comparators don't have to know about either source's quirks.

export type ChainId = 1 | 100;
export type SafeAddress = `0x${string}`;

// SafeVersion enum string as stored in the indexer.
export type SafeVersionEnum =
  | "V0_0_2"
  | "V0_1_0"
  | "V1_0_0"
  | "V1_1_0"
  | "V1_1_1"
  | "V1_2_0"
  | "V1_3_0"
  | "V1_4_1"
  | "V1_5_0"
  | "UNKNOWN";

export interface NormalisedSafe {
  chainId: ChainId;
  address: string; // lowercase
  owners: string[]; // lowercase, sorted
  threshold: number;
  masterCopy: string | null; // lowercase or null
  fallbackHandler: string | null; // lowercase or null
  guard: string; // lowercase, defaults to ZERO_ADDRESS
  modules: string[]; // lowercase, sorted
  version: SafeVersionEnum;
  nonce: number;
}

export interface NormalisedMultisigTx {
  safeAddress: string; // lowercase
  chainId: ChainId;
  safeTxHash: string | null; // lowercase or null (null until ExecutionSuccess/Failure on our side)
  txHash: string; // lowercase
  executionDate: number; // unix seconds; both sources expose this
  success: boolean | null;
  nonce: number;
}

export interface NormalisedModuleTx {
  safeAddress: string; // lowercase
  chainId: ChainId;
  txHash: string; // lowercase
  module: string; // lowercase
  blockNumber: number;
  success: boolean | null; // Safe TX Service has isSuccessful; our schema doesn't track success on module txs (always null)
}

// One field-level diff inside a mismatched DiffResult.
export interface FieldDiff {
  field: string;
  canonical: unknown; // Safe Transaction Service value (source of truth)
  indexer: unknown; // our indexer value
}

export type DiffResult =
  | { kind: "passed" }
  | { kind: "mismatched"; diffs: FieldDiff[] }
  | { kind: "skipped"; reason: SkipReason };

export type SkipReason =
  | "not_synced" // indexer doesn't have this Safe yet
  | "canonical_404" // Safe TX Service doesn't have this Safe
  | "no_data_either_side"; // both sides return nothing (vacuous compare)

// Each Safe sampled from a strategy. `source` is for traceability in the summary.
export interface SampleEntry {
  chainId: ChainId;
  safeAddress: string; // lowercase
  source: "owner-anchored" | "recent-activity";
}
