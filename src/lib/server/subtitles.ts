import { createServerFn } from "@tanstack/react-start";
import jschardet from "jschardet";
import iconv from "iconv-lite";

const SUBDL_API_KEY = import.meta.env.VITE_SUBDL_API_KEY;

export const getArabicSubtitles = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: imdbId }) => {
    if (!SUBDL_API_KEY) throw new Error("SubDL API Key missing");

    try {
      // 1. Search SubDL for Arabic subtitle for this IMDB ID
      const res = await fetch(`https://api.subdl.com/api/v1/subtitles?api_key=${SUBDL_API_KEY}&imdb_id=${imdbId}&languages=AR`);
      const data = await res.json();
      
      if (!data.status || data.subtitles.length === 0) {
        return { error: "No Arabic subtitles found." };
      }

      // Grab the closest matching SRT download URL
      const subUrl = `https://dl.subdl.com${data.subtitles[0].url}`;
      
      // 2. Fetch the raw subtitle buffer
      const subRes = await fetch(subUrl);
      const arrayBuffer = await subRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 3. Detect Encoding (The critical Arabic fix)
      const detect = jschardet.detect(buffer);
      const isWindows1256 = detect.encoding === "windows-1256" || detect.encoding === "UTF-8" === false;
      
      // Transcode legacy Arabic structures to UTF-8
      let srtContent = isWindows1256 ? iconv.decode(buffer, 'win1256') : buffer.toString('utf8');

      // 4. Convert SRT layout to WebVTT layout for HTML5 <video> elements
      let vttContent = "WEBVTT\n\n" + srtContent
        .replace(/\r\n|\r/g, '\n') // Normalize newlines
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // SRT , to VTT . in timestamps

      return { vtt: vttContent };
    } catch (e: any) {
      return { error: e.message };
    }
  });
