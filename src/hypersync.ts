import { createEffect, S } from "envio";
import { HypersyncClient } from "@envio-dev/hypersync-client";
import { ethers } from "ethers";

// Safe version type
export type SafeVersion = "V1_0_0" | "V1_1_1";

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
const SETUP_ABI_1_0_0 = [
    "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address paymentToken, uint256 payment, address payable paymentReceiver)"
];
const safeInterface1_0_0 = new ethers.Interface(SETUP_ABI_1_0_0);

// Safe 1.1.1 setup function ABI (adds fallbackHandler parameter)
const SETUP_ABI_1_1_1 = [
    "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)"
];
const safeInterface1_1_1 = new ethers.Interface(SETUP_ABI_1_1_1);

// Version-specific interfaces and selectors
const versionConfig = {
    V1_0_0: {
        interface: safeInterface1_0_0,
        selector: safeInterface1_0_0.getFunction("setup")!.selector,
    },
    V1_1_1: {
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

