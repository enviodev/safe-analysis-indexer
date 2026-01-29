"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Github } from "lucide-react";
import { Button } from "../ui/Button";
import { SearchInput } from "../SearchInput";
import { GITHUB_URL } from "@/lib/constants";
import { useEffect, useState } from "react";

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="font-bold text-xl">
          <span className="text-primary">Safe</span>scan
        </Link>

        {/* Search - hidden on mobile and on home page */}
        {!isHomePage && (
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <SearchInput 
              placeholder="Search address or tx hash..." 
              className="w-full"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* GitHub Link */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
          >
            <Button variant="ghost" size="icon">
              <Github className="h-5 w-5" />
            </Button>
          </a>

          {/* Theme Toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile search - shown below header on mobile, but not on home page */}
      {!isHomePage && (
        <div className="md:hidden border-t border-border px-4 py-2">
          <SearchInput 
            placeholder="Search..." 
            className="w-full"
          />
        </div>
      )}
    </header>
  );
}
