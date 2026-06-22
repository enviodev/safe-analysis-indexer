import { zeroAddress } from "viem";
import type { Entity, EvmEvent, EvmOnEventContext } from "envio";
import { isL1Safe } from "./consts";
import { decodeExecTransaction, getExecTransactionViaRpcTrace, isRpcConfigured } from "./hypersync";
import { publishIfRealtime } from "./rabbitmqEffect";
import { buildExecutedMultisigTransaction } from "./safeEvents";

const GLOBAL_STATS_ID = "global";

type Safe = Entity<"Safe">;

// The four execution events share the same handler logic and payload shape
// (txHash + payment params, plus the hash/input/from transaction fields).
// Typing against the codegen'd event union means the compiler catches dropped
// `field_selection` entries — e.g. removing `input` makes `transaction.input`
// a type error here instead of silently breaking the direct-decode path.
type ExecutionEvent = EvmEvent<
  "GnosisSafeL2",
  "ExecutionSuccess" | "ExecutionSuccessV4" | "ExecutionFailure" | "ExecutionFailureV4"
>;
// AddedOwner/RemovedOwner fire from the pre-1.3.0 ABI (non-indexed) and the
// v1.4.0+ ABI (indexed, suffixed V4); both contracts route into the shared
// owner handlers below.
type AddedOwnerEvent = EvmEvent<"SafePre1_3_0" | "GnosisSafeL2", "AddedOwner" | "AddedOwnerV4">;
type RemovedOwnerEvent = EvmEvent<"SafePre1_3_0" | "GnosisSafeL2", "RemovedOwner" | "RemovedOwnerV4">;
type HandlerContext = EvmOnEventContext;

// Create a minimal Safe entity stub when a state-mutation event fires for a
// Safe we haven't seen yet. The canonical case: bundled setup deploys (e.g.
// Safe's 4337 module installer) use a delegate-call inside setup() that emits
// `EnabledModule` / `AddedOwner` / `ChangedFallbackHandler` etc. BEFORE the
// factory's `ProxyCreation` event. Those events fire on the Safe address, but
// the Safe entity hasn't been created yet by `SafeSetup` or `ProxyCreation`.
//
// Subsequent `SafeSetup` (wildcard) overwrites owners/threshold/initializer/
// creationTxFrom/fallbackHandler on its `existingSafe` branch. Subsequent
// `ProxyCreation` overwrites version/masterCopy/creationTxHash/blockCreationNum/
// factoryAddress and bumps the safe count.
//
// If neither follows (truly orphan emission, or topic0 collision from a non-
// Safe contract), we end up with a Safe entity with `version: "UNKNOWN"`,
// empty owners, threshold=0, and no factory — same shape as the existing
// SafeSetup-only orphan path. Stats counts are NOT incremented here; that
// stays on the canonical `ProxyCreation` path so it doesn't double-count.
//
// `version: "UNKNOWN"` is deliberate (not `V1_3_0`): we genuinely don't know
// the version yet, and `counted: false` already gates Version-stats
// reconciliation for stubs.
export const ensureSafeStub = async (
  event: {
    srcAddress: string;
    chainId: number;
    block: { number: number; timestamp: number };
    transaction: { hash: string; from?: string };
  },
  context: HandlerContext,
) => {
  const safeId = `${event.chainId}-${event.srcAddress}`;
  const existing = await context.Safe.get(safeId);
  if (existing) return existing;

  const stub: Safe = {
    id: safeId,
    chainId: event.chainId,
    address: event.srcAddress,
    owners: [] as string[],
    threshold: 0,
    version: "UNKNOWN", // we don't know yet; ProxyCreation will resolve it
    masterCopy: undefined,
    fallbackHandler: undefined,
    guard: zeroAddress,
    moduleGuard: zeroAddress, // v1.5.0+ only; defaults to zero
    creationTxHash: event.transaction.hash,
    creationTimestamp: BigInt(event.block.timestamp),
    blockCreationNum: event.block.number,
    factoryAddress: undefined,
    setupData: undefined,
    initializer: zeroAddress, // sentinel — overwritten by SafeSetup
    creationTxFrom: (event.transaction.from ?? zeroAddress).toLowerCase(),
    // `creator` matches `creationTxFrom` at stub time — we don't fire the
    // trace_transaction effect from this hot path (it's called for every
    // pre-SafeSetup wildcard state event). Real `creator` resolution runs in
    // ProxyCreation and SafeSetup handlers; whichever lands first wins.
    creator: (event.transaction.from ?? zeroAddress).toLowerCase(),
    numberOfSuccessfulExecutions: 0,
    numberOfFailedExecutions: 0,
    nonce: 0n,
    totalGasSpent: 0n,
    // Stubs are uncounted by definition — only ProxyCreation flips this to
    // true. ChangedMasterCopy etc. guard on `counted` to skip Version-stats
    // reconciliation for uncounted Safes.
    counted: false,
  };
  context.Safe.set(stub);
  return stub;
};

