// schema.org structured data for event permalink pages.
//
// Lives in its own module rather than inline in the page because two of the
// mappings below are real editorial decisions, not mechanical translation, and
// they deserve somewhere to be stated once. Both follow from the same principle
// the rest of the project runs on (ARCHITECTURE.md §5.2): "not confirmed" is a
// legitimate data state, and a schema validator wanting a value is not a reason
// to invent one.

import type { RaceView } from './races';

/** A JSON-LD document — plain data, serialized into the page head. */
export type JsonLd = Record<string, unknown>;

/**
 * `SportsEvent` rather than plain `Event`: it is a strict subtype, it is
 * accurate (these are athletic competitions), and it costs nothing — a consumer
 * that only understands `Event` still reads it correctly.
 */
const TYPE = 'SportsEvent';

/**
 * Colorado's postal locality for the coordinate, taken from
 * `coordinates.derived_from` rather than from `location.town`.
 *
 * These are not the same field doing the same job. `town` is how the dataset
 * describes where the *race* is, and for seventeen records that is a route or
 * an area rather than a locality — "Leadville to Red Cliff", "Arvada to
 * Littleton", "Summit County loop (Dillon, Frisco, Montezuma, Keystone,
 * Breckenridge)". Those are true statements about a race and false ones about a
 * postal address. `derived_from` is by construction the single named place the
 * stored coordinate resolves to, and every record in the dataset formats it as
 * `<place>, Colorado`, so it parses cleanly. `location.town` still goes out as
 * the `Place` name, where the longer descriptor is exactly right.
 *
 * Five of the seventeen resolve to a park rather than a town (Staunton State
 * Park, Roxborough State Park, Grand Mesa). Imperfect as a locality, but it is
 * where the coordinate actually is, which beats a hand-maintained list of
 * exceptions.
 */
function locality(r: RaceView): string {
  return r.coordinates.derived_from.replace(/,\s*Colorado$/i, '');
}

/**
 * schema.org's `eventStatus` vocabulary doesn't map cleanly onto this dataset's
 * four states, so three of the four are decided explicitly and the fourth is
 * deliberately left unsaid:
 *
 * - `discontinued` → **EventCancelled.** A genuinely good fit, and the one
 *   mapping that earns its keep: Golden Gate Dirty 30's page exists to answer
 *   "is this still happening?", and this is the machine-readable form of no.
 * - `active` → **EventScheduled.** Unremarkable.
 * - `returning` → **EventScheduled.** `EventPostponed` was considered and
 *   rejected: schema.org defines it as a scheduled instance moved with no new
 *   date set, whereas a returning race is an annual event that skipped a season
 *   and is expected back on its normal schedule. Nothing was postponed. Both
 *   returning records also carry `date_confirmed: false`, so they emit no
 *   `startDate` either way — EventScheduled plus no date says exactly what we
 *   know. ARCHITECTURE.md §4 already settled that a returning race counts
 *   normally because it's coming back; this is the same call in another
 *   vocabulary.
 * - `unverified` → **omitted.** There is no schema.org value meaning "reported
 *   but not independently confirmed", and every candidate would assert more
 *   than we know. Saying nothing is the honest option.
 *
 * Written against the statuses rather than against whichever races hold them —
 * `unverified` has no members today, and §4 records why that is not a reason to
 * drop it from the vocabulary.
 */
function eventStatus(r: RaceView): string | null {
  switch (r.status) {
    case 'discontinued':
      return 'https://schema.org/EventCancelled';
    case 'active':
    case 'returning':
      return 'https://schema.org/EventScheduled';
    case 'unverified':
      return null;
  }
}

/**
 * `startDate`/`endDate`, gated on `date_confirmed` — not on whether a date
 * happens to be present.
 *
 * This is the decision that matters most on this page. Eleven of 102 records
 * are unconfirmed, and for those we emit **no date at all** rather than a
 * coarser one. The tempting middle option — ISO 8601 reduced precision, e.g.
 * `2026-07` for a "typical early July" race — was rejected because a consumer
 * that doesn't handle reduced precision coerces it to `2026-07-01` and surfaces
 * "July 1, 2026" in a search result. That is precisely the synthesized specific
 * date the dataset spent three phases refusing to write down, laundered through
 * a parser. The cost is real and accepted: those eleven pages aren't eligible
 * for date-bearing rich results. The page itself still shows the typical window
 * in prose, tilde-marked, which is the honest place for a hedge.
 *
 * The gate is `date_confirmed`, so **Leadville Trail 100 emits no date despite
 * having a `date_start`** — its own `date_display` reads "Aug 15–16, 2026
 * (confirm exact date)". That is the point. §5.3's Royal Gorge Groove case was
 * the mirror image, a `date_confirmed: true` on a date the organizer had never
 * announced, and it is the reason this gate reads the confidence flag rather
 * than the presence of a value.
 *
 * `endDate` is emitted only where `date_end` exists. A single-day race could
 * defensibly repeat `startDate`, but several timed events plainly run overnight
 * without a recorded end date, and inferring one would be the same overclaim in
 * miniature.
 */
function dates(r: RaceView): { startDate?: string; endDate?: string } {
  if (!r.date_confirmed || !r.date_start) return {};
  return { startDate: r.date_start, ...(r.date_end ? { endDate: r.date_end } : {}) };
}

/**
 * `organizer`, emitted only where the dataset has a confirmed, named one — 75
 * of 102.
 *
 * Two reasons, and the second is the decisive one. The page renders an
 * unconfirmed organizer with an explicit "Not independently confirmed" caveat
 * attached, and structured data has nowhere to carry that caveat. More
 * concretely: 24 of the 27 unconfirmed values are the placeholders
 * `"Independent"` and `"Formerly independent RD"`, which are notes about the
 * absence of a known organizer, not organization names. Emitting
 * `Organization { name: "Independent" }` two dozen times would be worse than
 * emitting nothing.
 */
function organizer(r: RaceView): JsonLd | null {
  if (!r.organizer_confirmed || !r.organizer) return null;
  return { '@type': 'Organization', name: r.organizer };
}

/**
 * The full JSON-LD document for one event's permalink page.
 *
 * Deliberately absent: `image` (the dataset has none, and a placeholder would
 * be a fabrication), `offers` (no entry-fee or registration-URL data — §6's
 * deferred territory), and `performer` (meaningless for a mass-participation
 * race).
 */
export function eventJsonLd(r: RaceView, canonical: string, description: string): JsonLd {
  const status = eventStatus(r);
  const org = organizer(r);
  return {
    '@context': 'https://schema.org',
    '@type': TYPE,
    name: r.name,
    url: canonical,
    description,
    sport: 'Ultramarathon',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(status ? { eventStatus: status } : {}),
    ...dates(r),
    location: {
      '@type': 'Place',
      name: r.location.town,
      address: {
        '@type': 'PostalAddress',
        addressLocality: locality(r),
        addressRegion: 'CO',
        addressCountry: 'US',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: r.coordinates.lat,
        longitude: r.coordinates.lng,
      },
    },
    ...(org ? { organizer: org } : {}),
  };
}

/**
 * Serialize for embedding in a `<script type="application/ld+json">`.
 *
 * `<` is escaped even though every byte here comes from our own repo: a literal
 * `</script>` inside the JSON would end the element early, and relying on "our
 * data would never contain that" is the kind of assumption that stops being
 * true the first time someone writes a race note with an HTML tag in it.
 */
export function jsonLdScript(doc: JsonLd): string {
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}
