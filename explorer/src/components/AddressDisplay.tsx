"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { cn, truncateAddress } from "@/lib/utils";
import { getExplorerAddressUrl } from "@/lib/constants";
import { Blockie } from "./Blockie";
import Link from "next/link";

export interface AddressDisplayProps {
  address: string;
  chainId?: number;
  showBlockie?: boolean;
  showCopy?: boolean;
  showExternalLink?: boolean;
  truncate?: boolean;
  linkTo?: string;
  className?: string;
  blockieSize?: number;
}

export function AddressDisplay({
  address,
  chainId,
  showBlockie = false,
  showCopy = true,
  showExternalLink = false,
  truncate = true,
  linkTo,
  className,
  blockieSize = 20,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const displayAddress = truncate ? truncateAddress(address) : address;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = chainId ? getExplorerAddressUrl(chainId, address) : "";

  // When linkTo is provided, we can't nest another <a> inside, so skip external link
  const canShowExternalLink = showExternalLink && explorerUrl && !linkTo;

  const content = (
    <span className={cn("inline-flex items-center gap-2 font-mono text-sm", className)}>
      {showBlockie && <Blockie address={address} size={blockieSize} />}
      <span className="hover:text-primary transition-colors">{displayAddress}</span>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copy address"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
      {canShowExternalLink && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="View on explorer"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </span>
  );

  if (linkTo) {
    return (
      <Link href={linkTo} className="hover:underline">
        {content}
      </Link>
    );
  }

  return content;
}
