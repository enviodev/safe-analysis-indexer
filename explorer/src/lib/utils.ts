import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return "";
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function truncateTxHash(hash: string, startChars = 10, endChars = 8): string {
  if (!hash) return "";
  if (hash.length <= startChars + endChars) return hash;
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

export function formatNumber(num: number | bigint | string): string {
  const n = typeof num === "string" ? parseFloat(num) : Number(num);
  if (isNaN(n)) return "0";
  
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(2)}K`;
  }
  return n.toLocaleString();
}

export function formatWei(wei: string | bigint, decimals = 18): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;
  
  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0").slice(0, 4);
  return `${integerPart}.${fractionalStr}`;
}

export function formatDate(timestamp: number | string | bigint): string {
  const ts = typeof timestamp === "bigint" ? Number(timestamp) : 
             typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
  
  // Handle both seconds and milliseconds
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(timestamp: number | string | bigint): string {
  const ts = typeof timestamp === "bigint" ? Number(timestamp) : 
             typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
  
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  
  return formatDate(timestamp);
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export function detectSearchType(input: string): "address" | "txHash" | "unknown" {
  const trimmed = input.trim().toLowerCase();
  if (isValidAddress(trimmed)) return "address";
  if (isValidTxHash(trimmed)) return "txHash";
  return "unknown";
}

export function parseChainIdFromSafeId(safeId: string): { chainId: number; address: string } | null {
  const parts = safeId.split("-");
  if (parts.length !== 2) return null;
  
  const chainId = parseInt(parts[0]);
  const address = parts[1];
  
  if (isNaN(chainId) || !isValidAddress(address)) return null;
  
  return { chainId, address };
}

// Version formatting map
const VERSION_MAP: Record<string, string> = {
  "V1_0_0": "v1.0.0",
  "V1_1_1ORV1_2_0": "v1.1.1/v1.2.0",
  "V1_3_0": "v1.3.0",
  "V1_4_0": "v1.4.0",
  "V1_4_1": "v1.4.1",
  "V1_5_0": "v1.5.0",
};

export function formatSafeVersion(version: string): string {
  return VERSION_MAP[version] || version;
}
