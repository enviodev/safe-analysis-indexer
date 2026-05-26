// Both sources (Safe Transaction Service REST + Envio GraphQL) projected into
// the shared Normalised* shapes from types.ts. All field-shape, casing, and
// missing-value conventions live here so the comparators stay dumb.

import type {
  ChainId,
  NormalisedModuleTx,
  NormalisedMultisigTx,
  NormalisedSafe,
  SafeVersionEnum,
} from "./types";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const lower = (v: string | null | undefined): string | null =>
  v == null ? null : v.toLowerCase();

const lowerOrEmpty = (v: string | null | undefined): string =>
  v == null ? ZERO_ADDRESS : v.toLowerCase();

// Map Safe TX Service version strings ("1.3.0+L2", "1.4.1", null) to the
// indexer enum. Returns "UNKNOWN" for anything we can't recognise.
export function versionStringToEnum(v: string | null | undefined): SafeVersionEnum {
  if (v == null) return "UNKNOWN";
  // Safe TX Service sometimes appends "+L2" or "+Soft" suffixes; strip them.
  const semver = v.replace(/\+.*$/, "").trim();
  switch (semver) {
    case "0.0.2":
      return "V0_0_2";
    case "0.1.0":
      return "V0_1_0";
    case "1.0.0":
      return "V1_0_0";
    case "1.1.0":
      return "V1_1_0";
    case "1.1.1":
      return "V1_1_1";
    case "1.2.0":
      return "V1_2_0";
    case "1.3.0":
      return "V1_3_0";
    case "1.4.1":
      return "V1_4_1";
    case "1.5.0":
      return "V1_5_0";
    default:
      return "UNKNOWN";
  }
}

// Raw Safe Transaction Service `/safes/{address}/` response shape (the fields
// we care about). Keep this loose — the spec evolves, and we only pin the
// fields we compare.
export interface SafeApiSafe {
  address: string;
  nonce: number;
  threshold: number;
  owners: string[];
  masterCopy: string | null;
  modules: string[] | null;
  fallbackHandler: string | null;
  guard: string | null;
  version: string | null;
}

export function normaliseSafeFromApi(
  chainId: ChainId,
  raw: SafeApiSafe,
): NormalisedSafe {
  return {
    chainId,
    address: raw.address.toLowerCase(),
    owners: [...raw.owners].map((o) => o.toLowerCase()).sort(),
    threshold: raw.threshold,
    masterCopy: lower(raw.masterCopy),
    fallbackHandler: lower(raw.fallbackHandler),
    guard: lowerOrEmpty(raw.guard),
    modules: [...(raw.modules ?? [])].map((m) => m.toLowerCase()).sort(),
    version: versionStringToEnum(raw.version),
    nonce: raw.nonce,
  };
}

// Indexer GraphQL Safe row shape — only the fields we pull in indexerApi.ts.
export interface IndexerSafe {
  address: string;
  chainId: number;
  owners: string[];
  threshold: number;
  masterCopy: string | null;
  fallbackHandler: string | null;
  guard: string;
  version: SafeVersionEnum;
  nonce: number;
  modules: { module: string }[];
}

export function normaliseSafeFromIndexer(raw: IndexerSafe): NormalisedSafe {
  return {
    chainId: raw.chainId as ChainId,
    address: raw.address.toLowerCase(),
    owners: [...raw.owners].map((o) => o.toLowerCase()).sort(),
    threshold: raw.threshold,
    masterCopy: lower(raw.masterCopy),
    fallbackHandler: lower(raw.fallbackHandler),
    guard: lowerOrEmpty(raw.guard),
    modules: raw.modules.map((m) => m.module.toLowerCase()).sort(),
    version: raw.version,
    nonce: raw.nonce,
  };
}

// Multisig tx — Safe Transaction Service shape.
export interface SafeApiMultisigTx {
  safe: string;
  nonce: number;
  safeTxHash: string;
  transactionHash: string | null;
  executionDate: string | null; // ISO 8601
  isSuccessful: boolean | null;
  isExecuted: boolean;
}

export function normaliseMultisigFromApi(
  chainId: ChainId,
  raw: SafeApiMultisigTx,
): NormalisedMultisigTx {
  return {
    chainId,
    safeAddress: raw.safe.toLowerCase(),
    safeTxHash: lower(raw.safeTxHash),
    txHash: (raw.transactionHash ?? "").toLowerCase(),
    executionDate: raw.executionDate ? Math.floor(new Date(raw.executionDate).getTime() / 1000) : 0,
    success: raw.isSuccessful,
    nonce: raw.nonce,
  };
}

// Multisig tx — indexer shape (executionDate is a numeric string of unix seconds).
export interface IndexerMultisigTx {
  safe: { address: string; chainId: number };
  nonce: string; // bigint as string
  safeTxHash: string | null;
  txHash: string;
  executionDate: string;
  success: boolean | null;
}

export function normaliseMultisigFromIndexer(raw: IndexerMultisigTx): NormalisedMultisigTx {
  return {
    chainId: raw.safe.chainId as ChainId,
    safeAddress: raw.safe.address.toLowerCase(),
    safeTxHash: lower(raw.safeTxHash),
    txHash: raw.txHash.toLowerCase(),
    executionDate: Number(raw.executionDate),
    success: raw.success,
    nonce: Number(raw.nonce),
  };
}

// Module tx — Safe Transaction Service shape.
export interface SafeApiModuleTx {
  safe: string;
  module: string;
  transactionHash: string;
  blockNumber: number;
  isSuccessful: boolean | null;
}

export function normaliseModuleFromApi(
  chainId: ChainId,
  raw: SafeApiModuleTx,
): NormalisedModuleTx {
  return {
    chainId,
    safeAddress: raw.safe.toLowerCase(),
    module: raw.module.toLowerCase(),
    txHash: raw.transactionHash.toLowerCase(),
    blockNumber: raw.blockNumber,
    success: raw.isSuccessful,
  };
}

// Module tx — indexer shape.
export interface IndexerModuleTx {
  safe: { address: string; chainId: number };
  safeModule: string;
  txHash: string;
  blockNumber: number;
}

export function normaliseModuleFromIndexer(raw: IndexerModuleTx): NormalisedModuleTx {
  return {
    chainId: raw.safe.chainId as ChainId,
    safeAddress: raw.safe.address.toLowerCase(),
    module: raw.safeModule.toLowerCase(),
    txHash: raw.txHash.toLowerCase(),
    blockNumber: raw.blockNumber,
    // Our SafeModuleTransaction schema doesn't carry success — leave null so
    // the comparator skips this field.
    success: null,
  };
}
