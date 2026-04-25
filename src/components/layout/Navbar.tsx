import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";
import { avatarGradient } from "@/lib/gradients";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/store/settings";
import { getNavItems, t } from "@/lib/i18n";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Navbar() {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const linkCursor = useCursorHover("link");
  const { profile, lang, updateSettings } = useSettings();
  const NAV = getNavItems(lang);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      if (ref.current) {
        gsap.fromTo(
          ref.current,
          { y: -20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            ease: "power3.out",
            delay: 0.05,
          },
        );
      }
    });
    return () => ctx.revert();
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
        <Link
          to="/browse"
          {...linkCursor}
          className="font-display text-2xl font-extrabold tracking-tight"
        >
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

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                {...linkCursor}
                className="text-xs font-semibold text-arc-text/80 transition hover:text-arc-accent uppercase px-3 py-1 border border-white/10 rounded-full"
              >
                {profile?.ui_language || "EN"}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[120px] rounded-xl border border-white/10 bg-arc-surface-2 p-1 shadow-xl arc-glass"
                sideOffset={8}
              >
                <DropdownMenu.Item
                  onClick={() => updateSettings({ ui_language: "en", tmdb_language: "en-US" })}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text"
                >
                  English
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => updateSettings({ ui_language: "ar", tmdb_language: "ar-SA" })}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text"
                >
                  العربية
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={() => updateSettings({ ui_language: "fr", tmdb_language: "fr-FR" })}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text"
                >
                  Français
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <Link
            to="/"
            {...linkCursor}
            className="text-arc-text/80 hover:text-arc-text"
            aria-label="Notifications"
          >
            <BellIcon />
          </Link>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button {...linkCursor} aria-label="Profile">
                <div
                  className="h-8 w-8 rounded-full border border-white/15"
                  style={{ background: avatarGradient(profile?.name || "User") }}
                />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[160px] rounded-xl border border-white/10 bg-arc-surface-2 p-1 shadow-xl arc-glass"
                sideOffset={8}
                align="end"
              >
                <Link to="/history" className="block focus:outline-none">
                  <DropdownMenu.Item className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Watch History
                  </DropdownMenu.Item>
                </Link>
                <Link to="/settings" className="block focus:outline-none">
                  <DropdownMenu.Item className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                    </svg>
                    Settings
                  </DropdownMenu.Item>
                </Link>
                <div className="my-1 h-px bg-white/10" />
                <Link to="/profiles" className="block focus:outline-none">
                  <DropdownMenu.Item className="cursor-pointer rounded-lg px-3 py-2 text-sm text-arc-text/80 outline-none transition hover:bg-arc-accent/20 hover:text-arc-text flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Switch Profile
                  </DropdownMenu.Item>
                </Link>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
