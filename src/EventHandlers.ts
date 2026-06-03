import { indexer, type Entity } from "envio";
import { addOwner, removeOwner, addSafeToOwner, executionSuccess, executionFailure, incrementSafeCount, incrementTransactionCount, incrementModuleTransactionCount, getOrCreateVersion, ensureSafeStub } from "./helpers";
import { getSetupTrace, decodeSetupInput, getMasterCopyFromTrace, getSafeMasterCopyViaRpc, resolveVersionFromMasterCopy, decodeCreateProxyWithNonceInitializer, getSafeCreatorViaTraceTransaction, CREATOR_TRACE_CHAINS } from "./hypersync";
import { LEGACY_V1_0_0_PROXY } from "./consts";
import type { SafeVersion } from "./consts";
import { decodeAbiParameters, zeroAddress } from "viem";

type Safe = Entity<"Safe">;

// The default transaction guard for any newly-created Safe. Pre-1.3.0 Safes
// have no guard concept at all; v1.3.0+ Safes can later mutate via
// ChangedGuard / ChangedGuardV4.
const NO_GUARD = zeroAddress;

// Resolve `creator` (Safe-TX-Service-compatible: the address that directly
// called the factory's `createProxyWithNonce`). On chains with trace support
// (`CREATOR_TRACE_CHAINS` — currently Ethereum mainnet and Gnosis) we walk
// the deployment tx's trace tree; elsewhere we fall back to `tx.from` —
// matches Safe TX Service's behavior on chains they treat as L2 (simulated
// traces).
async function resolveCreator(
  chainId: number,
  txHash: string,
  safeAddress: string,
  fallbackTxFrom: string,
  context: any,
): Promise<string> {
  if (!CREATOR_TRACE_CHAINS.has(chainId)) return fallbackTxFrom;
  const traced = await context.effect(getSafeCreatorViaTraceTransaction, {
    chainId,
    txHash,
    safeAddress,
  });
  return traced ?? fallbackTxFrom;
}

indexer.contractRegister({ contract: "GnosisSafeProxyPre1_3_0", event: "ProxyCreation" }, async ({ event, context }) => {
  const { proxy } = event.params;
  context.chain.SafePre1_3_0.add(proxy);
  context.chain.SafeErc20Watcher.add(proxy);
});

indexer.contractRegister({ contract: "GnosisSafeProxy1_3_0", event: "ProxyCreation" }, async ({ event, context }) => {
  context.chain.SafeErc20Watcher.add(event.params.proxy);
});

indexer.contractRegister({ contract: "GnosisSafeProxy1_4_1", event: "ProxyCreation" }, async ({ event, context }) => {
  context.chain.SafeErc20Watcher.add(event.params.proxy);
});

indexer.contractRegister({ contract: "GnosisSafeProxy1_5_0", event: "ProxyCreation" }, async ({ event, context }) => {
  context.chain.SafeErc20Watcher.add(event.params.proxy);
});

indexer.onEvent({ contract: "GnosisSafeProxyPre1_3_0", event: "ProxyCreation" }, async ({ event, context }) => {
  const { proxy } = event.params;
  const { hash, from: txFrom } = event.transaction;
  const creationTxFrom = (txFrom ?? zeroAddress).toLowerCase();
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

  const { owners, threshold, fallbackHandler } = inputData
    ? decodeSetupInput(inputData, version)
    : { owners: [], threshold: 0, fallbackHandler: null };

  const safeId = `${chainId}-${proxy}`;

  // If a stub already exists (ensureSafeStub or wildcard SafeSetup orphan),
  // we want ProxyCreation to be the canonical counting event — increment
  // only on the transition false → true.
  const existingSafe = await context.Safe.get(safeId);
  const wasCountedBefore = existingSafe?.counted ?? false;

  // Resolve `creator` per Safe-TX-Service semantics (trace parent's `from`)
  // when we're on a chain with trace support; otherwise fall back to tx.from.
  const creator = await resolveCreator(chainId, hash, proxy, creationTxFrom, context);

  const safe: Safe = {
    id: safeId,
    version,
    creationTxHash: hash,
    creationTimestamp: BigInt(block.timestamp),
    blockCreationNum: block.number,
    factoryAddress: factoryAddress.toLowerCase(),
    setupData: inputData ?? undefined,
    owners,
    threshold,
    chainId,
    address: proxy,
    masterCopy: masterCopyAddress,
    fallbackHandler: fallbackHandler ? fallbackHandler.toLowerCase() : undefined,
    guard: NO_GUARD,
    moduleGuard: NO_GUARD, // pre-1.3.0 has no moduleGuard concept; defaults to zero
    initializer: "",
    creationTxFrom,
    creator,
    numberOfSuccessfulExecutions: 0,
    numberOfFailedExecutions: 0,
    nonce: 0n,
    totalGasSpent: 0n,
    counted: true, // ProxyCreation is the canonical counting event
  };

  context.Safe.set(safe);

  // Increment exactly once per Safe — skip if a prior ProxyCreation already
  // counted this one (defensive against re-emitted ProxyCreation events).
  if (!wasCountedBefore) {
    await incrementSafeCount(chainId, version, context);
  }

  // Add safe to each Owner entity
  for (const owner of owners) {
    await addSafeToOwner(owner, safeId, context);
  }
});


