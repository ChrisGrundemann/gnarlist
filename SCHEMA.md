# Race Dataset Schema

*Proposed schema for the Colorado Ultramarathons dataset. To be reviewed before full data conversion.*

---

## 1. File structure decision

**One JSON array in `data/races.json`.**

At ~70 records with ~25 fields each, the whole dataset is roughly 40–60 KB uncompressed (well under 10 KB gzipped). A single array loads in one fetch, filters entirely in the browser with no secondary requests, diffs cleanly in git (each changed event is clearly visible as changed fields in one PR), and requires no manifest or index file. One-file-per-event would add complexity without buying anything at this scale — that tradeoff makes sense at thousands of records, not seventy.

During this session the file is named `data/races.sample.json` (8 events). Once the full schema is approved, the full conversion will produce `data/races.json`.

---

## 2. Field reference

### Identity

| Field | Type | Notes |
|---|---|---|
| `slug` | `string` | URL-safe unique ID — used for permalinks (`/races/hardrock-100`). Derived from event name; hand-curated for well-known races. **Never changes once published.** |
| `name` | `string` | Official event name as it appears on the race's own site or primary source. |
| `organizer` | `string \| null` | Organizing entity or race director name. `null` only if genuinely unknown after research. |
| `organizer_confirmed` | `boolean` | `false` when the organizer field comes from a single aggregator and hasn't been verified against the race's own site. |
| `source` | `string[]` | Research sources — domain names or URLs. First element is the primary source. Captures where information came from, not necessarily the race's official website. |

### Geography

| Field | Type | Notes |
|---|---|---|
| `coordinates.lat` | `number` | WGS84 latitude. |
| `coordinates.lng` | `number` | WGS84 longitude. |
| `coordinates.precision` | `"town" \| "venue" \| "trailhead"` | **All initial-load values are `"town"`.** See §3 for the coordinate approach and its honesty constraints. |
| `coordinates.derived_from` | `string` | The query string passed to Nominatim, e.g. `"Ouray, Colorado"`. Enables reproducible re-geocoding. |
| `location.town` | `string` | Primary town or city name. For multi-town events (e.g. a stage race), the start town. |
| `location.county` | `string[]` | One or more counties. Array because some events span county lines. |
| `location.region` | `string` (enum) | Region slug — see §5. Originally carried forward from the poster's regional groupings; revised to nine regions by the geographic audit between Phases 3 and 4 (§6.8, ARCHITECTURE.md §4). |

### Distances

| Field | Type | Notes |
|---|---|---|
| `ultra_distances` | `object[]` | One entry per ultra-distance option offered. See sub-fields below. |
| `ultra_distances[].label` | `string` | Human-readable display string, e.g. `"100 mi"`, `"50K"`, `"24-hr timed"`, `"Backyard (4.167 mi/loop)"`. |
| `ultra_distances[].miles` | `number \| null` | Total miles. `null` for timed events and backyard ultras where total distance isn't fixed. |
| `ultra_distances[].miles_approximate` | `boolean?` | Present and `true` when mileage is stated as approximate in the source (e.g. `~75 mi`). Omit when exact. |
| `ultra_distances[].hours` | `number?` | Duration for timed events. Omit for standard distance events. |
| `ultra_distances[].loop_miles` | `number?` | Single-loop distance for backyard ultras. Omit for non-backyard. |
| `ultra_distances[].stages` | `number?` | Number of days/stages for stage races. Omit for non-stage events. |
| `companion_distances` | `string[]` | Sub-ultra distances offered at the same event, display-only. Not normalized — used for the detail view, not for filtering. |
| `longest_ultra_miles` | `number \| null` | Highest numeric ultra distance in miles. `null` for timed events and backyard ultras. Enables numeric sort and range filtering. |
| `distance_category` | `string` (enum) | Badge/color-coding tier — see §5. Derived from `longest_ultra_miles` for distance events; set explicitly for timed/backyard/stage. |

### Format

| Field | Type | Notes |
|---|---|---|
| `format` | `string` (enum) | `"standard"` \| `"backyard"` \| `"timed"` \| `"stage"` — see §5. |

### Dates

Dates are the trickiest field class in this dataset. Many events have confirmed dates; some have only a typical month; a few have no confirmed date at all. All four states must be representable without silently guessing.

