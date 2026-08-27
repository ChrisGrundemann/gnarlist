// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static export only — no Node server, no SSR adapter.
  // Required by ARCHITECTURE.md §3; `astro build` emits plain files to dist/,
  // which is exactly what Cloudflare Pages serves.
  output: 'static',

  // Deployed URL. Needed for absolute URLs, sitemap, and canonical tags.
  // The canonical domain is live (ARCHITECTURE.md §2.4) — Cloudflare Custom
  // Domain on the Worker. The workers.dev URL still resolves and still serves
  // the same Worker, so per-event permalinks (Phase 4) would otherwise emit
  // canonical tags pointing at a hostname we don't want indexed.
  site: 'https://gnarlist.co',
});
