"use client";

import { useEffect, useState, useCallback } from "react";
import { Wallet, ArrowRightLeft } from "lucide-react";
import { StatCard } from "./StatCard";
import { getGlobalStats, GlobalStats } from "@/lib/graphql/queries";

export interface LiveStatsProps {
  initialStats?: GlobalStats;
  refreshInterval?: number;
}

export function LiveStats({ 
  initialStats,
  refreshInterval = 1000 
}: LiveStatsProps) {
  const [stats, setStats] = useState<GlobalStats>(initialStats || {
    id: "global",
    totalSafes: 0,
    totalTransactions: 0,
    totalModuleTransactions: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const data = await getGlobalStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchStats();

    // Set up polling for live updates
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchStats, refreshInterval]);

  return (
    <>
      <StatCard
        title="Total Safes"
        value={stats.totalSafes.toLocaleString()}
        icon={Wallet}
        description="Across all chains"
      />
      <StatCard
        title="Total Transactions"
        value={stats.totalTransactions.toLocaleString()}
        icon={ArrowRightLeft}
        description="Executed transactions"
      />
    </>
  );
}
