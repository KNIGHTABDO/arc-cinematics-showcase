# ARC Cinematics Showcase

TanStack Start + Vite app for ARC Cinematics.

## Deployment (Vercel)

This project is configured for Vercel full-stack deployment using Nitro.

- Build command: `npm run build`
- The build script sets `NITRO_PRESET=vercel`.
- `vite.config.ts` disables Cloudflare build output and enables Nitro (`nitro/vite`).

## Streaming resolver telemetry (Supabase)

Resolver diagnostics are now persisted (when Supabase env is present) to:

- table: `public.stream_resolver_attempts`
- view: `public.stream_health_recent`

Run migration:

```sql
-- supabase/migrations/20260419013000_add_stream_resolver_telemetry.sql
```

Then you can query recent health quickly:

```sql
select * from public.stream_health_recent limit 50;
```

## 2026-04-19 hardening updates

- TV streaming resolver is now more fault-tolerant when Real-Debrid provides multiple links for a selected torrent file:
  - tries preferred selected-file link first, then falls back through remaining links
  - validates each unrestrict result with preflight before returning
  - supports plain-GET preflight fallback when byte-range probes are blocked by provider/CDN
  - if unrestrict succeeds but server probes are blocked, returns the first unrestricted URL as a playable fallback instead of failing
  - returns additional unrestricted RD fallback URLs (`backupStreams`) so the player can auto-switch if the first host stalls
- Watch player now auto-fails over to `backupStreams` on media element error (instead of staying stuck at `0:00`).
- Watch player now supports manual quality preference (`Auto`, `2160p`, `1080p`, `720p`, `480p`) and re-resolves stream candidates using that preference.
- Resolver now strongly favors browser-compatible AVC/x264 candidates over HEVC/x265 when quality is similar, to reduce iPhone/Safari `0:00` stalls.
- Resolver now accepts a client profile and applies iOS Safari-specific container bias (penalizes MKV/Matroska, boosts MP4/M4V).
- Target-file selection now prefers browser-friendly containers (MP4/M4V/MOV) before bytes-based fallback to reduce unsupported container picks.
- Optional iOS quality hardening flags are available for safe rollout (`VITE_IOS_QUALITY_HARDENING_ENABLED`, `VITE_IOS_QUALITY_HARDENING_REJECT_TRASH`, `VITE_IOS_QUALITY_MIN_BYTES_1080`, `VITE_IOS_QUALITY_MIN_BYTES_720`):
  - when enabled for iOS profile, resolver hard-rejects obvious trash tags (`cam/hdcam/ts/hdts/telesync/workprint`),
  - enforces minimum bytes floors for advertised `1080p`/`720p` files,
  - emits explicit `IOS_NO_ACCEPTABLE_QUALITY` error instead of silently returning low-grade streams,
  - records reject reasons in resolver diagnostics for postmortem debugging.
- Subtitle pipeline now uses server-side SubDL search + conversion for both movies and TV episodes (with `season_number`/`episode_number`), then mounts blob-backed VTT tracks.
- Player `<video>` now sets `crossOrigin="anonymous"` to satisfy Safari/WebKit text-track rendering rules.
- Kids profile protections are enforced on browse/discover/search/detail/watch flows to prevent direct-link bypass.
- Continue Watching now rebinds to the active profile ID, reducing cross-profile stale rows.

## Local

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
