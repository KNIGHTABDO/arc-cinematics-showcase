export interface RDTorrentFile {
  id: number;
  path: string;
  bytes: number;
  selected?: number;
}

export interface StreamCandidate {
  magnet: string;
  infoHash: string;
  title: string;
  fileIdx?: number;
}

function sanitizeTitle(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildEpisodeMatchers(season?: number, episode?: number): RegExp[] {
  if (season == null || episode == null) return [];
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return [
    new RegExp(`s${s}e${e}`, "i"),
    new RegExp(`s${season}e${episode}`, "i"),
    new RegExp(`${season}x${episode}`, "i"),
    new RegExp(`season\\s*${season}\\s*episode\\s*${episode}`, "i"),
    new RegExp(`\\b${s}${e}\\b`, "i"),
  ];
}

export function isLikelyVideoFile(path: string): boolean {
  const p = (path || "").toLowerCase();
  return [".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts"].some((ext) =>
    p.endsWith(ext),
  );
}

export function scoreCandidate(
  candidate: StreamCandidate,
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredQuality?: "auto" | "2160" | "1080" | "720" | "480";
    clientProfile?: "default" | "ios_safari";
  },
): number {
  const text = sanitizeTitle(candidate.title);
  let score = 0;

  if (text.includes("2160") || text.includes("4k")) score += 40;
  else if (text.includes("1080")) score += 28;
  else if (text.includes("720")) score += 18;

  if (text.includes("web dl") || text.includes("web-dl") || text.includes("webrip")) score += 8;
  if (text.includes("bluray") || text.includes("bdrip") || text.includes("remux")) score += 10;

  // Audio compatibility logic: Browsers cannot play DDP5.1 / EAC3 / DTS / TrueHD
  if (
    text.includes("ddp") || 
    text.includes("eac3") || 
    text.includes("dts") || 
    text.includes("truehd") || 
    text.includes("atmos") ||
    text.includes("flac")
  ) {
    score -= 1000;
  }
  if (text.includes("aac") || text.includes("ac3") || text.includes("2 0") || text.includes("mp4")) {
    score += 500;
  }

  // Browser compatibility preference (web player first, Stremio-like reliability in browser context)
  if (text.includes("x264") || text.includes("h264") || text.includes("avc")) score += 26;
  if (text.includes("x265") || text.includes("h265") || text.includes("hevc")) score -= 85;
  if (text.includes("hdr") || text.includes("dv") || text.includes("dolby vision")) score -= 22;

  // iOS Safari profile: heavily deprioritize MKV/matroska, boost MP4/M4V
  if (opts.clientProfile === "ios_safari") {
    const isMkv = /\bmkv\b|\bmatroska\b/i.test(candidate.title);
    const isMp4 = /\bmp4\b|\bm4v\b/i.test(candidate.title);
    if (isMkv) score -= 150;
    if (isMp4) score += 50;
  }

  // Penalize bad sources
  if (
    text.includes("cam") ||
    text.includes("hdcam") ||
    text.includes("ts") ||
    text.includes("telesync")
  )
    score -= 120;

  if (opts.preferredQuality && opts.preferredQuality !== "auto") {
    const q = opts.preferredQuality;
    const has2160 = /\b2160p?\b|\b4k\b/i.test(candidate.title);
    const has1080 = /\b1080p?\b/i.test(candidate.title);
    const has720 = /\b720p?\b/i.test(candidate.title);
    const has480 = /\b480p?\b/i.test(candidate.title);

    const matchesPreferred =
      (q === "2160" && has2160) ||
      (q === "1080" && has1080) ||
      (q === "720" && has720) ||
      (q === "480" && has480);

    if (matchesPreferred) score += 120;
    else score -= 45;
  }

  if (opts.type === "tv") {
    const matchers = buildEpisodeMatchers(opts.season, opts.episode);
    if (matchers.length && matchers.some((rx) => rx.test(candidate.title))) score += 90;
    else score -= 35;

    if (candidate.fileIdx != null) score += 10;
  }

  if (!candidate.infoHash) score -= 999;

  return score;
}

export function rankCandidates(
  candidates: StreamCandidate[],
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredQuality?: "auto" | "2160" | "1080" | "720" | "480";
    clientProfile?: "default" | "ios_safari";
  },
): Array<StreamCandidate & { score: number }> {
  const dedup = new Map<string, StreamCandidate>();
  for (const c of candidates) {
    const key = `${c.infoHash}:${c.fileIdx ?? "na"}`;
    if (!dedup.has(key)) dedup.set(key, c);
  }

  return Array.from(dedup.values())
    .map((c) => ({ ...c, score: scoreCandidate(c, opts) }))
    .sort((a, b) => b.score - a.score);
}

export function chooseTargetFile(
  files: RDTorrentFile[],
  opts: { type: "movie" | "tv"; season?: number; episode?: number; preferredFileIdx?: number },
): RDTorrentFile | null {
  if (!files?.length) return null;

  const videoFiles = files.filter((f) => isLikelyVideoFile(f.path));
  const pool = videoFiles.length ? videoFiles : files;

  if (opts.preferredFileIdx != null) {
    const prefIdx = opts.preferredFileIdx;
    // Stremio fileIdx semantics can vary by source; try multiple mappings
    const byArrayIndex = pool[prefIdx];
    if (byArrayIndex) return byArrayIndex;

    const byIdExact = pool.find((f) => f.id === prefIdx);
    if (byIdExact) return byIdExact;

    const byIdPlusOne = pool.find((f) => f.id === prefIdx + 1);
    if (byIdPlusOne) return byIdPlusOne;
  }

  const containerRank = (path: string) => {
    const p = (path || "").toLowerCase();
    if (p.endsWith(".mp4") || p.endsWith(".m4v") || p.endsWith(".mov")) return 3;
    if (p.endsWith(".webm") || p.endsWith(".ts")) return 2;
    if (p.endsWith(".mkv")) return 1;
    return 0;
  };

  if (opts.type === "tv") {
    const matchers = buildEpisodeMatchers(opts.season, opts.episode);
    const byEpisode = pool.filter((f) => matchers.some((rx) => rx.test(f.path)));
    if (byEpisode.length) {
      return byEpisode.sort((a, b) => {
        const rankDelta = containerRank(b.path) - containerRank(a.path);
        if (rankDelta !== 0) return rankDelta;
        return b.bytes - a.bytes;
      })[0];
    }

    // Avoid obvious extras when episode match is absent
    const filtered = pool.filter((f) => {
      const p = f.path.toLowerCase();
      return (
        !p.includes("sample") &&
        !p.includes("trailer") &&
        !p.includes("extras") &&
        !p.includes("featurette")
      );
    });

    if (filtered.length) {
      return filtered.sort((a, b) => {
        const rankDelta = containerRank(b.path) - containerRank(a.path);
        if (rankDelta !== 0) return rankDelta;
        return b.bytes - a.bytes;
      })[0];
    }
  }

  return pool.sort((a, b) => {
    const rankDelta = containerRank(b.path) - containerRank(a.path);
    if (rankDelta !== 0) return rankDelta;
    return b.bytes - a.bytes;
  })[0] ?? null;
}
