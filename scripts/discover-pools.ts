// Discover the deepest USD-quoted pool for every token in tokenAllowlist.json.
//
//   pnpm tsx scripts/discover-pools.ts
//
// Reads:  src/pricing/tokenAllowlist.json
// Writes:
//   - src/pricing/poolLookup.json    (pool addr → token info; runtime lookup)
//   - src/pricing/tokenAllowlist.json (in-place: fills pricing.{kind,pool,baseSymbol,dex} for each non-stable token)
//
// For each (chainId, token):
//   1. Skip if category=stable (already priced).
//   2. Try each quote in the chain's quoteOrder.
//   3. For each (token, quote) try every fee tier on the primary V3 factory.
//   4. Pick the pool with deepest liquidity (V3) or deepest reserves (V2).
//   5. Skip the token if nothing usable found.
//
// Liquidity comparison happens on-chain — no external API. Uses public
// RPCs via the chain's HyperSync URL when available, falling back to a
// hardcoded RPC list. (The point of this script is to RUN ONCE and ship
// JSON, so spending a few minutes here is fine.)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi, getAddress, type Address } from "viem";
import type { TokenSpec, PoolSpec } from "../src/pricing/types.js";
import { dexFor, resolveQuoteAddress, type V3Factory, type V2Factory } from "../src/pricing/dexConfig.js";

// Load .env from project root so ENVIO_DRPC_API_KEY is available.
function loadDotenv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|(.+))$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2] ?? m[3];
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ALLOW_PATH = path.join(ROOT, "src/pricing/tokenAllowlist.json");
const POOL_PATH = path.join(ROOT, "src/pricing/poolLookup.json");

// Fallback RPCs when an env-configured DRPC key isn't available. Public
// endpoints — fine for a few thousand read-only calls during a one-off
// run. Add chains as needed.
const FALLBACK_RPCS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  100: "https://rpc.gnosischain.com",
  137: "https://polygon-rpc.com",
  143: "https://testnet-rpc.monad.xyz", // testnet — change once mainnet RPC is public
  204: "https://opbnb-mainnet-rpc.bnbchain.org",
  324: "https://mainnet.era.zksync.io",
  999: "https://rpc.hyperliquid.xyz/evm",
  1101: "https://zkevm-rpc.com",
  5000: "https://rpc.mantle.xyz",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
  42220: "https://forno.celo.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  59144: "https://rpc.linea.build",
  81457: "https://rpc.blast.io",
  534352: "https://rpc.scroll.io",
  1313161554: "https://mainnet.aurora.dev",
};

function rpcFor(chainId: number): string | undefined {
  const drpcKey = process.env.ENVIO_DRPC_API_KEY;
  if (drpcKey) {
    // DRPC chain slugs that match our chains. Coverage isn't 100%; fall through to fallback.
    const drpcSlug: Record<number, string> = {
      1: "ethereum", 10: "optimism", 56: "bsc", 100: "gnosis", 137: "polygon",
      8453: "base", 42161: "arbitrum", 42220: "celo", 43114: "avalanche",
      59144: "linea", 81457: "blast", 534352: "scroll",
    };
    const slug = drpcSlug[chainId];
    if (slug) return `https://lb.drpc.org/ogrpc?network=${slug}&dkey=${drpcKey}`;
  }
  return FALLBACK_RPCS[chainId];
}

const V3_FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);

