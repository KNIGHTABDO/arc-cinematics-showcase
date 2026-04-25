import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdvancedPlayer } from "@/components/AdvancedPlayer";

const TIME_REGEX = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g;

const shiftVttTime = (vttText: string, offsetSeconds: number): string => {
  if (!vttText || offsetSeconds === 0) return vttText;

  return vttText.replace(TIME_REGEX, (match, hours, minutes, seconds, milliseconds) => {
    const totalMs =
      parseInt(hours, 10) * 3600000 +
      parseInt(minutes, 10) * 60000 +
      parseInt(seconds, 10) * 1000 +
      parseInt(milliseconds, 10);

    const newTotalMs = Math.max(0, totalMs + offsetSeconds * 1000);

    const newH = Math.floor(newTotalMs / 3600000)
      .toString()
      .padStart(2, "0");
    const newM = Math.floor((newTotalMs % 3600000) / 60000)
      .toString()
      .padStart(2, "0");
    const newS = Math.floor((newTotalMs % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    const newMs = (newTotalMs % 1000).toString().padStart(3, "0");

    return `${newH}:${newM}:${newS}.${newMs}`;
  });
};
import { supabase } from "@/lib/supabase";
import {
  getStreamForMovie,
  pollTorrentStatus,
  resolvePlaybackStream,
  TERMINAL_STATUSES,
  CLIENT_POLL_INTERVALS_MS,
} from "@/lib/server/streams";
import { getSubtitlesForMedia, getSubtitleVtt } from "@/lib/server/subtitles";
import { getMovieDetails, getTVDetails } from "@/lib/server/tmdb";
import { useSettings } from "@/lib/store/settings";
import { useSubtitlesStore } from "@/lib/store/subtitles";
import { t } from "@/lib/i18n";
import { isMovieAllowedForKids, isTVAllowedForKids } from "@/lib/kids-content";

interface SubtitleTrack {
  label: string;
  lang: string;
  url: string;
  syncConfidence?: number;
  suggestedOffsetMs?: number;
}

interface AudioTrackOption {
  index: number;
  label: string;
  language: string;
  kind: string;
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
  const stallTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rebufferTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasUserSelectedAudioTrack = useRef(false);

  const parsed = parseWatchId(id);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamFilename, setStreamFilename] = useState<string>("");
  /** Stable RD hoster URL returned by getStreamForMovie. Used for retry without re-polling. */
  const [rdHostLink, setRdHostLink] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
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
  const [rawVttText, setRawVttText] = useState<string | null>(null);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showSubSettings, setShowSubSettings] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [savedProgress, setSavedProgress] = useState<number | null>(null);
  const [hasRestoredProgress, setHasRestoredProgress] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [activeAudioTrackIdx, setActiveAudioTrackIdx] = useState<number | null>(null);
  const [originalAudioLanguage, setOriginalAudioLanguage] = useState<string>("");
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  /** Granular status text shown in the loading overlay during stream resolution */
  const [streamLoadStatus, setStreamLoadStatus] = useState<string>("Locating stream…");
  /** Set when the bitrate filter auto-downgraded the format to prevent device crashes */
  const [bitrateWarning, setBitrateWarning] = useState<string | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const { lang, profile } = useSettings();
  const subStore = useSubtitlesStore();
  const isKids = profile?.is_kids === true;

  // Fetch details (movie or TV) + stream
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const profileId = profile?.id || localStorage.getItem("arc_active_profile");
        if (!profileId) {
          setError("Please choose a profile.");
          navigate({ to: "/profiles" });
          return;
        }

        let preferredAudioLanguage = "";

        if (parsed.type === "tv") {
          const show: any = await getTVDetails({ data: parsed.tmdbId });
          if (cancelled) return;

          const label = `${show?.name || "Show"} — S${parsed.season}E${parsed.episode}`;
          setTitle(label);
          if (show?.backdrop_path) {
            setBackdrop(`https://image.tmdb.org/t/p/w780${show.backdrop_path}`);
          }

          preferredAudioLanguage = String(show?.original_language || "").toLowerCase();

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

          preferredAudioLanguage = String(movie?.original_language || "").toLowerCase();

          if (isKids && !isMovieAllowedForKids(movie)) {
            setError("This content is not available on kids profiles.");
            return;
          }
        }

        setOriginalAudioLanguage(preferredAudioLanguage.slice(0, 2));

        const clientProfile =
          typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? "ios_safari"
            : "default";

        // ── Phase 1: Fast torrent init (<5 s, safe for Vercel Hobby) ────────────
        // getStreamForMovie does TMDB + Torrentio + addMagnet + ONE status check.
        // It does NOT poll — long polling runs here on the client to avoid
        // Vercel serverless function timeout limits (10 s Hobby / 60 s Pro).
        setBitrateWarning(null);
        setStreamLoadStatus("Locating stream on Real-Debrid…");

        const torrentRes: any = await getStreamForMovie({
          data: {
            watchId: id,
            preferredQuality: quality,
            clientProfile,
            preferredAudioLanguage: preferredAudioLanguage.slice(0, 2) || undefined,
          },
        });
        if (cancelled) return;

        if (torrentRes.error) {
          throw new Error(torrentRes.error);
        }
        if (!torrentRes.torrentId) {
          throw new Error("No torrent ID returned — please retry.");
        }

        // ── Phase 1.5: Client-side polling until status === "downloaded" ─────────
        // Each poll is a single lightweight server call (<1 s). The loop runs in
        // the browser, completely bypassing serverless timeout restrictions.
        let rdHostLink: string | null = torrentRes.rdHostLink ?? null;

        if (!rdHostLink) {
          setStreamLoadStatus("Stream found — waiting for Real-Debrid to process…");
          const clientWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
          let pollCount = 0;
          const maxPolls = 90; // ~6 min ceiling with back-off intervals

          while (!rdHostLink && !cancelled && pollCount < maxPolls) {
            const interval =
              CLIENT_POLL_INTERVALS_MS[Math.min(pollCount, CLIENT_POLL_INTERVALS_MS.length - 1)];
            await clientWait(interval);
            if (cancelled) return;

            const statusRes: any = await pollTorrentStatus({
              data: { torrentId: torrentRes.torrentId },
            });
            if (cancelled) return;

            if (statusRes.error || TERMINAL_STATUSES.has(statusRes.status ?? "")) {
              throw new Error(
                statusRes.error ||
                  `Stream failed with status "${statusRes.status}". Try another quality or title.`,
              );
            }

            if (statusRes.status === "downloaded" && statusRes.rdHostLink) {
              rdHostLink = statusRes.rdHostLink;
            } else {
              const pct =
                typeof statusRes.progress === "number" && statusRes.progress > 0
                  ? ` (${Math.round(statusRes.progress)}%)`
                  : "";
              setStreamLoadStatus(`Real-Debrid: ${statusRes.status ?? "processing"}${pct}…`);
            }
            pollCount++;
          }

          if (!rdHostLink) {
            throw new Error("Real-Debrid did not finish processing in time. Please retry.");
          }
        }

        // Store stable hoster URL for the Retry button (re-unrestricts without re-polling)
        setRdHostLink(rdHostLink);

        // ── Phase 2: Lazy unrestriction at playback time ─────────────────────────
        // Calls /unrestrict/link NOW — only when the user is about to watch —
        // so the CDN download URL is always fresh. Also applies bitrate filter.
        setStreamLoadStatus("Preparing playback link…");

        const playbackRes = await resolvePlaybackStream({
          data: {
            rdHostLink,
            clientProfile,
            preferredAudioLanguage: preferredAudioLanguage.slice(0, 2) || undefined,
            preferredQuality: quality,
          },
        });
        if (cancelled) return;

        if (playbackRes.error) {
          throw new Error(playbackRes.error);
        }

        if (playbackRes.streamUrl) {
          setStreamUrl(playbackRes.streamUrl);

          setStreamFilename(playbackRes.filename || torrentRes.filename || "");
          setBitrateWarning(playbackRes.bitrateWarning ?? null);
          setStreamReady(false);
          setAudioTracks([]);
          setActiveAudioTrackIdx(null);
          hasUserSelectedAudioTrack.current = false;
          setError(null);
          return;
        }

        throw new Error("Playback stream unavailable for this title.");
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
            releaseName: streamFilename,
            title: details?.title || details?.name || undefined,
            originalTitle: details?.original_title || details?.original_name || undefined,
            originalLanguage: details?.original_language || undefined,
          },
        });

        if (cancelled) return;

        const tracks: SubtitleTrack[] = Array.isArray(result?.tracks)
          ? result.tracks
              .map((s: any) => ({
                label: String(s?.label || "Unknown"),
                lang: String(s?.lang || ""),
                url: String(s?.url || ""),
                syncConfidence:
                  typeof s?.syncConfidence === "number" ? s.syncConfidence : undefined,
                suggestedOffsetMs:
                  typeof s?.suggestedOffsetMs === "number" ? s.suggestedOffsetMs : undefined,
              }))
              .filter((s: SubtitleTrack) => s.url)
          : [];

        setSubtitles(tracks);

        if (tracks.length === 0) {
          setActiveSub(null);
          setActiveSubVttUrl(null);
          return;
        }

        // Auto-select best track (index 0 = highest score from backend)
        const autoIdx = typeof result?.autoSelectIndex === "number" ? result.autoSelectIndex : 0;
        if (autoIdx >= 0 && autoIdx < tracks.length) {
          setActiveSub(tracks[autoIdx].url);
          if (typeof tracks[autoIdx].suggestedOffsetMs === "number") {
            setOffsetMs(tracks[autoIdx].suggestedOffsetMs);
          }
        } else {
          setActiveSub(tracks[0].url);
          if (typeof tracks[0].suggestedOffsetMs === "number") {
            setOffsetMs(tracks[0].suggestedOffsetMs);
          }
        }
      } catch (e) {
        console.warn("[ARC] Subtitle fetch failed:", e);
      }
    };

    void fetchSubs();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    parsed.type,
    parsed.tmdbId,
    parsed.season,
    parsed.episode,
    profile?.subtitle_language,
    streamFilename,
  ]);

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
        const result: any = await getSubtitleVtt({ data: { url: activeSub, offsetMs } });
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
  }, [activeSub, offsetMs]);

  /**
   * Re-unrestricts the stored rdHostLink to get a fresh CDN URL without re-polling
   * the full torrent resolution. Called when playback fails (403/404/timeout errors).
   */
  const retryPlayback = useCallback(async () => {
    if (!rdHostLink) {
      // No stored link → force full re-resolve by clearing all stream state
      setError(null);
      setStreamUrl(null);
      setRdHostLink(null);
      return;
    }
    setError(null);
    setIsRetrying(true);
    setStreamUrl(null);
    setStreamLoadStatus("Refreshing CDN link…");
    try {
      const clientProfile =
        typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? ("ios_safari" as const)
          : ("default" as const);
      const playbackRes = await resolvePlaybackStream({
        data: {
          rdHostLink,
          clientProfile,
          preferredAudioLanguage: originalAudioLanguage.slice(0, 2) || undefined,
          preferredQuality: quality,
        },
      });
      if (playbackRes.error) {
        setError(playbackRes.error);
        return;
      }
      if (playbackRes.streamUrl) {
        setStreamUrl(playbackRes.streamUrl);
        setBitrateWarning(playbackRes.bitrateWarning ?? null);
        setStreamFilename(playbackRes.filename || "");
        setAudioTracks([]);
        setActiveAudioTrackIdx(null);
        hasUserSelectedAudioTrack.current = false;
      }
    } catch (err: any) {
      setError(err.message || "Retry failed — please go back and try again.");
    } finally {
      setIsRetrying(false);
    }
  }, [rdHostLink, quality, originalAudioLanguage]);

  const refreshAudioTracks = useCallback(() => {
    const v = videoRef.current as (HTMLVideoElement & { audioTracks?: any }) | null;
    const list = v?.audioTracks;

    if (!list || typeof list.length !== "number") {
      setAudioTracks([]);
      setActiveAudioTrackIdx(null);
      return;
    }

    const tracks: Array<{ enabled?: boolean; language?: string; label?: string; kind?: string }> =
      [];
    for (let i = 0; i < list.length; i++) {
      tracks.push(list[i]);
    }

    const options: AudioTrackOption[] = tracks.map((track, index) => ({
      index,
      label: track?.label || `Track ${index + 1}`,
      language: (track?.language || "").toLowerCase(),
      kind: track?.kind || "main",
    }));

    setAudioTracks(options);

    let activeIdx = tracks.findIndex((track) => Boolean(track?.enabled));
    if (activeIdx < 0 && options.length > 0) activeIdx = 0;

    const targetLang = originalAudioLanguage.toLowerCase().slice(0, 2);
    if (!hasUserSelectedAudioTrack.current && targetLang && options.length > 1) {
      const preferredIdx = options.findIndex((track) => track.language.startsWith(targetLang));
      if (preferredIdx >= 0) {
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].enabled = i === preferredIdx;
        }
        activeIdx = preferredIdx;
      }
    }

    setActiveAudioTrackIdx(activeIdx >= 0 ? activeIdx : null);
  }, [originalAudioLanguage]);

  const setNativeAudioTrack = useCallback((index: number) => {
    const v = videoRef.current as (HTMLVideoElement & { audioTracks?: any }) | null;
    const list = v?.audioTracks;

    if (!list || typeof list.length !== "number") return;
    if (index < 0 || index >= list.length) return;

    for (let i = 0; i < list.length; i++) {
      list[i].enabled = i === index;
    }

    hasUserSelectedAudioTrack.current = true;
    setActiveAudioTrackIdx(index);
  }, []);

  // Keyboard shortcuts for subtitle sync
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[") {
        e.preventDefault();
        setOffsetMs((o) => o - 500);
      } else if (e.key === "]") {
        e.preventDefault();
        setOffsetMs((o) => o + 500);
      } else if (e.key === "{" && e.shiftKey) {
        e.preventDefault();
        setOffsetMs((o) => o - 100);
      } else if (e.key === "}" && e.shiftKey) {
        e.preventDefault();
        setOffsetMs((o) => o + 100);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Persist subtitle offset per title + subtitle URL for faster future replays.
  useEffect(() => {
    if (!activeSub || typeof window === "undefined") return;

    const key = `arc_sub_offset:${id}:${activeSub}`;
    const stored = window.localStorage.getItem(key);
    if (stored == null) {
      setOffsetMs(0);
      return;
    }

    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setOffsetMs(parsed);
    } else {
      setOffsetMs(0);
    }
  }, [id, activeSub]);

  useEffect(() => {
    if (!activeSub || typeof window === "undefined") return;
    const key = `arc_sub_offset:${id}:${activeSub}`;
    window.localStorage.setItem(key, String(offsetMs));
  }, [id, activeSub, offsetMs]);

  // Refresh available audio tracks when stream metadata changes.
  useEffect(() => {
    refreshAudioTracks();

    const v = videoRef.current as (HTMLVideoElement & { audioTracks?: any }) | null;
    const list = v?.audioTracks;
    if (!list || typeof list.addEventListener !== "function") return;

    const update = () => refreshAudioTracks();
    list.addEventListener("addtrack", update);
    list.addEventListener("removetrack", update);
    list.addEventListener("change", update);

    return () => {
      list.removeEventListener("addtrack", update);
      list.removeEventListener("removetrack", update);
      list.removeEventListener("change", update);
    };
  }, [streamUrl, refreshAudioTracks]);

  // Avoid infinite spinner by failing over if stream does not start within a deadline.
  // (Removed to let the player naturally buffer)

  // Detect post-start buffering stalls and fail over instead of spinning forever.
  // (Removed to prevent arbitrary drops)

  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId) return;

    let restoreQuery = supabase
      .from("watch_history")
      .select("progress")
      .eq("profile_id", profileId)
      .eq("imdb_id", parsed.tmdbId)
      .eq("media_type", parsed.type);

    if (parsed.season) restoreQuery = restoreQuery.eq("season", parsed.season);
    else restoreQuery = restoreQuery.is("season", null);

    if (parsed.episode) restoreQuery = restoreQuery.eq("episode", parsed.episode);
    else restoreQuery = restoreQuery.is("episode", null);

    restoreQuery.maybeSingle().then(({ data }) => {
      if (data?.progress) {
        const progressInSeconds = data.progress > 1000 ? data.progress / 1000 : data.progress;
        if (progressInSeconds > 10) {
          setSavedProgress(progressInSeconds);
        }
      }
    });
  }, [id, parsed.tmdbId, parsed.type, parsed.season, parsed.episode]);

  // AdvancedPlayer handles initial seeking natively

  // Save progress every 10 seconds while playing
  useEffect(() => {
    const profileId = localStorage.getItem("arc_active_profile");
    if (!profileId || !streamUrl) return;

    const saveProgress = async () => {
      const v = videoRef.current;
      if (!v) return;

      const durationVal = Math.floor(v.duration * 1000);
      if (isNaN(durationVal) || durationVal <= 0) return;

      const payload = {
        profile_id: profileId,
        imdb_id: parsed.tmdbId,
        media_type: parsed.type,
        season: parsed.season || null,
        episode: parsed.episode || null,
        progress: Math.floor(v.currentTime * 1000),
        duration: durationVal,
        updated_at: new Date().toISOString(),
      };

      let findQuery = supabase
        .from("watch_history")
        .select("id")
        .eq("profile_id", profileId)
        .eq("imdb_id", parsed.tmdbId)
        .eq("media_type", parsed.type);

      if (parsed.season) findQuery = findQuery.eq("season", parsed.season);
      else findQuery = findQuery.is("season", null);

      if (parsed.episode) findQuery = findQuery.eq("episode", parsed.episode);
      else findQuery = findQuery.is("episode", null);

      const { data } = await findQuery.maybeSingle();

      let error;
      if (data?.id) {
        const { error: updateErr } = await supabase
          .from("watch_history")
          .update({
            progress: payload.progress,
            duration: payload.duration,
            updated_at: payload.updated_at,
          })
          .eq("id", data.id);
        error = updateErr;
      } else {
        const { error: insertErr } = await supabase.from("watch_history").insert([payload]);
        error = insertErr;
      }

      if (error && error.code !== "23505") {
        console.error("[ARC] watch_history save error:", error.message, error.details);
      }
    };

    progressInterval.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;
      saveProgress();
    }, 3000);

    const onPause = () => saveProgress();
    const onBeforeUnload = () => saveProgress();
    const videoEl = videoRef.current;
    videoEl?.addEventListener("pause", onPause);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      videoEl?.removeEventListener("pause", onPause);
      window.removeEventListener("beforeunload", onBeforeUnload);
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
          if (v.paused) {
            const p = v.play();
            if (p !== undefined) p.catch(() => {});
          } else {
            v.pause();
          }
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
    const videoEl = videoRef.current;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // iOS Safari: fullscreen API only works on the <video> element itself
    if (isIOS && videoEl) {
      if ((videoEl as any).webkitEnterFullscreen) {
        (videoEl as any).webkitEnterFullscreen();
      } else if ((videoEl as any).webkitRequestFullscreen) {
        (videoEl as any).webkitRequestFullscreen();
      }
      return;
    }

    // Standard Fullscreen API for desktop/Android
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      }
      setFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
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
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) videoRef.current.currentTime = pct * duration;
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = pos / rect.width;
    setHoverPosition(pos);
    setHoverTime(pct * duration);
  };

  const handleProgressMouseLeave = () => {
    setHoverPosition(null);
    setHoverTime(null);
  };

  // === ERROR STATE ===
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
        <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="font-display text-4xl font-extrabold text-arc-text">Stream Unavailable</h1>
        <p className="mt-4 text-arc-muted max-w-md text-sm leading-relaxed">{error}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center">
          <button
            onClick={() => void retryPlayback()}
            disabled={isRetrying}
            className="rounded-full bg-arc-accent text-arc-void px-6 py-3 font-bold text-sm transition hover:bg-white disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
          >
            {isRetrying ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-arc-void/30 border-t-arc-void animate-spin" />
                Retrying…
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Retry Stream
              </>
            )}
          </button>
          <button
            onClick={() => {
              if (parsed.type === "tv")
                navigate({ to: "/tv/$id", params: { id: parsed.tmdbId.toString() } });
              else navigate({ to: "/title/$id", params: { id: parsed.tmdbId.toString() } });
            }}
            className="rounded-full bg-arc-surface-2 px-6 py-3 font-semibold text-sm text-white transition hover:bg-arc-accent"
          >
            Go Back
          </button>
        </div>
        <p className="mt-6 text-xs text-arc-muted/60 max-w-sm">
          Retry generates a fresh CDN link from Real-Debrid without re-downloading the torrent. Most
          playback errors are resolved on the first retry.
        </p>
      </div>
    );
  }

  // === LOADING STATE ===
  if (!streamUrl) {
    // Derive which stage we're in from the status message for the step indicators
    const isStage1 = streamLoadStatus.startsWith("Locating");
    const isStage2 =
      streamLoadStatus.startsWith("Stream found") || streamLoadStatus.startsWith("Real-Debrid:");
    const isStage3 = streamLoadStatus.startsWith("Preparing");

    const stages = [
      { label: "Finding stream", done: !isStage1, active: isStage1 },
      { label: "Caching on RD", done: isStage3, active: isStage2 },
      { label: "Generating link", done: false, active: isStage3 },
    ];

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black relative overflow-hidden">
        {backdrop && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl scale-110"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">
          {/* Spinner */}
          <div className="h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-arc-accent border-r-arc-accent" />

          {/* Title */}
          <p className="mt-8 font-display text-xl tracking-[0.25em] text-arc-text/70 animate-pulse uppercase">
            {title !== "Loading..." ? title : "Loading…"}
          </p>

          {/* Live status message */}
          <p className="mt-3 text-sm text-arc-muted text-center leading-relaxed min-h-[2.5rem]">
            {streamLoadStatus}
          </p>

          {/* Stage indicators */}
          <div className="mt-8 flex items-center gap-0 w-full">
            {stages.map((stage, i) => (
              <div key={stage.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                      stage.done
                        ? "bg-arc-accent scale-110"
                        : stage.active
                          ? "bg-arc-accent animate-pulse"
                          : "bg-white/20"
                    }`}
                  />
                  <span
                    className={`mt-2 text-[10px] text-center leading-tight transition-colors duration-300 ${
                      stage.done || stage.active ? "text-arc-accent/80" : "text-white/30"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <div
                    className={`h-px flex-1 mx-1 transition-all duration-700 ${
                      stages[i + 1].done || stages[i + 1].active || stage.done
                        ? "bg-arc-accent/50"
                        : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Animated dots when waiting for RD cache */}
          {isStage2 && (
            <p className="mt-6 text-xs text-white/30 text-center">
              Real-Debrid is verifying the file on their servers — this is normal for first-time
              access.
              <br />
              Cached titles start instantly on repeat watches.
            </p>
          )}
        </div>
      </div>
    );
  }

  // === PLAYER ===
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-transparent select-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      style={{ cursor: showControls ? "default" : "none" }}
    >
      {/* Bitrate / codec safety banner — auto-dismissed when user clicks ×
          Only appears when the filter had to downgrade from remux to transcode */}
      {bitrateWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90%] flex items-start gap-3 bg-amber-500/15 border border-amber-500/30 backdrop-blur-md rounded-xl px-4 py-3 pointer-events-auto">
          <svg
            className="shrink-0 mt-0.5 text-amber-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-xs text-amber-200 leading-relaxed flex-1">{bitrateWarning}</p>
          <button
            onClick={() => setBitrateWarning(null)}
            className="text-amber-400/60 hover:text-amber-300 transition shrink-0 text-lg leading-none -mt-0.5"
            aria-label="Dismiss warning"
          >
            ×
          </button>
        </div>
      )}
      <AdvancedPlayer
        ref={videoRef}
        autoPlay
        startTime={savedProgress || 0}
        className="h-full w-full object-contain"
        url={streamUrl || ""}
        subtitleBlobUrl={activeSubVttUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => {
          setDuration(videoRef.current?.duration || 0);
          refreshAudioTracks();
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          setStreamReady(true);
        }}
        onVolumeChange={() => {
          setVolume(videoRef.current?.volume || 1);
          setMuted(videoRef.current?.muted || false);
        }}
        onError={() => {
          console.warn("[ARC] AdvancedPlayer fatal error — will retry with fresh CDN link");
          setError("Playback failed. A fresh CDN link is needed — click Retry Stream below.");
        }}
      />

      {/* Touch overlay — tap toggles controls visibility, double-tap to seek ±10s */}
      <div
        className="absolute inset-0 z-10"
        onClick={(e) => {
          // Don't interfere with control buttons
          if ((e.target as HTMLElement).closest("[data-controls]")) return;
          // On mobile: first tap shows/hides controls, NOT play/pause
          // Play/pause is handled by the dedicated button
          if ("ontouchstart" in window) {
            if (showControls) {
              setShowControls(false);
              if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            } else {
              resetControlsTimer();
            }
          } else {
            // Desktop: click to play/pause
            const v = videoRef.current;
            if (v) {
              if (v.paused) {
                const p = v.play();
                if (p !== undefined) p.catch(() => {});
              } else {
                v.pause();
              }
            }
            resetControlsTimer();
          }
        }}
        onDoubleClick={(e) => {
          const v = videoRef.current;
          if (!v) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < rect.width / 2) {
            v.currentTime -= 10;
          } else {
            v.currentTime += 10;
          }
        }}
      />

      {/* Buffering Overlay */}
      {buffering && playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-transparent border-t-arc-accent"></div>
        </div>
      )}

      {/* Dynamic Subtitles Stylus */}
      <style>
        {`
          video::cue {
            color: ${subStore.subStyleColor};
            font-size: ${subStore.subStyleSize};
            background-color: ${subStore.subStyleBackground};
            text-shadow: ${subStore.subStyleEdge};
            font-family: inherit;
          }
          /* Safe area for notched phones */
          @supports(padding: env(safe-area-inset-bottom)) {
            .player-bottom-controls {
              padding-bottom: calc(1rem + env(safe-area-inset-bottom)) !important;
            }
            .player-top-controls {
              padding-top: calc(0.75rem + env(safe-area-inset-top)) !important;
            }
          }
        `}
      </style>

      {/* Top Bar */}
      <div
        data-controls
        className={`absolute top-0 inset-x-0 z-50 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between transition-all duration-500 player-top-controls ${
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
        <h1 className="font-display text-xs sm:text-base font-semibold text-white/90 drop-shadow-lg truncate max-w-[50%] sm:max-w-[60%] text-center">
          {title}
        </h1>
        <div className="w-8 sm:w-16" /> {/* Spacer */}
      </div>

      {/* Bottom Controls */}
      <div
        data-controls
        className={`absolute bottom-0 inset-x-0 z-50 px-3 sm:px-6 pb-4 sm:pb-6 pt-12 sm:pt-16 transition-all duration-500 player-bottom-controls ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
      >
        {/* Progress Bar */}
        <div
          ref={progressBarRef}
          className="group relative w-full h-3 sm:h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 sm:mb-5 hover:h-2.5 transition-all"
          onClick={seekTo}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            const bar = progressBarRef.current;
            if (!bar || !videoRef.current) return;
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            videoRef.current.currentTime = pct * duration;
          }}
        >
          {hoverPosition !== null && hoverTime !== null && (
            <div
              className="absolute bottom-full mb-3 -translate-x-1/2 flex flex-col items-center pointer-events-none"
              style={{ left: `${hoverPosition}px` }}
            >
              <div className="bg-arc-surface border border-white/10 rounded-lg px-2 py-1 shadow-2xl backdrop-blur-md">
                <span className="text-white font-mono text-xs font-semibold tabular-nums tracking-wide shadow-black drop-shadow-md">
                  {formatTime(hoverTime)}
                </span>
              </div>
              <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-x-transparent border-t-arc-surface/90" />
            </div>
          )}

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
          <div className="flex items-center gap-3 sm:gap-5">
            {/* Play/Pause */}
            <button
              onClick={() => {
                const v = videoRef.current;
                if (v) {
                  if (v.paused) {
                    const p = v.play();
                    if (p !== undefined) p.catch(() => {});
                  } else {
                    v.pause();
                  }
                }
              }}
              className="text-white hover:text-arc-accent transition p-2 -m-2 active:scale-90"
            >
              {playing ? (
                <svg
                  width="28"
                  height="28"
                  className="sm:w-[28px] sm:h-[28px]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  width="28"
                  height="28"
                  className="sm:w-[28px] sm:h-[28px]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip -10s */}
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime -= 10;
              }}
              className="text-white/70 hover:text-white active:text-arc-accent transition p-2 -m-2 active:scale-90"
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
              className="text-white/70 hover:text-white active:text-arc-accent transition p-2 -m-2 active:scale-90"
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

            {/* Volume - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-2">
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
            <span className="text-white/60 text-[10px] sm:text-sm tabular font-mono">
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

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Audio tracks */}
            <div className="relative">
              <button
                onClick={() => setShowAudioMenu((v) => !v)}
                className="text-white/70 hover:text-white transition p-2 -m-2 active:scale-90"
                title="Audio tracks"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M19 9a5 5 0 0 1 0 6" />
                  <path d="M16 6a9 9 0 0 1 0 12" />
                </svg>
              </button>

              {showAudioMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[220px] backdrop-blur-xl">
                  {audioTracks.length > 1 ? (
                    audioTracks.map((track) => {
                      const isActive = activeAudioTrackIdx === track.index;
                      return (
                        <button
                          key={`${track.index}-${track.language}-${track.label}`}
                          onClick={() => {
                            setNativeAudioTrack(track.index);
                            setShowAudioMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${isActive ? "text-arc-accent bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
                        >
                          {track.label}
                          {track.language ? ` (${track.language.toUpperCase()})` : ""}
                          {track.kind && track.kind !== "main" ? ` · ${track.kind}` : ""}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-sm text-white/60">
                      Single/default audio track
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subtitles */}
            <div className="relative">
              <button
                onClick={() => setShowSubMenu(!showSubMenu)}
                className={`text-white/70 hover:text-white transition p-2 -m-2 active:scale-90 ${activeSub ? "text-arc-accent" : ""}`}
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
              {/* Subtitle logic removed to root layout */}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition p-2 -m-2 active:scale-90"
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

      {/* Subtitle Selector Modal (Root Level to explicitly bypass any local stacking contexts) */}
      {showSubMenu && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowSubMenu(false)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-white tracking-wide">Subtitles</h3>
              <button
                onClick={() => setShowSubMenu(false)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div
              className="overflow-y-auto p-2 flex-1 overscroll-contain"
              style={{ touchAction: "pan-y" }}
            >
              <button
                onClick={() => {
                  setActiveSub(null);
                  setActiveSubVttUrl(null);
                  setShowSubMenu(false);
                }}
                className={`w-full text-left px-3 py-3 text-sm rounded-xl transition mb-1 ${!activeSub ? "text-arc-accent flex items-center gap-2 bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
              >
                {!activeSub && <span className="w-1.5 h-1.5 rounded-full bg-arc-accent"></span>}
                {t("player.off", lang)}
              </button>

              <div className="my-2 border-b border-white/5 mx-2"></div>

              {subtitles.map((sub, i) => {
                const isActive = activeSub === sub.url;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveSub(sub.url);
                      if (typeof sub.suggestedOffsetMs === "number") {
                        setOffsetMs(sub.suggestedOffsetMs);
                      }
                      setShowSubMenu(false);
                    }}
                    className={`w-full text-left px-3 py-3 text-sm rounded-xl transition truncate mb-1 ${isActive ? "text-arc-accent flex items-center gap-2 bg-arc-accent/10" : "text-white/70 hover:bg-white/5"}`}
                  >
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-arc-accent shrink-0"></span>
                    )}
                    {sub.label}
                  </button>
                );
              })}
              {subtitles.length === 0 && (
                <div className="px-3 py-4 text-sm text-arc-muted text-center italic">
                  No subtitles found
                </div>
              )}
            </div>

            <div className="p-2 border-t border-white/10 bg-black/40 rounded-b-2xl shrink-0">
              <button
                onClick={() => {
                  setShowSubMenu(false);
                  setShowSubSettings(true);
                }}
                className="w-full text-left px-3 py-3 text-sm rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition flex justify-between items-center"
              >
                Customize Appearance
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle Settings Modal (Root Level) */}
      {showSubSettings && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowSubSettings(false)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
              <h3 className="font-semibold text-white">Subtitle Customizer</h3>
              <button
                onClick={() => setShowSubSettings(false)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div
              className="overflow-y-auto p-4 space-y-4 text-sm flex-1 overscroll-contain"
              style={{ touchAction: "pan-y" }}
            >
              {/* Size */}
              <div>
                <label className="block text-white/60 mb-1 text-xs">Size</label>
                <select
                  value={subStore.subStyleSize}
                  onChange={(e) => subStore.setSubStyleSize(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-white"
                >
                  <option value="0.8em">Small</option>
                  <option value="1em">Normal</option>
                  <option value="1.2em">Large</option>
                  <option value="1.5em">Extra Large</option>
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-white/60 mb-1 text-xs">Color</label>
                <select
                  value={subStore.subStyleColor}
                  onChange={(e) => subStore.setSubStyleColor(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-white"
                >
                  <option value="white">White</option>
                  <option value="yellow">Yellow</option>
                  <option value="cyan">Cyan</option>
                  <option value="#e2e8f0">Light Gray</option>
                </select>
              </div>

              {/* Background */}
              <div>
                <label className="block text-white/60 mb-1 text-xs">Background</label>
                <select
                  value={subStore.subStyleBackground}
                  onChange={(e) => subStore.setSubStyleBackground(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-white"
                >
                  <option value="transparent">None</option>
                  <option value="rgba(0,0,0,0.5)">Semi-Transparent</option>
                  <option value="rgba(0,0,0,0.9)">Solid Black</option>
                </select>
              </div>

              {/* Edge Style */}
              <div>
                <label className="block text-white/60 mb-1 text-xs">Edge Style</label>
                <select
                  value={subStore.subStyleEdge}
                  onChange={(e) => subStore.setSubStyleEdge(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-white"
                >
                  <option value="none">None</option>
                  <option value="0px 1px 4px rgba(0,0,0,0.8), 0px 2px 12px rgba(0,0,0,0.8)">
                    Drop Shadow
                  </option>
                  <option value="-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000">
                    Outline
                  </option>
                </select>
              </div>

              <div className="pt-2 border-t border-white/10">
                <label className="block text-white/60 mb-1 text-xs flex justify-between">
                  <span>Timing Offset</span>
                  <span className="tabular-nums font-mono text-arc-accent">
                    {offsetMs > 0 ? "+" : ""}
                    {offsetMs} ms
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOffsetMs((o) => o - 250)}
                    className="bg-white/5 hover:bg-white/10 p-1 rounded min-w-8"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="-5000"
                    max="5000"
                    step="50"
                    value={offsetMs}
                    onChange={(e) => setOffsetMs(Number(e.target.value))}
                    className="w-full accent-arc-accent"
                  />
                  <button
                    onClick={() => setOffsetMs((o) => o + 250)}
                    className="bg-white/5 hover:bg-white/10 p-1 rounded min-w-8"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
