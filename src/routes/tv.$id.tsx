import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { ArcBadge } from "@/components/ui/ArcBadge";
import { getTVDetails, getSeasonDetails } from "@/lib/server/tmdb";
import { supabase } from "@/lib/supabase";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";
import { isTVAllowedForKids } from "@/lib/kids-content";

export const Route = createFileRoute("/tv/$id")({
  head: () => ({ meta: [{ title: "Series — ARC" }] }),
  component: TVDetailPage,
});

interface Episode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  air_date: string;
  vote_average: number;
}

interface Season {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  poster_path: string | null;
  air_date: string;
}

function TVDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { lang, profile } = useSettings();

  const [show, setShow] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [inList, setInList] = useState(false);
  const [lastWatched, setLastWatched] = useState<{
    season: number;
    episode: number;
    progress: number;
    duration: number;
  } | null>(null);
  const isKids = profile?.is_kids === true;
  const blockedForKids = isKids && show && !isTVAllowedForKids(show);

  // Fetch show details
  useEffect(() => {
    getTVDetails({ data: id }).then((data) => {
      setShow(data);
      // Default to season 1 (skip specials = season 0)
      const firstSeason = data.seasons?.find((s: Season) => s.season_number >= 1);
      if (firstSeason) setSelectedSeason(firstSeason.season_number);
    });
  }, [id]);

  // Fetch episodes when season changes
  useEffect(() => {
    if (!show) return;
    setLoadingEps(true);
    getSeasonDetails({ data: { tvId: id, season: selectedSeason } }).then((data: any) => {
      setEpisodes(data.episodes || []);
      setLoadingEps(false);
    });
  }, [id, selectedSeason, show]);

  // Check if in favorites
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;
    supabase
      .from("favorites")
      .select("id")
      .eq("profile_id", profileId)
      .eq("imdb_id", `tv-${id}`)
      .maybeSingle()
      .then(({ data }) => setInList(!!data));
  }, [id]);

  // Check for last watched episode
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;
    supabase
      .from("watch_history")
      .select("season, episode, progress, duration")
      .eq("profile_id", profileId)
      .eq("imdb_id", id)
      .eq("media_type", "tv")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.season && data.episode && data.progress > 10) {
          setLastWatched({
            season: data.season,
            episode: data.episode,
            progress: data.progress,
            duration: data.duration,
          });
        }
      });
  }, [id]);

  const toggleFavorite = async () => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;
    if (inList) {
      await supabase
        .from("favorites")
        .delete()
        .eq("profile_id", profileId)
        .eq("imdb_id", `tv-${id}`);
      setInList(false);
    } else {
      await supabase.from("favorites").insert({ profile_id: profileId, imdb_id: `tv-${id}` });
      setInList(true);
    }
  };

  const lastWatchedPct = lastWatched
    ? Math.min((lastWatched.progress / lastWatched.duration) * 100, 100)
    : 0;
  const heroWatchId = lastWatched
    ? `tv-${id}-s${lastWatched.season}e${lastWatched.episode}`
    : `tv-${id}-s${selectedSeason}e1`;
  const heroButtonText = lastWatched
    ? `Continue S${lastWatched.season}E${lastWatched.episode}`
    : t("hero.playNow", lang);

  if (!show) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-screen items-center justify-center bg-arc-void">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
        </main>
      </>
    );
  }

  const seasons: Season[] = show.seasons?.filter((s: Season) => s.season_number >= 1) || [];
  const cast = show.credits?.cast?.slice(0, 8) || [];

  if (blockedForKids) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-screen items-center justify-center bg-arc-void px-6 text-center">
          <div className="max-w-md">
            <h1 className="font-display text-3xl font-extrabold text-arc-text">
              Content restricted
            </h1>
            <p className="mt-4 text-sm text-arc-muted">
              This title is not available on kids profiles.
            </p>
            <button
              onClick={() => navigate({ to: "/browse" })}
              className="mt-6 rounded-full bg-arc-accent px-6 py-3 text-sm font-semibold text-arc-void"
            >
              Back to Browse
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen bg-arc-void">
        {/* Backdrop Hero */}
        <div className="relative h-[60vh] w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: show.backdrop_path
                ? `url(https://image.tmdb.org/t/p/original${show.backdrop_path})`
                : "none",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(8,8,8,0.96) 20%, rgba(8,8,8,0.5) 60%, rgba(8,8,8,0.2) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,8,8,0.3) 0%, transparent 30%, transparent 60%, rgba(8,8,8,1) 100%)",
            }}
          />

          <div className="relative z-10 flex h-full max-w-[600px] flex-col justify-end pl-[7vw] pb-10">
            <h1 className="font-display text-[clamp(32px,5vw,64px)] font-extrabold leading-tight">
              {show.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ArcBadge>★ {show.vote_average?.toFixed(1)} IMDb</ArcBadge>
              {show.first_air_date && <ArcBadge>{show.first_air_date.substring(0, 4)}</ArcBadge>}
              <ArcBadge>
                {seasons.length} Season{seasons.length > 1 ? "s" : ""}
              </ArcBadge>
              {show.status && <ArcBadge>{show.status}</ArcBadge>}
              {show.genres?.map((g: any) => (
                <ArcBadge key={g.id}>{g.name}</ArcBadge>
              ))}
            </div>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-arc-text/70 line-clamp-3">
              {show.overview}
            </p>

            <div className="mt-6 flex items-center gap-3">
              {episodes.length > 0 && (
                <Link to="/watch/$id" params={{ id: heroWatchId }}>
                  <MagneticButton variant="primary" className="relative overflow-hidden">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {heroButtonText}
                    {lastWatched && (
                      <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
                        <span
                          className="absolute left-0 top-0 h-full bg-arc-accent transition-all"
                          style={{ width: `${lastWatchedPct}%` }}
                        />
                      </span>
                    )}
                  </MagneticButton>
                </Link>
              )}
              <MagneticButton variant="ghost" onClick={toggleFavorite}>
                {inList ? t("title.removeFromList", lang) : t("title.addToList", lang)}
              </MagneticButton>
            </div>
          </div>
        </div>

        {/* Season Selector + Episodes */}
        <div className="mx-auto max-w-7xl px-[5vw] pt-8 pb-20">
          {/* Season tabs */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
            {seasons.map((s) => (
              <button
                key={s.season_number}
                onClick={() => setSelectedSeason(s.season_number)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition whitespace-nowrap ${
                  selectedSeason === s.season_number
                    ? "bg-arc-accent text-arc-void border-arc-accent"
                    : "border-white/10 text-arc-muted hover:border-white/30 hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Episodes Grid */}
          {loadingEps ? (
            <div className="flex items-center justify-center pt-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <Link
                  key={ep.id}
                  to="/watch/$id"
                  params={{ id: `tv-${id}-s${selectedSeason}e${ep.episode_number}` }}
                  className="group relative rounded-xl overflow-hidden border border-white/5 bg-arc-surface-2 transition hover:border-arc-accent/30 hover:bg-arc-surface"
                >
                  {/* Episode Still */}
                  <div
                    className="aspect-video bg-cover bg-center"
                    style={{
                      backgroundImage: ep.still_path
                        ? `url(https://image.tmdb.org/t/p/w500${ep.still_path})`
                        : "none",
                      backgroundColor: "var(--arc-surface)",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Episode Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-arc-accent font-semibold">
                          E{ep.episode_number}
                        </span>
                        <h3 className="text-sm font-semibold text-arc-text mt-0.5">{ep.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ep.runtime && (
                          <span className="text-xs text-arc-muted">{ep.runtime}m</span>
                        )}
                        <span className="text-xs text-arc-muted">
                          ★ {ep.vote_average?.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    {ep.overview && (
                      <p className="mt-2 text-xs text-arc-muted line-clamp-2">{ep.overview}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Cast */}
          {cast.length > 0 && (
            <div className="mt-16">
              <h2 className="label-caps mb-4 text-arc-text/60">{t("title.cast", lang)}</h2>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {cast.map((actor: any) => (
                  <div key={actor.id} className="shrink-0 text-center w-[100px]">
                    <div
                      className="w-[80px] h-[80px] rounded-full mx-auto bg-arc-surface-2 bg-cover bg-center border border-white/5"
                      style={{
                        backgroundImage: actor.profile_path
                          ? `url(https://image.tmdb.org/t/p/w185${actor.profile_path})`
                          : "none",
                      }}
                    />
                    <p className="mt-2 text-xs font-medium text-arc-text/80 truncate">
                      {actor.name}
                    </p>
                    <p className="text-[10px] text-arc-muted truncate">{actor.character}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
