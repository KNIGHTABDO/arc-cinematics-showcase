import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { ALL_TITLES } from "@/data/catalog";
import { gradientFor } from "@/lib/gradients";

const ROUTES = [
  { label: "Home", path: "/browse", hint: "G H" },
  { label: "Search", path: "/search", hint: "G S" },
  { label: "My List", path: "/my-list", hint: "G L" },
  { label: "Settings", path: "/settings", hint: "G ," },
  { label: "Switch profile", path: "/", hint: "G P" },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const titleMatches = q
    ? ALL_TITLES.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8)
    : ALL_TITLES.slice(1, 7);
  const routeMatches = q
    ? ROUTES.filter((r) => r.label.toLowerCase().includes(q))
    : ROUTES;

  const flat: Array<{ kind: "route" | "title"; id: string; label: string; sub?: string; seed?: number; path?: string }> = [
    ...routeMatches.map((r) => ({ kind: "route" as const, id: r.path + r.label, label: r.label, sub: r.hint, path: r.path })),
    ...titleMatches.map((t) => ({ kind: "title" as const, id: t.id, label: t.title, sub: `${t.year} · ${t.genre}`, seed: t.seed })),
  ];

  const go = (i: number) => {
    const item = flat[i];
    if (!item) return;
    setOpen(false);
    if (item.kind === "route" && item.path) {
      navigate({ to: item.path });
    } else {
      navigate({ to: "/title/$id", params: { id: item.id } });
    }
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          style={{ animation: "fade-in 200ms ease-out" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-[18vh] z-[101] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.15_0_0/0.92)] shadow-[0_30px_80px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl focus:outline-none"
          style={{ animation: "scale-in 220ms cubic-bezier(0.22,1,0.36,1)" }}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>

          <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search titles, jump to a page…"
              className="flex-1 bg-transparent text-[15px] text-arc-text placeholder:text-arc-muted focus:outline-none"
            />
            <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-arc-muted sm:inline-block">
              ESC
            </kbd>
          </div>

          <div className="max-h-[55vh] overflow-y-auto py-2">
            {routeMatches.length > 0 && (
              <Section label="Navigation">
                {routeMatches.map((r, i) => {
                  const idx = i;
                  return (
                    <Item
                      key={r.path + r.label}
                      active={active === idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(idx)}
                      icon={<RouteIcon />}
                      label={r.label}
                      sub={r.path}
                      hint={r.hint}
                    />
                  );
                })}
              </Section>
            )}

            {titleMatches.length > 0 && (
              <Section label={q ? "Titles" : "Suggested"}>
                {titleMatches.map((t, i) => {
                  const idx = routeMatches.length + i;
                  return (
                    <Item
                      key={t.id}
                      active={active === idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(idx)}
                      icon={
                        <span
                          className="block h-8 w-6 rounded-[3px]"
                          style={{ background: gradientFor(t.seed) }}
                        />
                      }
                      label={t.title}
                      sub={`${t.year} · ${t.genre}`}
                      hint={`★ ${t.rating.toFixed(1)}`}
                    />
                  );
                })}
              </Section>
            )}

            {flat.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-arc-muted">
                Nothing matches "{query}"
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-widest text-arc-muted">
            <div className="flex items-center gap-3">
              <span><kbd className="kbd">↑↓</kbd> Navigate</span>
              <span><kbd className="kbd">↵</kbd> Open</span>
            </div>
            <div className="font-display text-[11px] font-bold tracking-wider text-arc-text/70">
              ARC<span className="text-arc-accent">·</span>K
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-arc-muted">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({
  active,
  icon,
  label,
  sub,
  hint,
  onClick,
  onMouseEnter,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  hint?: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-arc-text/70">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-arc-text">{label}</span>
        {sub && <span className="block truncate text-[11px] text-arc-muted">{sub}</span>}
      </span>
      {hint && (
        <span className="shrink-0 text-[10px] tracking-wider text-arc-muted">{hint}</span>
      )}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-arc-muted">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
