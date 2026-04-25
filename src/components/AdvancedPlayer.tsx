import React, { useEffect, useRef } from "react";
import {
  init,
  command,
  setProperty,
  observeProperties,
  destroy,
  type MpvObservableProperty,
} from "tauri-plugin-libmpv-api";

interface AdvancedPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  url?: string | null;
  subtitleBlobUrl: string | null;
  startTime?: number;
}

export const AdvancedPlayer = React.forwardRef<HTMLVideoElement, AdvancedPlayerProps>(
  (
    {
      url,
      subtitleBlobUrl,
      startTime,
      className,
      onTimeUpdate,
      onEnded,
      onPause,
      onPlay,
      autoPlay,
      onError,
      ...props
    },
    forwardedRef,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      let unlisten: (() => void) | null = null;
      let disposed = false;

      const setupMpv = async () => {
        if (!url) return;

        console.log(`[ARC] TauriMpv → Initializing libmpv with URL: ${url}`);

        try {
          await init({
            initialOptions: {
              vo: "gpu-next",
              hwdec: "auto-safe",
              "keep-open": "yes",
              "force-window": "yes",
            },
          });

          // Make the React app transparent so we can see the player underneath
          document.body.style.backgroundColor = "transparent";
          const appRoot = document.getElementById("root");
          if (appRoot) {
            appRoot.style.backgroundColor = "transparent";
          }

          const OBSERVED_PROPERTIES = [
            ["pause", "flag"],
            ["time-pos", "double", "none"],
            ["duration", "double", "none"],
            ["eof-reached", "flag", "none"],
          ] as const satisfies MpvObservableProperty[];

          unlisten = await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
            if (disposed) return;

            switch (name) {
              case "time-pos":
                if (data !== null && onTimeUpdate) {
                  // Simulate a synthetic event for React
                  const event = {
                    currentTarget: { currentTime: data },
                  } as unknown as React.SyntheticEvent<HTMLVideoElement, Event>;
                  onTimeUpdate(event);
                }
                break;
              case "eof-reached":
                if (data === true && onEnded) {
                  onEnded({} as React.SyntheticEvent<HTMLVideoElement, Event>);
                }
                break;
              case "pause":
                if (data === true && onPause) {
                  onPause({} as React.SyntheticEvent<HTMLVideoElement, Event>);
                } else if (data === false && onPlay) {
                  onPlay({} as React.SyntheticEvent<HTMLVideoElement, Event>);
                }
                break;
            }
          });

          // Load the video file
          await command("loadfile", [url]);

          // Load subtitle if provided
          if (subtitleBlobUrl) {
            await command("sub-add", [subtitleBlobUrl]);
          }

          // Set start time
          if (startTime && startTime > 0) {
            await setProperty("start", startTime);
          }

          if (autoPlay === false) {
            await setProperty("pause", true);
          }
        } catch (error) {
          console.error("[ARC] TauriMpv → Failed to initialize or play:", error);
          if (onError) {
            onError(new Event("error") as any);
          }
        }
      };

      setupMpv();

      return () => {
        disposed = true;
        if (unlisten) unlisten();

        // Ensure we stop player
        command("stop").catch(console.error);
        destroy().catch(console.error);

        // Revert transparency
        document.body.style.backgroundColor = "";
        const appRoot = document.getElementById("root");
        if (appRoot) {
          appRoot.style.backgroundColor = "";
        }
      };
    }, [
      url,
      subtitleBlobUrl,
      startTime,
      autoPlay,
      onTimeUpdate,
      onEnded,
      onPause,
      onPlay,
      onError,
    ]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
        // The actual video is rendered natively by mpv behind the webview window
      />
    );
  },
);

AdvancedPlayer.displayName = "AdvancedPlayer";
