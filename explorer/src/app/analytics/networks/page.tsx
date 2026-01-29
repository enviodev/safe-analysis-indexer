"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PieChart } from "lucide-react";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { NetworkBadge } from "@/components/NetworkBadge";
import { getChain, CHAINS } from "@/lib/constants";

// This would ideally come from the GraphQL API
// For now, we'll show a placeholder
const PLACEHOLDER_DATA = [
  { chainId: 1, count: 245000 },
  { chainId: 10, count: 45000 },
  { chainId: 137, count: 89000 },
  { chainId: 42161, count: 67000 },
  { chainId: 8453, count: 34000 },
  { chainId: 100, count: 28000 },
  { chainId: 56, count: 22000 },
  { chainId: 43114, count: 15000 },
];

export default function NetworkDistributionPage() {
  const [data, setData] = useState(PLACEHOLDER_DATA);
  const [isLoading, setIsLoading] = useState(false);

  const chartData = data.map(item => {
    const chain = getChain(item.chainId);
    return {
      name: chain.name,
      value: item.count,
      color: chain.color,
      chainId: item.chainId,
    };
  });

  const total = data.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href="/analytics">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Analytics
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <PieChart className="h-6 w-6 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold">Network Distribution</h1>
        </div>
        <p className="text-muted-foreground">
          Distribution of Safe wallets across different blockchain networks
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Safe Distribution by Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={140}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => Number(value).toLocaleString()}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Network Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data
                .sort((a, b) => b.count - a.count)
                .map((item) => {
                  const chain = getChain(item.chainId);
                  const percentage = ((item.count / total) * 100).toFixed(1);
                  return (
                    <div 
                      key={item.chainId}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <NetworkBadge chainId={item.chainId} showName />
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {item.count.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage}%
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between font-medium">
              <span>Total</span>
              <span>{total.toLocaleString()} Safes</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Note */}
      <Card className="mt-6 border-dashed">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Data shown is placeholder. Real-time data will be loaded from the indexer.
        </CardContent>
      </Card>
    </div>
  );
}
