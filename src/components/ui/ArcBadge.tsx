import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ArcBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold tracking-wider tabular text-arc-text/90",
        className,
      )}
    >
      {children}
    </span>
  );
}
