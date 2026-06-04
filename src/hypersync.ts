import { createEffect, S } from "envio";
import { HypersyncClient } from "@envio-dev/hypersync-client";
import { ethers } from "ethers";
import {
    SETUP_ABI_V1_0_0,
    SETUP_ABI_V1_1_1,
    FACTORY_ABI,
    EXEC_TRANSACTION_ABI,
} from "./consts";
import type { SafeVersion } from "./consts";

// Re-export SafeVersion for convenience
export type { SafeVersion } from "./consts";
// Re-export resolveVersionFromMasterCopy
export { resolveVersionFromMasterCopy } from "./consts";

// ---------------------------------------------------------------------------
// Test-mode shim — when ENVIO_TEST_MODE=1, the createEffect handlers below
// short-circuit to a fixture map (or null) instead of hitting HyperSync/RPC.
// Tests set the map via ENVIO_TEST_EFFECT_FIXTURES, a JSON object of shape:
//   { [effectName]: { [JSON.stringify(input)]: output } }
// All three Effects have nullable output schemas, so default-null is
// type-safe. Delete this block when envio ships a first-class mock hook.
// ---------------------------------------------------------------------------
const TEST_MODE = process.env.ENVIO_TEST_MODE === "1";

function lookupFixture<T>(name: string, input: unknown): T | null {
    if (!TEST_MODE) return null;
    let fixtures: Record<string, Record<string, unknown>> = {};
    try {
        fixtures = JSON.parse(process.env.ENVIO_TEST_EFFECT_FIXTURES ?? "{}");
    } catch {
        // Malformed JSON shouldn't crash the worker mid-process; treat as no
        // fixtures and return null. Tests that depended on a fixture will fail
        // their assertions naturally.
        return null;
    }
    return (fixtures[name]?.[JSON.stringify(input)] as T | undefined) ?? null;
}

// Cache for HyperSync clients per chain
const clients: Record<number, HypersyncClient> = {};

function getClient(chainId: number): HypersyncClient {
    if (!clients[chainId]) {
        clients[chainId] = new HypersyncClient({
            url: `https://${chainId}-traces.hypersync.xyz`,
            apiToken: process.env.ENVIO_API_TOKEN || "",
        });
    }
    return clients[chainId];
}

// Create ethers interfaces from ABIs
const safeInterface1_0_0 = new ethers.Interface(SETUP_ABI_V1_0_0);
const safeInterface1_1_1 = new ethers.Interface(SETUP_ABI_V1_1_1);
const factoryInterface = new ethers.Interface(FACTORY_ABI);
const multiSendInterface = new ethers.Interface(["function multiSend(bytes memory transactions)"]);
// Gelato Relay 1Balance v2 — only one function shape we care about. The Safe
// 4337-via-Gelato bundler routes the inner factory/multiSend call through
// `_data`. Mirrors STS's `gelato_relay_1_balance_v2_abi`
// (utils/abis/gelato.py) — also the only Gelato form STS decodes today.
const gelatoRelayInterface = new ethers.Interface([
    "function sponsoredCallV2(address _target, bytes _data, bytes32 _correlationId, bytes32 _r, bytes32 _vs)",
]);
// Contract Proxy Kit (CPK) factory — legacy Safe-via-CPK deployment pattern.
// Single creation entrypoint; the `data` arg carries the post-creation exec
// calldata which STS surfaces as `setupData`. Mirrors STS's
// `_decode_cpk_proxy_factory` (safe_service.py:357). The on-chain CPK
// factory ABI was lifted from safe-eth-py's CPKFactory.json.
const cpkFactoryInterface = new ethers.Interface([
    "function createProxyAndExecTransaction(address masterCopy, uint256 saltNonce, address fallbackHandler, address to, uint256 value, bytes data, uint8 operation)",
]);
// ERC-4337 EntryPoint v0.6 — `UserOperation[]` (11 fields, all gas limits as uint256).
const entryPointV06Interface = new ethers.Interface([
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
]);
// ERC-4337 EntryPoint v0.7 — `PackedUserOperation[]` (gas limits packed into bytes32).
const entryPointV07Interface = new ethers.Interface([
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
]);

