import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
import { ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Blockie } from "@/components/Blockie";
import { AddressDisplay } from "@/components/AddressDisplay";
import { SafeCard } from "@/components/SafeCard";
import { StatCard } from "@/components/StatCard";
import { getOwner, getSafesByOwner } from "@/lib/graphql/queries";
import { isValidAddress } from "@/lib/utils";

interface OwnerPageProps {
  params: Promise<{
    address: string;
  }>;
}

export default async function OwnerPage({ params }: OwnerPageProps) {
  const { address } = await params;

  if (!isValidAddress(address)) {
    notFound();
  }

  // Fetch owner data
  const [owner, safes] = await Promise.all([
    getOwner(address),
    getSafesByOwner(address),
  ]);

  // Calculate aggregate stats
  const totalSuccessfulTxs = safes.reduce(
    (acc, safe) => acc + safe.numberOfSuccessfulExecutions, 
    0
  );
  const totalFailedTxs = safes.reduce(
    (acc, safe) => acc + safe.numberOfFailedExecutions, 
    0
  );
  const uniqueChains = new Set(safes.map(safe => safe.chainId)).size;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href="/">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Blockie address={address} size={64} className="rounded-xl" />
          <div>
            <h1 className="text-2xl font-bold mb-1">Owner</h1>
            <AddressDisplay 
              address={address}
              truncate={false}
              showCopy
              className="text-lg"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Safes Owned"
          value={safes.length}
          icon={Wallet}
        />
        <StatCard
          title="Networks"
          value={uniqueChains}
          description="Unique chains"
        />
        <StatCard
          title="Total Successful Txs"
          value={totalSuccessfulTxs}
          description="Across all Safes"
        />
        <StatCard
          title="Total Failed Txs"
          value={totalFailedTxs}
          description="Across all Safes"
        />
      </div>

      {/* Safes List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Owned Safes ({safes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {safes.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              This address does not own any Safes
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {safes.map((safe) => (
                <SafeCard key={safe.id} safe={safe} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
