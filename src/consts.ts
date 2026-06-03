// Safe version type
export type SafeVersion =
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

// ------------------------------------------------------------------------------------
// Master Copy Addresses
// ------------------------------------------------------------------------------------

// Map known master copy addresses to specific Safe versions.
// Keys should be lower-cased addresses.
// If a masterCopy is not in this map, it will be classified as UNKNOWN.
export const MASTER_COPY_TO_VERSION: Record<string, SafeVersion> = {
  // v0.0.2 master copy
  "0xac6072986e985aabe7804695ec2d8970cf7541a2": "V0_0_2",

  // v0.1.0 master copy
  "0x8942595a2dc5181df0465af0d7be08c8f23c93af": "V0_1_0",

  // v1.0.0 master copies
  "0xb6029ea3b2c51d09a50b53ca8012feeb05bda35a": "V1_0_0", // official (Ethereum + Gnosis)
  "0xb945bd4b447af21c5b55ef859242829fbdc0bf0a": "V1_0_0", // alternate deployment (Ethereum)

  // v1.1.0 master copy
  "0xae32496491b53841efb51829d6f886387708f99b": "V1_1_0",

  // v1.1.1 master copies
  "0x34cfac646f301356faa8b21e94227e3583fe3f5f": "V1_1_1", // official (Ethereum + Gnosis)
  "0x71d6752d4762629be42c58c09002750bdecfd54a": "V1_1_1", // alternate deployment (Gnosis)
  "0x2cb0ebc503de87cfd8f0eceeed8197bf7850184ae": "V1_1_1", // Circles variant (Gnosis)

  // v1.2.0 master copy (Ethereum + Gnosis)
  "0x6851d6fdfafd08c0295c392436245e5bc78b0185": "V1_2_0",

  // v1.3.0 master copies
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "V1_3_0", // L1 (GnosisSafe.sol)
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "V1_3_0", // L2 (GnosisSafeL2.sol)
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938": "V1_3_0", // L1 alternate (safe singleton factory)
  "0xfb1bffc9d739b8d520daf37df666da4c687191ea": "V1_3_0", // L2 alternate (safe singleton address)

  // v1.4.1 master copies
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "V1_4_1", // L1 (Safe.sol)
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "V1_4_1", // L2 (SafeL2.sol)

  // v1.5.0 master copies
  "0xff51a5898e281db6dfc7855790607438df2ca44b": "V1_5_0", // L1 (Safe.sol)
  "0xedd160febbd92e350d4d398fb636302fccd67c7e": "V1_5_0", // L2 (SafeL2.sol)
};

// ------------------------------------------------------------------------------------
// Legacy Special-Case Addresses
// ------------------------------------------------------------------------------------

// Legacy proxy address that identifies V1_0_0 (used in pre-1.3.0 handler)
export const LEGACY_V1_0_0_PROXY = "0x12302fe9c02ff50939baaaf415fc226c078613c";

// ------------------------------------------------------------------------------------
// ABI Definitions
// ------------------------------------------------------------------------------------

// Safe 1.0.0 / 0.1.0 setup function ABI
export const SETUP_ABI_V1_0_0 = [
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address paymentToken, uint256 payment, address payable paymentReceiver)"
];

// Safe 1.1.1+ setup function ABI (adds fallbackHandler parameter)
export const SETUP_ABI_V1_1_1 = [
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)"
];

// Factory ABI (same signatures for 1.1.1 and 1.2.0)
export const FACTORY_ABI = [
  "function createProxy(address masterCopy, bytes memory data) returns (address proxy)",
  "function createProxyWithNonce(address _mastercopy, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
];

// ------------------------------------------------------------------------------------
// Utility Functions
// ------------------------------------------------------------------------------------

// Resolve a Safe version from a masterCopy address, if known
export function resolveVersionFromMasterCopy(masterCopy: string): SafeVersion | undefined {
  const key = masterCopy.toLowerCase();
  return MASTER_COPY_TO_VERSION[key];
}

// ------------------------------------------------------------------------------------
// Safe Transaction Service version string mapping
// ------------------------------------------------------------------------------------
//
// Safe Transaction Service exposes `version` as a nullable string like
// "1.4.1+L2" / "1.3.0" / "1.5.0+L2", with the "+L2" suffix when the
// masterCopy is a SafeL2.sol variant (those emit SafeMultiSigTransaction
// events). We mirror that format on `Safe.version` so the REST shape is
// drop-in compatible.

