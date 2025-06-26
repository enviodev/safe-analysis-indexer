import exp from "constants";

// Helper function to get or create Global entity for a chain
export const getOrCreateGlobal = async (chainId: number, context: any) => {
  const globalId = chainId.toString();
  let global = await context.Global.get(globalId);

  if (!global) {
    global = {
      id: globalId,
      chainId,
      totalSafes: 0,
      totalSafeTransactions: 0,
      totalSuccessfulExecutions: 0,
      totalFailedExecutions: 0,
      totalGasSpent: 0n,
      totalValueTransferred: 0n,
    };
    context.Global.set(global);
  }

  return global;
};

export const addOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: [...safe.owners, owner],
      numberOfOwners: safe.numberOfOwners + 1,
      thresholdOwnerRatio: safe.threshold / (safe.numberOfOwners + 1),
    });
  }
};

export const removeOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: safe.owners.filter((o: string) => o !== owner),
      numberOfOwners: safe.numberOfOwners - 1,
      thresholdOwnerRatio: safe.threshold / (safe.numberOfOwners - 1),
    });
  }
};

export const executionSuccess = async (event: any, context: any) => {
  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      numberOfSuccessfulExecutions: safe.numberOfSuccessfulExecutions + 1,
      totalGasSpent: safe.totalGasSpent + payment,
    });

    // Update global stats
    const global = await getOrCreateGlobal(chainId, context);
    context.Global.set({
      ...global,
      totalSuccessfulExecutions: global.totalSuccessfulExecutions + 1,
      totalGasSpent: global.totalGasSpent + payment,
    });
  }
};

export const executionFailure = async (event: any, context: any) => {
  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    // context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      numberOfFailedExecutions: safe.numberOfFailedExecutions + 1,
      totalGasSpent: safe.totalGasSpent + payment,
    });

    // Update global stats
    const global = await getOrCreateGlobal(chainId, context);
    context.Global.set({
      ...global,
      totalFailedExecutions: global.totalFailedExecutions + 1,
      totalGasSpent: global.totalGasSpent + payment,
    });
  }
};
