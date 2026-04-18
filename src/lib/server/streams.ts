import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RD_TOKEN = import.meta.env.VITE_REAL_DEBRID_TOKEN;
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

interface StreamSource {
  magnet: string;
  infoHash: string;
  title: string;
  fileIdx?: number; // For TV shows: specific file index in the torrent
}

/**
 * Parse the watch ID to determine if it's a movie or TV show.
 * Movie IDs: plain numbers like "76479"
 * TV IDs: "tv-{tmdbId}-s{season}e{episode}" like "tv-76479-s1e3"
 */
function parseWatchId(id: string): { type: "movie" | "tv"; tmdbId: string; season?: number; episode?: number } {
  const tvMatch = id.match(/^tv-(\d+)-s(\d+)e(\d+)$/);
  if (tvMatch) {
    return { type: "tv", tmdbId: tvMatch[1], season: parseInt(tvMatch[2]), episode: parseInt(tvMatch[3]) };
  }
  return { type: "movie", tmdbId: id };
}

/**
 * Convert TMDB ID → IMDB ID for movies
 */
async function tmdbMovieToImdb(tmdbId: string): Promise<string> {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB external_ids failed: ${res.status}`);
  const data = await res.json();
  if (!data.imdb_id) throw new Error("No IMDB ID found for this movie.");
  return data.imdb_id;
}

/**
 * Convert TMDB TV ID → IMDB ID for TV shows
 */
async function tmdbTVToImdb(tmdbId: string): Promise<string> {
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB TV external_ids failed: ${res.status}`);
  const data = await res.json();
  if (!data.imdb_id) throw new Error("No IMDB ID found for this TV show.");
  return data.imdb_id;
}

/**
 * Scrape Torrentio for magnets — handles both movies and TV episodes.
 * Movie: /stream/movie/{imdbId}.json
 * TV:    /stream/series/{imdbId}:{season}:{episode}.json
 */
async function fetchTorrentioStreams(
  imdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<StreamSource[]> {
  const prefix = RD_TOKEN ? `realdebrid=${RD_TOKEN}/` : "";
  let url: string;
  if (type === "tv" && season != null && episode != null) {
    url = `https://torrentio.strem.fun/${prefix}stream/series/${imdbId}:${season}:${episode}.json`;
  } else {
    url = `https://torrentio.strem.fun/${prefix}stream/movie/${imdbId}.json`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Torrentio returned ${res.status}`);
  const data = await res.json();

  if (!data.streams || data.streams.length === 0) {
    return [];
  }

  return data.streams
    .filter((s: any) => {
      // Must be a cached Real-Debrid proxy URL stream
      if (!s.name || !s.name.includes("[RD+]")) return false;
      return true;
    })
    .map((s: any) => {
      let infoHash = s.infoHash;
      let fileIdx = s.fileIdx;
      
      // Torrentio omit roots when realdebrid is injected, so extract from proxy URL
      if (!infoHash && s.url && s.url.includes("/resolve/realdebrid/")) {
        const parts = s.url.split('/');
        // https://torrentio.strem.fun/resolve/realdebrid/TOKEN/HASH/null/IDX/filename
        if (parts.length >= 9) {
          infoHash = parts[6];
          const idxRaw = parts[8];
          if (idxRaw && idxRaw !== "null") fileIdx = parseInt(idxRaw);
        }
      }

      return {
        magnet: infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "",
        infoHash: infoHash ? infoHash.toLowerCase() : "",
        title: s.title || "Unknown",
        fileIdx: fileIdx != null ? fileIdx : undefined,
      };
    })
    .filter((s: any) => s.infoHash); // Ensure we successfully extracted the hash
}



/**
 * Add Magnet to Real-Debrid
 */
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
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to add magnet: ${(err as any).error || res.status}`);
  }
  const data = await res.json();
  return data.id;
}

/**
 * Select the correct file and unrestrict.
 * For TV shows with fileIdx, we select that specific file.
 * For movies, we select the largest video file.
 */
