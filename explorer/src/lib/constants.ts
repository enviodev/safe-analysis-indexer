export const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "";

export const GITHUB_URL = "https://github.com/enviodev/safe-analysis-indexer-2";

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  nativeToken: string; // Native token symbol (ETH, xDAI, BNB, etc.)
  explorerUrl: string;
  color: string;
}

// Chain IDs that have icons in /public/network-icons/{chainId}.png
export const CHAINS_WITH_ICONS = new Set([
  1, 10, 56, 100, 137, 143, 204, 324, 480, 999, 1101, 5000, 8453,
  42161, 42220, 43114, 59144, 81457, 534352, 1313161554
]);

export function getChainIcon(chainId: number): string | null {
  return CHAINS_WITH_ICONS.has(chainId) ? `/network-icons/${chainId}.png` : null;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    id: 1,
    name: "Ethereum",
    shortName: "ETH",
    nativeToken: "ETH",
    explorerUrl: "https://etherscan.io",
    color: "#627EEA",
  },
  10: {
    id: 10,
    name: "Optimism",
    shortName: "OP",
    nativeToken: "ETH",
    explorerUrl: "https://optimistic.etherscan.io",
    color: "#FF0420",
  },
  50: {
    id: 50,
    name: "XDC",
    shortName: "XDC",
    nativeToken: "XDC",
    explorerUrl: "https://explorer.xinfin.network",
    color: "#1E4B8E",
  },
  56: {
    id: 56,
    name: "BNB Chain",
    shortName: "BSC",
    nativeToken: "BNB",
    explorerUrl: "https://bscscan.com",
    color: "#F3BA2F",
  },
  100: {
    id: 100,
    name: "Gnosis",
    shortName: "GNO",
    nativeToken: "xDAI",
    explorerUrl: "https://gnosisscan.io",
    color: "#04795B",
  },
  137: {
    id: 137,
    name: "Polygon",
    shortName: "MATIC",
    nativeToken: "POL",
    explorerUrl: "https://polygonscan.com",
    color: "#8247E5",
  },
  143: {
    id: 143,
    name: "Monad",
    shortName: "MON",
    nativeToken: "MON",
    explorerUrl: "https://monadscan.com",
    color: "#836EF9",
  },
  204: {
    id: 204,
    name: "opBNB",
    shortName: "opBNB",
    nativeToken: "BNB",
    explorerUrl: "https://opbnbscan.com",
    color: "#F3BA2F",
  },
  324: {
    id: 324,
    name: "zkSync Era",
    shortName: "zkSync",
    nativeToken: "ETH",
    explorerUrl: "https://explorer.zksync.io",
    color: "#8C8DFC",
  },
  480: {
    id: 480,
    name: "World Chain",
    shortName: "WLD",
    nativeToken: "ETH",
    explorerUrl: "https://worldchain-mainnet.explorer.alchemy.com",
    color: "#000000",
  },
  999: {
    id: 999,
    name: "HyperEVM",
    shortName: "HYPE",
    nativeToken: "HYPE",
    explorerUrl: "https://hypurrscan.io",
    color: "#00FF00",
  },
  1101: {
    id: 1101,
    name: "Polygon zkEVM",
    shortName: "zkEVM",
    nativeToken: "ETH",
    explorerUrl: "https://www.oklink.com/polygon-zkevm",
    color: "#8247E5",
  },
  5000: {
    id: 5000,
    name: "Mantle",
    shortName: "MNT",
    nativeToken: "MNT",
    explorerUrl: "https://explorer.mantle.xyz",
    color: "#000000",
  },
  8453: {
    id: 8453,
    name: "Base",
    shortName: "BASE",
    nativeToken: "ETH",
    explorerUrl: "https://basescan.org",
    color: "#0052FF",
  },
  42161: {
    id: 42161,
    name: "Arbitrum",
    shortName: "ARB",
    nativeToken: "ETH",
    explorerUrl: "https://arbiscan.io",
    color: "#28A0F0",
  },
  42220: {
    id: 42220,
    name: "Celo",
    shortName: "CELO",
    nativeToken: "CELO",
    explorerUrl: "https://celoscan.io",
    color: "#FCFF52",
  },
  43114: {
    id: 43114,
    name: "Avalanche",
    shortName: "AVAX",
    nativeToken: "AVAX",
    explorerUrl: "https://snowscan.xyz",
    color: "#E84142",
  },
  59144: {
    id: 59144,
    name: "Linea",
    shortName: "LINEA",
    nativeToken: "ETH",
    explorerUrl: "https://lineascan.build",
    color: "#61DFFF",
  },
  81457: {
    id: 81457,
    name: "Blast",
    shortName: "BLAST",
    nativeToken: "ETH",
    explorerUrl: "https://blastscan.io",
    color: "#FCFC03",
  },
  534352: {
    id: 534352,
    name: "Scroll",
    shortName: "SCROLL",
    nativeToken: "ETH",
    explorerUrl: "https://scrollscan.com",
    color: "#FFEEDA",
  },
  1313161554: {
    id: 1313161554,
    name: "Aurora",
    shortName: "AURORA",
    nativeToken: "ETH",
    explorerUrl: "https://explorer.aurora.dev",
    color: "#70D44B",
  },
};

export function getChain(chainId: number): ChainConfig {
  return CHAINS[chainId] || {
    id: chainId,
    name: `Chain ${chainId}`,
    shortName: `${chainId}`,
    nativeToken: "ETH",
    explorerUrl: "",
    color: "#888888",
  };
}

export function getNativeToken(chainId: number): string {
  return getChain(chainId).nativeToken;
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = getChain(chainId);
  return chain.explorerUrl ? `${chain.explorerUrl}/tx/${txHash}` : "";
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  const chain = getChain(chainId);
  return chain.explorerUrl ? `${chain.explorerUrl}/address/${address}` : "";
}
