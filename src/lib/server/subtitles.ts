import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import jschardet from "jschardet";
import iconv from "iconv-lite";

const subtitlesSearchInput = z.object({
  imdbId: z.string().min(2),
  type: z.enum(["movie", "tv"]).default("movie"),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  language: z.string().optional(),
  releaseName: z.string().optional(),
});

const SUBDL_API_KEY = typeof process !== "undefined" ? process.env.VITE_SUBDL_API_KEY || import.meta.env.VITE_SUBDL_API_KEY : import.meta.env.VITE_SUBDL_API_KEY;

const subtitleVttInput = z.object({
  url: z.string().url(),
  offsetMs: z.number().int().default(0),
});

function normalizeSubtitleUrl(raw: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `https://dl.subdl.com${raw}`;
  return raw;
}

function srtToVtt(text: string, shiftMs = 0): string {
  let vtt = "WEBVTT\n\n";

  const lines = text.replace(/\r\n|\r/g, "\n").split("\n");

  const shiftStamp = (stamp: string) => {
    // stamp is HH:MM:SS,ms or HH:MM:SS.ms
    const parts = stamp.split(/[:,.]/);
    if (parts.length < 4) return stamp;
    let ms =
      parseInt(parts[0]) * 3600000 +
      parseInt(parts[1]) * 60000 +
      parseInt(parts[2]) * 1000 +
      parseInt(parts[3]);
    
    ms += shiftMs;
    if (ms < 0) ms = 0;

    const h = Math.floor(ms / 3600000).toString().padStart(2, "0");
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, "0");
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
    const msStr = (ms % 1000).toString().padStart(3, "0");
    return `${h}:${m}:${s}.${msStr}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(" --> ")) {
      const parts = line.split(" --> ");
      vtt += `${shiftStamp(parts[0])} --> ${shiftStamp(parts[1])}\n`;
    } else {
      vtt += line + "\n";
    }
  }

  return vtt.trim();
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

async function extractFromZip(buffer: Buffer): Promise<Buffer | null> {
  // Minimal ZIP parser: find first .srt/.ass/.vtt file in archive
  // ZIP local file header signature: PK\x03\x04
  let offset = 0;
  while (offset < buffer.length - 30) {
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4B ||
        buffer[offset + 2] !== 0x03 || buffer[offset + 3] !== 0x04) {
      offset++;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.slice(offset + 30, offset + 30 + fileNameLen).toString("utf8");
    const dataStart = offset + 30 + fileNameLen + extraLen;

    const ext = fileName.toLowerCase().split(".").pop() || "";
    if (["srt", "ass", "ssa", "vtt"].includes(ext) && compressedSize > 0) {
      const raw = buffer.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        // Stored (no compression)
        return raw;
      } else if (compressionMethod === 8) {
        // Deflate
        const { inflateRawSync } = await import("zlib");
        try {
          return inflateRawSync(raw);
        } catch {
          return raw; // try raw if inflate fails
        }
      }
    }

    // Move to next file entry
    offset = dataStart + compressedSize;
  }
  return null;
}

async function fetchSubtitleAsVtt(url: string, offsetMs = 0): Promise<string> {
  const normalizedUrl = normalizeSubtitleUrl(url);
  const subRes = await fetch(normalizedUrl);
  if (!subRes.ok) {
    throw new Error(`Subtitle download failed: ${subRes.status}`);
  }

  const arrayBuffer = await subRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Check if this is a ZIP file (PK\x03\x04 magic bytes)
  let textBuffer = buffer;
  if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B &&
      buffer[2] === 0x03 && buffer[3] === 0x04) {
    const extracted = await extractFromZip(buffer);
    if (extracted) {
      textBuffer = Buffer.from(extracted);
    } else {
      throw new Error("Could not extract subtitle from ZIP archive");
    }
  }

  const decoded = decodeSubtitleBuffer(textBuffer);
  return srtToVtt(decoded, offsetMs);
}

export const getSubtitlesForMedia = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => subtitlesSearchInput.parse(d))
  .handler(async ({ data }) => {
    const langPrefix = (data.language || "").toLowerCase().slice(0, 2);

    const isTargetLang = (l: string) => {
      if (!langPrefix) return true;
      const s = l.toLowerCase();
      if (langPrefix === "ar" && (s === "ara" || s === "ar" || s === "arabic")) return true;
      if (langPrefix === "fr" && (s === "fre" || s === "fra" || s === "fr" || s === "french")) return true;
      if (langPrefix === "es" && (s === "spa" || s === "es" || s === "spanish")) return true;
      if (langPrefix === "en" && (s === "eng" || s === "en" || s === "english")) return true;
      return s.startsWith(langPrefix);
    };

    // Score a subtitle track for automatic best-pick ranking
    const scoreTrack = (s: any, isExact: boolean) => {
      let score = 0;
      const name = String(s?.release_name || s?.SubFileName || "").toLowerCase();
      const relName = (data.releaseName || "").toLowerCase();

      // Exact match bonus
      if (isExact) score += 500;

      // Release name similarity
      if (relName && name) {
        // Extract release group (e.g., TEPES, YTS, RARBG)
        const relGroup = relName.replace(/\.[^.]+$/, "").split(/[.\-_]/).pop() || "";
        if (relGroup && name.includes(relGroup.toLowerCase())) score += 200;
        // Resolution match
        for (const res of ["2160p", "1080p", "720p", "480p"]) {
          if (relName.includes(res) && name.includes(res)) { score += 100; break; }
        }
        // Source match (web-dl, bluray, etc)
        for (const src of ["web-dl", "webrip", "bluray", "brrip", "hdtv", "amzn", "nf"]) {
          if (relName.includes(src) && name.includes(src)) { score += 50; break; }
        }
      }

      // Prefer hearing-impaired=false
      if (s?.SubHearingImpaired === "0" || s?.hi === false) score += 10;

      // Bonus for OpenSubtitles Rating/Downloads (g)
      // We multiply heavily by 100 so that a highly rated community subtitle (e.g. rating 7 = +700)
      // successfully outranks automated exact-filename matches (+500), because community validation is superior.
      if (s?.g) {
        const pop = parseInt(s.g, 10);
        if (!isNaN(pop)) score += pop * 100;
      }

      return score;
    };

    try {
      let subdlTracks: any[] = [];

      // ── SubDL: Exact Release Matching ──
      if (SUBDL_API_KEY && data.releaseName) {
        const params = new URLSearchParams({
          api_key: SUBDL_API_KEY,
          imdb_id: data.imdbId,
          release_name: data.releaseName,
        });

        // SubDL uses lowercase 2-letter language codes
        if (langPrefix) params.set("languages", langPrefix);
        if (data.type === "tv") {
          params.set("type", "tv");
          if (data.season) params.set("season_number", String(data.season));
          if (data.episode) params.set("episode_number", String(data.episode));
        } else {
          params.set("type", "movie");
        }

        try {
          const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params.toString()}`);
          if (res.ok) {
            const payload = await res.json().catch(() => ({}));
            const subtitles = Array.isArray((payload as any)?.subtitles) ? (payload as any).subtitles : [];
            subdlTracks = subtitles
              .map((s: any) => ({
                label: `⚡ ${s?.release_name || s?.language || "Synced"}`,
                lang: String(s?.language || s?.lang || ""),
                url: normalizeSubtitleUrl(String(s?.url || "")),
                _score: scoreTrack(s, true),
              }))
              .filter((t: any) => Boolean(t.url));
          }
        } catch (e) {
          console.warn("[ARC] SubDL fetch failed, falling back:", e);
        }
      }

      // ── Stremio OpenSubtitles V3: Broad Search ──
      const isTV = data.type === "tv" && data.season != null && data.episode != null;
      const stremioUrl = isTV
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${data.imdbId}:${data.season}:${data.episode}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${data.imdbId}.json`;

      let stremioTracks: any[] = [];
      try {
        const res = await fetch(stremioUrl);
        if (res.ok) {
          const payload = await res.json().catch(() => ({}));
          const subtitles = Array.isArray((payload as any)?.subtitles) ? (payload as any).subtitles : [];
          stremioTracks = subtitles
            .filter((s: any) => isTargetLang(s?.lang || ""))
            .map((s: any) => {
              const rating = parseInt(s?.g, 10) || 0;
              const labelSuffix = rating > 0 ? ` 🌟 ${rating}` : "";
              return {
                label: `${String(s?.lang || "Unknown")}${labelSuffix}`,
                lang: String(s?.lang || ""),
                url: String(s?.url || ""),
                _score: scoreTrack(s, false),
              };
            })
            .filter((t: any) => Boolean(t.url));
        }
      } catch (e) {
        console.warn("[ARC] Stremio sub fetch failed:", e);
      }

      // ── Merge, deduplicate, rank ──
      const seenUrls = new Set<string>();
      const all = [...subdlTracks, ...stremioTracks].filter((t) => {
        if (seenUrls.has(t.url)) return false;
        seenUrls.add(t.url);
        return true;
      });

      // Sort by score descending — best match first
      all.sort((a, b) => (b._score || 0) - (a._score || 0));

      const tracks = all.slice(0, 25).map(({ _score, ...rest }) => rest);

      return { tracks, autoSelectIndex: tracks.length > 0 ? 0 : -1 };
    } catch (e: any) {
      return { tracks: [], error: e?.message || "Subtitle search failed" };
    }
  });

async function fetchRawSubtitleText(url: string): Promise<string> {
  const normalizedUrl = normalizeSubtitleUrl(url);
  const subRes = await fetch(normalizedUrl);
  if (!subRes.ok) throw new Error(`Download failed: ${subRes.status}`);

  const arrayBuffer = await subRes.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  // Handle ZIP
  if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B &&
      buffer[2] === 0x03 && buffer[3] === 0x04) {
    const extracted = await extractFromZip(buffer);
    if (extracted) buffer = Buffer.from(extracted);
  }

  return decodeSubtitleBuffer(buffer);
}

const subtitleVttInputV2 = z.object({
  url: z.string().url(),
  offsetMs: z.number().int().default(0),
});

export const getSubtitleVtt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => subtitleVttInputV2.parse(d))
  .handler(async ({ data }) => {
    try {
      const targetText = await fetchRawSubtitleText(data.url);
      const vtt = srtToVtt(targetText, data.offsetMs);
      return { vtt };
    } catch (e: any) {
      return { error: e?.message || "Subtitle conversion failed" };
    }
  });

// Legacy compatibility function kept for existing integrations.
export const getArabicSubtitles = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: imdbId }) => {
    try {
      const url = `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const subs = Array.isArray((data as any)?.subtitles) ? (data as any).subtitles : [];
      const first = subs.find((s: any) => s.lang === "ara" || s.lang === "ar");

      if (!first?.url) {
        return { error: "No Arabic subtitles found." };
      }

      const vtt = await fetchSubtitleAsVtt(String(first.url));
      return { vtt };
    } catch (e: any) {
      return { error: e?.message || "Subtitle conversion failed" };
    }
  });

