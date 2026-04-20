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

export interface FileSelectionDetails {
  file: RDTorrentFile | null;
}

function sanitizeTitle(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const AUDIO_LANGUAGE_ALIASES: Record<string, string[]> = {
  ar: ["ar", "ara", "arabic", "arab"],
  de: ["de", "deu", "ger", "german", "deutsch"],
  en: ["en", "eng", "english", "original"],
  es: ["es", "spa", "spanish", "espanol", "castilian", "latino"],
  fr: ["fr", "fra", "fre", "french", "francais"],
  hi: ["hi", "hin", "hindi"],
  it: ["it", "ita", "italian", "italiano"],
  ja: ["ja", "jpn", "japanese"],
  ko: ["ko", "kor", "korean"],
  pt: ["pt", "por", "portuguese", "brazilian", "br"],
  ru: ["ru", "rus", "russian"],
  tr: ["tr", "tur", "turkish"],
  zh: ["zh", "chi", "zho", "chinese", "mandarin", "cantonese"],
};

const DUBBED_MARKERS = [
  "dubbed",
  "dual audio",
  "multi audio",
  "multi-audio",
  "audio latino",
  "vfq",
  "vostfr",
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLanguageCode(language?: string): string | null {
  const raw = (language || "").toLowerCase().trim();
  if (!raw) return null;

  if (raw.length === 2 && AUDIO_LANGUAGE_ALIASES[raw]) {
    return raw;
  }

  for (const [code, aliases] of Object.entries(AUDIO_LANGUAGE_ALIASES)) {
    if (aliases.includes(raw)) {
      return code;
    }
  }

  return raw.slice(0, 2) || null;
}

function textContainsLanguage(text: string, languageCode: string): boolean {
  const normalized = (text || "").toLowerCase();
  const aliases = AUDIO_LANGUAGE_ALIASES[languageCode] || [languageCode];

  return aliases.some((alias) => {
    const escaped = escapeRegExp(alias.toLowerCase());
    const rx = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return rx.test(normalized);
  });
}

function scoreAudioLanguageMatch(text: string, preferredAudioLanguage?: string): number {
  const preferred = normalizeLanguageCode(preferredAudioLanguage);
  if (!preferred) return 0;

  const normalized = (text || "").toLowerCase();
  const hasPreferred = textContainsLanguage(normalized, preferred);
  const hasDubbedMarker = DUBBED_MARKERS.some((marker) => normalized.includes(marker));

  let hasOtherExplicitLanguage = false;
  for (const code of Object.keys(AUDIO_LANGUAGE_ALIASES)) {
    if (code === preferred) continue;
    if (textContainsLanguage(normalized, code)) {
      hasOtherExplicitLanguage = true;
      break;
    }
  }

  let score = 0;

  if (hasPreferred) score += 260;
  if (hasPreferred && hasDubbedMarker) score += 70;

  if (!hasPreferred && hasOtherExplicitLanguage) score -= 260;
  if (!hasPreferred && hasDubbedMarker) score -= 120;

  return score;
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
    preferredAudioLanguage?: string;
  },
): number {
  const text = sanitizeTitle(candidate.title);
  let score = 0;

  // --- Resolution tier scoring (base) ---
  if (text.includes("2160") || text.includes("4k")) score += 40;
  else if (text.includes("1080")) score += 28;
  else if (text.includes("720")) score += 18;

  const isWebSource = text.includes("web dl") || text.includes("web-dl") || text.includes("webrip");
  const isPremiumSource = text.includes("bluray") || text.includes("bdrip") || text.includes("remux");
  if (isWebSource) score += 8;
  if (isPremiumSource) score += 10;

  // --- Audio compatibility ---
  // Browsers cannot play DDP5.1 / EAC3 / DTS / TrueHD natively.
  // MediaFlow proxy CAN transcode these, so only penalize lightly.
  if (
    text.includes("ddp") ||
    text.includes("eac3") ||
    text.includes("dts") ||
    text.includes("truehd") ||
    text.includes("atmos") ||
    text.includes("flac")
  ) {
    score -= 50;
  }
  if (text.includes("aac") || text.includes("ac3") || text.includes("2 0")) {
    score += 60;
  }

  // --- Codec compatibility ---
  if (text.includes("x264") || text.includes("h264") || text.includes("avc")) score += 26;
  if (text.includes("x265") || text.includes("h265") || text.includes("hevc")) score -= 15;
  if (text.includes("hdr") || text.includes("dv") || text.includes("dolby vision")) score -= 22;

  // --- Penalize bad sources generally ---
  if (
    text.includes("cam") ||
    text.includes("hdcam") ||
    text.includes("ts") ||
    text.includes("telesync")
  )
    score -= 120;

  // Keep original/requested language as a first-class selector signal.
  score += scoreAudioLanguageMatch(candidate.title, opts.preferredAudioLanguage);

  // --- Quality preference: DOMINANT factor ---
  // When the user explicitly picks a quality, this MUST override everything else.
  // The +2000/-2000 swing ensures the preferred resolution always wins over
  // audio/codec bonuses which max out around ~100 total.
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

    if (matchesPreferred) score += 2000;
    else score -= 2000;
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
    preferredAudioLanguage?: string;
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
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredFileIdx?: number;
    clientProfile?: "default" | "ios_safari";
    preferredAudioLanguage?: string;
  },
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
    // MKV is now fully supported via MediaFlow proxy for iOS.
    // Rank purely by quality potential: MKV > MP4 > others.
    if (p.endsWith(".mkv")) return 10;
    if (p.endsWith(".mp4") || p.endsWith(".m4v") || p.endsWith(".mov")) return 8;
    if (p.endsWith(".webm") || p.endsWith(".ts")) return 2;
    return 0;
  };

  const languageRank = (path: string) =>
    scoreAudioLanguageMatch(path, opts.preferredAudioLanguage);

  if (opts.type === "tv") {
    const matchers = buildEpisodeMatchers(opts.season, opts.episode);
    const byEpisode = pool.filter((f) => matchers.some((rx) => rx.test(f.path)));
    if (byEpisode.length) {
      return (
        byEpisode.sort((a, b) => {
          const langDelta = languageRank(b.path) - languageRank(a.path);
          if (langDelta !== 0) return langDelta;

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
          const langDelta = languageRank(b.path) - languageRank(a.path);
          if (langDelta !== 0) return langDelta;

          const rankDelta = containerRank(b.path) - containerRank(a.path);
          if (rankDelta !== 0) return rankDelta;
          return b.bytes - a.bytes;
        })[0] ?? null
      );
    }
  }

  return (
    pool.sort((a, b) => {
      const langDelta = languageRank(b.path) - languageRank(a.path);
      if (langDelta !== 0) return langDelta;

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
    preferredAudioLanguage?: string;
  },
): FileSelectionDetails {
  if (!files?.length) return { file: null };

  let videoFiles = files.filter((f) => isLikelyVideoFile(f.path));

  // iOS streaming is now handled by the MediaFlow proxy which converts
  // MKV/WebM to HLS on-the-fly. No container filtering needed.

  let pool = videoFiles.length ? videoFiles : files;

  return { file: pickFromPool(pool, opts) };
}

export function chooseTargetFile(
  files: RDTorrentFile[],
  opts: {
    type: "movie" | "tv";
    season?: number;
    episode?: number;
    preferredFileIdx?: number;
    preferredAudioLanguage?: string;
  },
): RDTorrentFile | null {
  return chooseTargetFileDetailed(files, opts).file;
}
