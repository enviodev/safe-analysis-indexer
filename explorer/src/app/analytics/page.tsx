import Link from "next/link";
import { 
  BarChart3, 
  PieChart, 
  GitBranch, 
  Fuel,
  ArrowRight
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const analyticsPages = [
  {
    title: "Network Distribution",
    description: "See how Safes are distributed across different chains",
    icon: PieChart,
    href: "/analytics/networks",
    color: "text-blue-500",
  },
  {
    title: "Threshold Distribution",
    description: "Explore common threshold configurations (2/3, 3/5, etc.)",
    icon: BarChart3,
    href: "/analytics/thresholds",
    color: "text-green-500",
  },
  {
    title: "Gas Analytics",
    description: "Analyze gas usage patterns across Safe transactions",
    icon: Fuel,
    href: "/analytics/gas",
    color: "text-orange-500",
  },
  {
    title: "Ownership Graph",
    description: "Visualize connections between owners and their Safes",
    icon: GitBranch,
    href: "/analytics/ownership",
    color: "text-purple-500",
  },
];

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics</h1>
        <p className="text-muted-foreground">
          Explore insights and visualizations from Safe data
        </p>
      </div>

      {/* Analytics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {analyticsPages.map((page) => (
          <Link key={page.href} href={page.href}>
            <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg bg-muted ${page.color}`}>
                    <page.icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="mt-4">{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* Coming Soon Notice */}
      <Card className="mt-8 border-dashed">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">
            More analytics and visualizations coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
