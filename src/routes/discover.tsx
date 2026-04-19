import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard, type TMDBMovie } from "@/components/cards/MovieCard";
import { discoverMovies, discoverTV, getMovieGenres, getTVGenres } from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/discover")({
  head: () => ({ meta: [{ title: "Discover — ARC" }] }),
  component: DiscoverPage,
});

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "primary_release_date.desc", label: "Newest First" },
  { value: "revenue.desc", label: "Box Office" },
];

function DiscoverPage() {
  const { lang, profile } = useSettings();
  const tmdbLang = profile?.tmdb_language || "en-US";

  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [activeGenre, setActiveGenre] = useState<string>("");
  const [sort, setSort] = useState("popularity.desc");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isKids = profile?.is_kids === true;

  // Fetch genres
  useEffect(() => {
    (mediaType === "movie"
      ? getMovieGenres({ data: { kidsOnly: isKids } })
      : getTVGenres({ data: { kidsOnly: isKids } })
    ).then(setGenres);
  }, [mediaType, isKids]);

  // Fetch results
  useEffect(() => {
    setLoading(true);
    const params = { language: tmdbLang, genre: activeGenre, sort, page: "1", kidsOnly: isKids };
    const fn = mediaType === "movie" ? discoverMovies : discoverTV;
    fn({ data: params }).then((data: any) => {
      setResults(data.results || []);
      setLoading(false);
    });
  }, [mediaType, activeGenre, sort, tmdbLang, isKids]);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-28 pb-20">
        <div className="mx-auto max-w-7xl px-[5vw]">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
            <h1 className="font-display text-3xl font-extrabold">{t("nav.discover", lang)}</h1>
            <div className="flex items-center gap-3">
              {!isKids && (
                <div className="flex bg-arc-surface-2 rounded-full p-1 border border-white/10">
                  <button
                    onClick={() => {
                      setMediaType("movie");
                      setActiveGenre("");
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${mediaType === "movie" ? "bg-arc-accent text-arc-void" : "text-arc-muted hover:text-white"}`}
                  >
                    {t("nav.movies", lang)}
                  </button>
                  <button
                    onClick={() => {
                      setMediaType("tv");
                      setActiveGenre("");
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${mediaType === "tv" ? "bg-arc-accent text-arc-void" : "text-arc-muted hover:text-white"}`}
                  >
                    {t("nav.series", lang)}
                  </button>
                </div>
              )}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="bg-arc-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-arc-text outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Genre Pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveGenre("")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${!activeGenre ? "bg-arc-accent text-arc-void border-arc-accent" : "border-white/10 text-arc-muted hover:border-white/30 hover:text-white"}`}
            >
              All
            </button>
            {genres.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGenre(g.id.toString())}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${activeGenre === g.id.toString() ? "bg-arc-accent text-arc-void border-arc-accent" : "border-white/10 text-arc-muted hover:border-white/30 hover:text-white"}`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Results Grid */}
          {loading ? (
            <div className="flex items-center justify-center pt-20">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((item: any) => (
                <Link
                  key={item.id}
                  to={mediaType === "movie" ? "/title/$id" : "/tv/$id"}
                  params={{ id: item.id.toString() }}
                  className="group"
                >
                  <div className="relative rounded-xl overflow-hidden border border-white/5 bg-arc-surface-2 transition-transform group-hover:scale-[1.03] group-hover:border-arc-accent/30">
                    <div
                      className="aspect-[2/3] bg-cover bg-center"
                      style={{ backgroundImage: item.poster_path ? `url(https://image.tmdb.org/t/p/w342${item.poster_path})` : "none", backgroundColor: "var(--arc-surface)" }}
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                      <p className="text-sm font-semibold text-white truncate">{item.title || item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-arc-accent">★ {item.vote_average?.toFixed(1)}</span>
                        <span className="text-xs text-arc-muted">{(item.release_date || item.first_air_date || "").substring(0, 4)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
