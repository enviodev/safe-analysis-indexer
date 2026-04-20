import type { Safe } from "generated";
import { GnosisSafeProxyPre1_3_0, SafePre1_3_0, GnosisSafeL2, GnosisSafeProxy1_3_0, GnosisSafeProxy1_4_1, GnosisSafeProxy1_5_0, SafeErc20Watcher } from "generated";
import { addOwner, removeOwner, addSafeToOwner, executionSuccess, executionFailure, incrementSafeCount, incrementTransactionCount, incrementModuleTransactionCount, getOrCreateVersion } from "./helpers";
import { getSetupTrace, decodeSetupInput, getMasterCopyFromTrace, resolveVersionFromMasterCopy } from "./hypersync";
import { LEGACY_V1_0_0_PROXY } from "./consts";
import type { SafeVersion } from "./consts";
import { decodeAbiParameters } from "viem";

GnosisSafeProxyPre1_3_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafePre1_3_0(proxy);
  context.addSafeErc20Watcher(proxy);
});

GnosisSafeProxy1_3_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  context.addSafeErc20Watcher(event.params.proxy);
});

GnosisSafeProxy1_4_1.ProxyCreation.contractRegister(async ({ event, context }) => {
  context.addSafeErc20Watcher(event.params.proxy);
});

GnosisSafeProxy1_5_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  context.addSafeErc20Watcher(event.params.proxy);
});

GnosisSafeProxyPre1_3_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash } = event.transaction;
  const { chainId, block, srcAddress: factoryAddress } = event;

  // 1.0.0 is still detected by the legacy special-cased proxy address
  // Note: we type this as `any` so it stays compatible with the generated SafeVersion_t
  // until the schema/types are regenerated with the new enum values.
  let version: any =
    proxy.toLowerCase() === LEGACY_V1_0_0_PROXY
      ? "V1_0_0"
      : "UNKNOWN";

  // Track masterCopy address if found
  let masterCopyAddress: string | undefined = undefined;

  // For UNKNOWN versions, try to refine using traces and the masterCopy address
  if (version === "UNKNOWN") {
    try {
      const masterCopy = await context.effect(getMasterCopyFromTrace, {
        chainId,
        blockNumber: block.number,
        txHash: hash,
        factoryAddress,
      });

      if (masterCopy) {
        masterCopyAddress = masterCopy.toLowerCase();
        const resolved = resolveVersionFromMasterCopy(masterCopy);
        if (resolved) {
          version = resolved;
        } else {
          // Log unrecognized masterCopy for debugging - version stays UNKNOWN
          console.log(`[DEBUG] Unrecognized masterCopy: ${masterCopy.toLowerCase()} | chainId: ${chainId} | proxy: ${proxy}`);
        }
      }
      // Note: "No masterCopy found" is now logged in getMasterCopyFromTrace with trace debug info
    } catch (e) {
      console.log("getMasterCopyFromTrace error:", e);
    }
  }

  // Fetch trace and decode setup data
  const inputData = await context.effect(getSetupTrace, {
    chainId,
    blockNumber: block.number,
    proxyAddress: proxy,
    version,
  });

  const { owners, threshold } = inputData
    ? decodeSetupInput(inputData, version)
    : { owners: [], threshold: 0 };

  const safeId = `${chainId}-${proxy}`;

  const safe: Safe = {
    id: safeId,
    version,
    creationTxHash: hash,
    creationTimestamp: BigInt(block.timestamp),
    owners,
    threshold,
    chainId,
    address: proxy,
    masterCopy: masterCopyAddress,
    initializer: "",
    initiator: "",
    numberOfSuccessfulExecutions: 0,
    numberOfFailedExecutions: 0,
    nonce: 0,
    totalGasSpent: 0n,
  };

  context.Safe.set(safe);

  // Increment global, network, and version safe counts
  await incrementSafeCount(chainId, version, context);

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
    //not a safe
    return;
  }

  context.Safe.set({
    ...safe,
    threshold: Number(event.params.threshold),
  });
});


