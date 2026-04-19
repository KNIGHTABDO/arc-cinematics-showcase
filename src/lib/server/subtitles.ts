import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import jschardet from "jschardet";
import iconv from "iconv-lite";

const SUBDL_API_KEY = import.meta.env.VITE_SUBDL_API_KEY as string | undefined;

const subtitlesSearchInput = z.object({
  imdbId: z.string().min(2),
  type: z.enum(["movie", "tv"]).default("movie"),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  language: z.string().optional(),
});

const subtitleVttInput = z.object({
  url: z.string().url(),
});

function normalizeSubtitleUrl(raw: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `https://dl.subdl.com${raw}`;
  return raw;
}

function srtToVtt(text: string): string {
  return (
    "WEBVTT\n\n" +
    text
      .replace(/\r\n|\r/g, "\n")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
  );
}

function decodeSubtitleBuffer(buffer: Buffer): string {
  const detect = jschardet.detect(buffer);
  const encoding = (detect.encoding || "").toLowerCase();

  if (encoding === "windows-1256" || encoding === "win1256") {
    return iconv.decode(buffer, "win1256");
  }

  if (encoding && encoding !== "utf-8" && encoding !== "ascii") {
    try {
      return iconv.decode(buffer, encoding);
    } catch {
      // fallback to utf8 below
    }
  }

  return buffer.toString("utf8");
}

async function fetchSubtitleAsVtt(url: string): Promise<string> {
  const normalizedUrl = normalizeSubtitleUrl(url);
  const subRes = await fetch(normalizedUrl);
  if (!subRes.ok) {
    throw new Error(`Subtitle download failed: ${subRes.status}`);
  }

  const arrayBuffer = await subRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const decoded = decodeSubtitleBuffer(buffer);

  if (decoded.trimStart().startsWith("WEBVTT")) {
    return decoded;
  }

  return srtToVtt(decoded);
}

export const getSubtitlesForMedia = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => subtitlesSearchInput.parse(d))
  .handler(async ({ data }) => {
    if (!SUBDL_API_KEY) return { tracks: [], error: "SubDL API Key missing" };

    try {
      const params = new URLSearchParams({
        api_key: SUBDL_API_KEY,
        imdb_id: data.imdbId,
      });

      if (data.language) params.set("languages", data.language.toUpperCase());
      if (data.type === "tv") {
        params.set("type", "tv");
        if (data.season) params.set("season_number", String(data.season));
        if (data.episode) params.set("episode_number", String(data.episode));
      } else {
        params.set("type", "movie");
      }

      const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params.toString()}`);
      if (!res.ok) return { tracks: [], error: `SubDL search failed: ${res.status}` };

      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      const subtitles = Array.isArray((payload as any)?.subtitles) ? (payload as any).subtitles : [];

      const tracks = subtitles
        .slice(0, 20)
        .map((s: any) => {
          const url = normalizeSubtitleUrl(String(s?.url || ""));
          return {
            label: String(s?.language || s?.lang || "Unknown"),
            lang: String(s?.lang || ""),
            url,
          };
        })
        .filter((t: { url: string }) => Boolean(t.url));

      return { tracks };
    } catch (e: any) {
      return { tracks: [], error: e?.message || "Subtitle search failed" };
    }
  });

export const getSubtitleVtt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => subtitleVttInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const vtt = await fetchSubtitleAsVtt(data.url);
      return { vtt };
    } catch (e: any) {
      return { error: e?.message || "Subtitle conversion failed" };
    }
  });

// Legacy compatibility function kept for existing integrations.
export const getArabicSubtitles = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: imdbId }) => {
    if (!SUBDL_API_KEY) return { error: "SubDL API Key missing" };

    try {
      const params = new URLSearchParams({
        api_key: SUBDL_API_KEY,
        imdb_id: imdbId,
        languages: "AR",
      });

      const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const first = Array.isArray((data as any)?.subtitles) ? (data as any).subtitles[0] : null;

      if (!first?.url) {
        return { error: "No Arabic subtitles found." };
      }

      const vtt = await fetchSubtitleAsVtt(String(first.url));
      return { vtt };
    } catch (e: any) {
      return { error: e?.message || "Subtitle conversion failed" };
    }
  });
