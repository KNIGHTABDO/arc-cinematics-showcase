import { Link } from "@tanstack/react-router";
import { gradientFor } from "@/lib/gradients";
import { useCursorHover } from "@/lib/cursor-context";
import type { Title } from "@/data/catalog";
import { cn } from "@/lib/utils";

interface MovieCardProps {
  title: Title;
  width?: number;
  showProgress?: boolean;
  onRemove?: () => void;
}

export function MovieCard({ title, width = 200, showProgress, onRemove }: MovieCardProps) {
  const cursor = useCursorHover("card");
  return (
    <Link
      to="/title/$id"
      params={{ id: title.id }}
      {...cursor}
      className="group relative block shrink-0 overflow-hidden rounded-[10px] border border-white/[0.06] transition-all duration-300 hover:border-arc-accent/30 hover:shadow-[0_18px_50px_-15px_var(--arc-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc-accent"
      style={{ width, aspectRatio: "2 / 3", viewTransitionName: `poster-${title.id}` }}
    >
      <div
        className="absolute inset-0 transition-[filter,transform] duration-500 group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-150"
        style={{ background: gradientFor(title.seed) }}
      />
      {/* Subtle inner texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.12),transparent_60%)]" />

      {/* Top right cert */}
      <div className="absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-white/90 backdrop-blur-md">
        {title.cert}
      </div>

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
        <div className="font-display text-[15px] font-extrabold leading-tight text-white">
          {title.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/70">
          <span className="tabular">★ {title.rating.toFixed(1)}</span>
          <span>·</span>
          <span>{title.year}</span>
          <span>·</span>
          <span>{title.duration}</span>
        </div>
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[9px] tracking-wider">
            {title.genre.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {showProgress && title.progress != null && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          {title.episode && (
            <div className="px-3 pb-1.5 text-[10px] font-medium tracking-wide text-white/85">
              {title.episode}
            </div>
          )}
          <div className="h-[3px] w-full bg-white/15">
            <div
              className="h-full bg-arc-accent"
              style={{ width: `${(title.progress ?? 0) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

export function TrendingCard({ title, rank }: { title: Title; rank: number }) {
  return (
    <div className={cn("relative flex shrink-0 items-end gap-0")}>
      <span
        className="font-display select-none leading-none text-stroke"
        style={{ fontSize: "140px", fontWeight: 900, marginRight: "-30px", marginBottom: "-12px" }}
      >
        {rank}
      </span>
      <MovieCard title={title} width={170} />
    </div>
  );
}
