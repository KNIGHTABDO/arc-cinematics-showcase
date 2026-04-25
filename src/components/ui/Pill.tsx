import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Pill({
  children,
  active,
  className,
  ...props
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition-colors",
        active
          ? "border-transparent bg-arc-accent text-arc-void"
          : "border-white/15 bg-white/5 text-arc-text/80 hover:border-arc-accent/40 hover:text-arc-text",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