// Version-specific interfaces and selectors for Safe.setup
const versionConfig = {
    V0_0_2: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
    },
    V0_1_0: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
    },
    V1_0_0: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
    },
    V1_1_0: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_1_1: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_2_0: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_3_0: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_3_0_L2: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_4_1: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_4_1_L2: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_5_0: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_5_0_L2: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    // Unknown versions - try 1.1.1 ABI as fallback
    UNKNOWN: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
} as const;

// Resolve the `setupData` blob (Safe Transaction Service's nullable
// `setupData` field) from the deployment transaction's calldata. Walks
// nested wrappers via recursion; returns the first matching inner call's
// bytes blob. Each wrapper recognised:
//
//   - SafeProxyFactory `createProxyWithNonce` (direct, the common case)
//   - Contract Proxy Kit `createProxyAndExecTransaction` (legacy CPK Safes)
//   - ERC-4337 EntryPoint `handleOps` (v0.6 UserOperation + v0.7 PackedUserOperation)
//   - Gelato Relay `sponsoredCallV2`
//   - Gnosis Safe `multiSend(bytes)` (iterates each sub-tx)
//
// Mirrors Safe Transaction Service's `_decode_creation_data`
// (safe_service.py) for all five — plus 4337 handleOps, which STS does
// NOT decode from calldata (they rely on trace data) so this is a
// calldata-only win for our indexer.
//
// Returns `undefined` when no recognised wrapper / no factory call found,
// when the inner initializer is the empty sentinel "0x", or when the
// recursion guard trips on a self-referential nested payload.
const CREATE_PROXY_WITH_NONCE_SELECTOR = factoryInterface
    .getFunction("createProxyWithNonce")!.selector.toLowerCase();
const MULTI_SEND_SELECTOR = multiSendInterface
    .getFunction("multiSend")!.selector.toLowerCase();
const GELATO_SPONSORED_CALL_V2_SELECTOR = gelatoRelayInterface
    .getFunction("sponsoredCallV2")!.selector.toLowerCase();
const ENTRY_POINT_V06_HANDLE_OPS_SELECTOR = entryPointV06Interface
    .getFunction("handleOps")!.selector.toLowerCase();
const ENTRY_POINT_V07_HANDLE_OPS_SELECTOR = entryPointV07Interface
    .getFunction("handleOps")!.selector.toLowerCase();
const CPK_CREATE_PROXY_AND_EXEC_TX_SELECTOR = cpkFactoryInterface
    .getFunction("createProxyAndExecTransaction")!.selector.toLowerCase();

// Parse the packed transactions blob from a MultiSend `multiSend(bytes)` call.
// Each sub-tx is laid out as:
//   operation(1B) + to(20B) + value(32B) + dataLength(32B) + data(dataLength B)
// concatenated with no padding. Bails on the first malformed entry.
function parseMultiSendTransactions(transactionsHex: string): Array<{ data: string }> {
    const out: Array<{ data: string }> = [];
    const hex = transactionsHex.startsWith("0x") ? transactionsHex.slice(2) : transactionsHex;
    let pos = 0;
    while (pos < hex.length) {
        // operation(1) + to(20) + value(32) + dataLength(32) = 85 bytes = 170 hex chars
        if (pos + 170 > hex.length) break;
        pos += 2 + 40 + 64; // skip operation, to, value
        const dataLength = parseInt(hex.slice(pos, pos + 64), 16);
        pos += 64;
        if (!Number.isFinite(dataLength) || dataLength < 0) break;
        const dataHexChars = 2 * dataLength;
        if (pos + dataHexChars > hex.length) break;
        out.push({ data: "0x" + hex.slice(pos, pos + dataHexChars) });
        pos += dataHexChars;
    }
    return out;
}

