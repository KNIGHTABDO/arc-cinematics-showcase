import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/store/settings";
import { supabase } from "@/lib/supabase";
import { Navbar } from "@/components/layout/Navbar";
import { getMovieDetails, getTVDetails } from "@/lib/server/tmdb";
import { t } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { lang, profile } = useSettings();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only use the strictly validated profile from settings
    if (!profile?.id) return;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("watch_history")
        .select("id, imdb_id, media_type, season, episode, progress, duration, updated_at")
        .eq("profile_id", profile.id)
        .order("updated_at", { ascending: false });

      if (!data) {
        setLoading(false);
        return;
      }

      // Group TV shows: only keep the most recent episode per show
      const grouped: typeof data = [];
      const seenTvIds = new Set<string>();

      for (const row of data) {
        if (row.media_type === "tv") {
          if (seenTvIds.has(row.imdb_id)) continue;
          seenTvIds.add(row.imdb_id);
        }
        grouped.push(row);
      }

      const results = await Promise.all(
        grouped.map(async (entry) => {
          try {
            if (entry.media_type === "tv" && entry.season != null && entry.episode != null) {
              const show = await getTVDetails({ data: entry.imdb_id });
              if (!show) return null;
              return {
                id: entry.id,
                imdb_id: entry.imdb_id,
                watchId: `tv-${entry.imdb_id}-s${entry.season}e${entry.episode}`,
                title: `${show.name} — S${entry.season}E${entry.episode}`,
                backdrop_path: show.backdrop_path,
                progress: entry.progress,
                duration: entry.duration,
                updated_at: entry.updated_at,
                media_type: "tv",
              };
            } else {
              const movie = await getMovieDetails({ data: entry.imdb_id });
              if (!movie) return null;
              return {
                id: entry.id,
                imdb_id: entry.imdb_id,
                watchId: entry.imdb_id,
                title: movie.title,
                backdrop_path: movie.backdrop_path,
                progress: entry.progress,
                duration: entry.duration,
                updated_at: entry.updated_at,
                media_type: "movie",
              };
            }
          } catch {
            return null;
          }
        }),
      );
      setItems(results.filter(Boolean));
      setLoading(false);
    };

    load();
  }, [profile?.id]);

  const removeItem = async (item: any) => {
    if (!profile?.id) return;

    // Optimistic UI
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    if (item.media_type === "tv") {
      // Remove ALL episodes for this TV show
      await supabase
        .from("watch_history")
        .delete()
        .eq("profile_id", profile.id)
        .eq("imdb_id", item.imdb_id)
        .eq("media_type", "tv");
    } else {
      await supabase.from("watch_history").delete().eq("id", item.id);
    }
  };

  const clearAll = async () => {
    if (!profile?.id) return;
    if (!confirm(t("history.clearConfirm", lang))) return;

    setItems([]);
    await supabase.from("watch_history").delete().eq("profile_id", profile.id);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-arc-void pt-24 pb-12 px-[5vw]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-3xl font-extrabold text-arc-text">
              {t("history.title", lang)}
            </h1>
            {items.length > 0 && (
              <button
                onClick={clearAll}
                className="text-sm font-semibold text-red-500/80 hover:text-red-400 transition"
              >
                {t("history.clearAll", lang)}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-arc-accent" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 bg-arc-surface-2 rounded-xl border border-white/5">
              <p className="text-arc-muted">{t("history.empty", lang)}</p>
              <Link to="/browse" className="mt-4 inline-block text-arc-accent hover:underline">
                {t("history.discover", lang)}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {items.map((item) => {
                const pct =
                  item.duration > 0 ? Math.min((item.progress / item.duration) * 100, 100) : 0;
                const d = new Date(item.updated_at);

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-xl overflow-hidden border border-white/10 bg-arc-surface-2 flex flex-col"
                  >
                    <Link to="/watch/$id" params={{ id: item.watchId }} className="block flex-1">
                      <div
                        className="aspect-video bg-cover bg-center relative"
                        style={{
                          backgroundImage: item.backdrop_path
                            ? `url(https://image.tmdb.org/t/p/w500${item.backdrop_path})`
                            : "none",
                        }}
                      >
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="h-1 bg-white/10 w-full relative">
                        <div
                          className="absolute top-0 left-0 h-full bg-arc-accent transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-arc-text truncate">{item.title}</p>
                        <p className="text-[10px] text-arc-text/50 uppercase tracking-widest mt-1">
                          {d.toLocaleDateString()}
                        </p>
                      </div>
                    </Link>

                    <button
                      onClick={() => removeItem(item)}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500/80 hover:border-red-500"
                      title={t("history.remove", lang)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
