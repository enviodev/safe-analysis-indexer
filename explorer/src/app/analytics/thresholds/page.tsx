"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

// Placeholder data
const PLACEHOLDER_DATA = [
  { config: "1/1", threshold: 1, owners: 1, count: 45000 },
  { config: "1/2", threshold: 1, owners: 2, count: 28000 },
  { config: "2/2", threshold: 2, owners: 2, count: 32000 },
  { config: "2/3", threshold: 2, owners: 3, count: 89000 },
  { config: "3/3", threshold: 3, owners: 3, count: 15000 },
  { config: "3/4", threshold: 3, owners: 4, count: 12000 },
  { config: "3/5", threshold: 3, owners: 5, count: 24000 },
  { config: "4/5", threshold: 4, owners: 5, count: 8000 },
  { config: "4/6", threshold: 4, owners: 6, count: 6000 },
  { config: "5/7", threshold: 5, owners: 7, count: 4000 },
];

export default function ThresholdDistributionPage() {
  const [data, setData] = useState(PLACEHOLDER_DATA);
  
  const total = data.reduce((acc, item) => acc + item.count, 0);

  const chartData = data
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(item => ({
      name: item.config,
      count: item.count,
      percentage: ((item.count / total) * 100).toFixed(1),
    }));

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
          <div className="p-2 bg-green-500/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold">Threshold Distribution</h1>
        </div>
        <p className="text-muted-foreground">
          Common threshold configurations across Safe wallets
        </p>
      </div>

      {/* Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Most Popular Configurations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tickFormatter={(value) => value.toLocaleString()} />
                <YAxis dataKey="name" type="category" width={60} />
                <Tooltip 
                  formatter={(value) => Number(value).toLocaleString()}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="var(--primary)" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.sort((a, b) => b.count - a.count).map((item) => {
          const percentage = ((item.count / total) * 100).toFixed(1);
          return (
            <Card key={item.config}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-primary">
                    {item.config}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {percentage}%
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                  {item.threshold} of {item.owners} signatures required
                </div>
                <div className="font-medium">
                  {item.count.toLocaleString()} Safes
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
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
