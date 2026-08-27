// Build-time data layer. Reads data/races.json (ARCHITECTURE.md §2.1) and
// derives everything the UI needs: filter tokens, a seasonal sort order, and
// pre-formatted date parts.
//
// This is the narrow interface §2.1 talks about — views ask for `allRaces()`
// and never touch the JSON shape directly. If the data source ever becomes an
// API, only this file changes.

import raw from '../../data/races.json';
import { DISTANCES, FORMATS, REGIONS, SUB_50K, type RaceTokens } from './filters';

export type Status = 'active' | 'returning' | 'discontinued' | 'unverified';
export type Format = 'standard' | 'backyard' | 'timed' | 'stage';

export interface UltraDistance {
  label: string;
  miles?: number | null;
  miles_approximate?: boolean;
  hours?: number;
  loop_miles?: number;
  stages?: number;
}

export interface Race {
  slug: string;
  name: string;
  organizer: string | null;
  organizer_confirmed: boolean;
  source: string[];
  coordinates: { lat: number; lng: number; precision: string; derived_from: string };
  location: { town: string; county: string[]; region: string };
  ultra_distances: UltraDistance[];
  companion_distances: string[];
  longest_ultra_miles: number | null;
  distance_category: string;
  format: Format;
  date_start: string | null;
  date_end: string | null;
  date_confirmed: boolean;
  date_display: string;
  date_approx_month: number | null;
  date_approx_year: number;
  year_started: number | null;
  year_started_confirmed: boolean;
  status: Status;
  marquee: boolean;
  notes: string | null;
}

export interface RaceView extends Race {
  tokens: RaceTokens;
  /** Does this event contribute to displayed totals? See `countsTowardTotals`. */
  counted: boolean;
  /** Sortable: month, then day, then year. See `bySeason`. */
  sortKey: [number, number, number, string];
  month: number | null;
  regionLabel: string;
  /**
   * The headline distance bucket as a human label — `100 mi`, `50K`, `Timed`.
   * The calendar's compact rows have room for exactly one chip, and this is the
   * one that answers "what kind of race is this" fastest. Resolves through the
   * format vocabulary for the events whose `distance_category` is a format word
   * (`timed`, `backyard`, `stage`), which is the same fallback the permalink
   * page's "Filed under" row uses.
   */
  categoryLabel: string;
  date: DateParts;
  /** Distance labels for badges, capped; `overflow` counts what was dropped. */
  badges: { shown: string[]; overflow: number; all: string };
}

