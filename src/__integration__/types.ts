// Shared types for the cross-reference integration suite.
//
// Both sources (Safe Transaction Service REST + our Envio GraphQL) get
// projected into the *Normalised* shapes below before comparison, so the
// comparators don't have to know about either source's quirks.

export type ChainId = 1 | 100;
export type SafeAddress = `0x${string}`;

// Mirrors the indexer's `enum SafeVersion` (schema.graphql). Both sides of the
// cross-reference get normalised onto this enum at the wrapper layer — STS's
// nullable "1.4.1+L2" string is mapped here in normalize.ts.
export type SafeVersionEnum =
  | "UNKNOWN"
  | "V0_0_2"
  | "V0_1_0"
  | "V1_0_0"
  | "V1_1_0"
  | "V1_1_1"
  | "V1_2_0"
  | "V1_3_0"
  | "V1_3_0_L2"
  | "V1_4_1"
  | "V1_4_1_L2"
  | "V1_5_0"
  | "V1_5_0_L2";

export interface NormalisedSafe {
  chainId: ChainId;
  address: string; // lowercase
  owners: string[]; // lowercase, sorted
  threshold: number;
  masterCopy: string | null; // lowercase or null
  fallbackHandler: string | null; // lowercase or null
  guard: string; // lowercase, defaults to ZERO_ADDRESS
  moduleGuard: string; // lowercase, defaults to ZERO_ADDRESS (v1.5.0+ only)
  modules: string[]; // lowercase, sorted
  // Indexer SafeVersion enum. The wrapper layer (normalize.ts) maps STS's
  // nullable "1.4.1+L2" / "1.3.0" / null string onto this enum so the
  // comparator is a straight equality check.
  version: SafeVersionEnum;
  // Decimal-string nonce (both sides serialize bigint as string).
  nonce: string;
}

// Creation context from `/v1/safes/{address}/creation/` vs our Safe entity's
// creation fields. Compared in a separate comparator so a failure here points
// at the creation handlers specifically.
export interface NormalisedSafeCreation {
  chainId: ChainId;
  safeAddress: string;
  creationTxHash: string; // lowercase
  factoryAddress: string | null; // lowercase or null (orphan SafeSetup case)
  masterCopy: string | null; // lowercase or null
  setupData: string | null; // lowercase hex or null
  creator: string; // lowercase — Safe TX Service `creator`; matches the indexer-side `creator` field (trace-walked on Ethereum mainnet, tx.from fallback elsewhere — same chain-dependent behavior as Safe TX Service itself)
}

export interface NormalisedMultisigTx {
  safeAddress: string; // lowercase
  chainId: ChainId;
  safeTxHash: string | null; // lowercase or null (null until ExecutionSuccess/Failure on our side)
  txHash: string; // lowercase
  executionDate: number; // unix seconds; both sources expose this
  success: boolean | null;
  // Decimal-string nonce: matches the uint256 semantic and side-steps the
  // STS-vs-indexer JSON-encoding split (STS returns `"0"`, GraphQL returns
  // a BigInt-as-string). Compared as strings — Number() coercion lost
  // precision on >2^53 nonces anyway. Same shape as value/safeTxGas/etc.
  nonce: string;
  // Transaction payload (matched against our SafeTransaction entity)
  to: string; // lowercase
  value: string; // decimal string (BigInt-normalised)
  data: string; // "0x" if empty (Safe TX Service can return null; we canonicalise)
  operation: number; // 0 CALL, 1 DELEGATECALL, 2 CREATE
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string; // lowercase, "0x000…" if no token (indexer ZERO_ADDRESS convention)
  refundReceiver: string; // lowercase, "0x000…" if null
  signatures: string; // lowercase hex; "0x" if missing
  threshold: number; // confirmationsRequired snapshot at execution
  executor: string | null; // lowercase or null — our msgSender, Safe TX Service executor
  blockNumber: number | null; // null on Safe TX Service side until executed
}

export interface NormalisedModuleTx {
  safeAddress: string; // lowercase
  chainId: ChainId;
  txHash: string; // lowercase
  module: string; // lowercase
  blockNumber: number;
  success: boolean | null; // Safe TX Service has isSuccessful; our schema doesn't track success on module txs (always null)
  // Transaction payload (matched against our SafeModuleTransaction entity)
  to: string;
  value: string;
  data: string;
  operation: number;
  executionTimestamp: number; // unix seconds — Safe TX Service executionDate, our `timestamp`
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
  source: "owner-anchored" | "recent-activity" | "indexer-direct";
}

// The "comparison ceiling" — derived from the indexer's `_meta.progressBlock`
// minus a small safety margin to absorb the 1-2 block lag the canonical Safe
// Transaction Service can run behind. Both sides of every comparison are
// bounded to this so we can run the suite while our indexer is mid historical
// sync without false "missing" diffs.
export interface ComparisonCeiling {
  chainId: ChainId;
  block: number; // safe ceiling — query bound on both sides
  timestamp: number | null; // unix seconds derived from an entity at-or-below ceiling; null if no anchor
  rawProgressBlock: number; // unmargined _meta.progressBlock, kept for logs
  isReady: boolean; // _meta.isReady — true once we've caught up to chain tip
}