indexer.onEvent({ contract: "SafePre1_3_0", event: "AddedOwner" }, async ({ event, context }) => {
  await addOwner(event, context);
});

indexer.onEvent({ contract: "SafePre1_3_0", event: "RemovedOwner" }, async ({ event, context }) => {
  await removeOwner(event, context);
});

indexer.onEvent({ contract: "SafePre1_3_0", event: "ChangedThreshold" }, async ({ event, context }) => {
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
  event: { params: { proxy: string; singleton?: string }; transaction: { hash: string; from?: string; input?: string }; srcAddress: string; chainId: number; block: { number: number; timestamp: number } },
  context: any,
  factoryImpliedVersion: SafeVersion
) {
  const { proxy, singleton } = event.params;
  const { hash, from: txFrom, input: txInput } = event.transaction;
  const creationTxFrom = (txFrom ?? zeroAddress).toLowerCase();
  const { chainId, block, srcAddress: factoryAddress } = event;
  const masterCopy = singleton?.toLowerCase();
  const factory = factoryAddress.toLowerCase();

  // Resolve version from singleton address (carries L1/L2 distinction);
  // fall back to factory-implied version.
  const resolvedVersion = masterCopy ? resolveVersionFromMasterCopy(masterCopy) : undefined;
  const version: SafeVersion = resolvedVersion ?? factoryImpliedVersion;

  // Backfill setupData by decoding `createProxyWithNonce(address,bytes,uint256)`
  // from the deployment tx's calldata. Works for direct factory calls (the
  // most common pattern); returns undefined for wrapped deployments
  // (MultiSend, Gelato Relay, ERC-4337 handleOps) — those land null and can
  // be added incrementally. Matches the Safe TX Service approach
  // (`safe_service.py` → `_decode_proxy_factory`) without needing traces.
  const setupData = decodeCreateProxyWithNonceInitializer(txInput);

  const safeId = `${chainId}-${proxy}`;

  // Check if SafeSetup already created this Safe (fires before ProxyCreation in same tx)
  const existingSafe = await context.Safe.get(safeId);
  const wasCountedBefore = existingSafe?.counted ?? false;

  // Resolve `creator` via trace walk on supported chains; fall back to tx.from.
  const creator = await resolveCreator(chainId, hash, proxy, creationTxFrom, context);

  if (existingSafe) {
    // SafeSetup already created the Safe - update version, creation info, masterCopy,
    // and creation-context fields (SafeSetup-first only knew its own block; ProxyCreation
    // is the authoritative creation point, and only it knows the factory).
    // setupData: ProxyCreation is the canonical source — overwrite even if
    // the stub had something else (which it shouldn't, on this path).
    //
    // masterCopy/version: ProxyCreation's `singleton` arg reports the INITIAL
    // value the factory deployed against, NOT the current state. Setup-time
    // delegate-call patterns can call `changeMasterCopy(...)` inside
    // `setupModules(to, data)`, which emits ChangedMasterCopy BEFORE
    // ProxyCreation in log order (the canonical L1→L2 migration pattern
    // observed on Gnosis Safes 0x2e94924a… / 0xf55a8b…). Preserve any
    // already-set masterCopy/version — same defensive pattern as
    // SafeSetup, ChangedFallbackHandler, etc. The post-delegate-call state
    // is what matches Safe Transaction Service's `/safes/{addr}/` response.
    context.Safe.set({
      ...existingSafe,
      // version: preserve any non-UNKNOWN existing (state-mutation events
      // like ChangedMasterCopy fired in setup-time delegate-calls are
      // authoritative — see comment block above).
      version: existingSafe.version !== "UNKNOWN" ? existingSafe.version : version,
      masterCopy: existingSafe.masterCopy ?? masterCopy,
      creationTxHash: hash,
      creationTimestamp: BigInt(block.timestamp),
      blockCreationNum: block.number,
      factoryAddress: factory,
      setupData: setupData ?? existingSafe.setupData,
      creator,
      counted: true, // ProxyCreation is the canonical counting event
    });
  } else {
    // Create placeholder - SafeSetup will update owners/threshold/fallbackHandler
    const safe: Safe = {
      id: safeId,
      owners: [],
      chainId,
      version,
      masterCopy,
      fallbackHandler: undefined, // Will be set by SafeSetup
      guard: NO_GUARD,
      moduleGuard: NO_GUARD, // v1.5.0+ only; defaults to zero, mutated by ChangedModuleGuard
      creationTxHash: hash,
      creationTimestamp: BigInt(block.timestamp),
      blockCreationNum: block.number,
      factoryAddress: factory,
      setupData,
      threshold: 0,
      address: proxy,
      initializer: "",
      creationTxFrom,
      creator,
      numberOfSuccessfulExecutions: 0,
      numberOfFailedExecutions: 0,
      nonce: 0n,
      totalGasSpent: 0n,
      counted: true, // ProxyCreation is the canonical counting event
    };

    context.Safe.set(safe);
  }

  // Increment exactly once per Safe — guard against re-emitted ProxyCreation.
  if (!wasCountedBefore) {
    await incrementSafeCount(chainId, version, context);
  }
}

indexer.onEvent({ contract: "GnosisSafeProxy1_3_0", event: "ProxyCreation" }, async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_3_0");
});

