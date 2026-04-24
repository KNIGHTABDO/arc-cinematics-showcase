import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import * as dashjs from "dashjs";

interface AdvancedPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  streamUrls?: {
    dashUrl: string | null;
    hlsUrl: string | null;
    mp4Url: string | null;
    originalUrl: string | null;
  };
  /** Which format to play first. Defaults to "hls" (safest cross-browser). */
  preferredFormat?: "dash" | "hls" | "mp4" | "original";
  /** Legacy single-URL prop — format is auto-detected from extension. */
  streamUrl?: string;
  subtitleBlobUrl: string | null;
  startTime?: number;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  (
    {
      streamUrls,
      preferredFormat = "hls",
      streamUrl,
      subtitleBlobUrl,
      startTime,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (forwardedRef as React.RefObject<HTMLVideoElement>) || internalRef;

    const hlsRef = useRef<Hls | null>(null);
    const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

    const [currentFormat, setCurrentFormat] = useState<"dash" | "hls" | "mp4" | "original" | null>(
      null,
    );

    // ── Format selection ──────────────────────────────────────────────────────
    // Runs whenever the URL set or preferred format changes.
    // Drives currentFormat from props only — no secondary detection effect.
    useEffect(() => {
      if (streamUrls) {
        // Try preferredFormat first, then fall through in quality order.
        if (preferredFormat === "hls" && streamUrls.hlsUrl) {
          setCurrentFormat("hls");
        } else if (preferredFormat === "mp4" && streamUrls.mp4Url) {
          setCurrentFormat("mp4");
        } else if (preferredFormat === "original" && streamUrls.originalUrl) {
          setCurrentFormat("original");
        } else if (preferredFormat === "dash" && streamUrls.dashUrl) {
          setCurrentFormat("dash");
        } else if (streamUrls.hlsUrl) {
          setCurrentFormat("hls");
        } else if (streamUrls.mp4Url) {
          setCurrentFormat("mp4");
        } else if (streamUrls.originalUrl) {
          setCurrentFormat("original");
        } else if (streamUrls.dashUrl) {
          setCurrentFormat("dash");
        }
        return;
      }

      // Legacy streamUrl — detect from extension
      if (streamUrl) {
        if (streamUrl.includes(".mpd")) {
          setCurrentFormat("dash");
        } else if (streamUrl.includes(".m3u8")) {
          setCurrentFormat("hls");
        } else if (streamUrl.includes(".mp4") || streamUrl.includes(".webm")) {
          setCurrentFormat("mp4");
        } else {
          // Raw CDN download URL (no recognisable extension) → treat as original
          setCurrentFormat("original");
        }
      }
    }, [streamUrls, preferredFormat, streamUrl]);

    // ── Playback engine ───────────────────────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !currentFormat) return;

      // Tear down any previous player instances
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (dashRef.current) {
        dashRef.current.destroy();
        dashRef.current = null;
      }

      // Resolve the URL for this format
      const url = streamUrls
        ? streamUrls[`${currentFormat}Url` as keyof typeof streamUrls]
        : streamUrl;

      if (!url) return;

      console.log(`[ARC] AdvancedPlayer → format: ${currentFormat.toUpperCase()}  url: ${url}`);

      let disposed = false;

      const handlePlay = () => {
        const p = video.play();
        if (p !== undefined) {
          p.catch((err) => {
            if (err.name !== "AbortError") {
              console.warn("[ARC] Autoplay prevented:", err);
            }
          });
        }
      };

      // Cascade fallback: hls → mp4 → original → error
      const fallbackToNext = () => {
        const fmt = currentFormat.toUpperCase();
        console.warn(`[ARC] ${fmt} failed — attempting fallback…`);

        if (currentFormat === "dash") {
          if (streamUrls?.hlsUrl) {
            setCurrentFormat("hls");
            return;
          }
        }
        if (currentFormat === "original") {
          if (streamUrls?.mp4Url) {
            setCurrentFormat("mp4");
            return;
          }
          if (streamUrls?.hlsUrl) {
            setCurrentFormat("hls");
            return;
          }
        }
        if (currentFormat === "mp4") {
          if (streamUrls?.hlsUrl) {
            setCurrentFormat("hls");
            return;
          }
        }
        // All formats exhausted
        console.error("[ARC] All formats failed.");
        if (props.onError) props.onError(new Event("error") as any);
      };

      // ── DASH ──────────────────────────────────────────────────────────────
      if (currentFormat === "dash") {
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;

        player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
          if (!disposed) {
            console.error("[ARC] DASH error:", e);
            if (e.error === "download" || e.error === "manifestError") fallbackToNext();
          }
        });

        player.initialize(video, url, Boolean(props.autoPlay), startTime || (null as any));

        player.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, () => {
          if (props.onPlaying && !disposed) {
            props.onPlaying(
              new Event("playing") as unknown as React.SyntheticEvent<HTMLVideoElement>,
            );
          }
        });

        return () => {
          disposed = true;
          player.destroy();
          dashRef.current = null;
        };
      }

      // ── HLS ───────────────────────────────────────────────────────────────
      if (currentFormat === "hls") {
        // Native HLS (Safari / iOS)
        if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          if (startTime && startTime > 0) video.currentTime = startTime;
          if (props.autoPlay) video.addEventListener("loadedmetadata", handlePlay, { once: true });
          const onErr = () => {
            if (!disposed) fallbackToNext();
          };
          video.addEventListener("error", onErr);
          return () => {
            disposed = true;
            video.removeEventListener("error", onErr);
          };
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            preferManagedMediaSource: true,
            lowLatencyMode: false,

            // Buffer: optimized for fast seeking on 17Mbps Cloudflare connection
            maxBufferLength: 8,
            maxMaxBufferLength: 15,
            backBufferLength: 0, // Immediately free memory behind playhead
            maxBufferSize: 30 * 1000 * 1000, // 30 MB max internal buffer

            // ABR: start slightly higher (5 Mbps) since Cloudflare is faster
            startLevel: -1,
            abrEwmaDefaultEstimate: 5_000_000,

            // Retries for packet loss / CDN hiccups
            fragLoadingMaxRetry: 8,
            fragLoadingRetryDelay: 500,
            fragLoadingMaxRetryTimeout: 30_000,
            manifestLoadingMaxRetry: 5,
            manifestLoadingRetryDelay: 500,
            levelLoadingMaxRetry: 5,
            levelLoadingRetryDelay: 500,

            startPosition: startTime || -1,
          });

          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            console.log(`[ARC] HLS manifest parsed. Levels: ${data.levels.length}`);
            if (props.autoPlay && !disposed) handlePlay();
          });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (disposed) return;
            if (!data.fatal) {
              console.warn(`[ARC] Non-fatal HLS error: ${data.type} / ${data.details}`);
              return;
            }
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn(`[ARC] Fatal network error (${data.details}) — restarting load`);
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn(`[ARC] Fatal media error (${data.details}) — recovering`);
                hls.recoverMediaError();
                break;
              default:
                console.error(`[ARC] Unrecoverable HLS error: ${data.type} / ${data.details}`);
                hls.destroy();
                hlsRef.current = null;
                fallbackToNext();
            }
          });

          return () => {
            disposed = true;
            hls.destroy();
            hlsRef.current = null;
          };
        }

        // hls.js not supported and no native HLS → cascade
        fallbackToNext();
        return;
      }

      // ── MP4 / Original (direct src) ───────────────────────────────────────
      video.src = url;
      if (startTime && startTime > 0) video.currentTime = startTime;
      if (props.autoPlay) video.addEventListener("loadedmetadata", handlePlay, { once: true });

      const onErr = () => {
        if (!disposed) {
          console.warn(`[ARC] ${currentFormat.toUpperCase()} playback error — falling back`);
          fallbackToNext();
        }
      };
      video.addEventListener("error", onErr);

      return () => {
        disposed = true;
        video.removeEventListener("error", onErr);
      };
    }, [currentFormat, streamUrls, streamUrl]);

    return (
      <video ref={videoRef} playsInline className={className} {...props}>
        {subtitleBlobUrl && (
          <track kind="subtitles" src={subtitleBlobUrl} srcLang="en" label="English" default />
        )}
      </video>
    );
  },
);

AdvancedPlayer.displayName = "AdvancedPlayer";
