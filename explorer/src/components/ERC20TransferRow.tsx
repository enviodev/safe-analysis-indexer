"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, ShieldAlert } from "lucide-react";
import { AddressDisplay } from "./AddressDisplay";
import { formatRelativeTime, truncateTxHash } from "@/lib/utils";
import { getExplorerTxUrl } from "@/lib/constants";
import { formatTokenAmount, type TokenInfo } from "@/lib/tokenLists";
import type { ERC20Transfer } from "@/lib/graphql/queries";

export interface ERC20TransferRowProps {
  transfer: ERC20Transfer;
  /** The Safe address in context — determines IN/OUT direction. Lowercase. */
  safeAddress: string;
  /** Optional token metadata for symbol + decimal-aware amount formatting. */
  tokenInfo?: TokenInfo | null;
}

export function ERC20TransferRow({ transfer, safeAddress, tokenInfo }: ERC20TransferRowProps) {
  const isOutbound = transfer.from.toLowerCase() === safeAddress.toLowerCase();
  const counterparty = isOutbound ? transfer.to : transfer.from;
  const explorerUrl = getExplorerTxUrl(transfer.chainId, transfer.txHash);

  const DirectionIcon = isOutbound ? ArrowUpRight : ArrowDownLeft;
  const directionLabel = isOutbound ? "OUT" : "IN";
  const directionClass = isOutbound
    ? "text-orange-500 bg-orange-500/10"
    : "text-emerald-500 bg-emerald-500/10";

  const amount = formatTokenAmount(transfer.value, tokenInfo ?? null);

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0">
      {/* Left: direction badge + tx link */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${directionClass}`}
          title={isOutbound ? "Outbound transfer" : "Inbound transfer"}
        >
          <DirectionIcon className="h-3 w-3" />
          {directionLabel}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/tx/${transfer.txHash}`}
              className="font-mono text-sm text-primary hover:underline"
            >
              {truncateTxHash(transfer.txHash)}
            </Link>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {tokenInfo ? (
              <span
                className="font-medium text-foreground"
                title={`${tokenInfo.name} · listed in ${tokenInfo.sources.join(", ")}`}
              >
                {tokenInfo.symbol}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-0.5 text-muted-foreground/80"
                title="Token not in any verified list"
              >
                <ShieldAlert className="h-3 w-3" />
                Unverified
              </span>
            )}
            <span>·</span>
            <AddressDisplay
              address={transfer.token}
              chainId={transfer.chainId}
              showCopy={false}
              showExternalLink
              className="text-xs"
            />
          </div>
        </div>
      </div>

      {/* Middle: counterparty */}
      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-xs">{isOutbound ? "to" : "from"}</span>
        <AddressDisplay
          address={counterparty}
          chainId={transfer.chainId}
          showCopy={false}
          showExternalLink
        />
      </div>

      {/* Right: amount + time */}
      <div className="flex flex-col items-end gap-0.5 ml-4">
        <span
          className={`text-sm font-medium tabular-nums ${
            isOutbound ? "text-orange-500" : "text-emerald-500"
          }`}
          title={
            tokenInfo
              ? `${transfer.value} raw (${tokenInfo.decimals} decimals)`
              : `${transfer.value} raw — decimals unknown, formatted as 18`
          }
        >
          {isOutbound ? "−" : "+"}
          {amount.formatted} {amount.symbol}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(transfer.blockTimestamp)}
        </span>
      </div>
    </div>
  );
}
