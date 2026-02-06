import { Safe, GnosisSafeProxyPre1_3_0, SafePre1_3_0, GnosisSafeL2, GnosisSafeProxy1_3_0, GnosisSafeProxy1_4_1, GnosisSafeProxy1_5_0 } from "generated";
import { addOwner, removeOwner, addSafeToOwner, executionSuccess, executionFailure, incrementSafeCount, incrementTransactionCount, incrementModuleTransactionCount } from "./helpers";
import { getSetupTrace, decodeSetupInput, getMasterCopyFromTrace, resolveVersionFromMasterCopy } from "./hypersync";
import { LEGACY_V1_0_0_PROXY } from "./consts";
import { decodeAbiParameters } from "viem";

GnosisSafeProxyPre1_3_0.ProxyCreation.contractRegister(async ({ event, context }) => {
  const { proxy } = event.params;
  context.addSafePre1_3_0(proxy);
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


// Handler for ProxyCreation from v1.3.0 factory
GnosisSafeProxy1_3_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy, singleton } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = "V1_3_0" as const;
  const masterCopy = singleton?.toLowerCase();

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
      totalGasSpent: 0n,
    };

    context.Safe.set(safe);
  }

  // Increment global, network, and version safe counts
  await incrementSafeCount(chainId, version, context);
});

// Handler for ProxyCreation from v1.4.1 factory
GnosisSafeProxy1_4_1.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy, singleton } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = "V1_4_1" as const;
  const masterCopy = singleton?.toLowerCase();

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
      totalGasSpent: 0n,
    };

    context.Safe.set(safe);
  }

  // Increment global, network, and version safe counts
  await incrementSafeCount(chainId, version, context);
});


// Handler for ProxyCreation from v1.5.0 factory
GnosisSafeProxy1_5_0.ProxyCreation.handler(async ({ event, context }) => {
  const { proxy, singleton } = event.params;
  const { hash } = event.transaction;
  const { chainId, block } = event;
  const version = "V1_5_0" as const;
  const masterCopy = singleton?.toLowerCase();

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
      totalGasSpent: 0n,
    };

    context.Safe.set(safe);
  }

  // Increment global, network, and version safe counts
  await incrementSafeCount(chainId, version, context);
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
    id: `${hash}-${event.logIndex}`,
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
  await executionSuccess(event, context);
}, { wildcard: true });

GnosisSafeL2.ExecutionSuccessV4.handler(async ({ event, context }) => {
  await executionSuccess(event, context);
}, { wildcard: true });

GnosisSafeL2.ExecutionFailure.handler(async ({ event, context }) => {
  await executionFailure(event, context);
}, { wildcard: true });

GnosisSafeL2.ExecutionFailureV4.handler(async ({ event, context }) => {
  await executionFailure(event, context);
}, { wildcard: true });