import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { ContentRow } from "@/components/rows/ContentRow";
import {
  getTrendingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getNowPlayingMovies,
  discoverMovies,
  getMovieGenres,
} from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/movies")({
  head: () => ({ meta: [{ title: "Movies — ARC" }] }),
  component: MoviesPage,
});

function MoviesPage() {
  const { lang, profile } = useSettings();
  const tmdbLang = profile?.tmdb_language || "en-US";
  const langParam = { language: tmdbLang };

  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any[]>([]);
  const [action, setAction] = useState<any[]>([]);
  const [comedy, setComedy] = useState<any[]>([]);
  const [horror, setHorror] = useState<any[]>([]);
  const [scifi, setScifi] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getTrendingMovies({ data: langParam }),
      getPopularMovies({ data: langParam }),
      getTopRatedMovies({ data: langParam }),
      getNowPlayingMovies({ data: langParam }),
      discoverMovies({ data: { language: tmdbLang, genre: "28" } }),    // Action
      discoverMovies({ data: { language: tmdbLang, genre: "35" } }),    // Comedy
      discoverMovies({ data: { language: tmdbLang, genre: "27" } }),    // Horror
      discoverMovies({ data: { language: tmdbLang, genre: "878" } }),   // Sci-Fi
    ]).then(([t, p, tr, np, act, com, hor, sf]) => {
      setTrending(t || []);
      setPopular(p || []);
      setTopRated(tr || []);
      setNowPlaying(np || []);
      setAction((act as any)?.results || []);
      setComedy((com as any)?.results || []);
      setHorror((hor as any)?.results || []);
      setScifi((sf as any)?.results || []);
      setLoaded(true);
    });
  }, [tmdbLang]);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-28 pb-20">
        <div className="mx-auto max-w-7xl px-[5vw]">
          <h1 className="font-display text-3xl font-extrabold mb-6">{t("nav.movies", lang)}</h1>
        </div>

        {!loaded ? (
          <div className="flex items-center justify-center pt-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
          </div>
        ) : (
          <div className="pb-20">
            <ContentRow label={t("browse.trending", lang)} items={trending} variant="trending" />
            <ContentRow label={t("browse.nowPlaying", lang)} items={nowPlaying} />
            <ContentRow label={t("browse.acclaimed", lang)} items={topRated} />
            <ContentRow label="Action" items={action} />
            <ContentRow label="Comedy" items={comedy} />
            <ContentRow label="Horror" items={horror} />
            <ContentRow label="Sci-Fi" items={scifi} />
            <ContentRow label={t("browse.topPicks", lang)} items={popular} />
          </div>
        )}
      </main>
    </>
  );
}
