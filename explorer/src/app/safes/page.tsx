import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { SafesList } from "./SafesList";
import { getNetworks, getPaginatedSafes, getVersions } from "@/lib/graphql/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ page?: string; chains?: string; versions?: string }>;
}

export default async function SafesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  
  // Parse comma-separated chain IDs
  const chainIds = params.chains 
    ? params.chains.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
    : undefined;
  
  // Parse comma-separated versions
  const versions = params.versions 
    ? params.versions.split(",").map(v => v.trim()).filter(v => v.length > 0)
    : undefined;
  
  const limit = 20;
  const offset = (page - 1) * limit;

  const [{ safes, total }, networks, allVersions] = await Promise.all([
    getPaginatedSafes(limit, offset, chainIds, versions),
    getNetworks(),
    getVersions(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">All Safes</h1>
        </div>
        <p className="text-muted-foreground">
          Browse all Safe wallets across networks
        </p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <SafesList 
          initialSafes={safes}
          networks={networks}
          versions={allVersions}
          currentPage={page}
          totalPages={totalPages}
          totalSafes={total}
          selectedChainIds={chainIds || []}
          selectedVersions={versions || []}
        />
      </Suspense>
    </div>
  );
}
