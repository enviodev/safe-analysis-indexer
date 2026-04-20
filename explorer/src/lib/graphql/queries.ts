import { gql } from "graphql-request";
import { graphqlClient } from "./client";

// Types based on schema.graphql
export type SafeVersion = "V0_0_2" | "V0_1_0" | "V1_0_0" | "V1_1_0" | "V1_1_1" | "V1_2_0" | "V1_3_0" | "V1_4_1" | "V1_5_0" | "UNKNOWN";

export interface Safe {
  id: string;
  creationTxHash: string;
  creationTimestamp: string;
  address: string;
  chainId: number;
  owners: string[];
  threshold: number;
  version: SafeVersion;
  initializer: string;
  initiator: string;
  numberOfSuccessfulExecutions: number;
  numberOfFailedExecutions: number;
  totalGasSpent: string;
}

export interface Owner {
  id: string;
  safes: string[];
}

export interface SafeOwner {
  id: string;
  owner: Owner;
  safe: Safe;
}

export interface SafeTransaction {
  id: string;
  safe: Safe;
  to: string;
  value: string;
  data: string;
  operation: string;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  signatures: string;
  nonce: string;
  msgSender: string;
  threshold: number;
  executionDate: string;
  txHash: string;
  success: boolean | null;
}

export interface SafeModuleTransaction {
  id: string;
  safe: Safe;
  safeModule: string;
  to: string;
  value: string;
  data: string;
  operation: string;
  txHash: string;
  timestamp: string;
}

// Queries
const SAFE_FRAGMENT = gql`
  fragment SafeFields on Safe {
    id
    creationTxHash
    creationTimestamp
    address
    chainId
    owners
    threshold
    version
    initializer
    initiator
    numberOfSuccessfulExecutions
    numberOfFailedExecutions
    totalGasSpent
  }
`;

const SAFE_TRANSACTION_FRAGMENT = gql`
  fragment SafeTransactionFields on SafeTransaction {
    id
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
    nonce
    msgSender
    threshold
    executionDate
    txHash
    success
    safe {
      id
      address
      chainId
    }
  }
`;

// Get a single Safe by chainId and address
export async function getSafe(chainId: number, address: string): Promise<Safe | null> {
  const query = gql`
    ${SAFE_FRAGMENT}
    query GetSafe($id: String!) {
      Safe(where: { id: { _eq: $id } }, limit: 1) {
        ...SafeFields
      }
    }
  `;
  
  const id = `${chainId}-${address.toLowerCase()}`;
  const data = await graphqlClient.request<{ Safe: Safe[] }>(query, { id });
  return data.Safe?.[0] || null;
}

// Get all Safes with the same address across chains (for multichain info)
export async function getSafesByAddress(address: string): Promise<Safe[]> {
  const query = gql`
    ${SAFE_FRAGMENT}
    query GetSafesByAddress($address: String!) {
      Safe(where: { address: { _ilike: $address } }) {
        ...SafeFields
      }
    }
  `;
  
  const data = await graphqlClient.request<{ Safe: Safe[] }>(query, { address: address.toLowerCase() });
  return data.Safe || [];
}

// Get recent Safes ordered by creation timestamp
export async function getRecentSafes(limit = 10): Promise<Safe[]> {
  const query = gql`
    ${SAFE_FRAGMENT}
    query GetRecentSafes($limit: Int!) {
      Safe(limit: $limit, order_by: { creationTimestamp: desc }) {
        ...SafeFields
      }
    }
  `;
  
  const data = await graphqlClient.request<{ Safe: Safe[] }>(query, { limit });
  return data.Safe || [];
}

// Get Owner by address
export async function getOwner(address: string): Promise<Owner | null> {
  const query = gql`
    query GetOwner($id: String!) {
      Owner(where: { id: { _ilike: $id } }, limit: 1) {
        id
        safes
      }
    }
  `;
  
  // Use _ilike for case-insensitive matching since owner IDs may have mixed case
  const data = await graphqlClient.request<{ Owner: Owner[] }>(query, { id: address });
  return data.Owner?.[0] || null;
}