// Cap on how deep nested MultiSend will unwind. Real-world deployments use
// at most 1-2 levels (occasionally MultiSendCallOnly inside a delegate-call
// MultiSend). The guard exists to bound a hostile self-referential payload
// — every recursive call costs work even when it ultimately returns
// undefined.
const MAX_MULTISEND_DECODE_DEPTH = 8;

export function decodeCreateProxyWithNonceInitializer(
    inputData: string | undefined,
): string | undefined {
    return decodeCreateProxyWithNonceInitializerInner(inputData, 0);
}

function decodeCreateProxyWithNonceInitializerInner(
    inputData: string | undefined,
    depth: number,
): string | undefined {
    if (depth > MAX_MULTISEND_DECODE_DEPTH) return undefined;
    if (!inputData || inputData.length < 10) return undefined;
    const selector = inputData.slice(0, 10).toLowerCase();

    // Direct factory call — the common case.
    if (selector === CREATE_PROXY_WITH_NONCE_SELECTOR) {
        try {
            const decoded = factoryInterface.decodeFunctionData(
                "createProxyWithNonce",
                inputData,
            );
            // (mastercopy, initializer, saltNonce) — index 1 is the bytes blob.
            const initializer = decoded[1] as string | undefined;
            // Empty initializer means the deployer skipped setup() — record as
            // null rather than the bare "0x" so it round-trips cleanly with Safe
            // TX Service's `setupData: null` representation.
            if (!initializer || initializer === "0x") return undefined;
            return initializer;
        } catch {
            return undefined;
        }
    }

    // Contract Proxy Kit factory — legacy Safe-via-CPK deployment. The bytes
    // `data` arg (index 5) carries the post-creation exec calldata that STS
    // surfaces as setupData (`_decode_cpk_proxy_factory`, safe_service.py:357).
    // Terminal peel: no recursion needed — the `data` is itself the setupData
    // value we record, even when it's a call to a setup helper contract.
    if (selector === CPK_CREATE_PROXY_AND_EXEC_TX_SELECTOR) {
        try {
            const decoded = cpkFactoryInterface.decodeFunctionData(
                "createProxyAndExecTransaction",
                inputData,
            );
            // (masterCopy, saltNonce, fallbackHandler, to, value, data, operation)
            const data = decoded[5] as string | undefined;
            if (!data || data === "0x") return undefined;
            return data;
        } catch {
            return undefined;
        }
    }

    // ERC-4337 EntryPoint `handleOps` — for each UserOperation in the batch,
    // `initCode` is the canonical "factory(20B) + factoryCalldata" packing.
    // Strip the 20-byte factory addr and recurse on the rest. STS doesn't
    // peel this from calldata (they rely on trace data); we can do better
    // since handleOps calldata is self-describing.
    //
    // v0.6 and v0.7 use the same `initCode` convention but different
    // UserOperation struct shapes (and thus different selectors). Try each
    // ABI; bail to undefined if neither decodes.
    if (
        selector === ENTRY_POINT_V06_HANDLE_OPS_SELECTOR ||
        selector === ENTRY_POINT_V07_HANDLE_OPS_SELECTOR
    ) {
        const iface =
            selector === ENTRY_POINT_V06_HANDLE_OPS_SELECTOR
                ? entryPointV06Interface
                : entryPointV07Interface;
        try {
            const decoded = iface.decodeFunctionData("handleOps", inputData);
            // ops[] is index 0; each op's `initCode` is field index 2 in both v0.6/v0.7.
            const ops = decoded[0] as Array<{ initCode?: string } & ReadonlyArray<unknown>>;
            for (const op of ops) {
                const initCode = (op.initCode ?? op[2]) as string | undefined;
                if (!initCode || initCode.length < 2 + 40) continue; // need at least factory addr
                // Strip the leading 20-byte factory address; the remainder is
                // the factory calldata itself (createProxyWithNonce / multiSend / ...).
                const factoryCalldata = "0x" + initCode.slice(2 + 40);
                const result = decodeCreateProxyWithNonceInitializerInner(
                    factoryCalldata,
                    depth + 1,
                );
                if (result) return result;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    // Gelato Relay 1Balance v2 wrap — the bundler routes the actual deployment
    // call through `_data`. Recurse so a Gelato-wrapped MultiSend-wrapped
    // factory call still unwinds. STS's `_decode_creation_data` peels Gelato
    // first; we cover the same composition via plain recursion.
    if (selector === GELATO_SPONSORED_CALL_V2_SELECTOR) {
        try {
            const decoded = gelatoRelayInterface.decodeFunctionData(
                "sponsoredCallV2",
                inputData,
            );
            // (_target, _data, _correlationId, _r, _vs) — index 1 is the inner calldata.
            const innerData = decoded[1] as string | undefined;
            return decodeCreateProxyWithNonceInitializerInner(innerData, depth + 1);
        } catch {
            return undefined;
        }
    }

    // MultiSend wrap — peel one layer. Recurse into each sub-tx's data so
    // nested wraps (MultiSend inside MultiSend, rare but legal) unwind too.
    if (selector === MULTI_SEND_SELECTOR) {
        try {
            const decoded = multiSendInterface.decodeFunctionData("multiSend", inputData);
            const transactionsBlob = decoded[0] as string;
            for (const sub of parseMultiSendTransactions(transactionsBlob)) {
                const result = decodeCreateProxyWithNonceInitializerInner(
                    sub.data,
                    depth + 1,
                );
                if (result) return result;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    return undefined;
}

// Decode the setup function input data for a specific version. The v1.1.1+
// ABI exposes a fallbackHandler at index 4; the v1.0.0 ABI doesn't have it
// (returned as null — "legacy, unknown").
export function decodeSetupInput(
    inputData: string,
    version: SafeVersion,
): { owners: string[]; threshold: number; fallbackHandler: string | null } {
    const empty = { owners: [] as string[], threshold: 0, fallbackHandler: null };

    // Check if input is valid (at least 4 bytes for selector + some data)
    if (!inputData || inputData.length < 10) {
        return empty;
    }

    const config = versionConfig[version];

    // Check if it's a setup call for this version
    const selector = inputData.slice(0, 10);
    if (selector.toLowerCase() !== config.selector.toLowerCase()) {
        return empty;
    }

    try {
        const decoded = config.interface.decodeFunctionData("setup", inputData);
        // The v1.1.1+ ABI inserts `fallbackHandler` between `data` and
        // `paymentToken` (index 4). The v1.0.0 ABI is the same setup function
        // signature minus the fallbackHandler, so its index 4 is paymentToken
        // — only extract fallbackHandler when the v1.1.1+ ABI was used.
        const fallbackHandler =
            config.interface === safeInterface1_1_1
                ? ((decoded[4] as string) ?? null)
                : null;
        // ethers v6 returns a Result instance for tuple-shaped params (like
        // `address[]`). It's array-like but isn't a plain Array, so envio's
        // entity-serialisation path can choke on it. Spread to a flat
        // string[] before handing it back.
        return {
            owners: [...(decoded[0] as Iterable<string>)],
            threshold: Number(decoded[1]),
            fallbackHandler,
        };
    } catch (e) {
        console.log(`decodeSetupInput error for ${version}:`, e);
        return empty;
    }
}

// Effect to fetch trace input data for a proxy setup call
export const getSetupTrace = createEffect(
    {
        name: "getSetupTrace",
        input: S.schema({
            chainId: S.number,
            blockNumber: S.number,
            proxyAddress: S.string,
            version: S.string as unknown as S.Schema<SafeVersion>,
        }),
        output: S.nullable(S.string),
        rateLimit: false,
        cache: true,
    },
    async ({ input }) => {
        if (TEST_MODE) return lookupFixture<string>("getSetupTrace", input);

        const client = getClient(input.chainId);
        const config = versionConfig[input.version];

        const data = await client.get({
            fromBlock: input.blockNumber,
            toBlock: input.blockNumber + 1,
            traces: [{ to: [input.proxyAddress], callType: ["call", "delegatecall"] }],
            fieldSelection: { trace: ["Input"] },
        });

        // Find the trace with the setup function call for this version
        for (const trace of data.data.traces) {
            if (trace.input && trace.input.length > 10) {
                const selector = trace.input.slice(0, 10);
                if (selector.toLowerCase() === config.selector.toLowerCase()) {
                    return trace.input;
                }
            }
        }

        return null;
    }
);

// ------------------------------------------------------------------------------------
// Master copy detection for distinguishing Safe versions
// ------------------------------------------------------------------------------------

// Effect to fetch the masterCopy used in a ProxyFactory / GnosisSafeProxyFactory call
export const getMasterCopyFromTrace = createEffect(
    {
        name: "getMasterCopyFromTrace",
        input: S.schema({
            chainId: S.number,
            blockNumber: S.number,
            txHash: S.string,
            factoryAddress: S.string,
        }),
        output: S.nullable(S.string),
        rateLimit: false,
        cache: true,
    },
    async ({ input }) => {
        if (TEST_MODE) return lookupFixture<string>("getMasterCopyFromTrace", input);

        const client = getClient(input.chainId);

        const data = await client.get({
            fromBlock: input.blockNumber,
            toBlock: input.blockNumber + 1,
            traces: [
                {
                    to: [input.factoryAddress],
                    callType: ["call", "delegatecall"],
                },
            ],
            fieldSelection: { trace: ["Input", "TransactionHash", "To", "From", "CallType"] },
        });

        const totalTraces = data.data.traces.length;
        let matchingTxTraces = 0;
        let parsedTraces = 0;

        for (const trace of data.data.traces) {
            // Restrict to this specific transaction
            if (!trace.transactionHash || trace.transactionHash.toLowerCase() !== input.txHash.toLowerCase()) {
                continue;
            }
            matchingTxTraces++;

            if (!trace.input || trace.input.length < 10) continue;

            try {
                const parsed = factoryInterface.parseTransaction({ data: trace.input });
                if (!parsed) continue;
                parsedTraces++;

                if (parsed.name === "createProxy" || parsed.name === "createProxyWithNonce") {
                    const masterCopy = (parsed.args[0] as string) || "";
                    if (masterCopy && masterCopy !== "0x0000000000000000000000000000000000000000") {
                        return masterCopy;
                    }
                }
            } catch {
                // Ignore traces that don't match the factory ABI
                continue;
            }
        }

        // Debug logging when no masterCopy found
        console.log(`[TRACE DEBUG] chainId=${input.chainId} block=${input.blockNumber} txHash=${input.txHash.slice(0, 10)}... factory=${input.factoryAddress.slice(0, 10)}... | totalTraces=${totalTraces} matchingTx=${matchingTxTraces} parsed=${parsedTraces}`);

        return null;
    }
);

// ------------------------------------------------------------------------------------
// execTransaction decoding for L1 Safe transaction decoding
// ------------------------------------------------------------------------------------

const execTransactionInterface = new ethers.Interface(EXEC_TRANSACTION_ABI);
const execTransactionSelector = execTransactionInterface.getFunction("execTransaction")!.selector;

// ------------------------------------------------------------------------------------
// RPC trace fallback for chains without HyperSync traces support
// ------------------------------------------------------------------------------------

// DRPC network slug per chain — drpc keys on a network name in the URL,
// not the chain id. Add chains here as they're enabled in config.yaml.
const DRPC_NETWORKS: Record<number, string> = {
    1: "ethereum",
    100: "gnosis",
    480: "worldchain",
};

// Build a drpc.org URL for the chain. Throws (loudly) when prerequisites
// aren't met — this is deliberate: RPC-backfill is required for orphan
// masterCopy resolution and L1 trace fallbacks, and silently degrading to
// public RPCs would mask the requirement and let stats / coverage drift.
// Sign up at https://drpc.org/ and export ENVIO_DRPC_API_KEY.
function getRpcUrl(chainId: number): string {
    const network = DRPC_NETWORKS[chainId];
    if (!network) {
        throw new Error(
            `RPC endpoint not configured for chainId=${chainId}. ` +
            `Add the chain to DRPC_NETWORKS in src/hypersync.ts.`
        );
    }
    const apiKey = process.env.ENVIO_DRPC_API_KEY;
    if (!apiKey) {
        throw new Error(
            `ENVIO_DRPC_API_KEY is required but not set. ` +
            `Sign up at https://drpc.org/ and export your API key as ` +
            `ENVIO_DRPC_API_KEY=<your-key>. ` +
            `Used for orphan-Safe masterCopy backfill (eth_getStorageAt) ` +
            `and L1 trace fallbacks (trace_transaction).`
        );
    }
    return `https://lb.drpc.org/ogrpc?network=${network}&dkey=${apiKey}`;
}

// Fetch execTransaction calldata via RPC trace_transaction for relayed txs
export const getExecTransactionViaRpcTrace = createEffect(
    {
        name: "getExecTransactionViaRpcTrace",
        input: S.schema({
            chainId: S.number,
            txHash: S.string,
            safeAddress: S.string,
        }),
        output: S.nullable(S.schema({
            input: S.string,
            from: S.string,
        })),
        rateLimit: false,
        cache: true,
    },
    async ({ input }) => {
        if (TEST_MODE) {
            return lookupFixture<{ input: string; from: string }>(
                "getExecTransactionViaRpcTrace",
                input,
            );
        }

        // Propagates a clear error if ENVIO_DRPC_API_KEY isn't set.
        const rpcUrl = getRpcUrl(input.chainId);

        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "trace_transaction",
            params: [input.txHash],
        });

        const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });

        if (!res.ok) {
            console.log(`[RPC TRACE] trace_transaction HTTP ${res.status} for tx=${input.txHash}`);
            return null;
        }

        const json = await res.json() as {
            result?: Array<{
                action?: { input?: string; from?: string; to?: string; callType?: string };
            }>;
            error?: { message?: string };
        };

        if (json.error) {
            console.log(`[RPC TRACE] trace_transaction RPC error for tx=${input.txHash}: ${json.error.message}`);
            return null;
        }

        if (!json.result) return null;

        const safeAddr = input.safeAddress.toLowerCase();

        for (const trace of json.result) {
            const action = trace.action;
            if (!action || !action.input || action.input.length < 10) continue;
            if (action.callType !== "call") continue;
            if (action.to?.toLowerCase() !== safeAddr) continue;

            const selector = action.input.slice(0, 10);
            if (selector.toLowerCase() === execTransactionSelector.toLowerCase()) {
                return {
                    input: action.input,
                    from: action.from || "",
                };
            }
        }

        return null;
    }
);

export type ExecTransactionData = {
    to: string;
    value: bigint;
    data: string;
    operation: number;
    safeTxGas: bigint;
    baseGas: bigint;
    gasPrice: bigint;
    gasToken: string;
    refundReceiver: string;
    signatures: string;
    msgSender: string;
};

// Decode execTransaction calldata
export function decodeExecTransaction(inputData: string, from: string): ExecTransactionData | undefined {
    if (!inputData || inputData.length < 10) return undefined;

    const selector = inputData.slice(0, 10);
    if (selector.toLowerCase() !== execTransactionSelector.toLowerCase()) return undefined;

    try {
        const decoded = execTransactionInterface.decodeFunctionData("execTransaction", inputData);
        return {
            to: decoded[0] as string,
            value: BigInt(decoded[1]),
            data: decoded[2] as string,
            operation: Number(decoded[3]),
            safeTxGas: BigInt(decoded[4]),
            baseGas: BigInt(decoded[5]),
            gasPrice: BigInt(decoded[6]),
            gasToken: decoded[7] as string,
            refundReceiver: decoded[8] as string,
            signatures: decoded[9] as string,
            msgSender: from,
        };
    } catch (e) {
        console.log("decodeExecTransaction error:", e);
        return undefined;
    }
}

// ------------------------------------------------------------------------------------
// Orphan masterCopy backfill via RPC eth_getStorageAt(slot 0)
// ------------------------------------------------------------------------------------
//
// Safe proxies (SafeProxy.sol) store the singleton/masterCopy address at storage
// slot 0 — declared as the first contract variable explicitly so it sits at a
// known offset for the delegatecall trampoline. eth_getStorageAt at slot 0
// returns the singleton, regardless of whether we ever saw the deploying
// factory's ProxyCreation event.
//
// Use case: 3rd-party-factory deployments (Circles deployer etc.) where
// SafeSetup fires on the new Safe (we catch it via wildcard) but the factory
// isn't in our subscriptions list, so ProxyCreation never reaches us and
// masterCopy stays null. ~15K such Safes observed in the live indexer
// (≈2% of V1.3.0 Safes), almost all on Gnosis.
//
// Cached on (chainId, safeAddress): slot 0 only changes on intentional
// ChangedMasterCopy (rare) — which we already index and would apply as a
// regular update. Cache hit means zero RPC traffic on replays.
const SLOT_ZERO_HEX = "0x0";

export const getSafeMasterCopyViaRpc = createEffect(
    {
        name: "getSafeMasterCopyViaRpc",
        input: S.schema({
            chainId: S.number,
            safeAddress: S.string,
        }),
        output: S.nullable(S.string),
        rateLimit: false,
        cache: true,
    },
    async ({ input }) => {
        if (TEST_MODE) return lookupFixture<string>("getSafeMasterCopyViaRpc", input);

        // Propagates a clear error if ENVIO_DRPC_API_KEY isn't set —
        // intentional: see getRpcUrl docstring.
        const rpcUrl = getRpcUrl(input.chainId);

        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getStorageAt",
            params: [input.safeAddress, SLOT_ZERO_HEX, "latest"],
        });

        let res: Response;
        try {
            res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });
        } catch (e) {
            console.log(`[RPC SLOT0] fetch error for safe=${input.safeAddress} chain=${input.chainId}:`, e);
            return null;
        }

        if (!res.ok) {
            console.log(`[RPC SLOT0] HTTP ${res.status} for safe=${input.safeAddress} chain=${input.chainId}`);
            return null;
        }

        const json = (await res.json()) as {
            result?: string;
            error?: { message?: string };
        };

        if (json.error) {
            console.log(`[RPC SLOT0] RPC error for safe=${input.safeAddress} chain=${input.chainId}: ${json.error.message}`);
            return null;
        }
        if (!json.result) return null;

        // Storage slot is 32 bytes, address right-aligned. Expected format:
        // "0x" + 24 hex zeros + 40 hex chars (= 66 chars total).
        const hex = json.result;
        if (!hex.startsWith("0x") || hex.length !== 66) return null;
        const addr = "0x" + hex.slice(26);
        // A zero singleton means the slot was never written (or the address
        // isn't actually a Safe proxy) — don't surface that as a masterCopy.
        if (addr === "0x" + "0".repeat(40)) return null;
        return addr.toLowerCase();
    }
);

