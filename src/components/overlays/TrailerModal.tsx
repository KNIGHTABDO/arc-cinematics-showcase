import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { gradientFor } from "@/lib/gradients";
import type { Title } from "@/data/catalog";

interface Props {
  title: Title;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional element to use as the source of the zoom (FLIP). */
  originRef?: React.RefObject<HTMLElement | null>;
}

export function TrailerModal({ title, open, onOpenChange, originRef }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Shared-element zoom from the originRef rect
  useEffect(() => {
    if (!open || !surfaceRef.current) return;
    if (prefersReducedMotion()) return;

    const surface = surfaceRef.current;
    const target = surface.getBoundingClientRect();
    const origin = originRef?.current?.getBoundingClientRect();

    if (origin) {
      const scaleX = origin.width / target.width;
      const scaleY = origin.height / target.height;
      const x = origin.left + origin.width / 2 - (target.left + target.width / 2);
      const y = origin.top + origin.height / 2 - (target.top + target.height / 2);

      gsap.fromTo(
        surface,
        { x, y, scaleX, scaleY, opacity: 0.4, transformOrigin: "center center" },
        {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          duration: 0.75,
          ease: "expo.out",
        },
      );
    } else {
      gsap.fromTo(surface, { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" });
    }

    // Faux progress bar timeline
    if (progressRef.current) {
      gsap.fromTo(
        progressRef.current,
        { scaleX: 0 },
        { scaleX: 1, duration: 90, ease: "none", transformOrigin: "left center" },
      );
    }
  }, [open, originRef]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md"
          style={{ animation: "fade-in 350ms ease-out" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[121] flex items-center justify-center p-6 focus:outline-none"
        >
          <Dialog.Title className="sr-only">{`${title.title} — Trailer`}</Dialog.Title>

          <div
            ref={surfaceRef}
            className="relative aspect-video w-full max-w-[1200px] overflow-hidden rounded-2xl border border-white/10 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
            style={{ background: gradientFor(title.seed, 220) }}
          >
            {/* Faux cinematic backdrop */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.10),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgba(0,0,0,0.85)_100%)]" />

            {/* Centered play emblem */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-md transition-transform hover:scale-105">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-1 text-white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            {/* Floating chrome */}
            <div className="absolute left-6 top-5 flex items-center gap-2">
              <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                ● Live trailer
              </span>
              <span className="label-caps text-white/70">Now playing</span>
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur transition hover:bg-white/10"
              aria-label="Close trailer"
            >
              ✕
            </button>

            {/* Title block */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="label-caps text-arc-accent">Official Trailer · {title.year}</div>
              <div className="mt-2 font-display text-[clamp(28px,4vw,52px)] font-extrabold leading-none tracking-[-0.04em] text-white">
                {title.title}
              </div>
              <div className="mt-2 max-w-xl text-[13px] text-white/75">{title.description}</div>

              <div className="mt-4 flex items-center gap-3">
                <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    ref={progressRef}
                    className="absolute inset-y-0 left-0 w-full origin-left bg-arc-accent"
                    style={{ transform: "scaleX(0)" }}
                  />
                </div>
                <span className="tabular text-[10px] text-white/60">2:08</span>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
