// Hardcoded anchor token addresses per chain. CoinGecko's canonical
// `tether` / `usd-coin` / etc. entries don't always populate
// `platforms.binance-smart-chain` (etc.) — the bridged versions live
// under separate ids ranked outside our top-500. So the allowlist built
// from CoinGecko is missing the anchors we depend on for pricing.
//
// build-allowlist.ts merges these in unconditionally so discover-pools.ts
// always has a quote token to try.
//
// All addresses lowercase. Verified against block explorers in early 2026.

import type { TokenSpec } from "./types.js";

type Anchor = {
  chainId: number;
  token: string;
  symbol: string;
  decimals: number;
  category: "stable" | "wrapped-native";
  stableUSD?: number; // for stables only
};

export const ANCHORS: Anchor[] = [
  // ── Ethereum (1) ─────────────────────────────────────────────
  { chainId: 1, token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1, token: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1, token: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI",   decimals: 18, category: "stable", stableUSD: 1.0 },
  { chainId: 1, token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH",  decimals: 18, category: "wrapped-native" },
  { chainId: 1, token: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", symbol: "WBTC",  decimals: 8,  category: "wrapped-native" },

  // ── Optimism (10) ────────────────────────────────────────────
  { chainId: 10, token: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 10, token: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 10, token: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, category: "wrapped-native" },
  { chainId: 10, token: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", symbol: "DAI",  decimals: 18, category: "stable", stableUSD: 1.0 },

  // ── BSC (56) ─────────────────────────────────────────────────
  { chainId: 56, token: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18, category: "stable", stableUSD: 1.0 },
  { chainId: 56, token: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC", decimals: 18, category: "stable", stableUSD: 1.0 },
  { chainId: 56, token: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB", decimals: 18, category: "wrapped-native" },
  { chainId: 56, token: "0xe9e7cea3dedca5984780bafc599bd69add087d56", symbol: "BUSD", decimals: 18, category: "stable", stableUSD: 1.0 },

  // ── Gnosis (100) ─────────────────────────────────────────────
  { chainId: 100, token: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83", symbol: "USDC",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 100, token: "0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1", symbol: "WETH",  decimals: 18, category: "wrapped-native" },
  { chainId: 100, token: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d", symbol: "WXDAI", decimals: 18, category: "stable", stableUSD: 1.0 },

  // ── Polygon (137) ────────────────────────────────────────────
  { chainId: 137, token: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 137, token: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 137, token: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", symbol: "WMATIC", decimals: 18, category: "wrapped-native" },
  { chainId: 137, token: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   decimals: 18, category: "wrapped-native" },

  // ── Monad (143) — testnet/mainnet, addresses subject to change ─
  // Skip until ecosystem stabilises — discover-pools will treat as no-anchor.

  // ── opBNB (204) ──────────────────────────────────────────────
  { chainId: 204, token: "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3", symbol: "USDT", decimals: 18, category: "stable", stableUSD: 1.0 },
  { chainId: 204, token: "0x4200000000000000000000000000000000000006", symbol: "WBNB", decimals: 18, category: "wrapped-native" },

  // ── zkSync Era (324) ─────────────────────────────────────────
  { chainId: 324, token: "0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 324, token: "0x493257fd37edb34451f62edf8d2a0c418852ba4c", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 324, token: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── HyperEVM (999) ───────────────────────────────────────────
  // Native asset USDC0 (HyperLiquid USD) and WHYPE
  { chainId: 999, token: "0x5555555555555555555555555555555555555555", symbol: "WHYPE", decimals: 18, category: "wrapped-native" },

  // ── Polygon zkEVM (1101) ─────────────────────────────────────
  { chainId: 1101, token: "0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1101, token: "0x1e4a5963abfd975d8c9021ce480b42188849d41d", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1101, token: "0x4f9a0e7fd2bf6067db6994cf12e4495df938e6e9", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Mantle (5000) ────────────────────────────────────────────
  { chainId: 5000, token: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 5000, token: "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 5000, token: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111", symbol: "WETH", decimals: 18, category: "wrapped-native" },
  { chainId: 5000, token: "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8", symbol: "WMNT", decimals: 18, category: "wrapped-native" },

  // ── Base (8453) ──────────────────────────────────────────────
  { chainId: 8453, token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 8453, token: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Arbitrum (42161) ─────────────────────────────────────────
  { chainId: 42161, token: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 42161, token: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 42161, token: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Celo (42220) ─────────────────────────────────────────────
  { chainId: 42220, token: "0xceba9300f2b948710d2653dd7b07f33a8b32118c", symbol: "USDC",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 42220, token: "0x471ece3750da237f93b8e339c536989b8978a438", symbol: "CELO",  decimals: 18, category: "wrapped-native" },

  // ── Avalanche (43114) ────────────────────────────────────────
  { chainId: 43114, token: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", symbol: "USDC",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 43114, token: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", symbol: "USDT",  decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 43114, token: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", symbol: "WETH",  decimals: 18, category: "wrapped-native" },
  { chainId: 43114, token: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", symbol: "WAVAX", decimals: 18, category: "wrapped-native" },

  // ── Linea (59144) ────────────────────────────────────────────
  { chainId: 59144, token: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 59144, token: "0xa219439258ca9da29e9cc4ce5596924745e12b93", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 59144, token: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Blast (81457) ────────────────────────────────────────────
  { chainId: 81457, token: "0x4300000000000000000000000000000000000003", symbol: "USDB", decimals: 18, category: "stable", stableUSD: 1.0 },
  { chainId: 81457, token: "0x4300000000000000000000000000000000000004", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Scroll (534352) ──────────────────────────────────────────
  { chainId: 534352, token: "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 534352, token: "0xf55bec9cafdbe8730f096aa55dad6d22d44099df", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 534352, token: "0x5300000000000000000000000000000000000004", symbol: "WETH", decimals: 18, category: "wrapped-native" },

  // ── Aurora (1313161554) ──────────────────────────────────────
  { chainId: 1313161554, token: "0xb12bfca5a55806aaf64e99521918a4bf0fc40802", symbol: "USDC", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1313161554, token: "0x4988a896b1227218e4a686fde5eabdcabd91571f", symbol: "USDT", decimals: 6,  category: "stable", stableUSD: 1.0 },
  { chainId: 1313161554, token: "0xc9bdeed33cd01541e1eed10f90519d2c06fe3feb", symbol: "WETH", decimals: 18, category: "wrapped-native" },
];

export function anchorsAsTokenSpecs(): TokenSpec[] {
  return ANCHORS.map((a): TokenSpec => ({
    chainId: a.chainId,
    token: a.token.toLowerCase(),
    symbol: a.symbol,
    decimals: a.decimals,
    category: a.category,
    marketCapRank: 0, // anchors sort first by convention
    pricing: a.category === "stable"
      ? { kind: "stable", usd: a.stableUSD ?? 1.0 }
      : { kind: "uniV3", pool: "0x0000000000000000000000000000000000000000", baseSymbol: "PENDING", dex: "PENDING" },
  }));
}
