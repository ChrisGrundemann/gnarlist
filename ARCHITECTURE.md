# Colorado Ultra — Architecture & Build Plan

*Reference document. Written to keep every future prompt, session, and contributor (human or Claude) working from the same plan instead of re-deriving it. Update this file when a real architectural decision changes; don't let it drift out of sync with reality.*

---

## 1. What this project is

A public, free website that visualizes active Colorado ultramarathons — filterable by format, distance, region, and date — with calendar and map views as the primary ways to browse. It grows out of two static posters (a "Colorado Ultra Season" calendar and a "Colorado Ultra Map") built from a hand-verified research dataset of ~70 events. The website generalizes those two fixed views into an interactive, filterable, shareable tool, and opens the door to more (elevation profiles, community contributions) as later phases.

**Audience:** Colorado ultrarunners planning a season, race-curious trail runners browsing options, and (secondarily) race directors checking how their event is represented.

**Working convention across sessions:** Claude Code should commit locally as it works, but should not push to the remote. The user reviews and pushes manually once a session's work is complete. State this explicitly in every prompt handed to Claude Code — don't rely on it being remembered from a prior session.

**Verification convention, relevant from Phase 3 onward:** a successful build is necessary but not sufficient. Claude Code should verify the build succeeds and (where practical) that the data layer is correctly wired, but the actual visual/interactive result — does it look right, does it behave right — is verified by the user directly, not claimed by Claude Code from the build output alone.

---

## 2. Core architectural decisions

These were deliberated explicitly and shouldn't be silently re-opened by a future prompt without a real reason. Each includes the reasoning, not just the conclusion.

### 2.1 Static data, not a live database (for MVP)

**Decision:** The canonical race dataset lives as structured JSON/YAML files inside the GitHub repo, not in a hosted database. The site is a static site, generated at build time from those files. All filtering (format, distance, region, date) happens client-side in the visitor's browser against data that's already loaded — no server-side queries.

**Why:** The dataset is small (~70 records) and changes infrequently (a handful of corrections or additions per season, not per minute) — a live database solves a scale/write-frequency problem this project doesn't have. Git gives us free version history and pull-request review for every data change, which matters concretely: this project has already caught multiple real research errors (a mislabeled MTB race, a non-ultra event, a bikepacking race miscategorized as a running ultra) through manual review. A PR diff is easy to sanity-check; a silent database UPDATE is not. Static hosting on Cloudflare is also free and effectively zero-maintenance compared to running and securing a database server.

**Explicitly not a wall:** The data layer and the UI components (calendar, map, filters) talk to each other through one narrow interface — "give me the race data." Today that's answered by reading a local file at build time. If/when the project needs live writes (see 2.3), that answer can change to "fetch from an API" without the calendar/map/filter components themselves needing to change.

**Future upgrade path, if/when needed:** Cloudflare D1 (serverless SQLite) binding directly to the Worker. Simpler than originally planned: the project already runs on Workers (see §2.4), not classic Pages, so this no longer requires a separate "Pages Functions" abstraction layer — D1 binds straight in.

### 2.2 Map: Leaflet + free OpenStreetMap-based tiles

