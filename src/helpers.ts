export const addOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: [...safe.owners, owner],
    })
  }
};

export const removeOwner = async (event: any, context: any) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      owners: safe.owners.filter((o: string) => o !== owner),
    })
  }
};

