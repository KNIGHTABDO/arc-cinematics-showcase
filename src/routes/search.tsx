import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard } from "@/components/cards/MovieCard";
import { Pill } from "@/components/ui/Pill";
import { ALL_TITLES, TRENDING, NEW_ON_ARC } from "@/data/catalog";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — ARC" },
      { name: "description", content: "Find films, series, and shorts on ARC." },
      { property: "og:title", content: "Search — ARC" },
      { property: "og:description", content: "Find films, series, and shorts on ARC." },
    ],
  }),
  component: SearchPage,
});

const PLACEHOLDERS = [
  "Search ARC...",
  "Find a film...",
  "Discover something new...",
  "What if you watched...",
];

function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (prefersReducedMotion()) return;
    if (wrapRef.current) {
      gsap.from(wrapRef.current, { scale: 0.95, opacity: 0, duration: 0.6, ease: "power3.out" });
    }
  }, []);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % PLACEHOLDERS.length;
      setPlaceholder(PLACEHOLDERS[i]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const results = useMemo(() => {
    if (!debounced.trim()) return null;
    const needle = debounced.toLowerCase();
    return ALL_TITLES.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.genre.toLowerCase().includes(needle),
    );
  }, [debounced]);

  const top = useMemo(() => [...TRENDING.slice(0, 4), ...NEW_ON_ARC.slice(0, 4)], []);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-32 pb-20">
        <div ref={wrapRef} className="mx-auto max-w-4xl px-[5vw]">
          <div className="label-caps mb-3 text-arc-accent">Search</div>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-14 w-full border-b border-white/15 bg-transparent text-[22px] tracking-tight text-arc-text placeholder:text-arc-muted focus:border-arc-accent focus:outline-none"
            style={{ caretColor: "var(--arc-accent)" }}
          />
        </div>

        <div className="mx-auto mt-14 max-w-7xl px-[5vw]">
          {results === null ? (
            <>
              <h2 className="label-caps mb-5 text-arc-text/60">Top Searches</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {top.map((t) => (
                  <MovieCard key={t.id} title={t} width={240} />
                ))}
              </div>
            </>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 text-center">
              <div className="font-display text-3xl font-extrabold text-arc-muted">
                Nothing found for "{debounced}"
              </div>
              <p className="mt-3 text-sm text-arc-muted">Try one of these instead</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["Drama", "Sci-Fi", "Documentary", "Thriller", "Romance"].map((s) => (
                  <Pill key={s} onClick={() => setQ(s)}>{s}</Pill>
                ))}
              </div>
            </div>
          ) : (
            <>
              <h2 className="label-caps mb-5 text-arc-text/60">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {results.map((t) => (
                  <MovieCard key={t.id} title={t} width={220} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
