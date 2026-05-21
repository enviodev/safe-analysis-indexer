import { encodeAbiParameters, keccak256, toBytes, zeroAddress } from "viem";

// Monotonically increasing block + logIndex counters so events line up in a
// sensible order without callers having to think about it. Each test can call
// `resetBlockCounter()` if it wants deterministic numbers.
let blockNumber = 1;
let blockTimestamp = 1_700_000_000;
let logIndex = 0;

export function resetBlockCounter(): void {
  blockNumber = 1;
  blockTimestamp = 1_700_000_000;
  logIndex = 0;
}

export function nextBlock(): {
  number: number;
  timestamp: number;
  hash: string;
} {
  blockNumber += 1;
  blockTimestamp += 12;
  logIndex = 0;
  return {
    number: blockNumber,
    timestamp: blockTimestamp,
    hash: keccak256(toBytes(`block-${blockNumber}`)),
  };
}

export function nextLogIndex(): number {
  return logIndex++;
}

// Build a default block stub if the caller didn't provide one — auto-advances.
function autoBlock(block?: { number?: number; timestamp?: number; hash?: string }) {
  if (block?.number != null) {
    return {
      number: block.number,
      timestamp: block.timestamp ?? 1_700_000_000 + block.number * 12,
      hash: block.hash ?? keccak256(toBytes(`block-${block.number}`)),
    };
  }
  return nextBlock();
}

// Default tx stub. Hash is deterministically derived from the resolved
// (blockNumber, logIndex) the caller passes — NOT from module-level counters,
// which can drift between when logIndex is captured and when autoTx runs (the
// intervening autoBlock call may have advanced `blockNumber` and reset
// `logIndex`).
function autoTx(
  tx: { hash?: string; input?: string; from?: string } | undefined,
  blockNumberArg: number,
  logIndexArg: number,
) {
  return {
    hash: tx?.hash ?? keccak256(toBytes(`tx-${blockNumberArg}-${logIndexArg}`)),
    input: tx?.input ?? "0x",
    from: tx?.from ?? zeroAddress,
  };
}

// ---------------------------------------------------------------------------
// ProxyCreation — pre-1.3.0 (no `singleton` param)
// ---------------------------------------------------------------------------
type ProxyCreationPre = {
  proxy: `0x${string}`;
  factoryAddress?: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string; input?: string; from?: string };
  logIndex?: number;
};

export function simulateProxyCreationPre1_3_0(args: ProxyCreationPre) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeProxyPre1_3_0" as const,
    event: "ProxyCreation" as const,
    srcAddress: args.factoryAddress ?? (zeroAddress as `0x${string}`),
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { proxy: args.proxy },
  };
}

// ---------------------------------------------------------------------------
// ProxyCreation — modern (v1.3.0, v1.4.1, v1.5.0; `singleton` param present)
// ---------------------------------------------------------------------------
type ProxyCreationModern = {
  contract: "GnosisSafeProxy1_3_0" | "GnosisSafeProxy1_4_1" | "GnosisSafeProxy1_5_0";
  proxy: `0x${string}`;
  singleton: `0x${string}`;
  factoryAddress?: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string; input?: string; from?: string };
  logIndex?: number;
};

export function simulateProxyCreationModern(args: ProxyCreationModern) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: args.contract,
    event: "ProxyCreation" as const,
    srcAddress: args.factoryAddress ?? (zeroAddress as `0x${string}`),
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { proxy: args.proxy, singleton: args.singleton },
  };
}

// ---------------------------------------------------------------------------
// SafeSetup (GnosisSafeL2, wildcard)
// ---------------------------------------------------------------------------
type SafeSetup = {
  safeAddress: `0x${string}`;
  owners: `0x${string}`[];
  threshold: bigint;
  initiator?: `0x${string}`;
  initializer?: `0x${string}`;
  fallbackHandler?: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
};

export function simulateSafeSetup(args: SafeSetup) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event: "SafeSetup" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: {
      initiator: args.initiator ?? (zeroAddress as `0x${string}`),
      owners: args.owners,
      threshold: args.threshold,
      initializer: args.initializer ?? (zeroAddress as `0x${string}`),
      fallbackHandler: args.fallbackHandler ?? (zeroAddress as `0x${string}`),
    },
  };
}

// ---------------------------------------------------------------------------
// AddedOwner / AddedOwnerV4
// ---------------------------------------------------------------------------
type AddedOwnerArgs = {
  contract: "SafePre1_3_0" | "GnosisSafeL2";
  safeAddress: `0x${string}`;
  owner: `0x${string}`;
  v4?: boolean; // GnosisSafeL2 only
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
};

export function simulateAddedOwner(args: AddedOwnerArgs) {
  const event = args.v4 ? "AddedOwnerV4" : "AddedOwner";
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: args.contract,
    event,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { owner: args.owner },
  } as const;
}

// ---------------------------------------------------------------------------
// RemovedOwner / RemovedOwnerV4
// ---------------------------------------------------------------------------
type RemovedOwnerArgs = AddedOwnerArgs;

export function simulateRemovedOwner(args: RemovedOwnerArgs) {
  const event = args.v4 ? "RemovedOwnerV4" : "RemovedOwner";
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: args.contract,
    event,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { owner: args.owner },
  } as const;
}

// ---------------------------------------------------------------------------
// ChangedThreshold (SafePre1_3_0 only — modern ABIs are not subscribed)
// ---------------------------------------------------------------------------
export function simulateChangedThreshold(args: {
  safeAddress: `0x${string}`;
  threshold: bigint;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "SafePre1_3_0" as const,
    event: "ChangedThreshold" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { threshold: args.threshold },
  };
}

