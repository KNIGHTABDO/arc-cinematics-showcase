import { useEffect, useRef } from "react";
import { MovieCard, TrendingCard, ContinueCard, type TMDBMovie } from "@/components/cards/MovieCard";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";

interface ContentRowProps {
  label: string;
  items: TMDBMovie[];
  variant?: "default" | "continue" | "trending";
  seeAll?: boolean;
  linkPrefix?: string;
}

export function ContentRow({ label, items, variant = "default", seeAll = true, linkPrefix }: ContentRowProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cursor = useCursorHover("link");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    
    // We use matchMedia logic to ensure animations are clean. But GSAP scrollTriggers handle most.
    const wrap = wrapRef.current;
    const scroller = scrollerRef.current;
    if (!wrap || !scroller) return;
    
    // Safety check if items list is empty, avoid setting GSAP on empty children arrays
    if (scroller.children.length === 0) return;

    let ctx = gsap.context(() => {
        const cards = scroller.children;
        gsap.set(cards, { y: 36, opacity: 0 });
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: { trigger: wrap, start: "top 85%", once: true },
        });
    }, wrapRef);
    
    return () => ctx.revert();
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

  if (!items || items.length === 0) return null;

  return (
    <section
      ref={wrapRef}
      className={`relative ${
        variant === "continue"
          ? "py-10 bg-gradient-to-b from-arc-surface/30 to-transparent"
          : "py-8"
      }`}
    >
      <div className="mb-5 flex items-end justify-between px-[5vw]">
        <div>
          {variant === "continue" && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-arc-accent/80">
              Pick up where you left off
            </p>
          )}
          <h2
            className={`label-caps ${
              variant === "continue" ? "text-arc-text text-[11px]" : "text-arc-text/80"
            }`}
          >
            {label}
          </h2>
        </div>
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
          ? items.map((m, i) => <TrendingCard key={m.id} movie={m} rank={i + 1} linkPrefix={linkPrefix} />)
          : variant === "continue"
            ? items.map((m) => <ContinueCard key={m.id} movie={m} />)
            : items.map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  showProgress={false}
                  width={200}
                  linkPrefix={linkPrefix}
                />
              ))}
      </div>
    </section>
  );
}
