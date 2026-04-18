import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";
import { avatarGradient } from "@/lib/gradients";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/browse", label: "Home" },
  { to: "/browse", label: "Discover" },
  { to: "/browse", label: "Movies" },
  { to: "/browse", label: "Series" },
  { to: "/my-list", label: "My List" },
] as const;

export function Navbar() {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const linkCursor = useCursorHover("link");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (ref.current) {
      gsap.from(ref.current, { y: -20, opacity: 0, duration: 0.8, ease: "power3.out" });
    }
  }, []);

  return (
    <header
      ref={ref}
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-16 transition-[background,backdrop-filter,border-color] duration-300",
        scrolled ? "arc-glass" : "bg-transparent",
      )}
    >
      <div className="flex h-full items-center justify-between px-[5vw]">
        <Link to="/browse" {...linkCursor} className="font-display text-2xl font-extrabold tracking-tight">
          <span className="text-arc-text">A</span>
          <span className="relative">
            R
            <span
              className="absolute -bottom-0 -right-1 h-1.5 w-1.5"
              style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
            />
          </span>
          <span className="text-arc-accent">C</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item, i) => {
            const active = location.pathname === item.to && i === 0;
            return (
              <Link
                key={item.label}
                to={item.to}
                {...linkCursor}
                className="group relative text-[13px] font-medium text-arc-text/80 transition-colors hover:text-arc-text"
              >
                {item.label}
                <span
                  className={cn(
                    "absolute -bottom-1 left-0 h-px bg-arc-accent transition-all duration-300",
                    active ? "w-full" : "w-0 group-hover:w-full",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <div className="relative flex items-center">
            <button
              {...linkCursor}
              onClick={() => setSearchOpen((v) => !v)}
              className="text-arc-text/80 transition hover:text-arc-accent"
              aria-label="Search"
            >
              <SearchIcon />
            </button>
            <Link
              to="/search"
              {...linkCursor}
              className={cn(
                "ml-2 overflow-hidden border-b border-white/20 bg-transparent text-sm text-arc-text/80 transition-all duration-300 focus:outline-none",
                searchOpen ? "w-44 opacity-100" : "w-0 opacity-0",
              )}
            >
              Open search →
            </Link>
          </div>
          <Link to="/" {...linkCursor} className="text-arc-text/80 hover:text-arc-text" aria-label="Notifications">
            <BellIcon />
          </Link>
          <Link to="/" {...linkCursor} aria-label="Profile">
            <div
              className="h-8 w-8 rounded-full border border-white/15"
              style={{ background: avatarGradient("Alex") }}
            />
          </Link>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
