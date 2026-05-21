// Build src/pricing/tokenAllowlist.json from CoinGecko's top 500.
//
// Strategy: 3 total API calls.
//   1-2. /coins/markets paginated (×2) → top 500 ranked by market cap.
//   3.   /coins/list?include_platform=true → ALL coins with their
//        per-platform contract addresses, in one ~2.5MB blob.
//   Then locally join (1-2) to (3) by coin id.
//
// We deliberately skip the per-coin /coins/{id} detail calls — that's
// 500 calls and CoinGecko's free anonymous tier (early 2026) throttles
// at ~5 req/min, making it impractical even with backoff. The bulk
// endpoint has the same platform data minus `decimal_place`, which
// scripts/discover-pools.ts looks up on-chain anyway.
//
//   pnpm tsx scripts/build-allowlist.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenSpec, TokenCategory } from "../src/pricing/types.js";
import { anchorsAsTokenSpecs } from "../src/pricing/anchors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src/pricing/tokenAllowlist.json");

const TOP_N = 500;
const PER_PAGE = 250;
const POLITE_DELAY_MS = 6000; // between the few calls we make, just in case

const PLATFORM_TO_CHAIN_ID: Record<string, number> = {
  "ethereum": 1,
  "optimistic-ethereum": 10,
  "binance-smart-chain": 56,
  "xdai": 100,
  "polygon-pos": 137,
  "monad": 143,
  "opbnb": 204,
  "zksync": 324,
  "hyperevm": 999,
  "polygon-zkevm": 1101,
  "mantle": 5000,
  "base": 8453,
  "arbitrum-one": 42161,
  "celo": 42220,
  "avalanche": 43114,
  "linea": 59144,
  "blast": 81457,
  "scroll": 534352,
  "aurora": 1313161554,
};

const STABLES = new Set([
  "USDC", "USDT", "DAI", "FRAX", "LUSD", "BUSD", "GUSD", "TUSD",
  "USDP", "USDD", "FDUSD", "PYUSD", "USDE", "CRVUSD", "USDB", "USDX",
  "USDF", "USDM", "USDY", "USDA", "EURS", "EURC", "USDC.E", "USDT.E",
]);

const WRAPPED_NATIVES = new Set([
  "WETH", "WBNB", "WMATIC", "WAVAX", "WMNT", "WCELO", "WXDAI", "WNEAR",
  "WMON", "WHYPE",
]);

type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
};

