# GnarList

A public, free website that maps and calendars **active Colorado ultramarathons** — filterable by
format, distance, region, and date.

It grows out of two hand-researched static posters (a "Colorado Ultra Season" calendar and a
"Colorado Ultra Map") built from a verified dataset of ~75 events. This site generalizes those two
fixed views into an interactive, filterable, shareable tool.

**Current status: Phase 3 complete (list view + filters).** All 90 events render as a filterable,
seasonally-sorted list — by format, distance, region and month — with filter state in the URL so any
view can be shared or bookmarked. Calendar and map views come in Phases 4–5.

📐 **[ARCHITECTURE.md](./ARCHITECTURE.md) is the source of truth** for architectural decisions,
the phased build plan, and what's deliberately out of scope. Read it before making changes.
[SCHEMA.md](./SCHEMA.md) documents the data model.

## Stack

| | |
|---|---|
| Framework | [Astro](https://astro.build) — static output, no SSR adapter |
| Hosting | Cloudflare (Workers static assets), auto-deploy on push to `main` |
| Data | Static JSON in the repo (`data/races.json`), read at build time |
| Map (Phase 5) | Leaflet + free OSM-derived tiles |

## Layout

```
ARCHITECTURE.md              Architectural decisions & phased plan — read first
SCHEMA.md                    Data model documentation
Colorado_Ultramarathons.xlsx Hand-verified source spreadsheet (provenance)
data/races.json              Canonical dataset (90 events) — hand-maintained; see note below
scripts/generate_races.py    Phase 1 conversion — historical, do NOT re-run (see header)
scripts/geocode.py           Coordinate lookup helper
src/pages/                   Astro pages
```

## Develop

Requires Node ≥ 22.12.

```sh
npm install
npm run dev      # local dev server at http://localhost:4321
npm run build    # static build → dist/
npm run preview  # serve the built dist/ locally
```

## Data changes

The dataset is edited **by pull request, not in place** — see ARCHITECTURE.md §5. A PR diff on
`data/races.json` is reviewable; a silent overwrite isn't. This project has already caught several
real research errors (a mountain bike race and a non-ultra race, both miscategorized as running
ultras) through exactly that review step.

## License

**Not yet decided.** This repo intentionally carries no license file for now, which means default
copyright applies — all rights reserved. Licensing (for the code and for the dataset, which may
warrant different terms) is an open question to settle before public launch.
