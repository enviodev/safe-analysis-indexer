// Defaults and curated seed inputs for the cross-reference suite.
// Override sample size / chain set / endpoint via the env vars referenced in
// crossReference.test.ts.

import type { ChainId } from "./types";

export const DEFAULT_SAMPLE_SIZE = 10;
export const DEFAULT_CHAINS: ChainId[] = [1, 100];

// Top-N most recent transactions to deep-compare per Safe.
export const DEFAULT_TOP_N_TX_COMPARE = 5;

// Seed owner addresses per chain. Starting points for the owner-anchored
// sampler — extend this list with real long-lived signers you want the
// suite to reliably hit. If a seed owner has zero Safes, the sampler just
// moves on; if *all* seeds yield nothing, the runner falls back to the
// indexer-direct sampler (see `samplers.ts`).
//
// Each address is lowercased before use.
//
// Curated from the deployed indexer (Jun 2026): a mix of prolific multi-Safe
// owners (broad coverage — owner-anchored pulls many Safes each) and sole
// owners of very high-nonce Safes (rich executed-tx history for the multisig
// comparator). Safe-count noted is the Safe Transaction Service total at
// curation time. Extend with real long-lived signers as needed.
export const SEED_OWNERS: Record<ChainId, string[]> = {
  1: [
    "0xbe0b407782a7599380fa726db315340126d62229", // ~78,300 safes — prolific deployer
    "0x52a8305f29f85bec5fa6ee78b87ddd2218d8e12e", // ~22 safes
    "0x1452cc00d05498d937de975591709855f4c5627c", // ~14 safes
    "0x7779ffb11d50fceae8e533b611b5cb5a1c1db3d4", // ~4 safes
    "0xc711f8acc65306d4f16f874fe88c43ef23504f5c", // sole owner, very active Safe (nonce ~11k)
  ],
  100: [
    "0xe22af7b021d7a0a424fd88807dd63c5c4c691b58", // ~250 safes
    "0x7aa26049a8c35e6163a607b5b7c43c86298e8048", // ~210 safes
    "0xe2871d6ffc72d3577561c89a7e4bf347d6629d21", // ~19 safes
    "0x0e24b6e3beff0b44b773f068343bc2cb56cb3769", // ~9 safes
    "0x4e14b01d446828aa1fdfae11c5c50bf237d614ca", // sole owner, very active Safe (nonce ~125k)
  ],
};
