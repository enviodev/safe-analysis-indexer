import {
  Safe,
  GnosisSafeProxy,
  Safe1_0_0,
} from "generated";
import { addOwner, removeOwner, addSafeToOwner } from "./helpers";

GnosisSafeProxy.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafe1_0_0(proxy);
})

GnosisSafeProxy.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId } = event;

  const safeId = `${chainId}-${proxy}`;

  const safe: Safe = {
    id: safeId,
    creationTxHash: hash,
    owners: [],
    chainId,
    address: proxy,
  };

  context.Safe.set(safe);

  // // Add safe to each Owner entity
  // for (const owner of owners) {
  //   await addSafeToOwner(owner, safeId, context);
  // }
});

Safe1_0_0.ExecutionFailed.handler(async ({ event, context }) => {
  const { txHash } = event.params;
  const { chainId } = event;

  const safeId = `${chainId}-${txHash}`;

  // context.log.warn(safeId);
});

Safe1_0_0.AddedOwner.handler(async ({ event, context }) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;

  const safeId = `${chainId}-${srcAddress}`;

  await addSafeToOwner(owner, safeId, context);
  await addOwner(event, context);
});

Safe1_0_0.RemovedOwner.handler(async ({ event, context }) => {
  const { srcAddress, chainId } = event;
  await removeOwner(event, context);
});

Safe1_0_0.ChangedThreshold.handler(async ({ event, context }) => {
  const { srcAddress, chainId } = event;

  const safeId = `${chainId}-${srcAddress}`;

  // context.log.warn(safeId);
});