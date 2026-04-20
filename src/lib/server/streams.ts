import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chooseTargetFileDetailed,
  rankCandidates,
  type RDTorrentFile,
  type StreamCandidate,
} from "./stream-resolver-utils";
import { logStreamResolverDiagnostics } from "./stream-telemetry";

const RD_TOKEN = import.meta.env.VITE_REAL_DEBRID_TOKEN as string | undefined;
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

const RESOLVER_MAX_CANDIDATES = 5;
const RESOLVER_POLL_ATTEMPTS = 6; // Quick fail for false-positive RD+ caches (was 25). 6 * 1.8s ~ 10s wait.
const RESOLVER_POLL_DELAY_MS = 1800;
const PREFLIGHT_TIMEOUT_MS = 3500;
const MEDIAFLOW_PROXY_PREFIX = "/mfproxy";
const MEDIAFLOW_STREAM_PATH = "/proxy/stream";

type MediaType = "movie" | "tv";

type ResolveErrorCode =
  | "NO_RDTOKEN"
  | "NO_TMDBKEY"
  | "TMDB_IMDB_MISSING"
  | "NO_CANDIDATES"
  | "RD_ADD_FAIL"
  | "RD_INFO_FAIL"
  | "RD_SELECT_FAIL"
  | "RD_UNRESTRICT_FAIL"
  | "RD_STATUS_FAIL"
  | "STREAM_PREFLIGHT_FAIL"
  | "ALL_CANDIDATES_FAILED"
  | "UNKNOWN";

export interface ResolverAttempt {
  infoHash: string;
  title: string;
  score: number;
  startedAt: string;
  endedAt?: string;
  status: "success" | "failed";
  errorCode?: ResolveErrorCode;
  error?: string;
  selectedFile?: { id: number; path: string; bytes: number };
  torrentId?: string;
  preflight?: { ok: boolean; status?: number; contentType?: string | null };
  rejectReasons?: string[];
}

export interface ResolverDiagnostics {
  watchId: string;
  mediaType: MediaType;
  tmdbId: string;
  imdbId?: string;
  candidateCount: number;
  attempts: ResolverAttempt[];
  selected?: {
    infoHash: string;
    torrentId: string;
    selectedFile?: { id: number; path: string; bytes: number };
  };
}

interface TorrentioStreamRaw {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
}

interface RDTorrentInfo {
  status?: string;
  files?: RDTorrentFile[];
  links?: string[];
}

interface RDAddMagnetError {
  error?: string;
}

interface RDUnrestrictResponse {
  error?: string;
  download?: string;
}

function buildMediaFlowStreamUrl(sourceUrl: string, proxyPassword?: string): string {
  const params = new URLSearchParams();
  params.set("d", sourceUrl);
  params.set("transcode", "true");

  const pass = proxyPassword?.trim();
  if (pass) {
    params.set("api_password", pass);
  }

  return `${MEDIAFLOW_PROXY_PREFIX}${MEDIAFLOW_STREAM_PATH}?${params.toString()}`;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }

  return out;
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

  // Fallback when using Torrentio RD resolve URLs
  if (!infoHash && typeof s?.url === "string" && s.url.includes("/resolve/realdebrid/")) {
    const parts = s.url.split("/");
    // Expected: /resolve/realdebrid/TOKEN/HASH/null/IDX/filename
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

  const res = await fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RD_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as RDAddMagnetError;
    throw new Error(`Failed to add magnet: ${err.error || res.status}`);
  }

  const data = await res.json();
  if (!data?.id) throw new Error("RD addMagnet returned no torrent id.");
  return data.id as string;
}

