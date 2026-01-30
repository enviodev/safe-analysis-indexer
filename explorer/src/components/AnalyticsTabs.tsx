"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "networks",
    label: "Network Distribution",
    href: "/analytics/networks",
    enabled: true,
  },
  {
    id: "thresholds",
    label: "Thresholds",
    href: "/analytics/thresholds",
    enabled: false,
  },
  {
    id: "gas",
    label: "Gas Analytics",
    href: "/analytics/gas",
    enabled: false,
  },
  {
    id: "ownership",
    label: "Ownership",
    href: "/analytics/ownership",
    enabled: false,
  },
];

interface AnalyticsTabsProps {
  className?: string;
}

export function AnalyticsTabs({ className }: AnalyticsTabsProps) {
  const pathname = usePathname();

  return (
    <div className={cn("border-b border-border", className)}>
      <nav className="flex gap-1" aria-label="Analytics navigation">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          
          if (tab.enabled) {
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors relative",
                  "hover:text-foreground",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </Link>
            );
          }

          return (
            <span
              key={tab.id}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground/50 cursor-not-allowed flex items-center gap-2"
              title="Coming Soon"
            >
              {tab.label}
              <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                Soon
              </span>
            </span>
          );
        })}
      </nav>
    </div>
  );
}
