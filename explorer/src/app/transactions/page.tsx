import { Suspense } from "react";
import { Activity } from "lucide-react";
import { TransactionsList } from "./TransactionsList";
import { getNetworks, getPaginatedTransactions } from "@/lib/graphql/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ page?: string; chains?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  
  // Parse comma-separated chain IDs
  const chainIds = params.chains 
    ? params.chains.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
    : undefined;
  
  const limit = 20;
  const offset = (page - 1) * limit;

  const [{ transactions, total }, networks] = await Promise.all([
    getPaginatedTransactions(limit, offset, chainIds),
    getNetworks(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">All Transactions</h1>
        </div>
        <p className="text-muted-foreground">
          Browse all Safe transactions across networks
        </p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <TransactionsList 
          initialTransactions={transactions}
          networks={networks}
          currentPage={page}
          totalPages={totalPages}
          totalTransactions={total}
          selectedChainIds={chainIds || []}
        />
      </Suspense>
    </div>
  );
}
