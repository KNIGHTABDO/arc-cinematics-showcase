import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStreamForMovie } from "@/lib/server/streams";
import { getSubtitlesForMedia, getSubtitleVtt } from "@/lib/server/subtitles";
import { getMovieDetails, getTVDetails } from "@/lib/server/tmdb";
import { supabase } from "@/lib/supabase";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";
import { isMovieAllowedForKids, isTVAllowedForKids } from "@/lib/kids-content";

interface SubtitleTrack {
  label: string;
  lang: string;
  url: string;
}

export const Route = createFileRoute("/watch/$id")({
  component: WatchPage,
});

/** Parse watch ID: "tv-76479-s1e3" → TV, "12345" → Movie */
function parseWatchId(id: string) {
  const tvMatch = id.match(/^tv-(\d+)-s(\d+)e(\d+)$/);
  if (tvMatch) {
    return {
      type: "tv" as const,
      tmdbId: tvMatch[1],
      season: parseInt(tvMatch[2]),
      episode: parseInt(tvMatch[3]),
    };
  }
  return { type: "movie" as const, tmdbId: id, season: undefined, episode: undefined };
}

function WatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const progressInterval = useRef<ReturnType<typeof setInterval>>(undefined);

  const parsed = parseWatchId(id);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [backupStreams, setBackupStreams] = useState<string[]>([]);
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [quality, setQuality] = useState<"auto" | "2160" | "1080" | "720" | "480">("auto");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Loading...");
  const [backdrop, setBackdrop] = useState<string>("");

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [activeSubVttUrl, setActiveSubVttUrl] = useState<string | null>(null);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const { lang, profile } = useSettings();
  const isKids = profile?.is_kids === true;

  // Fetch details (movie or TV) + stream
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (parsed.type === "tv") {
          const show: any = await getTVDetails({ data: parsed.tmdbId });
          if (cancelled) return;

          const label = `${show?.name || "Show"} — S${parsed.season}E${parsed.episode}`;
          setTitle(label);
          if (show?.backdrop_path) {
            setBackdrop(`https://image.tmdb.org/t/p/w780${show.backdrop_path}`);
          }

          if (isKids && !isTVAllowedForKids(show)) {
            setError("This content is not available on kids profiles.");
            return;
          }
        } else {
          const movie: any = await getMovieDetails({ data: parsed.tmdbId });
          if (cancelled) return;

          if (movie?.title) setTitle(movie.title);
          if (movie?.backdrop_path) {
            setBackdrop(`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`);
          }

          if (isKids && !isMovieAllowedForKids(movie)) {
            setError("This content is not available on kids profiles.");
            return;
          }
        }

        const clientProfile =
          typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? "ios_safari"
            : "default";

        const res: any = await getStreamForMovie({
          data: { watchId: id, preferredQuality: quality, clientProfile },
        });
        if (cancelled) return;

        if (res.error || res.errorCode) {
          const code = res.errorCode ? `[${res.errorCode}] ` : "";
          throw new Error(`${code}${res.error || "Failed to locate stream."}`);
        }

        if (res.streamUrl) {
          setStreamUrl(res.streamUrl);
          setBackupStreams(Array.isArray(res.backupStreams) ? res.backupStreams : []);
          setCurrentStreamIndex(0);
          setStreamReady(false);
          setError(null);
          return;
        }

        throw new Error("Resolver returned no stream URL.");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to locate stream.");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, parsed.type, parsed.tmdbId, parsed.season, parsed.episode, isKids, quality]);

  // Fetch subtitles via server function and convert selected track to VTT blob URL
  useEffect(() => {
    let cancelled = false;

    const fetchSubs = async () => {
      try {
        const details =
          parsed.type === "tv"
            ? await getTVDetails({ data: parsed.tmdbId })
            : await getMovieDetails({ data: parsed.tmdbId });

        const imdbId = details?.external_ids?.imdb_id || details?.imdb_id;
        if (!imdbId || cancelled) return;

        const result: any = await getSubtitlesForMedia({
          data: {
            imdbId,
            type: parsed.type,
            season: parsed.season,
            episode: parsed.episode,
            language: profile?.subtitle_language || undefined,
          },
        });

        if (cancelled) return;

        const tracks: SubtitleTrack[] = Array.isArray(result?.tracks)
          ? result.tracks
              .map((s: any) => ({
                label: String(s?.label || "Unknown"),
                lang: String(s?.lang || ""),
                url: String(s?.url || ""),
              }))
              .filter((s: SubtitleTrack) => s.url)
          : [];

        setSubtitles(tracks);

        if (tracks.length === 0) {
          setActiveSub(null);
          setActiveSubVttUrl(null);
          return;
        }

        const preferred = profile?.subtitle_language
          ? tracks.find((s) => s.lang.toLowerCase().includes(profile.subtitle_language.toLowerCase()))
          : tracks[0];

        if (preferred) {
          setActiveSub(preferred.url);
        }
      } catch (e) {
        console.warn("[ARC] Subtitle fetch failed:", e);
      }
    };

    void fetchSubs();

    return () => {
      cancelled = true;
    };
  }, [id, parsed.type, parsed.tmdbId, parsed.season, parsed.episode, profile?.subtitle_language]);

  // Convert selected subtitle to VTT object URL for <track>
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const loadVtt = async () => {
      if (!activeSub) {
        setActiveSubVttUrl(null);
        return;
      }

      try {
        const result: any = await getSubtitleVtt({ data: { url: activeSub } });
        if (cancelled) return;

        if (!result?.vtt) {
          setActiveSubVttUrl(null);
          return;
        }

        const blob = new Blob([result.vtt], { type: "text/vtt;charset=utf-8" });
        objectUrl = URL.createObjectURL(blob);
        setActiveSubVttUrl(objectUrl);
      } catch {
        if (!cancelled) setActiveSubVttUrl(null);
      }
    };

    void loadVtt();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeSub]);

  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId || !videoRef.current) return;

    supabase
      .from("watch_history")
      .select("progress")
      .eq("profile_id", profileId)
      .eq("imdb_id", id)
      .single()
      .then(({ data }) => {
        if (data?.progress && videoRef.current) {
          videoRef.current.currentTime = data.progress;
        }
      });
  }, [id, streamUrl]);

  // Save progress every 1 second
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId || !streamUrl) return;

    const saveProgress = async () => {
      const v = videoRef.current;
      if (!v || v.duration === 0) return;

      const { error } = await supabase.from("watch_history").upsert(
        {
          profile_id: profileId,
          imdb_id: id,
          progress: parseFloat(v.currentTime.toFixed(3)), // ms precision
          duration: parseFloat(v.duration.toFixed(3)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,imdb_id" },
      );
      if (error) console.error("[ARC] watch_history save error:", error.message, error.details);
    };

    // Save every 1 second while playing
    progressInterval.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;
      saveProgress();
    }, 1000);

    // Also save immediately on pause or before unload
    const onPause = () => saveProgress();
    const onBeforeUnload = () => saveProgress();
    const videoEl = videoRef.current;
    videoEl?.addEventListener("pause", onPause);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      videoEl?.removeEventListener("pause", onPause);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Final save on unmount
      saveProgress();
    };
  }, [id, streamUrl]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [playing, resetControlsTimer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "q":
          e.preventDefault();
          setShowQualityMenu((x) => !x);
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          v.muted = !v.muted;
          setMuted(v.muted);
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime -= 10;
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime += 10;
          break;
        case "ArrowUp":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          setVolume(v.volume);
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          setVolume(v.volume);
          break;
        case "Escape":
          if (parsed.type === "tv") {
            navigate({ to: "/tv/$id", params: { id: parsed.tmdbId.toString() } });
          } else {
            navigate({ to: "/title/$id", params: { id: parsed.tmdbId.toString() } });
          }
          break;
      }
      resetControlsTimer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [id, navigate, resetControlsTimer, parsed.type, parsed.tmdbId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) videoRef.current.currentTime = pct * duration;
  };

  // === ERROR STATE ===
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
        <h1 className="font-display text-4xl font-extrabold text-arc-text">Stream Unavailable</h1>
        <p className="mt-4 text-arc-muted max-w-md">{error}</p>
        <button
          onClick={() => {
            if (parsed.type === "tv")
              navigate({ to: "/tv/$id", params: { id: parsed.tmdbId.toString() } });
            else navigate({ to: "/title/$id", params: { id: parsed.tmdbId.toString() } });
          }}
          className="mt-8 rounded-full bg-arc-surface-2 px-6 py-3 font-semibold text-white transition hover:bg-arc-accent"
        >
          Go Back
        </button>
      </div>
    );
  }

  // === LOADING STATE ===
  if (!streamUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black relative overflow-hidden">
        {backdrop && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl scale-110"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-arc-accent border-r-arc-accent"></div>
          <p className="mt-8 font-display text-xl tracking-[0.3em] text-arc-text/60 animate-pulse uppercase">
            Extracting Secure Stream
          </p>
          <p className="mt-2 text-sm text-arc-muted">Connecting to Real-Debrid network...</p>
        </div>
      </div>
    );
  }

  // === PLAYER ===
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black select-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      style={{ cursor: showControls ? "default" : "none" }}
    >
      {/* Video Element — NO crossOrigin for RD links */}
      <video
        ref={videoRef}
        src={streamUrl}
        autoPlay
        crossOrigin="anonymous"
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onCanPlay={() => setStreamReady(true)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          setStreamReady(true);
        }}
        onVolumeChange={() => {
          setVolume(videoRef.current?.volume || 1);
          setMuted(videoRef.current?.muted || false);
        }}
        onClick={() => {
          const v = videoRef.current;
          if (v) v.paused ? v.play() : v.pause();
        }}
        onError={() => {
          const next = backupStreams[currentStreamIndex];
          if (next) {
            setCurrentStreamIndex((idx) => idx + 1);
            setStreamReady(false);
            setBuffering(true);
            setStreamUrl(next);
            return;
          }
          setError("Playback failed for this stream URL.");
        }}
      >
        {activeSubVttUrl && (
          <track
            kind="subtitles"
            src={activeSubVttUrl}
            srcLang={(profile?.subtitle_language || "en").slice(0, 2)}
            label={t("player.subtitles", lang)}
            default
          />
        )}
      </video>

      {/* Buffering Overlay */}
      {(buffering || !streamReady) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-transparent border-t-arc-accent"></div>
        </div>
      )}

      {/* Top Bar */}
      <div
        className={`absolute top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between transition-all duration-500 ${
          showControls
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)" }}
      >
        <button
          onClick={() => {
            if (parsed.type === "tv") {
              navigate({ to: "/tv/$id", params: { id: parsed.tmdbId.toString() } });
            } else {
              navigate({ to: "/title/$id", params: { id: parsed.tmdbId.toString() } });
            }
          }}
          className="flex items-center gap-2 text-white/80 hover:text-white transition text-sm font-medium"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <h1 className="font-display text-base font-semibold text-white/90 drop-shadow-lg truncate max-w-[60%] text-center">
          {title}
        </h1>
        <div className="w-16" /> {/* Spacer */}
      </div>

      {/* Bottom Controls */}
      <div
        className={`absolute bottom-0 inset-x-0 z-50 px-6 pb-6 pt-16 transition-all duration-500 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
      >
        {/* Progress Bar */}
        <div
          className="group relative w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-5 hover:h-2.5 transition-all"
          onClick={seekTo}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--arc-accent)" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition"
            style={{ left: `calc(${progress}% - 8px)` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            {/* Play/Pause */}
            <button
              onClick={() => {
                const v = videoRef.current;
                if (v) v.paused ? v.play() : v.pause();
              }}
              className="text-white hover:text-arc-accent transition"
            >
              {playing ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip -10s */}
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime -= 10;
              }}
              className="text-white/70 hover:text-white transition"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                <text
                  x="12"
                  y="16"
                  textAnchor="middle"
                  fill="currentColor"
                  stroke="none"
                  fontSize="8"
                  fontWeight="bold"
                >
                  10
                </text>
              </svg>
            </button>

            {/* Skip +10s */}
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime += 10;
              }}
              className="text-white/70 hover:text-white transition"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                <text
                  x="12"
                  y="16"
                  textAnchor="middle"
                  fill="currentColor"
                  stroke="none"
                  fontSize="8"
                  fontWeight="bold"
                >
                  10
                </text>
              </svg>
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !videoRef.current.muted;
                    setMuted(!muted);
                  }
                }}
                className="text-white/70 hover:text-white transition"
              >
                {muted || volume === 0 ? (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                  }
                  setVolume(v);
                  setMuted(v === 0);
                }}
                className="w-20 h-1 accent-[var(--arc-accent)] cursor-pointer"
              />
            </div>

            {/* Time */}
            <span className="text-white/60 text-sm tabular font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Quality selector */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="text-white/70 hover:text-white transition text-xs border border-white/20 rounded-md px-2 py-1"
                title="Stream quality"
              >
                {quality === "auto" ? "Auto" : `${quality}p`}
              </button>
              {showQualityMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[120px] backdrop-blur-xl">
                  {(["auto", "2160", "1080", "720", "480"] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setShowQualityMenu(false);
                        if (q !== quality) {
                          setQuality(q);
                          setStreamUrl(null);
                          setBackupStreams([]);
                          setCurrentStreamIndex(0);
                          setStreamReady(false);
                          setBuffering(true);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${quality === q ? "text-arc-accent bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
                    >
                      {q === "auto" ? "Auto" : `${q}p`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Subtitles */}
            <div className="relative">
              <button
                onClick={() => setShowSubMenu(!showSubMenu)}
                className={`text-white/70 hover:text-white transition ${activeSub ? "text-arc-accent" : ""}`}
                title="Subtitles"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="14" x2="23" y2="14" />
                  <text
                    x="12"
                    y="12"
                    textAnchor="middle"
                    fill="currentColor"
                    stroke="none"
                    fontSize="7"
                    fontWeight="bold"
                  >
                    CC
                  </text>
                </svg>
              </button>
              {showSubMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[180px] max-h-[300px] overflow-y-auto backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setActiveSub(null);
                      setActiveSubVttUrl(null);
                      setShowSubMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${!activeSub ? "text-arc-accent bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
                  >
                    {t("player.off", lang)}
                  </button>
                  {subtitles.map((sub, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setActiveSub(sub.url);
                        setShowSubMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${activeSub === sub.url ? "text-arc-accent bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
                    >
                      {sub.label}
                    </button>
                  ))}
                  {subtitles.length === 0 && (
                    <div className="px-3 py-2 text-xs text-arc-muted">No subtitles found</div>
                  )}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition"
            >
              {fullscreen ? (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
