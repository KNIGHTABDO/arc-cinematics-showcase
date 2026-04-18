import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { ArcBadge } from "@/components/ui/ArcBadge";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { MovieCard } from "@/components/cards/MovieCard";
import { TrailerModal } from "@/components/overlays/TrailerModal";
import { findTitle, EPISODES, CAST, ACCLAIMED, BECAUSE_DUNE } from "@/data/catalog";
import { gradientFor, avatarGradient } from "@/lib/gradients";
import { useCursorHover } from "@/lib/cursor-context";

export const Route = createFileRoute("/title/$id")({
  loader: ({ params }) => {
    const title = findTitle(params.id);
    if (!title) throw notFound();
    return { title };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title.title} — ARC` },
          { name: "description", content: loaderData.title.description },
          { property: "og:title", content: `${loaderData.title.title} — ARC` },
          { property: "og:description", content: loaderData.title.description },
        ]
      : [],
  }),
  component: TitlePage,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-arc-text">
      Title not found.
    </div>
  ),
});

const TABS = ["Overview", "Episodes", "Cast", "Trailers", "More Like This"] as const;
type Tab = (typeof TABS)[number];

function TitlePage() {
  const { title } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("Overview");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const trailerThumbRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [trailerOrigin, setTrailerOrigin] = useState<React.RefObject<HTMLElement | null>>(playBtnRef as React.RefObject<HTMLElement | null>);
  const linkCursor = useCursorHover("link");

  const openTrailer = (ref: React.RefObject<HTMLElement | null>) => {
    setTrailerOrigin(ref);
    setTrailerOpen(true);
  };

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen">
        {/* Blurred background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: gradientFor(title.seed, 160),
              opacity: 0.35,
              filter: "blur(80px)",
              transform: "scale(1.1)",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.6),rgba(8,8,8,0.95)_60%,#080808)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-[5vw] pt-32 pb-20">
          <div className="grid gap-10 md:grid-cols-[320px_1fr] lg:grid-cols-[380px_1fr]">
            {/* POSTER */}
            <div className="relative">
              <div
                className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_var(--arc-glow)]"
                style={{ aspectRatio: "2 / 3", background: gradientFor(title.seed), viewTransitionName: `poster-${title.id}` }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_60%)]" />
                <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-semibold tracking-widest backdrop-blur">
                  4K · HDR · ATMOS
                </div>
                <div className="absolute bottom-4 left-4 right-4 font-display text-2xl font-extrabold text-white drop-shadow">
                  {title.title}
                </div>
              </div>
            </div>

            {/* DETAILS */}
            <div>
              <div className="label-caps text-arc-accent">{title.genre.toUpperCase()} · {title.year}</div>
              <SplitTextReveal
                text={title.title}
                as="h1"
                by="word"
                className="mt-3 font-display text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-0.045em]"
                stagger={0.04}
              />
              {title.tagline && (
                <p className="mt-4 text-[18px] italic text-arc-muted">"{title.tagline}"</p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <ArcBadge>★ {title.rating}</ArcBadge>
                <ArcBadge>{title.duration}</ArcBadge>
                <ArcBadge>{title.cert}</ArcBadge>
                <ArcBadge>{title.year}</ArcBadge>
              </div>

              <p className="mt-6 max-w-[540px] text-[15px] leading-[1.7] text-arc-text/80">
                {title.description}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <MagneticButton
                  ref={playBtnRef as never}
                  variant="primary"
                  className="h-13 px-8"
                  onClick={() => openTrailer(playBtnRef as React.RefObject<HTMLElement | null>)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  Play
                </MagneticButton>
                <MagneticButton variant="icon" aria-label="Add to list">＋</MagneticButton>
                <MagneticButton variant="icon" aria-label="Like">👍</MagneticButton>
                <MagneticButton variant="icon" aria-label="Dislike">👎</MagneticButton>
                <MagneticButton variant="icon" aria-label="Share">↗</MagneticButton>
              </div>
            </div>
          </div>

          {/* TABS */}
          <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-16">
            <Tabs.List className="relative flex gap-8 border-b border-white/[0.06]">
              {TABS.map((t) => (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  {...linkCursor}
                  className="relative pb-3 text-[13px] font-medium tracking-wide text-arc-text/60 transition-colors hover:text-arc-text data-[state=active]:text-arc-text focus-visible:outline-none"
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
                  <p className="text-[15px] leading-[1.8] text-arc-text/80">{title.description}</p>
                  <p className="mt-4 text-[15px] leading-[1.8] text-arc-text/70">
                    Shot across three continents over eighteen months, the production prioritizes natural light and practical effects, with a score composed for analog tape.
                  </p>
                </div>
                <div className="space-y-4">
                  <MetaRow k="Director" v="Imogen Vale" />
                  <MetaRow k="Writers" v="Theo Aris, Léa Moreau" />
                  <MetaRow k="Studio" v="ARC Originals" />
                  <MetaRow k="Released" v={`${title.year}`} />
                  <MetaRow k="Languages" v="English, French, 日本語" />
                  <MetaRow k="Audio" v="Dolby Atmos · 5.1" />
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="Episodes" className="pt-8">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold">Season 1</h3>
                <span className="label-caps text-arc-muted">8 Episodes</span>
              </div>
              <div className="space-y-3">
                {EPISODES.map((ep) => (
                  <div
                    key={ep.number}
                    {...linkCursor}
                    className="group flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all hover:border-arc-accent/30 hover:bg-white/[0.04]"
                  >
                    <div
                      className="relative aspect-video w-44 shrink-0 overflow-hidden rounded-lg"
                      style={{ background: gradientFor(ep.seed) }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                        <span className="text-2xl">▶</span>
                      </div>
                      <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] tabular">
                        {ep.duration}
                      </div>
                    </div>
                    <div className="flex-1 py-1">
                      <div className="flex items-baseline gap-3">
                        <span className="font-display text-2xl font-bold text-arc-muted tabular">
                          {String(ep.number).padStart(2, "0")}
                        </span>
                        <span className="font-medium text-arc-text">{ep.title}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-arc-text/65">
                        {ep.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="Cast" className="pt-8">
              <div className="no-scrollbar flex gap-6 overflow-x-auto pb-4">
                {CAST.map((c) => (
                  <div key={c.name} className="flex w-[120px] shrink-0 flex-col items-center text-center">
                    <div
                      className="h-[72px] w-[72px] rounded-full border border-white/10"
                      style={{ background: avatarGradient(c.name) }}
                    />
                    <div className="mt-3 text-sm font-medium text-arc-text">{c.name}</div>
                    <div className="mt-0.5 text-xs text-arc-muted">{c.role}</div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="Trailers" className="pt-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="group relative aspect-video overflow-hidden rounded-xl border border-white/[0.06]" style={{ background: gradientFor(title.seed + i) }}>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-90">
                      <span className="text-3xl">▶</span>
                    </div>
                    <div className="absolute bottom-3 left-3 text-xs tracking-wide text-white/90">Trailer {i}</div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="More Like This" className="pt-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[...ACCLAIMED.slice(0, 3), ...BECAUSE_DUNE.slice(0, 3)].map((t) => (
                  <MovieCard key={t.id} title={t} width={220} />
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>

          <div className="mt-16">
            <Link to="/browse" className="text-[13px] text-arc-muted transition hover:text-arc-accent">
              ← Back to Browse
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.05] py-2 text-sm">
      <span className="text-arc-muted">{k}</span>
      <span className="text-arc-text">{v}</span>
    </div>
  );
}
