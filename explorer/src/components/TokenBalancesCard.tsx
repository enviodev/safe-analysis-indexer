"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AddressDisplay } from "@/components/AddressDisplay";
import { getExplorerAddressUrl } from "@/lib/constants";
import type { SafeTokenBalance } from "@/lib/graphql/queries";
import type { TokenInfo } from "@/lib/tokenLists";
import { formatTokenAmount } from "@/lib/tokenLists";

interface BalanceWithMeta {
  balance: SafeTokenBalance;
  token: TokenInfo | null;
}

interface TokenBalancesCardProps {
  chainId: number;
  // Server-resolved at page render — keeps the card synchronous and avoids
  // an extra client roundtrip just to look up symbols.
  balances: BalanceWithMeta[];
}

export function TokenBalancesCard({ chainId, balances }: TokenBalancesCardProps) {
  const [showUnverified, setShowUnverified] = useState(false);

  const { verified, unverified, nonZero } = useMemo(() => {
    const nonZero = balances.filter((b) => BigInt(b.balance.balance) !== BigInt(0));
    return {
      verified: nonZero.filter((b) => b.token != null),
      unverified: nonZero.filter((b) => b.token == null),
      nonZero,
    };
  }, [balances]);

  const visible = showUnverified ? nonZero : verified;

  // Sort: verified first, then by inbound count desc as a rough "activity" rank.
  const sorted = useMemo(
    () =>
      [...visible].sort((a, b) => {
        if ((a.token != null) !== (b.token != null)) {
          return a.token != null ? -1 : 1;
        }
        return b.balance.inboundCount - a.balance.inboundCount;
      }),
    [visible],
  );

  // No data at all — likely the indexer endpoint doesn't have SafeTokenBalance
  // yet (older deployment). Hide entirely rather than confuse the user.
  if (balances.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Token Balances</CardTitle>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {verified.length} verified
            {unverified.length > 0 && (
              <span className="text-muted-foreground/70">
                {" · "}
                {unverified.length} unverified
              </span>
            )}
          </span>
          {unverified.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary cursor-pointer"
                checked={showUnverified}
                onChange={(e) => setShowUnverified(e.target.checked)}
              />
              Show unverified
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {verified.length === 0 && unverified.length > 0
              ? "Only unverified tokens — toggle above to inspect them."
              : "No non-zero token balances."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((row) => (
              <BalanceRow key={row.balance.id} row={row} chainId={chainId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceRow({ row, chainId }: { row: BalanceWithMeta; chainId: number }) {
  const { balance, token } = row;
  const fmt = formatTokenAmount(balance.balance, token);
  const tokenExplorerUrl = getExplorerAddressUrl(chainId, balance.token);

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {token ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500"
            title={`Listed in: ${token.sources.join(", ")}`}
          >
            <ShieldCheck className="h-3 w-3" />
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            title="Not in any verified token list"
          >
            <ShieldAlert className="h-3 w-3" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {token?.symbol ?? "Unknown"}
            </span>
            {token?.name && token.name !== token.symbol && (
              <span className="text-xs text-muted-foreground truncate">
                {token.name}
              </span>
            )}
            {tokenExplorerUrl && (
              <a
                href={tokenExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <AddressDisplay
              address={balance.token}
              chainId={chainId}
              showCopy={false}
              className="text-xs"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 ml-4">
        <span className="text-sm font-medium tabular-nums">
          {fmt.formatted} {fmt.symbol}
        </span>
        <span className="text-xs text-muted-foreground">
          {balance.inboundCount + balance.outboundCount} transfers
        </span>
      </div>
    </div>
  );
}
