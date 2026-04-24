import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RD_TOKEN = (typeof process !== "undefined" ? process.env.REAL_DEBRID_API_KEY : undefined) || import.meta.env.VITE_REAL_DEBRID_TOKEN as string | undefined;
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";

type MediaType = "movie" | "tv";

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
  status?: string;
  files?: RDTorrentFile[];
  links?: string[];
}

interface RDUnrestrictResponse {
  id?: string;
  error?: string;
  download?: string;
}

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
  timeoutMs: number = 12000,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${RD_TOKEN}`);

  return fetchWithTimeout(
    `${RD_API_BASE}${path}`,
    {
      ...init,
      headers,
    },
    timeoutMs,
  );
}

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

async function addMagnetToRD(magnet: string): Promise<string> {
  const form = new URLSearchParams();
  form.append("magnet", magnet);

  const res = await rdRequest("/torrents/addMagnet", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    throw new Error(`Failed to add magnet: ${err.error || res.status}`);
  }

  const data = await res.json();
  if (!data?.id) throw new Error("RD addMagnet returned no torrent id.");
  return data.id as string;
}

async function getTorrentInfo(torrentId: string): Promise<RDTorrentInfo> {
  const res = await rdRequest(`/torrents/info/${torrentId}`);

  if (!res.ok) {
    throw new Error(`RD torrents/info failed with ${res.status}`);
  }

  return await res.json();
}

async function selectFileOnRD(torrentId: string, fileId: number): Promise<void> {
  const form = new URLSearchParams();
  form.append("files", String(fileId));

  const res = await rdRequest(`/torrents/selectFiles/${torrentId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as RDUnrestrictResponse;
  if (!res.ok || !data?.download) {
    throw new Error(`RD unrestrict failed: ${data?.error || res.status}`);
  }

  return data;
}

function normalizeAudioLanguageCode(input?: string): string | undefined {
  const raw = (input || "").toLowerCase().trim();
  if (!raw) return undefined;
  const code = raw.split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/.test(code)) return undefined;
  return code;
}

const inputSchema = z.object({
  watchId: z.string().min(1),
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
  preferredAudioLanguage: z.string().optional(),
});

