// Geometry for the per-month day timeline on the calendar view.
//
// Build-time only. The calendar's month boxes each carry a compact strip
// representing that month's days, with events drawn at their real day-of-month
// position — that spatial placement is what makes the view read as a calendar
// rather than as the list view in boxes.
//
// Two rules are encoded here rather than in the component, because both are
// editorial and both have precedent elsewhere in the project.

import type { RaceView } from './races';

/** Fewest lanes a strip is ever drawn with, so a one-event month still reads
 *  as a timeline rather than as a stray tick. */
const MIN_LANES = 3;

/** Days shown for a month. Only February varies, and no February event in the
 *  dataset falls in a leap year — but derive it rather than hardcode, so a 2028
 *  date added later doesn't silently lose a day. */
export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export interface Mark {
  slug: string;
  /** Left edge, as a percentage of the month's width. */
  from: number;
  /** Width, as a percentage of the month's width. */
  span: number;
  /** Row within the strip. Simultaneous events stack instead of overlapping. */
  lane: number;
  /** True when the event runs past the end of this month. */
  continues: boolean;
  marquee: boolean;
  status: RaceView['status'];
  label: string;
}

export interface MonthTimeline {
  /** Events with a confirmed day, placed. */
  marks: Mark[];
  /**
   * Events whose day the data doesn't support placing. They are not dropped —
   * they get their own gutter outside the day axis.
   */
  approx: Pick<Mark, 'slug' | 'marquee' | 'status' | 'label'>[];
  lanes: number;
  days: number;
  /** Day numbers to label under the axis. */
  ticks: number[];
}

/**
 * Placement is gated on `date_confirmed`, not on whether a `date_start` exists.
 *
 * This is the same rule the JSON-LD work applied to `startDate`, and it is
 * applied here rather than re-decided: drawing a mark on day 15 asserts "this
 * race is on the 15th" exactly as `startDate: "2026-08-15"` does, and an
 * unconfirmed date is not licence to make that claim in pixels instead of in
 * JSON. **Leadville Trail 100 is the worked example** — it has a `date_start`
 * of `2026-08-15` and still goes in the gutter, because its own `date_display`
 * reads "Aug 15–16, 2026 (confirm exact date)".
 *
 * Ten of 102 events land in the gutter. They keep a mark, keep their status
 * treatment, and keep their row below; the only thing withheld is a position
 * the data can't justify.
 */
function isPlaceable(r: RaceView): boolean {
  return r.date_confirmed && r.date_start != null;
}

/**
 * Simultaneous events stack into lanes rather than drawing on top of one
 * another. Six races share 26 September; as overlapping marks that is one
 * thick tick that lies about how busy the day is, and only one of the six can
 * be clicked. Stacked, the pile-up is the visual — a busy Saturday reads as a
 * column — and every event keeps its own target.
 *
 * Greedy first-fit over events sorted by start day, which is optimal for
 * interval-graph colouring on a line. September needs seven lanes; most months
 * need three or fewer.
 */
function assignLanes(spans: { start: number; end: number }[]): number[] {
  const laneEnds: number[] = [];
  return spans.map(({ start, end }) => {
    const i = laneEnds.findIndex((last) => start > last);
    if (i === -1) {
      laneEnds.push(end);
      return laneEnds.length - 1;
    }
    laneEnds[i] = end;
    return i;
  });
}

export function monthTimeline(month: number, races: RaceView[]): MonthTimeline {
  // Months carry a mix of 2026 and 2027 events; the day count only differs for
  // February, and only across a leap boundary, so the earliest year present is
  // a stable choice rather than an arbitrary one.
  const year = Math.min(2026, ...races.map((r) => r.date_approx_year));
  const days = daysInMonth(month, year);

  const placeable = races
    .filter(isPlaceable)
    .map((r) => {
      const start = Number(r.date_start!.slice(8, 10));
      const endsThisMonth = r.date_end ? Number(r.date_end.slice(5, 7)) === month : true;
      // Three cases, and the middle one is easy to lose: a single-day race ends
      // on its start day; a multi-day race that finishes inside the month ends
      // on its own end day; and Colorado 24 Hour Run, which runs 31 Oct – 1 Nov,
      // is clamped to the month edge and flagged, rather than being drawn as if
      // it finished on the 31st or being pushed into November.
      const end = !r.date_end ? start : endsThisMonth ? Number(r.date_end.slice(8, 10)) : days;
      return { r, start, end: Math.max(start, Math.min(end, days)), continues: !endsThisMonth };
    })
    .sort((a, b) => a.start - b.start || a.r.name.localeCompare(b.r.name));

  const lanes = assignLanes(placeable.map(({ start, end }) => ({ start, end })));

  const marks: Mark[] = placeable.map(({ r, start, end, continues }, i) => ({
    slug: r.slug,
    // A mark occupies its day *cell*, not a point — so a single day is one
    // cell wide and a three-day stage race is visibly three.
    from: ((start - 1) / days) * 100,
    span: ((end - start + 1) / days) * 100,
    lane: lanes[i],
    continues,
    marquee: r.marquee,
    status: r.status,
    label: `${r.name} — ${r.date.full}`,
  }));

  return {
    marks,
    approx: races.filter((r) => !isPlaceable(r)).map((r) => ({
      slug: r.slug,
      marquee: r.marquee,
      status: r.status,
      label: `${r.name} — ${r.date.full} (day not confirmed)`,
    })),
    lanes: Math.max(MIN_LANES, ...lanes.map((l) => l + 1), 1),
    days,
    ticks: [1, 8, 15, 22, 29].filter((d) => d <= days),
  };
}
