// Payload builders for Safe Transaction Service-compatible RabbitMQ events.
//
// Each function returns the exact JSON shape that `safe-events-service`
// expects to consume — byte-for-byte aligned with the spec at
// https://github.com/safe-global/safe-events-service#events-supported.
// Off-chain event types (NEW_CONFIRMATION, PENDING_MULTISIG_TRANSACTION,
// DELETED_MULTISIG_TRANSACTION, MESSAGE_*, NEW_DELEGATE/*, REORG_DETECTED,
// OUTGOING_ETHER) are deliberately not implemented — we have no way to
// observe them from on-chain data alone.
//
// All inputs accept lowercase / unchecksummed addresses; all output
// addresses are EIP-55-checksummed via viem.getAddress. `value`, `tokenId`
// and `chainId` are emitted as base-10 strings per the spec.

import { getAddress } from "viem";

// --- Event union types --------------------------------------------------

export type SafeExecutedMultisigEvent = {
    readonly address: string;
    readonly type: "EXECUTED_MULTISIG_TRANSACTION";
    readonly safeTxHash: string;
    readonly to: string;
    readonly data: string | null;
    readonly failed: "true" | "false";
    readonly txHash: string;
    readonly chainId: string;
};

export type SafeIncomingEtherEvent = {
    readonly address: string;
    readonly type: "INCOMING_ETHER";
    readonly txHash: string;
    readonly value: string;
    readonly chainId: string;
};

export type SafeErc20TokenEvent = {
    readonly address: string;
    readonly type: "INCOMING_TOKEN" | "OUTGOING_TOKEN";
    readonly tokenAddress: string;
    readonly txHash: string;
    readonly value: string;
    readonly chainId: string;
};

export type SafeErc721TokenEvent = {
    readonly address: string;
    readonly type: "INCOMING_TOKEN" | "OUTGOING_TOKEN";
    readonly tokenAddress: string;
    readonly txHash: string;
    readonly tokenId: string;
    readonly chainId: string;
};

export type SafeEventPayload =
    | SafeExecutedMultisigEvent
    | SafeIncomingEtherEvent
    | SafeErc20TokenEvent
    | SafeErc721TokenEvent;

export type TokenDirection = "INCOMING_TOKEN" | "OUTGOING_TOKEN";

// --- Builders -----------------------------------------------------------

export function buildExecutedMultisigTransaction(args: {
    chainId: number;
    safeAddress: string;
    safeTxHash: string;
    to: string;
    data: string | null;
    success: boolean;
    txHash: string;
}): SafeExecutedMultisigEvent {
    return {
        address: getAddress(args.safeAddress),
        type: "EXECUTED_MULTISIG_TRANSACTION",
        safeTxHash: lowerHex(args.safeTxHash),
        to: getAddress(args.to),
        data: args.data == null || args.data === "0x" ? null : lowerHex(args.data),
        failed: args.success ? "false" : "true",
        txHash: lowerHex(args.txHash),
        chainId: String(args.chainId),
    };
}

export function buildIncomingEther(args: {
    chainId: number;
    safeAddress: string;
    txHash: string;
    value: bigint;
}): SafeIncomingEtherEvent {
    return {
        address: getAddress(args.safeAddress),
        type: "INCOMING_ETHER",
        txHash: lowerHex(args.txHash),
        value: args.value.toString(),
        chainId: String(args.chainId),
    };
}

export function buildErc20Token(args: {
    chainId: number;
    safeAddress: string;
    tokenAddress: string;
    txHash: string;
    value: bigint;
    direction: TokenDirection;
}): SafeErc20TokenEvent {
    return {
        address: getAddress(args.safeAddress),
        type: args.direction,
        tokenAddress: getAddress(args.tokenAddress),
        txHash: lowerHex(args.txHash),
        value: args.value.toString(),
        chainId: String(args.chainId),
    };
}

export function buildErc721Token(args: {
    chainId: number;
    safeAddress: string;
    tokenAddress: string;
    txHash: string;
    tokenId: bigint;
    direction: TokenDirection;
}): SafeErc721TokenEvent {
    return {
        address: getAddress(args.safeAddress),
        type: args.direction,
        tokenAddress: getAddress(args.tokenAddress),
        txHash: lowerHex(args.txHash),
        tokenId: args.tokenId.toString(),
        chainId: String(args.chainId),
    };
}

// --- Helpers ------------------------------------------------------------

// Lowercase a 0x-prefixed hex string. txHashes / safeTxHashes / data in
// the spec are 0x-prefixed lowercase; we keep them in canonical form so
// payloads round-trip cleanly through JSON.
function lowerHex(hex: string): string {
    return hex.startsWith("0x") || hex.startsWith("0X")
        ? "0x" + hex.slice(2).toLowerCase()
        : hex.toLowerCase();
}
