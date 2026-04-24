const fs = require('fs');

let content = fs.readFileSync('src/routes/watch.$id.tsx', 'utf-8');

// 1. Add imports and shiftVttTime
content = content.replace(
  'import { useCallback, useEffect, useRef, useState } from "react";',
  `import { useCallback, useEffect, useRef, useState } from "react";
import { AdvancedPlayer } from "@/components/AdvancedPlayer";

const TIME_REGEX = /(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{3})/g;

export const shiftVttTime = (vttText: string, offsetSeconds: number): string => {
  if (!vttText || offsetSeconds === 0) return vttText;
  
  return vttText.replace(TIME_REGEX, (match, hours, minutes, seconds, milliseconds) => {
    const totalMs = 
      parseInt(hours, 10) * 3600000 + 
      parseInt(minutes, 10) * 60000 + 
      parseInt(seconds, 10) * 1000 + 
      parseInt(milliseconds, 10);
      
    const newTotalMs = Math.max(0, totalMs + (offsetSeconds * 1000));
    
    const newH = Math.floor(newTotalMs / 3600000).toString().padStart(2, '0');
    const newM = Math.floor((newTotalMs % 3600000) / 60000).toString().padStart(2, '0');
    const newS = Math.floor((newTotalMs % 60000) / 1000).toString().padStart(2, '0');
    const newMs = (newTotalMs % 1000).toString().padStart(3, '0');
    
    return \`\${newH}:\${newM}:\${newS}.\${newMs}\`;
  });
};`
);

// 2. Remove backupStreams and currentStreamIndex states
content = content.replace(/  const \[backupStreams, setBackupStreams\] = useState<string\[\]>\(\[\]\);\n/g, '');
content = content.replace(/  const \[currentStreamIndex, setCurrentStreamIndex\] = useState\(0\);\n/g, '');

// 3. Add rawVttText state
content = content.replace(
  /  const \[activeSubVttUrl, setActiveSubVttUrl\] = useState<string \| null>\(null\);/g,
  `  const [activeSubVttUrl, setActiveSubVttUrl] = useState<string | null>(null);
  const [rawVttText, setRawVttText] = useState<string | null>(null);`
);

// 4. Remove setBackupStreams and setCurrentStreamIndex calls
content = content.replace(/          setBackupStreams\(Array\.isArray\(res\.backupStreams\) \? res\.backupStreams : \[\]\);\n/g, '');
content = content.replace(/          setCurrentStreamIndex\(0\);\n/g, '');
content = content.replace(/                          setBackupStreams\(\[\]\);\n/g, '');
content = content.replace(/                          setCurrentStreamIndex\(0\);\n/g, '');

// 5. Replace Subtitle fetcher
const oldSubFetcher = `  // Convert selected subtitle to VTT object URL for <track>
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
  }, [activeSub, offsetMs]);`;

const newSubFetcher = `  // When active subtitle URL changes, fetch the raw text
  useEffect(() => {
    if (!activeSub) {
      setRawVttText(null);
      return;
    }
    fetch(activeSub)
      .then(res => res.text())
      .then(text => setRawVttText(text))
      .catch(console.error);
  }, [activeSub]);

  // When text OR offset changes, generate new Blob instantly
  useEffect(() => {
    if (!rawVttText) {
      setActiveSubVttUrl(null);
      return;
    }
    const shiftedText = shiftVttTime(rawVttText, offsetMs / 1000); 
    const blob = new Blob([shiftedText], { type: "text/vtt;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    
    setActiveSubVttUrl(objectUrl);
    
    return () => URL.revokeObjectURL(objectUrl);
  }, [rawVttText, offsetMs]);`;

content = content.replace(oldSubFetcher, newSubFetcher);

// 6. Remove switchToNextStream
content = content.replace(/  const switchToNextStream = useCallback\(\(\) => \{[\s\S]*?\}, \[backupStreams, currentStreamIndex\]\);\n/g, '');

// 7. Remove native HLS / hls.js injection effect
const hlsEffectRegex = /  \/\/ Attach stream source and use hls\.js for desktop playback when only HLS is available\.[\s\S]*?  \}, \[streamUrl, switchToNextStream\]\);\n/g;
content = content.replace(hlsEffectRegex, '');

// Remove audio track hooks since AdvancedPlayer handles this or it's server side now.
// Actually, audio track UI is still in the component. We can leave it for now or remove. 
// The report says the audio track ID is injected server-side. But the user still has an audio track menu.
// If it fails to compile because of switchToNextStream in the useEffect below, let's remove its usage.

// 8. Fix stalls logic that uses switchToNextStream
content = content.replace(/      const switched = switchToNextStream\(\);\n      if \(!switched\) \{\n        setError\("Stream startup timed out\. Please try another quality or title\."\);\n      \}/g, '      setError("Stream startup timed out. Please try another quality or title.");');

content = content.replace(/      const switched = switchToNextStream\(\);\n      if \(!switched\) \{\n        setError\("Stream stalled while buffering\. Please try another quality or title\."\);\n      \}/g, '      setError("Stream stalled while buffering. Please try another quality or title.");');


// 9. Replace <video> element with <AdvancedPlayer>
const oldVideoRegex = /      \{\/\* Video Element — NO crossOrigin for RD links \*\/\}[\s\S]*?      <\/video>/g;

const newVideo = `      <AdvancedPlayer
        ref={videoRef}
        autoPlay
        className="h-full w-full object-contain"
        streamUrl={streamUrl || ""}
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
          setError("Playback failed for this stream URL.");
        }}
      />`;

content = content.replace(oldVideoRegex, newVideo);

fs.writeFileSync('src/routes/watch.$id.tsx', content);
console.log("Refactor complete.");
