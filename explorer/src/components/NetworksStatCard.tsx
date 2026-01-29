import Image from "next/image";
import { Card, CardContent } from "./ui/Card";
import { getChainIcon } from "@/lib/constants";

interface NetworksStatCardProps {
  chainIds: number[];
}

export function NetworksStatCard({ chainIds }: NetworksStatCardProps) {
  // Filter to only chains that have icons
  const chainsWithIcons = chainIds.filter(id => getChainIcon(id) !== null);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-shrink-0">
            <p className="text-sm font-medium text-muted-foreground">Networks</p>
            <p className="text-2xl font-bold mt-1">{chainIds.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Indexed chains</p>
          </div>
          
          {/* Overlapping network icons - show all */}
          <div className="flex items-center -space-x-1.5 flex-wrap justify-end">
            {chainsWithIcons.map((chainId, index) => (
              <div
                key={chainId}
                className="relative w-6 h-6 rounded-full border border-border bg-white overflow-hidden flex-shrink-0"
                style={{ zIndex: chainsWithIcons.length - index }}
              >
                <Image
                  src={`/network-icons/${chainId}.png`}
                  alt={`Chain ${chainId}`}
                  fill
                  className="object-contain p-0.5"
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
