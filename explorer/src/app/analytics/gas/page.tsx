"use client";

import Link from "next/link";
import { ArrowLeft, Fuel } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatCard } from "@/components/StatCard";

// Placeholder data - would come from API
const PLACEHOLDER_TIME_DATA = [
  { date: "Jan", gasUsed: 1200000, txCount: 4500 },
  { date: "Feb", gasUsed: 1450000, txCount: 5200 },
  { date: "Mar", gasUsed: 1800000, txCount: 6100 },
  { date: "Apr", gasUsed: 1650000, txCount: 5800 },
  { date: "May", gasUsed: 2100000, txCount: 7200 },
  { date: "Jun", gasUsed: 2400000, txCount: 8100 },
  { date: "Jul", gasUsed: 2200000, txCount: 7800 },
  { date: "Aug", gasUsed: 2600000, txCount: 8900 },
  { date: "Sep", gasUsed: 2800000, txCount: 9200 },
  { date: "Oct", gasUsed: 3100000, txCount: 10100 },
  { date: "Nov", gasUsed: 2900000, txCount: 9800 },
  { date: "Dec", gasUsed: 3200000, txCount: 10500 },
];

export default function GasAnalyticsPage() {
  const totalGas = PLACEHOLDER_TIME_DATA.reduce((acc, item) => acc + item.gasUsed, 0);
  const totalTx = PLACEHOLDER_TIME_DATA.reduce((acc, item) => acc + item.txCount, 0);
  const avgGasPerTx = Math.round(totalGas / totalTx);

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
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <Fuel className="h-6 w-6 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold">Gas Analytics</h1>
        </div>
        <p className="text-muted-foreground">
          Gas usage patterns across Safe transactions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Gas Used"
          value={`${(totalGas / 1000000).toFixed(1)}M`}
          icon={Fuel}
          description="All time"
        />
        <StatCard
          title="Total Transactions"
          value={totalTx.toLocaleString()}
          description="All time"
        />
        <StatCard
          title="Avg Gas per Tx"
          value={avgGasPerTx.toLocaleString()}
          description="Gas units"
        />
      </div>

      {/* Gas Over Time Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Gas Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PLACEHOLDER_TIME_DATA}>
                <defs>
                  <linearGradient id="gasGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip 
                  formatter={(value) => `${(Number(value) / 1000000).toFixed(2)}M gas`}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="gasUsed" 
                  stroke="var(--primary)" 
                  fill="url(#gasGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Count Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Count Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={PLACEHOLDER_TIME_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip 
                  formatter={(value) => Number(value).toLocaleString()}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="txCount" 
                  stroke="var(--success)" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Note */}
      <Card className="mt-6 border-dashed">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Data shown is placeholder. Real-time data will be loaded from the indexer.
        </CardContent>
      </Card>
    </div>
  );
}