async function getTorrentInfo(torrentId: string): Promise<RDTorrentInfo> {
  const res = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
    headers: { Authorization: `Bearer ${RD_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(`RD torrents/info failed with ${res.status}`);
  }

  return await res.json();
}

async function selectFileOnRD(torrentId: string, fileId: number): Promise<void> {
  const form = new URLSearchParams();
  form.append("files", String(fileId));

  const res = await fetch(
    `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RD_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  // RD may return 204 or 202 (already done)
  if (!(res.status === 204 || res.status === 202)) {
    const text = await res.text().catch(() => "");
    throw new Error(`RD selectFiles failed with ${res.status}${text ? `: ${text}` : ""}`);
  }
}

async function unrestrictLink(link: string): Promise<string> {
  const form = new URLSearchParams();
  form.append("link", link);

  const res = await fetch("https://api.real-debrid.com/rest/1.0/unrestrict/link", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RD_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as RDUnrestrictResponse;
  if (!res.ok || !data?.download) {
    throw new Error(`RD unrestrict failed: ${data?.error || res.status}`);
  }

  return data.download;
}

async function preflightStreamUrl(
  url: string,
): Promise<{ ok: boolean; status?: number; contentType?: string | null }> {
  try {
    // Some CDNs reject range probes but still serve normal GETs.
    // Try Range first, then fallback to plain GET if needed.
    const ranged = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Range: "bytes=0-1",
        },
      },
      PREFLIGHT_TIMEOUT_MS,
    );

    const rangedStatus = ranged.status;
    const rangedType = ranged.headers.get("content-type");
    const rangedOkStatus = rangedStatus === 206 || rangedStatus === 200;
    const rangedOkType =
      !rangedType ||
      /video|octet-stream|mp2t|x-matroska|quicktime|mpegurl|application\/vnd\.apple\.mpegurl/i.test(
        rangedType,
      );

    if (rangedOkStatus && rangedOkType) {
      return { ok: true, status: rangedStatus, contentType: rangedType };
    }

    const plain = await fetchWithTimeout(url, { method: "GET" }, PREFLIGHT_TIMEOUT_MS);
    const plainStatus = plain.status;
    const plainType = plain.headers.get("content-type");
    const plainOkStatus = plainStatus === 200 || plainStatus === 206;
    const plainOkType =
      !plainType ||
      /video|octet-stream|mp2t|x-matroska|quicktime|mpegurl|application\/vnd\.apple\.mpegurl/i.test(
        plainType,
      );

    return { ok: plainOkStatus && plainOkType, status: plainStatus, contentType: plainType };
  } catch {
    return { ok: false };
  }
}

async function deleteTorrentBestEffort(torrentId: string): Promise<void> {
  try {
    await fetch(`https://api.real-debrid.com/rest/1.0/torrents/delete/${torrentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${RD_TOKEN}` },
    });
  } catch {
    // no-op
  }
}

