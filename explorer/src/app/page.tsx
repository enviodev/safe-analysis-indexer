import { Wallet } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { NetworksStatCard } from "@/components/NetworksStatCard";
import { LiveFeed } from "@/components/LiveFeed";
import { LiveStats } from "@/components/LiveStats";
import { SafeRow } from "@/components/SafeRow";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { getRecentSafes, getRecentTransactions, getGlobalStats, getIndexedChains } from "@/lib/graphql/queries";

// Force dynamic rendering to avoid build-time API calls
export const dynamic = "force-dynamic";
export const revalidate = 30; // Revalidate every 30 seconds

export default async function HomePage() {
  // Fetch data server-side
  const [recentSafes, recentTransactions, initialStats, indexedChains] = await Promise.all([
    getRecentSafes(10).catch(() => []),
    getRecentTransactions(10).catch(() => []),
    getGlobalStats().catch(() => ({ id: "global", totalSafes: 0, totalTransactions: 0, totalModuleTransactions: 0 })),
    getIndexedChains().catch(() => []),
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <section className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          <span className="text-primary">Safe</span>scan
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Explore Safe multi-signature wallets across multiple chains. 
          Search by Safe address, Owner address, or Transaction hash.
        </p>
        
        {/* Search Bar */}
        <div className="max-w-2xl mx-auto">
          <SearchInput size="lg" autoFocus />
        </div>
      </section>

      {/* Stats Section - LiveStats updates every second */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <LiveStats initialStats={initialStats} />
        <NetworksStatCard chainIds={indexedChains} />
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Transactions Feed */}
        <div className="lg:col-span-2">
          <LiveFeed initialTransactions={recentTransactions} />
        </div>

        {/* Recent Safes */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Recent Safes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentSafes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No safes found
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentSafes.map((safe) => (
                    <SafeRow key={safe.id} safe={safe} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