// Get or create GlobalStats entity
export const getOrCreateGlobalStats = async (context: HandlerContext) => {
  let stats = await context.GlobalStats.get(GLOBAL_STATS_ID);
  if (!stats) {
    stats = {
      id: GLOBAL_STATS_ID,
      totalSafes: 0,
      totalTransactions: 0,
      totalModuleTransactions: 0,
    };
  }
  return stats;
};

// Get or create Network entity
export const getOrCreateNetwork = async (chainId: number, context: HandlerContext) => {
  const networkId = chainId.toString();
  let network = await context.Network.get(networkId);
  if (!network) {
    network = {
      id: networkId,
      numberOfSafes: 0,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    };
  }
  return network;
};

// Get or create Version entity
export const getOrCreateVersion = async (version: string, context: HandlerContext) => {
  let versionEntity = await context.Version.get(version);
  if (!versionEntity) {
    versionEntity = {
      id: version,
      numberOfSafes: 0,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    };
  }
  return versionEntity;
};

// Increment safe count for GlobalStats, Network, and Version
export const incrementSafeCount = async (chainId: number, version: string, context: HandlerContext) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalSafes: stats.totalSafes + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfSafes: network.numberOfSafes + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfSafes: versionEntity.numberOfSafes + 1,
  });
};

// Increment transaction count for GlobalStats, Network, and Version
export const incrementTransactionCount = async (chainId: number, version: string, context: HandlerContext) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalTransactions: stats.totalTransactions + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfTransactions: network.numberOfTransactions + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfTransactions: versionEntity.numberOfTransactions + 1,
  });
};

// Increment module transaction count for GlobalStats, Network, and Version
export const incrementModuleTransactionCount = async (chainId: number, version: string, context: HandlerContext) => {
  const stats = await getOrCreateGlobalStats(context);
  context.GlobalStats.set({
    ...stats,
    totalModuleTransactions: stats.totalModuleTransactions + 1,
  });

  const network = await getOrCreateNetwork(chainId, context);
  context.Network.set({
    ...network,
    numberOfModuleTransactions: network.numberOfModuleTransactions + 1,
  });

  const versionEntity = await getOrCreateVersion(version, context);
  context.Version.set({
    ...versionEntity,
    numberOfModuleTransactions: versionEntity.numberOfModuleTransactions + 1,
  });
};

