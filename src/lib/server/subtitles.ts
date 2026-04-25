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
  title: z.string().optional(),
  originalTitle: z.string().optional(),
  originalLanguage: z.string().optional(),
});

const SUBDL_API_KEY =
  typeof process !== "undefined"
    ? process.env.VITE_SUBDL_API_KEY || import.meta.env.VITE_SUBDL_API_KEY
    : import.meta.env.VITE_SUBDL_API_KEY;

const subtitleVttInput = z.object({
  url: z.string().url(),
  offsetMs: z.number().int().default(0),
});

const RELEASE_STOP_TOKENS = new Set([
  "the",
  "and",
  "of",
  "proper",
  "repack",
  "readnfo",
  "internal",
  "dubbed",
  "dual",
  "multi",
  "audio",
  "sub",
  "subs",
]);

function normalizeReleaseLabel(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^\)]*\)/g, " ")
    .replace(/[^a-z0-9.\-\s_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeRelease(input: string): string[] {
  const normalized = normalizeReleaseLabel(input);
  if (!normalized) return [];

  return normalized
    .split(/[.\-_\s]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !RELEASE_STOP_TOKENS.has(token));
}

function tokenOverlapScore(reference: string[], candidate: string[]): number {
  if (!reference.length || !candidate.length) return 0;

  const refSet = new Set(reference);
  const candSet = new Set(candidate);
  let overlap = 0;
  for (const token of refSet) {
    if (candSet.has(token)) overlap++;
  }

  return overlap / refSet.size;
}

function parseFpsToken(input: string): number | null {
  const normalized = normalizeReleaseLabel(input);
  const withFps = normalized.match(/(\d{2}(?:\.\d{2,3})?)\s*fps\b/i);
  if (withFps?.[1]) {
    const fps = Number(withFps[1]);
    return Number.isFinite(fps) ? fps : null;
  }

  const raw = normalized.match(/\b(23\.976|24(?:\.0+)?|25(?:\.0+)?|29\.97|30(?:\.0+)?)\b/);
  if (raw?.[1]) {
    const fps = Number(raw[1]);
    return Number.isFinite(fps) ? fps : null;
  }

  return null;
}

function parseTimeStampToMs(stamp: string): number {
  const parts = stamp.trim().replace(",", ".").split(":");
  if (parts.length !== 3) return 0;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const secParts = parts[2].split(".");
  const seconds = Number(secParts[0] || 0);
  const millis = Number((secParts[1] || "0").padEnd(3, "0").slice(0, 3));

  if (![hours, minutes, seconds, millis].every((n) => Number.isFinite(n))) {
    return 0;
  }

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
}

function extractSubtitleTimingStats(
  text: string,
): { cueCount: number; firstCueMs: number; lastCueMs: number } | null {
  const lines = text.replace(/\r\n|\r/g, "\n").split("\n");
  const timeRx = /(\d{2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{1,3})/;

  let cueCount = 0;
  let firstCueMs = Number.POSITIVE_INFINITY;
  let lastCueMs = 0;

  for (const line of lines) {
    const match = line.match(timeRx);
    if (!match) continue;

    const startMs = parseTimeStampToMs(match[1]);
    const endMs = parseTimeStampToMs(match[2]);

    cueCount++;
    if (startMs < firstCueMs) firstCueMs = startMs;
    if (endMs > lastCueMs) lastCueMs = endMs;
  }

  if (!cueCount || !Number.isFinite(firstCueMs)) return null;
  return { cueCount, firstCueMs, lastCueMs };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  const result = await Promise.race([promise, timeout]);
  if (timer) clearTimeout(timer);
  return result as T | null;
}

async function analyzeSubtitleSync(
  url: string,
  mediaType: "movie" | "tv",
): Promise<{ scoreDelta: number; syncConfidence: number; suggestedOffsetMs: number } | null> {
  const raw = await withTimeout(fetchRawSubtitleText(url), 3500);
  if (!raw) return null;

  const stats = extractSubtitleTimingStats(raw);
  if (!stats) {
    return { scoreDelta: -120, syncConfidence: 20, suggestedOffsetMs: 0 };
  }

  let scoreDelta = 0;
  const minCueTarget = mediaType === "movie" ? 220 : 90;

  if (stats.cueCount >= minCueTarget) scoreDelta += 110;
  else if (stats.cueCount < Math.floor(minCueTarget * 0.35)) scoreDelta -= 180;
  else scoreDelta -= 40;

  if (stats.firstCueMs >= 8000 && stats.firstCueMs <= 240000) scoreDelta += 80;
  else if (stats.firstCueMs > 420000) scoreDelta -= 130;
  else if (stats.firstCueMs < 800) scoreDelta -= 25;

  const durationMin = Math.max(1, stats.lastCueMs / 60000);
  const cuesPerMinute = stats.cueCount / durationMin;
  if (cuesPerMinute >= 6 && cuesPerMinute <= 30) scoreDelta += 45;
  else scoreDelta -= 35;

  const syncConfidence = Math.max(1, Math.min(100, 55 + Math.round(scoreDelta / 5)));
  return { scoreDelta, syncConfidence, suggestedOffsetMs: 0 };
}

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

    const h = Math.floor(ms / 3600000)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((ms % 3600000) / 60000)
      .toString()
      .padStart(2, "0");
    const s = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
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
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
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
  if (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
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
    const releaseTokens = tokenizeRelease(data.releaseName || "");
    const titleTokens = tokenizeRelease(`${data.title || ""} ${data.originalTitle || ""}`);
    const originalLanguage = (data.originalLanguage || "").toLowerCase().slice(0, 2);

    const isTargetLang = (l: string) => {
      if (!langPrefix) return true;
      const s = l.toLowerCase();
      if (langPrefix === "ar" && (s === "ara" || s === "ar" || s === "arabic")) return true;
      if (langPrefix === "fr" && (s === "fre" || s === "fra" || s === "fr" || s === "french"))
        return true;
      if (langPrefix === "es" && (s === "spa" || s === "es" || s === "spanish")) return true;
      if (langPrefix === "en" && (s === "eng" || s === "en" || s === "english")) return true;
      return s.startsWith(langPrefix);
    };

    // Score a subtitle track for automatic best-pick ranking
    const scoreTrack = (s: any, isExact: boolean) => {
      let score = 0;
      const name = String(s?.release_name || s?.SubFileName || "").toLowerCase();
      const relName = normalizeReleaseLabel(data.releaseName || "");
      const subLang = String(s?.language || s?.lang || "").toLowerCase();
      const subTokens = tokenizeRelease(name);

      // Exact match bonus (reduced to let community subs win)
      if (isExact) score += 50;

      // Token overlap against stream release and title fingerprints.
      const releaseOverlap = tokenOverlapScore(releaseTokens, subTokens);
      const titleOverlap = tokenOverlapScore(titleTokens, subTokens);
      score += Math.round(releaseOverlap * 700);
      score += Math.round(titleOverlap * 260);

      if (releaseOverlap >= 0.5) score += 180;
      if (releaseOverlap <= 0.08 && releaseTokens.length > 0) score -= 90;

      // Release name similarity
      if (relName && name) {
        // Extract release group (e.g., TEPES, YTS, RARBG)
        const relGroup =
          relName
            .replace(/\.[^.]+$/, "")
            .split(/[.\-_]/)
            .pop() || "";
        if (relGroup && name.includes(relGroup.toLowerCase())) score += 200;
        // Resolution match
        for (const res of ["2160p", "1080p", "720p", "480p"]) {
          if (relName.includes(res) && name.includes(res)) {
            score += 100;
            break;
          }
        }
        // Source match (web-dl, bluray, etc)
        for (const src of ["web-dl", "webrip", "bluray", "brrip", "hdtv", "amzn", "nf"]) {
          if (relName.includes(src) && name.includes(src)) {
            score += 50;
            break;
          }
        }
      }

      // FPS alignment often decides whether subtitles are visibly drifted.
      const refFps = parseFpsToken(data.releaseName || "");
      const subFps = parseFpsToken(name);
      if (refFps && subFps) {
        const delta = Math.abs(refFps - subFps);
        if (delta <= 0.03) score += 130;
        else if (delta <= 0.2) score += 35;
        else score -= 120;
      }

      if (name.includes("forced") || name.includes("signs") || name.includes("sdh")) {
        score -= 220;
      }

      if (name.includes("retail") || name.includes("official") || name.includes("proper")) {
        score += 45;
      }

      // Prefer hearing-impaired=false
      if (s?.SubHearingImpaired === "0" || s?.hi === false) score += 16;
      if (s?.SubHearingImpaired === "1" || s?.hi === true) score -= 12;

      if (originalLanguage && subLang.startsWith(originalLanguage) && !langPrefix) {
        score += 30;
      }

      if (langPrefix && subLang.startsWith(langPrefix)) {
        score += 35;
      }

      // Bonus for OpenSubtitles Rating/Downloads (g)
      // SubDL filename matching can score up to 1500+. We multiply ratings by 500
      // so a community-rated subtitle (e.g. rating 4 = 2000) easily dominates the list.
      if (s?.g) {
        const pop = parseInt(s.g, 10);
        if (!isNaN(pop)) {
          score += pop * 500;
          if (pop > 0) score += 1000; // Flat bonus for having any positive community rating
        }
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
            const subtitles = Array.isArray((payload as any)?.subtitles)
              ? (payload as any).subtitles
              : [];
            subdlTracks = subtitles
              .map((s: any) => ({
                label: s?.release_name || s?.language || "Synced",
                lang: String(s?.language || s?.lang || ""),
                url: normalizeSubtitleUrl(String(s?.url || "")),
                _score: scoreTrack(s, true),
                _syncConfidence: 0,
                _suggestedOffsetMs: 0,
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
          const subtitles = Array.isArray((payload as any)?.subtitles)
            ? (payload as any).subtitles
            : [];
          stremioTracks = subtitles
            .filter((s: any) => isTargetLang(s?.lang || ""))
            .map((s: any) => {
              const rating = parseInt(s?.g, 10) || 0;
              const labelSuffix = rating > 0 ? ` ★ ${rating}` : "";
              return {
                label: `${String(s?.lang || "Unknown")}${labelSuffix}`,
                lang: String(s?.lang || ""),
                url: String(s?.url || ""),
                _score: scoreTrack(s, false),
                _syncConfidence: 0,
                _suggestedOffsetMs: 0,
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

      // Deep sync analysis on top candidates only (network-safe cap).
      const ANALYSIS_LIMIT = Math.min(8, all.length);
      const analysisTargets = all
        .sort((a, b) => (b._score || 0) - (a._score || 0))
        .slice(0, ANALYSIS_LIMIT);

      await Promise.allSettled(
        analysisTargets.map(async (track) => {
          const analysis = await analyzeSubtitleSync(track.url, data.type);
          if (!analysis) return;

          track._score = (track._score || 0) + analysis.scoreDelta;
          track._syncConfidence = analysis.syncConfidence;
          track._suggestedOffsetMs = analysis.suggestedOffsetMs;
        }),
      );

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
  if (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
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
