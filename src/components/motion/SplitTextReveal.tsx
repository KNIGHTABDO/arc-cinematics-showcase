import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface SplitTextRevealProps {
  text: string;
  className?: string;
  by?: "char" | "word";
  stagger?: number;
  delay?: number;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}

export function SplitTextReveal({
  text,
  className,
  by = "char",
  stagger = 0.025,
  delay = 0,
  as: Tag = "h1",
}: SplitTextRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-split]");
    gsap.set(items, { yPercent: 110, opacity: 0 });
    const tween = gsap.to(items, {
      yPercent: 0,
      opacity: 1,
      duration: 1,
      ease: "power4.out",
      stagger,
      delay,
    });
    return () => {
      tween.kill();
    };
  }, [text, by, stagger, delay]);

  const tokens =
    by === "char"
      ? text.split("").map((c, i) => (
          <span
            key={i}
            data-split
            className="inline-block"
            style={{ whiteSpace: c === " " ? "pre" : "normal" }}
          >
            {c}
          </span>
        ))
      : text.split(" ").map((w, i) => (
          <span key={i} className="inline-block overflow-hidden">
            <span data-split className="inline-block">{w}</span>
            {i < text.split(" ").length - 1 ? <span>&nbsp;</span> : null}
          </span>
        ));

  return (
    <Tag
      ref={ref as never}
      className={cn("overflow-hidden inline-block", className)}
      style={{ lineHeight: 0.95 }}
    >
      <span className="inline-block" style={{ overflow: "hidden" }}>
        {tokens}
      </span>
    </Tag>
  );
}
