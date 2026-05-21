// DEX configuration per chain. Used by scripts/discover-pools.ts to
// query factories and find the deepest pool for each token in the
// allowlist. Confidence levels reflect how confident we are in the
// factory address; "verify" means discover-pools.ts must sanity-check
// the factory at runtime (a missing pool with USDC/WETH at standard
// fees indicates the address is wrong and we should skip the chain).
//
// Research notes for unfamiliar chains live next to each entry.

import type { TokenSpec } from "./types";

export type V3Factory = {
  kind: "uniV3";
  factory: string; // lowercase
  feeTiers: number[]; // basis points × 100, e.g. 500 = 0.05%
  dex: string; // human-readable, lands in TokenPrice.pricingDex
  confidence: "high" | "medium";
  source?: string; // optional URL where we got the address
};

export type V2Factory = {
  kind: "uniV2";
  factory: string;
  dex: string;
  confidence: "high" | "medium";
  source?: string;
};

export type ChainDexConfig = {
  chainId: number;
  // Quote assets (anchor tokens) we'll try to pair tokens against, in
  // priority order. discover-pools.ts queries each combination until
  // it finds a pool with non-trivial liquidity.
  quoteOrder: string[]; // symbols, resolved to addresses via tokenAllowlist
  // Primary DEX(es) to query. The discovery script tries them in order.
  primaries: (V3Factory | V2Factory)[];
};

// Standard Uniswap V3 fee tiers (also used by most forks)
const UNI_V3_TIERS = [100, 500, 3000, 10000];
// PancakeSwap V3 uses 100, 500, 2500, 10000 — slightly different from Uniswap
const PANCAKE_V3_TIERS = [100, 500, 2500, 10000];

const UNI_V3_CANONICAL = "0x1F98431c8aD98523631AE4a59f267346ea31F984".toLowerCase();
const PANCAKE_V3_CANONICAL = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865".toLowerCase();

