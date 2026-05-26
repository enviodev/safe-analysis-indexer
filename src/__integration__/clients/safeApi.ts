// Read-only client for the Safe Transaction Service REST API.
// Docs: https://safe-transaction-mainnet.safe.global/ (OpenAPI for eth);
// per-chain bases share the same shape under /tx-service/{chain}/.
//
// Bases:
//   https://api.safe.global/tx-service/eth   (chainId 1)
//   https://api.safe.global/tx-service/gno   (chainId 100)
//
// Only the endpoints we need for cross-reference are wrapped here. All
// addresses are lowercased on the way in so the URL is stable across casings.

import { getAddress } from "viem";
import type { ChainId } from "../types";
import type {
  SafeApiSafe,
  SafeApiMultisigTx,
  SafeApiModuleTx,
} from "../normalize";

const BASE = "https://api.safe.global/tx-service";

// Safe Transaction Service rejects lowercase addresses with HTTP 422
// ("Checksum address validation failed"). Encode in EIP-55 before requesting.
const toChecksum = (addr: string): string => getAddress(addr as `0x${string}`);

const CHAIN_PREFIX: Record<ChainId, string> = {
  1: "eth",
  100: "gno",
};

const USER_AGENT =
  "envio-safe-indexer-cross-ref/1.0 (+https://github.com/enviodev/safe-analysis-indexer)";

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

class SafeApiError extends Error {
  constructor(public status: number, public url: string, body: string) {
    super(`Safe TX Service ${status} ${url}: ${body.slice(0, 200)}`);
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  // One retry on 429 with a short backoff. The service doesn't document
  // rate limits — be polite.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (res.status === 404) return null;
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SafeApiError(res.status, url, body);
    }
    return (await res.json()) as T;
  }
  // Unreachable due to throw above, but TS needs a return.
  return null;
}

function baseUrl(chainId: ChainId): string {
  const prefix = CHAIN_PREFIX[chainId];
  if (!prefix) throw new Error(`Unsupported chainId for Safe TX Service: ${chainId}`);
  return `${BASE}/${prefix}/api`;
}

export async function getSafe(
  chainId: ChainId,
  address: string,
): Promise<SafeApiSafe | null> {
  const url = `${baseUrl(chainId)}/v1/safes/${toChecksum(address)}/`;
  return getJson<SafeApiSafe>(url);
}

export async function getOwnerSafes(
  chainId: ChainId,
  ownerAddress: string,
  limit = 20,
  offset = 0,
): Promise<{ safes: string[]; total: number } | null> {
  const url =
    `${baseUrl(chainId)}/v2/owners/${toChecksum(ownerAddress)}/safes/` +
    `?limit=${limit}&offset=${offset}`;
  // v2 owners endpoint returns paginated SafeLastStatus[]; extract just the
  // addresses since that's all the sampler needs.
  type Row = { address: string };
  const page = await getJson<Paginated<Row>>(url);
  if (!page) return null;
  return {
    safes: page.results.map((r) => r.toChecksum(address)),
    total: page.count,
  };
}

export async function getMultisigTransactions(
  chainId: ChainId,
  safeAddress: string,
  limit = 20,
  offset = 0,
  executedOnly = true,
): Promise<{ txs: SafeApiMultisigTx[]; total: number } | null> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ordering: "-execution_date",
  });
  if (executedOnly) params.set("executed", "true");
  const url =
    `${baseUrl(chainId)}/v2/safes/${toChecksum(safeAddress)}/multisig-transactions/` +
    `?${params.toString()}`;
  const page = await getJson<Paginated<SafeApiMultisigTx>>(url);
  if (!page) return null;
  return { txs: page.results, total: page.count };
}

export async function getModuleTransactions(
  chainId: ChainId,
  safeAddress: string,
  limit = 20,
  offset = 0,
): Promise<{ txs: SafeApiModuleTx[]; total: number } | null> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ordering: "-block_number",
  });
  const url =
    `${baseUrl(chainId)}/v1/safes/${toChecksum(safeAddress)}/module-transactions/` +
    `?${params.toString()}`;
  const page = await getJson<Paginated<SafeApiModuleTx>>(url);
  if (!page) return null;
  return { txs: page.results, total: page.count };
}
