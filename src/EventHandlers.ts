import { Safe, GnosisSafeProxy1_0_0, GnosisSafeProxy1_1_1, Safe1_0_0 } from "generated";
import { addOwner, removeOwner, addSafeToOwner, removeSafeFromOwner } from "./helpers";
import { getSetupTrace, decodeSetupInput } from "./hypersync";

GnosisSafeProxy1_0_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafe1_0_0(proxy);
});

GnosisSafeProxy1_0_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = "V1_0_0" as const;

  // Fetch trace and decode setup data
  const inputData = await context.effect(getSetupTrace, { chainId, blockNumber: block.number, proxyAddress: proxy, version });

  const { owners, threshold } = inputData
    ? decodeSetupInput(inputData, version)
    : { owners: [], threshold: 0 };

  const safeId = `${chainId}-${proxy}`;

  const safe: Safe = {
    id: safeId,
    version,
    creationTxHash: hash,
    owners,
    threshold,
    chainId,
    address: proxy,
  };

  context.Safe.set(safe);

  // Add safe to each Owner entity
  for (const owner of owners) {
    await addSafeToOwner(owner, safeId, context);
  }
});

GnosisSafeProxy1_1_1.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafe1_0_0(proxy);
});

GnosisSafeProxy1_1_1.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = "V1_1_1" as const;

  // Fetch trace and decode setup data
  const inputData = await context.effect(getSetupTrace, { chainId, blockNumber: block.number, proxyAddress: proxy, version });

  const { owners, threshold } = inputData
    ? decodeSetupInput(inputData, version)
    : { owners: [], threshold: 0 };

  const safeId = `${chainId}-${proxy}`;

  const safe: Safe = {
    id: safeId,
    version,
    creationTxHash: hash,
    owners,
    threshold,
    chainId,
    address: proxy,
  };

  context.Safe.set(safe);

  // Add safe to each Owner entity
  for (const owner of owners) {
    await addSafeToOwner(owner, safeId, context);
  }
});


Safe1_0_0.AddedOwner.handler(async ({ event, context }) => {
  await addOwner(event, context);
});

Safe1_0_0.RemovedOwner.handler(async ({ event, context }) => {
  await removeOwner(event, context);
});

Safe1_0_0.ChangedThreshold.handler(async ({ event, context }) => {
  const { srcAddress, chainId } = event;

  const safeId = `${chainId}-${srcAddress}`;

  let safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`safe not found ${safeId}`);
    return;
  }

  context.Safe.set({
    ...safe,
    threshold: Number(event.params.threshold),
  });
});