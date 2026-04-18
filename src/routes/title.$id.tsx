import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { ArcBadge } from "@/components/ui/ArcBadge";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { MovieCard } from "@/components/cards/MovieCard";
import { useCursorHover } from "@/lib/cursor-context";
import { getMovieDetails, getPopularMovies } from "@/lib/server/tmdb";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/title/$id")({
  loader: async ({ params }) => {
    try {
      const [movie, popular] = await Promise.all([
        getMovieDetails({ data: params.id }),
        getPopularMovies(), // Used for 'More Like This'
      ]);
      if (!movie) throw notFound();
      return { movie, popular };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.movie.title} — ARC` },
          { name: "description", content: loaderData.movie.overview },
        ]
      : [],
  }),
  component: TitlePage,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-arc-text">
      Title not found or TMDB error.
    </div>
  ),
});

const TABS = ["Overview", "Cast", "More Like This"] as const;
type Tab = (typeof TABS)[number];

function TitlePage() {
  const { movie, popular } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("Overview");
  const [isFavorite, setIsFavorite] = useState(false);
  const linkCursor = useCursorHover("link");
  const navigate = useNavigate();

  const releaseYear = movie.release_date?.substring(0, 4) || "Unknown";
  const duration = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : "Unknown";
  const cast = movie.credits?.cast?.slice(0, 10) || [];

  // Check if this movie is already in favorites
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;
    supabase
      .from("favorites")
      .select("id")
      .eq("profile_id", profileId)
      .eq("imdb_id", movie.id.toString())
      .single()
      .then(({ data }) => {
        if (data) setIsFavorite(true);
      });
  }, [movie.id]);

  const handleToggleFavorite = async () => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;

    if (isFavorite) {
      await supabase
        .from("favorites")
        .delete()
        .eq("profile_id", profileId)
        .eq("imdb_id", movie.id.toString());
      setIsFavorite(false);
    } else {
      await supabase.from("favorites").insert([{
        profile_id: profileId,
        imdb_id: movie.id.toString(),
      }]);
      setIsFavorite(true);
    }
  };

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen">
        {/* Blurred background from Backdrop */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: movie.backdrop_path ? `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})` : "none",
              opacity: 0.35,
              filter: "blur(40px)",
              transform: "scale(1.1)",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.7),rgba(8,8,8,0.98)_60%,#080808)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-[5vw] pt-32 pb-20">
          <div className="grid gap-10 md:grid-cols-[320px_1fr] lg:grid-cols-[380px_1fr]">
            {/* POSTER */}
            <div className="relative">
              <div
                className="relative overflow-hidden rounded-2xl bg-cover bg-center border border-white/10 shadow-[0_30px_80px_-20px_var(--arc-glow)] bg-arc-surface-2"
                style={{
                  aspectRatio: "2 / 3",
                  viewTransitionName: `poster-${movie.id}`,
                  backgroundImage: movie.poster_path ? `url(https://image.tmdb.org/t/p/w780${movie.poster_path})` : "none",
                }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_60%)]" />
                <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-semibold tracking-widest backdrop-blur">
                  4K · HDR · DEBRID
                </div>
              </div>
            </div>

            {/* DETAILS */}
            <div>
              <div className="label-caps text-arc-accent">
                {movie.genres?.map((g: any) => g.name).join(" · ")} · {releaseYear}
              </div>
              <SplitTextReveal
                text={movie.title}
                as="h1"
                by="word"
                className="mt-3 font-display text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-0.045em]"
                stagger={0.04}
              />
              {movie.tagline && (
                <p className="mt-4 text-[18px] italic text-arc-muted">"{movie.tagline}"</p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <ArcBadge>★ {movie.vote_average ? movie.vote_average.toFixed(1) : "NR"}</ArcBadge>
                <ArcBadge>{duration}</ArcBadge>
                <ArcBadge>HD</ArcBadge>
                <ArcBadge>{releaseYear}</ArcBadge>
              </div>

              <p className="mt-6 max-w-[540px] text-[15px] leading-[1.7] text-arc-text/80">
                {movie.overview}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/watch/$id" params={{ id: movie.id.toString() }} className="contents">
                  <MagneticButton variant="primary" className="h-13 px-8">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Stream Now
                  </MagneticButton>
                </Link>
                <MagneticButton
                  variant="icon"
                  aria-label={isFavorite ? "Remove from list" : "Add to list"}
                  onClick={handleToggleFavorite}
                  className={isFavorite ? "!border-arc-accent !text-arc-accent" : ""}
                >
                  {isFavorite ? "✓" : "＋"}
                </MagneticButton>
              </div>
            </div>
          </div>

          {/* TABS */}
          <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-16">
            <Tabs.List className="relative flex gap-8 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
              {TABS.map((t) => (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  {...linkCursor}
                  className="relative pb-3 text-[13px] font-medium tracking-wide text-arc-text/60 transition-colors hover:text-arc-text data-[state=active]:text-arc-text focus-visible:outline-none whitespace-nowrap"
                >
                  {t}
                  {tab === t && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute -bottom-px left-0 right-0 h-px bg-arc-accent"
                      transition={{ type: "spring", stiffness: 400, damping: 40 }}
                    />
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="Overview" className="pt-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="label-caps mb-3 text-arc-text/60">Synopsis</h3>
                  <p className="text-[15px] leading-[1.8] text-arc-text/80">{movie.overview}</p>
                </div>
                <div className="space-y-4">
                  <MetaRow k="Released" v={movie.release_date} />
                  <MetaRow k="Status" v={movie.status} />
                  <MetaRow k="Budget" v={`$${movie.budget?.toLocaleString()}`} />
                  <MetaRow k="Revenue" v={`$${movie.revenue?.toLocaleString()}`} />
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="Cast" className="pt-8">
              <div className="no-scrollbar flex gap-6 overflow-x-auto pb-4">
                {cast.map((c: any) => (
                  <div key={c.id} className="flex w-[120px] shrink-0 flex-col items-center text-center">
                    <div
                      className="h-[72px] w-[72px] rounded-full border border-white/10 bg-cover bg-center"
                      style={{
                        backgroundImage: c.profile_path ? `url(https://image.tmdb.org/t/p/w185${c.profile_path})` : "none",
                        backgroundColor: "var(--arc-surface-2)"
                      }}
                    />
                    <div className="mt-3 text-sm font-medium text-arc-text">{c.name}</div>
                    <div className="mt-0.5 text-xs text-arc-muted">{c.character}</div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="More Like This" className="pt-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {popular?.slice(5, 13).map((t: any) => (
                  <MovieCard key={t.id} movie={t} width={220} />
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>

        </div>
      </main>
    </>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  if (!v || v === "$0") return null;
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.05] py-2 text-sm">
      <span className="text-arc-muted">{k}</span>
      <span className="text-arc-text text-right">{v}</span>
    </div>
  );
}
