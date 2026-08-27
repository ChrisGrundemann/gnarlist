// Phase 5 — the build-time half of the map's data layer.
//
// Turns a `RaceView` into the `MapPoint` the browser gets. The vocabulary it
// produces (size steps, precision, the point type itself) lives in map.ts,
// which is dependency-free and shared with the client script; everything in
// *this* file reaches the dataset and therefore never leaves the build.
//
// Same principle as the rest of the data layer (ARCHITECTURE.md §2.1): views
// ask this module a question, they never read races.json.

import {
  TIER_ORDER,
  type MapPoint,
  type Precision,
  type Route,
  type SizeTier,
} from './map';
import { categoryForMiles, raceHref, type RaceView } from './races';

/**
 * The size step for an event: the longest fixed distance it offers.
 *
 * Reads `tokens.distances` rather than `distance_category` so it agrees with
 * the filter by construction — a pin's size can never disagree with the chip
 * that surfaced it. Two fallbacks, in order:
 *
 *  - Nothing in the distance vocabulary matched, but `longest_ultra_miles` is a
 *    number. This is TransRockies and only TransRockies: its distances live in
 *    a `stages` field, so `isFixedDistance` (correctly) rejects them and no
 *    distance token is derived — but 51 miles over three days is still 51
 *    miles, and drawing it as open-ended would be a lie in the other direction.
 *  - Nothing at all: the 22 timed and backyard events. These genuinely have no
 *    fixed distance — how far you go is the question the race asks — so they
 *    get `open` and are drawn as a hollow ring rather than being assigned a
 *    size the data doesn't support. Chase the Moon is *not* one of them: it is
 *    a 12-hour event that also offers a standard 50K, so it has a real token
 *    and a real size, exactly as it has a real chip on the other two views.
 */
export function sizeTier(r: RaceView): SizeTier {
  let best = -1;
  for (const t of r.tokens.distances) {
    const i = TIER_ORDER.indexOf(t);
    if (i > best) best = i;
  }
  if (best >= 0) return TIER_ORDER[best] as SizeTier;
  if (typeof r.longest_ultra_miles === 'number') {
    return categoryForMiles(r.longest_ultra_miles) as SizeTier;
  }
  return 'open';
}

/**
 * TransRockies Run: Pass to Pub — the deferred cross-boundary case.
 *
 * Deferred through three phases on purpose (ARCHITECTURE.md §4, SCHEMA.md §6.7):
 * the race starts in Leadville (Lake County), finishes in Red Cliff (Eagle
 * County) and crosses the Continental Divide at Tennessee Pass on the way. Its
 * single `region` and its single coordinate are both acknowledged
 * simplifications, made because a filter chip needs one discrete value — and
 * this is the view where a route can stop pretending to be a point.
 *
 * **What this geometry is, and what it is not.** It is a four-point corridor
 * along the line the race travels: Leadville → Tennessee Pass → Camp Hale →
 * Red Cliff. It is *not* the surveyed course, and must not be presented as one
 * — no GPX exists for any event here and sourcing them is explicitly deferred
 * (§6). The line is drawn dashed for exactly the reason the calendar's
 * unconfirmed dates are drawn dashed: this project's idiom for "we know the
 * shape of this, not the detail of it". If a real track is ever sourced it
 * replaces `path` and the dash comes off; nothing else changes.
 *
 * Endpoint coordinates: Leadville is the record's own stored coordinate, so the
 * route starts exactly where the old single pin sat. The other three are the
 * standard coordinates for those places, at the same town-level precision as
 * everything else on this map — which is why the route inherits the same
 * precision treatment rather than claiming better.
 */
const ROUTES: Record<string, Route> = {
  'transrockies-pass-to-pub': {
    path: [
      [39.2508, -106.2925], // Leadville — the record's own stored coordinate
      [39.3617, -106.3131], // Tennessee Pass — the Continental Divide crossing
      [39.43, -106.32], // Camp Hale
      [39.5097, -106.3669], // Red Cliff — finish, Eagle County
    ],
    startLabel: 'Start · Leadville',
    finishLabel: 'Finish · Red Cliff',
  },
};

export function mapPoint(r: RaceView): MapPoint {
  const route = ROUTES[r.slug];
  return {
    slug: r.slug,
    name: r.name,
    lat: r.coordinates.lat,
    lng: r.coordinates.lng,
    tier: sizeTier(r),
    marquee: r.marquee,
    status: r.status,
    counted: r.counted,
    precision: ((r.coordinates.precision as Precision) || 'town') satisfies Precision,
    from: r.coordinates.derived_from,
    town: r.location.town,
    region: r.regionLabel,
    when: r.date.full,
    dateApprox: r.date.approx,
    distances: r.badges.all,
    href: raceHref(r),
    ...(route ? { route } : {}),
  };
}

export function mapPoints(races: RaceView[]): MapPoint[] {
  return races.map(mapPoint);
}

/** Events whose route is drawn as a line rather than a point. */
export function hasRoute(r: RaceView): boolean {
  return r.slug in ROUTES;
}

/**
 * Serialize for a `<script type="application/json">` block.
 *
 * `<` is escaped the same way `structured-data.ts` escapes it, so a race note
 * containing an HTML tag can never close the script element early. The data is
 * ours, but "our data would never contain that" stops being true the first time
 * it does.
 */
export function serializePoints(points: MapPoint[]): string {
  return JSON.stringify(points).replace(/</g, '\\u003c');
}
