import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { gradientFor } from "@/lib/gradients";
import { HERO } from "@/data/catalog";
import { useCursorHover } from "@/lib/cursor-context";

export function MiniPlayer() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0.32);
  const linkCursor = useCursorHover("link");

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.85);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    if (prefersReducedMotion()) {
      gsap.set(ref.current, { autoAlpha: visible ? 1 : 0, y: 0 });
      return;
    }
    if (visible) {
      gsap.fromTo(
        ref.current,
        { autoAlpha: 0, y: 30, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" },
      );
    } else {
      gsap.to(ref.current, { autoAlpha: 0, y: 30, scale: 0.96, duration: 0.35, ease: "power2.in" });
    }
  }, [visible]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 1 ? 0 : p + 0.0025));
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const time = (frac: number) => {
    const total = 138 * 60; // 2h 18m
    const s = Math.round(total * frac);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  return (
    <div
      ref={ref}
      className="fixed bottom-5 right-5 z-40 hidden w-[340px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[oklch(0.15_0_0/0.85)] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl md:block"
      style={{ opacity: 0 }}
    >
      <div className="flex items-stretch">
        <Link
          to="/title/$id"
          params={{ id: HERO.id }}
          {...linkCursor}
          className="relative h-[88px] w-[64px] shrink-0 overflow-hidden"
          style={{ background: gradientFor(HERO.seed) }}
          aria-label={`Open ${HERO.title}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_60%)]" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
          <div className="label-caps text-arc-accent/90">Now Playing</div>
          <div className="mt-1 truncate font-display text-[15px] font-bold leading-tight text-arc-text">
            {HERO.title}
          </div>
          <div className="mt-0.5 text-[11px] text-arc-muted">S1 · E1 · {HERO.duration}</div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setProgress((p) => Math.max(0, p - 0.05))}
              className="text-arc-text/70 transition hover:text-arc-text"
              aria-label="Back 10s"
            >
              <SkipBack />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-arc-accent text-arc-void transition hover:bg-arc-accent/90"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={() => setProgress((p) => Math.min(1, p + 0.05))}
              className="text-arc-text/70 transition hover:text-arc-text"
              aria-label="Forward 10s"
            >
              <SkipFwd />
            </button>
            <span className="ml-auto tabular text-[10px] text-arc-muted">
              {time(progress)} / 2:18
            </span>
          </div>
        </div>

        <button
          onClick={() => setVisible(false)}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-arc-muted transition hover:bg-white/10 hover:text-arc-text"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="relative h-[3px] w-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 bg-arc-accent transition-[width] duration-200 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-arc-accent shadow-[0_0_12px_var(--arc-glow)]"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function PlayIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
}
function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function SkipBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
    </svg>
  );
}
function SkipFwd() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
    </svg>
  );
}
