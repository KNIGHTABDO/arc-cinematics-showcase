import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARC — Cinematic Excellence" },
      { name: "description", content: "Experience cinematic streaming without limits." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const linkCursor = useCursorHover("link");
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    // If already logged in, seamlessly redirect to profiles page
    if (!loading && session) {
      navigate({ to: "/profiles", replace: true });
    }
  }, [session, loading, navigate]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    
    const ctx = gsap.context(() => {
      if (containerRef.current) {
        const tl = gsap.timeline();
        
        tl.fromTo(containerRef.current.querySelector(".logo-mark"), 
          { y: -30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: "power3.out",
            delay: 0.2,
          }
        )
        .fromTo(containerRef.current.querySelectorAll("[data-stagger]"), 
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            stagger: 0.1,
            ease: "expo.out",
          }, 
          "-=0.5"
        );
      }
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  if (loading || session) return null; // Avoid flicker while checking auth state

  return (
    <main ref={containerRef} className="relative flex min-h-screen flex-col items-center justify-center bg-arc-void px-6 overflow-hidden">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-arc-accent/20 blur-[120px]" />
      </div>

      <div className="z-10 absolute left-8 top-8 logo-mark">
        <Wordmark />
      </div>

      <div className="z-10 flex flex-col items-center text-center max-w-4xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-arc-accent/30 bg-arc-accent/10 px-4 py-1.5 backdrop-blur-md" data-stagger>
          <span className="text-xs font-semibold uppercase tracking-widest text-arc-accent">
            Next-Gen Streaming
          </span>
        </div>
        
        <SplitTextReveal
          text="Cinema without limits."
          as="h1"
          className="font-display text-[clamp(48px,8vw,96px)] font-extrabold tracking-tighter leading-none"
          stagger={0.03}
          delay={0.4}
        />
        
        <p data-stagger className="mt-8 max-w-2xl text-lg md:text-xl text-arc-text/70">
          Experience buffer-free 4K streaming powered by decentralized edge networks. 
          No storage required. Pure cinematic excellence.
        </p>

        <div data-stagger className="mt-12 flex flex-col sm:flex-row items-center gap-6">
          <Link
            to="/register"
            {...linkCursor}
            className="group relative flex items-center justify-center overflow-hidden rounded-full bg-arc-accent px-8 py-4 text-sm font-bold tracking-wide text-arc-void transition-all hover:scale-105 active:scale-95"
          >
            <span className="relative z-10">Start Watching Free</span>
            <div className="absolute inset-0 z-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          
          <Link
            to="/login"
            {...linkCursor}
            className="group flex items-center gap-2 text-sm font-semibold tracking-wide text-arc-text transition-colors hover:text-arc-accent"
          >
            Sign In
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="arc-hue-line" />
      </div>
    </main>
  );
}

function Wordmark() {
  return (
    <div className="font-display text-[24px] font-extrabold tracking-tight">
      <span className="text-arc-text">A</span>
      <span className="relative inline-block">
        R
        <span
          className="absolute -bottom-0 -right-1 h-1 w-1"
          style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
        />
      </span>
      <span className="text-arc-accent">C</span>
    </div>
  );
}