// Get Safes owned by an address
export async function getSafesByOwner(ownerAddress: string): Promise<Safe[]> {
  const query = gql`
    ${SAFE_FRAGMENT}
    query GetSafesByOwner($ownerId: String!) {
      SafeOwner(where: { owner_id: { _ilike: $ownerId } }) {
        safe {
          ...SafeFields
        }
      }
    }
  `;
  
  // Use _ilike for case-insensitive matching
  const data = await graphqlClient.request<{ SafeOwner: { safe: Safe }[] }>(query, { 
    ownerId: ownerAddress 
  });
  return data.SafeOwner?.map(so => so.safe) || [];
}

// Get Safe transactions
export async function getSafeTransactions(
  safeId: string, 
  limit = 20, 
  offset = 0
): Promise<SafeTransaction[]> {
  const query = gql`
    ${SAFE_TRANSACTION_FRAGMENT}
    query GetSafeTransactions($safeId: String!, $limit: Int!, $offset: Int!) {
      SafeTransaction(
        where: { safe_id: { _eq: $safeId } }
        limit: $limit
        offset: $offset
        order_by: { executionDate: desc }
      ) {
        ...SafeTransactionFields
      }
    }
  `;
  
  const data = await graphqlClient.request<{ SafeTransaction: SafeTransaction[] }>(query, { 
    safeId, 
    limit, 
    offset 
  });
  return data.SafeTransaction || [];
}

// Get recent transactions across all Safes
export async function getRecentTransactions(limit = 20): Promise<SafeTransaction[]> {
  const query = gql`
    ${SAFE_TRANSACTION_FRAGMENT}
    query GetRecentTransactions($limit: Int!) {
      SafeTransaction(limit: $limit, order_by: { executionDate: desc }) {
        ...SafeTransactionFields
      }
    }
  `;
  
  const data = await graphqlClient.request<{ SafeTransaction: SafeTransaction[] }>(query, { limit });
  return data.SafeTransaction || [];
}

// Get transaction by hash
export async function getTransactionsByHash(txHash: string): Promise<SafeTransaction[]> {
  const query = gql`
    ${SAFE_TRANSACTION_FRAGMENT}
    query GetTransactionsByHash($txHash: String!) {
      SafeTransaction(where: { txHash: { _eq: $txHash } }) {
        ...SafeTransactionFields
      }
    }
  `;
  
  const data = await graphqlClient.request<{ SafeTransaction: SafeTransaction[] }>(query, { txHash });
  return data.SafeTransaction || [];
}

// Get module transactions for a Safe
export async function getSafeModuleTransactions(
  safeId: string, 
  limit = 20, 
  offset = 0
): Promise<SafeModuleTransaction[]> {
  const query = gql`
    query GetSafeModuleTransactions($safeId: String!, $limit: Int!, $offset: Int!) {
      SafeModuleTransaction(
        where: { safe_id: { _eq: $safeId } }
        limit: $limit
        offset: $offset
        order_by: { timestamp: desc }
      ) {
        id
        safeModule
        to
        value
        data
        operation
        txHash
        timestamp
        safe {
          id
          address
          chainId
        }
      }
    }
  `;
  
  const data = await graphqlClient.request<{ SafeModuleTransaction: SafeModuleTransaction[] }>(query, { 
    safeId, 
    limit, 
    offset 
  });
  return data.SafeModuleTransaction || [];
}

// Get a single module transaction by ID
export async function getModuleTransaction(id: string): Promise<SafeModuleTransaction | null> {
  const query = gql`
    query GetModuleTransaction($id: String!) {
      SafeModuleTransaction(where: { id: { _eq: $id } }, limit: 1) {
        id
        safeModule
        to
        value
        data
        operation
        txHash
        timestamp
        safe {
          id
          address
          chainId
        }
      }
    }
  `;

  const data = await graphqlClient.request<{ SafeModuleTransaction: SafeModuleTransaction[] }>(query, { id });
  return data.SafeModuleTransaction?.[0] || null;
}

