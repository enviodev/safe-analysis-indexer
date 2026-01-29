"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { TransactionRow } from "./TransactionRow";
import { getRecentTransactions, SafeTransaction } from "@/lib/graphql/queries";

export interface LiveFeedProps {
  initialTransactions?: SafeTransaction[];
  limit?: number;
  refreshInterval?: number; // in ms
}

export function LiveFeed({ 
  initialTransactions = [], 
  limit = 10,
  refreshInterval = 1000 // 1 second for live updates
}: LiveFeedProps) {
  const [transactions, setTransactions] = useState<SafeTransaction[]>(initialTransactions);
  const [isLoading, setIsLoading] = useState(initialTransactions.length === 0);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await getRecentTransactions(limit);
      setTransactions(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError("Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    // Initial fetch
    fetchTransactions();

    // Set up polling for live updates
    const interval = setInterval(fetchTransactions, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchTransactions, refreshInterval]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Transactions
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading transactions...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            {error}
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No transactions found
          </div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
