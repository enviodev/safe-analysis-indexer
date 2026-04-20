import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
import { 
  ArrowLeft, 
  ExternalLink, 
  CheckCircle, 
  XCircle, 
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "@/components/AddressDisplay";
import { NetworkBadge } from "@/components/NetworkBadge";
import { OwnersList } from "@/components/OwnersList";
import { MultichainInfoBox } from "@/components/MultichainInfoBox";
import { ModuleTransactionRow } from "@/components/ModuleTransactionRow";
import { SafeTransactionsList } from "./SafeTransactionsList";
import { Erc20TransfersList } from "./Erc20TransfersList";
import { TokenBalancesCard } from "@/components/TokenBalancesCard";
import { StatCard } from "@/components/StatCard";
import {
  getSafe,
  getSafesByAddress,
  getSafeTransactions,
  getSafeModuleTransactions,
  getSafeErc20Transfers,
  getSafeTokenBalances,
} from "@/lib/graphql/queries";
import { getTokenInfoMap } from "@/lib/tokenLists";
import { getExplorerAddressUrl, getExplorerTxUrl } from "@/lib/constants";
import { formatDate, formatSafeVersion } from "@/lib/utils";

interface SafePageProps {
  params: Promise<{
    chainId: string;
    address: string;
  }>;
  searchParams: Promise<{ page?: string; erc20Page?: string }>;
}

export default async function SafePage({ params, searchParams }: SafePageProps) {
  const { chainId: chainIdStr, address } = await params;
  const { page: pageStr, erc20Page: erc20PageStr } = await searchParams;
  const chainId = parseInt(chainIdStr);
  const page = parseInt(pageStr || "1", 10);
  const erc20Page = parseInt(erc20PageStr || "1", 10);

  if (isNaN(chainId)) {
    notFound();
  }

  // Fetch Safe data
  const safe = await getSafe(chainId, address);

  if (!safe) {
    notFound();
  }

  // Calculate pagination
  const limit = 20;
  const offset = (page - 1) * limit;
  const totalTransactions = safe.numberOfSuccessfulExecutions + safe.numberOfFailedExecutions;
  const totalPages = Math.ceil(totalTransactions / limit);

  // ERC20 transfer pagination — fetch limit+1 so we can detect a next page
  // without relying on *_aggregate (not exposed on this endpoint).
  const erc20PageSize = 20;
  const erc20Offset = (erc20Page - 1) * erc20PageSize;

  // Fetch related data in parallel
  const [allChainSafes, transactions, moduleTransactions, erc20Transfers, tokenBalances] = await Promise.all([
    getSafesByAddress(address),
    getSafeTransactions(safe.id, limit, offset),
    getSafeModuleTransactions(safe.id, 10),
    getSafeErc20Transfers(chainId, address, erc20PageSize + 1, erc20Offset),
    getSafeTokenBalances(chainId, address),
  ]);
  const erc20HasNextPage = erc20Transfers.length > erc20PageSize;
  const erc20TransfersPage = erc20HasNextPage ? erc20Transfers.slice(0, erc20PageSize) : erc20Transfers;

  // Resolve token metadata once for the whole page (balances + transfer rows).
  const tokenAddresses = Array.from(
    new Set([
      ...tokenBalances.map((b) => b.token),
      ...erc20TransfersPage.map((t) => t.token),
    ]),
  );
  const tokenInfoMap = await getTokenInfoMap(chainId, tokenAddresses);
  const tokenInfoEntries = Array.from(tokenInfoMap.entries());
  const balancesWithMeta = tokenBalances.map((balance) => ({
    balance,
    token: tokenInfoMap.get(balance.token.toLowerCase()) ?? null,
  }));

  const explorerUrl = getExplorerAddressUrl(chainId, address);
  const creationTxUrl = getExplorerTxUrl(chainId, safe.creationTxHash);
  
  // Use the most recent transaction's threshold if available (more accurate than safe.threshold which might be initial value)
  const currentThreshold = transactions.length > 0 && transactions[0].threshold > 0 
    ? transactions[0].threshold 
    : safe.threshold;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href="/">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <NetworkBadge chainId={chainId} size="lg" showName />
          <Badge variant="outline">{formatSafeVersion(safe.version)}</Badge>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        <h1 className="text-2xl font-bold mb-2">
          <AddressDisplay 
            address={address} 
            truncate={false}
            showBlockie
            showCopy
            blockieSize={32}
          />
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Created: {safe.creationTimestamp ? formatDate(safe.creationTimestamp) : "Unknown"}
            {creationTxUrl && (
              <a 
                href={creationTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline ml-1"
              >
                (View tx)
              </a>
            )}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Successful Executions"
          value={safe.numberOfSuccessfulExecutions}
          icon={CheckCircle}
        />
        <StatCard
          title="Failed Executions"
          value={safe.numberOfFailedExecutions}
          icon={XCircle}
        />
        {/* Multichain Info - takes up remaining 2 columns if present */}
        {allChainSafes.length > 1 && (
          <div className="md:col-span-2">
            <MultichainInfoBox 
              currentChainId={chainId} 
              safes={allChainSafes}
            />
          </div>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Transactions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Safe Transactions */}
          <SafeTransactionsList
            transactions={transactions}
            currentPage={page}
            totalPages={totalPages}
            totalTransactions={totalTransactions}
            chainId={chainId}
            address={address}
          />

          {/* Per-token balances rolled up from ERC20 in/out flow.
              Renders nothing if the indexer endpoint doesn't yet expose
              SafeTokenBalance (older deployment). */}
          <TokenBalancesCard chainId={chainId} balances={balancesWithMeta} />

          {/* ERC20 Transfers (in & out of the Safe) */}
          <Erc20TransfersList
            transfers={erc20TransfersPage}
            hasNextPage={erc20HasNextPage}
            currentPage={erc20Page}
            pageSize={erc20PageSize}
            chainId={chainId}
            address={address}
            tokenInfoEntries={tokenInfoEntries}
          />

          {/* Module Transactions */}
          {moduleTransactions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Module Transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {moduleTransactions.map((tx) => (
                    <ModuleTransactionRow key={tx.id} transaction={tx} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Owners */}
        <div>
          <OwnersList 
            owners={safe.owners} 
            threshold={currentThreshold}
            chainId={chainId}
          />
        </div>
      </div>
    </div>
  );
}