**Decision:** Interactive map built with Leaflet (free, open-source JS mapping library), using free OSM-derived tiles (e.g. via CARTO's basemap styles) rather than Mapbox.

**Why:** No API key, no billing tier to hit, well-documented/standard combination. A real pan-and-zoom map also structurally solves the geographic clustering problem the static poster had to work around with insets and leader lines (San Juans, Colorado Springs) — a visitor can just zoom into a cluster instead of us pre-designing an inset for it.

**Not a permanent lock-in:** Swapping tile providers later (e.g. to Mapbox GL JS for nicer vector rendering) is a contained change to one component, not a data-layer or architecture change. Revisit only if the free tiles ever feel visually limiting.

### 2.3 Read-only MVP; community features are a planned (not promised) phase

**Decision:** V1 has no user accounts, submissions, comments, or corrections from the public. It's a read-only visualization of a maintained dataset.

**Why:** Keeps the MVP scope honest and shippable. The static-data + Cloudflare stack (2.1) was chosen specifically so this door stays open cheaply: adding community submissions later means adding Cloudflare D1, binding directly to the existing Worker (see §2.4), without touching the core site architecture.

### 2.4 Hosting & repo

- **Code + data:** GitHub (public repo).
- **Hosting/deploy:** Cloudflare, deployed as a Worker with native static assets (not classic Pages) — connected to the GitHub repo via Workers Builds for automatic deploys on push/merge to main. **Note for future sessions, corrected during Phase 2:** Cloudflare's own current guidance is to start new projects on Workers rather than Pages — Pages still works but is in maintenance mode, with new platform investment going to Workers. The live URL uses the `*.workers.dev` subdomain pattern (this is expected and correct, not a misconfiguration — Workers projects get a personalized `workers.dev` subdomain the same way Pages projects used to get `pages.dev`). Build command `npm run build`, deploy via `npx wrangler deploy`, root directory `/`. Don't "fix" this back to classic Pages in a future session; it was a deliberate, verified update to the original decision, not a mistake to correct.
- **Domain:** **gnarlist.co** is canonical for now — "GnarList," `.co` read as "Colorado," matching the site's current CO-only scope. Also registered: `gnarlist.run`, `gnarlist.racing`, `thegnarlist.com` — set these up as redirects to the canonical domain once there's something live worth pointing them at (Cloudflare handles multi-domain redirects natively). **Explicitly deferred out of Phase 2** — connecting any real domain (canonical or redirects) requires registrar-level DNS action tied to the user's accounts, which is outside what a Claude Code session can do; revisit once the initial deploy is live (it is — see §2.4 above). `thegnarlist.com` is reserved as the likely future canonical domain if/when the project expands beyond Colorado — that's a deliberate rename to revisit later, not a decision to make now.

### 2.5 Visual design: carry the poster identity forward, no separate design tool

**Decision:** No dedicated Claude Design pass for the site UI. The two static posters ("Colorado Ultra Season" calendar, "Colorado Ultra Map") already established a real visual identity — dark palette, gold/amber accents for marquee/highlighted content, teal as a secondary accent, bold condensed headers, a specific typographic voice ("A Typical Year on the High Ground"). Carry that forward as an explicit constraint in UI-building prompts from Phase 3 onward, executed via Claude Code's `frontend-design` skill rather than mocked up separately first.

**Why:** Design tools are strongest on static or near-static compositions — which is exactly why they worked well for the posters. A filtering UI is stateful and interactive in a way that's hard to meaningfully mock up outside the real implementation; a static mockup of hypothetical filter states would just need reverse-engineering into working interactivity anyway. Building with zero visual direction risks generic defaults and real rework later; the cheap fix is stating the existing identity explicitly up front, not routing through a separate tool.

---

## 3. Tech stack

**Decided: Astro**, chosen and scaffolded during Phase 2. Reasoning: static export is Astro's native mode rather than a constrained bolt-on mode of a server-first framework (the case for both Next.js static export and SvelteKit's static adapter); its islands architecture fits this project's actual shape well — Phases 4–5 need genuinely interactive pieces (calendar, Leaflet map) sitting inside an otherwise mostly-static site, and Astro ships JS only to the components that need it rather than a full framework runtime to every page. Verified: the Phase 2 placeholder page builds to zero shipped JavaScript.

Node version pinned via `.nvmrc` (Node 22, required by Astro 7) to avoid a build-image mismatch on Cloudflare's build system.

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

**Filter-UX decisions (settled before Phase 3, apply consistently across Phases 3–5 since calendar and map reuse the same filter logic):**
- **Sub-50K events** (Box Canyon 30K, Sourdough Snowshoe, etc.) get a separate toggle, not folded into the main distance filter — keeps the primary distance filter intuitive for someone thinking in standard ultra distances (50K/50mi/100K/100mi) rather than cluttering it with borderline entries.
- **Mixed-format events** (e.g. Chase the Moon: primarily a 12-hr timed event, but also offers a standard 50K) get a secondary tag so they surface under both relevant filters, rather than being forced into one bucket and becoming invisible to someone filtering by the other.

