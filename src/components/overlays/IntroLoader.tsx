import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

const STORAGE_KEY = "arc-intro-played";

export function IntroLoader() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Only play once per session
    if (typeof window === "undefined") return;
    const played = sessionStorage.getItem(STORAGE_KEY);
    if (played) {
      setDone(true);
      return;
    }

    if (prefersReducedMotion()) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setDone(true);
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem(STORAGE_KEY, "1");
          setDone(true);
        },
      });

      tl.set(wrapRef.current, { autoAlpha: 1 })
        .from(wordmarkRef.current, {
          autoAlpha: 0,
          y: 16,
          filter: "blur(12px)",
          duration: 0.9,
          ease: "power3.out",
        })
        .fromTo(
          lineRef.current,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.9, ease: "power2.out" },
          "-=0.5",
        )
        .to({}, { duration: 0.4 }) // hold
        .to(wordmarkRef.current, {
          y: -120,
          autoAlpha: 0,
          filter: "blur(8px)",
          duration: 0.7,
          ease: "power3.in",
        })
        .to(
          lineRef.current,
          { scaleX: 0, transformOrigin: "right center", duration: 0.5, ease: "power2.in" },
          "<",
        )
        .to(wrapRef.current, { autoAlpha: 0, duration: 0.4, ease: "power2.out" }, "-=0.2");
    });

    return () => ctx.revert();
  }, []);

  if (done) return null;

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-arc-void"
      style={{ opacity: 0 }}
    >
      <div ref={wordmarkRef} className="flex flex-col items-center">
        <div className="font-display text-[clamp(48px,9vw,120px)] font-extrabold tracking-[-0.06em] leading-none">
          <span className="text-arc-text">A</span>
          <span className="relative">
            R
            <span
              className="absolute -bottom-0.5 -right-2 h-2 w-2"
              style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
            />
          </span>
          <span className="text-arc-accent">C</span>
        </div>
        <span
          ref={lineRef}
          className="mt-6 block h-px w-40 origin-left bg-arc-text/40"
        />
        <span className="label-caps mt-4 text-arc-muted">Cinematic Streaming</span>
      </div>
    </div>
  );
}