// Search by address (could be Safe or Owner)
export async function searchByAddress(address: string): Promise<{
  safes: Safe[];
  ownedSafes: Safe[];
}> {
  const [safes, ownedSafes] = await Promise.all([
    getSafesByAddress(address),
    getSafesByOwner(address),
  ]);
  
  return { safes, ownedSafes };
}

// ERC20 Transfers touching a Safe (from wildcard topic-filter indexing)
export interface ERC20Transfer {
  id: string;
  chainId: number;
  blockNumber: number;
  blockTimestamp: string; // numeric scalar — unix seconds as string
  txHash: string;
  logIndex: number;
  token: string;
  from: string;
  to: string;
  value: string;
}

const ERC20_TRANSFER_FRAGMENT = gql`
  fragment ERC20TransferFields on ERC20Transfer {
    id
    chainId
    blockNumber
    blockTimestamp
    txHash
    logIndex
    token
    from
    to
    value
  }
`;

// ERC20 transfers where the Safe appears as sender or receiver.
// Fetches limit+1 rows so the caller can detect a next page without _aggregate.
export async function getSafeErc20Transfers(
  chainId: number,
  address: string,
  limit = 20,
  offset = 0
): Promise<ERC20Transfer[]> {
  const query = gql`
    ${ERC20_TRANSFER_FRAGMENT}
    query GetSafeErc20Transfers(
      $chainId: Int!
      $addr: String!
      $limit: Int!
      $offset: Int!
    ) {
      ERC20Transfer(
        where: {
          chainId: { _eq: $chainId }
          _or: [{ from: { _eq: $addr } }, { to: { _eq: $addr } }]
        }
        order_by: { blockTimestamp: desc, logIndex: desc }
        limit: $limit
        offset: $offset
      ) {
        ...ERC20TransferFields
      }
    }
  `;

  const data = await graphqlClient.request<{ ERC20Transfer: ERC20Transfer[] }>(
    query,
    { chainId, addr: address.toLowerCase(), limit, offset }
  );
  return data.ERC20Transfer || [];
}

// Per-(safe, token) running balance derived from ERC20Transfer in/out flow.
export interface SafeTokenBalance {
  id: string;
  chainId: number;
  safeAddress: string;
  token: string;
  balance: string; // raw on-chain integer
  inboundCount: number;
  outboundCount: number;
  lastUpdatedBlock: number;
  lastUpdatedTimestamp: string;
}

// SafeTokenBalance is a recently-added entity. Older deployments don't expose
// it — return [] in that case so the UI degrades gracefully.
export async function getSafeTokenBalances(
  chainId: number,
  address: string,
): Promise<SafeTokenBalance[]> {
  const query = gql`
    query GetSafeTokenBalances($chainId: Int!, $addr: String!) {
      SafeTokenBalance(
        where: {
          chainId: { _eq: $chainId }
          safeAddress: { _eq: $addr }
        }
      ) {
        id
        chainId
        safeAddress
        token
        balance
        inboundCount
        outboundCount
        lastUpdatedBlock
        lastUpdatedTimestamp
      }
    }
  `;

  try {
    const data = await graphqlClient.request<{
      SafeTokenBalance: SafeTokenBalance[];
    }>(query, { chainId, addr: address.toLowerCase() });
    return data.SafeTokenBalance || [];
  } catch {
    // Endpoint likely doesn't have the SafeTokenBalance entity yet.
    return [];
  }
}

// GlobalStats interface
export interface GlobalStats {
  id: string;
  totalSafes: number;
  totalTransactions: number;
  totalModuleTransactions: number;
}

