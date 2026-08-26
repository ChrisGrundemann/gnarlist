# Colorado Ultra — Architecture & Build Plan

*Reference document. Written to keep every future prompt, session, and contributor (human or Claude) working from the same plan instead of re-deriving it. Update this file when a real architectural decision changes; don't let it drift out of sync with reality.*

---

## 1. What this project is

A public, free website that visualizes active Colorado ultramarathons — filterable by format, distance, region, and date — with calendar and map views as the primary ways to browse. It grows out of two static posters (a "Colorado Ultra Season" calendar and a "Colorado Ultra Map") built from a hand-verified research dataset of ~70 events. The website generalizes those two fixed views into an interactive, filterable, shareable tool, and opens the door to more (elevation profiles, community contributions) as later phases.

**Audience:** Colorado ultrarunners planning a season, race-curious trail runners browsing options, and (secondarily) race directors checking how their event is represented.

**Working convention across sessions:** Claude Code should commit locally as it works, but should not push to the remote. The user reviews and pushes manually once a session's work is complete. State this explicitly in every prompt handed to Claude Code — don't rely on it being remembered from a prior session.

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
- **Hosting/deploy:** Cloudflare Pages, connected to the GitHub repo for automatic deploys on push/merge to main. **Note for future sessions:** the git-push-triggers-deploy behavior specifically requires authorizing the Cloudflare GitHub App through the Cloudflare dashboard (OAuth, dashboard-only) — this is true regardless of whether `wrangler` CLI is installed/authenticated locally. `wrangler pages project create` makes a direct-upload project, which does not auto-deploy on push. Don't re-investigate wrangler as a way to automate this connection; it's a one-time manual dashboard step, confirmed against Cloudflare's docs during Phase 2.
- **Domain:** **gnarlist.co** is canonical for now — "GnarList," `.co` read as "Colorado," matching the site's current CO-only scope. Also registered: `gnarlist.run`, `gnarlist.racing`, `thegnarlist.com` — set these up as redirects to the canonical domain once there's something live worth pointing them at (Cloudflare handles multi-domain redirects natively). **Explicitly deferred out of Phase 2** — connecting any real domain (canonical or redirects) requires registrar-level DNS action tied to the user's accounts, which is outside what a Claude Code session can do; revisit once the initial Cloudflare Pages deploy is live. `thegnarlist.com` is reserved as the likely future canonical domain if/when the project expands beyond Colorado — that's a deliberate rename to revisit later, not a decision to make now.

---

## 3. Tech stack

**Decided: Astro**, chosen and scaffolded during Phase 2. Reasoning: static export is Astro's native mode rather than a constrained bolt-on mode of a server-first framework (the case for both Next.js static export and SvelteKit's static adapter); its islands architecture fits this project's actual shape well — Phases 4–5 need genuinely interactive pieces (calendar, Leaflet map) sitting inside an otherwise mostly-static site, and Astro ships JS only to the components that need it rather than a full framework runtime to every page. Verified: the Phase 2 placeholder page builds to zero shipped JavaScript.

Node version pinned via `.nvmrc` (Node 22, required by Astro 7) to avoid a build-image mismatch on Cloudflare Pages.

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
- **Expanding scope beyond ultramarathons to all Colorado trail races.** Not a v1 goal, but flagged as a real possible future direction, not a hard boundary — the dataset currently includes borderline-sub-ultra events (30K, 32mi) that run alongside true ultras, which was a deliberate inclusive choice made with this possible expansion in mind. If pursued, this would be a significant scope change (naming, schema, data volume) and deserves its own planning pass, not a quiet scope-creep into one session.

---

## 7. Phased build plan

Each phase becomes one or more Claude Code prompts, built and reviewed iteratively.

1. **Data foundation** — convert the verified spreadsheet into the real schema (§4): add coordinates, normalize distance fields, generate slugs, encode status/marquee/region. Mostly a data-decisions step, human-directed with Claude Code executing. **Status: complete.** `SCHEMA.md` approved, `data/races.json` built (75 records: 71 active, 2 returning, 1 discontinued, 1 unverified), validated clean (no duplicate slugs, no missing required fields, no missing coordinates, marquee list matches the approved 14).
2. **Project scaffold** — repo init, framework choice (§3), Cloudflare Pages deploy pipeline, a live "hello world" placeholder page. Proves the plumbing before building features on it. **Status: mostly complete.** Astro scaffolded, `.gitignore` and `.nvmrc` in place, README and a license file added (license choice itself still unresolved — see §8), placeholder page builds from `data/races.json` at build time with zero shipped JS. **Remaining:** user completes the manual Cloudflare dashboard connection (steps provided by Claude Code), confirms the live `.pages.dev` URL renders correctly, sets `site` in `astro.config.mjs` once that URL exists (needed for sitemaps/canonical tags — currently a commented-out TODO).
3. **List/table view + core filters** — format, distance, region, month. The simplest useful version of the site; validates the data layer end-to-end.
4. **Calendar view** — interactive, filterable, click-through to event detail. Generalizes the static poster.
5. **Map view** — interactive Leaflet map (§2.2), filterable, real zoom-based clustering instead of manual insets.
6. **Event detail pages + polish** — permalinks, shareable filtered URLs, mobile responsiveness, basic search.
7. **Data maintenance workflow** — a semi-automated research-assistant tool that checks known sources per event on a schedule and proposes a PR for human review (§5.4). Deferred until after the site itself is live — no point maintaining a site that doesn't exist yet.
8. **Stretch phases** — elevation profiles/difficulty scoring (pending new data sourcing, §6); community submissions (pending D1 + Pages Functions build-out, §2.3).

---

## 8. Open items / revisit later

- **Licensing — unresolved, needs a real decision.** Two separate questions: (1) code license (currently has an MIT file added during Phase 2 scaffold, but the user is reconsidering — may prefer no license file at all, i.e. default all-rights-reserved, over permissive open-source); (2) data license for `races.json` separately (CC BY / CC0 / none). These don't have to match each other. Note: facts (race names, dates, locations, distances) aren't copyrightable regardless of license choice — only the specific compilation and original writing (notes/descriptions) are protectable. Not legal advice; consult a lawyer if this ever matters commercially. **Action:** resolve and update this repo's license file(s) accordingly before public launch.
- Redirect setup for `gnarlist.run` / `gnarlist.racing` / `thegnarlist.com` → `gnarlist.co` — see §2.4, deferred until there's a live deploy worth pointing a domain at.
- Whether/when to build the Phase 7 data-maintenance tooling and Phase 8 stretch items — revisit once the core site (Phases 1–6) is live and real usage patterns exist.
- Sanity-check "GnarList" naming against Gnar Runners (a race organizer already in the dataset) before public launch — low-confidence concern, probably fine, worth a glance rather than a deep dive.
