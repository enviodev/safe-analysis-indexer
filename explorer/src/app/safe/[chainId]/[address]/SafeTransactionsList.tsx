"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransactionRow } from "@/components/TransactionRow";
import type { SafeTransaction } from "@/lib/graphql/queries";

interface SafeTransactionsListProps {
  transactions: SafeTransaction[];
  currentPage: number;
  totalPages: number;
  totalTransactions: number;
  chainId: number;
  address: string;
}

export function SafeTransactionsList({
  transactions,
  currentPage,
  totalPages,
  totalTransactions,
  chainId,
  address,
}: SafeTransactionsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/safe/${chainId}/${address}?${params.toString()}`);
    });
  };

  const limit = 20;
  const startItem = transactions.length > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = Math.min(currentPage * limit, totalTransactions);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transactions</CardTitle>
        {totalTransactions > 0 && (
          <span className="text-sm text-muted-foreground">
            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-primary mr-2">
                <Loader2 className="h-3 w-3 animate-spin" />
              </span>
            )}
            {startItem.toLocaleString()} - {endItem.toLocaleString()} of {totalTransactions.toLocaleString()}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className={`transition-opacity duration-200 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No transactions found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <TransactionRow 
                  key={tx.id} 
                  transaction={tx} 
                  showSafe={false}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-border">
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
      </CardContent>
    </Card>
  );
}