indexer.onEvent({ contract: "GnosisSafeProxy1_4_1", event: "ProxyCreation" }, async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_4_1");
});

indexer.onEvent({ contract: "GnosisSafeProxy1_5_0", event: "ProxyCreation" }, async ({ event, context }) => {
  await handleModernProxyCreation(event, context, "V1_5_0");
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "SafeSetup", wildcard: true }, async ({ event, context }) => {
  // Note: SafeSetup.initiator event param is msg.sender of setup() — the
  // factory contract address when deployed via factory. We discard it and
  // record tx.from (the EOA / account that submitted the deployment) under
  // `Safe.creationTxFrom`. That matches Safe TX Service `creator` for direct
  // deployments but diverges for sponsored ones (ERC-4337 bundlers, etc.) —
  // see the schema comment on `Safe.creationTxFrom`.
  const { owners, threshold, initializer, fallbackHandler } = event.params;
  const { srcAddress, chainId } = event;
  const { hash, from: txFrom } = event.transaction;
  const creationTxFrom = (txFrom ?? zeroAddress).toLowerCase();

  const safeId = `${chainId}-${srcAddress}`;
  const fallback = fallbackHandler ? fallbackHandler.toLowerCase() : undefined;

  // Convert owners to a regular array (event params can be readonly)
  const ownersArray = Array.isArray(owners) ? [...owners] : [];

  // Get existing safe - might exist if ProxyCreation fired first, or might not exist yet
  let existingSafe = await context.Safe.get(safeId);

  // Backfill masterCopy via RPC ONLY when we'd otherwise leave it null —
  // either the entity doesn't exist yet (orphan branch will create it) OR it
  // exists as a stub without masterCopy (e.g., ensureSafeStub from a
  // pre-SafeSetup state event, or an earlier SafeSetup orphan branch).
  // Skipping when existingSafe.masterCopy is already set avoids redundant
  // calls for canonical Safes where ProxyCreation ran first and populated it
  // via the singleton event param. Effect is cached on (chainId, safeAddress)
  // so re-hits are free anyway, but the conditional avoids paying even the
  // cache-lookup cost.
  //
  // SafeSetup typically fires BEFORE ProxyCreation in the same tx (the
  // factory emits ProxyCreation only after returning from setup()), so for
  // canonical Safes the orphan branch is still hit and the RPC still fires.
  // ProxyCreation arriving later overwrites masterCopy with the singleton
  // param — same value, harmless. The redundant call is the tradeoff for not
  // having to enumerate every 3rd-party factory.
  let rpcMasterCopy: string | null = null;
  let resolvedVersion: SafeVersion | null = null;
  if (!existingSafe || !existingSafe.masterCopy) {
    rpcMasterCopy = await context.effect(getSafeMasterCopyViaRpc, {
      chainId,
      safeAddress: srcAddress,
    });
    if (rpcMasterCopy) {
      resolvedVersion = resolveVersionFromMasterCopy(rpcMasterCopy) ?? null;
    }
  }

  // Resolve `creator` via trace walk on supported chains; fall back to tx.from.
  // ProxyCreation's resolveCreator takes precedence when it fires (canonical
  // source), but in the SafeSetup-orphan path SafeSetup is the only chance
  // we get — wire it here too so 3rd-party-factory orphans still get a
  // trace-walked creator on chains where we support it.
  const creator = await resolveCreator(chainId, hash, srcAddress, creationTxFrom, context);

  if (existingSafe) {
    // Update existing safe with owners and threshold from SafeSetup. If
    // the existing entity is a stub (masterCopy still null because it was
    // created by ensureSafeStub or a SafeSetup-orphan that beat ProxyCreation
    // in order), apply the RPC-resolved masterCopy/version too. If
    // ProxyCreation already populated them on a previous handler call, leave
    // them alone — ProxyCreation's singleton param is the canonical source.
    // creator: if ProxyCreation has already counted this Safe its creator is
    // authoritative; otherwise SafeSetup's trace-walked value fills it in.
    //
    // fallbackHandler: SafeSetup's `fallbackHandler` event param reports the
    // value passed INTO setup() — i.e. the INITIAL value, before
    // `setupModules(to, data)` delegate-calls anything. If a setup-time
    // delegate-call emitted ChangedFallbackHandler before us (the canonical
    // 4337 module-install pattern: log[N] EnabledModule, log[N+1]
    // ChangedFallbackHandler, log[N+M] SafeSetup), the existing entity
    // already has the final fallbackHandler set and we must NOT clobber it
    // with SafeSetup's stale initial. Mirrors how masterCopy/version/creator
    // are preserved here.
    // Resolve enum version from whichever masterCopy ends up on the entity
    // (existing first, then RPC-resolved, then UNKNOWN).
    const effectiveMasterCopy =
      existingSafe.masterCopy ?? rpcMasterCopy ?? undefined;
    const effectiveVersion: SafeVersion = resolvedVersion
      ?? (effectiveMasterCopy ? (resolveVersionFromMasterCopy(effectiveMasterCopy) ?? "UNKNOWN") : "UNKNOWN");

    const safe: Safe = {
      ...existingSafe,
      owners: ownersArray,
      threshold: Number(threshold),
      initializer,
      creationTxFrom,
      fallbackHandler: existingSafe.fallbackHandler ?? fallback,
      masterCopy: effectiveMasterCopy,
      // version: preserve any non-UNKNOWN existing value (state-mutation
      // events like ChangedMasterCopy are authoritative). Otherwise derive
      // from the effective masterCopy.
      version: existingSafe.version !== "UNKNOWN" ? existingSafe.version : effectiveVersion,
      creator: existingSafe.counted ? existingSafe.creator : creator,
    };

    context.Safe.set(safe);
  } else {
    // SafeSetup fired before ProxyCreation - create the Safe now.
    // ProxyCreation will update version/creationTxHash/masterCopy/
    // blockCreationNum/factoryAddress AND set counted=true when it fires.
    // If ProxyCreation never arrives (true orphan, 3rd-party factory we
    // don't subscribe to), the RPC-backfilled masterCopy / resolved version
    // above are the final state and `counted` stays false. That's the
    // load-bearing invariant: ChangedMasterCopy and other Version-stats-
    // mutating handlers guard on `safe.counted`, so RPC-backfilled orphans
    // with a real version don't get phantom-counted / decremented.
    const safe: Safe = {
      id: safeId,
      owners: ownersArray,
      threshold: Number(threshold),
      chainId,
      address: srcAddress,
      version: resolvedVersion ?? "UNKNOWN",
      masterCopy: rpcMasterCopy ?? undefined,
      fallbackHandler: fallback,
      guard: NO_GUARD,
      moduleGuard: NO_GUARD,
      creationTxHash: hash,
      creationTimestamp: BigInt(event.block.timestamp),
      blockCreationNum: event.block.number,
      factoryAddress: undefined, // Not known from SafeSetup; ProxyCreation will fill it
      setupData: undefined,
      initializer,
      creationTxFrom,
      creator,
      numberOfSuccessfulExecutions: 0,
      numberOfFailedExecutions: 0,
      nonce: 0n,
      totalGasSpent: 0n,
      // SafeSetup never counts — ProxyCreation is the canonical counting event.
      counted: false,
    };

    context.Safe.set(safe);
  }

  // Add safe to each Owner entity
  for (const owner of ownersArray) {
    await addSafeToOwner(owner, safeId, context);
  }
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "SafeMultiSigTransaction", wildcard: true }, async ({ event, context }) => {
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
    safeTxHash: undefined, // set later by ExecutionSuccess/Failure
    blockNumber: event.block.number,
    success: undefined,
  });

  await incrementTransactionCount(chainId, safe.version, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "SafeModuleTransaction", wildcard: true }, async ({ event, context }) => {
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
    blockNumber: event.block.number,
  });

  await incrementModuleTransactionCount(chainId, safe.version, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "AddedOwner", wildcard: true }, async ({ event, context }) => {
  await addOwner(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "AddedOwnerV4", wildcard: true }, async ({ event, context }) => {
  await addOwner(event, context);
});


