# Changelog

## 2026-04-19
- Fix Vercel 404 `NOT_FOUND` deployment issue by switching TanStack Start build to Nitro for Vercel.
- Disable Cloudflare build plugin in `vite.config.ts` for Vercel deployment path.
- Update build script to `NITRO_PRESET=vercel vite build`.
