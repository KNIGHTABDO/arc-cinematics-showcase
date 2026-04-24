import React, { useEffect, useRef } from 'react';
import * as dashjs from 'dashjs';

interface AdvancedPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  streamUrls?: { dashUrl: string | null; hlsUrl: string | null; mp4Url: string | null };
  preferredFormat?: "dash" | "hls" | "mp4";
  streamUrl?: string; 
  subtitleBlobUrl: string | null;
  startTime?: number;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  ({ streamUrls, preferredFormat, streamUrl, subtitleBlobUrl, startTime, className, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (forwardedRef as React.RefObject<HTMLVideoElement>) || internalRef;
    
    const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !streamUrl) return;

      if (dashRef.current) {
        dashRef.current.destroy();
        dashRef.current = null;
      }

      console.log(`[ARC] AdvancedPlayer loading Stream URL: ${streamUrl} at startTime: ${startTime}`);

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

      if (streamUrl.includes(".mpd")) {
         const player = dashjs.MediaPlayer().create();
         dashRef.current = player;
         
         player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
             console.error("[ARC] DASH error:", e);
             if (props.onError) props.onError(new Event('error') as any);
         });

         // dashjs initialization: view, source, autoPlay, startTime
         player.initialize(video, streamUrl, Boolean(props.autoPlay), startTime || null as any);

         // Ensure that when it's playing, we trigger onPlaying to satisfy the parent timeout
         player.on(dashjs.MediaPlayer.events.PLAYBACK_PLAYING, () => {
             if (props.onPlaying) {
                 const event = new Event('playing');
                 props.onPlaying(event as unknown as React.SyntheticEvent<HTMLVideoElement, Event>);
             }
         });

         return () => {
           player.destroy();
           dashRef.current = null;
         };
      } else {
         video.src = streamUrl;
         if (startTime && startTime > 0) {
            video.currentTime = startTime;
         }
         if (props.autoPlay) {
           video.addEventListener('loadedmetadata', handlePlay, { once: true });
         }
      }
    }, [streamUrl, videoRef, props.autoPlay, startTime]);

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
      </video>
    );
  }
);

AdvancedPlayer.displayName = 'AdvancedPlayer';