indexer.onEvent({ contract: "GnosisSafeL2", event: "RemovedOwner", wildcard: true }, async ({ event, context }) => {
  await removeOwner(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "RemovedOwnerV4", wildcard: true }, async ({ event, context }) => {
  await removeOwner(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ExecutionSuccess", wildcard: true }, async ({ event, context }) => {
  await executionSuccess(event, context, true);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ExecutionSuccessV4", wildcard: true }, async ({ event, context }) => {
  await executionSuccess(event, context, true);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ExecutionFailure", wildcard: true }, async ({ event, context }) => {
  await executionFailure(event, context, true);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ExecutionFailureV4", wildcard: true }, async ({ event, context }) => {
  await executionFailure(event, context, true);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedMasterCopy", wildcard: true }, async ({ event, context }) => {
  const { singleton } = event.params;

  // Stub if missing — possible if ChangedMasterCopy fires inside a
  // setup()-time delegate-call ahead of SafeSetup / ProxyCreation.
  const safe = await ensureSafeStub(event, context);

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

  // Adjust Version stats: decrement old, increment new.
  // Skip if the Safe hasn't been counted yet — applies to all stub paths
  // (ensureSafeStub, SafeSetup-only orphan, RPC-backfilled orphan with a
  // resolved version). Counting only ever happens on the canonical
  // ProxyCreation event; until that fires, this Safe never contributed to
  // numberOfSafes, so decrementing the old version would underflow and
  // incrementing the new version would phantom-count it. When/if
  // ProxyCreation eventually arrives it'll increment the resolved version
  // exactly once.
  if (safe.counted && oldVersion !== newVersion) {
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
});

// ChangedModuleGuard — v1.5.0+ only (earlier versions have no moduleGuard
// concept). Emitted by `setModuleGuard(...)`. Same wildcard / ensureSafeStub
// pattern as ChangedGuard / ChangedFallbackHandler.
indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedModuleGuard", wildcard: true }, async ({ event, context }) => {
  // Stub if missing — handles setup()-time delegate-call emission.
  const safe = await ensureSafeStub(event, context);
  context.Safe.set({
    ...safe,
    moduleGuard: event.params.moduleGuard.toLowerCase(),
  });
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedFallbackHandler", wildcard: true }, async ({ event, context }) => {
  const { handler } = event.params;

  // Stub if missing — handles setup()-time delegate-call emission.
  const safe = await ensureSafeStub(event, context);

  context.Safe.set({ ...safe, fallbackHandler: handler.toLowerCase() });
});

// ChangedThreshold — modern Safes (v1.3.0+) emit this on
// `changeThreshold(uint256)`. The signature has been unchanged across
// v1.3.0 / v1.4.1 / v1.5.0 (single non-indexed `threshold` arg), so a
// single non-V4 wildcard handler covers all modern versions. The
// SafePre1_3_0 contract-registered handler above keeps the legacy path.
//
// Surfaced by integration testing with sample=100 — one chain-1 Safe
// reported threshold=4 canonically but 1 on our side, because nothing
// updated threshold after the initial SafeSetup wrote it.
indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedThreshold", wildcard: true }, async ({ event, context }) => {
  // Stub if missing — same setup()-time delegate-call concern as the
  // other GnosisSafeL2 wildcards (a multiSend bundle could call
  // changeThreshold inside setup(), emitting ChangedThreshold before
  // SafeSetup / ProxyCreation).
  const safe = await ensureSafeStub(event, context);

  context.Safe.set({
    ...safe,
    threshold: Number(event.params.threshold),
  });
});