// Get global stats from the GlobalStats entity
export async function getGlobalStats(): Promise<GlobalStats> {
  const query = gql`
    query GetGlobalStats {
      GlobalStats(where: { id: { _eq: "global" } }) {
        id
        totalSafes
        totalTransactions
        totalModuleTransactions
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ GlobalStats: GlobalStats[] }>(query);
    return data.GlobalStats?.[0] || {
      id: "global",
      totalSafes: 0,
      totalTransactions: 0,
      totalModuleTransactions: 0,
    };
  } catch {
    return {
      id: "global",
      totalSafes: 0,
      totalTransactions: 0,
      totalModuleTransactions: 0,
    };
  }
}

// Legacy getStats function - now uses GlobalStats
export async function getStats(): Promise<{
  totalSafes: number;
  totalTransactions: number;
}> {
  const stats = await getGlobalStats();
  return {
    totalSafes: stats.totalSafes,
    totalTransactions: stats.totalTransactions,
  };
}

// Get Safes grouped by chain (for network distribution)
export async function getSafeCountByChain(): Promise<{ chainId: number; count: number }[]> {
  // Aggregate queries not available, fetch safes and count client-side
  try {
    const query = gql`
      query GetSafesForChainCount {
        Safe(limit: 10000) {
          chainId
        }
      }
    `;
    
    const data = await graphqlClient.request<{ Safe: { chainId: number }[] }>(query);
    
    const countMap = new Map<number, number>();
    data.Safe?.forEach(safe => {
      countMap.set(safe.chainId, (countMap.get(safe.chainId) || 0) + 1);
    });
    
    return Array.from(countMap.entries())
      .map(([chainId, count]) => ({ chainId, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// Get threshold distribution
export async function getThresholdDistribution(): Promise<{ threshold: number; owners: number; count: number }[]> {
  // This would require aggregation support
  // For now, fetch safes and compute client-side
  const query = gql`
    query GetSafesForThresholdDistribution {
      Safe(limit: 1000) {
        threshold
        owners
      }
    }
  `;
  
  const data = await graphqlClient.request<{ Safe: { threshold: number; owners: string[] }[] }>(query);
  
  const distribution = new Map<string, number>();
  data.Safe?.forEach(safe => {
    const key = `${safe.threshold}/${safe.owners.length}`;
    distribution.set(key, (distribution.get(key) || 0) + 1);
  });
  
  return Array.from(distribution.entries()).map(([key, count]) => {
    const [threshold, owners] = key.split("/").map(Number);
    return { threshold, owners, count };
  }).sort((a, b) => b.count - a.count);
}

// Get indexed chain IDs from the indexer metadata
export async function getIndexedChains(): Promise<number[]> {
  const query = gql`
    query GetIndexedChains {
      _meta {
        chainId
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ _meta: { chainId: number }[] }>(query);
    return data._meta?.map(m => m.chainId) || [];
  } catch {
    return [];
  }
}

// Network entity interface
export interface Network {
  id: string; // chainId as string
  numberOfSafes: number;
  numberOfTransactions: number;
  numberOfModuleTransactions: number;
}

// Get all networks with their stats
export async function getNetworks(): Promise<Network[]> {
  const query = gql`
    query GetNetworks {
      Network(order_by: { numberOfSafes: desc }) {
        id
        numberOfSafes
        numberOfTransactions
        numberOfModuleTransactions
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ Network: Network[] }>(query);
    return data.Network || [];
  } catch {
    return [];
  }
}

// Version entity interface
export interface Version {
  id: string;
  numberOfSafes: number;
  numberOfTransactions: number;
  numberOfModuleTransactions: number;
}

// Get all versions with their stats
export async function getVersions(): Promise<Version[]> {
  const query = gql`
    query GetVersions {
      Version(order_by: { numberOfSafes: desc }) {
        id
        numberOfSafes
        numberOfTransactions
        numberOfModuleTransactions
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ Version: Version[] }>(query);
    return data.Version || [];
  } catch {
    return [];
  }
}

