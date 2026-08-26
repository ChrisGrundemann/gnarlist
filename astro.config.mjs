// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static export only — no Node server, no SSR adapter.
  // Required by ARCHITECTURE.md §3; `astro build` emits plain files to dist/,
  // which is exactly what Cloudflare Pages serves.
  output: 'static',

  // TODO (Phase 2 follow-up): set `site` to the canonical URL once the
  // Cloudflare Pages project exists (e.g. 'https://gnarlist.pages.dev', later
  // 'https://gnarlist.co'). Needed for absolute URLs, sitemap, and canonical
  // tags — not needed for the placeholder page to build or deploy.
  // site: 'https://gnarlist.co',
});
