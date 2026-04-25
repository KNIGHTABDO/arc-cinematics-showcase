import { useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";
import { cn } from "@/lib/utils";

interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "ghost" | "icon";
  strength?: number;
}

export function MagneticButton({
  children,
  variant = "primary",
  strength = 8,
  className,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const cursor = useCursorHover("link");

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2 * strength;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2 * strength;
    gsap.to(el, { x, y, duration: 0.4, ease: "power3.out" });
  };

  const onLeave = () => {
    cursor.onMouseLeave();
    if (prefersReducedMotion()) return;
    if (ref.current)
      gsap.to(ref.current, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.3)" });
  };

  const base =
    "relative inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-colors duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-arc-void focus-visible:ring-arc-accent rounded-full";

  const variants = {
    primary: "bg-arc-accent text-arc-void hover:bg-arc-accent/90 px-7 h-12 text-[15px] arc-glow",
    ghost:
      "border border-white/15 bg-white/5 text-arc-text hover:bg-white/10 backdrop-blur-md px-7 h-12 text-[15px]",
    icon: "h-11 w-11 border border-white/15 bg-white/5 text-arc-text hover:bg-white/10 hover:border-arc-accent/40",
  };

  return (
    <button
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={cursor.onMouseEnter}
      onMouseLeave={onLeave}
      className={cn(base, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}
