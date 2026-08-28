# Colorado Ultra — Architecture & Build Plan

*Reference document. Written to keep every future prompt, session, and contributor (human or Claude) working from the same plan instead of re-deriving it. Update this file when a real architectural decision changes; don't let it drift out of sync with reality.*

---

## 1. What this project is

**v1 status (as of this note): the core vision below is fully realized.** List, calendar, and map views are complete, filter-consistent, and cross-linked; permalinks exist for all events; the site is WCAG 2.1 AA compliant with a self-hosted webfont; the dataset (102+ events) has been through multiple verification passes and a full region-scheme audit. Honestly still outside this scope, deliberately not overlooked: search, mobile *polish* beyond the established baseline, and everything in Phase 7/8 (§7) — data-maintenance tooling, elevation data, community features. Pending as of this note: two small items from the last cleanup session (see §7 item 7's follow-ups) and confirmation the Cloudflare Workers Builds config actually runs `npm run build` rather than bypassing the type-check gate.

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

**Amendment, made during Phase 5 when the map was actually built: the CARTO example no longer satisfies this decision's own terms.** `basemaps.cartocdn.com` still answers keyless requests, but it now returns every tile stamped **"API KEY REQUIRED — carto.com/basemaps/apikey"** diagonally across the image. That is not a cosmetic nag; it is the billing tier §2.2 chose Leaflet+OSM specifically to stay out of, arriving through the front door. Caught by looking at the rendered map, not by the build, which was perfectly happy serving watermarked tiles.

**The replacement is standard OpenStreetMap raster tiles (`tile.openstreetmap.org`), darkened in CSS** — one `filter` on `.leaflet-tile-pane` (invert, hue-rotate back, then pull onto the site's cold near-black). This is *more* faithful to the decision than what it replaces: the decision says "free OSM-derived tiles, no API key", and standard OSM is exactly that, keyless and ODbL, with the dark styling moved from the provider into ten lines we own. Two obligations come with it, both met: attribution in the map's own control and in the page footer, and OSMF's tile usage policy, which asks that you not be a heavy user. A hand-maintained index of ~100 races is not.

The rejected alternatives, so nobody re-derives them: **Stadia** (Alidade Smooth Dark, which is the closest look to the posters) returns 401 without a key; **Esri's** World Dark Gray Canvas is keyless and handsome but is not OSM-derived and its free-use terms are murkier than ODbL; **OpenFreeMap** is genuinely free and unlimited but ships vector tiles, which would mean MapLibre GL plus a Leaflet bridge — a real dependency change to buy styling we can do with one CSS filter. Revisit if the site ever outgrows OSMF's policy; that is the trigger, not aesthetics.

### 2.3 Read-only MVP; community features are a planned (not promised) phase

**Decision:** V1 has no user accounts, submissions, comments, or corrections from the public. It's a read-only visualization of a maintained dataset.

**Why:** Keeps the MVP scope honest and shippable. The static-data + Cloudflare stack (2.1) was chosen specifically so this door stays open cheaply: adding community submissions later means adding Cloudflare D1, binding directly to the existing Worker (see §2.4), without touching the core site architecture.

### 2.4 Hosting & repo

- **Code + data:** GitHub (public repo).
- **Hosting/deploy:** Cloudflare, deployed as a Worker with native static assets (not classic Pages) — connected to the GitHub repo via Workers Builds for automatic deploys on push/merge to main. **Note for future sessions, corrected during Phase 2:** Cloudflare's own current guidance is to start new projects on Workers rather than Pages — Pages still works but is in maintenance mode, with new platform investment going to Workers. The live URL uses the `*.workers.dev` subdomain pattern (this is expected and correct, not a misconfiguration — Workers projects get a personalized `workers.dev` subdomain the same way Pages projects used to get `pages.dev`). Build command `npm run build`, deploy via `npx wrangler deploy`, root directory `/`. Don't "fix" this back to classic Pages in a future session; it was a deliberate, verified update to the original decision, not a mistake to correct.
- **Domain:** **gnarlist.co** is canonical and **live** — connected via Cloudflare Custom Domain on the Worker (dashboard-only step, done manually per §2.4's original guidance). "GnarList," `.co` read as "Colorado," matching the site's current CO-only scope. **Indexing: deliberately left open** — considered a temporary `noindex` while the site was mid-build (list view only, no calendar/map yet), decided against it; the site is genuinely useful at its current stage and event permalink pages (Phase 4, see §7) benefit directly from being search-discoverable. As of the discoverability pass after Phase 4 that decision is written down where crawlers read it: `public/robots.txt` carries `Allow: /` with no blanket `Disallow`, plus a `Sitemap:` line pointing at `https://gnarlist.co/sitemap-index.xml`. Anyone reversing the indexing decision later has to change that file too, which is the point of it being explicit rather than absent. Revisit only if there's a specific reason to reconsider, not by default. Also registered: `gnarlist.run`, `gnarlist.racing`, `thegnarlist.com` — still deferred as redirects to the canonical domain (§8), no urgency now that the canonical domain itself is live. `thegnarlist.com` is reserved as the likely future canonical domain if/when the project expands beyond Colorado — that's a deliberate rename to revisit later, not a decision to make now.

### 2.5 Visual design: carry the poster identity forward, no separate design tool

**Decision:** No dedicated Claude Design pass for the site UI. The two static posters ("Colorado Ultra Season" calendar, "Colorado Ultra Map") already established a real visual identity — dark palette, gold/amber accents for marquee/highlighted content, teal as a secondary accent, bold condensed headers, a specific typographic voice ("A Typical Year on the High Ground"). Carry that forward as an explicit constraint in UI-building prompts from Phase 3 onward. **Correction from Phase 3:** the `frontend-design` skill referenced in the original version of this decision is not available in Claude Code sessions — that was an incorrect assumption of tool parity between this chat interface and Claude Code, two different products. Describe the visual direction in plain language in future prompts instead of naming that skill. Phase 3 executed the direction by hand successfully (see §7 item 3) — palette: `#0b0f13` near-black ground, `#f2b843` gold reserved strictly for marquee/highlight elements, `#46b6a8` teal for working UI (distances, selected chips), `#c9755c` rust as the single warning ink (~~discontinued/unverified~~ **discontinued** status — corrected below). The discipline that makes it read as the posters rather than a generic dark theme: gold means marquee, nothing else.

**Amended by the Phase 6 design sweep (§7 item 6): the semantic system above is unchanged, and three of its four hexes are unchanged with it.** Gold still means marquee, teal still does the working/selected job, rust is still the single warning ink. What the sweep changed is the *greys* and the *edges* — the parts of the palette that were never carrying meaning, only carrying text. `--fg-mute` moved because it failed WCAG AA against every surface on the site including the plain page ground, and interactive borders got their own token because a chip's outline is the only thing that says a chip is pressable. A second discipline now sits alongside the first, and it is the one that decides values where the first decides meaning:

> **Contrast is measured against the lightest surface an ink can land on, not the page ground.** For the greys that surface is a hovered marquee row — `--gold-wash` over `--ink-850` — which is nearly three shades lighter than `--ink-900` and is where every grey was quietly failing.

The corollary, learned the expensive way and worth stating because it reads as harmless: **`opacity` is not a dimming tool for text.** It scales a pairing toward 1:1 from both ends at once, so an ink already near the 4.5 floor falls straight through it, and no opacity value rescues it. Four separate "this recedes" treatments were built with `opacity` and all four failed. Where something should be quieter, change the ink.

**Amended to match the built UI: status is drawn with two treatments, not one.** The palette line above originally read "rust as the single warning ink (discontinued/unverified)". No view has ever drawn it that way — the code has been consistent since Phase 3, and it is the doc line that was a stale early draft. What is actually built, on every view:

> - **Discontinued — solid rust.** A solid `--rust` left stripe, the `--hatch-rust` ground, a rust pill on `--rust-wash`, a solid rust pin outline, a solid rust timeline mark and legend swatch. Rust appears nowhere else on the site. It remains the single *warning* ink, and the warning it gives is specifically "this race is gone."
> - **Unverified — dashed `--gold-deep`.** A dashed left stripe on the row, a dashed pin outline, a dashed 2px gradient for the timeline mark and legend swatch. Nothing hatched, nothing rust. Unverified is not a warning: it is an admission of uncertainty about a race that may well be running, and drawing it as a warning would assert more than we know — the same discipline that makes §7 item 4 omit `eventStatus` for `unverified` rather than pick a schema.org value that overstates it. It reads as a broken line for the same reason the calendar's `~` gutter draws unconfirmed dates as dashed columns (§7 item 5): the mark is incomplete because the fact is.
> - **Marquee — solid gold.** A solid `--gold-deep` stripe over a `--gold-wash` row ground, a full-height solid `--gold` timeline mark. Filled and continuous, never dashed.

**The three stay distinct because two channels carry the system, not one.** Hue separates rust from gold; *stroke* separates dashed gold from solid gold. That second channel is what keeps "gold means marquee, nothing else" true rather than merely aspirational — the unverified treatment paints no ground and no fill of its own, and the marquee treatment contains no dashed stroke anywhere, so a race holding both flags composes readably (gold wash from one, dashed stripe from the other) rather than colliding the way marquee + discontinued did before §7 item 7 fixed it — and it is also why neither state depends on colour alone, which is what WCAG 1.4.1 asks and a hue-only system would fail. The one place unverified touches `--gold` at full strength is its status pill, which is a labelled chip reading "Unverified" in words, exactly parallel to the teal "Returning" and rust "Discontinued" pills; it is measured in §7 item 6 table B at 9.10:1.

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
| `san-juans` | San Juans | San Juans | San Juan, Ouray, San Miguel, Hinsdale, Mineral, La Plata, Rio Grande | 14 / 14 |
| `front-range-cs` | Colo. Springs | Colorado Springs / Pikes Peak | El Paso, Teller, south Douglas | 17 / 17 |
| `denver-metro` | Denver Metro | Denver Metro & Foothills | Jefferson, Boulder, Gilpin, Clear Creek, Adams, Denver, Arapahoe, north Douglas, edge of Park¹ | 23 / 22 |
| `northern-front-range` | N. Front Range | Northern Front Range | Larimer, Weld — Fort Collins, Greeley, Loveland, Red Feather | 7 / 7 |
| `estes-park` | Estes Park | Estes Park / RMNP | Larimer (Estes Park town and RMNP approaches only — the rest of Larimer is `northern-front-range`) | 6 / 6 |
| `mountains-western-slope` | Western Slope | Mountains / Western Slope | Routt, Grand, Jackson, Gunnison, Pitkin, Mesa, Delta, Summit | 20 / 20 |
| `central-mountains` | Central Mtns | Central Mountains / Sawatch | Lake, Chaffee, Eagle² — Upper Arkansas valley and the Sawatch | 7 / 7 |
| `fairplay-south-park` | South Park | Fairplay / South Park | Park (Fairplay, Como) | 2 / 2 |
| `southern-colorado` | Southern CO | Southern Colorado | Pueblo, Fremont, Huerfano, Custer | 6 / 6 |
| | | | **Total** | **102 / 101** |

*(Listed = rows rendered. Counted = rows contributing to displayed numbers — see the counting rule below. Counts current as of the Sourdough verification (102 events, 101 counted); the "Covers" column names counties rather than towns, since the town lists stopped being representative once regions held 15+ events.)*

¹ Sawmill Trail Runs straddles the Jefferson/Park line at Pine; it is a Denver-foothills race that happens to clip Park County, **not** a South Park event. ² TransRockies finishes in Eagle County after starting in Lake — see the cross-boundary note below. Both are artifacts of `location.county` being an array; neither implies the region owns the whole county.

**County extensions, reasoned rather than arbitrary.** Denver and Arapahoe joined `denver-metro` with the Denver Beer Co 50K, which runs Arvada→Littleton across four counties — unremarkable, they are the metro's core. The two that needed a real argument, recorded here so neither reads later as an unexplained exception:

- **Summit County → `mountains-western-slope`** (The Summit 200). Summit is west of the Continental Divide and is the same high-mountain-resort character as Grand, Pitkin and Routt, all already in this region. The alternative was `central-mountains`, but that region is specifically the Upper Arkansas valley *east* of the Divide — putting Summit there would repeat exactly the Divide-crossing error the audit had just finished fixing.
- **Rio Grande County → `san-juans`** (La Garita 200). The La Garita Mountains are part of the broader San Juan volcanic field, and South Fork sits immediately adjacent to Creede in Mineral County, already in this region. This one is a genuine judgment call rather than a clean geographic fact — the La Garitas are a distinct sub-range, and if the dataset ever grows a real San Luis Valley cluster, Rio Grande County is the first thing that should be reconsidered.

**The two new regions, and why they had to exist:**

- **`central-mountains`** — Lake and Chaffee counties: Leadville, Buena Vista, the Upper Arkansas valley under the Sawatch. Six events, previously split between `san-juans` (the two Leadville races) and `mountains-western-slope` (the Buena Vista cluster). Neither was defensible: Leadville is not in the San Juans, and the Upper Arkansas is *east* of the Continental Divide, so it isn't the Western Slope either.
- **`northern-front-range`** — Larimer and Weld counties: Fort Collins, Greeley, Red Feather Lakes, Eaton. Five events previously filed under `denver-metro`. Fort Collins and Greeley have their own metropolitan statistical areas and sit 55–60 miles from Denver; grouping them with Denver was a map-space artifact, not a real geography.

**Two straight reassignments, no new region needed:** Devil on the Divide (Empire / Idaho Springs, Clear Creek Co.) moved from `mountains-western-slope` to `denver-metro` — it's on the I-70 corridor east of the Divide, inside the Denver MSA. Never Summer (Gould, Jackson Co.) moved the other way, from `denver-metro` to `mountains-western-slope` — it's in the North Park basin, ~150 miles from Denver over Cameron Pass.

**Deliberately *not* changed:** Fairplay/South Park stays its own region rather than folding into `central-mountains`, despite being geographically adjacent. South Park is a distinctly recognizable Colorado basin in its own right, and collapsing it would lose something a Colorado runner actually recognizes. Two events is a small region; that's fine.

**Label changes are consequences of the audit, not taste.** `san-juans` dropped its "/ High Country" qualifier because that clause existed to cover Leadville and no longer has anything to cover. `front-range-cs` became "Colorado Springs / Pikes Peak" because a bare "Front Range" is ambiguous once `northern-front-range` exists. `denver-metro` became "Denver Metro & Foothills" because Golden Gate Canyon, Conifer, Pine, Nederland and Empire are mountain communities at 7,500 ft+, and the plain label undersold half the region. **Slugs did not change** — they're URL contract, and existing share links still resolve.

**TransRockies Pass to Pub is filed under `central-mountains` as a deliberate simplification, and Phase 5 must not treat that as solved.** The race starts in Leadville (Lake Co.) and finishes in Red Cliff (Eagle Co.), crossing the Continental Divide at Tennessee Pass mid-race. No single region is fully correct. A filter chip needs one discrete value, so it gets one; a *route* does not fit one value, so the map view should give it real treatment — a route line, or paired start/finish markers — rather than dropping a single pin and calling the question closed. This is the same lossiness `SCHEMA.md` §6.7 flags about its stored coordinate, now also true of its region. It is the only event in the dataset with this property.

**Resolved in Phase 5, as promised.** The map draws it as a four-point dashed corridor — Leadville → Tennessee Pass → Camp Hale → Red Cliff — with distinct start and finish caps and permanent labels, and it is visibly not a pin. The region value is unchanged and still `central-mountains`, because a chip still needs one discrete value; what changed is that the *geometry* no longer pretends the value is the whole story. Geometry and the reasoning for it live in `ROUTES` in `src/lib/map-data.ts`. See §7 item 5.

**Counting rule (settled here, applies to every view from Phase 4 on):** events with `status: discontinued` or `status: unverified` **do not contribute to any displayed number** — not the overall result count, not a faceted chip count, not a masthead stat. They remain fully visible and browsable in the list, keeping their existing rust/hatched treatment. This is a *counting* rule, not a visibility rule, and the two must not be quietly merged by a later phase: hiding these events would defeat the point of carrying them, which is that the record is complete. `active` and `returning` count normally — a returning race is coming back.

Implemented as `countsTowardTotals` in `src/lib/races.ts` (the single definition), surfaced per row as `data-counted` so the browser script never needs to know the status vocabulary. Two consequences worth knowing before they look like bugs: **Denver Metro's chip reads one below its row count**, because the excluded event lives there; and a filter combination can legitimately produce **a count of 0 with rows still on screen**. The list view handles the second by tracking rows-shown separately from events-counted, so the "nothing matches" copy never appears above a visible row, and by showing a "+n shown, not counted" note in the results bar whenever the two diverge. Phases 4 and 5 need the same split.

**Only one record is currently excluded** — Golden Gate Dirty 30, `discontinued`. Sourdough Snowshoe held the `unverified` slot until it was verified and promoted to `active`, which emptied that status entirely. Two lessons from that promotion, both already applied. Any UI copy asserting a fact about the data must be *derived* from it: the masthead tooltip and the legend both hard-coded "one discontinued, one unverified" and silently became false the moment the status changed, so the legend now renders only statuses that have rows behind them. And the rule itself stays written against the *statuses*, not against whichever races happen to hold them — `unverified` having no members today is not a reason to drop it from the vocabulary.

**Dataset coverage — where the 102 events came from, and what is deliberately absent.** Two passes after the region audit grew the dataset: a completeness pass took it 75 → 90, then a Tier B verification pass took it 90 → 102. All additions were confirmed-active with organizer-level or equivalent sourcing. What remains deliberately absent, and should not be treated as an oversight to fix:

- **Tier B — resolved.** The ~13 calendar-listed-only events have now been through their verification pass: 12 were confirmed against organizer sources and added; the 13th, the **John Cappis 50K Fat Ass**, was excluded as invite-only under §5.5. Tier B is closed, not outstanding.
- **Tier C — ~10 dormant events.** No 2026 or 2027 listing anywhere. This is a weaker state than `status: unverified`, which means "reported but unconfirmed" — Tier C is closer to "no evidence this still runs." Adding them as `unverified` would overstate what we know; the status vocabulary has no honest slot for them, and inventing one is not worth it for events nobody can enter.
- **Babbitt's Backyard Ultra — rejected outright,** not deferred. Arizona event, mis-geocoded into Colorado. See §5.3.
- **Mountain Ridge — checked and excluded, don't re-investigate.** Flagged as a gap when it turned up on Aravaipa's Colorado calendar and wasn't in the dataset. It is real and genuinely Aravaipa's, but its headline distance is **21 miles** — short of a marathon, well short of the 50K ultra floor. Same treatment as Kendall Mountain Run and Ouray Mountain Trail Run (SCHEMA.md §6.3): real races, not ultras.

  **Useful provenance attached to this one:** Mountain Ridge came to Aravaipa in a November 2024 acquisition of five races from Endurance Race Series. That acquisition is also the explanation for the organizer corrections already applied to **Westminster Trail Race** and **Snow Mountain Ranch** — those weren't sloppy prior research, they were records that went stale when the events changed hands. Worth remembering the next time an Aravaipa organizer field looks wrong: check for a transfer before assuming an error.

**Open data question — resolved, corrected.** The completeness pass flagged that the organizer's own site for **Weld Your Mettle** listed fixed distances alongside the 36-hour timed event while the record carried only timed options, and left it alone: that pass was scoped to verifying the *location* (which held — Eaton, not Windsor as UltraRunning lists), and §5.3 says format changes get human confirmation rather than a unilateral edit. Confirmed and applied since. The record now carries 100 mi (headline) / 100K / 50 mi / 50K / 36-hr timed, `distance_category: "100m"`, with 14 mi, marathon and the two 7K events as companions.

This was a textbook §5.3 error and worth keeping as the worked example. The event's *headline* distance is 100 miles, but because every entry in `ultra_distances` was a timed one, the derivation produced `formats=[timed] dists=[timed]` — leaving it invisible to **every** distance filter on the site. Not a cosmetic mislabel: a runner searching for a Colorado 100-miler simply could not find it. Post-fix it derives `formats=[standard timed] dists=[100m 100k 50m 50k]`, verified against the built page. Two lessons. First, the damage from a format error is silent — nothing looks broken, results are merely absent, which is why §5.3 ranks this class above date/location errors. Second, no schema or code change was needed: the mixed-format derivation built in Phase 3 handled it the moment the data was right, the same as Front Range Ultra Dayze, The Pilgrimage and Haul Ass.

---

## 4.5. Phase 3 scope additions (pulled forward from later phases)

Two things originally scoped later, deliberately moved up before Phase 3 started because retrofitting them after filter components already exist is more disruptive than building them in from day one:

- **Shareable/bookmarkable filtered URLs** — moved from Phase 6 into Phase 3. Filter state (format, distance, region, date, sub-50K toggle) should be reflected in the URL so a filtered view can be shared or bookmarked.
- **Baseline mobile usability** — distinct from mobile *polish* (still Phase 6). The site should be genuinely usable on a phone from Phase 3 onward, not just functional on desktop with polish deferred; a race-finder tool that doesn't work on mobile for three phases is a real gap given how people actually browse this kind of thing.

---

## 4.6. Phase 4 scope addition: event permalink pages pulled forward from Phase 6

**Decision:** every event gets a real, stable, linkable page (using the existing `slug` field from §4 — e.g. `/races/hardrock-100`), built in Phase 4 alongside the calendar rather than deferred to Phase 6. Both the list view (Phase 3) and the calendar (Phase 4) should link to these pages, not just show inline expansions.

**Why pulled forward:** two reasons, one immediate and one strategic.
1. Immediate: gnarlist.co is now live and deliberately indexable (§2.4) — individual event pages with real metadata (title, description, canonical URL) are genuinely more search-discoverable than a filtered list view, and there's no reason to wait on that benefit.
2. Strategic: these pages are the intended future home for community features not yet built — reviews, photos, and similar user-contributed content. That's explicitly still deferred (§2.3, §6 — no live database, no submissions yet), but the pages themselves need to exist with room to grow into that role rather than being retrofitted later. Build the page with reasonable structural room for future sections; don't build any review/photo infrastructure now.

This is the same "retrofitting later is more disruptive than building it right the first time" logic as §4.5, applied one phase later.

---

## 5. Data governance principles (carried forward from this project's research phase)

These are hard-won and should inform both the data schema and the eventual maintenance workflow:

1. **Don't trust a single aggregator.** UltraSignup, RunningInTheUSA, RunGuides, etc. each carry stale, duplicate, or misclassified entries. Cross-reference against the race's own organizer site before trusting a listing.
2. **"Not confirmed" is a legitimate data state, not a gap to hide.** Several fields (year started, exact date) are genuinely unconfirmed for some events — the schema and UI should be able to represent that honestly rather than forcing a guess.
3. **Format/category errors are the most dangerous kind.** This project has caught a mountain bike race (Colorado Trail Race) and a running-but-not-ultra race (Louisville Trail Races) both miscategorized as active running ultramarathons. Any automated or semi-automated data collection should flag category/format for human confirmation, not just date/location changes.

   **Aggregators also invent forward-dated listings.** Royal Gorge Groove sat in the dataset as a *confirmed* `2027-04-25`. Aravaipa's own calendar gives Apr 25 **2026**, and lists 2027 as TBD — the 2027 almost certainly came from an aggregator auto-generating a next-year page (RunGuides has one) that a prior pass read as authoritative. Mild compared to the cases below, but the same root cause, and it had produced the worse failure of the two states: a `date_confirmed: true` on a date the organizer had never announced. Prefer the organizer's calendar for dates, and treat a bare next-year listing as a placeholder until the organizer confirms it.

   **Same family, different mechanism — aggregator geocoding drift.** The completeness pass rejected **Babbitt's Backyard Ultra**, which aggregators list as Colorado. It is a Flagstaff, *Arizona* event, mis-geocoded onto Colorado's Flagstaff Mountain (above Boulder) by a name collision. **Do not add it.** The lesson generalizes past this one race: an aggregator's *location* field is derived data, not sourced data, and a plausible-looking Colorado coordinate is not evidence the race is in Colorado. Verify the venue against the organizer, the same way format gets verified.
4. **Prefer PR-based review over silent overwrites** for any data update, automated or manual, at least until the process has a long track record.

5. **An event needs open registration to be listed.** GnarList exists so a runner can find a race they could actually enter. An event that cannot be entered — invite-only, application-only, or otherwise closed to the public — fails that purpose no matter how real or well-established it is, and listing it wastes the reader's time in a way a missing entry does not. Established by excluding the **John Cappis 50K Fat Ass**, which is genuine and long-running but invite-only.

   This is a scope boundary, not a quality judgement, and it is deliberately narrower than the other exclusion tests: a free, informal, or barely-publicised race still qualifies as long as anyone may sign up. It also differs from `status: unverified` — that means "we are not sure this runs", whereas this means "we are sure it runs and equally sure you cannot enter it". Neither the status vocabulary nor a filter chip is the right home for the distinction; the event simply stays out of the dataset.

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
   - ~~No self-hosted webfont yet — the condensed display stack currently falls back to whatever's installed locally (Noto Sans Condensed / Liberation Sans Narrow / Arial Narrow / system-ui depending on OS), degrading gracefully but inconsistently. Self-hosting Oswald or Archivo Narrow is the real fix — deliberately left for Phase 6 rather than adding a font binary/license mid-session.~~ **Resolved in Phase 6 — Oswald, self-hosted, see §7 item 6.**
   - ~~`npm run check` (TypeScript enforcement) isn't wired up — Claude Code declined to add `@astrojs/check` + `typescript` as devDependencies without being asked. Types currently function as documentation, not CI enforcement. Worth adding explicitly if desired.~~ (**resolved, §7 item 7** — and the deferral cost more than it saved: with the dependency absent `astro check` exits **0** without checking anything.)
   - TransRockies Pass to Pub surfaces under Format→Stage but deliberately not Distance→50mi, since its distance lives in a `stages` field rather than `miles`. Confirmed as the right call — a multi-day stage race isn't equivalent to a standalone 50-miler for someone filtering by distance.
4. **Calendar view + event permalink pages** — interactive, filterable calendar generalizing the static poster, plus a real linkable page per event (pulled forward from Phase 6, see §4.6 — both the list and calendar views link to these pages). **Status: built, pending the user's visual confirmation.** `/calendar/` renders all 102 events in twelve month blocks; `/races/<slug>/` renders the full record for each of the 102. `astro.config.mjs`'s `site` now reads `https://gnarlist.co`, so canonical/OG URLs point at the canonical domain rather than the `workers.dev` one.

   **How these were actually implemented in Phase 4** (appended per the documentation convention above; §4's Phase 3 note is the model):

   - **Filter state crosses views in the query string, and nothing about the filter engine was reimplemented.** `src/lib/filters.ts` is imported unchanged; `src/scripts/filter-client.ts` was generalized from "the list view's script" into a view-agnostic one that both pages import. It now knows four DOM contracts and nothing about layout, which is the opt-in path for Phase 5's map: `[data-race]` (an event, carrying its tokens as data attributes), `[data-break]` (a heading owning the sibling events that follow it — the list's month rules), `[data-group]` (a container owning the events inside it — the calendar's month blocks), and `[data-view-link]` (a link to the other view, rewritten on every filter change so the live state travels with the click). Those data attributes come from one shared helper, `filterAttrs` in `races.ts`, used by both the list row and the calendar cell, so the two views cannot drift into filtering differently.
   - **Verified by driving it, not by reading it.** Chrome over CDP: three chips clicked on the list (`?dist=50m&region=san-juans&month=7` → one row), the Calendar link clicked, the calendar landing on the same URL with the same chips checked and the identical one-event result; a chip then unchecked *on the calendar* and the List link clicked back, again identical. Permalink click-through, canonical tag, filter-restoring back-links, Clear, and no horizontal overflow at 305/375/390/753/1024 px all checked the same way.
   - ~~**Month-density variance is handled by CSS multi-column, not a grid.**~~ **Superseded by the calendar redesign below** — the multi-column layout solved the density problem and lost on reading order. The half of this that survived: **a month box is never removed**, even when a filter empties it; it collapses to a slim "No events" state so the year keeps its twelve-box shape. March is empty in the dataset and renders that way at rest, which is a fact about the Colorado season, not a gap.
   - ~~**A density strip above the grid** doubles as the season profile and as mobile navigation.~~ **Half superseded by the redesign below** — the per-month day timelines took the density job; the strip kept the navigation job, and only at the widths where it still has one.
   - **Mobile** is one column of blocks, which without the jump strip would be barely distinguishable from the list. Cells keep full-size tap targets; the whole cell is the hit area via a stretched pseudo-element on the single name link, so the accessibility tree still says "one race, one link".
   - **Permalink routing is `/races/<slug>/`**, generated by `getStaticPaths` from `allRaces()`, with `raceHref()` in `races.ts` as the single place a slug becomes a path. Note for future sessions: **Astro evaluates `getStaticPaths` in its own module scope**, so helpers it calls must be imports, not frontmatter functions — `nearestInRegion` lives in `races.ts` for that reason, not by preference.
   - **Permalink URLs deliberately carry no filter params.** Clean canonical URLs matter more here than a round-trip, so filter state rides in `sessionStorage` (`FILTER_STORE` in `filters.ts`) instead: the filter client writes it on every change, and `src/scripts/race-back.ts` reads it back — through the parser, not raw — to point the "back to the list / calendar" links at the state the visitor left. Purely additive; with storage refused the links are the plain hrefs already in the HTML.
   - **Room to grow, without the growth.** The permalink is a document column plus a facts rail, not one dense table, and the column is a stack of self-contained `<section class="block">` siblings. Reviews and photos land as further siblings — there is a marked insertion point in the file. No review/photo infrastructure was built (§2.3).
   - **Copy asserting a fact is derived, never written out** — the same rule §4 records for the masthead. Page titles, meta descriptions and the "surfaces under" explanation are all computed from the record, so a distance or status change can't leave a stale sentence behind.
   - **Three small defects found and fixed while verifying, worth knowing they were deliberate:** `compressHTML` (Astro's default) eats the whitespace between adjacent elements, which had the shared results bar rendering as "101 EVENTSOF 101" — the spaces are now explicit `{' '}`; a multi-day event's "25–27" overflowed the calendar's day track into the race name, so ranges step down a font size rather than widening the track for the common single-day case; and the density bars needed a fixed-height track to resolve their percentage against, without which every month came out the same height — which is exactly the information the strip exists to carry.

   **Known follow-ups from Phase 4, not blockers:**
   - ~~The Phase 3 follow-ups still stand — no self-hosted webfont, and `npm run check` still isn't wired up (`@astrojs/check` + `typescript` remain unadded). Phase 4 added no new TypeScript enforcement either.~~ (**both resolved** — webfont in §7 item 6, `astro check` in §7 item 7.)
   - ~~No `sitemap.xml`.~~ **Resolved by the discoverability pass below.**
   - ~~No JSON-LD `Event` structured data on the permalinks.~~ **Resolved by the discoverability pass below.**

   **Discoverability pass (sitemap, structured data, robots.txt) — run immediately after Phase 4, closing two of its own follow-ups.** Not a phase of its own; it exists because Phase 4 left 104 indexable pages with nothing pointing a crawler at them. Three deliverables, and three decisions inside them that were made rather than defaulted into:

   - **`@astrojs/sitemap` (3.7.3), no configuration.** Emits `sitemap-index.xml` + `sitemap-0.xml` from the already-correct `site`. Verified by parsing the output rather than trusting the integration: 104 `<loc>` entries, no duplicates, all absolute on `https://gnarlist.co`, and the set of `/races/<slug>/` URLs compared against `races.json` for exact equality — all 102 present, none extra — plus `/` and `/calendar/`.
   - **Sitemap inclusion: discontinued and unverified event pages are in, deliberately.** The argument that settles it isn't SEO, it's consistency: §4's counting rule is written as *"a counting rule, not a visibility rule, and the two must not be quietly merged by a later phase."* Filtering those pages out of the sitemap would be exactly that merge, one step further removed — a counting rule becoming a discoverability rule. It is also the right answer on its own terms. "Is the Dirty 30 still happening?" is a real query, that page answers it, and the answer being *no* is what makes it worth finding. Nothing in the codebase encodes an exclusion, so there is no `filter` to remove later; the decision lives in a comment in `astro.config.mjs` and here.
   - `changefreq` and `priority` are omitted on purpose. Google has said it ignores both, and emitting them 104 times would be decoration that reads as signal.
   - **`public/robots.txt`** — `Allow: /`, no blanket `Disallow`, and a `Sitemap:` line. See §2.4.
   - **JSON-LD `SportsEvent` on all 102 permalinks**, built by `src/lib/structured-data.ts` and injected through a new named `head` slot on `Base.astro`. `SportsEvent` over plain `Event` because it is a strict subtype, it is accurate, and a consumer that only understands `Event` still reads it. Each mapping that required a judgement is argued in that file rather than decided inline; the three that mattered:

     - **Dates are gated on `date_confirmed`, not on whether a date exists.** 91 of 102 emit `startDate`; the other 11 emit **no date at all**. The tempting middle option — ISO 8601 reduced precision, `2026-07` for a "typical early July" race — was rejected because a consumer that doesn't handle reduced precision coerces it to `2026-07-01` and surfaces "July 1, 2026". That is precisely the synthesized specific date this project has spent three phases refusing to write down, laundered through a parser. The cost is real and accepted: those 11 pages are not eligible for date-bearing rich results. The page still shows the typical window in tilde-marked prose, which is where a hedge can actually be expressed.

       **The worked example is Leadville Trail 100**, which has a `date_start` of `2026-08-15` and emits nothing, because its own `date_display` reads *"Aug 15–16, 2026 (confirm exact date)"*. §5.3's Royal Gorge Groove case was the mirror image — a `date_confirmed: true` on a date the organizer had never announced — and it is the reason this gate reads the confidence flag rather than the presence of a value. `endDate` is emitted only where `date_end` exists; repeating `startDate` for single-day events was rejected on the same grounds, since several timed events plainly run overnight without a recorded end date.

     - **`eventStatus`: three mapped, one deliberately silent.** `discontinued` → `EventCancelled` (the one mapping that earns its keep — it is the machine-readable form of the answer Golden Gate Dirty 30's page exists to give). `active` and `returning` → `EventScheduled`. `unverified` → **omitted**, because no schema.org value means "reported but not independently confirmed" and every candidate asserts more than we know.

       `EventPostponed` was considered for `returning` and rejected: schema.org defines it as a scheduled instance moved with no new date set, whereas a returning race is an annual event that skipped a season and is expected back on its normal schedule. Nothing was postponed. Both returning records also carry `date_confirmed: false`, so they emit no date either way — `EventScheduled` plus no date says exactly what we know, and matches §4's existing call that a returning race counts normally because it's coming back.

       As with the counting rule, this is written against the *statuses*, not against whichever races hold them. `unverified` has no members today; §4 already records why that is not a reason to drop it from the vocabulary.

     - **`organizer` only where confirmed and named** — 75 of 102. The page renders an unconfirmed organizer with an explicit "Not independently confirmed" caveat and structured data has nowhere to carry that. The decisive detail, though, is that **24 of the 27 unconfirmed values are the placeholders `"Independent"` and `"Formerly independent RD"`** — notes about the *absence* of a known organizer, not organization names. Emitting `Organization { name: "Independent" }` two dozen times would be worse than emitting nothing.

     - `addressLocality` comes from `coordinates.derived_from`, **not** from `location.town`. They are not the same field doing the same job: for seventeen records `town` is a route or an area — "Leadville to Red Cliff", "Arvada to Littleton", "Summit County loop (Dillon, Frisco, Montezuma, Keystone, Breckenridge)" — true statements about a race and false ones about a postal address. `derived_from` is by construction the single named place the stored coordinate resolves to, and every record formats it as `<place>, Colorado`, so it parses cleanly. `location.town` still goes out as the `Place` name, where the longer descriptor is exactly right. Five of the seventeen resolve to a park rather than a town (Staunton State Park, Roxborough State Park, Grand Mesa); imperfect as a locality, but it is where the coordinate actually is, which beats a hand-maintained exception list.

     - Deliberately absent: `image` (no image data exists and a placeholder would be a fabrication), `offers` (no entry-fee or registration-URL data — §6's deferred territory), `performer` (meaningless for a mass-participation race).

   - **Verified structurally across all 102 pages, not spot-checked:** exactly one `application/ld+json` block per page, each parsed with a real JSON parser, `@context`/`@type`/`name`/`url`/`description`/`location` present, `name`/`url`/`geo` compared field-by-field against `races.json`, and each of the three decisions above re-derived from the source record and asserted against what was emitted. Zero failures. Distribution came out as predicted: 91 `startDate`, 20 `endDate`, 101 `EventScheduled` / 1 `EventCancelled`, 75 `organizer`, no placeholder organizer names. The serializer escapes `<` to `\u003c` so a race note containing an HTML tag can never close the `<script>` element early — the data is ours, but "our data would never contain that" stops being true the first time it does.
   - Phase 4's behaviour was re-checked after the fact, since this pass touched `Base.astro` and the permalink page: list → calendar filter handoff still identical, permalink click-through, canonical, filter-restoring back-links, live in-browser JSON-LD parse, and no horizontal overflow at 305/390/1024 px.

   **Calendar redesign — row-major grid + per-month day timelines.** Run after the user reviewed the built calendar. Three complaints, all fair: it read as redundant with the list view, the column-major reading order (all the way down column one, back to the top for column two) fought normal reading flow, and it didn't register as *a calendar*. Row-major order was non-negotiable; a full day-by-day grid was considered upstream of this session and rejected as overkill given how unevenly events fall across days within a month.

   **The tension, and how it was resolved.** Row-major reintroduces exactly the problem multi-column existed to avoid: a CSS Grid row is as tall as its tallest box, so a 20-event September next to a 2-event December wastes the difference. Native CSS masonry is still Experimental / not Baseline per MDN, so it isn't available. The resolution is two changes that compound, and the second is only cheap because of the first and third:

   1. **The event row got compact, and that is the main lever.** ~26px single lines — day, name, one distance chip — against the old cards' ~70px. Town, hook text and companion distances are gone from the calendar entirely: the list says all of that better, and stripping it is what makes the two views distinct rather than redundant. Cutting per-event height by two thirds cuts the *variance* between months by the same factor, before layout is touched at all.
   2. **Three across on wide screens, which makes each row a calendar quarter.** This is the load-bearing detail and it is not a coincidence: in a seasonal sport, calendar quarters group months of similar density. Jan/Feb/Mar hold 1/2/0 events and make a tiny row with almost no waste; Jul/Aug/Sep are all busy. Four across was tried on paper and is worse — it puts November and December in September's row.
   3. **Accept the bounded remainder, with `align-items: start`.** Letting short boxes stretch would move the dead space *inside* an empty-looking card; leaving them honestly sized puts it below, where it reads as breathing room.

   **Measured, not estimated.** At 1440px the grid is 4 rows of 3: 4,073px of content in 5,366px of allocated cell height — **24% whitespace, 1,292px**, and a total grid 1,928px tall against roughly 1,358px if perfectly packed. So row-major costs about 40% more page height. That is the price of the reading order, it is known, and it is worth paying.

   **Alternatives not chosen.** *JS-driven packing* (measure and assign `grid-row: span n`) was the brief's third option and is the one that genuinely can't work here: grid auto-placement with row spans packs items into whatever slot is free, which destroys the Jan→Dec reading order that is the entire point of the change. Packing and strict row-major are mutually exclusive, not merely more effort. *Capping visible rows per month behind a "+8 more"* would have equalised box heights almost perfectly, and was rejected because hiding eight of September's twenty events to save whitespace is a bad trade in a view whose job is showing you the season.

   **The day timeline is what makes it a calendar.** Each box carries a compact strip of its month's days with every event drawn at its real day-of-month position; multi-day races are spans, not points. Geometry lives in `src/lib/timeline.ts`. Four decisions inside it:

   - **Placement is gated on `date_confirmed`, not on whether a `date_start` exists** — the same rule the JSON-LD work applied to `startDate`, applied rather than re-decided. Drawing a mark on day 15 asserts "this race is on the 15th" exactly as `startDate` does; an unconfirmed date is not licence to make that claim in pixels instead of JSON. **Leadville Trail 100 is again the worked example**: it has a `date_start` and is still not placed, because its own `date_display` says "(confirm exact date)". Ten of 102 events land in a **"~" gutter to the left of the day axis** — kept, with their status colour, drawn as a *dashed* column. Solid was worse than wrong: it made the events we know least about the loudest marks on the strip, and July's five looked like the busiest week of the year. Dashes for uncertainty is the idiom the unverified status already uses.
   - **Simultaneous events stack into lanes** rather than overlapping. Six races share 26 September; as one thick tick that lies about the day and leaves five of them unclickable. Greedy first-fit over start day, which is optimal on a line. September needs seven lanes, most months three or fewer. Lane count is computed at build time and does **not** shrink under a filter — a stable axis height beats a layout that jumps every time a chip is toggled.
   - **A mark occupies its day *cell*, not a point**, so one day is one cell wide and a three-day stage race is visibly three. Colorado 24 Hour Run (31 Oct – 1 Nov) is clamped to the month edge and flagged rather than being drawn as finishing on the 31st or pushed into November.
   - **The strip is `aria-hidden` and its marks are `tabindex="-1"`.** Every mark duplicates a row directly below it; exposing both would read the month twice to a screen reader and put ~20 extra stops in the tab order. The rows carry all the semantics and all the keyboard access. The marks are still `<a href>` to the permalink, so with JavaScript off a mark does something useful rather than nothing.

   **Timeline ↔ list connection.** Hovering a mark cues its row; clicking one cues *and* scrolls it into view (`block: 'nearest'`, so it moves inside its own box rather than yanking the page). Hovering a row lights its mark, so the two read as one object. A mark is a pointer into the list, not a destination — which is why click deliberately doesn't navigate when it can do something more useful. Lives in `src/scripts/calendar-timeline.ts`, **not** in `filter-client.ts`, which Phase 4 promised would know nothing about layout. Keeping that promise needed one new thing: **`filter-client.ts` now dispatches a `gnarlist:filtered` CustomEvent on `document` after every pass** — a fifth contract, and the only outbound one. The timeline script uses it to mirror row visibility onto its marks, since a mark is not a `[data-race]` and must not be (giving it the filter attributes would have doubled every count in the results bar). Phase 5's map can use the same signal.

   **The year density strip: kept, halved.** Its two jobs came apart. Density is now done better by the timelines, which show *when* as well as *how many*, and two density visualisations on one page compete — so the bars are gone. Navigation survives, but only below the three-column breakpoint: at ≥68rem the row-major grid is the whole year on about a screen and a half and you can simply look at October, so the strip is `display: none` there rather than deleted. It earns its place on a phone, where twelve boxes are one column and reaching October means scrolling past September's twenty events.

   **Two bugs worth remembering, both found by looking at the render rather than the build.** `r.date_end && endsThisMonth ? … : days` sent every *single-day* event (where `date_end` is null) to the end of the month — 91 marks silently wrong, and the build was perfectly happy. And `* { box-sizing: border-box }` in `global.css` meant a mark declared `height: 4px; padding: 6px 0` had its content box collapse to zero, so `background-clip: content-box` painted nothing at all: the whole day axis was invisible while the DOM looked correct. The enlarged pointer target is a `::after` overlay now. Both are the verification convention earning its keep — a green build said nothing about either.

   **Re-verified after the redesign, not assumed from the previous session:** list → calendar with three chips gives an identical single-event result set and identically checked chips, and the reverse direction holds; timeline marks hide and reappear exactly with their rows (1 of 101 visible under the filter, all 101 back after Clear); hover-cue, click-cue, single-cue-at-a-time, the no-JS permalink href and the `aria-hidden`/`tabindex` stance all check out; 10 events in the gutter and 91 on the axis with no overlap and none missing; and no horizontal overflow at 305/390/600/753/1024/1440 px, at 1/1/1/2/2/3 columns.

   **Still open after this pass:** no `image` for rich results, no `offers`. ~~and the Phase 3 webfont / `astro check` items remain untouched.~~ (**both since resolved** — §7 item 6 and §7 item 7.)
5. **Map view** — interactive Leaflet map (§2.2), filterable, real zoom-based clustering instead of manual insets. **Read §4's region scheme first:** TransRockies Pass to Pub is a genuinely cross-boundary route whose single region value and single coordinate are both deliberate simplifications for the filter/pin, and this view is where that's supposed to get honest treatment. **Status: built, pending the user's visual confirmation.** `/map/` renders all 102 events over free OSM tiles, clustered, filtered by the same engine as the other two views. 105 pages now build.

   **How this was actually implemented in Phase 5** (appended per the documentation convention; §4's Phase 3 note and §7 item 4's Phase 4 note are the models):

   **Two design tensions were named up front. Both are resolved below as the working decision that unblocks this phase — not as final palette. A full design/colour sweep is the planned next piece of work, and the map exists partly to give it real material: colours here have to hold up against basemap tiles, which is a constraint the list and calendar never had.**

   ---

   **Tension 1 — what marker colour encodes. Answer: on this view, colour encodes nothing about distance. Distance moved to size.**

   The static poster colour-coded pins by distance category, and that palette almost certainly used amber somewhere in the 100-mile tier. §2.5's discipline — *gold means marquee, nothing else* — is load-bearing for the list and the calendar, so importing the poster's palette would have broken a rule two shipped views already depend on. The brief offered two honest exits: a distance palette that avoids gold, or colour meaning something else here. **The second was chosen, and the argument that settles it isn't the gold conflict — it's that hue was the wrong encoding for distance in the first place.**

   Distance is *ordered* data: 50K < 50 mi < 100K < 100 mi < 200 mi. Hue is not an ordered variable; size is. A categorical hue ramp makes a reader consult a legend to learn that orange beats green, where a bigger dot needs no legend at all. The poster used hue because print has no zoom and no interaction to spend — a printed map has exactly one visual channel going spare and it is colour. An interactive map has size, and clustering, and a popup. So:

   | Channel | Encodes | How |
   |---|---|---|
   | Radius | Longest distance offered | 9 → 26 px across six steps, `TIER_PX` in `src/lib/map.ts` |
   | Fill | Marquee, and only marquee | Gold if marquee, cool grey-blue (`--map-pin`) otherwise |
   | Outer ring | Status | Absent for `active` (99 of 102); teal / rust / dashed gold otherwise |
   | Soft halo | Coordinate is town-level | See tension 2 |
   | Centre pip | Coordinate is venue-level | See tension 2 |

   Four channels, four different CSS mechanisms (box model, `background`, `outline`, `box-shadow`/`::before`), chosen so no two can collide on one marker: Ouray 100 is marquee **and** returning **and** town-level and reads as all three at once. **Marquee is never ambiguous with distance** because they are not the same channel — a big pin is a long race, a gold pin is a marquee race, and a big gold pin is both. **Zero new hues were introduced**, which is the second reason this answer is right just now: the design sweep inherits four inks, not ten.

   Two consequences worth knowing before they look like oversights:

   - **A cluster gets a gold ring when it contains at least one marquee event.** Without it, zooming out hides every ★ on the map, which is exactly backwards — the marquee races are the ones you want to spot from statewide. It is still only ever marquee that gold means.
   - **The 22 timed and backyard events are drawn as hollow rings at a neutral middle size, not as a size step.** They have no fixed distance; how far you go is the question the race asks. Giving them a radius would be inventing an answer, and the ring says "open-ended" without borrowing one. `sizeTier()` derives this from `tokens.distances`, so it agrees with the distance filter by construction — a pin's size can never disagree with the chip that surfaced it. Chase the Moon is correctly *not* in this bucket (12-hour event, but it also offers a real 50K, so it gets a real size). TransRockies is also not in it: its distances live in a `stages` field so no distance token derives, but 51 miles over three days is still 51 miles, and `longest_ultra_miles` is the documented fallback.

   ---

   **Tension 2 — coordinate honesty. 98 of 102 coordinates are town centroids, and the map says so in four places.**

   `coordinates.precision` is `town` for 98 records and `venue` for 4 (all parks, promoted only because a town centroid was materially wrong — SCHEMA.md §3, so the copy says "venue-level", never "exact"). The dataset's 102 events sit on **55 distinct points**; eleven Colorado Springs races share literally one pixel. The list and the calendar never had to admit this because neither draws a position. A map pin asserts "here", and for 98 records that is more than the data supports.

   - **Clustering is load-bearing, not decoration.** `leaflet.markercluster`, and `disableClusteringAtZoom` is deliberately *not* set: coincident points never separate however far you zoom, so the cluster has to survive to max zoom and hand off to spiderfy. That is the entire mechanism by which a same-town pile becomes clickable.
   - **The plugin's default cluster click is wrong for this dataset and was replaced.** Out of the box a click zooms to the children's bounds and only spiderfies at max zoom — an assumption that zooming eventually separates the points. Here it made a reader click *eight times*, watching the map zoom uselessly through Colorado Springs, before the fan opened at z17. Now: if every child shares one coordinate, spiderfy immediately, because zooming cannot help; otherwise zoom to bounds, which is right for a cluster of genuinely distinct places. The fan also gets a minimum `panInside` first, so it doesn't open half off the frame.
   - **The visual signal is a soft halo on town-level pins and a hard centre pip on venue-level ones** — a soft edge for a soft fact, and its opposite where the point really is the point. Legend entries for both.
   - **The words are in the popup, on every marker, with no exceptions.** "Town-level pin — plotted at Leadville, Colorado, not at the start line." This is the same discipline as gating JSON-LD's `startDate` on `date_confirmed` and the calendar's dashed gutter marks: state the confidence, don't launder it.
   - **And the scale of it is quoted above the map, derived rather than written:** "98 of 102 pins are town-level… 11 races share a single Colorado Springs point." Both numbers are computed from `races.json` at build time, so they cannot go stale the way "one discontinued, one unverified" did.

   **Explicitly not done, per scope:** no coordinate was upgraded from town to venue. The map makes the imprecision more visible than the other views did; making it *smaller* is a data-research task, not a map-building one.

   ---

   **TransRockies — the deferred cross-boundary case, delivered.** A four-point dashed corridor from Leadville over Tennessee Pass, past Camp Hale, to Red Cliff, with an "S" and an "F" cap and permanent labels that appear once the route is big enough to read them (the two ends are ~10 px apart at statewide zoom). Three decisions inside it:

   - **It is a corridor, not a course, and it is drawn dashed to say so.** No GPX exists for any event here and sourcing them is deferred (§6). Dashed is this project's established idiom for "we know the shape of this, not the detail of it" — the same idiom the calendar uses for an unconfirmed date. If a real track is ever sourced, `path` in `ROUTES` is replaced and the dash comes off; nothing else changes.
   - **The line is gold because the event is marquee, not because it is a route.** A future non-marquee route would draw in `--map-pin`. The dash is what says "route".
   - **The route is deliberately not in the cluster group.** Clustering its endpoints would fold them into the Leadville pile at every zoom below the last, hiding exactly the thing the route treatment exists to show. It filters with everything else; it just isn't clusterable. Its index row carries the dashed glyph and a "ROUTE" pill rather than a pin, so the row and the map agree about what the event is.

   ---

   **Filtering: `filter-client.ts` was not touched.** Phase 4 promised that file would know four DOM contracts and nothing about layout, and built one outbound signal — `gnarlist:filtered` on `document` — so a later view could opt in without either side learning about the other. The map opts in exactly that way, and the diff on `filter-client.ts` for this phase is empty. `ViewSwitch` grew a third entry and needed no client change either: `wireViewLinks` already iterated every `[data-view-link]`, and with three views there are simply two of them.

   **The index under the map is doing four jobs, which is why the map view has a list on it.** It is (1) the no-JavaScript fallback — Leaflet needs JS, and a blank map page would be the first view in this project to fail that way; (2) the filter substrate, since the filter engine works off `[data-race]` elements and these are those elements, so the map filters through the same code path rather than a parallel one that could drift; (3) the accessibility layer, markers being `keyboard: false` div icons with no useful reading order — the same call the calendar made for its timeline marks; and (4) the map's index in the book sense, the thing a marker points at. It stays distinct from the list view by **grouping on region rather than month** and by leading with the pin glyph instead of a date. Hovering a row lights its pin; picking a pin cues its row — the same two-way relationship the calendar built between a mark and its row, including the detail that a cued marker currently inside a collapsed cluster paints *the cluster*, because zooming the map on hover would be worse than useless. The cue **paints but does not scroll**, which is where this view departs from the calendar: there a mark and its row share a month box, so `scrollIntoView({ block: 'nearest' })` is a nudge, while here the index begins below a 68vh map and the same call had to drag the map — and the popup the click had just opened — off screen to reveal a row 800–1400px down the page. Scrolling only when the row happens to be close would merely make the jump intermittent, so the map view keeps the highlight and drops the scroll.

   **The counting rule reaches the cluster badges.** A badge is a displayed number like any other, so it shows the **counted** total and grows a rust "+n" when the cluster also holds a discontinued or unverified event — the same wording and the same colour the results bar uses for the same gap. Verified arithmetically at rest: 95 counted inside clusters + 5 lone pins + 1 route event = 101 counted, with one "+1" badge accounting for Golden Gate Dirty 30, and 102 markers in total. There is **no status filter on this view**, opt-in or otherwise; discontinued and unverified events are on the map, distinctly marked, exactly as §4 requires.

   **Two interaction decisions that are baseline usability, not polish.** The map is **cooperative-gesture**: every Leaflet handler starts disabled behind a one-tap veil, because a 68vh map mid-page eats a one-finger swipe on a phone and a scroll wheel on a desktop. And the reset control is **"Fit results", not "Fit Colorado"** — filters carry across views, so arriving from the calendar with `?region=san-juans` otherwise leaves fourteen races in the corner of a state-sized frame. For the same reason the map **frames the results on arrival when the URL already carries a filter, and never afterwards**: someone who followed a filtered link means "show me these", but once they have panned somewhere on purpose, yanking the viewport out from under them on a chip toggle is worse than a result sitting off-screen with a button that fetches it.

   **Colour values are centralized, checked because the sweep is coming.** Phase 3 already had the pattern; this phase extended it rather than starting a new one. Every map colour is a custom property in `global.css` (`--map-pin`, `--map-ground`, `--map-panel`, `--map-halo`…) — including the one Leaflet insists on receiving as a JS value, the spiderfy leg colour, which is read back out of the stylesheet with `getComputedStyle` rather than hard-coded. There are no hex literals in any map component. The sweep should be a values-only edit.

   **Four defects found by looking at the render rather than the build, in the tradition of the last two phases:**

   - **The CARTO watermark.** See the §2.2 amendment — a green build served "API KEY REQUIRED" across every tile.
   - **Replacing the cluster icon silently removed the plugin's `marker-cluster` hook class**, which the plugin's own animation CSS and this file's hover/cue rules both key off. Clusters rendered and behaved; only the interaction states were dead, which is precisely the kind of thing a build cannot see.
   - **Spiderfy physically moves each child marker's latlng onto the fan.** The coincidence test that decides spiderfy-vs-zoom was originally asking Leaflet where the markers were, so an *already open* cluster looked non-coincident and a second click jumped straight to max zoom. The test now reads our own `gnar` record, which doesn't move. `fitResults()` had the same latent bug and reads the same source.
   - **`compressHTML` ate the whitespace between adjacent elements twice more** — "…Colorado Springs point.4 carry…" and "map byLeaflet ·source on GitHub". The same failure §7 item 4 records for "101 EVENTSOF 101", now with the same fix (`{' '}`) and a comment in the file pointing at the precedent.

   **Verified by driving it in Chrome over CDP, not by reading it:** three chips on the list → calendar → map, all three landing on the same URL, the same checked chips and the same single result (`Creede 50/100`), then a chip unchecked *on the map* and the trip back to the list giving an identical three-event set — filter persistence re-checked across all three views rather than assumed from Phase 4. Also checked: 102 points in the payload and none of `races.json` leaking into the JS bundle; markers hiding and reappearing exactly with their rows (San Juans → 14 rows, route gone, 3 clusters; Clear → all 102 and the route back); the Colorado Springs pile opening into an 11-marker fan on one click with 11 of them inside the frame; the popup's full content including its precision line; the route rendering gold, dashed, and labelled at both ends; every status/marquee/precision/route glyph combination emitting the class list it should; back-links from a permalink carrying filter state to all three views; the sitemap picking up `/map/` (105 URLs); the no-JS render giving 102 rows, 102 permalinks, a collapsed map and the fallback sentence; and no horizontal overflow at 305/375/390/600/753/1024/1440 px, with the index at 1/1/1/1/2/2/3 columns.

   **Known follow-ups from Phase 5, not blockers:**
   - ~~**The colour/design sweep itself.** Everything above is the working decision, deliberately not a final palette. The map is now the hardest surface to satisfy and should lead that pass.~~ **Run as §7 item 6.** The promise made here held: every map colour was already a custom property, no component carried a hex literal, and the sweep was a values-only edit to `global.css` plus one specificity fix. The map did lead the pass, and it earned the billing — the single worst defect on the site was on this view.
   - The map page ships ~188 KB of JavaScript (Leaflet + markercluster + the filter client). That is the cost of a real map and it loads on `/map/` only, but it is by far the heaviest page on the site and worth remembering if a budget is ever set.
   - Cooperative gestures are a one-tap veil rather than the two-finger-pan idiom Google Maps uses. Genuinely usable, not polished — Phase 6 territory.
   - The four `venue` records are parks, not start lines, so "venue-level" is doing modest work. Upgrading marquee 100-milers to real venue coordinates is still the SCHEMA.md §3 follow-up it was, now with a view that would show the difference.
   - ~~The Phase 3 items still stand: no self-hosted webfont~~ (**resolved, §7 item 6**), ~~and `npm run check` still isn't wired up.~~ (**resolved, §7 item 7**)
6. **Polish** — mobile *polish* (baseline usability already lands in Phase 3, per §4.5), basic search. Permalinks no longer belong here — see §4.6. **Status: partly done.** The design sweep below is the first piece of it; mobile polish and search are still open.

   ---

   ## Design sweep: WCAG AA contrast, self-hosted webfont, collapsible filters

   Run once all three views and the permalinks existed together, which is what the pass was waiting for — colour choices needed a real basemap and real rendered pages to judge against. Three deliverables that share the same components, so they shared a session.

   ### The starting position was as good as Phase 5 claimed

   Checked before touching anything, because the plan depended on it: **every colour on the site was already a CSS custom property in `global.css`**, and no component carried a hex literal that mattered. The grep turns up `#fff` in seven places (all hover/marquee text going to pure white), `#000` once inside a `mask-image` where it is a mask channel and not a colour, and the `rgb(201 117 92 / 4%)` hatching triple repeated in three components. Nothing else. So this was a values-only edit to one file plus a handful of targeted rules, exactly as promised.

   ### Method: sampled pixels, not a table of hexes

   **The audit reads rendered pixels, and it has to.** Almost nothing here is one flat colour on another: the marquee wash is a gradient, discontinued rows are hatched, chip fills are alpha over alpha, and the map is live OpenStreetMap raster tiles under a five-function CSS filter. A hand-maintained list of pairings would have been a list of guesses about what composites to. So `scripts/contrast-audit.mjs` (committed, self-contained — it serves `dist/`, spawns its own headless Chrome, and exits non-zero on failure) does this per page and width:

   1. record every text run with its computed colour, size, weight and the rectangles it occupies;
   2. repaint with **all text transparent** and screenshot — every background survives exactly as it renders, no glyphs;
   3. sample eighteen points behind each run and keep the **worst** ratio;
   4. composite the foreground's alpha, including opacity inherited from ancestors, over the sampled background before taking the ratio.

   Thresholds are 4.5:1 normal, 3:1 large (≥24px, or ≥18.66px bold). **1,948 text runs at 1440px alone**, and 791 unique pairings across 1440 / 753 / 390px.

   **Every filterable view is now audited twice — added by §7 item 7, and it is the gap that let a real failure through this sweep.** Half the treatments on this site only exist once a filter has bitten: an emptied calendar month, an emptied map region, a zero-count chip. At build time every map region has races, so `.rgroup.is-empty` was never on screen when this audit ran, and its `opacity: 0.62` survived a sweep whose whole subject was that opacity fails. The page list now carries `/?month=1`, `/calendar/?month=1` and `/map/?month=1` alongside the plain routes — one January event, so on every view exactly one group survives and all the rest go to their empty treatment in the same screenshot — and the filter reads its state from the URL on load, so no clicking is involved. The script also fails outright if a filtered page renders no `.is-empty` element, because a second pass that silently became a duplicate of the first would pass by not looking. Coverage after the change: **2,388 text runs at 1440px, 836 unique pairings** across the three widths.

   Three instrumentation bugs were found and fixed in the auditor itself before its output could be trusted, and each maps to a real rendering behaviour worth knowing:

   - **Ancestor opacity is multiplicative and is usually set on a parent.** Reading only the element's own `opacity` under-reported the dimming and hid three of the four defects below.
   - **`-webkit-line-clamp` leaves `getClientRects()` reporting the whole unclamped run.** A two-line clamped hook was sampling pixels 90px below its visible box, over a gold divider rule, and reporting a failure that no reader could see. Rects are now clipped to the element's own box *and* to every `overflow: hidden` ancestor.
   - **A Leaflet marker scrolled outside the map frame still has a rect.** Same clipping fix covers it.

   The lesson generalises past this script: **a contrast checker that reasons about CSS instead of pixels will confidently report numbers for text that isn't where it thinks it is.**

   ### What changed, and why each value moved

   Four token changes and one specificity fix account for essentially all of it.

   **`--fg-mute`: `#6d7c89` → `#84929d`.** This one grey was ~100 of the 103 failing text runs. It failed **on every surface on the site, including the plain page ground at 4.48:1** — close enough to look fine and still be non-compliant, which is precisely why this needed measuring rather than judging. Worst case was **3.53:1**, for the year, region and "also offers" text inside a hovered marquee row. The new value clears 4.5:1 everywhere with its tightest pairing at **4.74:1**, and stays a clear step below `--fg-dim`.

   **`--teal-deep`: `#2b8b80` → `#31998d`.** It does three jobs, and the one that failed was the count inside a *selected* filter chip — teal ink on the chip's own teal wash, **3.85:1**. Now 4.57:1 there, and still 1.40:1 apart from `--teal`, which is what keeps "returning" distinguishable from "distance" on the calendar timeline. The other two jobs (the returning status stripe, and hover boundaries) only improved.

   **New token `--line-ctl: #5f7183`, for interactive boundaries only.** `--line` is 1.22:1 against a chip's own fill and 1.38:1 against the page; a chip's fill is 1.13:1 against the page. So neither the border nor the fill identified the control at anything close to WCAG 1.4.11's 3:1 — a filter chip was, in contrast terms, an invisible box with a label in it. `--line-ctl` clears 3:1 against every surface a control sits on, the tightest being the switch track at 3.11:1. **Decorative rules keep `--line`**, and that distinction is the whole point: a rule between two paragraphs owes nothing, a card edge owes nothing, a chip owes 3:1. Applied to chips, the sub-50K switch, the Copy-link/Clear/Fit-results buttons, the view switch, the map's zoom control and gesture veil, the month jump strip, and the permalink prev/next cards.

   **Hover and cue boundaries: `--teal-edge`/`--gold-edge` → `--teal-deep`/`--gold-deep`.** The alpha "edge" tokens measure **1.69–2.07:1** against every surface here, so *hovering a control made its boundary less visible than at rest*, and the calendar's and map's "this is the row your mark points at" cue outline was effectively invisible at 1.76:1. The edge tokens are still right where they are decoration on a badge whose own text carries the meaning; they are wrong as the only mark of a state.

   **The Leaflet attribution — the worst single defect, and it was shipping.** Leaflet's own stylesheet sets the attribution background from `.leaflet-container .leaflet-control-attribution` (specificity 0,2,0). `map.css` overrode it from `.leaflet-control-attribution` (0,1,0), which **loses on specificity no matter how late it loads** — and it did load last, which is exactly why nobody caught it by reading the file. The control was rendering as Leaflet's `rgba(255,255,255,0.8)` **white box** with this project's dark greys painted on top: **1.42:1** for the "Leaflet" link and **2.67:1** for the OpenStreetMap line. A white rectangle on a deliberately dark map, in production. Neither the build nor the DOM looked wrong; only sampled pixels caught it. §2.2 also takes OSM attribution as an *obligation* of using the tiles, so this was the one control on the site with a non-negotiable reason to be legible. Fixed by matching Leaflet's specificity.

   **Four `opacity`-as-dimming treatments replaced with ink**, per §2.5's new corollary. Each was a control or live text, so none qualified for the disabled exemption:

   | treatment | was | measured | now |
   |---|---|---|---|
   | `.chip.is-empty` (a facet with no matches — still selectable) | `opacity: .4` | 2.31:1 label, **1.80:1** count | quieter ink on a flat ground + dashed edge, 6.03:1 |
   | `.strip a.is-empty` (month jump link to an empty month) | `opacity: .35` | 2.06:1 label, 1.75:1 count | `--fg-mute`, 5.69:1 |
   | `.month.is-empty` (March, empty in the dataset) | `opacity: .62` | 3.00:1 "No events" | `--gold-deep` heading, no opacity; the box already recedes structurally |
   | `.gutter.is-quiet` (reserved "~" gutter with nothing in it) | `opacity: .3` | **1.28:1** | label hidden (it labels nothing), width still reserved, divider recedes by colour |
   | `.is-discontinued .badge` / `.bd` | `opacity: .55` | 2.99:1 | `opacity: .8`, 4.80:1 |

   The `.chip.is-empty` row is the clearest illustration of why opacity is the wrong mechanism: **no opacity value fixes it.** Even at 0.8 the count inside the chip only reaches 3.71:1, because opacity drags every pairing toward 1:1 and the count started closest to the floor.

   ### The ratio tables

   Generating set: every unique pairing the auditor found is an instance of one of these. Re-runnable with `node scripts/contrast-audit.mjs --verbose`.

   **A. Text inks against every surface they land on** (bold = the binding case)

   | ink | `--ink-950` | `--ink-900` | `--ink-850` | `--ink-800` | marquee row | marquee, hovered | min |
   |---|---|---|---|---|---|---|---|
   | `--fg` `#e8ecef` | 16.60 | 16.19 | 15.30 | 14.29 | 13.73 | 12.73 | **12.73** |
   | `--fg-dim` `#a2aeb9` | 8.73 | 8.51 | 8.04 | 7.51 | 7.21 | 6.69 | **6.69** |
   | ~~`--fg-mute` `#6d7c89`~~ | 4.60 | 4.48 | 4.24 | 3.96 | 3.80 | 3.53 | **3.53 ✗** |
   | `--fg-mute` `#84929d` | 6.18 | 6.03 | 5.69 | 5.32 | 5.11 | 4.74 | **4.74** |
   | `--teal` `#46b6a8` | 8.00 | 7.80 | 7.37 | 6.89 | 6.61 | 6.13 | **6.13** |
   | ~~`--teal-deep` `#2b8b80`~~ | 4.80 | 4.68 | 4.42 | 4.13 | 3.97 | 3.68 | **3.68** |
   | `--teal-deep` `#31998d` | 5.70 | 5.56 | 5.26 | 4.91 | 4.71 | 4.37 | **4.37** |
   | `--gold` `#f2b843` | 11.00 | 10.73 | 10.14 | 9.47 | 9.10 | 8.44 | **8.44** |
   | `--gold-deep` `#c8912b` | 7.08 | 6.91 | 6.53 | 6.10 | 5.86 | 5.43 | **5.43** |
   | `--rust` `#c9755c` | 5.81 | 5.66 | 5.35 | 5.00 | 4.80 | 4.45 | **4.45 †** |

   † `--rust` clears 4.5:1 on every surface it actually occupies (measured minimum **4.70:1**, on a hovered discontinued row). The 4.45 column is a *hypothetical*: it needs a race that is marquee **and** discontinued, and the dataset has none. See "flagged, not built" below — this is deliberately left rather than fixed.

   `--teal-deep` at 4.37 on a hovered marquee row is likewise not a live pairing: it appears as text only inside a selected chip (4.57:1, table B); its other uses are 3:1 non-text.

   **B. Ink on its own tinted fill**

   | pairing | background | ratio |
   |---|---|---|
   | `--teal` on `--teal-wash` — distance badge | `#112022` | 6.79 |
   | `--rust` on `--rust-wash` — discontinued pill | `#1e191a` | 5.11 |
   | `--gold` on `--gold-wash` — unverified pill, active view tab | `#222018` | 9.10 |
   | ~~`--teal-deep` `#2b8b80` on a selected chip~~ | `#152528` | 3.85 ✗ |
   | `--teal-deep` `#31998d` on a selected chip | `#152528` | 4.57 |

   **C. Non-text and UI components** (WCAG 1.4.11, 3:1)

   | object | against | ratio |
   |---|---|---|
   | ~~`--line` as a chip border~~ | chip fill `#161d25` | 1.22 ✗ |
   | ~~`--line` as a chip border~~ | page `#0b0f13` | 1.38 ✗ |
   | ~~chip fill as the affordance~~ | page `#0b0f13` | 1.13 ✗ |
   | `--line-ctl` chip border | chip fill `#161d25` | 3.38 |
   | `--line-ctl` | page `#0b0f13` | 3.82 |
   | `--line-ctl` | switch track `#1c242e` | 3.11 |
   | ~~`--teal-edge` hover border~~ | page `#0b0f13` | 1.72 ✗ |
   | `--teal-deep` hover border | chip fill `#161d25` | 4.91 |
   | focus ring `--gold` | page / chip / selected chip | 10.73 / 9.47 / 8.83 |
   | switch knob `--fg-mute` (off) | track `#1c242e` | 4.91 |
   | switch knob `--teal` (on) | track `#112022` | 6.79 |
   | pin fill `--map-pin` | its own 1px `--map-pin-ink` border | 8.02 |
   | marquee pin `--gold` | the same border | 11.13 |
   | `--map-pin` | basemap, typical | 7.00 |
   | `--map-pin` | basemap, 99th percentile | 3.92 |
   | status ring `--teal` / `--rust` / `--gold-deep` | pin border `#06090c` | 8.10 / 5.88 / 7.17 |
   | timeline mark `--teal` / `--teal-deep` / `--rust` / `--gold` | month box `#11161c` | 7.37 / 5.26 / 5.35 / 10.14 |
   | town-level halo (22% over basemap) | basemap | 1.49 ‡ |

   **The basemap numbers are measured, not assumed.** The tile pane was sampled across 742,968 rendered pixels: it is overwhelmingly dark (90th percentile luminance 0.011, 99th 0.071) with sparse bright specks up to `#afafaf` where OSM draws place labels and major road casings. Against the brightest of those a pin's *fill* would be 1.13:1 — which is why **every pin carries a 1px near-black border**, giving the fill a guaranteed adjacent edge at 8.02:1 regardless of what is underneath. The status ring is likewise bounded by that border on the inside and the dark map on the outside, so the ring-versus-pin-fill comparison (which would look alarming: teal on `--map-pin` is 1.01:1) is not the adjacency that exists.

   ‡ The town-level halo is genuinely low-contrast and is **left that way deliberately**. It is not the sole carrier of the fact it signals: §7 item 5 put coordinate precision in words in the popup of every single marker, and in the index row's glyph. Raising the halo to 3:1 would turn it into a second ring competing with the status channel, which is the one thing the four-channel scheme was designed to avoid.

   **D. Reported but not failed** — 16 pairings across the three widths, in two groups:

   - **Gradient-clipped display text** (5). The three mastheads use `background-clip: text` with a `#fff`→`--gold` gradient, so the glyphs are painted by their background and neither the computed colour nor a hidden-text screenshot describes them. Computed by hand against the gradient's own stops: **18.49:1 at the white end, 10.31:1 at the gold end**, against a large-text threshold of 3:1. Passing comfortably; the auditor flags rather than guesses.
   - **Inactive controls** (1). Leaflet's zoom-out button at minimum zoom, 2.34:1. WCAG 1.4.3 and 1.4.11 both exempt inactive components; this is the exemption being used correctly, not a defect being waved through.

   ### Self-hosted webfont: Oswald

   **Chosen over Archivo Narrow**, on three grounds. It is the more genuinely *condensed* of the two — measured, not eyeballed: at 100px, "HANDGLOVES 0123456789" sets 987px in Oswald against 1279px in the platform sans, a 23% saving that the calendar's compact rows and the month chips actually spend. It is the more poster-like face, which is the §2.5 constraint. And it ships as a **variable font with a 200–700 weight axis**, so the four weights the display stack asks for (400/500/600/700) arrive in one request instead of four static files.

   **Licence confirmed rather than assumed**, per the brief. Oswald is **SIL Open Font License 1.1** — verified against `google/fonts`' own `METADATA.pb` (`license: "OFL"`) and the upstream `OFL.txt` from `googlefonts/OswaldFont`, not from the general reputation of Google Fonts. The licence text ships with the binary at `public/fonts/OFL-Oswald.txt`, which matters here because §8 makes this repo all-rights-reserved by default: the font is the one thing in it under someone else's terms, and those terms require the notice travel with it.

   **What ships:** one file, `public/fonts/oswald-latin-var.woff2`, **21,472 bytes**, latin subset, `font-display: swap`, `<link rel=preload>` in `Base.astro` because the face is above the fold on every page. Verified in the browser: exactly one font request, no request to any Google origin, `document.fonts.check("700 1rem Oswald")` true, and the rendered `h1` measuring identical to an explicit Oswald probe — i.e. the face is the one actually painting, not merely a file that downloaded.

   **The subset is exact, derived from the built HTML rather than picked from a menu.** The only codepoints above U+00FF anywhere in the 105 built pages are `–` (286), `—` (252), `★` (159) and `→` (1). Both dashes are inside the latin range. **`★` and `→` are not in Oswald at all** and fall through to the rest of the stack — which is what they already did before self-hosting, so it is not a regression, but it is the reason the fallback stack stays in `--font-display` rather than being deleted. The stack's job changed from "this is the design on Linux" to "this is the swap window and the ★ fallback".

   ### Collapsible filter pane

   **The before-state, checked rather than assumed** — the brief was right to ask. The mechanism already existed and was already correct: a server-rendered `<details open>` (so it works with JavaScript off), with `filter-client.ts` collapsing it below 60rem, and the specific `display: grid` fix Phase 3 recorded still in place and still needed. **What was missing was only desktop.** At ≥60rem the `<summary>` was `display: none`, so the panel was permanently expanded with no control to shut it, and the client force-opened it on the way up across the breakpoint precisely because a shut panel would otherwise have been unreachable.

   That is backwards from where collapsing helps most: **desktop is where the filter set is largest** — four facets plus twelve month chips, two columns — and where the results therefore sit furthest down the page.

   So the summary is now visible at every width, and the rescue that existed only to compensate for hiding it is gone. What was a hard rule becomes a default:

   - no stored preference → open where there is room, shut on a phone;
   - an explicit toggle → remembered for the session in `DISCLOSURE_STORE` (`gnarlist:filters-open`), at both widths, and it outranks the default including across a breakpoint change.

   Kept separate from `FILTER_STORE` because the two answer different questions — that one remembers *what* you filtered by and travels to permalinks, this one remembers whether you wanted the chips on screen and travels between views. **Absence means "no opinion", which is not the same as "shut"**, and that distinction is what lets the per-breakpoint default keep applying.

   One subtlety worth knowing before it looks like a bug: `toggle` fires for programmatic assignments as well as clicks, so applying the default would immediately write it back as a preference and the default could never apply again. The last programmatically-set value is tracked to tell the two apart, which avoids needing a timer.

   **The affordance was rebuilt, not just un-hidden.** A bare 8px chevron reads as decoration; on desktop, where nobody expects a filter panel to collapse, there was no other hint. It is now a boxed control at `--line-ctl` (so the affordance itself clears 3:1), with a hover state on both the box and the summary row. The results bar stays outside `<details>` as it always did, so a collapsed panel still shows the count, and the summary line carries the active-filter state — which is what makes a shut panel honest rather than merely smaller.

   ### Re-verification, driven rather than assumed

   The brief asked specifically that filter persistence be re-tested after a CSS-wide pass rather than assumed to still hold. Driven in Chrome over CDP:

   - **Filter state across all three views**, `?dist=50m&region=san-juans&month=7` → list → calendar → map → list: identical URL, identical checked chips, identical single result (`Creede 50/100`) at every hop. Then a chip **un-checked on the map** and the trip back to the list: identical three-event set, and the `month` param correctly dropped from the URL.
   - **Disclosure** at 1440 / 1024 / 390px: the toggle is present and visible at all three, defaults open/open/shut, actually collapses and expands when clicked, the chip body follows the open state, and the choice survives the trip to the calendar.
   - **The webfont**, as described above.
   - **No horizontal overflow** at 305 / 375 / 390 / 600 / 753 / 1024 / 1440px across all four surfaces — 28 width/page combinations, re-checked because a new display face changes every text metric on the site.

   43 assertions, all passing, plus the 791-pairing contrast run.

   ### Flagged, not built

   Surfaced by this pass, deliberately left for a separate decision rather than folded in:

   - ~~**The route's "S" cap is drawn underneath a cluster marker.**~~ (**resolved, §7 item 7** — and the diagnosis below was incomplete: the collision is not phone-only, and a zoom threshold alone would not have fixed it.) The only outstanding contrast failure, and it is real: at phone widths and statewide zoom, TransRockies' start cap renders *beneath* the 13-race Front Range cluster, leaving the "S" glyph at **1.17:1** (the "F" cap, 4.48:1, is grazed by the same collision). Confirmed by magnified screenshot, not inferred. Left alone because **it is a z-order and collision problem, not a palette one** — and simply raising the caps' z-index just moves the occlusion onto the cluster's count. The honest fixes are collision avoidance or hiding the caps below a zoom threshold, both of which are map-behaviour decisions. `scripts/contrast-audit.mjs` exits non-zero on this; that is the known failure, and it should stay visible rather than be suppressed.
   - ~~**`--rust` on a marquee + discontinued row would be 3.90:1**~~ (**resolved, §7 item 7** — the stack only lightens on `:hover`/`.is-cued`, and neither listed fix was the one needed.) (the pill's ink on its own wash over the gold-washed row). No such race exists today. Both available fixes cost something real — lifting `--rust` far enough (`#d18a70`) visibly changes the warning ink for zero present benefit, or the marquee wash stops stacking under a discontinued row, which is a precedence decision about what the two treatments mean together. Recorded here rather than guessed at, in the same spirit as §4's rule about writing rules against statuses rather than current members.
   - ~~**The gesture veil's label sits over live map content.**~~ (**resolved, §7 item 7**) "TAP TO EXPLORE THE MAP" covers the route caps at phone widths. Cosmetic, and adjacent to the veil's already-noted "usable, not polished" status from Phase 5.
   - ~~**Month names, region headings and the rail heading are gold**~~ (**closed, not a defect — §7 item 7.** Measured: gold is unconditional on headings, with zero correlation to marquee content.), which is a heading treatment rather than a marquee mark. Almost certainly fine — it is the poster's section-heading idiom and §2.5's rule is about marking *events* — but it is the one place gold appears where an event is not, and someone should decide that on purpose rather than inherit it.
   - **Cluster discs are ~1.2:1 against the basemap.** Their white count text is 16:1 and carries the information, so this is not a failure; it is noted because a cluster is currently legible by its number rather than by its shape.
   - ~~**A discontinued race's distance badges could drop teal entirely**~~ (**CLOSED, will not do — §7 item 7.** The premise is an equivocation on "working".) rather than being dimmed to 80% opacity — teal means live/working, and a dead race arguably shouldn't hold it. That is a semantic change, not a contrast fix, so it was not made.
   - ~~`npm run check` is *still* not wired up. Untouched again this session.~~ (**resolved, §7 item 7.** It was never a backlog — 0 errors on the first run.)
7. **Deferred-item cleanup pass** — the six items the design sweep left flagged, closed out together rather than allowed to accumulate into a seventh. Three were real defects, one was real but misdiagnosed, one was not a defect at all, and one had been deferred three times for no reason anybody had checked. **Status: built and verified; the user's visual confirmation is still the last word (§1).**

   **The route's "S" cap — the recorded diagnosis was incomplete, and the recorded fix would not have worked.** The sweep called it a phone-width problem and named two candidate fixes. Measured across zoom levels at 390px and 1440px, it is neither. The start cap is **100% covered at desktop widths too**, at z9-z11 — *above* the label threshold, in states the audit never visits because it only samples the default zoom. And the reason is sharper than "z-order": the cap's coordinate **is** the Leadville races' coordinate, because those are town-centroid geocodes. Leaflet derives a marker's z-index from its projected y, so two markers on one point get the **identical z-index** (measured: z133 vs z133, z203 vs z203) and DOM order alone decides who vanishes. That is why raising the cap only moved the occlusion — with equal z-indices there is no stacking answer at all. Two things on one point need **space**.

   So the caps are displaced a fixed 30px outward along the route's own bearing — the start backwards, the finish onwards — computed once from the projected endpoints. A *pixel* offset, not a geographic one, because the thing it must clear (a cluster disc) is itself a fixed pixel size, so the clearance is identical at every zoom. And the caps now share the threshold their labels already had: below z9 the route is the dashed corridor alone, because at statewide zoom the two 18px caps sit **16px apart** and occlude each other before any cluster is involved — no reasonable offset can render a 15px route with two endpoint discs inside a field of 42px clusters, which is what makes hiding them the honest answer rather than a suppression. Both halves are load-bearing: the threshold alone leaves the desktop collision, and the offset alone leaves the caps overlapping each other.

   **The labels are deliberately *not* displaced with their caps.** Moving them too (via `tooltipAnchor`) put the "Start · Leadville" chip across the disc's lower half and took the "S" from 11:1 to **1.42:1** — the original bug, re-created 30px to the south. Left on the endpoint, the label sits on the opposite side of the coordinate from its cap and the two cannot collide.

   Verified: zero cap/cluster/pin overlap at every zoom step at 390px and 1440px (previously 100% coverage at three desktop steps), and, where the caps are actually drawn, both glyphs measure **11:1 on their own discs** with labels at 6.6-8.9:1, across 390/753/1440px in both the framed and free-zoom states. `scripts/contrast-audit.mjs` now reports **0 failures** and exits 0, down from 2.

   **The gesture veil's label.** The veil is a full-surface 30% scrim and should stay one; the defect was the *chip*, which is opaque `--map-panel` and was parked dead centre. Dead centre is structurally the worst place on this map: `fitBounds` centres whatever it frames, so the middle is by definition the densest part. Measured at 320-390px it covered the "13" cluster 71%, the "22" cluster 64% and the "S" cap 60%. It now rides the top edge — empty by the same arithmetic, and clear of both Leaflet controls (24px from the zoom control at the tightest width). `inset: 0` is untouched, so the whole surface is still the tap target.

   That exposed a genuine interaction between the two fixes: displaced caps reach 43px beyond the route's geographic bounds, so a fitted arrival could still land the finish cap under the chip. `fitResults` padding is now asymmetric — `paddingTopLeft: [50, 92]`, `paddingBottomRight: [50, 52]` — clearing the label band plus the caps' reach at the top and the caps' reach at the bottom. Verified: **0 overlaps across 9 filter states x 4 widths**, in both default and `is-close` states.

   **Rust on a marquee + discontinued row — real, but not where or why it was recorded.** No such race exists, so this was a preemptive fix. The sweep framed it as the marquee wash *stacking* under a discontinued row and offered two costly fixes. Neither was needed, because at rest the wash does not stack at all: `.is-discontinued` is declared after `.is-marquee` at equal specificity and already wins. Measured, the hypothetical row is **identical** to a plain discontinued row at rest.

   The failure is `.is-marquee:hover`, which at **(0,2,0)** outranks `.is-discontinued` at (0,1,0). Hovering swapped the hatching for the gold wash and put the rust pill at **4.27:1** (the sweep's 3.90 was the same defect sampled differently). So the fix is not a precedence *decision* at all — it is the existing precedence made to hold in the states a pseudo-class was quietly winning. `--rust` is untouched; the warning ink did not have to change on every row on the site to satisfy a state none of them are in. The same inversion was fixed in all three row components, including `.is-cued` on the calendar and map rail, which is JS-set and inverts identically.

   One subtlety worth keeping: the hovered ground is bare `--ink-850` with **no** hatch, because `:hover` already drops the hatching on a plain discontinued row too. Restating it made the marquee row the *lighter* of the two and put the teal badge at 4.49:1 — trading one failure for another. Matching the plain row exactly is what makes both pass. The hypothetical row now measures **byte-identical to the real one** in every state: pill 4.79:1, badge 4.71:1.

   `--hatch-rust` was hoisted into `global.css` because the ground is now drawn in six places and they must not drift.

   **Month and region headings in gold — not a defect. Closed.** Verified by measurement rather than the previous session's "almost certainly fine". There is no conditional to fix: **no selector in `src/` gates a heading colour on `marquee`**. At 1440px and 390px, on all three views, every heading computes `#f2b843` — including January, February, November, December and the No-date bucket (0 marquee events each) and Estes Park / RMNP and Fairplay / South Park (0 marquee each), identically to July (5) and San Juans (5). Correlation with marquee content: **zero**. The only heading-colour conditionals are `is-empty` (zero *visible* events -> `--gold-deep`) and `is-nodate` (-> `--fg-mute`), both driven by count, never by marquee. §2.5's rule governs marks on *events*; headings are structure, and gold on them is the poster's section-heading idiom. No change made.

   **Discontinued distance badges keep teal — CLOSED, do not re-raise.** The flag ("teal means live/working, and a dead race shouldn't hold it") equivocates on "working". §2.5 and `global.css` both define teal as *distances and the interactive/selected state* — working **UI**, not working **race** — and the palette already assigns liveness a colour: rust is the single warning ink. "Teal = live" would bolt a second status channel onto a system that deliberately has one. Three further reasons: it **doesn't generalize** (`unverified` has the stronger claim to losing teal, since its distances are the least trustworthy data on the site, while a discontinued race's are simply accurate history; and `returning` would keep it, so teal would come to mean *counted* — §4's counting rule becoming a palette rule); the **contrast gain is 0.05:1** (the badge is the site's tightest passing normal text at 4.65:1, and dropping it just promotes the rust pill at 4.70:1, which is not fixable because rust is mandated); and it **collapses a real distinction** — `.tag` is "same shape as a distance badge, deliberately quieter ink", so ink is the only separator, and driven on a row forced to `is-discontinued` seven chips across three semantic classes all flatten to one grey box. Invisible against today's single discontinued race, wrong against the status — exactly what §4's "write rules against statuses, not members" exists to prevent. The `opacity: .8` dim stays too: `--teal` against the dimmed `#3d998e` is 1.39:1, the same step §7's `--teal-deep` note certifies as readable. *Erratum:* the table in item 6 records this pairing at 4.80:1, which is the list view's `.badge`; the calendar's `.bd` on its lighter surface is **4.65:1** and is the true site minimum.

   **`npm run check` — wired up, and the three deferrals were unjustified.** Deferred at Phase 2, Phase 4 and the design sweep on the unexamined assumption that it might surface a backlog. It does not: the first run after installing `@astrojs/check@0.9.10` + `typescript@6.0.3` was **0 errors, 0 warnings, 1 hint across 24 files**, and the hint was a one-word annotation (`is:inline` on the JSON data island). Nothing was loosened — `tsconfig.json` still extends `astro/tsconfigs/strict`, with no `@ts-ignore` and no `skipLibCheck`.

   **The prior state was worse than "not wired up": it was a green light attached to nothing.** With the dependency absent, `astro check` prompts to install it, takes the default in a non-interactive shell, and **exits 0 having checked no files**. Any CI running it would have reported success forever.

   `build` is now `astro check && astro build`. There is no CI to add a step to — no `.github/workflows/`, by design; the Cloudflare dashboard invokes the npm script, so the script is the only in-tree deploy hook. `&&` over a `prebuild` hook because it is self-documenting: someone reading `scripts` can see the gate. `build:no-check` is a deliberate escape hatch, since gating a deploy on a *type* check could otherwise block an urgent content fix on a site where types have no runtime meaning. Verified negatively: with a type error injected, `npm run build` exits 1 and emits **no `dist/` at all**, so the previous deploy stays live. **Caveat worth one dashboard glance: this only enforces anything if Workers Builds is set to `npm run build`. Pointed at `astro build`, the gate is bypassed silently.**

   **Noticed while in here, deliberately not fixed at the time** (outside that pass's defined list). The first two have since been closed — the map fix and the §2.5 reconciliation recorded in the two bullets themselves; the third still stands:
   - ~~**`.rgroup.is-empty` on the map index uses `opacity: 0.62` on text**~~ (**fixed**). The exact treatment §2.5's corollary forbids, and one that `CalendarMonth.astro` had already retired for the same reason: reachable whenever a filter emptied a region, with "No events" at **3.00:1** and the count at **3.93:1**. The calendar's fix ported directly — drop the opacity, keep the structural recede (`background: none`, no rows), and quiet the region name to `--gold-deep`. Now **6.03:1**, **8.51:1** and **6.91:1**. The more useful half of the fix is in the auditor: it only missed this because it sampled the unfiltered state, so it now renders each filterable view in both states (see item 6). Verified in both directions — with the old CSS restored, the extended audit reports exactly the two failures above and exits 1.
   - ~~**§2.5 and the code disagree about `unverified`.**~~ (**resolved in the doc, which was the side that was wrong**.) §2.5 named rust as the single warning ink "(discontinued/unverified)"; every view has always drawn unverified in dashed `--gold-deep`, and that idiom is correct — uncertainty is not a warning. §2.5 now records the built system: rust for discontinued, dashed gold for unverified, solid gold for marquee, with stroke as the second channel that keeps the last two apart. No code changed.
   - Gold also appears on the selected view tab (`ViewSwitch.astro`) and the focus ring, neither of which marks a marquee event nor is a section heading.

8. **Data maintenance workflow** — a semi-automated research-assistant tool that checks known sources per event on a schedule and proposes a PR for human review (§5.4). Deferred until after the site itself is live — no point maintaining a site that doesn't exist yet.
9. **Stretch phases** — elevation profiles/difficulty scoring (pending new data sourcing, §6); community submissions (pending D1 build-out, §2.3).

---

## 8. Open items / revisit later

- **Licensing — resolved.** No license file, default all-rights-reserved, for both code and data. Applies to the repo's code and to `races.json` alike unless split later. The MIT license file added during Phase 2 scaffold has been removed and confirmed gone. Note: facts (race names, dates, locations, distances) aren't copyrightable regardless of license choice — only the specific compilation and original writing (notes/descriptions) are protectable. Not legal advice; consult a lawyer if this ever matters commercially.
- Redirect setup for `gnarlist.run` / `gnarlist.racing` / `thegnarlist.com` → `gnarlist.co` — see §2.4. The canonical domain is now live; these are still deferred, just no longer blocked on anything — do whenever convenient, no urgency either way.
- Whether/when to build the Phase 7 data-maintenance tooling and Phase 8 stretch items — revisit once the core site (Phases 1–6) is live and real usage patterns exist.
- **Ragnar Trail Colorado — revisit before the 2027 season.** 2026 is confirmed as its final year at Snowmass; the organizer says it moves to "a new spot in the Rockies" for 2027 and has not said the new spot is in Colorado. This is the dataset's only event with a known expiry, so it will not simply roll forward like the rest. Either it relocates within Colorado (update venue, coordinates, region — it is currently `mountains-western-slope` on Pitkin County) or it leaves the state and the record should go. Do not let a forward-dated aggregator listing decide this: RunGuides already carries a "2027 Ragnar Trail Colorado | Snowmass Village" page, which contradicts the organizer and is exactly the §5.3 pattern.
- Sanity-check "GnarList" naming against Gnar Runners (a race organizer already in the dataset) before public launch — low-confidence concern, probably fine, worth a glance rather than a deep dive.
