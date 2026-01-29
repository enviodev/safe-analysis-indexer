"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { cn, detectSearchType } from "@/lib/utils";

export interface SearchInputProps {
  placeholder?: string;
  className?: string;
  size?: "default" | "lg";
  autoFocus?: boolean;
}

export function SearchInput({
  placeholder,
  className,
  size = "default",
  autoFocus = false,
}: SearchInputProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Default placeholder with keyboard shortcut hint
  const defaultPlaceholder = size === "lg" 
    ? "Search address or tx hash... (⌘K)"
    : "Search... (⌘K)";

  // Global keyboard shortcut: Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);

    try {
      const searchType = detectSearchType(trimmed);

      if (searchType === "txHash") {
        // Navigate to transaction page
        router.push(`/tx/${trimmed}`);
      } else if (searchType === "address") {
        // Navigate to search results (will determine if Safe or Owner)
        router.push(`/search?q=${trimmed}`);
      } else {
        // Unknown format - still try search
        router.push(`/search?q=${trimmed}`);
      }
    } finally {
      setIsSearching(false);
    }
  }, [query, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className={cn(
          "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "h-5 w-5" : "h-4 w-4"
        )} />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          autoFocus={autoFocus}
          className={cn(
            "pl-10",
            size === "lg" && "h-12 text-base"
          )}
        />
      </div>
      <Button
        onClick={handleSearch}
        disabled={isSearching || !query.trim()}
        size={size === "lg" ? "lg" : "default"}
      >
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Search"
        )}
      </Button>
    </div>
  );
}
