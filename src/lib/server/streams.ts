import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RD_TOKEN =
  (typeof process !== "undefined" ? process.env.REAL_DEBRID_API_KEY : undefined) ||
  (import.meta.env.VITE_REAL_DEBRID_TOKEN as string | undefined);
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

type MediaType = "movie" | "tv";

// ── Status constants ───────────────────────────────────────────────────────────
/** Statuses that mean the torrent will never recover — stop polling immediately. */
export const TERMINAL_STATUSES = new Set(["magnet_error", "error", "virus", "dead"]);

/** Polling back-off schedule (ms). Used by client-side polling in watch.$id.tsx. */
export const CLIENT_POLL_INTERVALS_MS = [2500, 3000, 4000, 5000, 7000, 10000];

// ── Bitrate safety limits per client profile ──────────────────────────────────
const MAX_SAFE_BITRATE_BPS: Record<string, number> = {
  ios_safari: 50_000_000, // Apple Silicon HW HEVC decode
  default: 14_000_000, // Matched to user's Cloudflare speed (~17 Mbps)
};

// ── Type definitions ──────────────────────────────────────────────────────────
interface TorrentioStreamRaw {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
}

interface RDTorrentFile {
  id: number;
  path: string;
  bytes: number;
  selected?: number;
}

interface RDTorrentInfo {
  id?: string;
  status?: string;
  files?: RDTorrentFile[];
  links?: string[];
  speed?: number;
  seeders?: number;
  progress?: number;
}

interface RDUnrestrictResponse {
  id?: string;
  error?: string;
  download?: string;
  filename?: string;
  filesize?: number;
  streamable?: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rdRequest(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${RD_TOKEN}`);
  return fetchWithTimeout(`${RD_API_BASE}${path}`, { ...init, headers }, timeoutMs);
}

// ── TMDB helpers ──────────────────────────────────────────────────────────────
function parseWatchId(id: string): {
  type: MediaType;
  tmdbId: string;
  season?: number;
  episode?: number;
} {
  const tvMatch = id.match(/^tv-(\d+)-s(\d+)e(\d+)$/);
  if (tvMatch) {
    return {
      type: "tv",
      tmdbId: tvMatch[1],
      season: parseInt(tvMatch[2], 10),
      episode: parseInt(tvMatch[3], 10),
    };
  }
  return { type: "movie", tmdbId: id };
}

async function tmdbMovieToImdb(tmdbId: string): Promise<string> {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`,
  );
  if (!res.ok) throw new Error(`TMDB external_ids failed: ${res.status}`);
  const data = await res.json();
  if (!data.imdb_id) throw new Error("No IMDB ID found for this movie.");
  return data.imdb_id;
}

