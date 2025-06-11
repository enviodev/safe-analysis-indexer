import {  
  Safe,
  GnosisSafeL2,
} from "generated";
import { addOwner, removeOwner, executionSuccess, executionFailure } from "./helpers";


GnosisSafeL2.SafeSetup.handler(async ({ event, context }) => {
  const { initiator, owners, threshold, initializer, fallbackHandler } = event.params;
  const { srcAddress, chainId } = event;

  const safe: Safe = {
    id: `${chainId}-${srcAddress}`,
    initiator,
    owners,    
    numberOfOwners: owners.length,    
    threshold: Number(threshold),
    thresholdOwnerRatio: Number(threshold) / owners.length,
    initializer,
    fallbackHandler,
    chainId,    
    numberOfFailedExecutions: 0,
    numberOfSuccessfulExecutions: 0,
    totalGasSpent: 0n,
  };

  context.Safe.set(safe);
},{ wildcard: true });

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

GnosisSafeL2.SafeReceived.handler(async ({ event, context }) => {
  // would only tell us total deposit volume
});

GnosisSafeL2.SafeModuleTransaction.handler(async ({ event, context }) => {
  // could be used for module usage insights
});

GnosisSafeL2.AddedOwner.handler(async ({ event, context }) => {
  await addOwner(event, context);  
},{ wildcard: true });

GnosisSafeL2.AddedOwnerV4.handler(async ({ event, context }) => {
  await addOwner(event, context);
},{ wildcard: true });


GnosisSafeL2.ChangedThreshold.handler(async ({ event, context }) => {
  const { threshold } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId+"-"+srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    context.log.warn(`Safe not found for ${safeId}`);
    return;
  } else {
    context.Safe.set({
      ...safe,
      threshold: Number(threshold),
      thresholdOwnerRatio: Number(threshold) / safe.numberOfOwners,
    })
  }
},{ wildcard: true });

GnosisSafeL2.RemovedOwner.handler(async ({ event, context }) => {
  await removeOwner(event, context);
},{ wildcard: true });

GnosisSafeL2.RemovedOwnerV4.handler(async ({ event, context }) => {
  await removeOwner(event, context);
},{ wildcard: true });