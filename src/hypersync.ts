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
    V1_4_1: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    V1_5_0: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
    // Unknown versions - try 1.1.1 ABI as fallback
    UNKNOWN: {
        interface: safeInterface1_1_1,
        selector: safeInterface1_1_1.getFunction("setup")!.selector,
    },
} as const;

// Decode a SafeProxyFactory `createProxyWithNonce(address,bytes,uint256)`
// call from the deployment transaction's calldata. Returns the `initializer`
// param (i.e. setupData) when `data` is a direct factory call. Returns null
// for any other shape — wrapped patterns (MultiSend, Gelato Relay, ERC-4337
// handleOps, etc.) are explicitly out of scope here; those land as null and
// can be added incrementally per wrapper.
//
// Same selector across v1.3.0 / v1.4.1 / v1.5.0 — the function signature
// (`createProxyWithNonce(address,bytes,uint256)`) didn't change, only the
// emitted ProxyCreation event shape did, so one decoder covers all three.
const CREATE_PROXY_WITH_NONCE_SELECTOR = factoryInterface
    .getFunction("createProxyWithNonce")!.selector;

export function decodeCreateProxyWithNonceInitializer(
    inputData: string | undefined,
): string | undefined {
    if (!inputData || inputData.length < 10) return undefined;
    const selector = inputData.slice(0, 10).toLowerCase();
    if (selector !== CREATE_PROXY_WITH_NONCE_SELECTOR.toLowerCase()) return undefined;
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

