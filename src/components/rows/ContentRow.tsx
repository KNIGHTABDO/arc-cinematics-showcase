import { useEffect, useRef } from "react";
import type { Title } from "@/data/catalog";
import { MovieCard, TrendingCard } from "@/components/cards/MovieCard";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";

interface ContentRowProps {
  label: string;
  items: Title[];
  variant?: "default" | "continue" | "trending";
  seeAll?: boolean;
}

export function ContentRow({ label, items, variant = "default", seeAll = true }: ContentRowProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cursor = useCursorHover("link");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const wrap = wrapRef.current;
    const scroller = scrollerRef.current;
    if (!wrap || !scroller) return;
    const cards = scroller.children;
    gsap.set(cards, { y: 36, opacity: 0 });
    const tween = gsap.to(cards, {
      y: 0,
      opacity: 1,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.06,
      scrollTrigger: { trigger: wrap, start: "top 85%", once: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [items]);

  // Drag-to-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    const down = (e: PointerEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft - (x - startX) * 1.2;
    };
    const up = () => {
      isDown = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <section ref={wrapRef} className="relative py-8">
      <div className="mb-4 flex items-end justify-between px-[5vw]">
        <h2 className="label-caps text-arc-text/80">{label}</h2>
        {seeAll && (
          <button
            {...cursor}
            className="label-caps text-arc-text/60 transition hover:text-arc-accent"
          >
            See All →
          </button>
        )}
      </div>
      <div
        ref={scrollerRef}
        className="no-scrollbar flex gap-4 overflow-x-auto px-[5vw] pb-2"
        style={{ cursor: "grab" }}
      >
        {variant === "trending"
          ? items.map((t, i) => <TrendingCard key={t.id} title={t} rank={i + 1} />)
          : items.map((t) => (
              <MovieCard
                key={t.id}
                title={t}
                showProgress={variant === "continue"}
                width={variant === "continue" ? 280 : 200}
              />
            ))}
      </div>
    </section>
  );
}