async function tmdbTVToImdb(tmdbId: string): Promise<string> {
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`,
  );
  if (!res.ok) throw new Error(`TMDB TV external_ids failed: ${res.status}`);
  const data = await res.json();
  if (!data.imdb_id) throw new Error("No IMDB ID found for this TV show.");
  return data.imdb_id;
}

function extractInfoHashAndFileIdx(stream: TorrentioStreamRaw): {
  infoHash?: string;
  fileIdx?: number;
} {
  const s = stream;
  let infoHash = typeof s?.infoHash === "string" ? s.infoHash : undefined;
  let fileIdx = Number.isInteger(s?.fileIdx) ? (s.fileIdx as number) : undefined;
  if (!infoHash && typeof s?.url === "string" && s.url.includes("/resolve/realdebrid/")) {
    const parts = s.url.split("/");
    if (parts.length >= 9) {
      infoHash = parts[6];
      const idxRaw = parts[8];
      if (idxRaw && idxRaw !== "null") {
        const parsed = parseInt(idxRaw, 10);
        if (Number.isFinite(parsed)) fileIdx = parsed;
      }
    }
  }
  return { infoHash: infoHash?.toLowerCase(), fileIdx };
}

interface StreamCandidate {
  magnet: string;
  infoHash: string;
  title: string;
  sizeBytes: number;
  fileIdx?: number;
}

async function fetchTorrentioStreams(
  imdbId: string,
  type: MediaType,
  season?: number,
  episode?: number,
): Promise<StreamCandidate[]> {
  const prefix = RD_TOKEN ? `realdebrid=${RD_TOKEN}/` : "";
  const url =
    type === "tv" && season != null && episode != null
      ? `https://torrentio.strem.fun/${prefix}stream/series/${imdbId}:${season}:${episode}.json`
      : `https://torrentio.strem.fun/${prefix}stream/movie/${imdbId}.json`;
  const res = await fetchWithTimeout(url, { method: "GET" }, 8000);
  if (!res.ok) throw new Error(`Torrentio returned ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { streams?: unknown[] };
  const rawStreams = Array.isArray(data?.streams) ? data.streams : [];
  if (!rawStreams.length) return [];

  return rawStreams
    .map((entry) => entry as TorrentioStreamRaw)
    .filter((s) => typeof s?.name === "string" && s.name.includes("[RD+]"))
    .map((s) => {
      const { infoHash, fileIdx } = extractInfoHashAndFileIdx(s);
      const title = String(s?.title || s?.name || "Unknown");

      // Parse size from Torrentio title (e.g., "💾 2.1 GB")
      let sizeBytes = 0;
      const sizeMatch = title.match(/💾\s*([\d.]+)\s*(GB|MB)/i);
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        if (unit === "GB") sizeBytes = val * 1024 * 1024 * 1024;
        else if (unit === "MB") sizeBytes = val * 1024 * 1024;
      }

      return {
        magnet: infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "",
        infoHash: infoHash ?? "",
        title,
        sizeBytes,
        fileIdx,
      } as StreamCandidate;
    })
    .filter((c) => Boolean(c.infoHash));
}

// ── RD Cache Check ────────────────────────────────────────────────────────────
async function checkInstantAvailability(hash: string): Promise<boolean> {
  try {
    const res = await rdRequest(`/torrents/instantAvailability/${hash.toLowerCase()}`, {}, 6000);
    if (!res.ok) return false;
    const data = await res.json();
    const entry = data[hash.toLowerCase()];
    if (!entry?.rd || !Array.isArray(entry.rd) || entry.rd.length === 0) return false;
    return entry.rd.some((variant: any) => Object.keys(variant).length > 0);
  } catch {
    return false;
  }
}

// ── RD Torrent Management ─────────────────────────────────────────────────────
async function addMagnetToRD(magnet: string): Promise<string> {
  const form = new URLSearchParams();
  form.append("magnet", magnet);
  const res = await rdRequest("/torrents/addMagnet", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as any;
    const existingId = body?.id || body?.error_code;
    if (typeof existingId === "string" && existingId.length > 0) {
      console.log(`[ARC] RD 409 – reusing existing torrent id: ${existingId}`);
      return existingId;
    }
    throw new Error(`RD addMagnet 409 – could not extract existing torrent id`);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    throw new Error(`Failed to add magnet: ${err.error || res.status}`);
  }
  const data = await res.json();
  if (!data?.id) throw new Error("RD addMagnet returned no torrent id.");
  return data.id as string;
}

async function getTorrentInfo(torrentId: string, retries = 3): Promise<RDTorrentInfo> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await rdRequest(`/torrents/info/${torrentId}`);
    if (res.ok) return await res.json();
    if (res.status === 404 && attempt < retries) {
      await sleep((attempt + 1) * 800);
      continue;
    }
    throw new Error(`RD torrents/info failed with ${res.status}`);
  }
  throw new Error(`RD torrents/info failed after ${retries + 1} attempts`);
}

async function selectFileOnRD(torrentId: string, fileId: number): Promise<void> {
  const form = new URLSearchParams();
  form.append("files", String(fileId));
  const res = await rdRequest(`/torrents/selectFiles/${torrentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!(res.status === 204 || res.status === 202)) {
    const text = await res.text().catch(() => "");
    throw new Error(`RD selectFiles failed with ${res.status}${text ? `: ${text}` : ""}`);
  }
}

async function unrestrictLink(link: string): Promise<RDUnrestrictResponse> {
  const form = new URLSearchParams();
  form.append("link", link);
  const res = await rdRequest("/unrestrict/link", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as RDUnrestrictResponse;
  if (!res.ok || !data?.download) {
    throw new Error(`RD unrestrict failed: ${data?.error || res.status}`);
  }
  return data;
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
function normalizeAudioLanguageCode(input?: string): string | undefined {
  const raw = (input || "").toLowerCase().trim();
  if (!raw) return undefined;
  const code = raw.split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/.test(code)) return undefined;
  return code;
}

// ── Bitrate / Codec Safety Filter ─────────────────────────────────────────────
interface BitrateDecision {
  preferredFormat: "mp4" | "hls";
  warning: string | null;
  isHEVC: boolean;
  bitrateMbps: number;
}

function evaluateBitrateForDevice(mediaInfos: any, clientProfile: string): BitrateDecision {
  const maxSafe = MAX_SAFE_BITRATE_BPS[clientProfile] ?? MAX_SAFE_BITRATE_BPS.default;
  const bitrate: number = typeof mediaInfos?.bitrate === "number" ? mediaInfos.bitrate : 0;
  const videoDetails = mediaInfos?.details?.video ?? {};
  const firstVideoTrack = (Object.values(videoDetails)[0] ?? {}) as any;
  const codec = (firstVideoTrack?.codec ?? "").toLowerCase();
  const isHEVC = codec === "hevc" || codec === "h265";
  const bitrateMbps = bitrate / 1_000_000;
  let warning: string | null = null;
  let preferredFormat: "mp4" | "hls" = "mp4";

  if (bitrate > maxSafe) {
    preferredFormat = "hls";
    warning = `Source bitrate ${bitrateMbps.toFixed(0)} Mbps exceeds your connection limit (${(maxSafe / 1_000_000).toFixed(0)} Mbps) — using optimized HLS for instant seeking.`;
  } else if (isHEVC && clientProfile === "default" && bitrate > 10_000_000) {
    preferredFormat = "hls";
    warning = `High-bitrate HEVC detected — using HLS transcode to prevent buffering on your connection.`;
  }
  if (warning) console.log(`[ARC] Bitrate filter applied: ${warning}`);
  return { preferredFormat, warning, isHEVC, bitrateMbps };
}

// ── Input Schemas ─────────────────────────────────────────────────────────────
const resolveTorrentSchema = z.object({
  watchId: z.string().min(1),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
  preferredAudioLanguage: z.string().optional(),
});

const pollStatusSchema = z.object({
  torrentId: z.string().min(1),
});

const playbackSchema = z.object({
  rdHostLink: z.string().min(1),
  preferredAudioLanguage: z.string().optional(),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
});

// ── Phase 1: Fast Torrent Init (Vercel-safe, <5 s) ────────────────────────────
/**
 * Performs all the FAST, one-shot work: TMDB lookup, Torrentio candidate
 * selection, instant-availability ranking, addMagnet, and a single
 * status check. If file selection is needed it calls selectFiles immediately.
 *
 * DOES NOT poll in a loop — long polling is intentionally moved to the
 * client to avoid Vercel serverless function timeout limits (10 s on Hobby,
 * 60 s on Pro).
 *
 * Returns the torrentId + current status. If the torrent is already
 * "downloaded" (common for [RD+] cached streams), rdHostLink is also returned
 * and the client can skip straight to resolvePlaybackStream.
 */
export const getStreamForMovie = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resolveTorrentSchema.parse(d))
  .handler(async ({ data }) => {
    const { watchId, preferredAudioLanguage, preferredQuality } = data;
    if (!RD_TOKEN || !TMDB_API_KEY) return { error: "Missing server API tokens" };
    const parsed = parseWatchId(watchId);
    try {
      // ── TMDB → IMDB ──────────────────────────────────────────────────────
      const imdbId =
        parsed.type === "tv"
          ? await tmdbTVToImdb(parsed.tmdbId)
          : await tmdbMovieToImdb(parsed.tmdbId);

      // ── Torrentio stream candidates ──────────────────────────────────────
      const candidates = await fetchTorrentioStreams(
        imdbId,
        parsed.type,
        parsed.season,
        parsed.episode,
      );
      if (!candidates.length) return { error: "No RD+ candidates found for this title." };

      // ── Instant availability ranking (live RD server check) ──────────────
      const checkCount = Math.min(candidates.length, 12);
      const availResults = await Promise.allSettled(
        candidates.slice(0, checkCount).map((c) => checkInstantAvailability(c.infoHash)),
      );
      const ranked = candidates.slice(0, checkCount).map((c, i) => {
        const isCached =
          availResults[i].status === "fulfilled"
            ? (availResults[i] as PromiseFulfilledResult<boolean>).value
            : false;

        // Score for language
        let langScore = 0;
        const titleLower = c.title.toLowerCase();
        const isDubbed = /lat|dual|ita|spa|ger|fre|fra|rus|hin|tel|tam|dub/i.test(titleLower);
        const isCam = /cam|hdcam|ts|telesync|hdts|line/i.test(titleLower);

        if (preferredAudioLanguage === "en") {
          if (isDubbed) langScore -= 1000; // Heavily penalize foreign dubs if user wants English
        } else if (preferredAudioLanguage) {
          if (preferredAudioLanguage === "es" && /lat|spa|esp/i.test(titleLower)) langScore += 500;
          if (preferredAudioLanguage === "it" && /ita/i.test(titleLower)) langScore += 500;
          if (preferredAudioLanguage === "de" && /ger|deu/i.test(titleLower)) langScore += 500;
          if (preferredAudioLanguage === "fr" && /fre|fra/i.test(titleLower)) langScore += 500;
        }

        // Penalize CAM/TS rips (garbage audio/video quality)
        if (isCam) langScore -= 5000;

        // Score for direct browser playback compatibility (CRITICAL without HLS)
        let codecScore = 0;

        // Browsers strictly DO NOT support AC3, EAC3, TrueHD, or DTS natively.
        // If selected, the video will play with NO SOUND.
        if (/ac3|eac3|dd5\.1|truehd|dts|atmos|pcm/i.test(titleLower)) codecScore -= 5000;

        // Browsers often force download on HEVC/x265 inside MKV containers
        // We MUST penalize HEVC so that an H264 stream is chosen instead if available.
        if (/hevc|h265|x265/i.test(titleLower)) codecScore -= 5000;

        // Boost formats we know work well natively in browsers
        if (/aac|opus|mp3/i.test(titleLower)) codecScore += 2000;
        if (/h264|x264|avc/i.test(titleLower)) codecScore += 2000;
        if (titleLower.includes("mp4")) codecScore += 1000;

        // Score for Quality & Size (to prevent massive freezing MKVs)
        let qualityScore = 0;
        const is4k = /2160|4k|uhd/i.test(titleLower);
        const is8k = /4320|8k/i.test(titleLower);
        const is1080 = /1080/i.test(titleLower);
        const is720 = /720/i.test(titleLower);
        const sizeGB = c.sizeBytes / 1e9;

        // Massive files (>15GB) freeze browsers during direct HTTP streaming.
        if (sizeGB > 25) qualityScore -= 5000;
        else if (sizeGB > 15) qualityScore -= 2000;

        if (preferredQuality === "1080") {
          if (is1080) qualityScore += 1000;
          if (is4k || is8k) qualityScore -= 3000; // Strict downgrade
        } else if (preferredQuality === "720") {
          if (is720) qualityScore += 1000;
          if (is1080 || is4k || is8k) qualityScore -= 3000;
        } else if (preferredQuality === "2160") {
          if (is4k) qualityScore += 1000;
          if (is8k) qualityScore -= 3000;
        } else {
          // Auto: Prefer 1080p for stability, allow 4K if small enough
          if (is1080) qualityScore += 1000;
          if (is4k) qualityScore += 500;
          if (is8k) qualityScore -= 3000;
        }

        return { ...c, isCached, langScore, codecScore, qualityScore, sizeGB };
      });

      // Sort:
      // 1. Quality & Size limits (prevents freezing/crashing)
      // 2. Codec compatibility is KING when HLS is disabled.
      // 3. Language matching (avoid wrong dubs and CAM rips)
      // 4. Cached first
      // 5. Size "Sweet Spot" (for tie breaks)
      ranked.sort((a, b) => {
        if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
        if (a.codecScore !== b.codecScore) return b.codecScore - a.codecScore;
        if (a.langScore !== b.langScore) return b.langScore - a.langScore;
        if (a.isCached && !b.isCached) return -1;
        if (!a.isCached && b.isCached) return 1;

        const isIdealA = a.sizeGB >= 1.5 && a.sizeGB <= 8.5;
        const isIdealB = b.sizeGB >= 1.5 && b.sizeGB <= 8.5;

        if (isIdealA && !isIdealB) return -1;
        if (!isIdealA && isIdealB) return 1;

        return a.sizeGB - b.sizeGB;
      });
      const target = ranked[0];
      console.log(
        `[ARC] Selected: "${target.title}" (cached: ${target.isCached}, size: ${(target.sizeBytes / 1e9).toFixed(2)} GB)`,
      );

      // ── Add magnet to RD ─────────────────────────────────────────────────
      const torrentId = await addMagnetToRD(target.magnet);
      console.log(`[ARC] Torrent ID: ${torrentId}`);

      // ── Single status check (no polling loop) ────────────────────────────
      // getTorrentInfo has its own 404 retry loop for propagation delay.
      const info = await getTorrentInfo(torrentId, 3);
      const status = info.status ?? "unknown";

      if (TERMINAL_STATUSES.has(status)) {
        return { error: `Torrent in terminal state: "${status}". Try another quality.` };
      }

      // ── Select files if RD is waiting ────────────────────────────────────
      if (status === "waiting_files_selection") {
        const videoFiles = (info.files ?? []).filter((f) => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
        if (!videoFiles.length) return { error: "No video files found in torrent" };
        const targetFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
        console.log(
          `[ARC] Selecting file: "${targetFile.path}" (${(targetFile.bytes / 1e9).toFixed(2)} GB)`,
        );
        await selectFileOnRD(torrentId, targetFile.id);
        // File selection is done — return immediately, client will poll for "downloaded"
        return {
          torrentId,
          status: "queued", // Will transition to downloading → downloaded
          rdHostLink: null,
          filename: targetFile.path.split("/").pop() ?? "",
          fileSize: targetFile.bytes,
        };
      }

      // ── If already downloaded (instant cache hit) ────────────────────────
      if (status === "downloaded") {
        const rdHostLink = info.links?.[0] ?? null;
        const videoFiles = (info.files ?? []).filter((f) => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
        const bestFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
        console.log(`[ARC] Torrent already downloaded. rdHostLink ready.`);
        return {
          torrentId,
          status: "downloaded",
          rdHostLink,
          filename: bestFile?.path.split("/").pop() ?? "",
          fileSize: bestFile?.bytes ?? 0,
        };
      }

      // ── Still processing (queued, downloading, magnet_conversion, etc.) ──
      // Return torrentId so client can poll pollTorrentStatus
      const videoFiles = (info.files ?? []).filter((f) => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
      const bestFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
      return {
        torrentId,
        status,
        rdHostLink: null,
        filename: bestFile?.path.split("/").pop() ?? "",
        fileSize: bestFile?.bytes ?? 0,
      };
    } catch (err: any) {
      console.error(`[ARC] getStreamForMovie error:`, err);
      return { error: err.message };
    }
  });

// ── Phase 1.5: Client-Side Poll Endpoint (ultra-fast, <1 s) ──────────────────
/**
 * Single-shot torrent status check. The client calls this in a loop every 2-3 s
 * until status === "downloaded". Each call is a single RD API request, well
 * under any serverless timeout limit.
 */
export const pollTorrentStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pollStatusSchema.parse(d))
  .handler(async ({ data }) => {
    if (!RD_TOKEN) return { error: "Missing API token", status: "error" as const };
    try {
      const info = await getTorrentInfo(data.torrentId, 1);
      const status = info.status ?? "unknown";
      if (TERMINAL_STATUSES.has(status)) {
        return {
          status,
          progress: 0,
          rdHostLink: null as string | null,
          error: `Torrent failed: "${status}". Try another title or quality.`,
        };
      }
      const rdHostLink = status === "downloaded" ? (info.links?.[0] ?? null) : null;
      return { status, progress: info.progress ?? 0, rdHostLink };
    } catch (err: any) {
      return { status: "error" as const, progress: 0, rdHostLink: null, error: err.message };
    }
  });

// ── Phase 2: Lazy Unrestriction + Stream URL Builder ─────────────────────────
/**
 * Called ONLY when the torrent is confirmed "downloaded" and the user is about
 * to watch. Unrestricts the stable rdHostLink to get a fresh CDN URL, fetches
 * stream metadata, and returns all playback URLs.
 *
 * mediaInfos retry policy: 2 attempts max with 1 s delay (3 s total max).
 * If mediaInfos fails, falls back to /streaming/transcode/{id} which provides
 * usable HLS/MP4/DASH URLs without quality metadata.
 *
 * This ensures resolvePlaybackStream always completes in <8 s, safe for
 * all Vercel plan limits.
 */
export const resolvePlaybackStream = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => playbackSchema.parse(d))
  .handler(async ({ data }) => {
    const {
      rdHostLink,
      preferredAudioLanguage,
      clientProfile = "default",
      preferredQuality,
    } = data;
    if (!RD_TOKEN) return { error: "Missing RD API token" };
    try {
      // ── Step 1: Unrestrict ───────────────────────────────────────────────
      console.log(`[ARC] Unrestricting link…`);
      const unrestricted = await unrestrictLink(rdHostLink);
      console.log(`[ARC] Unrestricted. ID: ${unrestricted.id}`);
      const authHeaders = { Authorization: `Bearer ${RD_TOKEN}` };

      // ── Step 2: mediaInfos (2 attempts max, 1 s + 2 s delays = 3 s max) ─
      // Kept short to avoid Vercel timeout. Falls back to /streaming/transcode.
      let mediaInfos: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const infoRes = await fetchWithTimeout(
            `${RD_API_BASE}/streaming/mediaInfos/${unrestricted.id}`,
            { headers: authHeaders },
            6000,
          );
          if (infoRes.ok) {
            mediaInfos = await infoRes.json();
            console.log(`[ARC] mediaInfos OK (attempt ${attempt})`);
            break;
          }
          if (infoRes.status === 503 && attempt < 2) {
            console.warn(`[ARC] mediaInfos 503 attempt ${attempt} — retrying in ${attempt}s…`);
            await sleep(attempt * 1000);
            continue;
          }
          console.warn(`[ARC] mediaInfos HTTP ${infoRes.status}`);
          break;
        } catch {
          if (attempt < 2) await sleep(1000);
        }
      }

      // ── Step 3: Transcode fallback when mediaInfos unavailable ──────────
      // /streaming/transcode returns "full" quality HLS/MP4/DASH URLs even
      // when the metadata service is down. We extract the base URL and
      // reconstruct quality-specific variants to honor bandwidth limits.
      let transcodeHlsBase: string | null = null;
      let transcodeMp4Full: string | null = null;
      let transcodeDashFull: string | null = null;

      if (!mediaInfos?.modelUrl) {
        console.log(`[ARC] mediaInfos unavailable — trying /streaming/transcode fallback…`);
        try {
          const tcRes = await fetchWithTimeout(
            `${RD_API_BASE}/streaming/transcode/${unrestricted.id}`,
            { headers: authHeaders },
            6000,
          );
          if (tcRes.ok) {
            const tcData = await tcRes.json();
            // Extract base URL for quality reconstruction
            // e.g. "https://3.stream.real-debrid.com/t/HASH/eng1/none/aac/full.m3u8"
            const fullHls: string | undefined = tcData?.apple?.full;
            if (fullHls) {
              // Reconstruct base: remove the quality+format suffix
              transcodeHlsBase = fullHls.replace(/\/full\.m3u8$/, "");
            }
            transcodeMp4Full = tcData?.liveMP4?.full ?? null;
            transcodeDashFull = tcData?.dash?.full ?? null;
            console.log(`[ARC] Transcode fallback OK. HLS base: ${transcodeHlsBase}`);
          } else {
            console.warn(`[ARC] Transcode fallback HTTP ${tcRes.status}`);
          }
        } catch (tcErr) {
          console.warn(`[ARC] Transcode fallback error:`, tcErr);
        }
      }

      // ── Step 4: Bitrate / codec filter ───────────────────────────────────
      // NOTE: preferredFormat is now ALWAYS "hls" regardless of what the bitrate
      // filter would recommend. The liveMP4 remux ("mp4" format) streams the full
      // source file (up to 11+ GB) as a single progressive download — Chrome and
      // Firefox cannot seek or buffer it reliably. It will always stall and fail.
      //
      // HLS (m3u8) is the ONLY format that works safely in all browsers because:
      //  - It splits the stream into small ~6 second segments
      //  - hls.js handles adaptive bitrate and retries automatically
      //  - The quality is controlled by the transcodeQuality slug (e.g. 1080p_8mbps)
      //
      // mp4Url and dashUrl are still built and returned so the user can switch
      // formats manually via the quality menu if they want to experiment, but
      // they are NEVER used as the primary playback format automatically.
      const bitrateDecision = mediaInfos
        ? evaluateBitrateForDevice(mediaInfos, clientProfile)
        : { preferredFormat: "hls" as const, warning: null, isHEVC: false, bitrateMbps: 0 };
      // Force HLS regardless of bitrate decision — browser safety requirement
      const forcedFormat = "hls" as const;

      // ── Step 5: Audio track resolution ───────────────────────────────────
      const targetLang = normalizeAudioLanguageCode(preferredAudioLanguage) || "en";
      let audioTracksArray: any[] = [];
      let selectedAudioId: string | null = null;
      if (mediaInfos?.details?.audio) {
        audioTracksArray = Object.entries(mediaInfos.details.audio).map(
          ([id, trackData]: [string, any]) => ({ id, ...trackData }),
        );
      }
      if (audioTracksArray.length > 0) {
        const normalize = (code: string | undefined) => (code || "").toLowerCase().slice(0, 3);
        const isCompatibleCodec = (codec: string | undefined) => {
          const c = (codec || "").toLowerCase();
          return c.includes("ac3") || c.includes("eac3") || c.includes("aac") || c.includes("mp3");
        };
        const langMatches = audioTracksArray.filter((a: any) => {
          const iso = normalize(a.lang_iso);
          const alt = normalize(a.lang);
          return iso === targetLang || alt === targetLang || iso === "eng" || alt === "eng";
        });
        const pool = langMatches.length > 0 ? langMatches : audioTracksArray;
        const sorted = [...pool].sort((a, b) => {
          const aComp = isCompatibleCodec(a.codec);
          const bComp = isCompatibleCodec(b.codec);
          if (aComp && !bComp) return -1;
          if (!aComp && bComp) return 1;
          if (a.default && !b.default) return -1;
          return 0;
        });
        selectedAudioId = sorted[0]?.id ?? null;
        console.log(`[ARC] Audio selected: ID=${selectedAudioId}, lang=${sorted[0]?.lang_iso}`);
      }

      // ── Step 6: Quality slug selection ───────────────────────────────────
      const availableQualities = mediaInfos?.availableQualities ?? {};
      const availableQualityValues = Object.values(availableQualities) as string[];

      // Always prioritize the highest available quality for Remux
      let transcodeQuality = "full";
      if (
        !availableQualityValues.includes("full") &&
        availableQualityValues.includes("1080p_8mbps")
      ) {
        transcodeQuality = "1080p_8mbps";
      }

      // ── Step 7: Build URLs (Pure Real-Debrid) ───────────────────────────
      // We are bypassing the MediaFlow Proxy entirely because browsers cannot
      // natively stream raw MKV files over HTTP, and the proxy transcode/HLS
      // generation times out on 4K files.
      // We will rely on Real-Debrid's direct CDN links and let AdvancedPlayer
      // handle the raw download stream directly, relying on the user's ISP peering.

      const filename = unrestricted.filename || "";
      const isMp4 = filename.toLowerCase().endsWith(".mp4");

      console.log(`[ARC] Stream ready via Direct RD Link. isMp4: ${isMp4}`);

      return {
        streamUrl: unrestricted.download,
        bitrateWarning: bitrateDecision.warning,
        availableAudioTracks: audioTracksArray,
        activeAudioTrackId: selectedAudioId,
        filename: unrestricted.filename ?? "",
        fileSize: unrestricted.filesize ?? 0,
        bitrateMbps: bitrateDecision.bitrateMbps,
        isHEVC: bitrateDecision.isHEVC,
        availableQualities: Object.entries(availableQualities).map(([label, value]) => ({
          label,
          value: value as string,
        })),
      };
    } catch (err: any) {
      console.error(`[ARC] resolvePlaybackStream error:`, err);
      return { error: err.message };
    }
  });