// Map known master copy → STS-compatible version string. Direct table so we
// don't have to combine (enum version, L1/L2 flag) at every call site.
// Keys are lowercase. Anything not in this map → null (matches STS behavior
// when masterCopy is unknown).
export const MASTER_COPY_TO_STS_VERSION: Record<string, string> = {
  // v0.0.2
  "0xac6072986e985aabe7804695ec2d8970cf7541a2": "0.0.2",

  // v0.1.0
  "0x8942595a2dc5181df0465af0d7be08c8f23c93af": "0.1.0",

  // v1.0.0
  "0xb6029ea3b2c51d09a50b53ca8012feeb05bda35a": "1.0.0",
  "0xb945bd4b447af21c5b55ef859242829fbdc0bf0a": "1.0.0",

  // v1.1.0
  "0xae32496491b53841efb51829d6f886387708f99b": "1.1.0",

  // v1.1.1
  "0x34cfac646f301356faa8b21e94227e3583fe3f5f": "1.1.1",
  "0x71d6752d4762629be42c58c09002750bdecfd54a": "1.1.1",
  "0x2cb0ebc503de87cfd8f0eceeed8197bf7850184ae": "1.1.1",

  // v1.2.0
  "0x6851d6fdfafd08c0295c392436245e5bc78b0185": "1.2.0",

  // v1.3.0 — L1 vs L2 variants get distinct STS strings
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "1.3.0",      // L1 (GnosisSafe.sol)
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "1.3.0+L2",   // L2 (GnosisSafeL2.sol)
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938": "1.3.0",      // L1 alternate
  "0xfb1bffc9d739b8d520daf37df666da4c687191ea": "1.3.0+L2",   // L2 alternate

  // v1.4.1
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "1.4.1",      // L1 (Safe.sol)
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "1.4.1+L2",   // L2 (SafeL2.sol)

  // v1.5.0
  "0xff51a5898e281db6dfc7855790607438df2ca44b": "1.5.0",      // L1 (Safe.sol)
  "0xedd160febbd92e350d4d398fb636302fccd67c7e": "1.5.0+L2",   // L2 (SafeL2.sol)
};

// Fallback used when we have a SafeVersion enum but no masterCopy address
// (the pre-1.3.0 path resolves version via trace-derived setup-data; the
// masterCopy isn't always recovered). These are L1-only since no L2
// variants existed for pre-1.3.0.
const ENUM_TO_STS_VERSION_FALLBACK: Record<SafeVersion, string | null> = {
  V0_0_2: "0.0.2",
  V0_1_0: "0.1.0",
  V1_0_0: "1.0.0",
  V1_1_0: "1.1.0",
  V1_1_1: "1.1.1",
  V1_2_0: "1.2.0",
  V1_3_0: "1.3.0",     // bare 1.3.0 fallback — typically the L1 variant
  V1_4_1: "1.4.1",
  V1_5_0: "1.5.0",
  UNKNOWN: null,
};

// Format a (version, masterCopy) pair into the Safe-TX-Service-compatible
// string. Prefers the direct masterCopy mapping (which carries the
// L1/L2 distinction); falls back to the enum-only table when masterCopy
// isn't available. Returns undefined for genuinely unknown — Hasura
// serializes undefined as null in GraphQL responses, matching STS's
// nullable `version` field.
export function formatStsVersion(
  version: SafeVersion | undefined,
  masterCopy: string | undefined,
): string | undefined {
  if (masterCopy) {
    const fromMc = MASTER_COPY_TO_STS_VERSION[masterCopy.toLowerCase()];
    if (fromMc) return fromMc;
  }
  if (version && version !== "UNKNOWN") {
    return ENUM_TO_STS_VERSION_FALLBACK[version] ?? undefined;
  }
  return undefined;
}

// Reverse helper for `getOrCreateVersion` stat keys — same as formatStsVersion
// but uses the literal "UNKNOWN" sentinel instead of undefined so Version
// entities always have a non-null id. Stats for unknown-version safes get
// bucketed under this single "UNKNOWN" key.
export function versionStatKey(
  version: SafeVersion | undefined,
  masterCopy: string | undefined,
): string {
  return formatStsVersion(version, masterCopy) ?? "UNKNOWN";
}

// ------------------------------------------------------------------------------------
// L1 Master Copy Detection
// ------------------------------------------------------------------------------------

// Known L1 (non-L2) master copy addresses. Pre-1.3.0 versions had no L2 variant.
export const L1_MASTER_COPIES: Set<string> = new Set([
  "0xac6072986e985aabe7804695ec2d8970cf7541a2", // V0_0_2
  "0x8942595a2dc5181df0465af0d7be08c8f23c93af", // V0_1_0
  "0xb6029ea3b2c51d09a50b53ca8012feeb05bda35a", // V1_0_0
  "0xb945bd4b447af21c5b55ef859242829fbdc0bf0a", // V1_0_0 alternate
  "0xae32496491b53841efb51829d6f886387708f99b", // V1_1_0
  "0x34cfac646f301356faa8b21e94227e3583fe3f5f", // V1_1_1
  "0x6851d6fdfafd08c0295c392436245e5bc78b0185", // V1_2_0
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552", // V1_3_0 L1
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938", // V1_3_0 L1 alternate
  "0x41675c099f32341bf84bfc5382af534df5c7461a", // V1_4_1 L1
  "0xff51a5898e281db6dfc7855790607438df2ca44b", // V1_5_0 L1
]);

// Versions where no L2 variant ever existed — these are unconditionally L1.
const PRE_1_3_0_STS_VERSIONS = new Set([
  "0.0.2",
  "0.1.0",
  "1.0.0",
  "1.1.0",
  "1.1.1",
  "1.2.0",
]);

export function isL1Safe(safe: { masterCopy?: string | null; version?: string | null }): boolean {
  // All pre-1.3.0 are L1 (no L2 variant existed). `version` is now the
  // STS-format string ("1.1.1" etc.) or null when unknown.
  if (safe.version && PRE_1_3_0_STS_VERSIONS.has(safe.version)) return true;
  // For 1.3.0+, check masterCopy against known L1 addresses.
  if (safe.masterCopy && L1_MASTER_COPIES.has(safe.masterCopy.toLowerCase())) return true;
  return false;
}

// ------------------------------------------------------------------------------------
// execTransaction ABI (same across all Safe versions v1.0.0 through v1.5.0)
// ------------------------------------------------------------------------------------

export const EXEC_TRANSACTION_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)"
];
