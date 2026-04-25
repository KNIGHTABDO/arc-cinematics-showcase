import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Navbar } from "@/components/layout/Navbar";
import { ContentRow } from "@/components/rows/ContentRow";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { ArcBadge } from "@/components/ui/ArcBadge";
import {
  getTrendingMovies,
  getPopularMovies,
  getTopRatedMovies,
  getNowPlayingMovies,
  getTrendingTV,
  getPopularTV,
  getKidsMovies,
  getKidsTV,
  getMovieDetails,
  getTVDetails,
} from "@/lib/server/tmdb";
import { supabase } from "@/lib/supabase";
import type { TMDBMovie } from "@/components/cards/MovieCard";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [{ title: "Browse — ARC" }],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const { lang, profile } = useSettings();
  const isKids = profile?.is_kids || false;
  const tmdbLang = profile?.tmdb_language || "en-US";

  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any[]>([]);
  const [trendingTV, setTrendingTV] = useState<any[]>([]);
  const [popularTV, setPopularTV] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const heroBgRef = useRef<HTMLDivElement>(null);
  const scrollIndicator = useRef<HTMLDivElement>(null);

  // Fetch all data with the correct language + kids filtering
  useEffect(() => {
    const langParam = { language: tmdbLang };

    if (isKids) {
      // Kids profile — only show safe content
      Promise.all([getKidsMovies({ data: langParam }), getKidsTV({ data: langParam })]).then(
        ([kidsMovies, kidsShows]) => {
          setTrending(kidsMovies?.slice(0, 6) || []);
          setPopular(kidsMovies?.slice(6, 12) || []);
          setTopRated(kidsMovies?.slice(12, 18) || []);
          setNowPlaying(kidsShows?.slice(0, 6) || []);
          setTrendingTV(kidsShows?.slice(6, 12) || []);
          setPopularTV(kidsShows?.slice(12, 18) || []);
          setLoaded(true);
        },
      );
    } else {
      // Normal profile — full catalog
      Promise.all([
        getTrendingMovies({ data: langParam }),
        getPopularMovies({ data: langParam }),
        getTopRatedMovies({ data: langParam }),
        getNowPlayingMovies({ data: langParam }),
        getTrendingTV({ data: langParam }),
        getPopularTV({ data: langParam }),
      ]).then(([t, p, tr, np, ttv, ptv]) => {
        setTrending(t || []);
        setPopular(p || []);
        setTopRated(tr || []);
        setNowPlaying(np || []);
        setTrendingTV(ttv || []);
        setPopularTV(ptv || []);
        setLoaded(true);
      });
    }
  }, [tmdbLang, isKids]);

  const heroMovie = trending?.[0];

  useEffect(() => {
    if (prefersReducedMotion() || !loaded) return;

    const ctx = gsap.context(() => {
      if (heroBgRef.current) {
        gsap.fromTo(
          heroBgRef.current,
          { scale: 1.12 },
          { scale: 1.0, duration: 6, ease: "power2.out" },
        );
      }
      if (scrollIndicator.current) {
        gsap.to(scrollIndicator.current.querySelector("[data-bar]"), {
          scaleY: 0.2,
          transformOrigin: "top center",
          repeat: -1,
          yoyo: true,
          duration: 1.4,
          ease: "power1.inOut",
        });
      }
    });

    return () => ctx.revert();
  }, [loaded]);

  if (!loaded) {
    return (
      <>
        <Navbar />
        <main className="relative flex min-h-screen items-center justify-center bg-arc-void">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-arc-accent"></div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="relative">
        {/* HERO SECTION */}
        {heroMovie && (
          <section ref={heroRef} className="relative h-[100svh] w-full overflow-hidden">
            <div
              ref={heroBgRef}
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: heroMovie.backdrop_path
                  ? `url(https://image.tmdb.org/t/p/original${heroMovie.backdrop_path})`
                  : "none",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(8,8,8,0.96) 20%, rgba(8,8,8,0.55) 50%, rgba(8,8,8,0.15) 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(8,8,8,0.6) 0%, transparent 35%, transparent 60%, rgba(8,8,8,1) 100%)",
              }}
            />

            <div className="relative z-10 flex h-full max-w-[640px] flex-col justify-center pl-[7vw] pr-6 pt-16">
              <div
                className="mb-5 inline-flex items-center gap-3"
                style={{ animation: "fade-in 800ms ease-out 200ms both" }}
              >
                <span className="h-px w-8 bg-arc-accent" />
                <span className="label-caps text-arc-accent">{t("hero.badge", lang)}</span>
              </div>

              <SplitTextReveal
                text={heroMovie.title || heroMovie.name || ""}
                as="h1"
                className="font-display text-[clamp(48px,6vw,88px)] font-extrabold tracking-tight leading-[0.9]"
                by="word"
                stagger={0.06}
                delay={0.35}
              />

              <p
                className="mt-5 max-w-md text-sm leading-relaxed text-arc-text/70 line-clamp-3"
                style={{ animation: "fade-in 800ms ease-out 700ms both" }}
              >
                {heroMovie.overview}
              </p>

              <div
                className="mt-4 flex flex-wrap items-center gap-2"
                style={{ animation: "fade-in 800ms ease-out 850ms both" }}
              >
                <ArcBadge>
                  ★ {heroMovie.vote_average ? heroMovie.vote_average.toFixed(1) : "N/A"} IMDb
                </ArcBadge>
                <ArcBadge>4K HDR</ArcBadge>
                {heroMovie.release_date && (
                  <ArcBadge>{heroMovie.release_date.substring(0, 4)}</ArcBadge>
                )}
                {heroMovie.first_air_date && (
                  <ArcBadge>{heroMovie.first_air_date.substring(0, 4)}</ArcBadge>
                )}
              </div>

              <div
                className="mt-8 flex items-center gap-3"
                style={{ animation: "fade-in 800ms ease-out 1000ms both" }}
              >
                <Link to="/title/$id" params={{ id: heroMovie.id.toString() }}>
                  <MagneticButton variant="primary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {t("hero.playNow", lang)}
                  </MagneticButton>
                </Link>
                <Link to="/title/$id" params={{ id: heroMovie.id.toString() }}>
                  <MagneticButton variant="ghost">{t("hero.moreInfo", lang)}</MagneticButton>
                </Link>
              </div>
            </div>

            <div
              ref={scrollIndicator}
              className="absolute bottom-10 right-[5vw] z-10 hidden flex-col items-center gap-3 md:flex"
            >
              <span
                className="label-caps text-arc-text/50"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Scroll
              </span>
              <span data-bar className="block h-12 w-px bg-arc-text/40" />
            </div>
          </section>
        )}

        {/* CONTENT ROWS */}
        <div className="relative pb-20 z-20 -mt-10">
          <ContinueWatchingRow />
          <ContentRow label={t("browse.trending", lang)} items={trending} variant="trending" />
          <ContentRow label={t("browse.acclaimed", lang)} items={topRated} />
          <ContentRow label={t("browse.nowPlaying", lang)} items={nowPlaying} />
          {trendingTV.length > 0 && (
            <ContentRow label={t("browse.trendingTV", lang)} items={trendingTV} linkPrefix="/tv" />
          )}
          {popularTV.length > 0 && (
            <ContentRow label={t("browse.popularTV", lang)} items={popularTV} linkPrefix="/tv" />
          )}
          <ContentRow label={t("browse.topPicks", lang)} items={popular?.slice(1)} />
        </div>

        <Footer />
      </main>
    </>
  );
}

