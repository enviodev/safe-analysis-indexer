// Snapshot the current head block on each chain we care about.
// Output goes to src/pricing/headBlocks.json and is imported by
// AmmPricing.ts to set per-chain head-only filtering on AMM Swap
// events (no historical swap backfill — purely head pricing).
//
//   pnpm tsx scripts/get-head-blocks.ts
//
// Re-run periodically before restarting the indexer to advance the
// pricing window forward. We deliberately commit the snapshot rather
// than querying at indexer startup so the sync window is reproducible.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { DEX_CONFIG } from "../src/pricing/dexConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src/pricing/headBlocks.json");

function loadDotenv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|(.+))$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2] ?? m[3];
  }
}

const FALLBACK_RPCS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  100: "https://rpc.gnosischain.com",
  137: "https://polygon-rpc.com",
  143: "https://testnet-rpc.monad.xyz",
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
    const slug: Record<number, string> = {
      1: "ethereum", 10: "optimism", 56: "bsc", 100: "gnosis", 137: "polygon",
      8453: "base", 42161: "arbitrum", 42220: "celo", 43114: "avalanche",
      59144: "linea", 81457: "blast", 534352: "scroll",
    };
    if (slug[chainId]) return `https://lb.drpc.org/ogrpc?network=${slug[chainId]}&dkey=${drpcKey}`;
  }
  return FALLBACK_RPCS[chainId];
}

async function main() {
  loadDotenv(path.join(ROOT, ".env"));
  const heads: Record<string, number> = {};
  for (const c of DEX_CONFIG) {
    const url = rpcFor(c.chainId);
    if (!url) {
      console.error(`  ${c.chainId}: no RPC configured, skipping`);
      continue;
    }
    try {
      const client = createPublicClient({ transport: http(url, { timeout: 15_000 }) });
      const block = await client.getBlockNumber();
      heads[String(c.chainId)] = Number(block);
      console.error(`  ${String(c.chainId).padStart(11)} → block ${block}`);
    } catch (e) {
      console.error(`  ${c.chainId}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(heads, null, 2) + "\n");
  console.error(`\nWrote ${Object.keys(heads).length} chain heads to ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
