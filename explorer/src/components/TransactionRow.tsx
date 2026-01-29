import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { AddressDisplay } from "./AddressDisplay";
import { NetworkBadge } from "./NetworkBadge";
import { formatRelativeTime, formatWei, truncateTxHash } from "@/lib/utils";
import { getExplorerTxUrl, getNativeToken } from "@/lib/constants";
import type { SafeTransaction } from "@/lib/graphql/queries";

export interface TransactionRowProps {
  transaction: SafeTransaction;
  showSafe?: boolean;
}

export function TransactionRow({ transaction, showSafe = true }: TransactionRowProps) {
  const { safe } = transaction;
  const explorerUrl = getExplorerTxUrl(safe.chainId, transaction.txHash);

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0">
      {/* Left side */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <NetworkBadge chainId={safe.chainId} showName={false} size="sm" />
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link 
              href={`/tx/${transaction.txHash}`}
              className="font-mono text-sm text-primary hover:underline"
            >
              {truncateTxHash(transaction.txHash)}
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
          
          {showSafe && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <span>Safe:</span>
              <Link 
                href={`/safe/${safe.chainId}/${safe.address}`}
                className="hover:text-foreground"
              >
                <AddressDisplay 
                  address={safe.address} 
                  showCopy={false}
                  className="text-xs"
                />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Middle - To address */}
      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowRight className="h-4 w-4" />
        <AddressDisplay 
          address={transaction.to} 
          chainId={safe.chainId}
          showCopy={false}
          showExternalLink
        />
      </div>

      {/* Right side - Value and time */}
      <div className="flex flex-col items-end gap-0.5 ml-4">
        {BigInt(transaction.value) > 0 && (
          <span className="text-sm font-medium">
            {formatWei(transaction.value)} {getNativeToken(safe.chainId)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(transaction.executionDate)}
        </span>
      </div>
    </div>
  );
}
