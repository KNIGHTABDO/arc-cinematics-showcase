import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

interface AdvancedPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  url?: string | null;
  subtitleBlobUrl: string | null;
  startTime?: number;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  ({ url, subtitleBlobUrl, startTime, className, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (forwardedRef as React.RefObject<HTMLVideoElement>) || internalRef;
    const hlsRef = useRef<Hls | null>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !url) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      console.log(`[ARC] AdvancedPlayer → Loading URL: ${url}`);

      const lowerUrl = url.toLowerCase();
      const isHls = lowerUrl.includes(".m3u8") || lowerUrl.includes("manifest");

      let disposed = false;

      const handlePlay = () => {
        const p = video.play();
        if (p !== undefined) {
          p.catch((err) => {
            if (err.name !== "AbortError" && err.name !== "NotAllowedError") {
              console.warn("[ARC] Autoplay prevented:", err);
            }
          });
        }
      };

      if (isHls) {
        if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          if (startTime && startTime > 0) video.currentTime = startTime;
          if (props.autoPlay) video.addEventListener("loadedmetadata", handlePlay, { once: true });
          return () => {
            disposed = true;
          };
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 120,
            maxMaxBufferLength: 600,
            maxBufferSize: 300 * 1000 * 1000,
            backBufferLength: 90,
            maxBufferHole: 0.5,
            fragLoadingTimeOut: 60000,
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 8,
            fragLoadingRetryDelay: 1000,
            fragLoadingMaxRetryTimeout: 64000,
            abrEwmaDefaultEstimate: 50_000_000,
            abrEwmaDefaultEstimateMax: 100_000_000,
            startLevel: -1,
            startFragPrefetch: true,
            progressive: true,
            maxFragLookUpTolerance: 0.25,
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
              if (data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
                console.log("[ARC] Fragment timeout (non-fatal) — HLS.js will retry automatically");
              } else {
                console.warn(`[ARC] Non-fatal HLS error: ${data.details}`);
              }
              if (
                data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE ||
                data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR
              ) {
                if (video.paused === false && video.currentTime > 0) {
                  video.currentTime += 0.1;
                }
              }
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
                if (props.onError) props.onError(new Event("error") as any);
            }
          });

          return () => {
            disposed = true;
            hls.destroy();
            hlsRef.current = null;
          };
        }
      } else {
        // Direct stream (MP4, MKV, etc)
        video.src = url;
        if (startTime && startTime > 0) video.currentTime = startTime;
        if (props.autoPlay) video.addEventListener("loadedmetadata", handlePlay, { once: true });

        const onErr = (e: Event) => {
          if (!disposed) {
            const error = video.error;
            // MEDIA_ERR_SRC_NOT_SUPPORTED (4) is common for MKVs if the browser
            // is still trying to buffer or figure out the codec. We only hard fail on fatal network drops.
            if (error?.code === 4) {
              console.warn(
                `[ARC] Browser threw MEDIA_ERR_SRC_NOT_SUPPORTED on ${url}. This might mean the video codec is unsupported, or it's a raw MKV. Waiting...`,
              );
              // Don't trigger the onError prop immediately, let the user manually click retry if it hangs forever.
            } else {
              console.error(`[ARC] Direct playback error on ${url}: Code ${error?.code}`);
              if (props.onError) props.onError(e as any);
            }
          }
        };
        video.addEventListener("error", onErr);
        return () => {
          disposed = true;
          video.removeEventListener("error", onErr);
        };
      }
    }, [url, startTime]);

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
