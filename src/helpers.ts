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

