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

## Local

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
