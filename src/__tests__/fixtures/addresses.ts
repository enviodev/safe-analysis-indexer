import { keccak256, toBytes } from "viem";
import { MASTER_COPY_TO_VERSION, LEGACY_V1_0_0_PROXY } from "../../consts";

// Deterministic lowercase 20-byte address from a string seed. Output matches
// `config.yaml`'s `address_format: lowercase`, so entity comparisons don't
// drift between simulate input and stored entities.
export function addr(seed: string): `0x${string}` {
  return keccak256(toBytes(seed)).slice(0, 42).toLowerCase() as `0x${string}`;
}

// Curated subset of MASTER_COPY_TO_VERSION keyed by version+variant for
// readable test fixtures. Re-exported as lowercase 0x-prefixed strings.
export const MASTER_COPIES = {
  V1_0_0: "0xb6029ea3b2c51d09a50b53ca8012feeb05bda35a",
  V1_1_1: "0x34cfac646f301356faa8b21e94227e3583fe3f5f",
  V1_2_0: "0x6851d6fdfafd08c0295c392436245e5bc78b0185",
  V1_3_0_L1: "0xd9db270c1b5e3bd161e8c8503c55ceabee709552",
  V1_3_0_L2: "0x3e5c63644e683549055b9be8653de26e0b4cd36e",
  V1_4_1_L1: "0x41675c099f32341bf84bfc5382af534df5c7461a",
  V1_4_1_L2: "0x29fcb43b46531bca003ddc8fcb67ffe91900c762",
  V1_5_0_L1: "0xff51a5898e281db6dfc7855790607438df2ca44b",
  V1_5_0_L2: "0xedd160febbd92e350d4d398fb636302fccd67c7e",
} as const satisfies Record<string, keyof typeof MASTER_COPY_TO_VERSION>;

export { LEGACY_V1_0_0_PROXY };

// Convenience helper: build the canonical Safe id used in storage.
export const safeId = (chainId: number, address: string): string =>
  `${chainId}-${address.toLowerCase()}`;