---

## 4.5. Phase 3 scope additions (pulled forward from later phases)

Two things originally scoped later, deliberately moved up before Phase 3 started because retrofitting them after filter components already exist is more disruptive than building them in from day one:

- **Shareable/bookmarkable filtered URLs** — moved from Phase 6 into Phase 3. Filter state (format, distance, region, date, sub-50K toggle) should be reflected in the URL so a filtered view can be shared or bookmarked.
- **Baseline mobile usability** — distinct from mobile *polish* (still Phase 6). The site should be genuinely usable on a phone from Phase 3 onward, not just functional on desktop with polish deferred; a race-finder tool that doesn't work on mobile for three phases is a real gap given how people actually browse this kind of thing.

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
2. **Project scaffold** — repo init, framework choice (§3), Cloudflare deploy pipeline, a live "hello world" placeholder page. Proves the plumbing before building features on it. **Status: complete.** Astro scaffolded, `.gitignore` and `.nvmrc` in place, README added, placeholder page builds from `data/races.json` at build time with zero shipped JS, licensing resolved (no license file — §8), live site verified in production matching the local build exactly (71 active / 75 total / 75 with coordinates / 14 marquee), deploy config committed as `wrangler.jsonc` (validated via `wrangler deploy --dry-run` plus a negative-control test; no `main` field since `output: 'static'` produces an assets-only Worker — don't "helpfully" add one later), `wrangler` added as a devDependency so a clean clone can actually deploy, push-to-deploy confirmed end-to-end (footer text change, pushed, live site updated). **One thing worth a manual check, not a blocker:** `workers_dev` and `preview_urls` in the committed config were inferred as `true` rather than read from the dashboard — confirm they match actual dashboard settings before relying on them.
3. **List/table view + core filters** — format, distance, region, month, plus the sub-50K toggle and mixed-format secondary tagging (§4). Now also includes shareable filtered URLs and baseline mobile usability, pulled forward from Phase 6 (§4.5). Visual identity carries forward from the posters (§2.5). The simplest useful version of the site; validates the data layer and filter logic end-to-end for reuse in Phases 4–5.
4. **Calendar view** — interactive, filterable, click-through to event detail. Generalizes the static poster.
5. **Map view** — interactive Leaflet map (§2.2), filterable, real zoom-based clustering instead of manual insets.
6. **Event detail pages + polish** — permalinks, mobile *polish* (baseline usability already lands in Phase 3, per §4.5), basic search.
7. **Data maintenance workflow** — a semi-automated research-assistant tool that checks known sources per event on a schedule and proposes a PR for human review (§5.4). Deferred until after the site itself is live — no point maintaining a site that doesn't exist yet.
8. **Stretch phases** — elevation profiles/difficulty scoring (pending new data sourcing, §6); community submissions (pending D1 build-out, §2.3).

---

## 8. Open items / revisit later

- **Licensing — resolved.** No license file, default all-rights-reserved, for both code and data. Applies to the repo's code and to `races.json` alike unless split later. The MIT license file added during Phase 2 scaffold has been removed and confirmed gone. Note: facts (race names, dates, locations, distances) aren't copyrightable regardless of license choice — only the specific compilation and original writing (notes/descriptions) are protectable. Not legal advice; consult a lawyer if this ever matters commercially.
- Redirect setup for `gnarlist.run` / `gnarlist.racing` / `thegnarlist.com` → `gnarlist.co` — see §2.4, deferred until there's a live deploy worth pointing a domain at.
- Whether/when to build the Phase 7 data-maintenance tooling and Phase 8 stretch items — revisit once the core site (Phases 1–6) is live and real usage patterns exist.
- Sanity-check "GnarList" naming against Gnar Runners (a race organizer already in the dataset) before public launch — low-confidence concern, probably fine, worth a glance rather than a deep dive.
