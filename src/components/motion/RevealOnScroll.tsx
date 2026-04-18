import { useEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap";

interface RevealProps {
  children: ReactNode;
  stagger?: number;
  y?: number;
  delay?: number;
  selector?: string;
  className?: string;
}

export function RevealOnScroll({
  children,
  stagger = 0.08,
  y = 30,
  delay = 0,
  selector,
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const targets = selector ? el.querySelectorAll(selector) : Array.from(el.children);
    if (!targets.length) return;

    gsap.set(targets, { y, opacity: 0 });
    const tween = gsap.to(targets, {
      y: 0,
      opacity: 1,
      duration: 0.8,
      ease: "power3.out",
      stagger,
      delay,
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [stagger, y, delay, selector]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