export interface DateParts {
  /** e.g. `SEP 11`, `SEP 11–12`, `JUL`, `TBD` */
  primary: string;
  year: string;
  /** True when the date is an estimate, a typical window, or TBD. */
  approx: boolean;
  /** Full human string from the dataset — used as the tooltip. */
  full: string;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const K50_MILES = 31.1;

const regionLabels = new Map(REGIONS.map((r) => [r.value, r.full ?? r.label]));

const categoryLabels = new Map<string, string>([
  ...DISTANCES.map((d) => [d.value, d.label] as [string, string]),
  ...FORMATS.map((f) => [f.value, f.label] as [string, string]),
  [SUB_50K, 'Sub-50K'],
]);

/**
 * Is this distance entry a fixed-distance race option, as opposed to a timed
 * or last-person-standing format?
 *
 * The label check matters for one real record: American Heroes Run lists
 * `{ label: "100 mi timed", miles: 100 }`, and its own notes say the 100 is a
 * goal distance inside a 24-hour timed event, not a fixed-distance race. Going
 * on `miles` alone would file it under the 100-mile distance filter, which
 * would be wrong.
 */
function isFixedDistance(d: UltraDistance): boolean {
  return (
    typeof d.miles === 'number' &&
    d.hours == null &&
    d.loop_miles == null &&
    d.stages == null &&
    !/timed/i.test(d.label)
  );
}

/**
 * The distance bucket a fixed mileage falls into. Exported because the map view
 * needs it for the one event whose distance lives in a `stages` field rather
 * than a `miles` one (TransRockies) — see `sizeTier` in map-data.ts.
 */
export function categoryForMiles(miles: number): string {
  if (miles >= 200) return '200m';
  if (miles >= 100) return '100m';
  if (miles >= 62.1) return '100k';
  if (miles >= 50) return '50m';
  if (miles >= K50_MILES) return '50k';
  return SUB_50K;
}

/** Normalize the raw `distance_category` enum onto the filter vocabulary. */
function normalizeCategory(c: string): string {
  return c === '200m+' ? '200m' : c;
}

/**
 * Every format this event should surface under — ARCHITECTURE.md §4's
 * mixed-format rule. The headline `format` field always counts; each distance
 * option can add a second one.
 *
 * Chase the Moon is `format: "timed"` but offers a standard 50K, so it gets
 * `["timed", "standard"]`. Summits Trail Runs is the mirror image: a standard
 * 50K plus a 14-hour timed option, so `["standard", "timed"]`. Neither is
 * forced into one bucket and made invisible to the other filter.
 */
function formatTokens(r: Race): string[] {
  const set = new Set<string>([r.format]);
  for (const d of r.ultra_distances) {
    if (d.stages != null) set.add('stage');
    else if (d.loop_miles != null) set.add('backyard');
    else if (d.hours != null) set.add('timed');
    else if (isFixedDistance(d)) set.add('standard');
  }
  return [...set];
}

/**
 * Every distance bucket this event should surface under. Same principle as
 * `formatTokens`: an event offering 200/100mi/100K/50mi/50K appears under all
 * five, because someone filtering for a 50K genuinely can run this race.
 */
function distanceTokens(r: Race): string[] {
  const set = new Set<string>([normalizeCategory(r.distance_category)]);
  for (const d of r.ultra_distances) {
    if (isFixedDistance(d)) set.add(categoryForMiles(d.miles as number));
  }
  return [...set];
}

/** date_start's month when we have a real date, otherwise the typical month. */
function monthOf(r: Race): number | null {
  if (r.date_start) return Number(r.date_start.slice(5, 7));
  return r.date_approx_month;
}

function dateParts(r: Race): DateParts {
  const approx = !r.date_confirmed;
  const full = r.date_display;
  const year = String(r.date_approx_year);
  const month = monthOf(r);

  if (r.date_start) {
    const m = MONTH_ABBR[Number(r.date_start.slice(5, 7)) - 1];
    const d = Number(r.date_start.slice(8, 10));
    if (r.date_end) {
      const em = MONTH_ABBR[Number(r.date_end.slice(5, 7)) - 1];
      const ed = Number(r.date_end.slice(8, 10));
      const tail = em === m ? `${d}–${ed}` : `${d} – ${em} ${ed}`;
      return { primary: `${m} ${tail}`, year, approx, full };
    }
    return { primary: `${m} ${d}`, year, approx, full };
  }
  if (month) return { primary: MONTH_ABBR[month - 1], year, approx, full };
  return { primary: 'TBD', year, approx, full };
}

const BADGE_CAP = 4;

/** Shorten the long-form labels backyard events carry, so badges stay compact. */
function badgeLabel(d: UltraDistance): string {
  if (d.loop_miles != null) return `Backyard · ${d.loop_miles.toFixed(2)} mi loop`;
  if (d.stages != null && d.miles != null) return `${d.miles} mi · ${d.stages}-day`;
  return d.label;
}

function badges(r: Race) {
  const all = r.ultra_distances.map(badgeLabel);
  return {
    shown: all.slice(0, BADGE_CAP),
    overflow: Math.max(0, all.length - BADGE_CAP),
    all: all.join(' · '),
  };
}

/**
 * Whether an event contributes to any displayed number — the overall result
 * count, the faceted chip counts, the masthead stats.
 *
 * `discontinued` and `unverified` do not: counting a permanently-cancelled race
 * among "23 events in Denver Metro" overstates what someone can actually go run.
 * Currently only Golden Gate Dirty 30 is excluded — Sourdough Snowshoe was the
 * `unverified` case until it was verified and promoted. The rule is written
 * against the statuses, not against whichever races happen to hold them. They stay fully visible
 * and browsable in the list with their existing rust/hatched treatment — this
 * is a counting rule, not a visibility rule, and the two must not be conflated
 * by a later phase. `returning` counts normally; it's coming back.
 */
export function countsTowardTotals(r: Pick<Race, 'status'>): boolean {
  return r.status === 'active' || r.status === 'returning';
}

function toView(r: Race): RaceView {
  const month = monthOf(r);
  const day = r.date_start ? Number(r.date_start.slice(8, 10)) : 0;
  return {
    ...r,
    month,
    counted: countsTowardTotals(r),
    tokens: {
      formats: formatTokens(r),
      distances: distanceTokens(r),
      region: r.location.region,
      month: month ? String(month) : '',
    },
    // Sorted seasonally — month first, year last — so the list reads as one
    // Jan-to-Dec arc the way the poster did, rather than splitting into a 2026
    // block and a 2027 block. The year is shown on every row so a 2027-dated
    // event is never mistaken for a 2026 one. Undated events sort to the end.
    sortKey: [month ?? 99, day, r.date_approx_year, r.name],
    regionLabel: regionLabels.get(r.location.region) ?? r.location.region,
    categoryLabel: categoryLabels.get(normalizeCategory(r.distance_category)) ??
      normalizeCategory(r.distance_category),
    date: dateParts(r),
    badges: badges(r),
  };
}

function bySeason(a: RaceView, b: RaceView): number {
  for (let i = 0; i < 3; i++) {
    const d = (a.sortKey[i] as number) - (b.sortKey[i] as number);
    if (d) return d;
  }
  return String(a.sortKey[3]).localeCompare(String(b.sortKey[3]));
}

export function allRaces(): RaceView[] {
  return (raw as Race[]).map(toView).sort(bySeason);
}

export const STATUS_NOTE: Record<Exclude<Status, 'active'>, { label: string; blurb: string }> = {
  returning: {
    label: 'Returning',
    blurb: 'Cancelled for a season, expected back — listed as a typical year.',
  },
  discontinued: {
    label: 'Discontinued',
    blurb: 'Permanently cancelled. Kept on the list so the record is complete.',
  },
  unverified: {
    label: 'Unverified',
    blurb: 'Reported by a source but not independently confirmed. Check before entering.',
  },
};

/**
 * Canonical permalink for an event (ARCHITECTURE.md §4.6). The `slug` field has
 * been URL contract since Phase 1; this is the one place that turns it into a
 * path, so a future route change is a one-line edit rather than a grep.
 */
export function raceHref(r: Pick<Race, 'slug'>): string {
  return `/races/${r.slug}/`;
}

/**
 * The `data-*` attributes the browser filter reads off an element.
 *
 * Shared verbatim by the list row and the calendar cell so the two views can
 * never drift into filtering differently — which is the whole point of the
 * filter contract living in filters.ts. Spread it: `<li {...filterAttrs(r)}>`.
 */
export function filterAttrs(r: RaceView): Record<string, string> {
  return {
    'data-race': '',
    'data-formats': r.tokens.formats.join(' '),
    'data-dists': r.tokens.distances.join(' '),
    'data-region': r.tokens.region,
    'data-month': r.tokens.month,
    'data-counted': r.counted ? '1' : '0',
    'data-name': r.name,
  };
}

/**
 * A source string as a link, when it is one. Most entries are bare domains
 * (`hardrock100.com`); a few are offline citations (`Town of Keystone permit
 * filing`) that must render as plain text rather than a broken href.
 */
export function sourceLink(s: string): { label: string; href: string | null } {
  const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s);
  if (!looksLikeHost) return { label: s, href: null };
  return { label: s, href: s.startsWith('http') ? s : `https://${s}` };
}

