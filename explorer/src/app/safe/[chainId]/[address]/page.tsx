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
import { TransactionRow } from "@/components/TransactionRow";
import { StatCard } from "@/components/StatCard";
import { 
  getSafe, 
  getSafesByAddress, 
  getSafeTransactions,
  getSafeModuleTransactions 
} from "@/lib/graphql/queries";
import { getExplorerAddressUrl, getExplorerTxUrl } from "@/lib/constants";
import { formatDate, formatSafeVersion } from "@/lib/utils";

interface SafePageProps {
  params: Promise<{
    chainId: string;
    address: string;
  }>;
}

export default async function SafePage({ params }: SafePageProps) {
  const { chainId: chainIdStr, address } = await params;
  const chainId = parseInt(chainIdStr);

  if (isNaN(chainId)) {
    notFound();
  }

  // Fetch Safe data
  const safe = await getSafe(chainId, address);

  if (!safe) {
    notFound();
  }

  // Fetch related data in parallel
  const [allChainSafes, transactions, moduleTransactions] = await Promise.all([
    getSafesByAddress(address),
    getSafeTransactions(safe.id, 20),
    getSafeModuleTransactions(safe.id, 10),
  ]);

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
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
            </CardContent>
          </Card>

          {/* Module Transactions */}
          {moduleTransactions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Module Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {moduleTransactions.map((tx) => (
                    <div 
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          Module: <AddressDisplay address={tx.safeModule} showCopy />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          To: <AddressDisplay address={tx.to} showCopy />
                        </div>
                      </div>
                      {tx.txHash && (
                        <a
                          href={getExplorerTxUrl(chainId, tx.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          View tx
                        </a>
                      )}
                    </div>
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