export const getStreamForMovie = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { watchId, preferredAudioLanguage, preferredQuality } = data;
    
    if (!RD_TOKEN || !TMDB_API_KEY) {
      return { error: "Missing server API tokens" };
    }

    const parsed = parseWatchId(watchId);
    
    try {
      const imdbId = parsed.type === "tv" 
          ? await tmdbTVToImdb(parsed.tmdbId) 
          : await tmdbMovieToImdb(parsed.tmdbId);

      const candidates = await fetchTorrentioStreams(imdbId, parsed.type, parsed.season, parsed.episode);
      if (!candidates.length) return { error: "No RD+ candidates found for this title." };

      const targetCandidate = candidates[0];
      const torrentId = await addMagnetToRD(targetCandidate.magnet);
      
      const info = await getTorrentInfo(torrentId);
      const videoFiles = (info.files || []).filter(f => /\.(mkv|mp4|webm|avi)$/i.test(f.path));
      if (!videoFiles.length) {
          return { error: "No video files found in torrent" };
      }
      const targetFile = videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
      
      await selectFileOnRD(torrentId, targetFile.id);
      
      await sleep(1500); 
      const readyInfo = await getTorrentInfo(torrentId);
      const restrictedLink = readyInfo.links?.[0];
      if (!restrictedLink) return { error: "Failed to generate RD link" };

      const unrestricted = await unrestrictLink(restrictedLink);

      // --- NEW 2026 ARCHITECTURE LOGIC ---
      const headers = { Authorization: `Bearer ${RD_TOKEN}` };

      console.log(`[ARC] Successfully unrestricted link. ID: ${unrestricted.id}`);

      // Step A: Fetch Media Infos to map multiplexed audio tracks
      const infoUrl = `https://api.real-debrid.com/rest/1.0/streaming/mediaInfos/${unrestricted.id}`;
      const infoRes = await fetch(infoUrl, { headers });
      
      if (infoRes.status === 503) {
         throw new Error("Metadata unavailable for this specific media asset.");
      }
      
      const mediaInfos = await infoRes.json();
      console.log(`[ARC] Full MediaInfos response:`, JSON.stringify(mediaInfos, null, 2));
      
      const targetLang = normalizeAudioLanguageCode(preferredAudioLanguage) || "en";
      
      // Fix: Real-Debrid mediaInfos actual structure is { details: { audio: { "1": { lang_iso: "en", ... } } } }
      // It is not an array of audio tracks like `mediaInfos.audio`.
      let audioTracksArray: any[] = [];
      
      if (mediaInfos.details && mediaInfos.details.audio) {
        // Convert object to array for easier processing
        audioTracksArray = Object.entries(mediaInfos.details.audio).map(([id, trackData]: [string, any]) => ({
          id, // e.g., "1", "2"
          ...trackData
        }));
      } else if (Array.isArray(mediaInfos.audio)) {
         // Fallback just in case they change it back to an array
         audioTracksArray = mediaInfos.audio;
      }

      console.log(`[ARC] Parsed audio tracks array:`, audioTracksArray);
      console.log(`[ARC] MediaInfos fetched. Target lang: ${targetLang}, Audio tracks:`, audioTracksArray.length);

      // Step B: Intelligent Audio Track Resolution
      // Priority: 1) Exact requested language 2) English ("eng"|"en") 3) Default track 4) First track
      let selectedAudioId = null;
      if (audioTracksArray.length > 0) {
        console.log(`[ARC] Target language: ${targetLang}, Available tracks:`, audioTracksArray.map((a: any) => ({ id: a.id, lang: a.lang_iso, langAlt: a.lang })));
        
        // Normalize the language codes for comparison
        const normalize = (code: string | undefined) => (code || "").toLowerCase().slice(0, 3);
        
        // Match exact requested language (e.g., "en", "eng")
        const exactMatch = audioTracksArray.find((a: any) => {
          const iso = normalize(a.lang_iso);
          const alt = normalize(a.lang);
          return iso === targetLang || alt === targetLang || iso === `eng` || alt === `eng`;
        });
        
        // Match English explicitly
        const engFallback = audioTracksArray.find((a: any) => {
          const iso = normalize(a.lang_iso);
          const alt = normalize(a.lang);
          return iso === "en" || iso === "eng" || alt === "en" || alt === "eng";
        });
        
        // Match default track
        const defaultMatch = audioTracksArray.find((a: any) => a.default === true);
        
        // Choose best match
        const bestTrack = exactMatch || engFallback || defaultMatch || audioTracksArray[0];
        selectedAudioId = bestTrack?.id;
        console.log(`[ARC] Selected audio track ID: ${selectedAudioId} (target: ${targetLang}, found exact: ${!!exactMatch}, engFallback: ${!!engFallback})`);
      }

      // Step C: Fetch Transcode Links for all formats
      const transcodeUrl = `https://api.real-debrid.com/rest/1.0/streaming/transcode/${unrestricted.id}`;
      const transcodeRes = await fetch(transcodeUrl, { headers });
      
      if (!transcodeRes.ok) {
          throw new Error(`Transcode API failed with status ${transcodeRes.status}`);
      }
      
      const transcodeData = await transcodeRes.json();
      console.log(`[ARC] Transcode data fetched:`, JSON.stringify(transcodeData, null, 2));

      let dashUrl = transcodeData.dash?.full || null;
      let hlsUrl = transcodeData.apple?.full || null;
      let mp4Url = transcodeData.liveMP4?.full || null;
      let h264WebMUrl = transcodeData.h264WebM?.full || null;

      // Ensure we have at least one usable URL
      if (!dashUrl && !hlsUrl && !mp4Url && !h264WebMUrl) {
        console.error("[ARC] No valid transcode formats available:", JSON.stringify(transcodeData));
        throw new Error("Transcode manifests are unavailable for this content.");
      }
      
      // Step D: Inject the resolved audio track ID into the Real-Debrid HLS/DASH URL structure
      if (selectedAudioId) {
        if (dashUrl) dashUrl = dashUrl.replace('/none/', `/${selectedAudioId}/`);
        if (hlsUrl) hlsUrl = hlsUrl.replace('/none/', `/${selectedAudioId}/`);
        if (mp4Url) mp4Url = mp4Url.replace('/none/', `/${selectedAudioId}/`);
        if (h264WebMUrl) h264WebMUrl = h264WebMUrl.replace('/none/', `/${selectedAudioId}/`);
      }

      // Determine preferred format based on client profile or default to dash
      // Usually, iOS needs HLS (apple), while desktop/Android can do DASH
      const isIOS = data.clientProfile === "ios_safari";
      let preferredFormat = "dash";
      if (isIOS && hlsUrl) {
         preferredFormat = "hls";
      } else if (!dashUrl && hlsUrl) {
         preferredFormat = "hls";
      } else if (!dashUrl && !hlsUrl && mp4Url) {
         preferredFormat = "mp4";
      }

      console.log(`[ARC] Final URLs -> DASH: ${dashUrl}, HLS: ${hlsUrl}, MP4: ${mp4Url}`);
      console.log(`[ARC] Preferred format: ${preferredFormat}`);

      return {
        streamUrl: (preferredFormat === "dash" ? dashUrl : preferredFormat === "hls" ? hlsUrl : mp4Url) || hlsUrl || mp4Url || dashUrl || h264WebMUrl, // Fallback if preferred is somehow null
        dashUrl,
        hlsUrl,
        mp4Url,
        h264WebMUrl,
        preferredFormat,
        availableAudioTracks: audioTracksArray,
        activeAudioTrackId: selectedAudioId,
        filename: targetFile.path.split('/').pop() || "",
      };

    } catch (err: any) {
      console.error(`[ARC] Resolver error:`, err);
      return { error: err.message };
    }
  });