type CGListEntry = {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string | null>;
};

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) {
    const backoff = Math.min(120_000, 30_000 * 2 ** attempt);
    console.error(`  [429] Sleeping ${backoff / 1000}s and retrying …`);
    await sleep(backoff);
    if (attempt > 4) throw new Error(`Persistent 429 on ${url}`);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function fetchTopMarkets(): Promise<CGMarket[]> {
  const all: CGMarket[] = [];
  for (let page = 1; all.length < TOP_N; page++) {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${PER_PAGE}&page=${page}`;
    console.error(`Fetching market cap page ${page} …`);
    const rows = await fetchJson<CGMarket[]>(url);
    if (!rows.length) break;
    all.push(...rows);
    await sleep(POLITE_DELAY_MS);
  }
  return all.slice(0, TOP_N);
}

async function fetchPlatformIndex(): Promise<Map<string, CGListEntry>> {
  const url = "https://api.coingecko.com/api/v3/coins/list?include_platform=true";
  console.error(`Fetching bulk coins/list (single ~2.5MB call) …`);
  const rows = await fetchJson<CGListEntry[]>(url);
  const idx = new Map<string, CGListEntry>();
  for (const r of rows) idx.set(r.id, r);
  return idx;
}

function categorize(symbol: string, rank: number): TokenCategory {
  const s = symbol.toUpperCase();
  if (STABLES.has(s)) return "stable";
  if (WRAPPED_NATIVES.has(s)) return "wrapped-native";
  if (rank <= 50) return "blue-chip";
  return "long-tail";
}

async function main() {
  console.error(`Step 1/2: top ${TOP_N} markets …`);
  const markets = await fetchTopMarkets();
  console.error(`  Got ${markets.length} markets.\n`);

  console.error(`Step 2/2: platform index …`);
  const platformIdx = await fetchPlatformIndex();
  console.error(`  Indexed ${platformIdx.size} coins from /coins/list.\n`);

  const allow: TokenSpec[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const m of markets) {
    const entry = platformIdx.get(m.id);
    if (!entry) {
      skipped.push({ id: m.id, reason: "not-in-list" });
      continue;
    }
    let included = 0;
    for (const [platform, addr] of Object.entries(entry.platforms)) {
      const chainId = PLATFORM_TO_CHAIN_ID[platform];
      if (!chainId) continue;
      if (!addr) continue;

      const symbol = (m.symbol || entry.symbol).toUpperCase();
      const rank = m.market_cap_rank ?? 9999;
      const category = categorize(symbol, rank);

      allow.push({
        chainId,
        token: addr.toLowerCase(),
        symbol,
        // decimals: deferred to on-chain lookup in discover-pools.ts.
        // 18 is the EVM ERC-20 default; sentinel meaning "not yet
        // resolved". Stables override below.
        decimals: 18,
        category,
        marketCapRank: rank,
        pricing: category === "stable"
          ? { kind: "stable", usd: 1.0 }
          : { kind: "uniV3", pool: "0x0000000000000000000000000000000000000000", baseSymbol: "PENDING", dex: "PENDING" },
      });
      included++;
    }
    if (included === 0) skipped.push({ id: m.id, reason: "no-supported-chain" });
  }

  // Common stable decimals (USDC/USDT = 6, DAI = 18). Set explicitly so
  // discover-pools.ts doesn't have to query them on-chain.
  const STABLE_DECIMALS: Record<string, number> = {
    USDC: 6, "USDC.E": 6, USDT: 6, "USDT.E": 6,
    DAI: 18, FRAX: 18, LUSD: 18, BUSD: 18, GUSD: 2, TUSD: 18,
    USDP: 18, USDD: 18, FDUSD: 18, PYUSD: 6, USDE: 18, CRVUSD: 18,
    USDB: 18, USDX: 18, USDF: 18, USDM: 18, USDY: 18, USDA: 18,
    EURS: 2, EURC: 6,
  };
  for (const t of allow) {
    if (t.category === "stable" && STABLE_DECIMALS[t.symbol]) {
      t.decimals = STABLE_DECIMALS[t.symbol];
    }
  }

  // Merge in hardcoded per-chain anchor tokens (USDC/USDT/WETH/etc).
  // CoinGecko's canonical entries don't always populate the per-chain
  // platform address (e.g. `tether` has no `binance-smart-chain`), so
  // stables get filtered out of CoinGecko-derived rankings on most
  // chains. Anchors are public knowledge — merge them in unconditionally.
  const seen = new Set(allow.map((t) => `${t.chainId}-${t.token}`));
  let mergedAnchors = 0;
  for (const a of anchorsAsTokenSpecs()) {
    const key = `${a.chainId}-${a.token}`;
    if (seen.has(key)) continue;
    allow.push(a);
    seen.add(key);
    mergedAnchors++;
  }
  console.error(`Merged ${mergedAnchors} hardcoded anchors that were missing from CoinGecko data.`);

  allow.sort((a, b) => a.chainId - b.chainId || a.marketCapRank - b.marketCapRank || a.symbol.localeCompare(b.symbol));
  fs.writeFileSync(OUT_PATH, JSON.stringify(allow, null, 2) + "\n");

  console.error(`Wrote ${allow.length} entries to ${path.relative(ROOT, OUT_PATH)}`);
  console.error(`Skipped ${skipped.length} markets.`);

  const byChain = new Map<number, number>();
  for (const t of allow) byChain.set(t.chainId, (byChain.get(t.chainId) ?? 0) + 1);
  console.error("\nCoverage by chain:");
  for (const [chainId, n] of [...byChain.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(chainId).padStart(11)} → ${n} tokens`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
