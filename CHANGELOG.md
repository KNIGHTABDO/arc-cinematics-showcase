# Changelog

## 2026-04-19

- Fix Vercel 404 `NOT_FOUND` deployment issue by switching TanStack Start build to Nitro for Vercel.
- Disable Cloudflare build plugin in `vite.config.ts` for Vercel deployment path.
- Update build script to `NITRO_PRESET=vercel vite build`.
- Harden stream resolver with ranked multi-candidate fallback, TV episode-aware file selection, stream preflight checks, and structured diagnostics.
- Improve Real-Debrid downloaded-link handling: after file selection, resolver now retries all available RD links (preferred first) and returns the first link that passes unrestrict + preflight.
- Relax preflight strictness for providers/CDNs that reject range probes by adding a plain-GET fallback probe.
- If unrestrict succeeds but both server-side probes are blocked, resolver now returns the first unrestricted URL fallback instead of hard-failing, matching real player behavior better.
- Add/expand resolver utility tests for TV file-index mapping fallbacks (`array index`, `file id`, and `file id + 1`).
- Add Supabase-backed stream resolver telemetry (`stream_resolver_attempts`) and health view (`stream_health_recent`).
- Enforce kids-profile content restrictions across Movies, Series, Discover, Search, title details, TV details, and watch playback entry.
- Scope Continue Watching refresh to the active profile and ensure TV entries route correctly to `/watch/$id`.
