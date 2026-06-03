// Safe version type. "_L2" suffix marks SafeL2.sol-variant master copies
// (which emit SafeMultiSigTransaction). Pre-1.3.0 had no L2 variant.
export type SafeVersion =
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
  | "V1_5_0_L2"
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

  // v1.3.0 master copies — L1 vs L2 are distinct enum values
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "V1_3_0",    // L1 (GnosisSafe.sol)
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "V1_3_0_L2", // L2 (GnosisSafeL2.sol)
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938": "V1_3_0",    // L1 alternate (safe singleton factory)
  "0xfb1bffc9d739b8d520daf37df666da4c687191ea": "V1_3_0_L2", // L2 alternate (safe singleton address)

  // v1.4.1 master copies
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "V1_4_1",    // L1 (Safe.sol)
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "V1_4_1_L2", // L2 (SafeL2.sol)

  // v1.5.0 master copies
  "0xff51a5898e281db6dfc7855790607438df2ca44b": "V1_5_0",    // L1 (Safe.sol)
  "0xedd160febbd92e350d4d398fb636302fccd67c7e": "V1_5_0_L2", // L2 (SafeL2.sol)
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
// L1 / L2 detection
// ------------------------------------------------------------------------------------

// Versions that emit SafeMultiSigTransaction (SafeL2.sol variants) and the
// pre-1.3.0 L1-only ones are determinable from the enum alone.
const L2_VERSIONS: Set<SafeVersion> = new Set([
  "V1_3_0_L2",
  "V1_4_1_L2",
  "V1_5_0_L2",
]);

export function isL1Safe(safe: { version?: SafeVersion | null }): boolean {
  if (!safe.version || safe.version === "UNKNOWN") return false;
  return !L2_VERSIONS.has(safe.version);
}

// ------------------------------------------------------------------------------------
// execTransaction ABI (same across all Safe versions v1.0.0 through v1.5.0)
// ------------------------------------------------------------------------------------

export const EXEC_TRANSACTION_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)"
];
