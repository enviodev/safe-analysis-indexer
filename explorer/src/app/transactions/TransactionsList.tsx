"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Filter, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransactionRow } from "@/components/TransactionRow";
import { NetworkBadge } from "@/components/NetworkBadge";
import { getChain } from "@/lib/constants";
import type { SafeTransaction, Network } from "@/lib/graphql/queries";

interface TransactionsListProps {
  initialTransactions: SafeTransaction[];
  networks: Network[];
  currentPage: number;
  totalPages: number;
  totalTransactions: number;
  selectedChainIds: number[];
}

export function TransactionsList({
  initialTransactions,
  networks,
  currentPage,
  totalPages,
  totalTransactions,
  selectedChainIds,
}: TransactionsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChainToggle = (chainId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    let newChainIds: number[];

    if (selectedChainIds.includes(chainId)) {
      // Remove the chain
      newChainIds = selectedChainIds.filter(id => id !== chainId);
    } else {
      // Add the chain
      newChainIds = [...selectedChainIds, chainId];
    }

    if (newChainIds.length > 0) {
      params.set("chains", newChainIds.join(","));
    } else {
      params.delete("chains");
    }
    params.set("page", "1"); // Reset to first page when filtering
    startTransition(() => {
      router.push(`/transactions?${params.toString()}`);
    });
  };

  const handleClearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chains");
    params.set("page", "1");
    startTransition(() => {
      router.push(`/transactions?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/transactions?${params.toString()}`);
    });
  };

  // Sort networks by transaction count for the filter dropdown
  const sortedNetworks = [...networks].sort(
    (a, b) => b.numberOfTransactions - a.numberOfTransactions
  );

  const hasFilters = selectedChainIds.length > 0;

  return (
    <div>
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filter by network:</span>
            </div>

            {/* Clear Filters Button */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear ({selectedChainIds.length})
              </Button>
            )}

            {/* Network Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              {sortedNetworks.map((network) => {
                const chainId = parseInt(network.id);
                const isSelected = selectedChainIds.includes(chainId);
                return (
                  <Button
                    key={network.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChainToggle(chainId)}
                    className="gap-1.5"
                  >
                    <NetworkBadge chainId={chainId} size="sm" />
                    <span className="hidden sm:inline">{getChain(chainId).name}</span>
                    <span className="text-xs opacity-70">
                      ({network.numberOfTransactions.toLocaleString()})
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Info */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 text-primary mr-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          )}
          Showing {initialTransactions.length > 0 ? ((currentPage - 1) * 20 + 1).toLocaleString() : 0} - {Math.min(currentPage * 20, totalTransactions).toLocaleString()} of {totalTransactions.toLocaleString()} transactions
          {hasFilters && (
            <span>
              {" "}on {selectedChainIds.length === 1 
                ? getChain(selectedChainIds[0]).name 
                : `${selectedChainIds.length} networks`}
            </span>
          )}
        </p>
      </div>

      {/* Transactions List and Pagination */}
      <div className={`transition-opacity duration-200 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
        <Card>
          <CardContent className="p-0">
            {initialTransactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No transactions found
              </div>
            ) : (
              <div className="divide-y divide-border">
                {initialTransactions.map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {/* First page */}
            {currentPage > 3 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  className="min-w-10 px-3"
                >
                  1
                </Button>
                {currentPage > 4 && (
                  <span className="px-1 text-muted-foreground">...</span>
                )}
              </>
            )}

            {/* Page numbers around current */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              if (pageNum < 1 || pageNum > totalPages) return null;
              if (currentPage > 3 && pageNum === 1) return null;
              if (currentPage < totalPages - 2 && pageNum === totalPages) return null;

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className="min-w-10 px-3"
                >
                  {pageNum}
                </Button>
              );
            })}

            {/* Last page */}
            {currentPage < totalPages - 2 && (
              <>
                {currentPage < totalPages - 3 && (
                  <span className="px-1 text-muted-foreground">...</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  className="min-w-10 px-3"
                >
                  {totalPages}
                </Button>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}
