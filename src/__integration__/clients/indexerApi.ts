// Read-only client for our deployed Envio indexer's GraphQL endpoint.
//
// The endpoint URL MUST be supplied via the INTEGRATION_INDEXER_ENDPOINT env
// var — there's deliberately no baked-in default. Deployment hashes rotate
// frequently and a stale default would silently cross-reference against the
// wrong indexer build.
//
// Uses native fetch so no extra deps. Query shapes mirror the ones already
// in `explorer/src/lib/graphql/queries.ts` but are duplicated rather than
// imported, so this integration suite stays decoupled from the explorer
// build.

import type { ChainId } from "../types";
import type {
  IndexerMultisigTx,
  IndexerModuleTx,
  IndexerSafe,
  IndexerSafeCreation,
} from "../normalize";

const ENV_NAME = "INTEGRATION_INDEXER_ENDPOINT";
const FETCH_TIMEOUT_MS = 15_000;

const readEndpoint = (): string => (process.env[ENV_NAME] ?? "").trim();

// True if the env var is set to a non-empty (non-whitespace) value. Use this
// before calling `indexerEndpoint()` if you want to branch instead of throw.
export function isIndexerEndpointConfigured(): boolean {
  return readEndpoint().length > 0;
}

export function indexerEndpoint(): string {
  const v = readEndpoint();
  if (!v) {
    throw new Error(
      `${ENV_NAME} is not set. The cross-reference suite needs an explicit ` +
        `indexer GraphQL URL — deployment hashes rotate too often for a ` +
        `baked-in default. Set e.g. ` +
        `${ENV_NAME}=https://indexer.eu.hyperindex.xyz/<hash>/v1/graphql`,
    );
  }
  return v;
}

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  // AbortController-bounded fetch — a stalled indexer endpoint would
  // otherwise hang the entire suite.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(indexerEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q, variables }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Indexer GraphQL ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Indexer GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Indexer GraphQL returned no data");
  return json.data;
}

const SAFE_QUERY = `
  query GetSafe($id: String!) {
    Safe(where: { id: { _eq: $id } }, limit: 1) {
      address
      chainId
      owners
      threshold
      masterCopy
      fallbackHandler
      guard
      version
      nonce
      modules { module }
    }
  }
`;

export async function getSafe(
  chainId: ChainId,
  address: string,
): Promise<IndexerSafe | null> {
  const id = `${chainId}-${address.toLowerCase()}`;
  const data = await query<{ Safe: IndexerSafe[] }>(SAFE_QUERY, { id });
  return data.Safe[0] ?? null;
}

const SAFE_CREATION_QUERY = `
  query GetSafeCreation($id: String!) {
    Safe(where: { id: { _eq: $id } }, limit: 1) {
      address
      chainId
      creationTxHash
      factoryAddress
      masterCopy
      setupData
      initiator
    }
  }
`;

export async function getSafeCreation(
  chainId: ChainId,
  address: string,
): Promise<IndexerSafeCreation | null> {
  const id = `${chainId}-${address.toLowerCase()}`;
  const data = await query<{ Safe: IndexerSafeCreation[] }>(SAFE_CREATION_QUERY, { id });
  return data.Safe[0] ?? null;
}

const MULTISIG_TX_QUERY = `
  query GetMultisigTxs($safeId: String!, $limit: Int!) {
    SafeTransaction(
      where: { safe_id: { _eq: $safeId } }
      order_by: { executionDate: desc }
      limit: $limit
    ) {
      nonce
      safeTxHash
      txHash
      executionDate
      success
      to
      value
      data
      operation
      safeTxGas
      baseGas
      gasPrice
      gasToken
      refundReceiver
      signatures
      threshold
      msgSender
      blockNumber
      safe { address chainId }
    }
  }
`;

// We can't get an exact total without _aggregate, but for the sampling we do
// (top-N most recent), capping at 1000 gives us enough headroom. Returns the
// rows and a `capped` flag so the comparator can decide whether to trust the
// count.
export async function getMultisigTransactions(
  chainId: ChainId,
  safeAddress: string,
  limit = 1000,
): Promise<{ txs: IndexerMultisigTx[]; capped: boolean }> {
  const safeId = `${chainId}-${safeAddress.toLowerCase()}`;
  const data = await query<{ SafeTransaction: IndexerMultisigTx[] }>(MULTISIG_TX_QUERY, {
    safeId,
    limit,
  });
  return { txs: data.SafeTransaction, capped: data.SafeTransaction.length === limit };
}

const MODULE_TX_QUERY = `
  query GetModuleTxs($safeId: String!, $limit: Int!) {
    SafeModuleTransaction(
      where: { safe_id: { _eq: $safeId } }
      order_by: { blockNumber: desc }
      limit: $limit
    ) {
      safeModule
      txHash
      blockNumber
      to
      value
      data
      operation
      timestamp
      safe { address chainId }
    }
  }
`;

export async function getModuleTransactions(
  chainId: ChainId,
  safeAddress: string,
  limit = 1000,
): Promise<{ txs: IndexerModuleTx[]; capped: boolean }> {
  const safeId = `${chainId}-${safeAddress.toLowerCase()}`;
  const data = await query<{ SafeModuleTransaction: IndexerModuleTx[] }>(MODULE_TX_QUERY, {
    safeId,
    limit,
  });
  return { txs: data.SafeModuleTransaction, capped: data.SafeModuleTransaction.length === limit };
}

// Cheap connectivity probe used by the runner's preflight check. Returns
// false on any failure — missing env var, network error, GraphQL error — so
// the runner can branch without try/catch.
export async function ping(): Promise<boolean> {
  if (!isIndexerEndpointConfigured()) return false;
  try {
    await query<{ GlobalStats: unknown[] }>(
      `query { GlobalStats(where: { id: { _eq: "global" } }) { id } }`,
      {},
    );
    return true;
  } catch {
    return false;
  }
}
