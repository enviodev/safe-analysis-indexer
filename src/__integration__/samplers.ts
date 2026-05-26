// Sampling strategies for the cross-reference suite. Each strategy returns
// `SampleEntry[]` — Safes to compare. Strategies are intentionally biased
// toward Safes that exist on chain and have observable activity, not
// uniform-random pulls from the indexer (which would skew toward freshly
// indexed empty Safes).

import * as safeApi from "./clients/safeApi";
import {
  indexerEndpoint,
  isIndexerEndpointConfigured,
} from "./clients/indexerApi";
import { SEED_OWNERS } from "./sampling.config";
import type { ChainId, SampleEntry } from "./types";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function uniq(entries: SampleEntry[]): SampleEntry[] {
  const seen = new Set<string>();
  const out: SampleEntry[] = [];
  for (const e of entries) {
    const k = `${e.chainId}-${e.safeAddress}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// Owner-anchored: walk the seed owners for the chain, pull a few Safes from
// each via the v2 owners endpoint, return up to `target` entries.
export async function ownerAnchoredSample(
  chainId: ChainId,
  target: number,
): Promise<SampleEntry[]> {
  const owners = SEED_OWNERS[chainId] ?? [];
  if (owners.length === 0) return [];

  const out: SampleEntry[] = [];
  const perOwner = Math.max(2, Math.ceil(target / owners.length));

  for (const owner of shuffle(owners)) {
    if (out.length >= target) break;
    let page: { safes: string[]; total: number } | null = null;
    try {
      page = await safeApi.getOwnerSafes(chainId, owner, perOwner, 0);
    } catch {
      // Skip this owner if the call fails — log shape kept minimal so the
      // summary table is the canonical output of the run.
      continue;
    }
    if (!page) continue;
    for (const safeAddress of page.safes) {
      out.push({ chainId, safeAddress, source: "owner-anchored" });
      if (out.length >= target) break;
    }
  }
  return out;
}

// Recent-activity-anchored: query Safe Transaction Service per seed owner for
// their most-recently-active Safe (by walking the owner's safes and pulling
// one multisig tx each). The chain-wide "all transactions" endpoint isn't
// usable without auth, so we approximate by going seed-owner → their safes →
// confirm activity. This is "recent" enough for our purposes: it biases
// toward Safes that have actually transacted.
export async function recentActivitySample(
  chainId: ChainId,
  target: number,
): Promise<SampleEntry[]> {
  const owners = SEED_OWNERS[chainId] ?? [];
  if (owners.length === 0) return [];

  const out: SampleEntry[] = [];
  for (const owner of shuffle(owners)) {
    if (out.length >= target) break;
    let page: { safes: string[]; total: number } | null = null;
    try {
      page = await safeApi.getOwnerSafes(chainId, owner, 10, 0);
    } catch {
      continue;
    }
    if (!page) continue;

    for (const safeAddress of shuffle(page.safes)) {
      if (out.length >= target) break;
      try {
        const txs = await safeApi.getMultisigTransactions(chainId, safeAddress, 1, 0, true);
        if (txs && txs.total > 0) {
          out.push({ chainId, safeAddress, source: "recent-activity" });
        }
      } catch {
        // Skip — try next.
      }
    }
  }
  return out;
}

// Indexer-direct fallback: when seed owners yield nothing (e.g. you haven't
// curated any yet), pull recently-indexed Safes straight from our GraphQL
// endpoint. This biases toward Safes the indexer has seen — fine as a
// sanity sweep but won't catch "indexer is missing a Safe entirely".
export async function indexerDirectSample(
  chainId: ChainId,
  target: number,
): Promise<SampleEntry[]> {
  if (!isIndexerEndpointConfigured()) return [];
  const query = `
    query RecentSafes($chainId: Int!, $limit: Int!) {
      Safe(
        where: { chainId: { _eq: $chainId } }
        order_by: { creationTimestamp: desc }
        limit: $limit
      ) { address }
    }
  `;
  let res: Response;
  try {
    res = await fetch(indexerEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { chainId, limit: target } }),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as
    | { data?: { Safe?: { address: string }[] } }
    | null;
  const rows = body?.data?.Safe ?? [];
  return rows.map((r) => ({
    chainId,
    safeAddress: r.address.toLowerCase(),
    source: "recent-activity" as const,
  }));
}

// Mix strategies, dedup, and trim to size. Halve the budget between the two
// API-driven strategies. If both yield nothing (no seed owners curated yet,
// or seed owners have no Safes), backfill from the indexer-direct sampler so
// the suite has something to run.
export async function buildSample(
  chainId: ChainId,
  target: number,
): Promise<SampleEntry[]> {
  const half = Math.ceil(target / 2);
  const [owner, recent] = await Promise.all([
    ownerAnchoredSample(chainId, half),
    recentActivitySample(chainId, half),
  ]);
  let combined = uniq([...owner, ...recent]).slice(0, target);
  if (combined.length === 0) {
    combined = await indexerDirectSample(chainId, target);
  }
  return combined;
}
