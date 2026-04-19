import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TMDB_ACCESS_TOKEN = import.meta.env.VITE_TMDB_API_KEY;

// Module-level default — updated by the SettingsProvider on the client
let _defaultLang = "en-US";

export function setTMDBLanguage(lang: string) {
  _defaultLang = lang;
}

const tmdbFetch = async (endpoint: string, params: Record<string, string> = {}) => {
  if (!TMDB_ACCESS_TOKEN) {
    throw new Error("TMDB token missing");
  }

  const searchParams = new URLSearchParams({
    api_key: TMDB_ACCESS_TOKEN,
    language: params.language || _defaultLang,
    ...params,
  });

  const res = await fetch(`https://api.themoviedb.org/3${endpoint}?${searchParams.toString()}`, {
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`TMDB error: ${res.status}`);
  }

  return res.json();
};

// ─── Input type for language-aware calls ───
const langInput = z.object({ language: z.string().optional() }).optional();
type LangInput = z.infer<typeof langInput>;

// ─── MOVIES ───

export const getTrendingMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/trending/movie/day", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getPopularMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/movie/popular", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getTopRatedMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/movie/top_rated", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getNowPlayingMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/movie/now_playing", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

// Kids-safe movies (family/animation genres, PG certification)
export const getKidsMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/discover/movie", {
      language: data?.language || _defaultLang,
      with_genres: "16,10751", // Animation, Family
      "certification_country": "US",
      "certification.lte": "PG",
      sort_by: "popularity.desc",
    });
    return res.results;
  });

// ─── TV SHOWS ───

export const getTrendingTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/trending/tv/day", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getPopularTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/tv/popular", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getTopRatedTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/tv/top_rated", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getAiringTodayTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/tv/airing_today", {
      language: data?.language || _defaultLang,
    });
    return res.results;
  });

export const getKidsTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => langInput.parse(d))
  .handler(async ({ data }) => {
    const res = await tmdbFetch("/discover/tv", {
      language: data?.language || _defaultLang,
      with_genres: "16,10762", // Animation, Kids
      sort_by: "popularity.desc",
    });
    return res.results;
  });

// ─── SEARCH (multi — movies + TV) ───

export const searchMulti = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: query }) => {
    const res = await tmdbFetch("/search/multi", {
      query,
      include_adult: "false",
    });
    return res.results;
  });

// Keep old name for backward compat
export const searchMovies = searchMulti;

// ─── DETAILS ───

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: id }) => {
    try {
      const data = await tmdbFetch(`/movie/${id}`, {
        append_to_response: "images,credits,videos,external_ids,release_dates",
      });

      // Fallback: if overview is missing in selected lang, try English
      if (!data.overview || data.overview === "") {
        const enData = await tmdbFetch(`/movie/${id}`, { language: "en-US" });
        data.overview = enData.overview;
      }

      return data;
    } catch (e: any) {
      if (e.message?.includes("404")) return null;
      throw e;
    }
  });

export const getTVDetails = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: id }) => {
    try {
      const data = await tmdbFetch(`/tv/${id}`, {
        append_to_response: "images,credits,videos,external_ids,content_ratings",
      });

      if (!data.overview || data.overview === "") {
        const enData = await tmdbFetch(`/tv/${id}`, { language: "en-US" });
        data.overview = enData.overview;
      }
      return data;
    } catch (e: any) {
      if (e.message?.includes("404")) return null;
      throw e;
    }
  });

// Season details with full episode list
export const getSeasonDetails = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ tvId: z.string(), season: z.number() }).parse(d))
  .handler(async ({ data }) => {
    return await tmdbFetch(`/tv/${data.tvId}/season/${data.season}`);
  });

// Generic discover endpoint for filtered browsing
const discoverInput = z.object({
  language: z.string().optional(),
  genre: z.string().optional(),
  sort: z.string().optional(),
  page: z.string().optional(),
  kidsOnly: z.boolean().optional(),
});

const KIDS_MOVIE_GENRES = new Set([16, 10751]); // Animation, Family
const KIDS_TV_GENRES = new Set([16, 10762]); // Animation, Kids

function parseGenreIds(raw?: string): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

export const discoverMovies = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => discoverInput.parse(d))
  .handler(async ({ data }) => {
    const params: Record<string, string> = {
      language: data.language || _defaultLang,
      sort_by: data.sort || "popularity.desc",
      page: data.page || "1",
      include_adult: "false",
    };

    if (data.kidsOnly) {
      const requestedGenres = parseGenreIds(data.genre).filter((id) => KIDS_MOVIE_GENRES.has(id));
      const safeGenres = requestedGenres.length > 0 ? requestedGenres : Array.from(KIDS_MOVIE_GENRES);
      params.with_genres = safeGenres.join(",");
      params.certification_country = "US";
      params["certification.lte"] = "PG";
    } else if (data.genre) {
      params.with_genres = data.genre;
    }

    const res = await tmdbFetch("/discover/movie", params);
    return { results: res.results, total_pages: res.total_pages };
  });

export const discoverTV = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => discoverInput.parse(d))
  .handler(async ({ data }) => {
    const params: Record<string, string> = {
      language: data.language || _defaultLang,
      sort_by: data.sort || "popularity.desc",
      page: data.page || "1",
      include_adult: "false",
    };

    if (data.kidsOnly) {
      const requestedGenres = parseGenreIds(data.genre).filter((id) => KIDS_TV_GENRES.has(id));
      const safeGenres = requestedGenres.length > 0 ? requestedGenres : Array.from(KIDS_TV_GENRES);
      params.with_genres = safeGenres.join(",");
    } else if (data.genre) {
      params.with_genres = data.genre;
    }

    const res = await tmdbFetch("/discover/tv", params);
    return { results: res.results, total_pages: res.total_pages };
  });

// Genre lists
export const getMovieGenres = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ kidsOnly: z.boolean().optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const response = await tmdbFetch("/genre/movie/list");
    if (data?.kidsOnly) {
      return (response.genres || []).filter((genre: { id: number }) => KIDS_MOVIE_GENRES.has(genre.id));
    }
    return response.genres;
  });

export const getTVGenres = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ kidsOnly: z.boolean().optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const response = await tmdbFetch("/genre/tv/list");
    if (data?.kidsOnly) {
      return (response.genres || []).filter((genre: { id: number }) => KIDS_TV_GENRES.has(genre.id));
    }
    return response.genres;
  });