// Get paginated transactions with optional network filter (supports multiple chains)
export async function getPaginatedTransactions(
  limit: number = 20,
  offset: number = 0,
  chainIds?: number[]
): Promise<{ transactions: SafeTransaction[]; total: number }> {
  // Query with optional chainId filter (supports multiple chains with _in)
  let whereClause = "";
  if (chainIds && chainIds.length > 0) {
    if (chainIds.length === 1) {
      whereClause = `where: { chainId: { _eq: ${chainIds[0]} } }`;
    } else {
      whereClause = `where: { chainId: { _in: [${chainIds.join(", ")}] } }`;
    }
  }
  
  const query = gql`
    ${SAFE_TRANSACTION_FRAGMENT}
    query GetPaginatedTransactions($limit: Int!, $offset: Int!) {
      SafeTransaction(
        ${whereClause}
        limit: $limit
        offset: $offset
        order_by: { executionDate: desc }
      ) {
        ...SafeTransactionFields
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ SafeTransaction: SafeTransaction[] }>(query, { 
      limit, 
      offset 
    });
    
    // Get total count from Network entities if filtering by chains, otherwise GlobalStats
    let total = 0;
    if (chainIds && chainIds.length > 0) {
      const networks = await getNetworks();
      total = chainIds.reduce((sum, chainId) => {
        const network = networks.find(n => n.id === chainId.toString());
        return sum + (network?.numberOfTransactions || 0);
      }, 0);
    } else {
      const stats = await getGlobalStats();
      total = stats.totalTransactions;
    }
    
    return {
      transactions: data.SafeTransaction || [],
      total,
    };
  } catch (error) {
    console.error("Failed to fetch paginated transactions:", error);
    return { transactions: [], total: 0 };
  }
}

// Get paginated safes with optional network and version filters
export async function getPaginatedSafes(
  limit: number = 20,
  offset: number = 0,
  chainIds?: number[],
  versions?: string[]
): Promise<{ safes: Safe[]; total: number }> {
  // Build where conditions
  const conditions: string[] = [];
  
  if (chainIds && chainIds.length > 0) {
    if (chainIds.length === 1) {
      conditions.push(`chainId: { _eq: ${chainIds[0]} }`);
    } else {
      conditions.push(`chainId: { _in: [${chainIds.join(", ")}] }`);
    }
  }
  
  if (versions && versions.length > 0) {
    if (versions.length === 1) {
      conditions.push(`version: { _eq: "${versions[0]}" }`);
    } else {
      conditions.push(`version: { _in: [${versions.map(v => `"${v}"`).join(", ")}] }`);
    }
  }
  
  const whereClause = conditions.length > 0 ? `where: { ${conditions.join(", ")} }` : "";
  
  const query = gql`
    ${SAFE_FRAGMENT}
    query GetPaginatedSafes($limit: Int!, $offset: Int!) {
      Safe(
        ${whereClause}
        limit: $limit
        offset: $offset
        order_by: { creationTimestamp: desc }
      ) {
        ...SafeFields
      }
    }
  `;
  
  try {
    const data = await graphqlClient.request<{ Safe: Safe[] }>(query, { 
      limit, 
      offset 
    });
    
    // Get total count - this is approximate when filtering by both chain and version
    let total = 0;
    const hasChainFilter = chainIds && chainIds.length > 0;
    const hasVersionFilter = versions && versions.length > 0;
    
    if (hasChainFilter && !hasVersionFilter) {
      const networks = await getNetworks();
      total = chainIds!.reduce((sum, chainId) => {
        const network = networks.find(n => n.id === chainId.toString());
        return sum + (network?.numberOfSafes || 0);
      }, 0);
    } else if (hasVersionFilter && !hasChainFilter) {
      const allVersions = await getVersions();
      total = versions!.reduce((sum, version) => {
        const v = allVersions.find(ver => ver.id === version);
        return sum + (v?.numberOfSafes || 0);
      }, 0);
    } else if (hasChainFilter && hasVersionFilter) {
      // When both filters are applied, we can't get exact count from entities
      // Use a larger fetch to estimate (this is a limitation)
      total = data.Safe?.length || 0;
      if (total === limit) {
        // If we got exactly the limit, there's probably more
        total = limit * 10; // Rough estimate for pagination
      }
    } else {
      const stats = await getGlobalStats();
      total = stats.totalSafes;
    }
    
    return {
      safes: data.Safe || [],
      total,
    };
  } catch (error) {
    console.error("Failed to fetch paginated safes:", error);
    return { safes: [], total: 0 };
  }
}
