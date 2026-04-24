import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function loadEnv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

const env = loadEnv(path.join(ROOT, ".env"));
const RD_TOKEN = env.VITE_REAL_DEBRID_TOKEN;
const TMDB_KEY = env.VITE_TMDB_API_KEY;

if (!RD_TOKEN || !TMDB_KEY) {
  throw new Error("Missing VITE_REAL_DEBRID_TOKEN or VITE_TMDB_API_KEY in .env");
}

const RD_BASE = "https://api.real-debrid.com/rest/1.0";

const CASES = [
  { kind: "tv", tmdbId: "222766", season: 1, episode: 2, label: "The Day of the Jackal S1E2" },
  { kind: "tv", tmdbId: "1399", season: 1, episode: 1, label: "Game of Thrones S1E1" },
  { kind: "tv", tmdbId: "94997", season: 1, episode: 1, label: "House of the Dragon S1E1" },
  { kind: "tv", tmdbId: "82856", season: 1, episode: 1, label: "The Mandalorian S1E1" },
  { kind: "tv", tmdbId: "100088", season: 1, episode: 1, label: "The Last of Us S1E1" },
  { kind: "tv", tmdbId: "60625", season: 1, episode: 1, label: "Rick and Morty S1E1" },
  { kind: "movie", tmdbId: "687163", label: "Dune: Part Two" },
  { kind: "movie", tmdbId: "603", label: "The Matrix" },
  { kind: "movie", tmdbId: "872585", label: "Oppenheimer" },
  { kind: "movie", tmdbId: "278", label: "The Shawshank Redemption" },
  { kind: "movie", tmdbId: "27205", label: "Inception" },
  { kind: "movie", tmdbId: "157336", label: "Interstellar" },
];

const metrics = {
  totalCases: 0,
  withCandidates: 0,
  resolvedDirectPlayable: 0,
  resolvedTranscodePlayable: 0,
  forceDownloadDirect: 0,
  rdStatusFailed: 0,
  noPlayable: 0,
};

async function fetchWithTimeout(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rdRequest(pathname, init = {}, timeoutMs = 12000) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${RD_TOKEN}`);
  return fetchWithTimeout(`${RD_BASE}${pathname}`, { ...init, headers }, timeoutMs);
}

function parseTorrentioStream(entry) {
  let infoHash = entry.infoHash;
  let fileIdx = Number.isInteger(entry.fileIdx) ? entry.fileIdx : undefined;

  if (!infoHash && typeof entry.url === "string" && entry.url.includes("/resolve/realdebrid/")) {
    const parts = entry.url.split("/");
    if (parts.length >= 9) {
      infoHash = parts[6];
      const idxRaw = parts[8];
      if (idxRaw && idxRaw !== "null") {
        const parsed = Number.parseInt(idxRaw, 10);
        if (Number.isFinite(parsed)) fileIdx = parsed;
      }
    }
  }

  if (!infoHash) return null;

  return {
    title: String(entry.title || entry.name || "Unknown").split("\n")[0],
    infoHash: String(infoHash).toLowerCase(),
    fileIdx,
  };
}

async function getImdbId(tc) {
  const url =
    tc.kind === "tv"
      ? `https://api.themoviedb.org/3/tv/${tc.tmdbId}/external_ids?api_key=${TMDB_KEY}`
      : `https://api.themoviedb.org/3/movie/${tc.tmdbId}/external_ids?api_key=${TMDB_KEY}`;

  const res = await fetchWithTimeout(url, {}, 10000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.imdb_id) return null;
  return data.imdb_id;
}

async function getTorrentioCandidates(tc, imdbId) {
  const prefix = `realdebrid=${RD_TOKEN}/`;
  const url =
    tc.kind === "tv"
      ? `https://torrentio.strem.fun/${prefix}stream/series/${imdbId}:${tc.season}:${tc.episode}.json`
      : `https://torrentio.strem.fun/${prefix}stream/movie/${imdbId}.json`;

  const res = await fetchWithTimeout(url, {}, 10000);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const streams = Array.isArray(data?.streams) ? data.streams : [];

  return streams
    .map((s) => parseTorrentioStream(s))
    .filter(Boolean)
    .slice(0, 6);
}

