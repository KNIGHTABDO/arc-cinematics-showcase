import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { PROFILES } from "@/data/profiles";
import { avatarGradient } from "@/lib/gradients";
import { useCursorHover } from "@/lib/cursor-context";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Who's watching? — ARC" },
      { name: "description", content: "Choose a profile to start watching on ARC." },
      { property: "og:title", content: "Who's watching? — ARC" },
      { property: "og:description", content: "Choose a profile to start watching on ARC." },
    ],
  }),
  component: WhosWatching,
});

function WhosWatching() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const linkCursor = useCursorHover("link");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (containerRef.current) {
      gsap.from(containerRef.current.querySelectorAll("[data-stagger]"), {
        y: 30,
        opacity: 0,
        duration: 0.9,
        stagger: 0.08,
        ease: "power3.out",
        delay: 0.4,
      });
    }
  }, []);

  const pick = (id: string, btn: HTMLButtonElement) => {
    setPicking(id);
    if (prefersReducedMotion()) {
      navigate({ to: "/browse" });
      return;
    }
    gsap.to(btn, {
      scale: 0.9,
      duration: 0.15,
      ease: "power2.in",
      onComplete: () => {
        gsap.to(btn, {
          scale: 1.1,
          duration: 0.25,
          ease: "back.out(2)",
          onComplete: () => {
            const go = () => navigate({ to: "/browse" });
            if ("startViewTransition" in document) {
              (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(go);
            } else {
              go();
            }
          },
        });
      },
    });
  };

  return (
    <main ref={containerRef} className="relative flex min-h-screen flex-col items-center justify-center bg-arc-void px-6">
      <div data-stagger className="absolute left-1/2 top-10 -translate-x-1/2">
        <Wordmark />
      </div>

      <div className="mb-14 text-center">
        <SplitTextReveal
          text="Who's watching?"
          as="h1"
          className="font-display text-[clamp(40px,6vw,72px)] font-extrabold tracking-tight"
          stagger={0.025}
          delay={0.2}
        />
      </div>

      <div data-stagger className="flex flex-wrap items-start justify-center gap-8 md:gap-12">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={(e) => pick(p.id, e.currentTarget)}
            {...linkCursor}
            className="group flex flex-col items-center gap-4 focus-visible:outline-none"
          >
            <div className="relative h-24 w-24 md:h-28 md:w-28">
              <div
                className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 spin-ring"
                style={{
                  background: `conic-gradient(from 0deg, var(--arc-accent), var(--arc-accent-2), var(--arc-accent))`,
                  padding: 2,
                  WebkitMask:
                    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <div
                className="flex h-full w-full items-center justify-center rounded-full font-display text-2xl font-extrabold text-white/90 transition-transform duration-500 group-hover:scale-105"
                style={{
                  background: avatarGradient(p.name),
                  opacity: picking && picking !== p.id ? 0.4 : 1,
                }}
              >
                {p.initials}
              </div>
            </div>
            <span className="label-caps text-arc-text/70 transition-colors group-hover:text-arc-accent">
              {p.name}
            </span>
          </button>
        ))}

        {/* Add profile */}
        <button {...linkCursor} className="group flex flex-col items-center gap-4 focus-visible:outline-none">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-white/15 text-white/50 transition-all group-hover:border-arc-accent/60 group-hover:text-arc-accent md:h-28 md:w-28">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="label-caps text-arc-text/50">Add</span>
        </button>
      </div>

      <div data-stagger className="mt-14 text-center">
        <a
          href="#"
          {...linkCursor}
          className="group relative text-[13px] text-arc-muted transition hover:text-arc-text"
        >
          Manage Profiles
          <span className="absolute inset-x-0 -bottom-0.5 h-px w-0 origin-left bg-arc-accent transition-all duration-300 group-hover:w-full" />
        </a>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="arc-hue-line" />
      </div>
    </main>
  );
}

function Wordmark() {
  return (
    <div className="font-display text-[28px] font-extrabold tracking-tight">
      <span className="text-arc-text">A</span>
      <span className="relative inline-block">
        R
        <span
          className="absolute -bottom-0 -right-1 h-1.5 w-1.5"
          style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
        />
      </span>
      <span className="text-arc-accent">C</span>
    </div>
  );
}