function Footer() {
  const { lang } = useSettings();
  return (
    <footer className="border-t border-white/[0.06] px-[5vw] py-12 bg-arc-void">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <div className="font-display text-2xl font-extrabold">
            A
            <span className="relative">
              R
              <span
                className="absolute -bottom-0 -right-1 h-1.5 w-1.5"
                style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
              />
            </span>
            <span className="text-arc-accent">C</span>
          </div>
          <p className="mt-2 max-w-sm text-xs text-arc-muted">{t("footer.tagline", lang)}</p>
        </div>
        <div className="flex gap-8 text-[11px] tracking-wider uppercase text-arc-muted">
          <span>© 2026 ARC</span>
          <Link to="/privacy" className="hover:text-arc-text transition">
            {t("footer.privacy", lang)}
          </Link>
          <Link to="/terms" className="hover:text-arc-text transition">
            {t("footer.terms", lang)}
          </Link>
          <span>{t("footer.tmdb", lang)}</span>
        </div>
      </div>
      <div className="arc-hue-line mt-10" />
    </footer>
  );
}

function ContinueWatchingRow() {
  const [items, setItems] = useState<any[]>([]);
  const { lang, profile } = useSettings();

  useEffect(() => {
    if (!profile?.id) return;
    const profileId = profile.id;

    const loadHistory = async () => {
      const { data } = await supabase
        .from("watch_history")
        .select("imdb_id, media_type, season, episode, progress, duration")
        .eq("profile_id", profileId)
        .order("updated_at", { ascending: false })
        .limit(30);

      if (!data || data.length === 0) return;

      const grouped: typeof data = [];
      const seenIds = new Set<string>();

      for (const row of data) {
        if (row.media_type === "tv") {
          if (seenIds.has(row.imdb_id)) continue;
          seenIds.add(row.imdb_id);
        }
        grouped.push(row);
        if (grouped.length >= 10) break;
      }

      const results = await Promise.all(
        grouped.map(async (entry) => {
          try {
            if (entry.media_type === "tv" && entry.season != null && entry.episode != null) {
              const show = await getTVDetails({ data: entry.imdb_id });
              if (!show) return null;
              return {
                id: `tv-${entry.imdb_id}-s${entry.season}e${entry.episode}`,
                watchId: `tv-${entry.imdb_id}-s${entry.season}e${entry.episode}`,
                title: `${show.name} — S${entry.season}E${entry.episode}`,
                backdrop_path: show.backdrop_path,
                progress: entry.progress,
                duration: entry.duration,
              };
            } else {
              const movie = await getMovieDetails({ data: entry.imdb_id });
              if (!movie) return null;
              return {
                id: entry.imdb_id,
                watchId: entry.imdb_id,
                title: movie.title,
                backdrop_path: movie.backdrop_path,
                progress: entry.progress,
                duration: entry.duration,
              };
            }
          } catch {
            return null;
          }
        }),
      );
      setItems(results.filter(Boolean));
    };

    loadHistory();
  }, [profile?.id]);

  if (items.length === 0) return null;

  return (
    <section className="py-6 px-[5vw]">
      <h2 className="label-caps mb-4 text-arc-text/60">{t("browse.continueWatching", lang)}</h2>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
        {items.map((item) => {
          const pct = item.duration > 0 ? Math.min((item.progress / item.duration) * 100, 100) : 0;
          return (
            <Link
              key={item.id}
              to="/watch/$id"
              params={{ id: item.watchId }}
              className="shrink-0 w-[260px] group"
            >
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-arc-surface-2">
                <div
                  className="aspect-video bg-cover bg-center"
                  style={{
                    backgroundImage: item.backdrop_path
                      ? `url(https://image.tmdb.org/t/p/w500${item.backdrop_path})`
                      : "none",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="h-1 bg-white/10">
                  <div
                    className="h-full bg-arc-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <p className="mt-2 text-sm font-medium text-arc-text/80 truncate">{item.title}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