// ChangedGuard — two ABI variants share the same topic0:
//   v1.3.0:  ChangedGuard(address guard)             -- non-indexed
//   v1.4.0+: ChangedGuard(address indexed guard)     -- indexed (named V4 in config)
// In production a given Safe only emits the variant matching its version, so
// the two handlers never fire for the same on-chain event. Both delegate to
// the same idempotent in-place update.
async function applyGuardChange(
  event: {
    params: { guard: string };
    srcAddress: string;
    chainId: number;
    block: { number: number; timestamp: number };
    transaction: { hash: string; from?: string };
  },
  context: any,
) {
  const { guard } = event.params;
  // Stub if missing — handles setup()-time delegate-call emission.
  const safe = await ensureSafeStub(event, context);
  context.Safe.set({ ...safe, guard: guard.toLowerCase() });
}

indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedGuard", wildcard: true }, async ({ event, context }) => {
  await applyGuardChange(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "ChangedGuardV4", wildcard: true }, async ({ event, context }) => {
  await applyGuardChange(event, context);
});

// EnabledModule / DisabledModule — two ABI variants share each topic0:
//   pre-1.4.0: EnabledModule(address module)              -- non-indexed
//   v1.4.0+:   EnabledModule(address indexed module)      -- indexed (named V4)
// A Safe only emits the variant matching its version, so the V4/non-V4
// handlers never both fire for the same on-chain event. Both delegate to the
// same idempotent helpers below.
//
// SafeModule rows exist iff the module is currently enabled. Re-enabling a
// previously-disabled module re-creates the row with a fresh enabledAt; the
// id is deterministic on (chainId, safe, module) so there's no row drift.
async function applyEnableModule(
  event: {
    params: { module: string };
    srcAddress: string;
    chainId: number;
    block: { number: number; timestamp: number };
    transaction: { hash: string; from?: string };
  },
  context: any,
) {
  const { module } = event.params;
  const safeId = `${event.chainId}-${event.srcAddress}`;

  // Stub if missing — this is the primary motivator for the stub pattern.
  // Bundled setup deploys (Safe's 4337 module installer is the canonical
  // example) emit EnabledModule via multiSend delegate-call inside setup(),
  // which lands BEFORE SafeSetup / ProxyCreation in the same tx.
  await ensureSafeStub(event, context);

  const moduleAddr = module.toLowerCase();
  context.SafeModule.set({
    id: `${safeId}-${moduleAddr}`,
    safe_id: safeId,
    module: moduleAddr,
    chainId: event.chainId,
    enabledAtBlock: event.block.number,
    enabledAtTimestamp: BigInt(event.block.timestamp),
    enabledTxHash: event.transaction.hash,
  });
}

