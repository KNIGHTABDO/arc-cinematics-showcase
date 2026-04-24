import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';

interface AdvancedPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  streamUrls?: { dashUrl: string | null; hlsUrl: string | null; mp4Url: string | null };
  preferredFormat?: "dash" | "hls" | "mp4";
  streamUrl?: string; // For backward compatibility
  subtitleBlobUrl: string | null;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  ({ streamUrls, preferredFormat = "dash", streamUrl, subtitleBlobUrl, className, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (forwardedRef as React.RefObject<HTMLVideoElement>) || internalRef;
    
    const hlsRef = useRef<Hls | null>(null);
    const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

    const [currentFormat, setCurrentFormat] = useState<"dash" | "hls" | "mp4" | null>(null);

    // Initial format setup
    useEffect(() => {
      if (streamUrls) {
        // Find best starting format based on preference
        if (preferredFormat === "dash" && streamUrls.dashUrl) setCurrentFormat("dash");
        else if (preferredFormat === "hls" && streamUrls.hlsUrl) setCurrentFormat("hls");
        else if (preferredFormat === "mp4" && streamUrls.mp4Url) setCurrentFormat("mp4");
        else if (streamUrls.dashUrl) setCurrentFormat("dash");
        else if (streamUrls.hlsUrl) setCurrentFormat("hls");
        else if (streamUrls.mp4Url) setCurrentFormat("mp4");
      } else if (streamUrl) {
        if (streamUrl.includes(".mpd")) setCurrentFormat("dash");
        else if (streamUrl.includes(".mp4")) setCurrentFormat("mp4");
        else setCurrentFormat("hls");
      }
    }, [streamUrls, preferredFormat, streamUrl]);

    // Detect format when streamUrl changes externally (e.g., format switcher in parent)
    useEffect(() => {
      if (!streamUrl) return;
      
      let newFormat: "dash" | "hls" | "mp4" | null = null;
      if (streamUrl.includes(".mpd")) newFormat = "dash";
      else if (streamUrl.includes(".m3u8")) newFormat = "hls";
      else if (streamUrl.includes(".mp4") || streamUrl.includes(".webm")) newFormat = "mp4";
      
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

    console.log(`[ARC] AdvancedPlayer switching to format: ${currentFormat.toUpperCase()} URL: ${url}`);

      const handlePlay = () => {
        const promise = video.play();
        if (promise !== undefined) {
          promise.catch(error => {
            if (error.name !== 'AbortError') {
              console.warn('[ARC] Auto-play was prevented or interrupted:', error);
            }
          });
        }
      };

      const fallbackToNext = () => {
        console.warn(`[ARC] Format ${currentFormat.toUpperCase()} failed. Attempting fallback...`);
        if (currentFormat === "dash" && (streamUrls?.hlsUrl || (streamUrl && streamUrl.includes(".m3u8")))) {
           setCurrentFormat("hls");
        } else if ((currentFormat === "dash" || currentFormat === "hls") && (streamUrls?.mp4Url || (streamUrl && streamUrl.includes(".mp4")))) {
           setCurrentFormat("mp4");
        } else {
           console.error("[ARC] All playback formats failed or no fallbacks available.");
           if (props.onError) props.onError(new Event('error') as any);
        }
      };

      if (currentFormat === "dash") {
         const player = dashjs.MediaPlayer().create();
         dashRef.current = player;
         
         player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
             console.error("[ARC] DASH error:", e);
             if (e.error === 'download' || e.error === 'manifestError') {
                 fallbackToNext();
             }
         });

         player.initialize(video, url, props.autoPlay);

         return () => {
           player.destroy();
           dashRef.current = null;
         };
      } 
      else if (currentFormat === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            preferManagedMediaSource: true,
            maxMaxBufferLength: 60,
            enableWorker: true,
            fragLoadingMaxRetry: 4,
            manifestLoadingMaxRetry: 3,
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
                  console.warn(`[ARC] Network error encountered (${data.details}), attempting to restart stream load...`);
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.warn(`[ARC] Media decoding error encountered (${data.details}), attempting recovery...`);
                  hls.recoverMediaError();
                  break;
                default:
                  console.error("[ARC] Fatal unrecoverable HLS error. Destroying instance. Type:", data.type, "Details:", data.details);
                  hls.destroy();
                  fallbackToNext();
                  break;
              }
            } else {
               console.warn(`[ARC] Non-fatal HLS error. Type: ${data.type}, Details: ${data.details}`);
            }
          });

          return () => {
            hls.destroy();
            hlsRef.current = null;
          };
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          if (props.autoPlay) {
            video.addEventListener('loadedmetadata', handlePlay, { once: true });
          }
        } else {
           fallbackToNext();
        }
      } 
      else if (currentFormat === "mp4") {
         video.src = url;
         if (props.autoPlay) {
           video.addEventListener('loadedmetadata', handlePlay, { once: true });
         }
         const handleError = () => fallbackToNext();
         video.addEventListener('error', handleError);
         return () => video.removeEventListener('error', handleError);
      }

    }, [currentFormat, streamUrls, streamUrl, videoRef, props.autoPlay]);

    const activeUrl = currentFormat ? (streamUrls ? streamUrls[`${currentFormat}Url`] : streamUrl) : "";

    return (
      <video
        ref={videoRef}
        playsInline
        className={className}
        {...props}
      >
        {subtitleBlobUrl && (
          <track
            kind="subtitles"
            src={subtitleBlobUrl}
            srcLang="en"
            label="English"
            default
          />
        )}
        {currentFormat === "hls" && activeUrl && (
          <source src={activeUrl} type="application/x-mpegURL" />
        )}
      </video>
    );
  }
);

AdvancedPlayer.displayName = 'AdvancedPlayer';