async function resolveCandidate(
  candidate: StreamCandidate & { score: number },
  media: {
    type: MediaType;
    season?: number;
    episode?: number;
  },
  diagnostics: ResolverDiagnostics,
): Promise<{
  streamUrl: string;
  backupStreams: string[];
  torrentId: string;
  selectedFile?: RDTorrentFile;
} | null> {
  const attempt: ResolverAttempt = {
    infoHash: candidate.infoHash,
    title: candidate.title,
    score: candidate.score,
    startedAt: new Date().toISOString(),
    status: "failed",
  };

  diagnostics.attempts.push(attempt);

  let torrentId = "";

  try {
    torrentId = await addMagnetToRD(candidate.magnet);
    attempt.torrentId = torrentId;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to add magnet";
    attempt.errorCode = "RD_ADD_FAIL";
    attempt.error = message;
    attempt.endedAt = new Date().toISOString();
    return null;
  }

  let selectedFile: RDTorrentFile | null = null;

  try {
    for (let i = 0; i < RESOLVER_POLL_ATTEMPTS; i++) {
      const info = await getTorrentInfo(torrentId);

      if (["error", "dead", "magnet_error", "virus"].includes(info?.status as string)) {
        attempt.errorCode = "RD_STATUS_FAIL";
        attempt.error = `RD status ${info?.status}`;
        attempt.endedAt = new Date().toISOString();
        await deleteTorrentBestEffort(torrentId);
        return null;
      }

      const files = (Array.isArray(info?.files) ? info.files : []) as RDTorrentFile[];
      if (!selectedFile && files.length > 0) {
        const selection = chooseTargetFileDetailed(files, {
          type: media.type,
          season: media.season,
          episode: media.episode,
          preferredFileIdx: candidate.fileIdx,
        });
        selectedFile = selection.file;

        if (selectedFile) {
          attempt.selectedFile = {
            id: selectedFile.id,
            path: selectedFile.path,
            bytes: selectedFile.bytes,
          };
        }
      }

      const unselected = files.length ? files.every((f) => (f.selected ?? 0) === 0) : true;
      const needsSelection =
        info?.status === "waiting_files_selection" ||
        (["queued", "downloading"].includes(info?.status as string) && unselected);

      if (needsSelection) {
        if (!selectedFile) {
          attempt.errorCode = "RD_SELECT_FAIL";
          attempt.error = "No playable file could be selected from torrent";
          attempt.endedAt = new Date().toISOString();
          await deleteTorrentBestEffort(torrentId);
          return null;
        }

        await selectFileOnRD(torrentId, selectedFile.id);
        await sleep(RESOLVER_POLL_DELAY_MS);
        continue;
      }

      if (
        ["magnet_conversion", "queued", "downloading", "compressing", "uploading"].includes(
          info?.status as string,
        )
      ) {
        await sleep(RESOLVER_POLL_DELAY_MS);
        continue;
      }

      if (info?.status === "downloaded" && Array.isArray(info?.links) && info.links.length > 0) {
        // Links mapping can be inconsistent across providers; try preferred link first,
        // then fallback through remaining links until one passes unrestrict+preflight.
        let preferredLinkIdx = 0;
        if (selectedFile && Array.isArray(info.files)) {
          const selected = (info.files as RDTorrentFile[]).filter((f) => (f.selected ?? 0) === 1);
          const idx = selected.findIndex((f) => f.id === selectedFile!.id);
          if (idx >= 0 && idx < info.links.length) preferredLinkIdx = idx;
        }

        const linkOrder = [
          preferredLinkIdx,
          ...info.links.map((_, idx) => idx).filter((idx) => idx !== preferredLinkIdx),
        ];

        let lastUnrestrictError: string | null = null;
        let lastPreflight: { ok: boolean; status?: number; contentType?: string | null } | undefined;
        let firstUnrestrictedUrl: string | null = null;
        const unrestrictedCandidates: string[] = [];

        for (const linkIdx of linkOrder) {
          const restrictedLink = info.links[linkIdx] as string;
          let streamUrl = "";

          try {
            streamUrl = await unrestrictLink(restrictedLink);
            if (!firstUnrestrictedUrl) firstUnrestrictedUrl = streamUrl;
            if (!unrestrictedCandidates.includes(streamUrl)) unrestrictedCandidates.push(streamUrl);
          } catch (e: unknown) {
            lastUnrestrictError = e instanceof Error ? e.message : "RD unrestrict failed";
            continue;
          }

          const preflight = await preflightStreamUrl(streamUrl);
          lastPreflight = preflight;
          if (!preflight.ok) {
            continue;
          }

          attempt.preflight = preflight;
          attempt.status = "success";
          attempt.endedAt = new Date().toISOString();

          return {
            streamUrl,
            backupStreams: unrestrictedCandidates.filter((u) => u !== streamUrl),
            torrentId,
            selectedFile: selectedFile ?? undefined,
          };
        }

        // Important fallback: some hosts block server-side probes (range/plain GET)
        // while the exact same unrestricted URL is playable in browser/video player.
        if (firstUnrestrictedUrl) {
          attempt.preflight = lastPreflight;
          attempt.status = "success";
          attempt.endedAt = new Date().toISOString();

          return {
            streamUrl: firstUnrestrictedUrl,
            backupStreams: unrestrictedCandidates.filter((u) => u !== firstUnrestrictedUrl),
            torrentId,
            selectedFile: selectedFile ?? undefined,
          };
        }

        attempt.preflight = lastPreflight;
        if (lastUnrestrictError) {
          attempt.errorCode = "RD_UNRESTRICT_FAIL";
          attempt.error = lastUnrestrictError;
        } else {
          attempt.errorCode = "STREAM_PREFLIGHT_FAIL";
          attempt.error = `Stream preflight failed${lastPreflight?.status ? ` (${lastPreflight.status})` : ""}`;
        }
        attempt.endedAt = new Date().toISOString();
        await deleteTorrentBestEffort(torrentId);
        return null;
      }

      await sleep(RESOLVER_POLL_DELAY_MS);
    }

    attempt.errorCode = "RD_STATUS_FAIL";
    attempt.error = "RD torrent timed out before downloadable state";
    attempt.endedAt = new Date().toISOString();
    await deleteTorrentBestEffort(torrentId);
    return null;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed while polling torrent status";
    attempt.errorCode = "RD_INFO_FAIL";
    attempt.error = message;
    attempt.endedAt = new Date().toISOString();
    await deleteTorrentBestEffort(torrentId);
    return null;
  }
}

async function telemetryLog(diag: ResolverDiagnostics) {
  // Keep function logs for traceability.
  console.info("[ARC_STREAM_RESOLVER]", JSON.stringify(diag));

  // Persist to Supabase telemetry table if env is configured.
  try {
    await logStreamResolverDiagnostics({ data: diag });
  } catch (e) {
    console.warn("[ARC_STREAM_TELEMETRY] failed to persist", e);
  }
}

const inputSchema = z.object({
  watchId: z.string().min(1),
  preferredQuality: z.enum(["auto", "2160", "1080", "720", "480"]).optional(),
  clientProfile: z.enum(["default", "ios_safari"]).optional(),
});

