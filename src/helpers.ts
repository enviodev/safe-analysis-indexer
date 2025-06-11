import exp from "constants";

export const addOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId+"-"+srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: [...safe.owners, owner],
      numberOfOwners: safe.numberOfOwners + 1,
      thresholdOwnerRatio: safe.threshold / safe.numberOfOwners + 1,
    })
  }
};

export const removeOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId+"-"+srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: safe.owners.filter( (o : string) => o !== owner),
      numberOfOwners: safe.numberOfOwners - 1,
      thresholdOwnerRatio: safe.threshold / safe.numberOfOwners - 1,
    })
  }
};

export const executionSuccess = async (event: any, context: any) => {
  const { payment } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId+"-"+srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
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
  const safeId = chainId+"-"+srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      numberOfFailedExecutions: safe.numberOfFailedExecutions + 1,
      totalGasSpent: safe.totalGasSpent + payment,
    })
  }
}