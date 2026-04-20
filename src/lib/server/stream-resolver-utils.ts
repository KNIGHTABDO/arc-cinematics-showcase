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

export interface IOSQualityHardeningOptions {
  enabled?: boolean;
  rejectTrashReleases?: boolean;
  minBytes1080?: number;
  minBytes720?: number;
}

export interface FileSelectionDetails {
  file: RDTorrentFile | null;
  rejectReason?: "IOS_NO_ACCEPTABLE_QUALITY";
  rejectDetails?: string[];
}

function sanitizeTitle(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasTrashReleaseTag(text: string): boolean {
  return /\b(hdcam|camrip|cam|hdts|telesync|ts|workprint)\b/i.test(text);
}

function parseQualityTag(text: string): "2160" | "1080" | "720" | "480" | null {
  if (/\b2160p?\b|\b4k\b/i.test(text)) return "2160";
  if (/\b1080p?\b/i.test(text)) return "1080";
  if (/\b720p?\b/i.test(text)) return "720";
  if (/\b480p?\b/i.test(text)) return "480";
  return null;
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
    iosQualityHardening?: IOSQualityHardeningOptions;
  },
): number {
  const text = sanitizeTitle(candidate.title);
  let score = 0;

  if (text.includes("2160") || text.includes("4k")) score += 40;
  else if (text.includes("1080")) score += 28;
  else if (text.includes("720")) score += 18;

  const isWebSource = text.includes("web dl") || text.includes("web-dl") || text.includes("webrip");
  const isPremiumSource = text.includes("bluray") || text.includes("bdrip") || text.includes("remux");
  if (isWebSource) score += 8;
  if (isPremiumSource) score += 10;

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

  const hardeningEnabled = opts.iosQualityHardening?.enabled === true;

  // iOS Safari profile: effectively filter out non-MP4 containers
  // iOS cannot play MKV, WebM, or AVI — only MP4/M4V/MOV containers work
  if (opts.clientProfile === "ios_safari") {
    const isMp4 = /\bmp4\b|\bm4v\b|\bmov\b/i.test(candidate.title);
    const isMkv = /\bmkv\b|\bmatroska\b/i.test(candidate.title);
    const isWebm = /\bwebm\b/i.test(candidate.title);
    const isAvi = /\bavi\b/i.test(candidate.title);
    if (isMp4) score += 200;
    if (isMkv || isWebm || isAvi) score -= 5000; // effectively filter out

    if (hardeningEnabled) {
      if (opts.iosQualityHardening?.rejectTrashReleases !== false && hasTrashReleaseTag(text)) {
        score -= 10000;
      }

      // On iOS, promote known better source tags and penalize unknown source labels a bit.
      if (isPremiumSource) score += 20;
      else if (isWebSource) score += 10;
      else score -= 20;
    }
  }

  // Penalize bad sources generally
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
    iosQualityHardening?: IOSQualityHardeningOptions;
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

function pickFromPool(
  pool: RDTorrentFile[],
  opts: { type: "movie" | "tv"; season?: number; episode?: number; preferredFileIdx?: number; clientProfile?: "default" | "ios_safari" },
): RDTorrentFile | null {
  if (!pool.length) return null;

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
    if (p.endsWith(".mp4") || p.endsWith(".m4v") || p.endsWith(".mov")) return 10;
    if (opts.clientProfile === "ios_safari") {
      // On iOS, anything non-MP4 is essentially unplayable
      return -1;
    }
    if (p.endsWith(".webm") || p.endsWith(".ts")) return 2;
    if (p.endsWith(".mkv")) return 1;
    return 0;
  };

  if (opts.type === "tv") {
    const matchers = buildEpisodeMatchers(opts.season, opts.episode);
    const byEpisode = pool.filter((f) => matchers.some((rx) => rx.test(f.path)));
    if (byEpisode.length) {
      return (
        byEpisode.sort((a, b) => {
          const rankDelta = containerRank(b.path) - containerRank(a.path);
          if (rankDelta !== 0) return rankDelta;
          return b.bytes - a.bytes;
        })[0] ?? null
      );
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
      return (
        filtered.sort((a, b) => {
          const rankDelta = containerRank(b.path) - containerRank(a.path);
          if (rankDelta !== 0) return rankDelta;
          return b.bytes - a.bytes;
        })[0] ?? null
      );
    }
  }

  return (
    pool.sort((a, b) => {
      const rankDelta = containerRank(b.path) - containerRank(a.path);
      if (rankDelta !== 0) return rankDelta;
      return b.bytes - a.bytes;
    })[0] ?? null
  );
}

export function chooseTargetFileDetailed(
  files: RDTorrentFile[],
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredFileIdx?: number;
    clientProfile?: "default" | "ios_safari";
    iosQualityHardening?: IOSQualityHardeningOptions;
  },
): FileSelectionDetails {
  if (!files?.length) return { file: null };

  let videoFiles = files.filter((f) => isLikelyVideoFile(f.path));

  // iOS Safari: filter to MP4/M4V/MOV only — iOS cannot play MKV/WebM/AVI
  let iosCompatible: RDTorrentFile[] = [];
  if (opts.clientProfile === "ios_safari") {
    iosCompatible = videoFiles.filter((f) => {
      const p = (f.path || "").toLowerCase();
      return p.endsWith(".mp4") || p.endsWith(".m4v") || p.endsWith(".mov");
    });
    if (iosCompatible.length > 0) {
      videoFiles = iosCompatible;
    }
    // If no MP4 files exist, fall through to all video files — the player
    // will show an error but at least we tried
  }

  let pool = videoFiles.length ? videoFiles : files;

  const hardening = opts.iosQualityHardening;
  const hardeningEnabled = opts.clientProfile === "ios_safari" && hardening?.enabled === true;

  if (hardeningEnabled && pool.length > 0) {
    const minBytes1080 = Math.max(1, hardening?.minBytes1080 ?? 1_500_000_000);
    const minBytes720 = Math.max(1, hardening?.minBytes720 ?? 800_000_000);
    const rejectTrash = hardening?.rejectTrashReleases !== false;

    const rejectDetails: string[] = [];
    const accepted = pool.filter((f) => {
      const text = sanitizeTitle(f.path || "");

      if (rejectTrash && hasTrashReleaseTag(text)) {
        rejectDetails.push(`trash_tag:${f.path}`);
        return false;
      }

      const quality = parseQualityTag(text);
      if (quality === "1080" && f.bytes < minBytes1080) {
        rejectDetails.push(`below_1080_floor:${f.path}:${f.bytes}`);
        return false;
      }
      if (quality === "720" && f.bytes < minBytes720) {
        rejectDetails.push(`below_720_floor:${f.path}:${f.bytes}`);
        return false;
      }

      return true;
    });

    if (accepted.length > 0) {
      pool = accepted;
    } else if (iosCompatible.length > 0) {
      return {
        file: null,
        rejectReason: "IOS_NO_ACCEPTABLE_QUALITY",
        rejectDetails,
      };
    }
  }

  return { file: pickFromPool(pool, opts) };
}

export function chooseTargetFile(
  files: RDTorrentFile[],
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredFileIdx?: number;
    clientProfile?: "default" | "ios_safari";
    iosQualityHardening?: IOSQualityHardeningOptions;
  },
): RDTorrentFile | null {
  return chooseTargetFileDetailed(files, opts).file;
}
