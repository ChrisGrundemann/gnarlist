# Colorado Ultra — Architecture & Build Plan

*Reference document. Written to keep every future prompt, session, and contributor (human or Claude) working from the same plan instead of re-deriving it. Update this file when a real architectural decision changes; don't let it drift out of sync with reality.*

---

## 1. What this project is

A public, free website that visualizes active Colorado ultramarathons — filterable by format, distance, region, and date — with calendar and map views as the primary ways to browse. It grows out of two static posters (a "Colorado Ultra Season" calendar and a "Colorado Ultra Map") built from a hand-verified research dataset of ~70 events. The website generalizes those two fixed views into an interactive, filterable, shareable tool, and opens the door to more (elevation profiles, community contributions) as later phases.

**Audience:** Colorado ultrarunners planning a season, race-curious trail runners browsing options, and (secondarily) race directors checking how their event is represented.

**Working convention across sessions:** Claude Code should commit locally as it works, but should not push to the remote. The user reviews and pushes manually once a session's work is complete. State this explicitly in every prompt handed to Claude Code — don't rely on it being remembered from a prior session.

**Verification convention, relevant from Phase 3 onward:** a successful build is necessary but not sufficient. Claude Code should verify the build succeeds and (where practical) that the data layer is correctly wired, but the actual visual/interactive result — does it look right, does it behave right — is verified by the user directly, not claimed by Claude Code from the build output alone.

**Documentation convention, formalized after Phase 3, broadened after Phase 6 (region correction):** Claude Code is welcome — encouraged, even — to add implementation-detail notes directly to project docs (this file, `SCHEMA.md`, and similar) for work from its own session, appended cleanly rather than restructuring existing content (Phase 3's "How these were actually implemented" addition under §4 is the model to follow; the Phase 6 region-correction session's `SCHEMA.md` update, marking a stale open question resolved-with-answer rather than deleting it, is another good example). The session that just built something has the freshest, most accurate account of how it actually works. Higher-level decisions and cross-session status reconciliation remain the user's/Claude's job between sessions.

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

**Decision:** No dedicated Claude Design pass for the site UI. The two static posters ("Colorado Ultra Season" calendar, "Colorado Ultra Map") already established a real visual identity — dark palette, gold/amber accents for marquee/highlighted content, teal as a secondary accent, bold condensed headers, a specific typographic voice ("A Typical Year on the High Ground"). Carry that forward as an explicit constraint in UI-building prompts from Phase 3 onward. **Correction from Phase 3:** the `frontend-design` skill referenced in the original version of this decision is not available in Claude Code sessions — that was an incorrect assumption of tool parity between this chat interface and Claude Code, two different products. Describe the visual direction in plain language in future prompts instead of naming that skill. Phase 3 executed the direction by hand successfully (see §7 item 3) — palette: `#0b0f13` near-black ground, `#f2b843` gold reserved strictly for marquee/highlight elements, `#46b6a8` teal for working UI (distances, selected chips), `#c9755c` rust as the single warning ink (discontinued/unverified status). The discipline that makes it read as the posters rather than a generic dark theme: gold means marquee, nothing else.

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
- Region (for the regional groupings used throughout) — **nine regions, finalized by the geographic audit run between Phases 3 and 4. The settled list, and the reasoning behind it, is the "Region scheme" subsection below; treat that as the reference and don't re-derive it.**
- Notes/hook fact, source(s)

**Deferred field, not in v1:** elevation profile / total gain data. See §6.

**Filter-UX decisions (settled before Phase 3, apply consistently across Phases 3–5 since calendar and map reuse the same filter logic):**
- **Sub-50K events** (Box Canyon 30K, Sourdough Snowshoe, etc.) get a separate toggle, not folded into the main distance filter — keeps the primary distance filter intuitive for someone thinking in standard ultra distances (50K/50mi/100K/100mi) rather than cluttering it with borderline entries.
- **Mixed-format events** (e.g. Chase the Moon: primarily a 12-hr timed event, but also offers a standard 50K) get a secondary tag so they surface under both relevant filters, rather than being forced into one bucket and becoming invisible to someone filtering by the other.

