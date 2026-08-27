// @ts-check
import sitemap from '@astrojs/sitemap';
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

  integrations: [
    /*
     * Emits sitemap-index.xml + sitemap-0.xml over every built page: the list
     * view, the calendar, and all 102 event permalinks. public/robots.txt
     * points at the index.
     *
     * No `filter`. Discontinued and unverified events are in the sitemap on
     * purpose — see ARCHITECTURE.md §4's counting rule, which is explicitly a
     * counting rule and not a visibility one. Dropping those pages here would
     * quietly turn it into a discoverability rule, which is the merge that
     * section warns against.
     *
     * No `changefreq` or `priority` either. Google has stated it ignores both;
     * emitting them would be 104 lines of decoration that read as signal.
     */
    sitemap(),
  ],
});