| Field | Type | Notes |
|---|---|---|
| `date_start` | `string \| null` | ISO 8601 (`YYYY-MM-DD`). `null` when only the month or year is known. |
| `date_end` | `string \| null` | ISO 8601. Only set for multi-day events; `null` for single-day. |
| `date_confirmed` | `boolean` | `false` means the date is an estimate, a typical window, or fully TBD. A `date_start` value can be present with `date_confirmed: false` (e.g. when the spreadsheet says "Aug 15-16, confirm exact date"). |
| `date_display` | `string` | Human-readable date string. **Always present.** Used verbatim in the UI when the date is uncertain — e.g. `"Late July (typical)"`, `"May 2027 (TBD)"`. |
| `date_approx_month` | `number \| null` | 1–12. Set when only the month is known (`date_start` is `null`). |
| `date_approx_year` | `number` | Calendar year. **Always set.** Defaults to 2026; some events have 2027 dates. |

### Provenance & status

| Field | Type | Notes |
|---|---|---|
| `year_started` | `number \| null` | Year the race was founded. `null` when not confirmed in any source. |
| `year_started_confirmed` | `boolean` | `false` for all events where the spreadsheet records "Not confirmed". |
| `status` | `string` (enum) | `"active"` \| `"returning"` \| `"discontinued"` \| `"unverified"` — see §5. |
| `marquee` | `boolean` | `true` for events flagged ★ in the poster tier system: nationally/internationally recognized races, lottery/qualifier events, large prize purses, or events with significant historical significance to Colorado ultra culture. Criteria are subjective — see §6. |
| `notes` | `string \| null` | Merged "Course / Venue Notes" and "Other Notes" from the spreadsheet into a single field. The distinction between those two columns wasn't load-bearing for the UI. |

---

## 3. Coordinate approach

**Problem:** The source spreadsheet has town and county, not GPS coordinates. An interactive Leaflet map needs lat/lng for every event.

