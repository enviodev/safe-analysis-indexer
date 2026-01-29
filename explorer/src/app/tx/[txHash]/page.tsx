import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
import { 
  ArrowLeft, 
  ExternalLink, 
  ArrowRight,
  Clock,
  Fuel,
  Hash,
  FileText,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "@/components/AddressDisplay";
import { NetworkBadge } from "@/components/NetworkBadge";
import { getTransactionsByHash } from "@/lib/graphql/queries";
import { getExplorerTxUrl, getNativeToken } from "@/lib/constants";
import { formatWei, formatDate, isValidTxHash, truncateTxHash } from "@/lib/utils";

interface TxPageProps {
  params: Promise<{
    txHash: string;
  }>;
}

export default async function TxPage({ params }: TxPageProps) {
  const { txHash } = await params;

  if (!isValidTxHash(txHash)) {
    notFound();
  }

  // Fetch transaction(s) by hash
  const transactions = await getTransactionsByHash(txHash);

  if (transactions.length === 0) {
    notFound();
  }

  // A tx hash could appear on multiple chains (rare but possible)
  const tx = transactions[0];
  const { safe } = tx;
  const explorerUrl = getExplorerTxUrl(safe.chainId, txHash);

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
          <NetworkBadge chainId={safe.chainId} size="lg" showName />
          <Badge variant="success">Executed</Badge>
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
          {txHash}
        </h1>
        <div className="text-sm text-muted-foreground">
          Safe Transaction on{" "}
          <Link 
            href={`/safe/${safe.chainId}/${safe.address}`}
            className="text-primary hover:underline"
          >
            <AddressDisplay address={safe.address} showCopy={false} />
          </Link>
        </div>
      </div>

      {/* If same tx hash on multiple chains */}
      {transactions.length > 1 && (
        <Card className="mb-6 border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <p className="text-sm">
              This transaction hash appears on {transactions.length} networks. Showing data from {" "}
              <NetworkBadge chainId={safe.chainId} size="sm" />.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Transaction Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* From (Safe) */}
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
                  {formatWei(tx.value)} {getNativeToken(safe.chainId)}
                </div>
              </div>
            </div>

            {/* Execution Date */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Execution Date</div>
                <div>{formatDate(tx.executionDate)}</div>
              </div>
            </div>

            {/* Threshold at execution */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Threshold</div>
                <div>{tx.threshold} signatures required</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Gas & Technical */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5" />
              Gas & Technical Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nonce */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Nonce</span>
              <span className="font-mono">{tx.nonce}</span>
            </div>

            {/* Operation */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Operation</span>
              <Badge variant="outline">
                {tx.operation === "0" ? "Call" : "DelegateCall"}
              </Badge>
            </div>

            {/* Safe Tx Gas */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Safe Tx Gas</span>
              <span className="font-mono">{tx.safeTxGas}</span>
            </div>

            {/* Base Gas */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Base Gas</span>
              <span className="font-mono">{tx.baseGas}</span>
            </div>

            {/* Gas Price */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Gas Price</span>
              <span className="font-mono">{tx.gasPrice}</span>
            </div>

            {/* Gas Token */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Gas Token</span>
              {tx.gasToken === "0x0000000000000000000000000000000000000000" ? (
                <span className="text-muted-foreground">Native</span>
              ) : (
                <AddressDisplay address={tx.gasToken} showCopy />
              )}
            </div>

            {/* Refund Receiver */}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Refund Receiver</span>
              {tx.refundReceiver === "0x0000000000000000000000000000000000000000" ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <AddressDisplay address={tx.refundReceiver} showCopy />
              )}
            </div>

            {/* Msg Sender */}
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Executor</span>
              <AddressDisplay 
                address={tx.msgSender}
                chainId={safe.chainId}
                showExternalLink
              />
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
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono">
              {tx.data}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Signatures Section */}
      {tx.signatures && tx.signatures !== "0x" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Signatures</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono break-all">
              {tx.signatures}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
