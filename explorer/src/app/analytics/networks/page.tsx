import { PieChart, Activity, Layers } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { NetworkBadge } from "@/components/NetworkBadge";
import { AnalyticsTabs } from "@/components/AnalyticsTabs";
import { getChain } from "@/lib/constants";
import { getNetworks } from "@/lib/graphql/queries";
import { NetworkPieChart } from "./NetworkPieChart";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default async function NetworkDistributionPage() {
  const networks = await getNetworks();

  const chartData = networks.map(network => {
    const chainId = parseInt(network.id);
    const chain = getChain(chainId);
    return {
      name: chain.name,
      value: network.numberOfSafes,
      color: chain.color,
      chainId,
      transactions: network.numberOfTransactions,
      moduleTransactions: network.numberOfModuleTransactions,
    };
  });

  const totalSafes = networks.reduce((acc, n) => acc + n.numberOfSafes, 0);
  const totalTransactions = networks.reduce((acc, n) => acc + n.numberOfTransactions, 0);
  const totalModuleTx = networks.reduce((acc, n) => acc + n.numberOfModuleTransactions, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Analytics</h1>
        <p className="text-muted-foreground">
          Explore insights and visualizations from Safe data
        </p>
      </div>

      {/* Tabs */}
      <AnalyticsTabs className="mb-8" />

      {/* Page Title */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-1">Network Distribution</h2>
        <p className="text-sm text-muted-foreground">
          Distribution of Safe wallets across different blockchain networks
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Networks</p>
                <p className="text-2xl font-bold">{networks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <PieChart className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Safes</p>
                <p className="text-2xl font-bold">{totalSafes.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold">{(totalTransactions + totalModuleTx).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Safe Distribution by Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <NetworkPieChart data={chartData} />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Network Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {networks
                .sort((a, b) => b.numberOfSafes - a.numberOfSafes)
                .map((network) => {
                  const chainId = parseInt(network.id);
                  const percentage = totalSafes > 0 
                    ? ((network.numberOfSafes / totalSafes) * 100).toFixed(1) 
                    : "0";
                  return (
                    <div 
                      key={network.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <NetworkBadge chainId={chainId} showName />
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {network.numberOfSafes.toLocaleString()} Safes
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage}% · {network.numberOfTransactions.toLocaleString()} txns
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between font-medium">
              <span>Total</span>
              <span>{totalSafes.toLocaleString()} Safes</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions by Network */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Transactions by Network</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {networks
              .sort((a, b) => b.numberOfTransactions - a.numberOfTransactions)
              .map((network) => {
                const chainId = parseInt(network.id);
                const chain = getChain(chainId);
                return (
                  <div 
                    key={network.id}
                    className="p-4 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <NetworkBadge chainId={chainId} />
                      <span className="font-medium">{chain.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Safes</p>
                        <p className="font-medium">{network.numberOfSafes.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Transactions</p>
                        <p className="font-medium">{network.numberOfTransactions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Module Txns</p>
                        <p className="font-medium">{network.numberOfModuleTransactions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg Txns/Safe</p>
                        <p className="font-medium">
                          {network.numberOfSafes > 0 
                            ? (network.numberOfTransactions / network.numberOfSafes).toFixed(1)
                            : "0"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