// ------------------------------------------------------------------------------------
// `creator` resolution via trace_transaction — matches Safe Transaction Service
// `safe_service.py:132`: `creator = (parent_internal_tx or creation_ethereum_tx)._from`.
//
// Walk the deployment tx's trace tree to find the CREATE / CREATE2 frame for
// the safe address, then return its parent frame's `from`. For direct
// deployments this is the user EOA (== `tx.from`). For wrapped deployments
// (4337 EntryPoint, Gelato Relay, MultiSend, …) it's the contract that
// directly called the factory — e.g. SenderCreator for 4337 v0.7.
//
// Gated to chains with real trace support (Ethereum mainnet + Gnosis) in
// the calling handler. Other chains fall back to `creationTxFrom` — same
// fallback Safe TX Service uses on chains where they treat traces as
// simulated.
// ------------------------------------------------------------------------------------

// Parity/OpenEthereum-style trace shape returned by `trace_transaction`.
// CREATE/CREATE2 frames carry the new address in `result.address`; CALL
// frames carry the target in `action.to`. The `traceAddress` path lets us
// reconstruct parent/child relationships without re-walking the tree.
export type TraceTransactionItem = {
    action?: { from?: string; to?: string; callType?: string };
    result?: { address?: string } | null;
    traceAddress?: number[];
    type?: string; // "call" | "create" | "suicide" | "reward"
};

