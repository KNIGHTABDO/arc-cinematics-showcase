# Changelog

## 2026-04-19

- Fix Vercel 404 `NOT_FOUND` deployment issue by switching TanStack Start build to Nitro for Vercel.
- Disable Cloudflare build plugin in `vite.config.ts` for Vercel deployment path.
- Update build script to `NITRO_PRESET=vercel vite build`.
- Harden stream resolver with ranked multi-candidate fallback, TV episode-aware file selection, stream preflight checks, and structured diagnostics.
- Improve Real-Debrid downloaded-link handling: after file selection, resolver now retries all available RD links (preferred first) and returns the first link that passes unrestrict + preflight.
- Relax preflight strictness for providers/CDNs that reject range probes by adding a plain-GET fallback probe.
- If unrestrict succeeds but both server-side probes are blocked, resolver now returns the first unrestricted URL fallback instead of hard-failing, matching real player behavior better.
- Return `backupStreams` as additional unrestricted RD URLs per selected torrent so the player can fail over at runtime.
- Add quality-aware ranking preference (`auto/2160/1080/720/480`) to stream candidate scoring and pass selected quality from `/watch/$id`.
- Increase browser-compatibility weighting to prefer AVC/x264 streams over HEVC/x265 for equivalent quality, improving iPhone Safari playback reliability.
- Watch player now supports a manual quality menu and retries resolver with the selected preference.
- Watch player now switches to next backup stream URL on `<video>` error to avoid indefinite `0:00` stalls.
- Add iOS Safari-aware resolver profile (`clientProfile`) so candidate ranking can apply container-specific penalties.
- Penalize MKV/Matroska and boost MP4/M4V for iOS Safari clients during candidate scoring.
- File selection now prefers browser-friendly containers (MP4/M4V/MOV) over MKV before bytes tie-breaks for both TV and movie flows.
- Replace direct client subtitle API calls with server subtitle pipeline for both movie and TV:
  - include `season_number` + `episode_number` for TV subtitle queries,
  - normalize subtitle URLs and convert to WebVTT server-side,
  - render subtitles via blob-backed VTT track in player.
- Add `crossOrigin="anonymous"` to player video element to satisfy strict Safari text-track rendering requirements.
- Add/expand resolver utility tests for TV file-index mapping fallbacks (`array index`, `file id`, and `file id + 1`), iOS Safari MKV bias, and browser-friendly container preference.
- Add Supabase-backed stream resolver telemetry (`stream_resolver_attempts`) and health view (`stream_health_recent`).
- Enforce kids-profile content restrictions across Movies, Series, Discover, Search, title details, TV details, and watch playback entry.
- Scope Continue Watching refresh to the active profile and ensure TV entries route correctly to `/watch/$id`.
