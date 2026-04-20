#!/usr/bin/env node
/**
 * Refresh per-chain ERC20 token-list snapshots used by the explorer's
 * spam-token filter and metadata enrichment.
 *
 * Sources, in priority order (later sources never override earlier ones):
 *   1. Uniswap default list  (https://tokens.uniswap.org)
 *   2. CoinGecko per-chain   (https://tokens.coingecko.com/{platform}/all.json)
 *
 * Output: explorer/src/lib/tokenLists/data/{chainId}.json — sorted by address.
 *
 * Usage:
 *     yarn ts-node scripts/fetch-token-lists.ts
 *     # or:
 *     node --experimental-strip-types scripts/fetch-token-lists.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RawToken {
  chainId: number;
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string;
}

interface NormalisedToken {
  address: string; // lowercase
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  sources: string[]; // ["uniswap", "coingecko"]
}

// CoinGecko platform slugs. Only chains we actually index need to be here;
// anything missing just gets the Uniswap subset (or an empty file).
const COINGECKO_PLATFORM: Record<number, string | undefined> = {
  1: "ethereum",
  10: "optimistic-ethereum",
  56: "binance-smart-chain",
  100: "xdai",
  137: "polygon-pos",
  143: "monad",
  204: "opbnb",
  324: "zksync",
  480: undefined, // worldchain — no CG list yet
  999: undefined, // hyperevm — no CG list yet
  1101: "polygon-zkevm",
  1313161554: "aurora",
  5000: "mantle",
  8453: "base",
  42161: "arbitrum-one",
  42220: "celo",
  43114: "avalanche",
  59144: "linea",
  81457: "blast",
  534352: "scroll",
};

const CHAIN_IDS = Object.keys(COINGECKO_PLATFORM).map(Number);

async function fetchJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) {
    console.warn(`  ${url} -> HTTP ${r.status}`);
    return null;
  }
  return (await r.json()) as T;
}

function normalise(raw: RawToken, source: string): NormalisedToken | null {
  if (!raw.address || !raw.symbol || raw.decimals == null) return null;
  return {
    address: raw.address.toLowerCase(),
    symbol: raw.symbol,
    name: raw.name ?? raw.symbol,
    decimals: raw.decimals,
    logoURI: raw.logoURI,
    sources: [source],
  };
}

function merge(base: NormalisedToken, incoming: NormalisedToken): NormalisedToken {
  // First source wins for metadata; we just record extra source provenance.
  return {
    ...base,
    sources: Array.from(new Set([...base.sources, ...incoming.sources])),
    // Pick up logoURI from a later source if the earlier one was missing.
    logoURI: base.logoURI ?? incoming.logoURI,
  };
}

async function loadUniswapByChain(): Promise<Map<number, NormalisedToken[]>> {
  const list = await fetchJson<{ tokens: RawToken[] }>("https://tokens.uniswap.org/");
  if (!list) return new Map();
  const byChain = new Map<number, NormalisedToken[]>();
  for (const raw of list.tokens) {
    const t = normalise(raw, "uniswap");
    if (!t) continue;
    const arr = byChain.get(raw.chainId) ?? [];
    arr.push(t);
    byChain.set(raw.chainId, arr);
  }
  return byChain;
}

async function loadCoinGecko(chainId: number): Promise<NormalisedToken[]> {
  const slug = COINGECKO_PLATFORM[chainId];
  if (!slug) return [];
  const list = await fetchJson<{ tokens: RawToken[] }>(
    `https://tokens.coingecko.com/${slug}/all.json`,
  );
  if (!list) return [];
  return list.tokens
    .filter((t) => t.chainId === chainId)
    .map((t) => normalise(t, "coingecko"))
    .filter((t): t is NormalisedToken => t != null);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, "..", "src", "lib", "tokenLists", "data");
  await mkdir(outDir, { recursive: true });

  console.log("Fetching Uniswap default list...");
  const uniswapByChain = await loadUniswapByChain();
  console.log(`  uniswap chains: ${[...uniswapByChain.keys()].sort((a, b) => a - b).join(", ")}`);

  for (const chainId of CHAIN_IDS) {
    console.log(`\n[${chainId}] ${COINGECKO_PLATFORM[chainId] ?? "(no CG slug)"}`);

    const merged = new Map<string, NormalisedToken>();
    for (const t of uniswapByChain.get(chainId) ?? []) {
      merged.set(t.address, t);
    }
    let cgCount = 0;
    for (const t of await loadCoinGecko(chainId)) {
      cgCount++;
      const existing = merged.get(t.address);
      merged.set(t.address, existing ? merge(existing, t) : t);
    }

    const sorted = [...merged.values()].sort((a, b) => a.address.localeCompare(b.address));
    const path = resolve(outDir, `${chainId}.json`);
    await writeFile(path, JSON.stringify(sorted, null, 2) + "\n");
    console.log(
      `  uniswap=${(uniswapByChain.get(chainId) ?? []).length} coingecko=${cgCount} merged=${sorted.length} -> ${path}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
