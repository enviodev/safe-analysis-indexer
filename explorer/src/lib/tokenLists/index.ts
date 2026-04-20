/**
 * Per-chain ERC20 token-list lookup.
 *
 * Backing data: explorer/src/lib/tokenLists/data/{chainId}.json
 * Refresh with:  node --experimental-strip-types scripts/fetch-token-lists.ts
 *
 * Token info is loaded lazily per chain and cached for the process lifetime.
 * `getTokenInfo` returns null for unknown / spam tokens, which the UI uses
 * to grey them out and hide them from the default balance view.
 */

export interface TokenInfo {
  address: string; // lowercase
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  /** Provenance — e.g. ["uniswap"], ["coingecko"], or both. */
  sources: string[];
}

type TokenIndex = Map<string, TokenInfo>;
type Loader = () => Promise<{ default: TokenInfo[] }>;

// Static loader map — Turbopack can't follow template-string dynamic imports
// for code-splitting, so we enumerate explicitly. Each entry is still lazy
// (the `() => import(...)` only runs the first time the chain is queried).
// To add a new chain: drop a snapshot in ./data/{chainId}.json and add a
// matching line here. Re-run scripts/fetch-token-lists.ts to refresh.
const LOADERS: Record<number, Loader> = {
  1: () => import("./data/1.json"),
  10: () => import("./data/10.json"),
  56: () => import("./data/56.json"),
  100: () => import("./data/100.json"),
  137: () => import("./data/137.json"),
  143: () => import("./data/143.json"),
  204: () => import("./data/204.json"),
  324: () => import("./data/324.json"),
  480: () => import("./data/480.json"),
  999: () => import("./data/999.json"),
  1101: () => import("./data/1101.json"),
  1313161554: () => import("./data/1313161554.json"),
  5000: () => import("./data/5000.json"),
  8453: () => import("./data/8453.json"),
  42161: () => import("./data/42161.json"),
  42220: () => import("./data/42220.json"),
  43114: () => import("./data/43114.json"),
  59144: () => import("./data/59144.json"),
  81457: () => import("./data/81457.json"),
  534352: () => import("./data/534352.json"),
};

const cache = new Map<number, Promise<TokenIndex>>();

async function loadChainIndex(chainId: number): Promise<TokenIndex> {
  const loader = LOADERS[chainId];
  if (!loader) return new Map();
  try {
    const mod = await loader();
    const idx: TokenIndex = new Map();
    for (const t of mod.default) idx.set(t.address.toLowerCase(), t);
    return idx;
  } catch (e) {
    console.error(`Failed to load token list for chain ${chainId}`, e);
    return new Map();
  }
}

function getChainIndex(chainId: number): Promise<TokenIndex> {
  let p = cache.get(chainId);
  if (!p) {
    p = loadChainIndex(chainId);
    cache.set(chainId, p);
  }
  return p;
}

export async function getTokenInfo(
  chainId: number,
  address: string,
): Promise<TokenInfo | null> {
  const idx = await getChainIndex(chainId);
  return idx.get(address.toLowerCase()) ?? null;
}

/** Resolve metadata for many tokens at once on the same chain. */
export async function getTokenInfoMap(
  chainId: number,
  addresses: string[],
): Promise<Map<string, TokenInfo>> {
  const idx = await getChainIndex(chainId);
  const out = new Map<string, TokenInfo>();
  for (const a of addresses) {
    const lower = a.toLowerCase();
    const t = idx.get(lower);
    if (t) out.set(lower, t);
  }
  return out;
}

/**
 * Format a raw on-chain integer balance using the token's decimals when
 * known, falling back to a 18-decimal assumption flagged with a "?".
 */
export function formatTokenAmount(
  raw: string | bigint,
  token: TokenInfo | null,
): { formatted: string; symbol: string; verified: boolean } {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const decimals = token?.decimals ?? 18;
  const divisor = BigInt(10) ** BigInt(decimals);
  const integer = value / divisor;
  const fractional = value % divisor;

  let formatted: string;
  if (fractional === BigInt(0)) {
    formatted = integer.toLocaleString();
  } else {
    // Show up to 4 fractional digits, trim trailing zeros.
    const fracStr = fractional
      .toString()
      .padStart(decimals, "0")
      .slice(0, 4)
      .replace(/0+$/, "");
    formatted = fracStr
      ? `${integer.toLocaleString()}.${fracStr}`
      : integer.toLocaleString();
  }

  return {
    formatted,
    symbol: token?.symbol ?? "?",
    verified: token != null,
  };
}