**How these were actually implemented in Phase 3** (`src/lib/filters.ts` + `src/lib/races.ts`; reused unchanged by Phases 4–5):

- Secondary tags are **derived at build time from `ultra_distances`**, not stored in `races.json` — nothing in the data file changed. Each distance option contributes a format token (`stages` → stage, `loop_miles` → backyard, `hours` → timed, plain `miles` → standard) and a distance-category token. Chase the Moon comes out `timed + standard` / `timed + 50k`; Summits Trail Runs comes out `standard + timed`. Sangre de Cristo, which offers 200/100mi/100K/50mi/50K, surfaces under all five distance filters.
- One deliberate exception in that derivation: an option whose label contains "timed" does **not** contribute a fixed-distance token. This exists for American Heroes Run, whose `{ label: "100 mi timed", miles: 100 }` is a goal distance inside a 24-hour event, not a 100-miler. Without the guard it would appear under the 100-mile filter, which is exactly the kind of format/category error §5.3 warns about.
- The **sub-50K toggle is a member of the distance selection**, presented as a switch rather than a chip. With no distance selected, everything shows (sub-50K events included — they're in the dataset deliberately, see §6). Selecting `50K` excludes them; selecting `50K` *and* the toggle shows both. It is labelled "Sub-50K", not "Include sub-50K", because as part of an AND-ed filter set it can narrow results as well as widen them.
- `distance_category: "200m+"` is normalized to the token `200m` for URLs and data attributes — a literal `+` in a query string decodes as a space and would silently break hand-edited share links.

**Region scheme — finalized by the geographic audit run between Phases 3 and 4.**

The original seven regions were carried straight over from the posters, which grouped by rough visual proximity on a printed map. A verified audit against Wikipedia/USGS/USFS found thirteen events filed under a region that is factually wrong — checkable errors, not judgment calls. The clearest: **Leadville sat under `san-juans`**, a mountain range about 150 road miles away, because the poster's "San Juans / High Country" bucket was doing double duty as a catch-all for anything high. Fixing that required two new regions, giving nine:

| Slug | Chip label | Full label | Covers | Listed / counted |
|---|---|---|---|---|
| `san-juans` | San Juans | San Juans | Silverton, Ouray, Telluride, Lake City, Creede, Durango | 11 / 11 |
| `front-range-cs` | Colo. Springs | Colorado Springs / Pikes Peak | El Paso, Teller, south Douglas | 15 / 15 |
| `denver-metro` | Denver Metro | Denver Metro & Foothills | Jefferson, Boulder, Gilpin, Clear Creek, Adams, north Douglas | 14 / 12 |
| `northern-front-range` | N. Front Range | Northern Front Range | Larimer, Weld — Fort Collins, Greeley, Red Feather | 5 / 5 |
| `estes-park` | Estes Park | Estes Park / RMNP | Estes Park | 4 / 4 |
| `mountains-western-slope` | Western Slope | Mountains / Western Slope | Routt, Grand, Jackson, Gunnison, Pitkin, Mesa, Delta | 13 / 13 |
| `central-mountains` | Central Mtns | Central Mountains / Sawatch | Lake, Chaffee — Upper Arkansas valley and the Sawatch | 6 / 6 |
| `fairplay-south-park` | South Park | Fairplay / South Park | Park (Fairplay, Como) | 2 / 2 |
| `southern-colorado` | Southern CO | Southern Colorado | Pueblo, Fremont, Huerfano, Custer | 5 / 5 |
| | | | **Total** | **75 / 73** |

*(Listed = rows rendered. Counted = rows contributing to displayed numbers — see the counting rule below.)*

**The two new regions, and why they had to exist:**

- **`central-mountains`** — Lake and Chaffee counties: Leadville, Buena Vista, the Upper Arkansas valley under the Sawatch. Six events, previously split between `san-juans` (the two Leadville races) and `mountains-western-slope` (the Buena Vista cluster). Neither was defensible: Leadville is not in the San Juans, and the Upper Arkansas is *east* of the Continental Divide, so it isn't the Western Slope either.
- **`northern-front-range`** — Larimer and Weld counties: Fort Collins, Greeley, Red Feather Lakes, Eaton. Five events previously filed under `denver-metro`. Fort Collins and Greeley have their own metropolitan statistical areas and sit 55–60 miles from Denver; grouping them with Denver was a map-space artifact, not a real geography.

**Two straight reassignments, no new region needed:** Devil on the Divide (Empire / Idaho Springs, Clear Creek Co.) moved from `mountains-western-slope` to `denver-metro` — it's on the I-70 corridor east of the Divide, inside the Denver MSA. Never Summer (Gould, Jackson Co.) moved the other way, from `denver-metro` to `mountains-western-slope` — it's in the North Park basin, ~150 miles from Denver over Cameron Pass.

**Deliberately *not* changed:** Fairplay/South Park stays its own region rather than folding into `central-mountains`, despite being geographically adjacent. South Park is a distinctly recognizable Colorado basin in its own right, and collapsing it would lose something a Colorado runner actually recognizes. Two events is a small region; that's fine.

**Label changes are consequences of the audit, not taste.** `san-juans` dropped its "/ High Country" qualifier because that clause existed to cover Leadville and no longer has anything to cover. `front-range-cs` became "Colorado Springs / Pikes Peak" because a bare "Front Range" is ambiguous once `northern-front-range` exists. `denver-metro` became "Denver Metro & Foothills" because Golden Gate Canyon, Conifer, Pine, Nederland and Empire are mountain communities at 7,500 ft+, and the plain label undersold half the region. **Slugs did not change** — they're URL contract, and existing share links still resolve.

**TransRockies Pass to Pub is filed under `central-mountains` as a deliberate simplification, and Phase 5 must not treat that as solved.** The race starts in Leadville (Lake Co.) and finishes in Red Cliff (Eagle Co.), crossing the Continental Divide at Tennessee Pass mid-race. No single region is fully correct. A filter chip needs one discrete value, so it gets one; a *route* does not fit one value, so the map view should give it real treatment — a route line, or paired start/finish markers — rather than dropping a single pin and calling the question closed. This is the same lossiness `SCHEMA.md` §6.7 flags about its stored coordinate, now also true of its region. It is the only event in the dataset with this property.

**Counting rule (settled here, applies to every view from Phase 4 on):** events with `status: discontinued` or `status: unverified` **do not contribute to any displayed number** — not the overall result count, not a faceted chip count, not a masthead stat. They remain fully visible and browsable in the list, keeping their existing rust/hatched treatment. This is a *counting* rule, not a visibility rule, and the two must not be quietly merged by a later phase: hiding these events would defeat the point of carrying them, which is that the record is complete. `active` and `returning` count normally — a returning race is coming back.

Implemented as `countsTowardTotals` in `src/lib/races.ts` (the single definition), surfaced per row as `data-counted` so the browser script never needs to know the status vocabulary. Two consequences worth knowing before they look like bugs: **Denver Metro shows 12 above 14 rows**, because both non-counting events happen to live there; and a filter combination can legitimately produce **a count of 0 with rows still on screen** (Region → Denver Metro plus the Sub-50K toggle leaves only the unverified Sourdough Snowshoe). The list view handles the second by tracking rows-shown separately from events-counted, so the "nothing matches" copy never appears above a visible row, and by showing a "+n shown, not counted" note in the results bar whenever the two diverge. Phases 4 and 5 need the same split.

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
5. **Scope boundary, decided during Tier B verification: GnarList requires open registration.** Informal, invite-only, application-only "fat ass"-style group runs (John Cappis 50K Fat Ass is the case that surfaced this) are out of scope regardless of how legitimate, historically significant, or well-documented they are — verified-real is necessary but not sufficient for inclusion. Rationale: there's no path for a visitor to actually register even if they find one, and no race-director relationship for the project's broader ServCo/SellCo context to ever engage with. **Worth checking against existing records** — Sourdough Snowshoe Race (`status: unverified`) is donation-based and informal in character; verify it's genuinely open-registration before this principle is applied retroactively, don't assume either way.

---

## 6. Explicitly deferred / non-goals for MVP

Naming these now so future sessions don't quietly scope-creep or, conversely, feel obligated to promise them early:

- **Elevation profiles / total gain filtering.** We don't have this data yet. Sourcing it (GPX files, organizer course pages, Strava segments) is its own research project — scoped as a later phase, not v1.
- **Live database / write backend.** See §2.1 and §2.3 — planned upgrade path, not built until there's an actual feature that needs it.
- **User accounts, submissions, comments.** See §2.3.
- **Automated/unattended scraping that writes directly to the dataset.** See §5.3 — any collector tooling should propose changes for review, not auto-commit.
- **Expanding scope beyond ultramarathons to all Colorado trail races.** Not a v1 goal, but flagged as a real possible future direction, not a hard boundary — the dataset currently includes borderline-sub-ultra events (30K, 32mi) that run alongside true ultras, which was a deliberate inclusive choice made with this possible expansion in mind. If pursued, this would be a significant scope change (naming, schema, data volume) and deserves its own planning pass, not a quiet scope-creep into one session.
- **The `sub-50K` bucket conflates two genuinely different things, flagged during the Tier A completeness pass.** It currently holds events under the 50K/31.1mi threshold regardless of whether they clear marathon distance (42.2km/26.2mi) — the actual standard definition of "ultramarathon." Box Canyon and Sourdough Snowshoe (both 30K/18.6mi) don't clear that bar at all; Desert RATS' 48K/29.8mi does. Pragmatic call for now: keep the single `sub-50k` bucket. Real fix, deferred: a numeric marathon-distance floor deciding what counts as an ultra at all, rather than the round-number "50K" label doing that job.

---

## 7. Phased build plan

Each phase becomes one or more Claude Code prompts, built and reviewed iteratively.

1. **Data foundation** — convert the verified spreadsheet into the real schema (§4): add coordinates, normalize distance fields, generate slugs, encode status/marquee/region. Mostly a data-decisions step, human-directed with Claude Code executing. **Status: complete.** `SCHEMA.md` approved, `data/races.json` built (75 records: 71 active, 2 returning, 1 discontinued, 1 unverified), validated clean (no duplicate slugs, no missing required fields, no missing coordinates, marquee list matches the approved 14).
2. **Project scaffold** — repo init, framework choice (§3), Cloudflare deploy pipeline, a live "hello world" placeholder page. Proves the plumbing before building features on it. **Status: complete.** Astro scaffolded, `.gitignore` and `.nvmrc` in place, README added, placeholder page builds from `data/races.json` at build time with zero shipped JS, licensing resolved (no license file — §8), live site verified in production matching the local build exactly (71 active / 75 total / 75 with coordinates / 14 marquee), deploy config committed as `wrangler.jsonc` (validated via `wrangler deploy --dry-run` plus a negative-control test; no `main` field since `output: 'static'` produces an assets-only Worker — don't "helpfully" add one later), `wrangler` added as a devDependency so a clean clone can actually deploy, push-to-deploy confirmed end-to-end (footer text change, pushed, live site updated). **One thing worth a manual check, not a blocker:** `workers_dev` and `preview_urls` in the committed config were inferred as `true` rather than read from the dashboard — confirm they match actual dashboard settings before relying on them.
3. **List/table view + core filters** — format, distance, region, month, plus the sub-50K toggle and mixed-format secondary tagging (§4). Now also includes shareable filtered URLs and baseline mobile usability, pulled forward from Phase 6 (§4.5). Visual identity carries forward from the posters (§2.5). The simplest useful version of the site; validates the data layer and filter logic end-to-end for reuse in Phases 4–5. **Status: complete.** All 75 events render as rows grouped under month headings; filter semantics live in `src/lib/filters.ts` (see §4) and are shared verbatim between the build-time render and the browser. Filter state round-trips through query params (`?format=…&dist=…&region=…&month=…&sub=1`), written with `replaceState` so chip-toggling doesn't fill the history stack. Every row is server-rendered and filtering only toggles visibility, so the full list still works with JavaScript off; the shipped bundle is ~5 KB. Verified functionally by driving the built page in headless Chrome (AND-across/OR-within facet logic, URL round-trip, month-heading collapse, empty state, faceted chip counts, no horizontal overflow at 305/375/753 px) — **and now visually confirmed by the user directly**, per the verification convention above.

   **Known follow-ups from Phase 3, not blockers, worth remembering:**
   - No self-hosted webfont yet — the condensed display stack currently falls back to whatever's installed locally (Noto Sans Condensed / Liberation Sans Narrow / Arial Narrow / system-ui depending on OS), degrading gracefully but inconsistently. Self-hosting Oswald or Archivo Narrow is the real fix — deliberately left for Phase 6 rather than adding a font binary/license mid-session.
   - `npm run check` (TypeScript enforcement) isn't wired up — Claude Code declined to add `@astrojs/check` + `typescript` as devDependencies without being asked. Types currently function as documentation, not CI enforcement. Worth adding explicitly if desired.
   - TransRockies Pass to Pub surfaces under Format→Stage but deliberately not Distance→50mi, since its distance lives in a `stages` field rather than `miles`. Confirmed as the right call — a multi-day stage race isn't equivalent to a standalone 50-miler for someone filtering by distance.
4. **Calendar view** — interactive, filterable, click-through to event detail. Generalizes the static poster.
5. **Map view** — interactive Leaflet map (§2.2), filterable, real zoom-based clustering instead of manual insets. **Read §4's region scheme first:** TransRockies Pass to Pub is a genuinely cross-boundary route whose single region value and single coordinate are both deliberate simplifications for the filter/pin, and this view is where that's supposed to get honest treatment.
6. **Event detail pages + polish** — permalinks, mobile *polish* (baseline usability already lands in Phase 3, per §4.5), basic search.
7. **Data maintenance workflow** — a semi-automated research-assistant tool that checks known sources per event on a schedule and proposes a PR for human review (§5.4). Deferred until after the site itself is live — no point maintaining a site that doesn't exist yet.
8. **Stretch phases** — elevation profiles/difficulty scoring (pending new data sourcing, §6); community submissions (pending D1 build-out, §2.3).

---

## 8. Open items / revisit later

- **Licensing — resolved.** No license file, default all-rights-reserved, for both code and data. Applies to the repo's code and to `races.json` alike unless split later. The MIT license file added during Phase 2 scaffold has been removed and confirmed gone. Note: facts (race names, dates, locations, distances) aren't copyrightable regardless of license choice — only the specific compilation and original writing (notes/descriptions) are protectable. Not legal advice; consult a lawyer if this ever matters commercially.
- Redirect setup for `gnarlist.run` / `gnarlist.racing` / `thegnarlist.com` → `gnarlist.co` — see §2.4, deferred until there's a live deploy worth pointing a domain at.
- Whether/when to build the Phase 7 data-maintenance tooling and Phase 8 stretch items — revisit once the core site (Phases 1–6) is live and real usage patterns exist.
- Sanity-check "GnarList" naming against Gnar Runners (a race organizer already in the dataset) before public launch — low-confidence concern, probably fine, worth a glance rather than a deep dive.
