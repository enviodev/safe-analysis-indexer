import { isL1Safe } from "./consts";
import { getExecTransactionTrace, decodeExecTransaction } from "./hypersync";

const GLOBAL_STATS_ID = "global";

// Get or create GlobalStats entity
export const getOrCreateGlobalStats = async (context: any) => {
  let stats = await context.GlobalStats.get(GLOBAL_STATS_ID);
  if (!stats) {
    stats = {
      id: GLOBAL_STATS_ID,
      totalSafes: 0,
      totalTransactions: 0,
      totalModuleTransactions: 0,
    };
  }
  return stats;
};

// Get or create Network entity
export const getOrCreateNetwork = async (chainId: number, context: any) => {
  const networkId = chainId.toString();
  let network = await context.Network.get(networkId);
  if (!network) {
    network = {
      id: networkId,
      numberOfSafes: 0,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    };
  }
  return network;
};

// Get or create Version entity
export const getOrCreateVersion = async (version: string, context: any) => {
  let versionEntity = await context.Version.get(version);
  if (!versionEntity) {
    versionEntity = {
      id: version,
      numberOfSafes: 0,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    };
  }
  return versionEntity;
};

// Increment safe count for GlobalStats, Network, and Version
export const incrementSafeCount = async (chainId: number, version: string, context: any) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalSafes: stats.totalSafes + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfSafes: network.numberOfSafes + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfSafes: versionEntity.numberOfSafes + 1,
  });
};

// Increment transaction count for GlobalStats, Network, and Version
export const incrementTransactionCount = async (chainId: number, version: string, context: any) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalTransactions: stats.totalTransactions + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfTransactions: network.numberOfTransactions + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfTransactions: versionEntity.numberOfTransactions + 1,
  });
};

// Increment module transaction count for GlobalStats, Network, and Version
export const incrementModuleTransactionCount = async (chainId: number, version: string, context: any) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalModuleTransactions: stats.totalModuleTransactions + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfModuleTransactions: network.numberOfModuleTransactions + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfModuleTransactions: versionEntity.numberOfModuleTransactions + 1,
  });
};

export const addSafeToOwner = async (ownerAddress: string, safeId: string, context: any) => {
  const existingOwner = await context.Owner.get(ownerAddress);

  if (existingOwner) {
    // Add safe to array if not already present
    if (!existingOwner.safes.includes(safeId)) {
      context.Owner.set({
        ...existingOwner,
        safes: [...existingOwner.safes, safeId],
      });
    }
  } else {
    // Create new Owner entity
    context.Owner.set({
      id: ownerAddress,
      safes: [safeId],
    });
  }

  // Create SafeOwner join entity
  const safeOwnerId = `${ownerAddress}-${safeId}`;
  context.SafeOwner.set({
    id: safeOwnerId,
    owner_id: ownerAddress,
    safe_id: safeId,
  });
};

export const removeSafeFromOwner = async (ownerAddress: string, safeId: string, context: any) => {
  const existingOwner = await context.Owner.get(ownerAddress);

  if (existingOwner) {
    context.Owner.set({
      ...existingOwner,
      safes: existingOwner.safes.filter((s: string) => s !== safeId),
    });
  }

  // Delete the SafeOwner join entity
  const safeOwnerId = `${ownerAddress}-${safeId}`;
  context.SafeOwner.deleteUnsafe(safeOwnerId);
};

export const addOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // not a safe
    return;
  }

  // Deduplicate: both AddedOwner and AddedOwnerV4 can fire for the same event
  if (safe.owners.includes(owner)) return;

  context.Safe.set({
    ...safe,
    owners: [...safe.owners, owner],
  });

  // Add safe to Owner entity
  await addSafeToOwner(owner, safeId, context);
};