export const addSafeToOwner = async (ownerAddress: string, safeId: string, context: HandlerContext) => {
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

export const removeSafeFromOwner = async (ownerAddress: string, safeId: string, context: HandlerContext) => {
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

export const addOwner = async (event: AddedOwnerEvent, context: HandlerContext) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  // Create stub if missing — handles the setup()-time delegate-call case where
  // AddedOwner can fire before SafeSetup / ProxyCreation in the same tx.
  const safe = await ensureSafeStub(event, context);

  // Deduplicate: both AddedOwner and AddedOwnerV4 can fire for the same event
  if (safe.owners.includes(owner)) return;

  context.Safe.set({
    ...safe,
    owners: [...safe.owners, owner],
  });

  // Add safe to Owner entity
  await addSafeToOwner(owner, safeId, context);
};

export const removeOwner = async (event: RemovedOwnerEvent, context: HandlerContext) => {
  const { owner } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  // RemovedOwner on a never-seen Safe: nothing to remove. Don't stub here —
  // stubs are for state we want to preserve, and an unknown owner removal
  // produces no state worth preserving.
  if (!safe) return;

  // Deduplicate: both RemovedOwner and RemovedOwnerV4 can fire for the same event
  if (!safe.owners.includes(owner)) return;

  context.Safe.set({
    ...safe,
    owners: safe.owners.filter((o: string) => o !== owner),
  });

  // Remove safe from Owner entity
  await removeSafeFromOwner(owner, safeId, context);
};

// Dedup guard for execution events: both ExecutionSuccess and ExecutionSuccessV4
// (and Failure variants) fire for the same on-chain event because indexed/non-indexed
// versions share the same topic0 hash. Track recently processed events to skip duplicates.
//
// IMPORTANT: dedup state must be skipped during the preload pass.
// HyperIndex runs each handler TWICE per event — once for preload (to discover
// entity reads / effects so envio can batch-fetch) and once for the real
// execution pass. The `processedExecutions` Set is module-level state that
// persists across both passes. If we add to it during preload, the execution
// pass finds the key already present and bails — none of the entity writes
// commit. That manifests in production as Safes with SafeTransaction rows
// but no `safeTxHash` / `success` linkage (Safe.numberOfSuccessfulExecutions
// stays at 0), surfaced by the cross-reference integration suite.
const processedExecutions = new Set<string>();

function executionDedup(event: ExecutionEvent, isPreload: boolean): boolean {
  // Preload pass mustn't touch the dedup set — see comment above.
  // We still want both V4/non-V4 handlers to discover their reads during
  // preload, so we just no-op the dedup there.
  if (isPreload) return false;

  const key = `${event.chainId}-${event.block.number}-${event.logIndex}`;
  if (processedExecutions.has(key)) return true;
  processedExecutions.add(key);
  // Keep set bounded — clear old entries periodically
  if (processedExecutions.size > 10_000) {
    processedExecutions.clear();
  }
  return false;
}

export const executionSuccess = async (event: ExecutionEvent, context: HandlerContext, enableTraces: boolean = false) => {
  if (executionDedup(event, context.isPreload)) return;

  const { payment, txHash: safeTxHash } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  }

  // Capture nonce before incrementing
  const currentNonce = safe.nonce;

  context.Safe.set({
    ...safe,
    numberOfSuccessfulExecutions: safe.numberOfSuccessfulExecutions + 1,
    nonce: safe.nonce + 1n,
    totalGasSpent: safe.totalGasSpent + payment,
  });

  // Link success to SafeTransaction (L2: created by SafeMultiSigTransaction handler)
  const txId = `${safeId}-${currentNonce}`;
  const existingTx = await context.SafeTransaction.get(txId);
  if (existingTx) {
    context.SafeTransaction.set({ ...existingTx, success: true, safeTxHash });
    // RabbitMQ EXECUTED_MULTISIG_TRANSACTION event — realtime-only.
    await publishIfRealtime(
      context,
      buildExecutedMultisigTransaction({
        chainId,
        safeAddress: srcAddress,
        safeTxHash,
        to: existingTx.to,
        data: existingTx.data,
        success: true,
        txHash: event.transaction.hash,
      }),
    );
  } else if (enableTraces && isL1Safe(safe)) {
    // L1 Safes: no SafeMultiSigTransaction event, create from traces.
    // createL1SafeTransaction publishes the event after the entity is built.
    await createL1SafeTransaction(event, context, safe, currentNonce, true, safeTxHash);
  }
};

