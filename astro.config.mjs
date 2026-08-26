// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static export only — no Node server, no SSR adapter.
  // Required by ARCHITECTURE.md §3; `astro build` emits plain files to dist/,
  // which is exactly what Cloudflare Pages serves.
  output: 'static',

  // Deployed URL. Needed for absolute URLs, sitemap, and canonical tags.
  // Update to 'https://gnarlist.co' when the canonical domain is connected
  // (deferred — see ARCHITECTURE.md §2.4).
  site: 'https://gnarlist.cgrundemann.workers.dev',
});
