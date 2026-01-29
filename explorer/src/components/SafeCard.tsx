import Link from "next/link";
import { Users, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { AddressDisplay } from "./AddressDisplay";
import { NetworkBadge } from "./NetworkBadge";
import { cn, formatSafeVersion, formatRelativeTime } from "@/lib/utils";
import type { Safe } from "@/lib/graphql/queries";

export interface SafeCardProps {
  safe: Safe;
  className?: string;
  showCreationTime?: boolean;
}

export function SafeCard({ safe, className, showCreationTime = false }: SafeCardProps) {
  return (
    <Link href={`/safe/${safe.chainId}/${safe.address}`}>
      <Card className={cn(
        "hover:border-primary/50 hover:shadow-md transition-all cursor-pointer",
        className
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left side - Address and chain */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <NetworkBadge chainId={safe.chainId} size="sm" />
                <Badge variant="outline" className="text-xs">
                  {formatSafeVersion(safe.version)}
                </Badge>
              </div>
              <AddressDisplay 
                address={safe.address} 
                showBlockie 
                showCopy={false}
                className="text-foreground font-medium"
              />
            </div>

            {/* Right side - Stats */}
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{safe.threshold}/{safe.owners.length}</span>
              </div>
              {showCreationTime && safe.creationTimestamp ? (
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(safe.creationTimestamp)}
                </span>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-0.5 text-success">
                    <CheckCircle className="h-3 w-3" />
                    {safe.numberOfSuccessfulExecutions}
                  </span>
                  <span className="flex items-center gap-0.5 text-destructive">
                    <XCircle className="h-3 w-3" />
                    {safe.numberOfFailedExecutions}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
