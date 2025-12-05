import {
  Safe,
  GnosisSafeL2,
} from "generated";
import { addOwner, removeOwner, addSafeToOwner } from "./helpers";


GnosisSafeL2.SafeSetup.handler(async ({ event, context }) => {
  const { owners } = event.params;
  const { srcAddress, chainId } = event;

  const safeId = `${chainId}-${srcAddress}`;

  const safe: Safe = {
    id: safeId,
    owners,
    chainId,
    address: srcAddress,
  };

  context.Safe.set(safe);

  // Add safe to each Owner entity
  for (const owner of owners) {
    await addSafeToOwner(owner, safeId, context);
  }
}, { wildcard: true });

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