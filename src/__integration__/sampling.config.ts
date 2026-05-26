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
export const SEED_OWNERS: Record<ChainId, string[]> = {
  1: [],
  100: [],
};
