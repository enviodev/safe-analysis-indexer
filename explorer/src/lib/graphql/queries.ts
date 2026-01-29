import { gql } from "graphql-request";
import { graphqlClient } from "./client";

// Types based on schema.graphql
export type SafeVersion = "V1_0_0" | "V1_1_1ORV1_2_0" | "V1_3_0" | "V1_4_1" | "V1_5_0";

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
      ) {
        id
        safeModule
        to
        value
        data
        operation
        txHash
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
