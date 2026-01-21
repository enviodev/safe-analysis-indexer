import { Safe, GnosisSafeProxyPre1_3_0, SafePre1_3_0, GnosisSafeL2, GnosisSafeProxy1_3_0, GnosisSafeProxy1_4_1, GnosisSafeProxy1_5_0 } from "generated";
import { addOwner, removeOwner, addSafeToOwner, executionSuccess, executionFailure } from "./helpers";
import { getSetupTrace, decodeSetupInput } from "./hypersync";

GnosisSafeProxyPre1_3_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafePre1_3_0(proxy);
});

GnosisSafeProxyPre1_3_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = proxy === "0x12302fE9c02ff50939BaAaaf415fc226C078613C" ? "V1_0_0" : "V1_1_1ORV1_2_0" as const;

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


SafePre1_3_0.AddedOwner.handler(async ({ event, context }) => {
  await addOwner(event, context);
});

SafePre1_3_0.RemovedOwner.handler(async ({ event, context }) => {
  await removeOwner(event, context);
});

SafePre1_3_0.ChangedThreshold.handler(async ({ event, context }) => {
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


// Handler for ProxyCreation from v1.3.0 factory
GnosisSafeProxy1_3_0.ProxyCreation.handler(async ({ event, context }) => {

  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId } = event;

  const safeId = `${chainId}-${proxy}`;

  // The SafeSetup event will be handled by the registered GnosisSafeL2 contract
  // We just need to create a placeholder safe entry here if needed
  // The actual owners and threshold will be set when SafeSetup is emitted
  const safe: Safe = {
    id: safeId,
    owners: [],
    chainId,
    version: "V1_3_0",
    creationTxHash: hash,
    threshold: 0,
    address: proxy,
  };

  context.Safe.set(safe);

});

// Handler for ProxyCreation from v1.4.1 factory
GnosisSafeProxy1_4_1.ProxyCreation.handler(async ({ event, context }) => {

  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId } = event;

  const safeId = `${chainId}-${proxy}`;

  // The SafeSetup event will be handled by the registered GnosisSafeL2 contract
  // We just need to create a placeholder safe entry here if needed
  // The actual owners and threshold will be set when SafeSetup is emitted
  const safe: Safe = {
    id: safeId,
    owners: [],
    chainId,
    version: "V1_4_1",
    creationTxHash: hash,
    threshold: 0,
    address: proxy,
  };

  context.Safe.set(safe);

});


// Handler for ProxyCreation from v1.5.0 factory
GnosisSafeProxy1_5_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId } = event;

  const safeId = `${chainId}-${proxy}`;

  // The SafeSetup event will be handled by the registered GnosisSafeL2 contract
  // We just need to create a placeholder safe entry here if needed
  // The actual owners and threshold will be set when SafeSetup is emitted
  const safe: Safe = {
    id: safeId,
    owners: [],
    chainId,
    version: "V1_5_0",
    creationTxHash: hash,
    threshold: 0,
    address: proxy,
  };

  context.Safe.set(safe);
});

GnosisSafeL2.SafeSetup.handler(async ({ event, context }) => {
  const { owners, threshold } = event.params;
  const { srcAddress, chainId } = event;

  const safeId = `${chainId}-${srcAddress}`;

  // Get existing safe if it was created via ProxyCreation handler - prevents false positives due to wildcard indexing
  let existingSafe = await context.Safe.get(safeId);

  if (existingSafe) {
    const safe: Safe = {
      ...existingSafe,
      threshold: Number(threshold),
    };

    context.Safe.set(safe);

    // Add safe to each Owner entity
    for (const owner of owners) {
      await addSafeToOwner(owner, safeId, context);
    }
  }
}, { wildcard: true });

GnosisSafeL2.SafeMultiSigTransaction.handler(async ({ event, context }) => {
  const { to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, additionalInfo } = event.params;
  const { srcAddress, chainId } = event;
  const { hash } = event.transaction;
  const { timestamp } = event.block;
  const safeId = chainId+"-"+srcAddress;

  context.SafeTransaction.set({        
      id: hash,
      safe_id: safeId,
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatures,
      additionalInfo,
      executionDate: BigInt(timestamp),
    });
  },{ wildcard: true }
);

GnosisSafeL2.AddedOwner.handler(async ({ event, context }) => {
  await addOwner(event, context);
}, { wildcard: true });

GnosisSafeL2.AddedOwnerV4.handler(async ({ event, context }) => {
  await addOwner(event, context);
}, { wildcard: true });


GnosisSafeL2.RemovedOwner.handler(async ({ event, context }) => {
  await removeOwner(event, context);
}, { wildcard: true });

GnosisSafeL2.RemovedOwnerV4.handler(async ({ event, context }) => {
  await removeOwner(event, context);
}, { wildcard: true });

GnosisSafeL2.ExecutionSuccess.handler(async ({ event, context }) => {
  await executionSuccess(event, context);
},{ wildcard: true });

GnosisSafeL2.ExecutionSuccessV4.handler(async ({ event, context }) => {
  await executionSuccess(event, context);
},{ wildcard: true });

GnosisSafeL2.ExecutionFailure.handler(async ({ event, context }) => {
  await executionFailure(event, context);
},{ wildcard: true });

GnosisSafeL2.ExecutionFailureV4.handler(async ({ event, context }) => {
  await executionFailure(event, context);
},{ wildcard: true });