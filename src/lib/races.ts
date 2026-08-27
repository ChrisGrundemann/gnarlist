// Build-time data layer. Reads data/races.json (ARCHITECTURE.md §2.1) and
// derives everything the UI needs: filter tokens, a seasonal sort order, and
// pre-formatted date parts.
//
// This is the narrow interface §2.1 talks about — views ask for `allRaces()`
// and never touch the JSON shape directly. If the data source ever becomes an
// API, only this file changes.

import raw from '../../data/races.json';
import { REGIONS, SUB_50K, type RaceTokens } from './filters';

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

function categoryForMiles(miles: number): string {
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
 * `discontinued` (Golden Gate Dirty 30) and `unverified` (Sourdough Snowshoe)
 * do not: counting a permanently-cancelled race among "14 events in Denver
 * Metro" overstates what someone can actually go run. They stay fully visible
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
