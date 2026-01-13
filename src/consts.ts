export interface ProxyAddresses {
    gnosisSafeProxy1_3_0: string;
    gnosisSafeProxy1_4_1: string;
}

// the addresses are the same across all chains so this data structure may be overkill however I'm not 100% sure they are the same and may require handling like this

export const PROXY_ADDRESSES_BY_CHAIN_ID: Record<number, ProxyAddresses> = {
    // Optimism
    10: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Ethereum Mainnet
    1: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Gnosis
    100: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // BSC
    56: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Polygon
    137: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Worldchain
    480: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Polygon zkEVM
    1101: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Mantle
    5000: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Base
    8453: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Arbitrum
    42161: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Celo
    42220: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Avalanche
    43114: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Linea
    59144: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Blast
    81457: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Scroll
    534352: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Monad
    143: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // OPBNB
    204: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // zkSync Mainnet
    324: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // HyperEVM
    999: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // Aurora
    1313161554: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
    // XDC
    50: {
        gnosisSafeProxy1_3_0: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        gnosisSafeProxy1_4_1: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    },
};