export const executionFailure = async (event: ExecutionEvent, context: HandlerContext, enableTraces: boolean = false) => {
  if (executionDedup(event, context.isPreload)) return;

  const { payment, txHash: safeTxHash } = event.params;
  const { srcAddress, chainId } = event;
  const safeId = chainId + "-" + srcAddress;

  const safe = await context.Safe.get(safeId);

  if (!safe) {
    //not a safe
    return;
  }

  // Capture nonce before incrementing
  const currentNonce = safe.nonce;

  context.Safe.set({
    ...safe,
    numberOfFailedExecutions: safe.numberOfFailedExecutions + 1,
    nonce: safe.nonce + 1n,
    totalGasSpent: safe.totalGasSpent + payment,
  });

  // Link failure to SafeTransaction (L2: created by SafeMultiSigTransaction handler)
  const txId = `${safeId}-${currentNonce}`;
  const existingTx = await context.SafeTransaction.get(txId);
  if (existingTx) {
    context.SafeTransaction.set({ ...existingTx, success: false, safeTxHash });
    // RabbitMQ EXECUTED_MULTISIG_TRANSACTION event — realtime-only.
    await publishIfRealtime(
      context,
      buildExecutedMultisigTransaction({
        chainId,
        safeAddress: srcAddress,
        safeTxHash,
        to: existingTx.to,
        data: existingTx.data,
        success: false,
        txHash: event.transaction.hash,
      }),
    );
  } else if (enableTraces && isL1Safe(safe)) {
    // L1 Safes: no SafeMultiSigTransaction event, create from traces.
    // createL1SafeTransaction publishes the event after the entity is built.
    await createL1SafeTransaction(event, context, safe, currentNonce, false, safeTxHash);
  }
};

// Create a SafeTransaction entity for L1 Safes by decoding execTransaction.
// Primary: decode directly from event.transaction.input (works for direct calls).
// Fallback: fetch via RPC trace_transaction (works for relayed calls).
async function createL1SafeTransaction(event: ExecutionEvent, context: HandlerContext, safe: Safe, nonce: bigint, isSuccess: boolean, safeTxHash: string) {
  const { srcAddress, chainId, block } = event;
  const { hash, input, from } = event.transaction;
  const safeId = `${chainId}-${srcAddress}`;

  try {
    // Try decoding directly from transaction input (direct execTransaction calls)
    let decoded = input ? decodeExecTransaction(input, from || "") : undefined;

    // Fallback: RPC trace_transaction for relayed transactions. Gated on
    // isRpcConfigured(chainId) — without it, getRpcUrl throws for chains
    // absent from DRPC_NETWORKS (e.g. Optimism), so unmapped chains would
    // log a noisy `[L1 TX] Failed...` on every relayed L1 tx that can't be
    // decoded from calldata directly. Gating degrades quietly instead: the
    // direct-calldata path still covers non-relayed L1 txs on those chains.
    if (!decoded && isRpcConfigured(chainId)) {
      const traceResult = await context.effect(getExecTransactionViaRpcTrace, {
        chainId,
        txHash: hash,
        safeAddress: srcAddress,
      });
      if (traceResult) {
        decoded = decodeExecTransaction(traceResult.input, traceResult.from);
      }
    }

    if (!decoded) return;

    const networkId = chainId.toString();

    context.SafeTransaction.set({
      id: `${safeId}-${nonce}`,
      safe_id: safeId,
      network_id: networkId,
      chainId,
      to: decoded.to,
      value: decoded.value,
      data: decoded.data,
      operation: BigInt(decoded.operation),
      safeTxGas: decoded.safeTxGas,
      baseGas: decoded.baseGas,
      gasPrice: decoded.gasPrice,
      gasToken: decoded.gasToken,
      refundReceiver: decoded.refundReceiver,
      signatures: decoded.signatures,
      nonce,
      msgSender: decoded.msgSender,
      threshold: safe.threshold,
      executionDate: BigInt(block.timestamp),
      txHash: hash,
      safeTxHash,
      blockNumber: block.number,
      success: isSuccess,
    });

    await incrementTransactionCount(chainId, safe.version, context);

    // RabbitMQ EXECUTED_MULTISIG_TRANSACTION event — realtime-only. Mirrors
    // the publish at the existingTx branch above; for L1 Safes this is the
    // only place the entity exists, so the publish lives next to the set().
    await publishIfRealtime(
      context,
      buildExecutedMultisigTransaction({
        chainId,
        safeAddress: srcAddress,
        safeTxHash,
        to: decoded.to,
        data: decoded.data,
        success: isSuccess,
        txHash: hash,
      }),
    );
  } catch (e) {
    console.log(`[L1 TX] Failed to create SafeTransaction for ${safeId} tx=${hash}:`, e);
  }
}