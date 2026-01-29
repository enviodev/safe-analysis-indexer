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
  } else {
    context.Safe.set({
      ...safe,
      owners: [...safe.owners, owner],
    });

    // Add safe to Owner entity
    await addSafeToOwner(owner, safeId, context);
  }
};

export const removeOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // not a safe 
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: safe.owners.filter((o: string) => o !== owner),
    });

    // Remove safe from Owner entity
    await removeSafeFromOwner(owner, safeId, context);
  }
};

export const executionSuccess = async (event: any, context: any) => {
  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  } else {
    context.Safe.set({
      ...safe,
      numberOfSuccessfulExecutions: safe.numberOfSuccessfulExecutions + 1,
      totalGasSpent: safe.totalGasSpent + payment,
    })
  }
}

export const executionFailure = async (event: any, context: any) => {
  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  } else {
    context.Safe.set({
      ...safe,
      numberOfFailedExecutions: safe.numberOfFailedExecutions + 1,
      totalGasSpent: safe.totalGasSpent + payment,
    })
  }
}