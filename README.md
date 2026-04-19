# ARC Cinematics Showcase

TanStack Start + Vite app for ARC Cinematics.

## Deployment (Vercel)

This project is configured for Vercel full-stack deployment using Nitro.

- Build command: `npm run build`
- The build script sets `NITRO_PRESET=vercel`.
- `vite.config.ts` disables Cloudflare build output and enables Nitro (`nitro/vite`).

## Local

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
