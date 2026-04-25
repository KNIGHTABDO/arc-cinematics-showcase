import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard } from "@/components/cards/MovieCard";
import { Pill } from "@/components/ui/Pill";
import { getPopularMovies, getKidsMovies, searchMovies } from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import type { TMDBMovie } from "@/components/cards/MovieCard";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [{ title: "Search — ARC" }],
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
  const { profile } = useSettings();
  const tmdbLang = profile?.tmdb_language || "en-US";
  const isKids = profile?.is_kids === true;

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const [top, setTop] = useState<TMDBMovie[]>([]);
  const [results, setResults] = useState<TMDBMovie[] | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      if (wrapRef.current) {
        gsap.fromTo(
          wrapRef.current,
          { scale: 0.95, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" },
        );
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

  useEffect(() => {
    let active = true;
    const fetchTop = async () => {
      const data = isKids
        ? await getKidsMovies({ data: { language: tmdbLang } })
        : await getPopularMovies({ data: { language: tmdbLang } });
      if (active) {
        setTop(Array.isArray(data) ? (data as TMDBMovie[]) : []);
      }
    };
    fetchTop().catch(() => {
      if (active) setTop([]);
    });
    return () => {
      active = false;
    };
  }, [isKids, tmdbLang]);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults(null);
      return;
    }

    let active = true;
    searchMovies({ data: debounced })
      .then((res: any) => {
        if (!active) return;
        const list = Array.isArray(res) ? (res as TMDBMovie[]) : [];
        const filtered = list.filter((item) => {
          if (!item) return false;
          if (!isKids) return true;
          const genres = (item as any).genre_ids;
          if (!Array.isArray(genres)) return false;
          return genres.includes(16) || genres.includes(10751) || genres.includes(10762);
        });
        setResults(filtered);
      })
      .catch(() => {
        if (active) setResults([]);
      });

    return () => {
      active = false;
    };
  }, [debounced, isKids]);

  const emptySuggestions = useMemo(
    () =>
      isKids
        ? ["Minions", "Frozen", "Toy Story", "Moana", "Encanto"]
        : ["Inception", "Dune", "Interstellar", "Batman", "Romance"],
    [isKids],
  );

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
                  <MovieCard
                    key={t.id}
                    movie={t}
                    width={240}
                    linkPrefix={t.media_type === "tv" || t.first_air_date ? "/tv" : "/title"}
                  />
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
                {emptySuggestions.map((s) => (
                  <Pill key={s} onClick={() => setQ(s)}>
                    {s}
                  </Pill>
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
                  <MovieCard
                    key={t.id}
                    movie={t}
                    width={220}
                    linkPrefix={t.media_type === "tv" || t.first_air_date ? "/tv" : "/title"}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
