import { createEffect, S } from "envio";
import { HypersyncClient } from "@envio-dev/hypersync-client";
import { ethers } from "ethers";
import {
    SafeVersion,
    SETUP_ABI_V1_0_0,
    SETUP_ABI_V1_1_1,
    FACTORY_ABI
} from "./consts";

// Re-export SafeVersion for convenience
export type { SafeVersion } from "./consts";
// Re-export resolveVersionFromMasterCopy
export { resolveVersionFromMasterCopy } from "./consts";

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
    V0_1_0: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
    },
    V1_0_0: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
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

// Decode the setup function input data for a specific version
export function decodeSetupInput(inputData: string, version: SafeVersion): { owners: string[], threshold: number } {
    // Check if input is valid (at least 4 bytes for selector + some data)
    if (!inputData || inputData.length < 10) {
        return { owners: [], threshold: 0 };
    }

    const config = versionConfig[version];

    // Check if it's a setup call for this version
    const selector = inputData.slice(0, 10);
    if (selector.toLowerCase() !== config.selector.toLowerCase()) {
        return { owners: [], threshold: 0 };
    }

    try {
        const decoded = config.interface.decodeFunctionData("setup", inputData);
        return {
            owners: decoded[0] as string[],
            threshold: Number(decoded[1]),
        };
    } catch (e) {
        console.log(`decodeSetupInput error for ${version}:`, e);
        return { owners: [], threshold: 0 };
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

        return undefined;
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

        return undefined;
    }
);

