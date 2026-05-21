// Inject discovered pool addresses into config.yaml per-chain.
//
//   pnpm tsx scripts/generate-pool-config.ts
//
// Reads:  src/pricing/poolLookup.json
// Writes (in place): config.yaml — appends `- name: UniswapV3Pool` (and
// V2Pair where present) under each chain's contracts list, with the
// discovered addresses. Idempotent: re-running with a refreshed
// poolLookup.json strips and re-emits the AMM blocks without touching
// anything else.
//
// Implementation: line-by-line parser instead of regex. The earlier
// regex version mis-handled chains with `hypersync_config:` ahead of
// `contracts:` because lookahead bailed on the first lowercase-letter
// line.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolSpec } from "../src/pricing/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POOL_PATH = path.join(ROOT, "src/pricing/poolLookup.json");
const CONFIG_PATH = path.join(ROOT, "config.yaml");

const BEGIN_MARKER = "      # --- BEGIN auto-generated AMM pools (scripts/generate-pool-config.ts) ---";
const END_MARKER = "      # --- END auto-generated AMM pools ---";

// Per-chain block to inject under `    contracts:`. Indentation matches
// the existing per-chain contract entries (6 spaces for the bullet).
function blockFor(chainId: number, pools: PoolSpec[]): string[] {
  const v3 = pools.filter((p) => p.chainId === chainId && p.kind === "uniV3");
  const v2 = pools.filter((p) => p.chainId === chainId && p.kind === "uniV2");
  if (!v3.length && !v2.length) return [];

  const lines: string[] = [BEGIN_MARKER];
  if (v3.length) {
    lines.push("      - name: UniswapV3Pool");
    lines.push("        address:");
    for (const p of v3) lines.push(`          - ${p.pool}`);
  }
  if (v2.length) {
    lines.push("      - name: UniswapV2Pair");
    lines.push("        address:");
    for (const p of v2) lines.push(`          - ${p.pool}`);
  }
  lines.push(END_MARKER);
  return lines;
}

// Strip any pre-existing auto-generated block (from a prior run) so
// re-running is idempotent.
function stripExisting(lines: string[]): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line === BEGIN_MARKER) { inside = true; continue; }
    if (line === END_MARKER) { inside = false; continue; }
    if (!inside) out.push(line);
  }
  return out;
}

type Block =
  | { kind: "preamble"; lines: string[] }
  | { kind: "chain"; chainId: number; lines: string[] };

// Parse the YAML into a flat list of blocks. Chain blocks start with
// `  - id: <number>` (two-space indent) and end at either the next
// `  - id:` OR the next top-level key (a non-blank line that starts at
// column 0). The preamble block holds everything before the first
// chain; trailing top-level keys (like `address_format:`) become a
// final "preamble"-kind block so they don't get swept into the last
// chain's contracts list.
function parseBlocks(allLines: string[]): Block[] {
  const blocks: Block[] = [];
  let cur: Block = { kind: "preamble", lines: [] };
  for (const line of allLines) {
    const idMatch = /^  - id: (\d+)\b/.exec(line);
    const isTopLevelKey = /^[A-Za-z_][\w-]*:/.test(line);

    if (idMatch) {
      blocks.push(cur);
      cur = { kind: "chain", chainId: parseInt(idMatch[1], 10), lines: [line] };
    } else if (isTopLevelKey && cur.kind === "chain") {
      // Closing the chain block — start a new preamble for trailing
      // top-level keys like `address_format:`.
      blocks.push(cur);
      cur = { kind: "preamble", lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  blocks.push(cur);
  return blocks;
}

// Rewrite a chain block: strip any existing auto-generated section, then
// inject our pools at the END of the chain's `contracts:` list. The
// `contracts:` list ends when we hit either: (a) the next chain (handled
// by parseBlocks splitting at chain boundaries — so this is the LAST
// contract entry inside `cur.lines`), (b) a top-level key (which won't
// appear inside a chain block by construction), or (c) end-of-block.
//
// Since parseBlocks already split at chain boundaries, the chain's
// content runs from `- id:` to the end of `cur.lines`. The pools just
// append at the end (with marker comments).
function rewriteChain(block: Block & { kind: "chain" }, pools: PoolSpec[]): string[] {
  const lines = stripExisting(block.lines);
  const pool = blockFor(block.chainId, pools);
  if (!pool.length) return lines;

  // Strip trailing blank lines so the marker doesn't end up after a gap
  // that re-running would compound.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  return [...lines, ...pool];
}

function main() {
  if (!fs.existsSync(POOL_PATH)) {
    console.error(`Missing ${POOL_PATH}. Run scripts/discover-pools.ts first.`);
    process.exit(1);
  }
  const pools: PoolSpec[] = JSON.parse(fs.readFileSync(POOL_PATH, "utf-8"));
  const original = fs.readFileSync(CONFIG_PATH, "utf-8");
  const lines = original.split("\n");

  const blocks = parseBlocks(lines);
  let updated = 0;

  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === "chain") {
      const before = block.lines.length;
      const rewritten = rewriteChain(block, pools);
      if (rewritten.length !== before) updated++;
      out.push(...rewritten);
    } else {
      out.push(...stripExisting(block.lines));
    }
  }

  fs.writeFileSync(CONFIG_PATH, out.join("\n"));
  console.error(`Updated ${updated} chains in config.yaml with AMM pools (${pools.length} pools total).`);
}

main();
