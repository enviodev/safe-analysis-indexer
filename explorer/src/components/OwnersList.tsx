import { Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { AddressDisplay } from "./AddressDisplay";
import { Blockie } from "./Blockie";
import Link from "next/link";

export interface OwnersListProps {
  owners: string[];
  threshold: number;
  chainId?: number;
}

export function OwnersList({ owners, threshold, chainId }: OwnersListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Owners
          </span>
          <span className="text-lg font-bold text-primary">
            {threshold} of {owners.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Threshold visualization */}
        <div className="flex gap-1 mb-4">
          {owners.map((_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded-full ${
                index < threshold ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Owners list */}
        <div className="space-y-3">
          {owners.map((owner, index) => (
            <Link
              key={`${owner}-${index}`}
              href={`/owner/${owner}`}
              className="flex items-center gap-3 p-3 rounded hover:bg-muted transition-colors"
            >
              <Blockie address={owner} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">
                  Owner {index + 1}
                </div>
                <AddressDisplay
                  address={owner}
                  chainId={chainId}
                  showCopy
                  showExternalLink
                  showBlockie={false}
                />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