// Shared handler for v1.3.0+ ProxyCreation events.
// Resolves version from singleton address, falling back to factory-implied version.
async function handleModernProxyCreation(
  event: { params: { proxy: string; singleton?: string }; transaction: { hash: string }; chainId: number; block: { timestamp: number } },
  context: any,
  factoryImpliedVersion: SafeVersion
) {
  const { proxy, singleton } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const masterCopy = singleton?.toLowerCase();

  // Resolve version from singleton address; fall back to factory-implied version
  const resolvedVersion = masterCopy ? resolveVersionFromMasterCopy(masterCopy) : undefined;
  const version = resolvedVersion ?? factoryImpliedVersion;

  const safeId = `${chainId}-${proxy}`;

  // Check if SafeSetup already created this Safe (fires before ProxyCreation in same tx)
  const existingSafe = await context.Safe.get(safeId);

  if (existingSafe) {
    // SafeSetup already created the Safe - just update version, creation info, and masterCopy
    context.Safe.set({
      ...existingSafe,
      version,
      masterCopy,
      creationTxHash: hash,
      creationTimestamp: BigInt(block.timestamp),
    });
  } else {
    // Create placeholder - SafeSetup will update owners/threshold
    const safe: Safe = {
      id: safeId,
      owners: [],
      chainId,
      version,
      masterCopy,
      creationTxHash: hash,
      creationTimestamp: BigInt(block.timestamp),
      threshold: 0,
      address: proxy,
      initializer: "",
      initiator: "",
      numberOfSuccessfulExecutions: 0,
      numberOfFailedExecutions: 0,
      nonce: 0,
      totalGasSpent: 0n,
    };

    context.Safe.set(safe);
  }

  // Increment global, network, and version safe counts
  await incrementSafeCount(chainId, version, context);
}

GnosisSafeProxy1_3_0.ProxyCreation.handler(async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_3_0");
});

GnosisSafeProxy1_4_1.ProxyCreation.handler(async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_4_1");
});

GnosisSafeProxy1_5_0.ProxyCreation.handler(async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_5_0");
});

GnosisSafeL2.SafeSetup.handler(async ({ event, context }) => {
  const { owners, threshold, initializer, initiator } = event.params;
  const { srcAddress, chainId } = event;
  const { hash } = event.transaction;

  const safeId = `${chainId}-${srcAddress}`;

  // Convert owners to a regular array (event params can be readonly)
  const ownersArray = Array.isArray(owners) ? [...owners] : [];

  // Get existing safe - might exist if ProxyCreation fired first, or might not exist yet
  let existingSafe = await context.Safe.get(safeId);

  if (existingSafe) {
    // Update existing safe with owners and threshold from SafeSetup
    const safe: Safe = {
      ...existingSafe,
      owners: ownersArray,
      threshold: Number(threshold),
      initializer,
      initiator,
    };

    context.Safe.set(safe);
  } else {
    // SafeSetup fired before ProxyCreation - create the Safe now
    // ProxyCreation will update version, creationTxHash, and masterCopy when it fires
    const safe: Safe = {
      id: safeId,
      owners: ownersArray,
      threshold: Number(threshold),
      chainId,
      address: srcAddress,
      version: "V1_3_0", // Default, will be updated by ProxyCreation
      masterCopy: undefined, // Will be set by ProxyCreation
      creationTxHash: hash,
      creationTimestamp: BigInt(event.block.timestamp),
      initializer,
      initiator,
      numberOfSuccessfulExecutions: 0,
      numberOfFailedExecutions: 0,
      nonce: 0,
      totalGasSpent: 0n,
    };

    context.Safe.set(safe);
  }

  // Add safe to each Owner entity
  for (const owner of ownersArray) {
    await addSafeToOwner(owner, safeId, context);
  }
}, { wildcard: true });

GnosisSafeL2.SafeMultiSigTransaction.handler(async ({ event, context }) => {
  const { to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, additionalInfo } = event.params;
  const { srcAddress, chainId } = event;
  const { hash } = event.transaction;
  const { timestamp } = event.block;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);
  if (!safe) {
    //not a safe
    return
  }

  // Decode additionalInfo: abi.encode(nonce, msg.sender, threshold)
  const [nonce, msgSender, decodedThreshold] = decodeAbiParameters(
    [
      { name: "nonce", type: "uint256" },
      { name: "msgSender", type: "address" },
      { name: "threshold", type: "uint256" },
    ],
    additionalInfo as `0x${string}`
  );

  const networkId = chainId.toString();

  context.SafeTransaction.set({
    id: `${safeId}-${Number(nonce)}`,
    safe_id: safeId,
    network_id: networkId,
    chainId,
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
    nonce,
    msgSender,
    threshold: Number(decodedThreshold),
    executionDate: BigInt(timestamp),
    txHash: hash,
    success: undefined,
  });

  // Increment global, network, and version transaction counts
  await incrementTransactionCount(chainId, safe.version, context);
}, { wildcard: true }
);

