# Colorado Ultra — Architecture & Build Plan

*Reference document. Written to keep every future prompt, session, and contributor (human or Claude) working from the same plan instead of re-deriving it. Update this file when a real architectural decision changes; don't let it drift out of sync with reality.*

---

## 1. What this project is

A public, free website that visualizes active Colorado ultramarathons — filterable by format, distance, region, and date — with calendar and map views as the primary ways to browse. It grows out of two static posters (a "Colorado Ultra Season" calendar and a "Colorado Ultra Map") built from a hand-verified research dataset of ~70 events. The website generalizes those two fixed views into an interactive, filterable, shareable tool, and opens the door to more (elevation profiles, community contributions) as later phases.

**Audience:** Colorado ultrarunners planning a season, race-curious trail runners browsing options, and (secondarily) race directors checking how their event is represented.

---

## 2. Core architectural decisions

These were deliberated explicitly and shouldn't be silently re-opened by a future prompt without a real reason. Each includes the reasoning, not just the conclusion.

### 2.1 Static data, not a live database (for MVP)

**Decision:** The canonical race dataset lives as structured JSON/YAML files inside the GitHub repo, not in a hosted database. The site is a static site, generated at build time from those files. All filtering (format, distance, region, date) happens client-side in the visitor's browser against data that's already loaded — no server-side queries.

**Why:** The dataset is small (~70 records) and changes infrequently (a handful of corrections or additions per season, not per minute) — a live database solves a scale/write-frequency problem this project doesn't have. Git gives us free version history and pull-request review for every data change, which matters concretely: this project has already caught multiple real research errors (a mislabeled MTB race, a non-ultra event, a bikepacking race miscategorized as a running ultra) through manual review. A PR diff is easy to sanity-check; a silent database UPDATE is not. Static hosting (Cloudflare Pages) is also free and effectively zero-maintenance compared to running and securing a database server.

**Explicitly not a wall:** The data layer and the UI components (calendar, map, filters) talk to each other through one narrow interface — "give me the race data." Today that's answered by reading a local file at build time. If/when the project needs live writes (see 2.3), that answer can change to "fetch from an API" without the calendar/map/filter components themselves needing to change.

**Future upgrade path, if/when needed:** Cloudflare D1 (serverless SQLite) plus Cloudflare Pages Functions. Chosen in advance so this isn't re-litigated later: it lives on the same platform as hosting (no second vendor/bill to manage) and has a generous free tier.

### 2.2 Map: Leaflet + free OpenStreetMap-based tiles

