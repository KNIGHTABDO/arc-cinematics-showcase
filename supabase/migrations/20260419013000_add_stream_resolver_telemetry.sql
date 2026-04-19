-- Stream resolver telemetry + health view
-- Run in Supabase SQL editor (safe to re-run)

create extension if not exists pgcrypto;

create table if not exists public.stream_resolver_attempts (
  id uuid primary key default gen_random_uuid(),
  watch_id text not null,
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id text not null,
  imdb_id text,
  candidate_count integer not null default 0,
  success boolean not null default false,

  selected_info_hash text,
  selected_torrent_id text,
  selected_file_id integer,
  selected_file_path text,
  selected_file_bytes bigint,

  attempts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_stream_resolver_attempts_created_at
  on public.stream_resolver_attempts (created_at desc);

create index if not exists idx_stream_resolver_attempts_media_type_created_at
  on public.stream_resolver_attempts (media_type, created_at desc);

create index if not exists idx_stream_resolver_attempts_success_created_at
  on public.stream_resolver_attempts (success, created_at desc);

create index if not exists idx_stream_resolver_attempts_watch_id
  on public.stream_resolver_attempts (watch_id);

alter table public.stream_resolver_attempts enable row level security;

-- App users should not be able to read internal telemetry by default.
drop policy if exists "No client access to stream_resolver_attempts" on public.stream_resolver_attempts;
create policy "No client access to stream_resolver_attempts"
on public.stream_resolver_attempts
for all
using (false)
with check (false);

create or replace view public.stream_health_recent as
select
  s.id,
  s.created_at as resolved_at,
  s.watch_id,
  s.media_type,
  s.tmdb_id,
  s.imdb_id,
  s.success,
  s.candidate_count,
  s.selected_info_hash,
  s.selected_file_path,
  s.selected_file_bytes,
  coalesce((s.attempts->(jsonb_array_length(s.attempts)-1)->>'errorCode'), null) as last_error_code,
  jsonb_array_length(s.attempts) as attempts_count
from public.stream_resolver_attempts s
order by s.created_at desc;