// ---------------------------------------------------------------------------
// ChangedMasterCopy (GnosisSafeL2, wildcard)
// ---------------------------------------------------------------------------
export function simulateChangedMasterCopy(args: {
  safeAddress: `0x${string}`;
  singleton: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event: "ChangedMasterCopy" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { singleton: args.singleton },
  };
}

// ---------------------------------------------------------------------------
// ChangedFallbackHandler (GnosisSafeL2, wildcard) — emitted when the Safe's
// fallback handler is rotated post-creation.
// ---------------------------------------------------------------------------
export function simulateChangedFallbackHandler(args: {
  safeAddress: `0x${string}`;
  handler: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event: "ChangedFallbackHandler" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { handler: args.handler },
  };
}

// ---------------------------------------------------------------------------
// ChangedGuard / ChangedGuardV4 (GnosisSafeL2, wildcard) — emitted when the
// Safe rotates its transaction guard. Two variants share topic0:
//   v1.3.0:  ChangedGuard(address guard)            -- non-indexed
//   v1.4.0+: ChangedGuard(address indexed guard)    -- indexed, named V4.
// ---------------------------------------------------------------------------
export function simulateChangedGuard(args: {
  safeAddress: `0x${string}`;
  guard: `0x${string}`;
  v4?: boolean;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  const event = args.v4 ? "ChangedGuardV4" : "ChangedGuard";
  return {
    contract: "GnosisSafeL2" as const,
    event,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { guard: args.guard },
  } as const;
}

// ---------------------------------------------------------------------------
// SafeMultiSigTransaction (GnosisSafeL2, wildcard) — additionalInfo is the
// ABI-encoded (uint256 nonce, address msgSender, uint256 threshold) tuple.
// ---------------------------------------------------------------------------
export function encodeAdditionalInfo(
  nonce: bigint,
  msgSender: `0x${string}`,
  threshold: bigint,
): `0x${string}` {
  return encodeAbiParameters(
    [
      { type: "uint256", name: "nonce" },
      { type: "address", name: "msgSender" },
      { type: "uint256", name: "threshold" },
    ],
    [nonce, msgSender, threshold],
  );
}

export function simulateSafeMultiSigTransaction(args: {
  safeAddress: `0x${string}`;
  nonce: bigint;
  msgSender: `0x${string}`;
  threshold: bigint;
  to?: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  operation?: bigint;
  safeTxGas?: bigint;
  baseGas?: bigint;
  gasPrice?: bigint;
  gasToken?: `0x${string}`;
  refundReceiver?: `0x${string}`;
  signatures?: `0x${string}`;
  additionalInfo?: `0x${string}`;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event: "SafeMultiSigTransaction" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: {
      to: args.to ?? (zeroAddress as `0x${string}`),
      value: args.value ?? 0n,
      data: args.data ?? ("0x" as `0x${string}`),
      operation: args.operation ?? 0n,
      safeTxGas: args.safeTxGas ?? 0n,
      baseGas: args.baseGas ?? 0n,
      gasPrice: args.gasPrice ?? 0n,
      gasToken: args.gasToken ?? (zeroAddress as `0x${string}`),
      refundReceiver: args.refundReceiver ?? (zeroAddress as `0x${string}`),
      signatures: args.signatures ?? ("0x" as `0x${string}`),
      additionalInfo:
        args.additionalInfo ?? encodeAdditionalInfo(args.nonce, args.msgSender, args.threshold),
    },
  };
}

// ---------------------------------------------------------------------------
// SafeModuleTransaction (GnosisSafeL2, wildcard)
// ---------------------------------------------------------------------------
export function simulateSafeModuleTransaction(args: {
  safeAddress: `0x${string}`;
  module: `0x${string}`;
  to?: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  operation?: number;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event: "SafeModuleTransaction" as const,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: {
      module: args.module,
      to: args.to ?? (zeroAddress as `0x${string}`),
      value: args.value ?? 0n,
      data: args.data ?? ("0x" as `0x${string}`),
      operation: args.operation ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// ExecutionSuccess / ExecutionSuccessV4 / ExecutionFailure / ExecutionFailureV4
// ---------------------------------------------------------------------------
type ExecutionArgs = {
  safeAddress: `0x${string}`;
  txHash?: `0x${string}`;
  payment?: bigint;
  v4?: boolean;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string; input?: string; from?: string };
  logIndex?: number;
};

function buildExecution(eventBase: "ExecutionSuccess" | "ExecutionFailure", args: ExecutionArgs) {
  const event = args.v4 ? `${eventBase}V4` : eventBase;
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "GnosisSafeL2" as const,
    event,
    srcAddress: args.safeAddress,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: {
      txHash: args.txHash ?? ("0x" + "0".repeat(64)) as `0x${string}`,
      payment: args.payment ?? 0n,
    },
  } as const;
}

export const simulateExecutionSuccess = (args: ExecutionArgs) => buildExecution("ExecutionSuccess", args);
export const simulateExecutionFailure = (args: ExecutionArgs) => buildExecution("ExecutionFailure", args);

// ---------------------------------------------------------------------------
// SafeErc20Watcher.Transfer (wildcard ERC20 Transfer)
// ---------------------------------------------------------------------------
export function simulateErc20Transfer(args: {
  token: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  block?: { number?: number; timestamp?: number; hash?: string };
  tx?: { hash?: string };
  logIndex?: number;
}) {
  const block = autoBlock(args.block);
  const li = args.logIndex ?? nextLogIndex();
  return {
    contract: "SafeErc20Watcher" as const,
    event: "Transfer" as const,
    srcAddress: args.token,
    logIndex: li,
    block,
    transaction: autoTx(args.tx, block.number, li),
    params: { from: args.from, to: args.to, value: args.value },
  };
}
