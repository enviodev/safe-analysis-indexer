"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ERC20TransferRow } from "@/components/ERC20TransferRow";
import type { ERC20Transfer } from "@/lib/graphql/queries";
import type { TokenInfo } from "@/lib/tokenLists";

interface Erc20TransfersListProps {
  transfers: ERC20Transfer[];
  /** True if the server fetched (limit + 1) and received limit + 1 rows. */
  hasNextPage: boolean;
  currentPage: number;
  pageSize: number;
  chainId: number;
  address: string;
  /** Pre-resolved token metadata for the rows (lowercase address -> info). */
  tokenInfoEntries: [string, TokenInfo][];
}

export function Erc20TransfersList({
  transfers,
  hasNextPage,
  currentPage,
  pageSize,
  chainId,
  address,
  tokenInfoEntries,
}: Erc20TransfersListProps) {
  const tokenInfoMap = new Map(tokenInfoEntries);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("erc20Page");
    } else {
      params.set("erc20Page", newPage.toString());
    }
    startTransition(() => {
      router.push(`/safe/${chainId}/${address}?${params.toString()}`);
    });
  };

  const startItem = transfers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = (currentPage - 1) * pageSize + transfers.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ERC20 Transfers</CardTitle>
        {transfers.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-primary mr-2">
                <Loader2 className="h-3 w-3 animate-spin" />
              </span>
            )}
            {startItem.toLocaleString()} - {endItem.toLocaleString()}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div
          className={`transition-opacity duration-200 ${
            isPending ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {transfers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No ERC20 transfers found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transfers.map((t) => (
                <ERC20TransferRow
                  key={t.id}
                  transfer={t}
                  safeAddress={address}
                  tokenInfo={tokenInfoMap.get(t.token.toLowerCase()) ?? null}
                />
              ))}
            </div>
          )}

          {(currentPage > 1 || hasNextPage) && (
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
              <span className="text-sm text-muted-foreground px-2">
                Page {currentPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasNextPage}
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
