// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
//
// This project deploys to Vercel, so we:
//   1) disable Cloudflare build output
//   2) add Nitro for Vercel-compatible full-stack output
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  plugins: [nitro()],
  server: {
    proxy: {
      "/mfproxy": {
        target: "http://84.8.216.60:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mfproxy/, ""),
      },
    },
  },
});