GnosisSafeL2.SafeModuleTransaction.handler(async ({ event, context }) => {
  const { module, to, value, data, operation } = event.params;
  const { srcAddress, chainId } = event;
  const { hash } = event.transaction;
  const { timestamp } = event.block;

  const safeId = `${chainId}-${srcAddress}`;

  const safe = await context.Safe.get(safeId);
  if (!safe) {
    //not a safe
    return;
  }

  const networkId = chainId.toString();

  context.SafeModuleTransaction.set({
    id: `${hash}-${event.logIndex}`,
    safe_id: safeId,
    network_id: networkId,
    chainId,
    safeModule: module,
    to,
    value,
    data,
    operation: BigInt(operation),
    txHash: hash,
    timestamp: BigInt(timestamp),
  });

  // Increment global, network, and version module transaction counts
  await incrementModuleTransactionCount(chainId, safe.version, context);
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

GnosisSafeL2.ExecutionSuccess.handler(async ({ event, context }) => {
  await executionSuccess(event, context, true);
}, { wildcard: true });

GnosisSafeL2.ExecutionSuccessV4.handler(async ({ event, context }) => {
  await executionSuccess(event, context, true);
}, { wildcard: true });

GnosisSafeL2.ExecutionFailure.handler(async ({ event, context }) => {
  await executionFailure(event, context, true);
}, { wildcard: true });

GnosisSafeL2.ExecutionFailureV4.handler(async ({ event, context }) => {
  await executionFailure(event, context, true);
}, { wildcard: true });

GnosisSafeL2.ChangedMasterCopy.handler(async ({ event, context }) => {
  const { singleton } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = `${chainId}-${srcAddress}`;

  const safe = await context.Safe.get(safeId);
  if (!safe) return;

  const newMasterCopy = singleton.toLowerCase();
  const newVersion = resolveVersionFromMasterCopy(newMasterCopy);

  if (!newVersion) {
    // Unknown singleton - update masterCopy but keep version
    context.Safe.set({ ...safe, masterCopy: newMasterCopy });
    return;
  }

  const oldVersion = safe.version;

  context.Safe.set({
    ...safe,
    masterCopy: newMasterCopy,
    version: newVersion,
  });

  // Adjust Version stats: decrement old, increment new
  if (oldVersion !== newVersion) {
    const oldVersionEntity = await getOrCreateVersion(oldVersion, context);
    context.Version.set({
      ...oldVersionEntity,
      numberOfSafes: Math.max(0, oldVersionEntity.numberOfSafes - 1),
    });

    const newVersionEntity = await getOrCreateVersion(newVersion, context);
    context.Version.set({
      ...newVersionEntity,
      numberOfSafes: newVersionEntity.numberOfSafes + 1,
    });
  }
}, { wildcard: true });

// Wildcard ERC20 Transfer filtered to transfers touching a known Safe.
// HyperIndex partitions the Safe address pool at 5000/partition before pushing
// it down to HyperSync as topic1/topic2 filters — one request per partition.
// Pattern: https://docs.envio.dev/docs/HyperIndex/wildcard-indexing#assert-erc20-transfers-in-handler
SafeErc20Watcher.Transfer.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const token = event.srcAddress.toLowerCase();
  const from = event.params.from.toLowerCase();
  const to = event.params.to.toLowerCase();
  const value = event.params.value;
  const block = event.block.number;
  const ts = BigInt(event.block.timestamp);

  context.ERC20Transfer.set({
    id: `${chainId}_${block}_${event.logIndex}`,
    chainId,
    blockNumber: block,
    blockTimestamp: ts,
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    token,
    from,
    to,
    value,
  });

  // Maintain per-(safe, token) balance. Each Transfer event is filtered to
  // touch at least one Safe (HyperSync topic filter), but not necessarily
  // both ends — and we never know which side is the Safe at decode time, so
  // try both. context.Safe.get() short-circuits when the address is not a
  // discovered Safe.
  await Promise.all([
    applyBalanceDelta(context, chainId, from, token, -value, block, ts, "out"),
    applyBalanceDelta(context, chainId, to, token, value, block, ts, "in"),
  ]);
}, {
  wildcard: true,
  eventFilters: ({ addresses }) => [
    { from: addresses },
    { to: addresses },
  ],
});

async function applyBalanceDelta(
  context: any,
  chainId: number,
  address: string,
  token: string,
  delta: bigint,
  block: number,
  ts: bigint,
  side: "in" | "out",
) {
  // Only track balances for known Safes — the wildcard event filter can
  // surface a transfer where only one side is a Safe.
  const safe = await context.Safe.get(`${chainId}-${address}`);
  if (!safe) return;

  const id = `${chainId}-${address}-${token}`;
  const existing = await context.SafeTokenBalance.get(id);

  context.SafeTokenBalance.set({
    id,
    chainId,
    safeAddress: address,
    token,
    balance: (existing?.balance ?? 0n) + delta,
    inboundCount: (existing?.inboundCount ?? 0) + (side === "in" ? 1 : 0),
    outboundCount: (existing?.outboundCount ?? 0) + (side === "out" ? 1 : 0),
    lastUpdatedBlock: block,
    lastUpdatedTimestamp: ts,
  });
}