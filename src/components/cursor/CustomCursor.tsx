import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursor } from "@/lib/cursor-context";

export function CustomCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const { state } = useCursor();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { x: target.x, y: target.y };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    window.addEventListener("mousemove", onMove);

    const tick = () => {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      gsap.set(el, { x: pos.x, y: pos.y });
    };
    gsap.ticker.add(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div ref={ref} className="arc-cursor" data-state={state} aria-hidden>
      {state === "card" ? "▶" : ""}
    </div>
  );
}
