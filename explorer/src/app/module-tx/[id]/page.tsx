import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
import {
  ArrowLeft,
  ExternalLink,
  ArrowRight,
  Clock,
  Puzzle,
  FileText,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "@/components/AddressDisplay";
import { NetworkBadge } from "@/components/NetworkBadge";
import { getModuleTransaction } from "@/lib/graphql/queries";
import { getExplorerTxUrl, getNativeToken } from "@/lib/constants";
import { formatWei, formatDate, truncateTxHash } from "@/lib/utils";

interface ModuleTxPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ModuleTxPage({ params }: ModuleTxPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const tx = await getModuleTransaction(decodedId);

  if (!tx) {
    notFound();
  }

  const { safe } = tx;
  const explorerUrl = getExplorerTxUrl(safe.chainId, tx.txHash);
  const hasValue = BigInt(tx.value) > BigInt(0);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href={`/safe/${safe.chainId}/${safe.address}`}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Safe
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <NetworkBadge chainId={safe.chainId} size="lg" showName />
          <Badge variant="outline" className="gap-1">
            <Puzzle className="h-3 w-3" />
            Module Transaction
          </Badge>
          <Badge variant="outline">
            {tx.operation === "0" ? "Call" : "DelegateCall"}
          </Badge>
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
        <h1 className="text-xl md:text-2xl font-bold font-mono break-all mb-2">
          {truncateTxHash(tx.txHash, 20, 16)}
        </h1>
        <div className="text-sm text-muted-foreground">
          Module transaction on{" "}
          <Link
            href={`/safe/${safe.chainId}/${safe.address}`}
            className="text-primary hover:underline"
          >
            <AddressDisplay address={safe.address} showCopy={false} />
          </Link>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Module */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Puzzle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Module</div>
                <AddressDisplay
                  address={tx.safeModule}
                  chainId={safe.chainId}
                  showBlockie
                  showCopy
                  showExternalLink
                />
              </div>
            </div>

            {/* Safe */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Safe</div>
                <Link
                  href={`/safe/${safe.chainId}/${safe.address}`}
                  className="hover:text-primary"
                >
                  <AddressDisplay
                    address={safe.address}
                    chainId={safe.chainId}
                    showBlockie
                    showExternalLink
                  />
                </Link>
              </div>
            </div>

            {/* To */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">To</div>
                <AddressDisplay
                  address={tx.to}
                  chainId={safe.chainId}
                  showBlockie
                  showCopy
                  showExternalLink
                />
              </div>
            </div>

            {/* Value */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Value</div>
                <div className="font-mono">
                  {hasValue
                    ? `${formatWei(tx.value)} ${getNativeToken(safe.chainId)}`
                    : `0 ${getNativeToken(safe.chainId)}`}
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {tx.timestamp && (
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">Execution Date</div>
                  <div>{formatDate(tx.timestamp)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column - Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Operation */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Operation</span>
              <Badge variant="outline">
                {tx.operation === "0" ? "Call" : "DelegateCall"}
              </Badge>
            </div>

            {/* Transaction Hash */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Tx Hash</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{truncateTxHash(tx.txHash)}</span>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Entity ID */}
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-sm text-muted-foreground">{tx.id}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Section */}
      {tx.data && tx.data !== "0x" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Transaction Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono break-all whitespace-pre-wrap">
              {tx.data}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