const V2_FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const V3_POOL_ABI = parseAbi([
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const V2_PAIR_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
]);

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// On-chain decimals lookup, cached per (chainId, token). build-allowlist
// defaults non-stable tokens to 18 to avoid CoinGecko's per-coin rate
// limit; we override with truth here.
const decimalsCache = new Map<string, number>();
async function fetchDecimals(client: Client, chainId: number, token: string): Promise<number | undefined> {
  const key = `${chainId}-${token.toLowerCase()}`;
  if (decimalsCache.has(key)) return decimalsCache.get(key);
  try {
    const d = await client.readContract({
      address: getAddress(token),
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    decimalsCache.set(key, Number(d));
    return Number(d);
  } catch {
    return undefined;
  }
}

type Client = ReturnType<typeof createPublicClient>;
const clientCache = new Map<number, Client>();

function getClient(chainId: number): Client | undefined {
  if (!clientCache.has(chainId)) {
    const url = rpcFor(chainId);
    if (!url) return undefined;
    clientCache.set(chainId, createPublicClient({ transport: http(url, { timeout: 30_000 }) }));
  }
  return clientCache.get(chainId);
}

async function findV3Pool(
  client: Client,
  factory: V3Factory,
  tokenA: string,
  tokenB: string,
): Promise<{ pool: string; liquidity: bigint } | null> {
  let best: { pool: string; liquidity: bigint } | null = null;
  for (const fee of factory.feeTiers) {
    let pool: Address;
    try {
      pool = await client.readContract({
        address: getAddress(factory.factory),
        abi: V3_FACTORY_ABI,
        functionName: "getPool",
        args: [getAddress(tokenA), getAddress(tokenB), fee],
      });
    } catch {
      continue;
    }
    if (pool.toLowerCase() === ZERO_ADDR) continue;
    let liquidity: bigint;
    try {
      liquidity = await client.readContract({
        address: pool,
        abi: V3_POOL_ABI,
        functionName: "liquidity",
      });
    } catch {
      continue;
    }
    if (liquidity === 0n) continue;
    if (!best || liquidity > best.liquidity) {
      best = { pool: pool.toLowerCase(), liquidity };
    }
  }
  return best;
}

async function findV2Pool(
  client: Client,
  factory: V2Factory,
  tokenA: string,
  tokenB: string,
): Promise<{ pool: string; reserve0: bigint; reserve1: bigint } | null> {
  let pair: Address;
  try {
    pair = await client.readContract({
      address: getAddress(factory.factory),
      abi: V2_FACTORY_ABI,
      functionName: "getPair",
      args: [getAddress(tokenA), getAddress(tokenB)],
    });
  } catch {
    return null;
  }
  if (pair.toLowerCase() === ZERO_ADDR) return null;
  try {
    const [reserve0, reserve1] = await client.readContract({
      address: pair,
      abi: V2_PAIR_ABI,
      functionName: "getReserves",
    });
    if (reserve0 === 0n && reserve1 === 0n) return null;
    return { pool: pair.toLowerCase(), reserve0, reserve1 };
  } catch {
    return null;
  }
}

async function fetchPoolTokens(
  client: Client,
  pool: string,
  isV3: boolean,
): Promise<{ token0: string; token1: string } | null> {
  const abi = isV3 ? V3_POOL_ABI : V2_PAIR_ABI;
  try {
    const [token0, token1] = await Promise.all([
      client.readContract({ address: getAddress(pool), abi, functionName: "token0" }),
      client.readContract({ address: getAddress(pool), abi, functionName: "token1" }),
    ]);
    return { token0: (token0 as string).toLowerCase(), token1: (token1 as string).toLowerCase() };
  } catch {
    return null;
  }
}

async function discoverForToken(
  spec: TokenSpec,
  allowlist: TokenSpec[],
): Promise<PoolSpec | null> {
  if (spec.category === "stable") return null;

  const dexConfig = dexFor(spec.chainId);
  if (!dexConfig) return null;

  const client = getClient(spec.chainId);
  if (!client) return null;

  for (const quoteSymbol of dexConfig.quoteOrder) {
    if (quoteSymbol.toUpperCase() === spec.symbol.toUpperCase()) continue; // don't pair against itself
    const quoteAddr = resolveQuoteAddress(quoteSymbol, spec.chainId, allowlist);
    if (!quoteAddr) continue;

    const quoteSpec = allowlist.find(
      (t) => t.chainId === spec.chainId && t.token === quoteAddr,
    );
    if (!quoteSpec) continue;

    for (const factory of dexConfig.primaries) {
      if (factory.kind === "uniV3") {
        const found = await findV3Pool(client, factory, spec.token, quoteAddr);
        if (!found) continue;
        const tokens = await fetchPoolTokens(client, found.pool, true);
        if (!tokens) continue;
        // Resolve real decimals on-chain. Stables come pre-filled from
        // build-allowlist; everything else defaulted to 18 and needs truth.
        const [d0, d1] = await Promise.all([
          fetchDecimals(client, spec.chainId, tokens.token0),
          fetchDecimals(client, spec.chainId, tokens.token1),
        ]);
        if (d0 == null || d1 == null) continue;
        return {
          chainId: spec.chainId,
          pool: found.pool,
          dex: factory.dex,
          kind: "uniV3",
          token0: tokens.token0,
          token1: tokens.token1,
          decimals0: d0,
          decimals1: d1,
          priceableToken: spec.token,
          priceableSymbol: spec.symbol,
          anchorToken: quoteAddr,
          anchorSymbol: quoteSpec.symbol,
        };
      } else {
        const found = await findV2Pool(client, factory, spec.token, quoteAddr);
        if (!found) continue;
        const tokens = await fetchPoolTokens(client, found.pool, false);
        if (!tokens) continue;
        const [d0, d1] = await Promise.all([
          fetchDecimals(client, spec.chainId, tokens.token0),
          fetchDecimals(client, spec.chainId, tokens.token1),
        ]);
        if (d0 == null || d1 == null) continue;
        return {
          chainId: spec.chainId,
          pool: found.pool,
          dex: factory.dex,
          kind: "uniV2",
          token0: tokens.token0,
          token1: tokens.token1,
          decimals0: d0,
          decimals1: d1,
          priceableToken: spec.token,
          priceableSymbol: spec.symbol,
          anchorToken: quoteAddr,
          anchorSymbol: quoteSpec.symbol,
        };
      }
    }
  }
  return null;
}

async function main() {
  loadDotenv(path.join(ROOT, ".env"));
  if (process.env.ENVIO_DRPC_API_KEY) {
    console.error("Using DRPC (ENVIO_DRPC_API_KEY set).");
  } else {
    console.error("WARNING: no ENVIO_DRPC_API_KEY — falling back to public RPCs (slow).");
  }

  if (!fs.existsSync(ALLOW_PATH)) {
    console.error(`Missing ${ALLOW_PATH}. Run scripts/build-allowlist.ts first.`);
    process.exit(1);
  }
  const allowlist: TokenSpec[] = JSON.parse(fs.readFileSync(ALLOW_PATH, "utf-8"));

  // Sort tokens so anchors (stables, wrapped natives) are processed first.
  // We don't strictly need this for discovery (the script doesn't depend
  // on already-discovered prices), but it's nice for log readability.
  const ordered = [...allowlist].sort((a, b) => {
    const order = { stable: 0, "wrapped-native": 1, "blue-chip": 2, "long-tail": 3 };
    return order[a.category] - order[b.category] || a.marketCapRank - b.marketCapRank;
  });

  const pools: PoolSpec[] = [];
  const skipped: { chainId: number; token: string; symbol: string; reason: string }[] = [];
  let processed = 0;

  for (const spec of ordered) {
    processed++;
    if (spec.category === "stable") continue;

    const dexConfig = dexFor(spec.chainId);
    if (!dexConfig) {
      skipped.push({ ...spec, reason: "no-dex-config" });
      continue;
    }
    if (!getClient(spec.chainId)) {
      skipped.push({ ...spec, reason: "no-rpc" });
      continue;
    }

    try {
      const pool = await discoverForToken(spec, allowlist);
      if (pool) {
        pools.push(pool);
      } else {
        skipped.push({ ...spec, reason: "no-pool-found" });
      }
    } catch (e) {
      skipped.push({ ...spec, reason: `error: ${(e as Error).message}` });
    }
    // Progress every 10 tokens so the user sees forward motion early.
    if (processed % 10 === 0) {
      console.error(`  [${processed}/${ordered.length}] chain ${spec.chainId} ${spec.symbol} — pools: ${pools.length}, skipped: ${skipped.length}`);
    }
  }

  // Update allowlist in place: write pool address back into each token's
  // pricing field, AND propagate on-chain decimals back (build-allowlist
  // defaults non-stable tokens to 18; TVL math needs the real value).
  const poolByToken = new Map<string, PoolSpec>();
  for (const p of pools) poolByToken.set(`${p.chainId}-${p.priceableToken}`, p);

  // Also collect anchor-side decimals from any pool that touches a token.
  // This catches anchors like WETH/WMATIC whose decimals weren't looked
  // up via priceableToken on their own pool.
  const decimalsByToken = new Map<string, number>();
  for (const p of pools) {
    decimalsByToken.set(`${p.chainId}-${p.token0}`, p.decimals0);
    decimalsByToken.set(`${p.chainId}-${p.token1}`, p.decimals1);
  }

  for (const t of allowlist) {
    const onchainDecimals = decimalsByToken.get(`${t.chainId}-${t.token}`);
    if (onchainDecimals != null) t.decimals = onchainDecimals;

    if (t.category === "stable") continue;
    const found = poolByToken.get(`${t.chainId}-${t.token}`);
    if (found) {
      t.pricing = {
        kind: found.kind,
        pool: found.pool,
        baseSymbol: found.anchorSymbol,
        dex: found.dex,
      };
    } else {
      // Mark unpriceable tokens with a sentinel so it's clear in the JSON.
      t.pricing = {
        kind: "uniV3",
        pool: ZERO_ADDR,
        baseSymbol: "UNPRICEABLE",
        dex: "none",
      };
    }
  }

  fs.writeFileSync(ALLOW_PATH, JSON.stringify(allowlist, null, 2) + "\n");
  fs.writeFileSync(POOL_PATH, JSON.stringify(pools, null, 2) + "\n");

  console.error(`\nDiscovered ${pools.length} pools across ${new Set(pools.map((p) => p.chainId)).size} chains.`);
  console.error(`Skipped ${skipped.length} tokens.`);

  // Per-chain summary
  console.error("\nPriced tokens per chain:");
  const byChain = new Map<number, number>();
  for (const p of pools) byChain.set(p.chainId, (byChain.get(p.chainId) ?? 0) + 1);
  for (const [chainId, n] of [...byChain.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(chainId).padStart(11)} → ${n} pools`);
  }

  // Skip-reason summary
  console.error("\nSkip reasons:");
  const reasonCounts = new Map<string, number>();
  for (const s of skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  for (const [r, n] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${r}: ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