export const removeOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // not a safe
    return;
  }

  // Deduplicate: both RemovedOwner and RemovedOwnerV4 can fire for the same event
  if (!safe.owners.includes(owner)) return;

  context.Safe.set({
    ...safe,
    owners: safe.owners.filter((o: string) => o !== owner),
  });

  // Remove safe from Owner entity
  await removeSafeFromOwner(owner, safeId, context);
};

// Dedup guard for execution events: both ExecutionSuccess and ExecutionSuccessV4
// (and Failure variants) fire for the same on-chain event because indexed/non-indexed
// versions share the same topic0 hash. Track recently processed events to skip duplicates.
const processedExecutions = new Set<string>();

function executionDedup(event: any): boolean {
  const key = `${event.chainId}-${event.block.number}-${event.logIndex}`;
  if (processedExecutions.has(key)) return true;
  processedExecutions.add(key);
  // Keep set bounded — clear old entries periodically
  if (processedExecutions.size > 10_000) {
    processedExecutions.clear();
  }
  return false;
}

export const executionSuccess = async (event: any, context: any, enableTraces: boolean = false) => {
  if (executionDedup(event)) return;

  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  }

  // Capture nonce before incrementing (used for L1 SafeTransaction)
  const currentNonce = safe.nonce;

  context.Safe.set({
    ...safe,
    numberOfSuccessfulExecutions: safe.numberOfSuccessfulExecutions + 1,
    nonce: safe.nonce + 1,
    totalGasSpent: safe.totalGasSpent + payment,
  });

  // For L1 Safes, fetch execTransaction trace to create SafeTransaction entity
  if (enableTraces && isL1Safe(safe)) {
    await createL1SafeTransaction(event, context, safe, currentNonce, true);
  }
};

export const executionFailure = async (event: any, context: any, enableTraces: boolean = false) => {
  if (executionDedup(event)) return;

  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  }

  // Capture nonce before incrementing
  const currentNonce = safe.nonce;

  context.Safe.set({
    ...safe,
    numberOfFailedExecutions: safe.numberOfFailedExecutions + 1,
    nonce: safe.nonce + 1,
    totalGasSpent: safe.totalGasSpent + payment,
  });

  // For L1 Safes, fetch execTransaction trace to create SafeTransaction entity
  if (enableTraces && isL1Safe(safe)) {
    await createL1SafeTransaction(event, context, safe, currentNonce, false);
  }
};

// Create a SafeTransaction entity for L1 Safes by decoding execTransaction trace data
async function createL1SafeTransaction(event: any, context: any, safe: any, nonce: number, isSuccess: boolean) {
  const { srcAddress, chainId, block, logIndex } = event;
  const { hash } = event.transaction;
  const safeId = `${chainId}-${srcAddress}`;

  try {
    const traceResult = await context.effect(getExecTransactionTrace, {
      chainId,
      blockNumber: block.number,
      txHash: hash,
      safeAddress: srcAddress,
    });

    if (!traceResult) return;

    const decoded = decodeExecTransaction(traceResult.input, traceResult.from);
    if (!decoded) return;

    const networkId = chainId.toString();

    context.SafeTransaction.set({
      id: `${hash}-${logIndex}`,
      safe_id: safeId,
      network_id: networkId,
      chainId,
      to: decoded.to,
      value: decoded.value,
      data: decoded.data,
      operation: BigInt(decoded.operation),
      safeTxGas: decoded.safeTxGas,
      baseGas: decoded.baseGas,
      gasPrice: decoded.gasPrice,
      gasToken: decoded.gasToken,
      refundReceiver: decoded.refundReceiver,
      signatures: decoded.signatures,
      nonce: BigInt(nonce),
      msgSender: decoded.msgSender,
      threshold: safe.threshold,
      executionDate: BigInt(block.timestamp),
      txHash: hash,
    });

    // Increment global, network, and version transaction counts
    await incrementTransactionCount(chainId, safe.version, context);
  } catch (e) {
    console.log(`[L1 TRACE] Failed to create SafeTransaction for ${safeId} tx=${hash}:`, e);
  }
}