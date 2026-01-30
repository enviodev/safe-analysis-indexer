import { Suspense } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";
import { ArrowLeft, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { SafeCard } from "@/components/SafeCard";
import { Blockie } from "@/components/Blockie";
import { AddressDisplay } from "@/components/AddressDisplay";
import { SearchInput } from "@/components/SearchInput";
import { searchByAddress } from "@/lib/graphql/queries";
import { isValidAddress } from "@/lib/utils";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

async function SearchResults({ query }: { query: string }) {
  if (!query) {
    return (
      <div className="text-center py-12">
        <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          Enter an address or transaction hash to search
        </p>
      </div>
    );
  }

  if (!isValidAddress(query)) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-2">Invalid address format</p>
        <p className="text-muted-foreground text-sm">
          Please enter a valid Ethereum address (0x...)
        </p>
      </div>
    );
  }

  const { safes, ownedSafes } = await searchByAddress(query);
  const hasSafes = safes.length > 0;
  const hasOwnedSafes = ownedSafes.length > 0;
  const hasResults = hasSafes || hasOwnedSafes;

  if (!hasResults) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">No results found for</p>
        <p className="font-mono text-sm break-all">{query}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Address is a Safe */}
      {hasSafes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Safe Wallets ({safes.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              This address is a Safe wallet on {safes.length} network{safes.length > 1 ? "s" : ""}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {safes.map((safe) => (
                <SafeCard key={safe.id} safe={safe} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address owns Safes */}
      {hasOwnedSafes && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Blockie address={query} size={40} />
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Owned Safes ({ownedSafes.length})
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  This address owns {ownedSafes.length} Safe{ownedSafes.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <Link 
              href={`/owner/${query}`}
              className="text-primary hover:underline text-sm"
            >
              View full owner page →
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ownedSafes.slice(0, 6).map((safe) => (
                <SafeCard key={safe.id} safe={safe} />
              ))}
            </div>
            {ownedSafes.length > 6 && (
              <div className="mt-4 text-center">
                <Link href={`/owner/${query}`}>
                  <Button variant="outline">
                    View all {ownedSafes.length} Safes
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: query = "" } = await searchParams;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href="/">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Link>

      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-4">Search Results</h1>
        <SearchInput 
          placeholder="Search by address..." 
          className="max-w-xl"
        />
        {query && (
          <p className="text-sm text-muted-foreground mt-2">
            Showing results for: <span className="font-mono">{query}</span>
          </p>
        )}
      </div>

      {/* Results */}
      <Suspense 
        fallback={
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-4">Searching...</p>
          </div>
        }
      >
        <SearchResults query={query} />
      </Suspense>
    </div>
  );
}
