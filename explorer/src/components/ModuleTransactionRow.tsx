"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "./AddressDisplay";
import { NetworkBadge } from "./NetworkBadge";
import { formatRelativeTime, formatWei } from "@/lib/utils";
import { getExplorerTxUrl, getNativeToken } from "@/lib/constants";
import type { SafeModuleTransaction } from "@/lib/graphql/queries";

export interface ModuleTransactionRowProps {
  transaction: SafeModuleTransaction;
  showSafe?: boolean;
}

export function ModuleTransactionRow({ transaction, showSafe = false }: ModuleTransactionRowProps) {
  const { safe } = transaction;
  const explorerUrl = getExplorerTxUrl(safe.chainId, transaction.txHash);
  const hasValue = BigInt(transaction.value) > BigInt(0);

  return (
    <Link
      href={`/module-tx/${encodeURIComponent(transaction.id)}`}
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
    >
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <NetworkBadge chainId={safe.chainId} showName={false} size="sm" />

        <div className="p-1.5 bg-muted rounded-md">
          <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <AddressDisplay address={transaction.safeModule} showCopy={false} className="font-medium" />
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {transaction.operation === "0" ? "Call" : "DelegateCall"}
            </Badge>
          </div>

          {showSafe && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Safe: <AddressDisplay address={safe.address} showCopy={false} className="text-xs" />
            </div>
          )}
        </div>
      </div>

      {/* Middle - To address */}
      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowRight className="h-4 w-4" />
        <AddressDisplay address={transaction.to} showCopy={false} />
      </div>

      {/* Right side - Value, time, explorer link */}
      <div className="flex items-center gap-3 ml-4">
        <div className="flex flex-col items-end gap-0.5">
          {hasValue && (
            <span className="text-sm font-medium">
              {formatWei(transaction.value)} {getNativeToken(safe.chainId)}
            </span>
          )}
          {transaction.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(transaction.timestamp)}
            </span>
          )}
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </Link>
  );
}