async function addMagnet(infoHash) {
  const form = new URLSearchParams();
  form.set("magnet", `magnet:?xt=urn:btih:${infoHash}`);

  const res = await rdRequest("/torrents/addMagnet", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json().catch(() => ({}));
  return data?.id || null;
}

async function pollInfo(torrentId, tries = 6, delayMs = 1400) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const res = await rdRequest(`/torrents/info/${torrentId}`, {}, 10000);
    last = await res.json().catch(() => ({}));
    if (["error", "dead", "magnet_error", "virus"].includes(last?.status)) return last;
    if (Array.isArray(last?.files) && last.files.length) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

function pickFile(info, tc, preferredIdx) {
  const files = (info?.files || []).filter((f) => /\.(mkv|mp4|m4v|avi|webm|ts)$/i.test(f.path || ""));
  if (!files.length) return null;

  if (Number.isInteger(preferredIdx)) {
    const byId = files.find((f) => f.id === preferredIdx || f.id === preferredIdx + 1);
    if (byId) return byId;
  }

  if (tc.kind === "tv") {
    const rx = new RegExp(`s0?${tc.season}e0?${tc.episode}`, "i");
    const byEp = files.filter((f) => rx.test(f.path || ""));
    if (byEp.length) {
      byEp.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
      return byEp[0];
    }
  }

  files.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  return files[0];
}

async function selectFile(torrentId, fileId) {
  const form = new URLSearchParams();
  form.set("files", String(fileId));
  await rdRequest(`/torrents/selectFiles/${torrentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

async function waitDownloaded(torrentId, tries = 7, delayMs = 1500) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const res = await rdRequest(`/torrents/info/${torrentId}`, {}, 10000);
    last = await res.json().catch(() => ({}));
    if (["error", "dead", "magnet_error", "virus"].includes(last?.status)) return last;
    if (last?.status === "downloaded" && Array.isArray(last?.links) && last.links.length) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

async function unrestrict(link) {
  const form = new URLSearchParams();
  form.set("link", link);
  const res = await rdRequest("/unrestrict/link", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return await res.json().catch(() => ({}));
}

async function preflight(url) {
  try {
    const r = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Range: "bytes=0-1" },
      },
      3000,
    );
    return {
      ok:
        (r.status === 200 || r.status === 206) &&
        /video|octet-stream|mp2t|x-matroska|quicktime|mpegurl|application\/vnd\.apple\.mpegurl/i.test(
          r.headers.get("content-type") || "",
        ),
      status: r.status,
      contentType: r.headers.get("content-type") || "",
    };
  } catch {
    return { ok: false, status: 0, contentType: "" };
  }
}

async function getTranscodes(unrestrictedId) {
  const res = await rdRequest(`/streaming/transcode/${unrestrictedId}`, {}, 9000);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));

  const buckets = [data?.liveMP4, data?.h264WebM, data?.apple];
  const out = [];
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const val of Object.values(bucket)) {
      if (typeof val === "string") out.push(val);
    }
  }
  return [...new Set(out)];
}

async function cleanup(torrentId) {
  try {
    await rdRequest(`/torrents/delete/${torrentId}`, { method: "DELETE" }, 5000);
  } catch {}
}

async function runCase(tc) {
  const result = {
    label: tc.label,
    watchId:
      tc.kind === "tv"
        ? `tv-${tc.tmdbId}-s${tc.season}e${tc.episode}`
        : `${tc.tmdbId}`,
    imdbId: null,
    candidates: 0,
    best: null,
    attempts: [],
  };

  const imdbId = await getImdbId(tc);
  result.imdbId = imdbId;
  if (!imdbId) {
    result.best = { status: "tmdb_imdb_missing" };
    return result;
  }

  const candidates = await getTorrentioCandidates(tc, imdbId);
  result.candidates = candidates.length;
  if (!candidates.length) {
    result.best = { status: "no_candidates" };
    return result;
  }

  metrics.withCandidates += 1;

  for (const candidate of candidates.slice(0, 4)) {
    const attempt = {
      infoHash: candidate.infoHash,
      title: candidate.title,
      torrentStatus: null,
      directPreflight: null,
      transcodePlayable: false,
      mode: null,
      note: "",
    };

    let torrentId = null;

    try {
      torrentId = await addMagnet(candidate.infoHash);
      if (!torrentId) {
        attempt.note = "add_magnet_failed";
        result.attempts.push(attempt);
        continue;
      }

      const converted = await pollInfo(torrentId);
      attempt.torrentStatus = converted?.status || null;
      if (!converted?.files?.length) {
        if (["error", "dead", "magnet_error", "virus"].includes(converted?.status)) {
          metrics.rdStatusFailed += 1;
        }
        attempt.note = "no_files";
        result.attempts.push(attempt);
        await cleanup(torrentId);
        continue;
      }

      const file = pickFile(converted, tc, candidate.fileIdx);
      if (!file) {
        attempt.note = "no_video_file";
        result.attempts.push(attempt);
        await cleanup(torrentId);
        continue;
      }

      await selectFile(torrentId, file.id);
      const downloaded = await waitDownloaded(torrentId);
      attempt.torrentStatus = downloaded?.status || attempt.torrentStatus;

      if (downloaded?.status !== "downloaded" || !Array.isArray(downloaded?.links) || !downloaded.links.length) {
        if (["error", "dead", "magnet_error", "virus"].includes(downloaded?.status)) {
          metrics.rdStatusFailed += 1;
        }
        attempt.note = "not_downloaded";
        result.attempts.push(attempt);
        await cleanup(torrentId);
        continue;
      }

      const link = downloaded.links[Math.max(0, file.id - 1)] || downloaded.links[0];
      const unrestricted = await unrestrict(link);

      if (!unrestricted?.download) {
        attempt.note = "unrestrict_failed";
        result.attempts.push(attempt);
        await cleanup(torrentId);
        continue;
      }

      const directPreflight = await preflight(unrestricted.download);
      attempt.directPreflight = directPreflight;

      if (
        directPreflight.status === 200 &&
        /force-download/i.test(directPreflight.contentType || "")
      ) {
        metrics.forceDownloadDirect += 1;
      }

      if (directPreflight.ok) {
        attempt.mode = "direct";
        result.best = {
          status: "playable",
          mode: "direct",
          contentType: directPreflight.contentType,
          statusCode: directPreflight.status,
        };
        result.attempts.push(attempt);
        metrics.resolvedDirectPlayable += 1;
        await cleanup(torrentId);
        return result;
      }

      if (unrestricted.id) {
        const transcodes = await getTranscodes(unrestricted.id);
        for (const tUrl of transcodes.slice(0, 6)) {
          const tPre = await preflight(tUrl);
          const forceDownloadMp4Ok =
            tPre.status === 200 &&
            /\/full\.mp4(?:\?|$)/i.test(tUrl) &&
            /force-download/i.test(tPre.contentType || "");

          if (tPre.ok || forceDownloadMp4Ok) {
            attempt.transcodePlayable = true;
            attempt.mode = "transcode";
            result.best = {
              status: "playable",
              mode: "transcode",
              contentType: tPre.contentType,
              statusCode: tPre.status,
            };
            result.attempts.push(attempt);
            metrics.resolvedTranscodePlayable += 1;
            await cleanup(torrentId);
            return result;
          }
        }
      }

      attempt.note = "no_playable_url";
      result.attempts.push(attempt);
      await cleanup(torrentId);
    } catch (error) {
      attempt.note = `error:${error instanceof Error ? error.message : String(error)}`;
      result.attempts.push(attempt);
      if (torrentId) await cleanup(torrentId);
    }
  }

  metrics.noPlayable += 1;
  if (!result.best) {
    result.best = { status: "no_playable" };
  }
  return result;
}

async function main() {
  const started = Date.now();
  const results = [];

  for (const tc of CASES) {
    metrics.totalCases += 1;
    console.log(`\\n=== ${tc.label} ===`);
    const r = await runCase(tc);
    results.push(r);
    console.log(
      JSON.stringify(
        {
          watchId: r.watchId,
          candidates: r.candidates,
          best: r.best,
          attempts: r.attempts.length,
        },
        null,
        2,
      ),
    );
  }

  const summary = {
    elapsedMs: Date.now() - started,
    metrics,
    successRate: Number(
      (
        (metrics.resolvedDirectPlayable + metrics.resolvedTranscodePlayable) /
        Math.max(1, metrics.totalCases)
      ).toFixed(3),
    ),
  };

  const outPath = path.join(ROOT, "rd-benchmark-report.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), "utf8");

  console.log("\\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
