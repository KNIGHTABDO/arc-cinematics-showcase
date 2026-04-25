import { Link } from "@tanstack/react-router";
import { useCursorHover } from "@/lib/cursor-context";
import { cn } from "@/lib/utils";

// Standard TMDB Output shape (works for both movies and TV)
export interface TMDBMovie {
  id: number | string;
  title?: string;
  name?: string; // TV shows use 'name'
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string; // TV shows
  overview: string;
  media_type?: string;
  progress?: number;
}

export function ContinueCard({ movie }: { movie: TMDBMovie }) {
  const cursor = useCursorHover("card");
  const pct = (movie.progress ?? 0) * 100;

  // Real duration formatting isn't immediately available from basic TMDB lists without details append,
  // so we show generic "Resume" instead, unless loaded from DB with saved duration.
  const remaining = movie.progress ? "Resume" : null;

  return (
    <Link
      to="/title/$id"
      params={{ id: movie.id.toString() }}
      {...cursor}
      className="group relative block shrink-0 overflow-hidden rounded-xl border border-white/[0.07] transition-all duration-300 hover:border-arc-accent/40 hover:shadow-[0_20px_60px_-15px_var(--arc-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc-accent bg-arc-surface-2"
      style={{
        width: "clamp(260px, 22vw, 340px)",
        aspectRatio: "16 / 9",
        viewTransitionName: `continue-${movie.id}`,
      }}
    >
      {/* Real TMDB Backdrop image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-[filter,transform] duration-500 group-hover:scale-[1.04] group-hover:brightness-110"
        style={{
          backgroundImage: movie.backdrop_path
            ? `url(https://image.tmdb.org/t/p/w780${movie.backdrop_path})`
            : "none",
        }}
      />
      {/* Inner gloss */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.10),transparent_55%)]" />
      {/* Dark vignette bottom — always visible so text is readable */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      {/* Play button — centered, scales in on hover */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-12 w-12 translate-y-1 scale-90 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur-sm ring-1 ring-white/30 transition-all duration-300 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Bottom info — always visible */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <div>
            <div className="font-display text-[13px] font-extrabold leading-tight text-white drop-shadow">
              {movie.title || movie.name}
            </div>
            {movie.release_date && (
              <div className="mt-0.5 text-[10px] text-white/60">
                {movie.release_date.substring(0, 4)}
              </div>
            )}
          </div>
          {remaining && (
            <span className="shrink-0 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white/70 backdrop-blur">
              {remaining}
            </span>
          )}
        </div>
        {/* Progress bar */}
        {movie.progress != null && (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-arc-accent transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

interface MovieCardProps {
  movie: TMDBMovie;
  width?: number;
  showProgress?: boolean;
  onRemove?: () => void;
  linkPrefix?: string;
}

export function MovieCard({
  movie,
  width = 200,
  showProgress,
  onRemove,
  linkPrefix,
}: MovieCardProps) {
  const cursor = useCursorHover("card");
  const href = linkPrefix ? `${linkPrefix}/${movie.id}` : `/title/${movie.id}`;
  return (
    <a
      href={href}
      {...cursor}
      className="group relative block shrink-0 overflow-hidden rounded-[10px] border border-white/[0.06] transition-all duration-300 hover:border-arc-accent/30 hover:shadow-[0_18px_50px_-15px_var(--arc-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc-accent bg-arc-surface-2"
      style={{ width, aspectRatio: "2 / 3", viewTransitionName: `poster-${movie.id}` }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-[filter,transform] duration-500 group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-150"
        style={{
          backgroundImage: movie.poster_path
            ? `url(https://image.tmdb.org/t/p/w500${movie.poster_path})`
            : "none",
        }}
      />
      {/* Subtle inner texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.12),transparent_60%)]" />

      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-arc-accent hover:text-arc-void group-hover:opacity-100"
          aria-label="Remove"
        >
          ✕
        </button>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 flex translate-y-2 flex-col justify-end bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="font-display text-[15px] font-extrabold leading-tight text-white drop-shadow">
          {movie.title || movie.name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/70">
          <span className="tabular">
            ★ {movie.vote_average ? movie.vote_average.toFixed(1) : "N/A"}
          </span>
          <span>·</span>
          <span>{(movie.release_date || movie.first_air_date || "").substring(0, 4)}</span>
        </div>
      </div>

      {/* Progress bar */}
      {showProgress && movie.progress != null && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <div className="h-[3px] w-full bg-white/15">
            <div
              className="h-full bg-arc-accent"
              style={{ width: `${(movie.progress ?? 0) * 100}%` }}
            />
          </div>
        </div>
      )}
    </a>
  );
}

export function TrendingCard({
  movie,
  rank,
  linkPrefix,
}: {
  movie: TMDBMovie;
  rank: number;
  linkPrefix?: string;
}) {
  return (
    <div className={cn("relative flex shrink-0 items-end gap-0")}>
      <span
        className="font-display select-none leading-none text-stroke"
        style={{ fontSize: "140px", fontWeight: 900, marginRight: "-30px", marginBottom: "-12px" }}
      >
        {rank}
      </span>
      <MovieCard movie={movie} width={170} linkPrefix={linkPrefix} />
    </div>
  );
}
