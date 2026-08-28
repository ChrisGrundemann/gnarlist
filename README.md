# GnarList

A public, free website that maps and calendars **active Colorado ultramarathons** — filterable by
format, distance, region, and month.

**Live at [gnarlist.co](https://gnarlist.co).**

It grows out of two hand-researched static posters (a "Colorado Ultra Season" calendar and a
"Colorado Ultra Map"). This site generalizes those two fixed views into an interactive, filterable,
shareable tool; the dataset behind it has since grown from 75 records at Phase 1 to 102.

**Current status: Phases 1–5 built.** All 102 events render in three views — a seasonally-sorted
list, a twelve-month calendar with per-month day timelines, and an interactive clustered map — each
filterable by format, distance, region and month (plus a separate sub-50K toggle), with filter state
in the URL so any view can be shared, bookmarked, and carried across to the other two. Every event
also has a permalink page at `/races/<slug>/`.

**Done, most recently:** the design/colour sweep that was held back until the map existed. Every
colour pairing on all four surfaces is now WCAG 2.1 AA compliant against measured ratios rather than
eyeballed ones (`node scripts/contrast-audit.mjs`), the condensed display face is self-hosted Oswald
instead of whatever was installed locally, and the filter pane collapses on desktop as well as on a
phone. Full ratio tables and the reasoning are in ARCHITECTURE.md §7 item 6.

**Next up:** the rest of Phase 6 — mobile polish and basic search.

📐 **[ARCHITECTURE.md](./ARCHITECTURE.md) is the source of truth** for architectural decisions,
the phased build plan, and what's deliberately out of scope. Read it before making changes.
[SCHEMA.md](./SCHEMA.md) documents the data model.

## Stack

| | |
|---|---|
| Framework | [Astro](https://astro.build) — static output, no SSR adapter |
| Hosting | Cloudflare (Workers static assets), auto-deploy on push to `main` |
| Data | Static JSON in the repo (`data/races.json`), read at build time |
| Map | [Leaflet](https://leafletjs.com) + `leaflet.markercluster`, over free OpenStreetMap tiles darkened in CSS — no API key (ARCHITECTURE.md §2.2) |
| Discoverability | `@astrojs/sitemap`, JSON-LD `SportsEvent` on every permalink, `public/robots.txt` |
| Type | Oswald, self-hosted (SIL OFL 1.1) — one 21 KB variable woff2, latin subset, no third-party font request |
| Accessibility | WCAG 2.1 AA contrast, verified from rendered pixels by `scripts/contrast-audit.mjs` |

## Pages

Three views over one dataset, plus a page per event.

| Path | What it is |
|---|---|
| `/` | Every event in one Jan→Dec run, grouped by month |
| `/calendar/` | Twelve month boxes, each with a day timeline showing when races actually fall (plus a thirteenth for the one record with no date at all) |
| `/map/` | Clustered Leaflet map plus a region-grouped index; honest about town-level coordinates |
| `/races/<slug>/` | The full record for one event |

Filters are one engine (`src/lib/filters.ts`) shared by all three views, and filter state travels
between them in the query string.

## Layout

```
ARCHITECTURE.md              Architectural decisions & phased plan — read first
SCHEMA.md                    Data model documentation
Colorado_Ultramarathons.xlsx Hand-verified source spreadsheet (provenance)
data/races.json              Canonical dataset (102 events) — hand-maintained; see note below
scripts/generate_races.py    Phase 1 conversion — historical, do NOT re-run (see header)
scripts/geocode.py           Nominatim lookup helper — an operator tool; never writes to the dataset
scripts/contrast-audit.mjs   WCAG AA audit of the built site — serves dist/, drives headless Chrome
astro.config.mjs             Static output, canonical site URL, sitemap integration
wrangler.jsonc               Cloudflare Workers deploy config (assets-only — no `main` entry)
public/                      Favicons, robots.txt, and fonts/ (Oswald woff2 + its OFL licence)
src/pages/                   index (list), calendar, map, races/[slug]
src/layouts/Base.astro       <head>, canonical/OG tags, named `head` slot for JSON-LD
src/components/              FilterBar, ViewSwitch, and one row/cell component per view
src/lib/                     Build-time: filters, races, timeline, map, map-data, structured-data
src/scripts/                 Browser islands: filter-client, calendar-timeline, map-client, race-back
src/styles/                  global.css (design tokens) + map.css (marker language, Leaflet theme)
```

## Develop

Requires Node ≥ 22.12 (pinned in `.nvmrc`).

```sh
npm install
npm run dev      # local dev server at http://localhost:4321
npm run check    # astro check — TypeScript/Astro diagnostics
npm run build    # astro check && astro build → dist/ (105 pages: 3 views + 102 permalinks)
npm run preview  # serve the built dist/ locally
```

Deploys run automatically on push to `main` via Cloudflare Workers Builds. To deploy by hand:
`npx wrangler deploy`.

`npm run check` is wired up and **`npm run build` gates on it** — a type error fails the build and
emits no `dist/`, so Workers Builds fails and the previous deploy stays live. `build:no-check` is the
escape hatch for an urgent content fix. Note this only enforces anything if the Cloudflare dashboard's
build command is `npm run build`; pointing it at `astro build` bypasses the gate silently.

**Verifying a change:** a green build is necessary but not sufficient. This project has repeatedly
shipped bugs a passing build was perfectly happy with — a collapsed CSS content box, silently wrong
event spans, watermarked map tiles. Look at the rendered page.

## Data changes

The dataset is edited **by pull request, not in place** — see ARCHITECTURE.md §5. A PR diff on
`data/races.json` is reviewable; a silent overwrite isn't. That review step has already caught real
research errors: a mountain bike race and a running-but-not-ultra race, both listed by aggregators
as running ultras and both removed. A third never made it in — an Arizona event that aggregators
place in Colorado, on a name collision with a Colorado mountain — which is why §5.3 says an
aggregator's location field is derived data, not sourced data.

## License

**No license file, deliberately** — default copyright applies, all rights reserved, for the code and
for `data/races.json` alike. This is an intentional decision rather than an oversight. Note that facts
(race names, dates, locations, distances) aren't copyrightable regardless of licensing; only the specific
compilation and the original writing are. Not legal advice.
