"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, Users } from "lucide-react";
import { AddressDisplay } from "./AddressDisplay";
import { NetworkBadge } from "./NetworkBadge";
import { Badge } from "./ui/Badge";
import { formatRelativeTime, formatSafeVersion } from "@/lib/utils";
import { getExplorerAddressUrl } from "@/lib/constants";
import type { Safe } from "@/lib/graphql/queries";

export interface SafeRowProps {
  safe: Safe;
}

export function SafeRow({ safe }: SafeRowProps) {
  const router = useRouter();
  const explorerUrl = getExplorerAddressUrl(safe.chainId, safe.address);

  const handleClick = () => {
    router.push(`/safe/${safe.chainId}/${safe.address}`);
  };

  const handleExplorerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      onClick={handleClick}
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 cursor-pointer"
    >
      {/* Left side - Network and Address */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <NetworkBadge chainId={safe.chainId} showName={false} size="sm" />
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AddressDisplay 
              address={safe.address} 
              showBlockie
              showCopy={false}
              blockieSize={16}
              className="text-sm font-medium"
            />
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleExplorerClick}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {formatSafeVersion(safe.version)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right side - Threshold and time */}
      <div className="flex flex-col items-end gap-0.5 ml-4">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{safe.threshold}/{safe.owners.length}</span>
        </div>
        {safe.creationTimestamp && (
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(safe.creationTimestamp)}
          </span>
        )}
      </div>
    </div>
  );
}
