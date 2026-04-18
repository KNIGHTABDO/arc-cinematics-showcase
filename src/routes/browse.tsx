import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { ContentRow } from "@/components/rows/ContentRow";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { ArcBadge } from "@/components/ui/ArcBadge";
import {
  HERO,
  CONTINUE_WATCHING,
  TRENDING,
  NEW_ON_ARC,
  BECAUSE_DUNE,
  ACCLAIMED,
  SHORTS,
} from "@/data/catalog";
import { gradientFor } from "@/lib/gradients";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse — ARC" },
      { name: "description", content: "Explore films, series, and documentaries on ARC." },
      { property: "og:title", content: "Browse — ARC" },
      { property: "og:description", content: "Explore films, series, and documentaries on ARC." },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroBgRef = useRef<HTMLDivElement>(null);
  const scrollIndicator = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (heroBgRef.current) {
      gsap.fromTo(
        heroBgRef.current,
        { scale: 1.12 },
        { scale: 1.0, duration: 6, ease: "power2.out" },
      );
    }
    if (scrollIndicator.current) {
      gsap.to(scrollIndicator.current.querySelector("[data-bar]"), {
        scaleY: 0.2,
        transformOrigin: "top center",
        repeat: -1,
        yoyo: true,
        duration: 1.4,
        ease: "power1.inOut",
      });
    }
  }, []);

  return (
    <>
      <Navbar />
      <main className="relative">
        {/* HERO */}
        <section ref={heroRef} className="relative h-[100svh] w-full overflow-hidden">
          <div
            ref={heroBgRef}
            className="absolute inset-0"
            style={{ background: gradientFor(HERO.seed, 200) }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(8,8,8,0.96) 25%, rgba(8,8,8,0.55) 60%, rgba(8,8,8,0.15) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,8,8,0.7) 0%, transparent 35%, transparent 60%, rgba(8,8,8,1) 100%)",
            }}
          />
          {/* atmospheric vignette shapes */}
          <div className="absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl" style={{ background: "var(--arc-accent)" }} />

          <div className="relative z-10 flex h-full max-w-[640px] flex-col justify-center pl-[7vw] pr-6 pt-16">
            <div className="mb-5 inline-flex items-center gap-3" style={{ animation: "fade-in 800ms ease-out 200ms both" }}>
              <span className="h-px w-8 bg-arc-accent" />
              <span className="label-caps text-arc-accent">Featured · Episode 1 Now Streaming</span>
            </div>

            <SplitTextReveal
              text={HERO.title}
              as="h1"
              className="font-display text-[clamp(48px,7.5vw,108px)] font-extrabold tracking-[-0.05em]"
              stagger={0.022}
              delay={0.15}
            />

            <p
              className="mt-6 max-w-md text-[15px] leading-relaxed text-arc-text/75"
              style={{ animation: "fade-in 800ms ease-out 700ms both" }}
            >
              {HERO.description}
            </p>

            <div
              className="mt-6 flex flex-wrap items-center gap-2"
              style={{ animation: "fade-in 800ms ease-out 850ms both" }}
            >
              <ArcBadge>★ {HERO.rating} IMDb</ArcBadge>
              <ArcBadge>4K HDR</ArcBadge>
              <ArcBadge>{HERO.cert}</ArcBadge>
              <ArcBadge>{HERO.duration}</ArcBadge>
            </div>

            <div
              className="mt-8 flex items-center gap-3"
              style={{ animation: "fade-in 800ms ease-out 1000ms both" }}
            >
              <MagneticButton variant="primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Play Now
              </MagneticButton>
              <MagneticButton variant="ghost">More Info</MagneticButton>
            </div>
          </div>

          {/* scroll indicator */}
          <div
            ref={scrollIndicator}
            className="absolute bottom-10 right-[5vw] z-10 hidden flex-col items-center gap-3 md:flex"
          >
            <span className="label-caps text-arc-text/50" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              Scroll
            </span>
            <span data-bar className="block h-12 w-px bg-arc-text/40" />
          </div>
        </section>

        {/* ROWS */}
        <div className="relative -mt-8 pb-20">
          <ContentRow label="Continue Watching" items={CONTINUE_WATCHING} variant="continue" seeAll={false} />
          <ContentRow label="Trending Now" items={TRENDING} variant="trending" />
          <ContentRow label="New on ARC" items={NEW_ON_ARC} />
          <ContentRow label='Because You Watched "Dune"' items={BECAUSE_DUNE} />
          <ContentRow label="Critically Acclaimed" items={ACCLAIMED} />
          <ContentRow label="Short Films & Documentaries" items={SHORTS} />
        </div>

        <Footer />
      </main>
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-[5vw] py-12">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <div className="font-display text-2xl font-extrabold">
            A<span className="relative">R<span className="absolute -bottom-0 -right-1 h-1.5 w-1.5" style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }} /></span>
            <span className="text-arc-accent">C</span>
          </div>
          <p className="mt-2 max-w-sm text-xs text-arc-muted">
            A cinematic streaming experience for the patient and the obsessive.
          </p>
        </div>
        <div className="flex gap-8 text-[11px] tracking-wider uppercase text-arc-muted">
          <span>© 2024 ARC</span>
          <span>Privacy</span>
          <span>Terms</span>
          <span>Press</span>
        </div>
      </div>
      <div className="arc-hue-line mt-10" />
    </footer>
  );
}