// Pure helper — given a flat `trace_transaction` result, find the CREATE
// frame for `safeAddress` and return the immediate parent frame's `from`.
// Returns null if no CREATE found or no parent (CREATE was the root frame).
//
// Exposed for unit testing — the runtime effect just wires this up to RPC.
export function findCreatorFromTraceList(
    traces: TraceTransactionItem[],
    safeAddress: string,
): string | null {
    const safeAddr = safeAddress.toLowerCase();

    // Find the CREATE/CREATE2 frame whose result.address is our safe.
    let createFrame: TraceTransactionItem | undefined;
    for (const t of traces) {
        if (t.type !== "create" && t.type !== "create2") continue;
        const created = t.result?.address?.toLowerCase();
        if (created === safeAddr) {
            createFrame = t;
            break;
        }
    }
    if (!createFrame || !createFrame.traceAddress) return null;

    // CREATE is the root frame — no parent. Caller falls back to tx.from.
    if (createFrame.traceAddress.length === 0) return null;

    // Parent's traceAddress is the CREATE's path with the last index dropped.
    const parentPath = createFrame.traceAddress.slice(0, -1);
    for (const t of traces) {
        if (!t.traceAddress) continue;
        if (t.traceAddress.length !== parentPath.length) continue;
        let match = true;
        for (let i = 0; i < parentPath.length; i++) {
            if (t.traceAddress[i] !== parentPath[i]) {
                match = false;
                break;
            }
        }
        if (match) {
            return t.action?.from?.toLowerCase() ?? null;
        }
    }
    return null;
}

