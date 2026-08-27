// The map's shared vocabulary — imported by BOTH the build-time page and the
// browser script, exactly like filters.ts is for the filter engine.
//
// Deliberately dependency-free: nothing in here reaches races.json. That is the
// whole reason this file is split from map-data.ts. The browser needs the size
// scale and the type of a point; if it got them from a module that imports the
// dataset, the bundler would ship all 102 records twice — once as the JSON blob
// the page already embeds, and once inside the script.

import { DISTANCES, SUB_50K } from './filters';

/**
 * Marker size steps, smallest to largest, plus `open` for the events that have
 * no fixed distance at all.
 *
 * Distance is *ordered* data — 50K < 50 mi < 100K < 100 mi < 200 mi — and
 * ordered data belongs on an ordered visual variable. Hue is not one, and on
 * this site hue is spoken for: gold means marquee and nothing else (§2.5). The
 * poster colour-coded distance because print has no zoom and no interaction to
 * spend; this view has both. See ARCHITECTURE.md §7 item 5 for the argument and
 * for the alternative that was rejected.
 */
export type SizeTier = 'sub-50k' | '50k' | '50m' | '100k' | '100m' | '200m' | 'open';

/** Longest-first precedence over the distance vocabulary. */
export const TIER_ORDER: string[] = [SUB_50K, ...DISTANCES.map((d) => d.value)];

/**
 * Pin diameter in CSS pixels per step.
 *
 * Defined here rather than in CSS because Leaflet needs the number twice over —
 * `iconSize` and `iconAnchor` have to agree with what gets painted or every pin
 * sits offset from its own coordinate. The stylesheet reads it back as a
 * `--d` custom property, so there is still exactly one scale.
 *
 * `open` sits between 50K and 50 mi on purpose: it is not a size claim, it is
 * the neutral middle, and the hollow ring is what actually carries the meaning.
 */
export const TIER_PX: Record<SizeTier, number> = {
  'sub-50k': 9,
  '50k': 11,
  '50m': 14,
  '100k': 17,
  '100m': 21,
  '200m': 26,
  open: 13,
};

export const TIER_LABEL: Record<SizeTier, string> = {
  'sub-50k': 'Sub-50K',
  '50k': '50K',
  '50m': '50 mi',
  '100k': '100K',
  '100m': '100 mi',
  '200m': '200 mi+',
  open: 'No fixed distance',
};

/** The order the legend reads in. */
export const TIER_KEYS: SizeTier[] = ['sub-50k', '50k', '50m', '100k', '100m', '200m', 'open'];

/**
 * How much the stored coordinate actually knows.
 *
 * 98 of 102 records are `town`: geocoded from a place name, so every race
 * starting in the same town shares literally one point (Colorado Springs has
 * eleven on the same pixel). The list and the calendar never had to admit this
 * because neither draws a position. A map does, and a pin asserts "here" —
 * which for 98 records is more than the data supports.
 *
 * SCHEMA.md §3 also fixes what `venue` does and doesn't mean: all four
 * venue-precision records are parks, promoted because the *town* centroid was
 * materially wrong, not because a start line was surveyed. So the copy this
 * drives says "venue-level", never "exact".
 */
export type Precision = 'town' | 'venue' | 'trailhead';

export const PRECISION_NOTE: Record<Precision, (from: string) => string> = {
  town: (from) => `Town-level pin — plotted at ${from}, not at the start line.`,
  venue: (from) => `Venue-level pin — plotted at ${from}.`,
  trailhead: (from) => `Trailhead-level pin — plotted at ${from}.`,
};

export interface Route {
  /** Ordered corridor waypoints, start first, finish last. */
  path: [number, number][];
  startLabel: string;
  finishLabel: string;
}

export interface MapPoint {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  tier: SizeTier;
  marquee: boolean;
  status: 'active' | 'returning' | 'discontinued' | 'unverified';
  counted: boolean;
  precision: Precision;
  /** The place the coordinate was geocoded from — `"Leadville, Colorado"`. */
  from: string;
  /** The event's own description of where it is; often a route, not a town. */
  town: string;
  region: string;
  when: string;
  dateApprox: boolean;
  distances: string;
  href: string;
  /** Present only for the one event whose route doesn't fit a point. */
  route?: Route;
}

/**
 * Colorado, with enough margin that the state border isn't flush against the
 * frame. The dataset's own bounding box is 37.28–40.81 N, 108.87–104.71 W,
 * which is most but not all of the state; framing the *state* rather than the
 * data keeps the empty corners meaningful — there are no ultras out on the
 * eastern plains, and that is worth being able to see.
 */
export const COLORADO_BOUNDS: [[number, number], [number, number]] = [
  [36.85, -109.25],
  [41.15, -101.85],
];

/** The class list a pin element carries, shared by the map and the index rows. */
export function pinClass(p: {
  tier: SizeTier;
  marquee: boolean;
  status: string;
  precision: Precision;
}): string {
  return [
    'pin',
    p.tier === 'open' && 'is-open',
    p.marquee && 'is-marquee',
    p.status !== 'active' && `is-${p.status}`,
    `is-${p.precision}`,
  ]
    .filter(Boolean)
    .join(' ');
}
