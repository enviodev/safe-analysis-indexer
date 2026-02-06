// Safe version type
export type SafeVersion =
  | "V0_1_0"
  | "V1_0_0"
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
  // v0.1.0 master copy
  "0x8942595a2dc5181df0465af0d7be08c8f23c93af": "V0_1_0",

  // v1.0.0 master copy (Ethereum + Gnosis)
  "0xb6029ea3b2c51d09a50b53ca8012feeb05bda35a": "V1_0_0",

  // v1.1.1 master copy (Ethereum + Gnosis)
  "0x34cfac646f301356faa8b21e94227e3583fe3f5f": "V1_1_1",

  // v1.2.0 master copy (Ethereum + Gnosis)
  "0x6851d6fdfafd08c0295c392436245e5bc78b0185": "V1_2_0",
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
