import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { ContentRow } from "@/components/rows/ContentRow";
import {
  getTrendingTV,
  getPopularTV,
  getTopRatedTV,
  getAiringTodayTV,
  getKidsTV,
  discoverTV,
} from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/series")({
  head: () => ({ meta: [{ title: "Series — ARC" }] }),
  component: SeriesPage,
});

function SeriesPage() {
  const { lang, profile } = useSettings();
  const tmdbLang = profile?.tmdb_language || "en-US";
  const isKids = profile?.is_kids === true;
  const langParam = { language: tmdbLang };

  const [trendingTV, setTrendingTV] = useState<any[]>([]);
  const [popularTV, setPopularTV] = useState<any[]>([]);
  const [topRatedTV, setTopRatedTV] = useState<any[]>([]);
  const [airingToday, setAiringToday] = useState<any[]>([]);
  const [drama, setDrama] = useState<any[]>([]);
  const [crime, setCrime] = useState<any[]>([]);
  const [anime, setAnime] = useState<any[]>([]);
  const [documentary, setDocumentary] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isKids) {
      Promise.all([
        getKidsTV({ data: langParam }),
        discoverTV({ data: { language: tmdbLang, kidsOnly: true, genre: "16" } }), // Animation
        discoverTV({ data: { language: tmdbLang, kidsOnly: true, genre: "10762" } }), // Kids
      ]).then(([kids, animation, kidsGenre]) => {
        const kidsList = kids || [];
        setTrendingTV(kidsList);
        setPopularTV(kidsList);
        setTopRatedTV((animation as any)?.results || kidsList);
        setAiringToday((kidsGenre as any)?.results || kidsList);
        setDrama([]);
        setCrime([]);
        setAnime((animation as any)?.results || kidsList);
        setDocumentary([]);
        setLoaded(true);
      });
      return;
    }

    Promise.all([
      getTrendingTV({ data: langParam }),
      getPopularTV({ data: langParam }),
      getTopRatedTV({ data: langParam }),
      getAiringTodayTV({ data: langParam }),
      discoverTV({ data: { language: tmdbLang, genre: "18" } }), // Drama
      discoverTV({ data: { language: tmdbLang, genre: "80" } }), // Crime
      discoverTV({ data: { language: tmdbLang, genre: "16" } }), // Animation/Anime
      discoverTV({ data: { language: tmdbLang, genre: "99" } }), // Documentary
    ]).then(([t, p, tr, at, dr, cr, an, doc]) => {
      setTrendingTV(t || []);
      setPopularTV(p || []);
      setTopRatedTV(tr || []);
      setAiringToday(at || []);
      setDrama((dr as any)?.results || []);
      setCrime((cr as any)?.results || []);
      setAnime((an as any)?.results || []);
      setDocumentary((doc as any)?.results || []);
      setLoaded(true);
    });
  }, [tmdbLang, isKids]);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-28 pb-20">
        <div className="mx-auto max-w-7xl px-[5vw]">
          <h1 className="font-display text-3xl font-extrabold mb-6">{t("nav.series", lang)}</h1>
        </div>

        {!loaded ? (
          <div className="flex items-center justify-center pt-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
          </div>
        ) : (
          <div className="pb-20">
            <ContentRow label={t("browse.trendingTV", lang)} items={trendingTV} variant="trending" linkPrefix="/tv" />
            <ContentRow label="Airing Today" items={airingToday} linkPrefix="/tv" />
            <ContentRow label={t("browse.popularTV", lang)} items={popularTV} linkPrefix="/tv" />
            <ContentRow label={t("browse.acclaimed", lang)} items={topRatedTV} linkPrefix="/tv" />
            {!isKids && <ContentRow label="Drama" items={drama} linkPrefix="/tv" />}
            {!isKids && <ContentRow label="Crime" items={crime} linkPrefix="/tv" />}
            <ContentRow label="Animation" items={anime} linkPrefix="/tv" />
            {!isKids && <ContentRow label="Documentary" items={documentary} linkPrefix="/tv" />}
          </div>
        )}
      </main>
    </>
  );
}
