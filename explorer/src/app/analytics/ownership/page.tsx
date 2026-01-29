"use client";

import Link from "next/link";
import { ArrowLeft, GitBranch, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatCard } from "@/components/StatCard";

export default function OwnershipGraphPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <Link href="/analytics">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Analytics
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <GitBranch className="h-6 w-6 text-purple-500" />
          </div>
          <h1 className="text-2xl font-bold">Ownership Graph</h1>
        </div>
        <p className="text-muted-foreground">
          Visualize connections between owners and their Safe wallets
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Unique Owners"
          value="125,000+"
          description="Addresses owning Safes"
        />
        <StatCard
          title="Avg Safes per Owner"
          value="2.3"
          description="Multi-Safe owners"
        />
        <StatCard
          title="Most Connected"
          value="47"
          description="Safes owned by one address"
        />
      </div>

      {/* Graph Placeholder */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Owner-Safe Relationship Graph</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[500px] flex items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed border-border">
            <div className="text-center">
              <GitBranch className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Interactive Graph Coming Soon</h3>
              <p className="text-muted-foreground max-w-md">
                This visualization will show the network of connections between owner addresses 
                and their Safe wallets, allowing you to explore shared ownership patterns.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Info className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium mb-2">About the Ownership Graph</h4>
              <p className="text-sm text-muted-foreground mb-4">
                The ownership graph helps identify patterns in Safe wallet management:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Discover addresses that own multiple Safes across chains</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Identify common owner groups and organizations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Explore the web of shared signers between different Safes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Find highly connected &quot;hub&quot; addresses in the Safe ecosystem</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