**Decision:** Interactive map built with Leaflet (free, open-source JS mapping library), using free OSM-derived tiles (e.g. via CARTO's basemap styles) rather than Mapbox.

**Why:** No API key, no billing tier to hit, well-documented/standard combination. A real pan-and-zoom map also structurally solves the geographic clustering problem the static poster had to work around with insets and leader lines (San Juans, Colorado Springs) — a visitor can just zoom into a cluster instead of us pre-designing an inset for it.

**Not a permanent lock-in:** Swapping tile providers later (e.g. to Mapbox GL JS for nicer vector rendering) is a contained change to one component, not a data-layer or architecture change. Revisit only if the free tiles ever feel visually limiting.

### 2.3 Read-only MVP; community features are a planned (not promised) phase

**Decision:** V1 has no user accounts, submissions, comments, or corrections from the public. It's a read-only visualization of a maintained dataset.

**Why:** Keeps the MVP scope honest and shippable. The static-data + Cloudflare stack (2.1) was chosen specifically so this door stays open cheaply: adding community submissions later means adding Cloudflare D1 + Pages Functions (for storing/moderating submissions) without touching the core site architecture.

### 2.4 Hosting & repo

- **Code + data:** GitHub (public repo).
- **Hosting/deploy:** Cloudflare Pages, connected to the GitHub repo for automatic deploys on push/merge to main.
- **Domain:** custom domain to be sourced separately (owner-provided); Cloudflare Pages' free subdomain is the fallback until then.

---

## 3. Tech stack (framework choice deferred to Prompt #1)

Deliberately not locked in here — this is exactly the kind of decision to let Claude Code make within stated constraints, per the working style for this project. Constraints for that decision:
- Must produce a **static site** deployable to Cloudflare Pages (static export, not a Node server).
- Must support component-based UI (for calendar, map, filter panel, event detail views).
- Reasonable, well-documented options: Astro, Next.js (static export), SvelteKit (static adapter). Claude Code should pick one and state why in Prompt #1's output, not silently default.

---

## 4. Data model (high-level; finalized in Prompt #1)

The existing spreadsheet/poster data needs to become a real schema. At minimum, each event needs:

- Stable unique `slug` (for shareable permalinks, e.g. `/races/hardrock-100`)
- Name, organizing entity
- **Real coordinates** (lat/long) — this is new; the posters used region/town-level placement only, which isn't precise enough for an actual interactive map
- Location (town, county)
- Normalized numeric distance field(s) — not just a display string like "50mi/100K," but sortable/filterable data (e.g. an array of `{label, miles}` per distance offered, plus a `longest_distance_miles` field for badge/color coding)
- Format/type (standard ultra, backyard/timed, stage race, self-supported) — carried forward from the poster work
- Date info: month, day(s), and a flag for whether the date is confirmed vs. approximate/TBD
- Year started (where known)
- Status (active / cancelled-expected-return / discontinued / unverified) — carried forward from the "Flagged Events" tab work; cancelled-but-returning events (e.g. Ouray 100, Leadville Silver Rush 50) should render normally with a small status note, matching how the posters handled them
- Marquee flag (★) — carried forward from the poster tiering system
- Region (for the regional groupings used throughout: San Juans, Front Range/Colorado Springs, Denver Metro, Estes Park, Mountains/Western Slope, Fairplay/South Park, Southern Colorado)
- Notes/hook fact, source(s)

**Deferred field, not in v1:** elevation profile / total gain data. See §6.

---

## 5. Data governance principles (carried forward from this project's research phase)

These are hard-won and should inform both the data schema and the eventual maintenance workflow:

1. **Don't trust a single aggregator.** UltraSignup, RunningInTheUSA, RunGuides, etc. each carry stale, duplicate, or misclassified entries. Cross-reference against the race's own organizer site before trusting a listing.
2. **"Not confirmed" is a legitimate data state, not a gap to hide.** Several fields (year started, exact date) are genuinely unconfirmed for some events — the schema and UI should be able to represent that honestly rather than forcing a guess.
3. **Format/category errors are the most dangerous kind.** This project has caught a mountain bike race (Colorado Trail Race) and a running-but-not-ultra race (Louisville Trail Races) both miscategorized as active running ultramarathons. Any automated or semi-automated data collection should flag category/format for human confirmation, not just date/location changes.
4. **Prefer PR-based review over silent overwrites** for any data update, automated or manual, at least until the process has a long track record.

---

## 6. Explicitly deferred / non-goals for MVP

Naming these now so future sessions don't quietly scope-creep or, conversely, feel obligated to promise them early:

- **Elevation profiles / total gain filtering.** We don't have this data yet. Sourcing it (GPX files, organizer course pages, Strava segments) is its own research project — scoped as a later phase, not v1.
- **Live database / write backend.** See §2.1 and §2.3 — planned upgrade path, not built until there's an actual feature that needs it.
- **User accounts, submissions, comments.** See §2.3.
- **Automated/unattended scraping that writes directly to the dataset.** See §5.3 — any collector tooling should propose changes for review, not auto-commit.

---

## 7. Phased build plan

Each phase becomes one or more Claude Code prompts, built and reviewed iteratively.

1. **Data foundation** — convert the verified spreadsheet into the real schema (§4): add coordinates, normalize distance fields, generate slugs, encode status/marquee/region. Mostly a data-decisions step, human-directed with Claude Code executing.
2. **Project scaffold** — repo init, framework choice (§3), Cloudflare Pages deploy pipeline, a live "hello world" placeholder page. Proves the plumbing before building features on it.
3. **List/table view + core filters** — format, distance, region, month. The simplest useful version of the site; validates the data layer end-to-end.
4. **Calendar view** — interactive, filterable, click-through to event detail. Generalizes the static poster.
5. **Map view** — interactive Leaflet map (§2.2), filterable, real zoom-based clustering instead of manual insets.
6. **Event detail pages + polish** — permalinks, shareable filtered URLs, mobile responsiveness, basic search.
7. **Data maintenance workflow** — a semi-automated research-assistant tool that checks known sources per event on a schedule and proposes a PR for human review (§5.4). Deferred until after the site itself is live — no point maintaining a site that doesn't exist yet.
8. **Stretch phases** — elevation profiles/difficulty scoring (pending new data sourcing, §6); community submissions (pending D1 + Pages Functions build-out, §2.3).

---

## 8. Open items / revisit later

- Domain name (owner sourcing separately).
- Final framework choice (Prompt #1).
- Exact schema field names/types (Prompt #1).
- Whether/when to build the Phase 7 data-maintenance tooling and Phase 8 stretch items — revisit once the core site (Phases 1–6) is live and real usage patterns exist.
