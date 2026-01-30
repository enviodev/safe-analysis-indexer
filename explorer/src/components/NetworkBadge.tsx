import Image from "next/image";
import { cn } from "@/lib/utils";
import { getChain, getChainIcon } from "@/lib/constants";

export interface NetworkBadgeProps {
  chainId: number;
  showName?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function NetworkBadge({ 
  chainId, 
  showName = false, 
  size = "md",
  className 
}: NetworkBadgeProps) {
  const chain = getChain(chainId);
  const iconPath = getChainIcon(chainId);

  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={chain.name}>
      {iconPath ? (
        <span className={cn("relative rounded-full overflow-hidden flex-shrink-0 bg-white", sizeClasses[size])}>
          <Image
            src={iconPath}
            alt={chain.name}
            fill
            className="object-contain p-0.5"
          />
        </span>
      ) : (
        // Fallback: colored circle with chain initial
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0",
            size === "sm" && "w-5 h-5 text-xs",
            size === "md" && "w-6 h-6 text-xs",
            size === "lg" && "w-8 h-8 text-sm"
          )}
          style={{ backgroundColor: chain.color }}
        >
          {chain.shortName.charAt(0)}
        </span>
      )}
      {showName && (
        <span className={cn("font-medium", {
          "text-xs": size === "sm",
          "text-sm": size === "md",
          "text-base": size === "lg",
        })}>
          {chain.name}
        </span>
      )}
    </span>
  );
}
