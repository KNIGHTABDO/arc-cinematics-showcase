import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard } from "@/components/cards/MovieCard";
import { Pill } from "@/components/ui/Pill";
import { getPopularMovies, searchMovies } from "@/lib/server/tmdb";
import type { TMDBMovie } from "@/components/cards/MovieCard";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — ARC" },
    ],
  }),
  loader: async () => {
    // Top searches fallback
    const top = await getPopularMovies();
    return { top: top.slice(0, 10) };
  },
  component: SearchPage,
});

const PLACEHOLDERS = [
  "Search ARC...",
  "Find a film...",
  "Discover something new...",
  "What if you watched...",
];

function SearchPage() {
  const { top } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const [results, setResults] = useState<TMDBMovie[] | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (prefersReducedMotion()) return;
    
    const ctx = gsap.context(() => {
        if (wrapRef.current) {
          gsap.fromTo(wrapRef.current, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" });
        }
    });
    return () => ctx.revert();
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

  // Execute TMDB Search
  useEffect(() => {
    if (!debounced.trim()) {
      setResults(null);
      return;
    }
    
    let active = true;
    searchMovies({ data: debounced }).then((res: any) => {
        if (active) setResults(res);
    });
    
    return () => { active = false; };
  }, [debounced]);

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
                {top.map((t: TMDBMovie) => (
                  <MovieCard key={t.id} movie={t} width={240} />
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
                {["Inception", "Dune", "Interstellar", "Batman", "Romance"].map((s) => (
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
                {results.map((t: TMDBMovie) => (
                  <MovieCard key={t.id} movie={t} width={220} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