export const DEX_CONFIG: ChainDexConfig[] = [
  // ── Tier 1: Uniswap V3 canonical deployments (high confidence) ────────
  {
    chainId: 1, // Ethereum
    quoteOrder: ["USDC", "USDT", "WETH", "DAI"],
    primaries: [
      { kind: "uniV3", factory: UNI_V3_CANONICAL, feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },
  {
    chainId: 10, // Optimism
    quoteOrder: ["USDC", "USDT", "WETH", "DAI"],
    primaries: [
      { kind: "uniV3", factory: UNI_V3_CANONICAL, feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },
  {
    chainId: 137, // Polygon
    quoteOrder: ["USDC", "USDT", "WETH", "WMATIC"],
    primaries: [
      { kind: "uniV3", factory: UNI_V3_CANONICAL, feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },
  {
    chainId: 42161, // Arbitrum
    quoteOrder: ["USDC", "USDT", "WETH"],
    primaries: [
      { kind: "uniV3", factory: UNI_V3_CANONICAL, feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },

  // ── Tier 2: Uniswap V3 with non-canonical factory ─────────────────────
  {
    chainId: 8453, // Base
    quoteOrder: ["USDC", "WETH"],
    primaries: [
      { kind: "uniV3", factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },
  {
    chainId: 42220, // Celo
    quoteOrder: ["USDC", "USDT", "CELO"],
    primaries: [
      { kind: "uniV3", factory: "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },
  {
    chainId: 43114, // Avalanche
    quoteOrder: ["USDC", "USDT", "WETH", "WAVAX"],
    primaries: [
      { kind: "uniV3", factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "high" },
    ],
  },

  // ── Tier 3: PancakeSwap V3 (BSC native + multichain deployments) ──────
  {
    chainId: 56, // BSC
    quoteOrder: ["USDT", "USDC", "WBNB", "BUSD"],
    primaries: [
      { kind: "uniV3", factory: PANCAKE_V3_CANONICAL, feeTiers: PANCAKE_V3_TIERS, dex: "pancake-v3", confidence: "high" },
    ],
  },
  {
    chainId: 324, // zkSync Era
    quoteOrder: ["USDC", "USDT", "WETH"],
    primaries: [
      // zkSync uses a different factory address than the canonical PancakeSwap V3 because
      // zkSync's account model produces different create2 addresses. Verified via DRPC.
      { kind: "uniV3", factory: "0x1BB72E0CbbEA93c08f535fc7856E0338D7F7a8aB".toLowerCase(), feeTiers: PANCAKE_V3_TIERS, dex: "pancake-v3", confidence: "high",
        source: "https://docs.pancakeswap.finance/developers/smart-contracts" },
    ],
  },
  {
    chainId: 1101, // Polygon zkEVM
    quoteOrder: ["USDC", "USDT", "WETH"],
    primaries: [
      { kind: "uniV3", factory: PANCAKE_V3_CANONICAL, feeTiers: PANCAKE_V3_TIERS, dex: "pancake-v3", confidence: "high" },
    ],
  },
  {
    chainId: 59144, // Linea
    quoteOrder: ["USDC", "USDT", "WETH"],
    primaries: [
      // Confirmed via LineaScan — same factory address as the canonical PancakeSwap V3 deployment.
      { kind: "uniV3", factory: PANCAKE_V3_CANONICAL, feeTiers: PANCAKE_V3_TIERS, dex: "pancake-v3", confidence: "high",
        source: "https://lineascan.build/address/0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" },
    ],
  },

  // ── Tier 4: chain-native V3 forks (medium confidence — verify on first run) ──
  {
    chainId: 5000, // Mantle — FusionX V3 is the dominant native concentrated-liquidity DEX
    quoteOrder: ["USDC", "USDT", "WETH", "WMNT"],
    primaries: [
      { kind: "uniV3", factory: "0x530d2766D1988CC1c000C8b7d00334c14B69AD71".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "fusionx-v3", confidence: "medium",
        source: "FusionX docs — mantlescan verification needed at first run" },
    ],
  },
  {
    chainId: 81457, // Blast — Thruster V3 is the leading Blast-native DEX
    quoteOrder: ["USDB", "WETH"],
    primaries: [
      { kind: "uniV3", factory: "0x71b08f13B3c3aF35aAdEb3949AFEb1ded1016127".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "thruster-v3", confidence: "medium",
        source: "Thruster docs — blastscan verification needed at first run" },
    ],
  },
  {
    chainId: 999, // HyperEVM — HyperSwap V3 (early-stage but the main DEX on the chain)
    quoteOrder: ["USDC", "WETH"],
    primaries: [
      { kind: "uniV3", factory: "0xB1c0fa0B789320044A6F623cFe5eBda9562602E3".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "hyperswap-v3", confidence: "medium",
        source: "HyperSwap docs — hyperevmscan verification needed; coverage will be low (TVL ~$5M as of early 2026)" },
    ],
  },
  {
    chainId: 534352, // Scroll — Uniswap V3 dominates ($2.1B TVL vs SyncSwap's $25M)
    quoteOrder: ["USDC", "USDT", "WETH"],
    primaries: [
      { kind: "uniV3", factory: "0x70C62C8b8e801124A4Aa81ce07b637A3e83cb919".toLowerCase(), feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "medium",
        source: "DefiLlama Scroll TVL ranking — scrollscan verification needed at first run" },
    ],
  },

  // ── Tier 5: opBNB — PancakeSwap V3 (medium; same factory but verify) ──
  {
    chainId: 204, // opBNB
    quoteOrder: ["USDT", "USDC", "WBNB"],
    primaries: [
      { kind: "uniV3", factory: PANCAKE_V3_CANONICAL, feeTiers: PANCAKE_V3_TIERS, dex: "pancake-v3", confidence: "medium",
        source: "PancakeSwap multichain deployment — opbnbscan verification needed" },
    ],
  },

  // ── Tier 6: Monad — Uniswap V3 deployed at mainnet launch (Nov 2025) ──
  {
    chainId: 143, // Monad
    quoteOrder: ["USDC", "USDT", "WETH", "WMON"],
    primaries: [
      { kind: "uniV3", factory: UNI_V3_CANONICAL, feeTiers: UNI_V3_TIERS, dex: "uniswap-v3", confidence: "medium",
        source: "Monad mainnet (Nov 2025) — accept low coverage, expand as ecosystem matures" },
    ],
  },

  // ── Tier 7: V2-only chains (Aurora, Gnosis) ──────────────────────────
  {
    chainId: 100, // Gnosis — SushiSwap V2 has the deepest non-stable liquidity
    quoteOrder: ["USDC", "WETH", "WXDAI"],
    primaries: [
      { kind: "uniV2", factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4".toLowerCase(), dex: "sushiswap-v2", confidence: "medium",
        source: "Gnosisscan — verify at first run" },
    ],
  },
  {
    chainId: 1313161554, // Aurora — Trisolaris (Uniswap V2 fork) is the #1 DEX
    quoteOrder: ["USDC", "USDT", "WETH", "WNEAR"],
    primaries: [
      { kind: "uniV2", factory: "0xc66F594268041dB60507F00703b152492fb176E7".toLowerCase(), dex: "trisolaris-v2", confidence: "medium",
        source: "Trisolaris — aurorascan verification needed" },
    ],
  },
];

export function dexFor(chainId: number): ChainDexConfig | undefined {
  return DEX_CONFIG.find((c) => c.chainId === chainId);
}

// Resolve a quote symbol → token address on a given chain by looking it
// up in a TokenSpec list. Used by discover-pools.ts.
export function resolveQuoteAddress(
  symbol: string,
  chainId: number,
  allowlist: TokenSpec[],
): string | undefined {
  const match = allowlist.find(
    (t) => t.chainId === chainId && t.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return match?.token;
}
