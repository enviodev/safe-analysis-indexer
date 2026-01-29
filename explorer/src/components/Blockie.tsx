"use client";

import { useEffect, useState } from "react";
import makeBlockie from "ethereum-blockies-base64";
import { cn } from "@/lib/utils";

export interface BlockieProps {
  address: string;
  size?: number;
  className?: string;
}

export function Blockie({ address, size = 32, className }: BlockieProps) {
  const [blockieUrl, setBlockieUrl] = useState<string>("");

  useEffect(() => {
    if (address) {
      try {
        const url = makeBlockie(address.toLowerCase());
        setBlockieUrl(url);
      } catch (e) {
        console.error("Failed to generate blockie:", e);
      }
    }
  }, [address]);

  if (!blockieUrl) {
    return (
      <div
        className={cn("rounded-full bg-muted", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={blockieUrl}
      alt={`Avatar for ${address}`}
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
