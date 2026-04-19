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
  opts: { type: "movie" | "tv"; season?: number; episode?: number },
): number {
  const text = sanitizeTitle(candidate.title);
  let score = 0;

  if (text.includes("2160") || text.includes("4k")) score += 40;
  else if (text.includes("1080")) score += 28;
  else if (text.includes("720")) score += 18;

  if (text.includes("web dl") || text.includes("web-dl") || text.includes("webrip")) score += 8;
  if (text.includes("bluray") || text.includes("bdrip") || text.includes("remux")) score += 10;

  // Browser compatibility preference
  if (text.includes("x265") || text.includes("h265") || text.includes("hevc")) score -= 12;
  if (text.includes("hdr") || text.includes("dv") || text.includes("dolby vision")) score -= 6;

  // Penalize bad sources
  if (
    text.includes("cam") ||
    text.includes("hdcam") ||
    text.includes("ts") ||
    text.includes("telesync")
  )
    score -= 120;

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
  opts: { type: "movie" | "tv"; season?: number; episode?: number },
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
    // Stremio fileIdx semantics can vary by source; try multiple mappings
    const byArrayIndex = pool[opts.preferredFileIdx];
    if (byArrayIndex) return byArrayIndex;

    const byIdExact = pool.find((f) => f.id === opts.preferredFileIdx);
    if (byIdExact) return byIdExact;

    const byIdPlusOne = pool.find((f) => f.id === opts.preferredFileIdx + 1);
    if (byIdPlusOne) return byIdPlusOne;
  }

  if (opts.type === "tv") {
    const matchers = buildEpisodeMatchers(opts.season, opts.episode);
    const byEpisode = pool.filter((f) => matchers.some((rx) => rx.test(f.path)));
    if (byEpisode.length) {
      return byEpisode.reduce((best, cur) => (cur.bytes > best.bytes ? cur : best));
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
      return filtered.reduce((best, cur) => (cur.bytes > best.bytes ? cur : best));
    }
  }

  return pool.reduce((best, cur) => (cur.bytes > best.bytes ? cur : best));
}