async function applyDisableModule(
  event: { params: { module: string }; srcAddress: string; chainId: number },
  context: any,
) {
  const { module } = event.params;
  const safeId = `${event.chainId}-${event.srcAddress}`;

  // DisableModule on a never-seen Safe: nothing to delete. Don't stub — a
  // stub with no modules is just orphan noise.
  const rowId = `${safeId}-${module.toLowerCase()}`;
  const existing = await context.SafeModule.get(rowId);
  if (!existing) return;
  context.SafeModule.deleteUnsafe(rowId);
}

indexer.onEvent({ contract: "GnosisSafeL2", event: "EnabledModule", wildcard: true }, async ({ event, context }) => {
  await applyEnableModule(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "EnabledModuleV4", wildcard: true }, async ({ event, context }) => {
  await applyEnableModule(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "DisabledModule", wildcard: true }, async ({ event, context }) => {
  await applyDisableModule(event, context);
});

indexer.onEvent({ contract: "GnosisSafeL2", event: "DisabledModuleV4", wildcard: true }, async ({ event, context }) => {
  await applyDisableModule(event, context);
});

// Wildcard ERC20 Transfer filtered to transfers touching a known Safe.
// HyperIndex partitions the Safe address pool at 5000/partition before pushing
// it down to HyperSync as topic1/topic2 filters — one request per partition.
// Pattern: https://docs.envio.dev/docs/HyperIndex/wildcard-indexing#assert-erc20-transfers-in-handler
indexer.onEvent({
  contract: "SafeErc20Watcher",
  event: "Transfer",
  wildcard: true,
  where: ({ chain }) => ({
    params: [
      { from: chain.SafeErc20Watcher.addresses },
      { to:   chain.SafeErc20Watcher.addresses },
    ],
  }),
}, async ({ event, context }) => {
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