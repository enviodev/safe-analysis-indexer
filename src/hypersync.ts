import { createEffect, S } from "envio";
import { HypersyncClient } from "@envio-dev/hypersync-client";
import { ethers } from "ethers";

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

// Safe 1.0.0 setup function ABI
const SETUP_ABI = [
    "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address paymentToken, uint256 payment, address payable paymentReceiver)"
];
const safeInterface = new ethers.Interface(SETUP_ABI);

// Setup function selector
const SETUP_SELECTOR = safeInterface.getFunction("setup")!.selector;

// Decode the setup function input data
export function decodeSetupInput(inputData: string): { owners: string[], threshold: number } {
    // Check if input is valid (at least 4 bytes for selector + some data)
    if (!inputData || inputData.length < 10) {
        return { owners: [], threshold: 0 };
    }

    // Check if it's a setup call
    const selector = inputData.slice(0, 10);
    if (selector.toLowerCase() !== SETUP_SELECTOR.toLowerCase()) {
        return { owners: [], threshold: 0 };
    }

    try {
        const decoded = safeInterface.decodeFunctionData("setup", inputData);
        return {
            owners: decoded[0] as string[],
            threshold: Number(decoded[1]),
        };
    } catch (e) {
        console.log("decodeSetupInput error:", e);
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
            traces: [{ to: [input.proxyAddress], callType: ["call", "delegatecall"] }],
            fieldSelection: { trace: ["Input"] },
        });

        // Find the trace with the setup function call
        for (const trace of data.data.traces) {
            if (trace.input && trace.input.length > 10) {
                const selector = trace.input.slice(0, 10);
                if (selector.toLowerCase() === SETUP_SELECTOR.toLowerCase()) {
                    return trace.input;
                }
            }
        }

        return undefined;
    }
);

