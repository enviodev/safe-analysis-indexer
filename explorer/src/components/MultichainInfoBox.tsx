import Link from "next/link";
import { Globe } from "lucide-react";
import { Card, CardContent } from "./ui/Card";
import { NetworkBadge } from "./NetworkBadge";
import { cn } from "@/lib/utils";
import type { Safe } from "@/lib/graphql/queries";

export interface MultichainInfoBoxProps {
  currentChainId: number;
  safes: Safe[];
  className?: string;
}

export function MultichainInfoBox({ currentChainId, safes, className }: MultichainInfoBoxProps) {
  // Filter out the current chain
  const otherChainSafes = safes.filter(safe => safe.chainId !== currentChainId);

  if (otherChainSafes.length === 0) {
    return null;
  }

  return (
    <Card className={cn("border-primary/30 bg-primary/5", className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-sm mb-2">
              Multichain Safe Detected
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              This address also exists as a Safe on {otherChainSafes.length} other network{otherChainSafes.length > 1 ? "s" : ""}:
            </p>
            <div className="flex flex-wrap gap-2">
              {otherChainSafes.map((safe) => (
                <Link
                  key={safe.id}
                  href={`/safe/${safe.chainId}/${safe.address}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-background hover:bg-muted transition-colors text-sm"
                >
                  <NetworkBadge chainId={safe.chainId} size="sm" showName />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