export const getSafeCreatorViaTraceTransaction = createEffect(
    {
        name: "getSafeCreatorViaTraceTransaction",
        input: S.schema({
            chainId: S.number,
            txHash: S.string,
            safeAddress: S.string,
        }),
        output: S.nullable(S.string),
        rateLimit: false,
        cache: true,
    },
    async ({ input }) => {
        if (TEST_MODE) return lookupFixture<string>("getSafeCreatorViaTraceTransaction", input);

        // Propagates a clear error if ENVIO_DRPC_API_KEY isn't set —
        // intentional: see getRpcUrl docstring.
        const rpcUrl = getRpcUrl(input.chainId);

        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "trace_transaction",
            params: [input.txHash],
        });

        let res: Response;
        try {
            res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });
        } catch (e) {
            console.log(
                `[RPC CREATOR-TRACE] fetch error for tx=${input.txHash} chain=${input.chainId}:`,
                e,
            );
            return null;
        }

        if (!res.ok) {
            console.log(
                `[RPC CREATOR-TRACE] HTTP ${res.status} for tx=${input.txHash} chain=${input.chainId}`,
            );
            return null;
        }

        const json = (await res.json()) as {
            result?: TraceTransactionItem[];
            error?: { message?: string };
        };
        if (json.error) {
            console.log(
                `[RPC CREATOR-TRACE] RPC error for tx=${input.txHash} chain=${input.chainId}: ${json.error.message}`,
            );
            return null;
        }
        if (!json.result) return null;

        return findCreatorFromTraceList(json.result, input.safeAddress);
    }
);

// Chains where we run the trace-walk for `creator` resolution. Other chains
// fall back to `creationTxFrom` (= tx.from). Matches Safe TX Service's
// per-chain trace support: they use real traces on Ethereum mainnet and
// Gnosis (Erigon / Nethermind both expose trace_transaction on Gnosis), and
// simulated traces (= tx.from fallback) elsewhere. Extend per chain as
// new networks are enabled and trace support is validated.
export const CREATOR_TRACE_CHAINS = new Set<number>([
    1,   // Ethereum mainnet
    100, // Gnosis
]);

