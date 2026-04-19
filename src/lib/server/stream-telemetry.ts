import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ResolverDiagnostics } from "./streams";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
}

function normalizeDiagnostics(d: ResolverDiagnostics) {
  return {
    watch_id: d.watchId,
    media_type: d.mediaType,
    tmdb_id: d.tmdbId,
    imdb_id: d.imdbId ?? null,
    candidate_count: d.candidateCount,
    selected_info_hash: d.selected?.infoHash ?? null,
    selected_torrent_id: d.selected?.torrentId ?? null,
    selected_file_id: d.selected?.selectedFile?.id ?? null,
    selected_file_path: d.selected?.selectedFile?.path ?? null,
    selected_file_bytes: d.selected?.selectedFile?.bytes ?? null,
    attempts: d.attempts,
    success: Boolean(d.selected?.torrentId),
  };
}

export const logStreamResolverDiagnostics = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as ResolverDiagnostics)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();
    if (!client) return { ok: false, skipped: true, reason: "SUPABASE_ENV_MISSING" };

    const payload = normalizeDiagnostics(data);
    const { error } = await client.from("stream_resolver_attempts").insert(payload);

    if (error) {
      console.error("[ARC_STREAM_TELEMETRY] insert error", error.message);
      return { ok: false, skipped: false, error: error.message };
    }

    return { ok: true, skipped: false };
  });

const streamHealthInput = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    mediaType: z.enum(["movie", "tv"]).optional(),
  })
  .optional();

export const getStreamHealth = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => streamHealthInput.parse(d))
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();
    if (!client) return { ok: false, reason: "SUPABASE_ENV_MISSING" };

    const limit = data?.limit ?? 50;
    let query = client
      .from("stream_health_recent")
      .select("*")
      .order("resolved_at", { ascending: false })
      .limit(limit);

    if (data?.mediaType) {
      query = query.eq("media_type", data.mediaType);
    }

    const { data: rows, error } = await query;
    if (error) return { ok: false, reason: error.message };

    return { ok: true, rows: rows ?? [] };
  });
