import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard, type TMDBMovie } from "@/components/cards/MovieCard";
import { supabase } from "@/lib/supabase";
import { getMovieDetails, getTVDetails } from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/my-list")({
  head: () => ({
    meta: [
      { title: "My List — ARC" },
    ],
  }),
  component: MyListPage,
});

function MyListPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [movies, setMovies] = useState<(TMDBMovie & { isTV?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const { lang } = useSettings();

  const fetchItems = async (items: any[]) => {
    const results = await Promise.all(items.map(async (fav) => {
      try {
        const tvMatch = fav.imdb_id.match(/^tv-(\d+)-s(\d+)e(\d+)$/);
        const seriesMatch = fav.imdb_id.match(/^tv-(\d+)$/);
        
        if (tvMatch) {
          const show = await getTVDetails({ data: tvMatch[1] });
          if (!show) return null;
          return {
            ...show,
            id: Number(tvMatch[1]), // Use numeric TMDB ID for routing
            title: `${show.name} — S${tvMatch[2]}E${tvMatch[3]}`,
            isTV: true,
          } as any;
        } else if (seriesMatch) {
          const show = await getTVDetails({ data: seriesMatch[1] });
          if (!show) return null;
          return {
            ...show,
            id: Number(seriesMatch[1]), // Use numeric TMDB ID for routing
            title: show.name,
            isTV: true,
          } as any;
        }
        
        const movie = await getMovieDetails({ data: fav.imdb_id });
        if (!movie) return null;
        return movie as TMDBMovie;
      } catch { return null; }
    }));
    return results.filter(Boolean) as (TMDBMovie & { isTV?: boolean })[];
  };

  // Fetch favorites from Supabase, then load each movie from TMDB
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) { setLoading(false); return; }

    supabase
      .from("favorites")
      .select("imdb_id")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setLoading(false); return; }
        const results = await fetchItems(data);
        setMovies(results);
        setLoading(false);
      });

    // Real-time subscription
    const channel = supabase
      .channel("favorites-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "favorites", filter: `profile_id=eq.${profileId}` }, () => {
        // Re-fetch on any change
        supabase.from("favorites").select("imdb_id").eq("profile_id", profileId).order("created_at", { ascending: false }).then(async ({ data }) => {
          if (!data) return;
          const results = await fetchItems(data);
          setMovies(results);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion() || movies.length === 0) return;
    const ctx = gsap.context(() => {
      if (wrapRef.current) {
        gsap.fromTo(wrapRef.current.children,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: "power3.out" }
        );
      }
    }, wrapRef);
    return () => ctx.revert();
  }, [movies]);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-32 pb-20">
        <div className="mx-auto max-w-7xl px-[5vw]">
          <h1 className="label-caps mb-8 text-arc-text/60">{t("myList.title", lang)}</h1>

          {loading ? (
            <div className="flex items-center justify-center pt-32">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-arc-accent"></div>
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-32 text-center">
              <div className="font-display text-3xl font-extrabold text-arc-muted">
                {t("myList.empty", lang)}
              </div>
              <p className="mt-3 text-sm text-arc-muted max-w-sm">
                {t("myList.emptyDesc", lang)}
              </p>
              <Link to="/browse" className="mt-6 bg-arc-accent text-arc-void px-6 py-3 rounded-full font-bold text-sm hover:bg-white transition">
                {t("myList.browse", lang)}
              </Link>
            </div>
          ) : (
            <div ref={wrapRef} className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {movies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} width={220} linkPrefix={movie.isTV ? "/tv" : undefined} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
