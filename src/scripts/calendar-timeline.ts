// Wires each month's day-timeline to the event rows underneath it.
//
// Deliberately separate from filter-client.ts. That file is shared with the
// list view and was generalized in Phase 4 to know nothing about layout; this
// is calendar-specific and stays out of it. The only thing it needs from the
// filter engine is "you just re-filtered", which arrives as a generic
// `gnarlist:filtered` event on document — an extension point any future view
// (the Phase 5 map) can use without either side learning about the other.
//
// Everything here is an enhancement. With JavaScript off, a mark is a plain
// link to the race's permalink, which is never a wrong answer.

const FILTERED = 'gnarlist:filtered';

interface Pair {
  marks: HTMLElement[];
  row: HTMLElement;
}

const pairs = new Map<string, Pair>();
for (const row of document.querySelectorAll<HTMLElement>('[data-ev]')) {
  const slug = row.dataset.ev!;
  pairs.set(slug, {
    row,
    marks: [...document.querySelectorAll<HTMLElement>(`[data-mark="${CSS.escape(slug)}"]`)],
  });
}

if (pairs.size) init();

function init() {
  let cued: string | null = null;

  const setCue = (slug: string | null, scroll: boolean) => {
    if (cued === slug && !scroll) return;
    cued = slug;
    for (const [key, { row, marks }] of pairs) {
      const on = key === slug;
      row.classList.toggle('is-cued', on);
      for (const m of marks) m.classList.toggle('is-cued', on);
    }
    if (slug && scroll) {
      // `nearest` so picking a mark nudges the row into view inside its own
      // month box without yanking the whole page around it.
      pairs.get(slug)?.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  for (const [slug, { row, marks }] of pairs) {
    for (const mark of marks) {
      // Hovering previews; clicking commits and brings the row to you. The row
      // is the thing that carries the name, the date and the link onward — the
      // mark is a pointer into the list, not a destination of its own, so it
      // deliberately doesn't navigate when it can do something more useful.
      mark.addEventListener('pointerenter', () => setCue(slug, false));
      mark.addEventListener('click', (e) => {
        e.preventDefault();
        setCue(slug, true);
      });
    }
    // The reverse direction, so running down the list lights up the strip and
    // the connection reads as one object rather than two stacked ones.
    row.addEventListener('pointerenter', () => setCue(slug, false));
  }

  document.addEventListener('pointerleave', () => setCue(null, false));

  /**
   * Mirror row visibility onto the marks. The filter engine hides `[data-race]`
   * elements; a mark is not one — giving it the filter data attributes would
   * have doubled every count the results bar shows — so it follows its row.
   */
  const syncMarks = () => {
    for (const [slug, { row, marks }] of pairs) {
      for (const m of marks) m.hidden = row.hidden;
      if (row.hidden && cued === slug) setCue(null, false);
    }
  };
  document.addEventListener(FILTERED, syncMarks);
  syncMarks();
}
