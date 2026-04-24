import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RD_TOKEN =
  (typeof process !== "undefined" ? process.env.REAL_DEBRID_API_KEY : undefined) ||
  (import.meta.env.VITE_REAL_DEBRID_TOKEN as string | undefined);
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

type MediaType = "movie" | "tv";

// ── Torrent status constants ───────────────────────────────────────────────────
/** Status values that mean the torrent will never recover. Stop polling immediately. */
const TERMINAL_STATES = new Set(["magnet_error", "error", "virus", "dead"]);

/**
 * Polling back-off schedule (ms).
 * Starts fast (2 s) and ramps up to 10 s to reduce API load during long waits.
 */
const POLL_INTERVALS_MS = [2000, 3000, 4000, 5000, 5000, 7000, 10000];

// ── Bitrate safety limits per client profile ─────────────────────────────────
/**
 * Maximum safe source bitrate (bits/s) before we force the HLS transcode path.
 *
 * Rationale:
 *  - ios_safari  : Apple Silicon has HW HEVC decode, handles up to ~50 Mbps comfortably.
 *  - default     : Desktop browsers use *software* HEVC decode; >20 Mbps causes stutter/crashes.
 */
const MAX_SAFE_BITRATE_BPS: Record<string, number> = {
  ios_safari: 50_000_000,
  default: 20_000_000,
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
  timeoutMs = 12000,
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
      season: Number.parseInt(tvMatch[2], 10),
      episode: Number.parseInt(tvMatch[3], 10),
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
        const parsed = Number.parseInt(idxRaw, 10);
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

  const res = await fetchWithTimeout(url, { method: "GET" }, 9000);
  if (!res.ok) throw new Error(`Torrentio returned ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { streams?: unknown[] };
  const rawStreams = Array.isArray(data?.streams) ? data.streams : [];
  if (!rawStreams.length) return [];

  return rawStreams
    .map((entry) => entry as TorrentioStreamRaw)
    .filter((s) => typeof s?.name === "string" && s.name.includes("[RD+]"))
    .map((s) => {
      const { infoHash, fileIdx } = extractInfoHashAndFileIdx(s);
      return {
        magnet: infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "",
        infoHash: infoHash ?? "",
        title: String(s?.title || s?.name || "Unknown"),
        fileIdx,
      } as StreamCandidate;
    })
    .filter((c) => Boolean(c.infoHash));
}

// ── Real-Debrid Cache Check (runs on RD servers, not local DB) ────────────────
/**
 * Queries RD's /torrents/instantAvailability endpoint to check whether a torrent
 * hash is already fully cached on Real-Debrid's servers.
 *
 * This is a LIVE check against RD's infrastructure — no local database involved.
 * Returns true when RD confirms the torrent is fully cached and ready to stream.
 *
 * Why check this first?
 *   - Cached torrents jump straight to "downloaded" status after addMagnet + selectFiles
 *     completing in seconds, vs potentially minutes for uncached content.
 *   - Torrentio's [RD+] filter already guarantees these are cached, but checking
 *     multiple candidates lets us prefer the one with the highest certainty.
 */
async function checkInstantAvailability(hash: string): Promise<boolean> {
  try {
    const res = await rdRequest(`/torrents/instantAvailability/${hash.toLowerCase()}`, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    const entry = data[hash.toLowerCase()];
    // RD returns { "rd": [] } (post-2024) or { "rd": [{}] } (older) for uncached
    if (!entry?.rd || !Array.isArray(entry.rd) || entry.rd.length === 0) return false;
    // At least one variant must have actual file entries
    return entry.rd.some((variant: any) => Object.keys(variant).length > 0);
  } catch {
    return false; // Network error → treat as uncached
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

async function getTorrentInfo(torrentId: string, retries = 4): Promise<RDTorrentInfo> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await rdRequest(`/torrents/info/${torrentId}`);
    if (res.ok) return await res.json();

    // 404 immediately after addMagnet is a transient propagation delay — retry
    if (res.status === 404 && attempt < retries) {
      const backoffMs = (attempt + 1) * 1000;
      console.warn(
        `[ARC] torrents/info 404 (attempt ${attempt + 1}/${retries + 1}), retrying in ${backoffMs}ms…`,
      );
      await sleep(backoffMs);
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

  // 204 = success, 202 = already done (torrent was already cached/selected)
  if (!(res.status === 204 || res.status === 202)) {
    const text = await res.text().catch(() => "");
    throw new Error(`RD selectFiles failed with ${res.status}${text ? `: ${text}` : ""}`);
  }
}

// ── Polling Loops (against RD servers) ───────────────────────────────────────
/**
 * PHASE 1 POLL — Wait until the torrent is ready for file selection OR already downloaded.
 *
 * Status flow for a newly added magnet:
 *   magnet_conversion → waiting_files_selection → (call selectFiles) → queued → downloading → downloaded
 *
 * For already-cached torrents (fast path):
 *   magnet_conversion → downloaded  (skips waiting_files_selection entirely)
 *
 * All polling is done by querying RD's /torrents/info endpoint — no local DB.
 */
async function pollForSelectionOrDownloaded(
  torrentId: string,
  maxWaitMs = 60_000,
): Promise<RDTorrentInfo> {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    const info = await getTorrentInfo(torrentId);
    const status = info.status;

    if (status === "waiting_files_selection" || status === "downloaded") {
      console.log(`[ARC] Phase-1 poll complete — torrent ${torrentId} status: "${status}"`);
      return info;
    }

    if (TERMINAL_STATES.has(status!)) {
      throw new Error(
        `Torrent entered terminal state "${status}". It may be dead, contain a virus, or have an invalid magnet.`,
      );
    }

    const delay = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    console.log(
      `[ARC] Phase-1 poll — torrent ${torrentId} status: "${status}" (attempt ${attempt + 1}, next in ${delay}ms)`,
    );
    attempt++;
    await sleep(delay);
  }

  throw new Error(
    "Timed out waiting for torrent metadata. The magnet may be unresolvable or there are no seeders.",
  );
}

/**
 * PHASE 2 POLL — Wait until status is "downloaded".
 *
 * Call this AFTER selectFileOnRD(). Handles the full progression:
 *   queued → downloading → downloaded
 * Also handles intermediate archive states: compressing, uploading.
 *
 * The `progress` field (0-100) is logged but not used for gating — only
 * status === "downloaded" confirms the file is available for unrestriction.
 */
async function pollUntilDownloaded(torrentId: string, maxWaitMs = 300_000): Promise<RDTorrentInfo> {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    const info = await getTorrentInfo(torrentId);
    const status = info.status;

    if (status === "downloaded") {
      console.log(
        `[ARC] Phase-2 poll complete — torrent ${torrentId} downloaded. Links available: ${info.links?.length ?? 0}`,
      );
      return info;
    }

    if (TERMINAL_STATES.has(status!)) {
      throw new Error(
        `Torrent failed with status "${status}". This title may not be available via Real-Debrid.`,
      );
    }

    const delay = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    const progressStr = typeof info.progress === "number" ? ` (${info.progress.toFixed(0)}%)` : "";
    console.log(
      `[ARC] Phase-2 poll — torrent ${torrentId} status: "${status}"${progressStr} (attempt ${attempt + 1}, next in ${delay}ms)`,
    );
    attempt++;
    await sleep(delay);
  }

  throw new Error(
    "Stream not available yet — this title may not be cached on Real-Debrid. Please try again later.",
  );
}

// ── Unrestrict (called lazily at playback time) ───────────────────────────────
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

// ── Audio track resolution ─────────────────────────────────────────────────────
function normalizeAudioLanguageCode(input?: string): string | undefined {
  const raw = (input || "").toLowerCase().trim();
  if (!raw) return undefined;
  const code = raw.split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/.test(code)) return undefined;
  return code;
}

// ── Bitrate / Codec Safety Filter ─────────────────────────────────────────────
interface BitrateDecision {
  /** "mp4" = liveMP4 remux (zero re-encoding, best quality)
   *  "hls" = transcoded HLS (lower quality but safe for all devices) */
  preferredFormat: "mp4" | "hls";
  /** Human-readable warning if we had to downgrade the format */
  warning: string | null;
  isHEVC: boolean;
  bitrateMbps: number;
}

/**
 * Determines the safest playback format for a given device by examining
 * the source file's bitrate and codec from RD's mediaInfos response.
 *
 * Device crash scenarios this prevents:
 *  - High-bitrate HEVC (>15 Mbps) in desktop browsers → software decode overload
 *  - Any stream above 20 Mbps on default/desktop profile
 *  - iOS is more lenient (50 Mbps) due to Apple Silicon HW HEVC decode
 */
function evaluateBitrateForDevice(mediaInfos: any, clientProfile: string): BitrateDecision {
  const maxSafe = MAX_SAFE_BITRATE_BPS[clientProfile] ?? MAX_SAFE_BITRATE_BPS.default;
  const bitrate: number = typeof mediaInfos?.bitrate === "number" ? mediaInfos.bitrate : 0;

  const videoDetails = mediaInfos?.details?.video ?? {};
  const firstVideoTrack = (Object.values(videoDetails)[0] ?? {}) as any;
  const codec = (firstVideoTrack?.codec ?? "").toLowerCase();
  const isHEVC = codec === "hevc" || codec === "h265";

  const bitrateMbps = bitrate / 1_000_000;
  let warning: string | null = null;
  let preferredFormat: "mp4" | "hls" = "mp4"; // Default: liveMP4 (zero transcoding, best quality)

  if (bitrate > maxSafe) {
    preferredFormat = "hls";
    warning = `Source bitrate ${bitrateMbps.toFixed(0)} Mbps exceeds the ${(maxSafe / 1_000_000).toFixed(0)} Mbps safe limit for this device — using transcoded HLS to prevent crashes.`;
  } else if (isHEVC && clientProfile === "default" && bitrate > 15_000_000) {
    // Desktop browsers software-decode HEVC; beyond ~15 Mbps they stutter or crash
    preferredFormat = "hls";
    warning = `HEVC source at ${bitrateMbps.toFixed(0)} Mbps detected — using HLS transcode for browser compatibility.`;
  }

  if (warning) console.log(`[ARC] Bitrate filter applied: ${warning}`);

  return { preferredFormat, warning, isHEVC, bitrateMbps };
}

// ── Input Schemas ─────────────────────────────────────────────────────────────
const resolveTorrentSchema = z.object({
  watchId: z.string().min(1),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
  // preferredQuality is accepted for forward-compat but quality selection
  // now lives in resolvePlaybackStream where transcodeQuality is built.
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
});

const playbackSchema = z.object({
  rdHostLink: z.string().min(1),
  preferredAudioLanguage: z.string().optional(),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
});

// ── Phase 1: Torrent Resolution ───────────────────────────────────────────────
/**
 * Locates the best RD-cached stream for a title via Torrentio, adds the magnet
 * to Real-Debrid, and polls RD's /torrents/info endpoint until the torrent
 * reaches status "downloaded".
 *
 * Returns a stable `rdHostLink` (the hoster URL from torrentInfo.links[]).
 * This URL is long-lived and safe to store. It is NOT unrestricted yet —
 * pass it to `resolvePlaybackStream` only at the moment of playback.
 *
 * All cache/status checks are done against Real-Debrid's servers, not any
 * local database.
 */
export const getStreamForMovie = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resolveTorrentSchema.parse(d))
  .handler(async ({ data }) => {
    const { watchId, clientProfile } = data;

    if (!RD_TOKEN || !TMDB_API_KEY) {
      return { error: "Missing server API tokens" };
    }

    const parsed = parseWatchId(watchId);

    try {
      const imdbId =
        parsed.type === "tv"
          ? await tmdbTVToImdb(parsed.tmdbId)
          : await tmdbMovieToImdb(parsed.tmdbId);

      const candidates = await fetchTorrentioStreams(
        imdbId,
        parsed.type,
        parsed.season,
        parsed.episode,
      );
      if (!candidates.length) return { error: "No RD+ candidates found for this title." };

      // ── Live cache check against RD's instantAvailability endpoint ─────────
      // We check up to 10 candidates in parallel against RD's servers to find
      // which hashes are confirmed cached. This call is a real-time server check,
      // not a local DB lookup.
      console.log(
        `[ARC] Checking instant availability for ${Math.min(candidates.length, 10)} candidate(s) on RD servers…`,
      );
      const checkCount = Math.min(candidates.length, 10);
      const availResults = await Promise.allSettled(
        candidates.slice(0, checkCount).map((c) => checkInstantAvailability(c.infoHash)),
      );

      // Sort: RD-confirmed cached torrents first (fast path); preserve Torrentio order within groups
      const rankedCandidates = candidates.slice(0, checkCount).map((c, i) => ({
        ...c,
        isCached:
          availResults[i].status === "fulfilled"
            ? (availResults[i] as PromiseFulfilledResult<boolean>).value
            : false,
      }));
      rankedCandidates.sort((a, b) => (b.isCached ? 1 : 0) - (a.isCached ? 1 : 0));

      const cachedCount = rankedCandidates.filter((c) => c.isCached).length;
      console.log(
        `[ARC] RD cache results: ${cachedCount} cached, ${checkCount - cachedCount} uncached. Selecting: "${rankedCandidates[0].title}" (cached: ${rankedCandidates[0].isCached})`,
      );

      const target = rankedCandidates[0];

      // ── Add magnet to RD ────────────────────────────────────────────────────
      const torrentId = await addMagnetToRD(target.magnet);
      console.log(`[ARC] Torrent ID: ${torrentId}`);

      // ── Phase-1 poll: wait for waiting_files_selection OR downloaded ────────
      // For cached torrents this is nearly instant.
      // For uncached torrents (shouldn't happen with [RD+] filter) this can take minutes.
      let info = await pollForSelectionOrDownloaded(torrentId);

      // ── Select video file if RD is waiting for our choice ──────────────────
      if (info.status === "waiting_files_selection") {
        const videoFiles = (info.files ?? []).filter((f) => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
        if (!videoFiles.length) {
          return { error: "No video files found in torrent" };
        }
        // Pick the largest video file (highest quality)
        const targetFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
        console.log(
          `[ARC] Selecting file: "${targetFile.path}" (${(targetFile.bytes / 1e9).toFixed(2)} GB)`,
        );
        await selectFileOnRD(torrentId, targetFile.id);

        // ── Phase-2 poll: wait for status "downloaded" ─────────────────────
        // This is the critical gate. We must confirm status === "downloaded"
        // on RD's servers BEFORE unrestricting the link.
        info = await pollUntilDownloaded(torrentId);
      }

      // Final sanity check — must be downloaded before returning
      if (info.status !== "downloaded") {
        throw new Error(`Unexpected torrent status after polling: "${info.status}"`);
      }

      // links[0] is the stable hoster URL (e.g. https://real-debrid.com/d/XXXXX)
      // It persists as long as the torrent exists in the user's RD account.
      const rdHostLink = info.links?.[0];
      if (!rdHostLink) {
        return { error: "Torrent is downloaded but RD generated no hoster link." };
      }

      // Identify the selected video file for display purposes
      const videoFiles = (info.files ?? []).filter((f) => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
      const bestFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];

      console.log(
        `[ARC] Torrent resolution complete. rdHostLink ready. File: "${bestFile?.path.split("/").pop() ?? ""}" (${((bestFile?.bytes ?? 0) / 1e9).toFixed(2)} GB)`,
      );

      return {
        /** Stable hoster URL — safe to store; pass to resolvePlaybackStream at play time */
        rdHostLink,
        torrentId,
        filename: bestFile?.path.split("/").pop() ?? "",
        fileSize: bestFile?.bytes ?? 0,
      };
    } catch (err: any) {
      console.error(`[ARC] getStreamForMovie error:`, err);
      return { error: err.message };
    }
  });

// ── Phase 2: Lazy Unrestriction at Playback Time ──────────────────────────────
/**
 * Called ONLY when the user is about to watch — converts the stable `rdHostLink`
 * into a fresh CDN download URL by calling /unrestrict/link on RD's servers.
 *
 * Why lazy unrestriction?
 *  - The CDN URL (unrestrict.download) is session-like; if the torrent is evicted
 *    from RD's cache between metadata load and playback, a stale CDN URL would 404.
 *  - By unrestricting just before playback we always get a fresh, valid CDN URL.
 *  - The hoster URL (rdHostLink) is long-lived and is the correct thing to cache.
 *
 * Also applies the bitrate/codec safety filter to choose between:
 *  - liveMP4  : instant remux, zero re-encoding, best quality
 *  - HLS      : transcoded, universally compatible, safe for all devices
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
      // ── Step 1: Unrestrict at the moment of playback ─────────────────────
      console.log(`[ARC] Unrestricting link at playback time…`);
      const unrestricted = await unrestrictLink(rdHostLink);
      console.log(
        `[ARC] Unrestricted OK. ID: ${unrestricted.id}, streamable: ${unrestricted.streamable}`,
      );

      const authHeaders = { Authorization: `Bearer ${RD_TOKEN}` };

      // ── Step 2: Fetch mediaInfos with exponential backoff retry ──────────
      // 503 means RD's metadata service is still processing (or file was evicted).
      // We retry up to 5 times: 2 s → 4 s → 8 s → 16 s before giving up.
      let mediaInfos: any = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const infoRes = await fetch(`${RD_API_BASE}/streaming/mediaInfos/${unrestricted.id}`, {
            headers: authHeaders,
          });
          if (infoRes.ok) {
            mediaInfos = await infoRes.json();
            console.log(`[ARC] mediaInfos fetched on attempt ${attempt}`);
            break;
          }
          if (infoRes.status === 503) {
            if (attempt === 5) {
              console.warn(
                `[ARC] mediaInfos 503 after ${attempt} attempts — proceeding without transcode metadata`,
              );
              break;
            }
            const retryDelay = Math.pow(2, attempt) * 1000;
            console.warn(
              `[ARC] mediaInfos 503 (attempt ${attempt}) — retrying in ${retryDelay}ms…`,
            );
            await sleep(retryDelay);
            continue;
          }
          console.warn(`[ARC] mediaInfos returned HTTP ${infoRes.status}`);
          break;
        } catch (fetchErr) {
          if (attempt === 5) console.warn(`[ARC] mediaInfos fetch error:`, fetchErr);
          await sleep(2000 * attempt);
        }
      }

      // ── Step 3: Bitrate / codec safety filter ─────────────────────────────
      const bitrateDecision = mediaInfos
        ? evaluateBitrateForDevice(mediaInfos, clientProfile)
        : {
            preferredFormat: "mp4" as const,
            warning: null,
            isHEVC: false,
            bitrateMbps: 0,
          };

      // ── Step 4: Audio track resolution ────────────────────────────────────
      const targetLang = normalizeAudioLanguageCode(preferredAudioLanguage) || "en";
      let audioTracksArray: any[] = [];
      let selectedAudioId: string | null = null;

      if (mediaInfos?.details?.audio) {
        audioTracksArray = Object.entries(mediaInfos.details.audio).map(
          ([id, trackData]: [string, any]) => ({ id, ...trackData }),
        );
      } else if (Array.isArray(mediaInfos?.audio)) {
        audioTracksArray = mediaInfos.audio;
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
        console.log(
          `[ARC] Audio track selected: ID=${selectedAudioId}, codec=${sorted[0]?.codec}, lang=${sorted[0]?.lang_iso}`,
        );
      }

      // ── Step 5: Build stream URLs ──────────────────────────────────────────
      const availableQualities = mediaInfos?.availableQualities ?? {};
      const availableQualityValues = Object.values(availableQualities) as string[];

      // Map user quality preference → transcode quality slug.
      //
      // ⚠️  IMPORTANT: Do NOT map "auto" to "full".
      //   "full.m3u8" asks RD to re-encode the source bitrate to H264 at ORIGINAL quality.
      //   For a 24 Mbps HEVC file, "full.m3u8" produces a ~20-30 Mbps H264 stream —
      //   completely unusable on connections slower than ~25 Mbps (most of the world).
      //   Only an explicit "2160" (4K) request should use "full" quality.
      let transcodeQuality = "1080p_4mbps"; // safe bandwidth default
      if (preferredQuality === "2160") {
        // Explicit 4K request — serve original quality (user knows what they asked for)
        transcodeQuality = "full";
      } else if (preferredQuality === "1080") {
        transcodeQuality = availableQualityValues.includes("1080p_8mbps")
          ? "1080p_8mbps"
          : "1080p_4mbps";
      } else if (preferredQuality === "720") {
        transcodeQuality = availableQualityValues.includes("720p_4mbps")
          ? "720p_4mbps"
          : "720p_2mbps";
      } else if (preferredQuality === "480") {
        transcodeQuality = "480p_1mbps";
      } else {
        // "auto" or undefined — pick the best available 1080p quality.
        // 1080p_8mbps ≈ 8 Mbps H264 = excellent quality, feasible on 10+ Mbps connections.
        // 1080p_4mbps ≈ 4 Mbps H264 = great quality, feasible on 5+ Mbps connections.
        if (availableQualityValues.includes("1080p_8mbps")) transcodeQuality = "1080p_8mbps";
        else transcodeQuality = "1080p_4mbps";
      }

      // Bandwidth safety cap: when the bitrate filter already forced us onto the HLS
      // transcode path (because the source bitrate was too high), also cap the transcode
      // quality so the HLS stream itself doesn't overwhelm limited connections.
      //
      // Example scenario that this prevents:
      //   Source: 24 Mbps HEVC → bitrate filter → HLS forced
      //   Without this cap: hlsUrl = "1080p_8mbps.m3u8" = 8 Mbps (OK on 10 Mbps, borderline)
      //   With this cap:    hlsUrl = "1080p_4mbps.m3u8" = 4 Mbps (comfortable on 10 Mbps)
      if (bitrateDecision.preferredFormat === "hls" && bitrateDecision.bitrateMbps > 20) {
        transcodeQuality = "1080p_4mbps";
        console.log(
          `[ARC] Bandwidth cap: source ${bitrateDecision.bitrateMbps.toFixed(0)} Mbps forced HLS — transcodeQuality capped to 1080p_4mbps`,
        );
      }

      let hlsUrl: string | null = null;
      let mp4Url: string | null = null;
      let dashUrl: string | null = null;

      if (mediaInfos?.modelUrl) {
        const audioSlot = selectedAudioId ?? "none";
        const buildUrl = (quality: string, format: string) =>
          (mediaInfos.modelUrl as string)
            .replace("{audio}", audioSlot)
            .replace("{subtitles}", "none")
            .replace("{audioCodec}", "aac")
            .replace("{quality}", quality)
            .replace("{format}", format);

        // HLS: transcoded at chosen quality level (universal compat, device-safe)
        hlsUrl = buildUrl(transcodeQuality, "m3u8");
        // MP4: liveMP4 remux at full quality (zero re-encoding, best quality)
        mp4Url = buildUrl("full", "mp4");
        // DASH: full quality DASH manifest (lowest priority — HEVC issues in Chrome)
        dashUrl = buildUrl("full", "mpd");
      }

      console.log(`[ARC] Stream URLs ready. preferredFormat=${bitrateDecision.preferredFormat}`);

      return {
        streamUrl: unrestricted.download, // Raw CDN URL (direct download)
        originalUrl: unrestricted.download,
        hlsUrl,
        mp4Url,
        dashUrl,
        preferredFormat: bitrateDecision.preferredFormat,
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