**Approach:** Nominatim geocoding (OpenStreetMap's free geocoding API), run via a repeatable script at `scripts/geocode.py`. The script accepts a town + state query string, calls the Nominatim search endpoint with a project-specific `User-Agent`, respects the 1 req/sec rate limit, and returns `{lat, lng}` rounded to 4 decimal places.

**What this gives us:** Town/area centroid coordinates — accurate enough to place a pin in the right valley or mountain range, but not the exact trailhead or race venue. This is the honest state of the data: we know these races happen near Ouray, near Steamboat Springs, etc., but we don't have verified venue coordinates from organizer websites (that would require per-event research).

**Schema honesty:** All *initially* geocoded events have `coordinates.precision: "town"`. The `derived_from` field records the query string, so re-geocoding or manual correction is always reproducible. If/when exact venue coordinates are sourced for specific events (e.g. from a race website's embedded map), `precision` changes to `"venue"` or `"trailhead"` and `derived_from` describes the source.

**Four records now carry `"venue"`,** all where the town centroid was materially wrong rather than merely imprecise:

- **The Roxborough Ultras** — Littleton's centroid sits ~13 mi away *and in the wrong county* (Arapahoe, against a Douglas County record).
- **The three Staunton State Park races** — Suffer Better Fall Trail Run, Running Up for Air – Staunton Rocks, and Sawmill Trail Runs — where Pine's centroid is ~7 mi off. All three now share one coordinate, so the map shows one pin per venue rather than three races scattered around a park they all start in.

The pattern to follow: upgrade when the town-level answer is *wrong*, not merely when a better one exists. Nominatim resolving a named park or open space is good enough to qualify as `"venue"`; a guess at a trailhead is not.

**Marquee follow-up:** A handful of Colorado's most prominent 100-milers have well-known, easily verifiable start/finish locations (e.g. Leadville's 6th Street, Ouray's Fellin Park). These would be worth upgrading to `"venue"` precision in a follow-up pass — worth 30 minutes of research for the ~5 events involved.

**Phase 5 note: the map now shows this field rather than just recording it.** Town-level pins are drawn with a soft halo and every popup carries an explicit line — *"Town-level pin — plotted at Leadville, Colorado, not at the start line."* — while `venue` records get a hard centre pip. The map deliberately did **not** upgrade any coordinate; that is this research task, unchanged. Two numbers it made concrete and worth having written down: 98 of 102 records are `town`, and the 102 events sit on only **55 distinct points** — eleven Colorado Springs races share one. That is what makes marker clustering load-bearing rather than decorative, and it is the strongest argument yet for the marquee follow-up above.

**Script:** `scripts/geocode.py` — not an automated write path; operator runs it when adding events, reviews the output, and commits coordinates alongside the event record. Matches the data governance principle of PR-based review for all changes.

---

## 4. Status and uncertainty values

Rather than hiding uncertain or flagged data, every uncertain field has a companion boolean. The `status` field captures the event-level lifecycle.

**`status` values:**

| Value | Meaning |
|---|---|
| `"active"` | Confirmed active event |
| `"returning"` | Temporarily cancelled but expected back (e.g. Ouray 100, Leadville Silver Rush 50 — cancelled 2026 due to wildfire; both treated as returning per project guidance). Renders with a small status note in the UI. |
| `"discontinued"` | Permanently cancelled (e.g. Golden Gate Dirty 30) |
| `"unverified"` | Reported in at least one source but not independently confirmed |

**`_confirmed` companion booleans:**

- `organizer_confirmed: false` → organizer name comes from a single aggregator, not the race's own site
- `year_started_confirmed: false` → source says "Not confirmed" or field was blank
- `date_confirmed: false` → date is estimated, a typical window, or TBD

---

## 5. Enumerated values

### `location.region`

Nine regions. Revised by the geographic audit run between Phases 3 and 4 — see ARCHITECTURE.md §4 for the full reasoning, which is the reference; this table is the enum.

| Slug | Display label |
|---|---|
| `san-juans` | San Juans |
| `front-range-cs` | Colorado Springs / Pikes Peak |
| `denver-metro` | Denver Metro & Foothills |
| `northern-front-range` | Northern Front Range |
| `estes-park` | Estes Park / RMNP |
| `mountains-western-slope` | Mountains / Western Slope |
| `central-mountains` | Central Mountains / Sawatch |
| `fairplay-south-park` | Fairplay / South Park |
| `southern-colorado` | Southern Colorado |

### `format`

| Value | Meaning |
|---|---|
| `"standard"` | Point-to-point, loop, or out-and-back with a fixed distance cutoff |
| `"backyard"` | Backyard ultra format (fixed loop, last-person-standing) |
| `"timed"` | Fixed-duration events (6-hr, 12-hr, 24-hr, 30-hr, etc.) |
| `"stage"` | Multi-day stage race with distinct daily legs |

### `distance_category`

Used for badge/color coding and filter UI. For distance events, derived from `longest_ultra_miles`. For format events, set explicitly.

| Value | When applied |
|---|---|
| `"50k"` | Longest ultra ≥ 50K (31.1 mi) and < 50 mi |
| `"50m"` | Longest ultra ≥ 50 mi and < 100K (62.1 mi) |
| `"100k"` | Longest ultra ≥ 100K and < 100 mi |
| `"100m"` | Longest ultra ≥ 100 mi and < 200 mi |
| `"200m+"` | Longest ultra ≥ 200 mi |
| `"timed"` | Timed events (`format: "timed"`) |
| `"backyard"` | Backyard ultras (`format: "backyard"`) |
| `"stage"` | Stage races (`format: "stage"`) |

---

## 6. Open questions and judgment calls

These are the things worth reviewing before approving the schema and starting the full conversion.

### 6.1 Hardrock 100 is not in the source dataset

The Hardrock Hundred Endurance Run (Silverton, CO, typically mid-July) is absent from the spreadsheet entirely. It is arguably Colorado's most prestigious 100-miler and one of the top 5 ultramarathons globally (lottery of ~10,000 for ~150 spots, UTMB qualifier, iconic course). Its absence is conspicuous and should be a deliberate choice, not an oversight. **Action required: confirm whether Hardrock should be added.**

### 6.2 Marquee flag criteria

The ★ flag comes from the poster work but the spreadsheet doesn't encode it. For the sample I've applied it to events that are: nationally known, Western States / UTMB qualifiers, lottery events, or notable for prize purse (Run Rabbit Run). The full list will need review — this is inherently a judgment call and the most subjective field in the schema.

### 6.3 Borderline-ultra events in the dataset

Several events have distances below the standard 50K threshold but appear in the spreadsheet:

- **Box Canyon Trail Races** (Telluride): headline distance is 30K. Included in spreadsheet; should it be in the dataset?
- **The Sneffles Round**: ~75 mi but `miles_approximate: true` because the source says "~75 mi"
- **Beulah Challenge**: 32 mi — below 50K, above marathon
- Two explicitly non-ultra events (Ouray Mountain Trail Run, Kendall Mountain Run) are in the spreadsheet with "NOT an ultra" notes. I'm **excluding** both from the dataset. Confirm this is correct.

### 6.4 Louisville Trail Races and Colorado Trail Race removed

Per project instructions, both have been excluded:
- **Louisville Trail Races** — only offers half marathon, 10K, 5K
- **Colorado Trail Race** — confirmed as a self-supported mountain bike event (bikepacking), not a running ultra

Neither appears in the sample or will appear in `data/races.json`.

### 6.5 2027-dated events

Several events in the spreadsheet have 2027 dates (Rattler Trail Race, NoCo Urban Ultra, Stories Ultra, Royal Gorge Groove, Weld Your Mettle, Collegiate Peaks, Samson's Revenge, North Fork Trail Race). The schema supports this via `date_approx_year`. They're included in the dataset since the site represents a recurring annual picture, not just 2026. Confirm this is the right call.

### 6.6 "Independent" organizer

About a third of events list "Independent" as organizer, which is accurate but low-information. All have `organizer_confirmed: false` since a specific RD name wasn't in the source. A future research pass could add RD names for these. For now, "Independent" is a valid schema value (it means "no formal organization / club behind the event").

### 6.7 Stage race coordinates

TransRockies Pass to Pub runs from Leadville to Red Cliff over 3 days. The stored coordinate is Leadville (start town). A `"stage"` format event with a linear route is the one case where a single point coordinate is genuinely lossy — the map pin will be at the start, not the midpoint or finish. This is acceptable for the MVP but worth noting for the map UI implementation.

**Now also true of its `location.region`.** The route crosses the Continental Divide at Tennessee Pass into Eagle County; `central-mountains` is the start's region, chosen because a filter chip needs one discrete value. Same lossiness, same fix — see ARCHITECTURE.md §4.

**Resolved in Phase 5 — in the UI, not in the data.** The map draws this event as a dashed four-point corridor (Leadville → Tennessee Pass → Camp Hale → Red Cliff) with separate start and finish caps, so the route is no longer a point. **Nothing in `races.json` changed and nothing should:** `coordinates` still holds the Leadville start, which is the correct single point for a record that needs one, and the route geometry lives beside the map in `src/lib/map-data.ts` because it is presentation, not data. It is explicitly an *approximate corridor* and is drawn dashed to say so — there is no GPX for this or any other event, and sourcing course tracks remains deferred (ARCHITECTURE.md §6). If a real track is ever sourced, it replaces that geometry; the schema is unaffected either way.

### 6.8 Region grouping for San Juans / High Country — **resolved, split**

*Original note:* the "San Juans" region label (slug: `san-juans`) as used in the spreadsheet included Leadville and Lake City, which are geographically high-country but not in the San Juan Mountains proper. This mirrored the poster's groupings. The label could be changed to "San Juans & High Country" or the events could be split — a UI/poster-fidelity tradeoff best decided with the full dataset in view.

**Resolved with the full dataset in view, by the audit between Phases 3 and 4: split.** The two Leadville races moved to the new `central-mountains` region; `san-juans` dropped the "/ High Country" qualifier that existed to cover them. Lake City stays — Hinsdale County is in the San Juans proper, so it was never the problem. Twelve other events were corrected in the same pass. Full reasoning and the finalized nine-region scheme: ARCHITECTURE.md §4.

### 6.9 Silver Rush 50 in the sample

The Leadville Silver Rush 50 (the other "returning" event) is not in the 8-event sample — Ouray 100 covers the `returning` case. Silver Rush 50 will appear in the full conversion with `status: "returning"` and the same date-handling pattern as Ouray 100.

### 6.10 Summits Trail Runs correction (mixed format)

Per project instructions, Summits Trail Runs distances are confirmed as: 50K, marathon, half marathon, 6 mi, plus a 14-hour timed option. This creates a genuinely mixed-format event: both a standard 50K and a timed 14-hr option. The schema handles this by putting both in `ultra_distances` with `format: "standard"` (the 50K is the headline distance). The 14-hr timed option appears as `{ "label": "14-hr timed", "hours": 14 }` in the array. `distance_category` is `"50k"`.

### 6.11 Cheyenne Mountain Trail Races correction

Per project instructions, distances confirmed as 50K / 25K / 10K. The spreadsheet has a vague "Ultra distance offered / Shorter options" description. This will be populated with confirmed distances in the full conversion.

---

*Schema version: 0.1 — draft for review*