export const getStreamForMovie = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const watchId = data.watchId;
    const preferredQuality = data.preferredQuality ?? "auto";
    const actualClientProfile = data.clientProfile ?? "default";

    const PROXY_PASS = import.meta.env.VITE_MEDIAFLOW_PROXY_PASSWORD as string | undefined;
    const shouldUseIOSProxy = actualClientProfile === "ios_safari";

    // iOS playback is routed through MediaFlow transcoding so MKV sources remain playable.
    const clientProfile = shouldUseIOSProxy ? "default" : actualClientProfile;
    if (!RD_TOKEN) {
      return {
        errorCode: "NO_RDTOKEN" as ResolveErrorCode,
        error: "Real-Debrid token missing from server config.",
      };
    }

    if (!TMDB_API_KEY) {
      return {
        errorCode: "NO_TMDBKEY" as ResolveErrorCode,
        error: "TMDB API key missing from server config.",
      };
    }

    const parsed = parseWatchId(watchId);
    const diagnostics: ResolverDiagnostics = {
      watchId,
      mediaType: parsed.type,
      tmdbId: parsed.tmdbId,
      candidateCount: 0,
      attempts: [],
    };

    try {
      const imdbId =
        parsed.type === "tv"
          ? await tmdbTVToImdb(parsed.tmdbId)
          : await tmdbMovieToImdb(parsed.tmdbId);
      diagnostics.imdbId = imdbId;

      const candidates = await fetchTorrentioStreams(
        imdbId,
        parsed.type,
        parsed.season,
        parsed.episode,
      );
      const ranked = rankCandidates(candidates, {
        type: parsed.type,
        season: parsed.season,
        episode: parsed.episode,
        preferredQuality,
      }).slice(0, RESOLVER_MAX_CANDIDATES);

      diagnostics.candidateCount = ranked.length;

      if (!ranked.length) {
        diagnostics.attempts.push({
          infoHash: "",
          title: "",
          score: 0,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          status: "failed",
          errorCode: "NO_CANDIDATES",
          error: `No RD+ candidates found for ${imdbId}`,
        });
        await telemetryLog(diagnostics);

        return {
          errorCode: "NO_CANDIDATES" as ResolveErrorCode,
          error: `No streams found for ${imdbId}${parsed.type === "tv" ? ` S${parsed.season}E${parsed.episode}` : ""}.`,
          diagnostics,
        };
      }

      for (const candidate of ranked) {
        const resolved = await resolveCandidate(candidate, { ...parsed }, diagnostics);
        if (!resolved) continue;

        diagnostics.selected = {
          infoHash: candidate.infoHash,
          torrentId: resolved.torrentId,
          selectedFile: resolved.selectedFile
            ? {
                id: resolved.selectedFile.id,
                path: resolved.selectedFile.path,
                bytes: resolved.selectedFile.bytes,
              }
            : undefined,
        };

        await telemetryLog(diagnostics);

        let finalStreamUrl = resolved.streamUrl;
        let finalBackupStreams = resolved.backupStreams;

        // iOS Safari cannot play MKV directly. Route iOS streams through MediaFlow transcoding.
        if (shouldUseIOSProxy) {
          const proxyWrappedPrimary = buildMediaFlowStreamUrl(resolved.streamUrl, PROXY_PASS);
          const proxyWrappedBackups = resolved.backupStreams.map((b) =>
            buildMediaFlowStreamUrl(b, PROXY_PASS),
          );

          finalStreamUrl = proxyWrappedPrimary;
          finalBackupStreams = uniqueUrls([
            ...proxyWrappedBackups,
            resolved.streamUrl,
            ...resolved.backupStreams,
          ]);
        }

        return {
          streamUrl: finalStreamUrl,
          backupStreams: finalBackupStreams,
          filename: resolved.selectedFile ? resolved.selectedFile.path.split('/').pop() : "",
          imdbId,
          mediaType: parsed.type,
          season: parsed.season,
          episode: parsed.episode,
          selectedQuality: preferredQuality,
          clientProfile: actualClientProfile,
          diagnostics,
        };
      }



      return {
        errorCode: "ALL_CANDIDATES_FAILED" as ResolveErrorCode,
        error: "Could not resolve a playable stream after trying multiple sources.",
        diagnostics,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown streaming error.";
      const errorCode: ResolveErrorCode = message.includes("No IMDB ID")
        ? "TMDB_IMDB_MISSING"
        : "UNKNOWN";

      diagnostics.attempts.push({
        infoHash: "",
        title: "",
        score: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: "failed",
        errorCode,
        error: message,
      });
      await telemetryLog(diagnostics);

      return {
        errorCode,
        error: message,
        diagnostics,
      };
    }
  });
