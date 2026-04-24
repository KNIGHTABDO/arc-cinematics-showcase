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
  preferredFormat?: "dash" | "hls" | "mp4" | "original";
  streamUrl?: string; // For backward compatibility
  subtitleBlobUrl: string | null;
  startTime?: number;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  (
    {
      streamUrls,
      preferredFormat = "dash",
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

    // Initial format setup
    useEffect(() => {
      if (streamUrls) {
        if (preferredFormat === "original" && streamUrls.originalUrl) setCurrentFormat("original");
        else if (preferredFormat === "mp4" && streamUrls.mp4Url) setCurrentFormat("mp4");
        else if (preferredFormat === "hls" && streamUrls.hlsUrl) setCurrentFormat("hls");
        else if (preferredFormat === "dash" && streamUrls.dashUrl) setCurrentFormat("dash");
        else if (streamUrls.originalUrl) setCurrentFormat("original");
        else if (streamUrls.mp4Url) setCurrentFormat("mp4");
        else if (streamUrls.hlsUrl) setCurrentFormat("hls");
        else if (streamUrls.dashUrl) setCurrentFormat("dash");
      } else if (streamUrl) {
        if (streamUrl.includes(".mpd")) setCurrentFormat("dash");
        else if (streamUrl.includes(".mp4")) setCurrentFormat("mp4");
        else setCurrentFormat("hls");
      }
    }, [streamUrls, preferredFormat, streamUrl]);

    // Detect format when streamUrl changes externally
    useEffect(() => {
      if (!streamUrl) return;
      let newFormat: "dash" | "hls" | "mp4" | "original" | null = null;
      if (streamUrl.includes(".mpd")) newFormat = "dash";
      else if (streamUrl.includes(".m3u8")) newFormat = "hls";
      else if (streamUrl.includes(".mp4") || streamUrl.includes(".webm")) newFormat = "mp4";
      else if (
        streamUrl.includes("/d/") ||
        !streamUrl.includes(".") ||
        streamUrl.includes("real-debrid.com")
      )
        newFormat = "original";

      if (newFormat && newFormat !== currentFormat) {
        console.log(`[ARC] Detected format change from parent: ${newFormat}`);
        setCurrentFormat(newFormat);
      }
    }, [streamUrl]);

    // Reset and reload when URL or format changes
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !currentFormat) return;

      // Clean up previous players
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (dashRef.current) {
        dashRef.current.destroy();
        dashRef.current = null;
      }

      const url = streamUrls ? streamUrls[`${currentFormat}Url`] : streamUrl;
      if (!url) return;

      console.log(
        `[ARC] AdvancedPlayer switching to format: ${currentFormat.toUpperCase()} URL: ${url}`,
      );

      const handlePlay = () => {
        const promise = video.play();
        if (promise !== undefined) {
          promise.catch((error) => {
            if (error.name !== "AbortError") {
              console.warn("[ARC] Auto-play was prevented or interrupted:", error);
            }
          });
        }
      };

      const fallbackToNext = () => {
        const fmt = currentFormat?.toUpperCase() || "UNKNOWN";
        console.warn(`[ARC] Format ${fmt} failed. Attempting fallback...`);

        // Strict Strategy: Direct (original) -> Remux (mp4) -> Transcode (hls)
        if (currentFormat === "original") {
          if (streamUrls?.mp4Url) {
            setCurrentFormat("mp4");
          } else if (streamUrls?.hlsUrl) {
            setCurrentFormat("hls");
          } else {
            console.error("[ARC] Original failed and no remux/transcode available.");
            if (props.onError) props.onError(new Event("error") as any);
          }
        } else if (currentFormat === "mp4") {
          if (streamUrls?.hlsUrl) {
            setCurrentFormat("hls");
          } else {
            console.error("[ARC] MP4 failed and no transcode available.");
            if (props.onError) props.onError(new Event("error") as any);
          }
        } else if (currentFormat === "dash" && streamUrls?.hlsUrl) {
          setCurrentFormat("hls");
        } else {
          console.error(`[ARC] All playback formats failed at ${fmt}.`);
          if (props.onError) props.onError(new Event("error") as any);
        }
      };

      if (currentFormat === "dash") {
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;

        player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
          console.error("[ARC] DASH error:", e);
          if (e.error === "download" || e.error === "manifestError") {
            fallbackToNext();
          }
        });

        player.initialize(video, url, Boolean(props.autoPlay), startTime || (null as any));

        player.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, () => {
          if (props.onPlaying) {
            const event = new Event("playing");
            props.onPlaying(event as unknown as React.SyntheticEvent<HTMLVideoElement, Event>);
          }
        });

        return () => {
          player.destroy();
          dashRef.current = null;
        };
      } else if (currentFormat === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            // Worker & source
            enableWorker: true,
            preferManagedMediaSource: true,
            lowLatencyMode: false,

            // Buffer tuning — smaller target = faster initial playback start.
            // On a 10 Mbps connection, trying to pre-buffer 60 s causes a long
            // black screen before any video appears.
            maxBufferLength: 15, // target 15 s of buffer (default: 30 s)
            maxMaxBufferLength: 30, // hard cap 30 s (was 60 s)
            backBufferLength: 5, // retain 5 s behind playhead (saves memory)

            // ABR — start conservative, let the algorithm ramp up naturally.
            // Without this, hls.js requests the highest quality level first,
            // which stalls immediately on limited connections.
            startLevel: -1, // automatic quality selection
            abrEwmaDefaultEstimate: 5_000_000, // assume 5 Mbps at startup (conservative)

            // Segment / manifest retry — more retries for unreliable connections
            // (packet loss, CDN hiccups on the Morocco → Amsterdam route).
            fragLoadingMaxRetry: 8,
            fragLoadingRetryDelay: 500,
            fragLoadingMaxRetryTimeout: 30_000,
            manifestLoadingMaxRetry: 5,
            manifestLoadingRetryDelay: 500,
            levelLoadingMaxRetry: 5,
            levelLoadingRetryDelay: 500,

            // Start position
            startPosition: startTime || -1,
          });

          hls.loadSource(url);
          hls.attachMedia(video);
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log(`[ARC] HLS Manifest parsed. Levels found: ${data.levels.length}`);
            if (props.autoPlay) handlePlay();
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.warn(
                    `[ARC] Network error encountered (${data.details}), attempting to restart stream load...`,
                  );
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.warn(
                    `[ARC] Media decoding error encountered (${data.details}), attempting recovery...`,
                  );
                  hls.recoverMediaError();
                  break;
                default:
                  console.error(
                    "[ARC] Fatal unrecoverable HLS error. Destroying instance. Type:",
                    data.type,
                    "Details:",
                    data.details,
                  );
                  hls.destroy();
                  fallbackToNext();
                  break;
              }
            } else {
              console.warn(
                `[ARC] Non-fatal HLS error. Type: ${data.type}, Details: ${data.details}`,
              );
            }
          });

          return () => {
            hls.destroy();
            hlsRef.current = null;
          };
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          if (startTime && startTime > 0) {
            video.currentTime = startTime;
          }
          if (props.autoPlay) {
            video.addEventListener("loadedmetadata", handlePlay, { once: true });
          }
          const handleError = () => fallbackToNext();
          video.addEventListener("error", handleError);
          return () => video.removeEventListener("error", handleError);
        } else {
          fallbackToNext();
        }
      } else if (currentFormat === "mp4") {
        video.src = url;
        if (startTime && startTime > 0) {
          video.currentTime = startTime;
        }
        if (props.autoPlay) {
          video.addEventListener("loadedmetadata", handlePlay, { once: true });
        }
        const handleError = () => fallbackToNext();
        video.addEventListener("error", handleError);
        return () => video.removeEventListener("error", handleError);
      } else if (currentFormat === "original") {
        video.src = url;
        if (startTime && startTime > 0) {
          video.currentTime = startTime;
        }
        if (props.autoPlay) {
          video.addEventListener("loadedmetadata", handlePlay, { once: true });
        }
        const handleError = () => fallbackToNext();
        video.addEventListener("error", handleError);
        return () => video.removeEventListener("error", handleError);
      }
    }, [currentFormat, streamUrls, streamUrl, videoRef, props.autoPlay, startTime]);

    const activeUrl = currentFormat
      ? streamUrls
        ? streamUrls[`${currentFormat}Url`]
        : streamUrl
      : "";

    return (
      <video ref={videoRef} playsInline className={className} {...props}>
        {subtitleBlobUrl && (
          <track kind="subtitles" src={subtitleBlobUrl} srcLang="en" label="English" default />
        )}
        {currentFormat === "hls" && activeUrl && (
          <source src={activeUrl} type="application/x-mpegURL" />
        )}
      </video>
    );
  },
);

AdvancedPlayer.displayName = "AdvancedPlayer";