/**
 * The season grouped into twelve months, plus a trailing bucket for the one
 * record with no month at all. Every month is present even when empty — the
 * calendar draws the whole year, and March being empty is a fact about the
 * Colorado season worth showing, not a gap to close.
 */
export function byMonth(races: RaceView[]): { month: number | null; races: RaceView[] }[] {
  const buckets = Array.from({ length: 12 }, (_, i) => ({
    month: (i + 1) as number | null,
    races: [] as RaceView[],
  }));
  const undated = { month: null as number | null, races: [] as RaceView[] };
  for (const r of races) (r.month ? buckets[r.month - 1] : undated).races.push(r);
  return undated.races.length ? [...buckets, undated] : buckets;
}

/**
 * The `n` events in the same region as `races[i]`, nearest to it in season
 * order — nearest on the calendar rather than nearest alphabetically. Returned
 * back in season order.
 *
 * Lives here rather than in the page because Astro evaluates `getStaticPaths`
 * in its own module scope, where only imports are in reach.
 */
export function nearestInRegion(races: RaceView[], i: number, n: number): RaceView[] {
  const region = races[i].location.region;
  return races
    .map((r, j) => ({ r, j, d: Math.abs(j - i) }))
    .filter(({ r }) => r.location.region === region && r.slug !== races[i].slug)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .sort((a, b) => a.j - b.j)
    .map(({ r }) => r);
}