async function selectAndUnrestrict(torrentId: string, fileIdx?: number): Promise<string> {
  let targetFile: any = null;
  let hasSelectedFiles = false;

  for (let attempt = 0; attempt < 30; attempt++) {
    const infoRes = await fetch(
      `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`,
      { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
    );
    const info = await infoRes.json();

    if (["error", "dead", "magnet_error"].includes(info.status)) {
      throw new Error(`RD torrent failed with status: ${info.status}`);
    }

    // Unconditionally discover targetFile as soon as files are available
    if (!targetFile && info.files && info.files.length > 0) {
      if (fileIdx != null && info.files[fileIdx]) {
        targetFile = info.files[fileIdx];
      } else {
        const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        const videoFiles = info.files.filter((f: any) => {
          const name = (f.path || f.name || "").toLowerCase();
          return VIDEO_EXTENSIONS.some(ext => name.endsWith(ext));
        });
        targetFile = (videoFiles.length > 0 ? videoFiles : info.files)
          .reduce((prev: any, curr: any) => (prev.bytes > curr.bytes) ? prev : curr);
      }
    }

    if (info.status === "magnet_conversion") {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const unselected = info.files ? info.files.every((f: any) => f.selected === 0) : true;
    const needsSelection = info.status === "waiting_files_selection" || (["downloading", "queued"].includes(info.status) && unselected);

    if (needsSelection && !hasSelectedFiles) {
      if (!targetFile) throw new Error("No files in torrent to select");

      const selectForm = new URLSearchParams();
      selectForm.append("files", targetFile.id.toString());
      await fetch(
        `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RD_TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: selectForm.toString(),
        }
      );
      
      hasSelectedFiles = true;
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (info.status === "downloading" || info.status === "queued" || info.status === "compressing") {
      // Just wait for it to finish
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (info.status === "downloaded" && info.links && info.links.length > 0) {
      // Find our target file's link
      let linkIdx = 0;
      if (targetFile) {
        const selectedFiles = info.files.filter((f: any) => f.selected === 1);
        const foundIdx = selectedFiles.findIndex((f: any) => f.id === targetFile.id);
        if (foundIdx !== -1) linkIdx = foundIdx;
      }
      
      const linkForm = new URLSearchParams();
      linkForm.append("link", info.links[linkIdx]);
      const unrestrictRes = await fetch(
        "https://api.real-debrid.com/rest/1.0/unrestrict/link",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RD_TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: linkForm.toString(),
        }
      );
      
      const streamInfo = await unrestrictRes.json();
      if (!streamInfo || !streamInfo.download) {
         throw new Error("Failed to resolve unrestrict link. RD Error: " + (streamInfo.error || "Unknown"));
      }
      return streamInfo.download;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error("Torrent is still processing. Try again in a moment.");
}

/**
 * Main streaming function — handles both movies and TV episodes.
 * Movie IDs: "12345"
 * TV IDs: "tv-12345-s1e3"
 */
export const getStreamForMovie = createServerFn({ method: "POST" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: watchId }) => {
    if (!RD_TOKEN) return { error: "Real-Debrid token missing from server config." };
    if (!TMDB_API_KEY) return { error: "TMDB API key missing from server config." };

    try {
      const parsed = parseWatchId(watchId);

      // Step 0: Convert TMDB ID → IMDB ID
      const imdbId = parsed.type === "tv"
        ? await tmdbTVToImdb(parsed.tmdbId)
        : await tmdbMovieToImdb(parsed.tmdbId);

      // Step 1: Get sources from Torrentio
      const sources = await fetchTorrentioStreams(imdbId, parsed.type, parsed.season, parsed.episode);
      if (!sources.length) {
        return { error: `No streams found for ${imdbId}${parsed.type === "tv" ? ` S${parsed.season}E${parsed.episode}` : ""}. This title may not have torrent sources.` };
      }

      // Step 2: Use Torrentio's natively verified RD+ streams
      // Our fetch Torrentio function exclusively returns verified [RD+] streams
      const targetSource = sources[0];

      // Step 3: Add magnet to RD
      const torrentId = await addMagnetToRD(targetSource.magnet);

      // Step 4: Select file, poll, unrestrict
      const streamUrl = await selectAndUnrestrict(torrentId, targetSource.fileIdx);

      return { streamUrl, imdbId, mediaType: parsed.type, season: parsed.season, episode: parsed.episode };
    } catch (err: any) {
      return { error: err.message || "Unknown streaming error." };
    }
  });
