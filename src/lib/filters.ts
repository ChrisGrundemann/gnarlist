// The filter vocabulary — the single source of truth for what can be filtered,
// what the URL params are called, and what the human-readable labels are.
//
// This module is imported by BOTH the build-time page (to render the filter
// chips and the per-row data attributes) and the client-side filter script (to
// read the URL and match rows). Phases 4 and 5 (calendar, map) reuse it as-is:
// the filter contract lives here, not inside any one view.
//
// Deliberately dependency-free and side-effect-free so it can be imported from
// an Astro frontmatter block or a browser <script> without care.

/** Query-string parameter names. Kept short — these end up in shared links. */
export const PARAM = {
  format: 'format',
  dist: 'dist',
  region: 'region',
  month: 'month',
  sub: 'sub',
} as const;

export type Facet = 'format' | 'dist' | 'region' | 'month';

export interface Choice {
  /** Token used in data attributes and URL params. URL-safe, lowercase. */
  value: string;
  /** Short label for the filter chip. */
  label: string;
  /** Longer label for display in a row. Defaults to `label`. */
  full?: string;
}

export const FORMATS: Choice[] = [
  { value: 'standard', label: 'Standard', full: 'Standard distance' },
  { value: 'backyard', label: 'Backyard', full: 'Backyard ultra' },
  { value: 'timed', label: 'Timed', full: 'Timed event' },
  { value: 'stage', label: 'Stage', full: 'Stage race' },
];

// NOTE: the `200m` token intentionally differs from the raw `200m+`
// distance_category in races.json. A literal `+` in a query string decodes as a
// space, so hand-edited share links would silently break. Tokens are normalized
// on the way out of the data layer; the data file is untouched.
export const DISTANCES: Choice[] = [
  { value: '50k', label: '50K' },
  { value: '50m', label: '50 mi' },
  { value: '100k', label: '100K' },
  { value: '100m', label: '100 mi' },
  { value: '200m', label: '200 mi+' },
];

/**
 * Sub-50K events (Box Canyon 30K, Sourdough Snowshoe) live behind their own
 * toggle rather than as a sixth distance chip — ARCHITECTURE.md §4. The token
 * is a real member of the distance vocabulary; only its UI affordance differs.
 */
export const SUB_50K = 'sub-50k';

/**
 * The nine regions, corrected by the geographic audit that preceded Phase 4.
 * Ordered so each chip sits next to its neighbours on the ground, not
 * alphabetically. Slugs are URL contract — `front-range-cs` keeps its slug even
 * though its label changed, so existing share links still resolve.
 *
 * Two labels changed as a consequence of the audit rather than as taste:
 * `san-juans` dropped its "/ High Country" qualifier (that clause existed to
 * cover Leadville, which is now `central-mountains`), and `front-range-cs`
 * reads as Colorado Springs / Pikes Peak because a bare "Front Range" is
 * ambiguous now that `northern-front-range` exists. See ARCHITECTURE.md §4.
 */
export const REGIONS: Choice[] = [
  { value: 'san-juans', label: 'San Juans', full: 'San Juans' },
  { value: 'front-range-cs', label: 'Colo. Springs', full: 'Colorado Springs / Pikes Peak' },
  { value: 'denver-metro', label: 'Denver Metro', full: 'Denver Metro & Foothills' },
  { value: 'northern-front-range', label: 'N. Front Range', full: 'Northern Front Range' },
  { value: 'estes-park', label: 'Estes Park', full: 'Estes Park / RMNP' },
  { value: 'mountains-western-slope', label: 'Western Slope', full: 'Mountains / Western Slope' },
  { value: 'central-mountains', label: 'Central Mtns', full: 'Central Mountains / Sawatch' },
  { value: 'fairplay-south-park', label: 'South Park', full: 'Fairplay / South Park' },
  { value: 'southern-colorado', label: 'Southern CO', full: 'Southern Colorado' },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS: Choice[] = MONTH_NAMES.map((name, i) => ({
  value: String(i + 1),
  label: name.slice(0, 3),
  full: name,
}));

/** The shape a row exposes to the filter engine, via `data-*` attributes. */
export interface RaceTokens {
  formats: string[];
  distances: string[];
  region: string;
  /** `''` for the one event with no month at all (permanently cancelled). */
  month: string;
}

export interface FilterState {
  format: Set<string>;
  dist: Set<string>;
  region: Set<string>;
  month: Set<string>;
  sub: boolean;
}

export function emptyState(): FilterState {
  return { format: new Set(), dist: new Set(), region: new Set(), month: new Set(), sub: false };
}

const anyOf = (selected: Set<string>, has: string[]) =>
  selected.size === 0 || has.some((t) => selected.has(t));

/**
 * AND across facets, OR within a facet.
 *
 * Distance is the one special case: the sub-50K toggle contributes an extra
 * member to the distance selection rather than acting as a separate gate. So
 * with nothing selected everything shows (sub-50K events included — they're in
 * the dataset deliberately); selecting `50K` excludes them; selecting `50K`
 * *and* flipping the toggle shows both.
 */
export function matches(state: FilterState, r: RaceTokens): boolean {
  const dist = state.sub ? new Set([...state.dist, SUB_50K]) : state.dist;
  return (
    anyOf(state.format, r.formats) &&
    anyOf(dist, r.distances) &&
    anyOf(state.region, [r.region]) &&
    anyOf(state.month, r.month ? [r.month] : [])
  );
}

export function countActive(state: FilterState): number {
  return (
    state.format.size + state.dist.size + state.region.size + state.month.size + (state.sub ? 1 : 0)
  );
}

/** Read filter state out of a query string. Unknown tokens are dropped. */
export function stateFromSearch(search: string): FilterState {
  const p = new URLSearchParams(search);
  const read = (key: string, allowed: Choice[]) => {
    const ok = new Set(allowed.map((c) => c.value));
    const raw = (p.get(key) ?? '').split(',').map((s) => s.trim().toLowerCase());
    return new Set(raw.filter((v) => ok.has(v)));
  };
  return {
    format: read(PARAM.format, FORMATS),
    dist: read(PARAM.dist, DISTANCES),
    region: read(PARAM.region, REGIONS),
    month: read(PARAM.month, MONTHS),
    sub: p.get(PARAM.sub) === '1',
  };
}

/**
 * Serialize state back to a query string (leading `?`, or `''` when clean).
 * Empty facets are omitted entirely so a shared link stays readable, and each
 * facet's tokens are emitted in vocabulary order so the same filter selection
 * always produces the same URL.
 */
export function searchFromState(state: FilterState): string {
  const p = new URLSearchParams();
  const write = (key: string, selected: Set<string>, allowed: Choice[]) => {
    const ordered = allowed.map((c) => c.value).filter((v) => selected.has(v));
    if (ordered.length) p.set(key, ordered.join(','));
  };
  write(PARAM.format, state.format, FORMATS);
  write(PARAM.dist, state.dist, DISTANCES);
  write(PARAM.region, state.region, REGIONS);
  write(PARAM.month, state.month, MONTHS);
  if (state.sub) p.set(PARAM.sub, '1');
  // URLSearchParams percent-encodes the comma separator. Commas are legal in a
  // query string and the URLs get shared, so put them back for readability —
  // `?dist=50k,100m` rather than `?dist=50k%2C100m`. Both parse identically.
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
