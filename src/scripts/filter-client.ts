// Client-side filtering, shared by the list view and the calendar view.
//
// Every event is rendered at build time and stays in the DOM; filtering only
// toggles visibility. At 102 records that is instant, needs no framework, and
// means both views still render in full with JavaScript disabled or still
// loading.
//
// All filter semantics live in ../lib/filters.ts, shared with the build-time
// render. This file knows nothing about what a view looks like — it works off
// four contracts, and any future view (the Phase 5 map) can opt in by honouring
// them rather than by growing a branch in here:
//
//   [data-race]        an event. Carries its filter tokens as data attributes
//                      (see `filterAttrs` in ../lib/races.ts).
//   [data-break]       a heading that owns the sibling events following it,
//                      until the next break. The list view's month rules.
//   [data-group]       a container that owns the events inside it. The
//                      calendar's month blocks.
//   [data-view-link]   a link to the other view. Rewritten on every change so
//                      the filter state travels with the navigation.
//
// And one outbound signal: a `gnarlist:filtered` CustomEvent on document after
// every pass, for anything that has to react without being wired in here.

import {
  FILTER_STORE,
  MONTHS,
  countActive,
  matches,
  searchFromState,
  stateFromSearch,
  type FilterState,
  type RaceTokens,
} from '../lib/filters';

type Facet = 'format' | 'dist' | 'region' | 'month';
const FACETS: Facet[] = ['format', 'dist', 'region', 'month'];

interface Row {
  el: HTMLElement;
  tokens: RaceTokens;
  /**
   * Does this row contribute to displayed numbers? Discontinued and unverified
   * events don't — see `countsTowardTotals` in ../lib/races.ts. They filter,
   * sort and render exactly like every other row; they're only excluded from
   * arithmetic. Emitted as `data-counted` by `filterAttrs` so this script never
   * has to know the status vocabulary.
   */
  counted: boolean;
}

const panel = document.querySelector<HTMLElement>('.filters-wrap');
if (panel && document.querySelector('[data-race]')) init(panel);

function init(panel: HTMLElement) {
  const rows: Row[] = [...document.querySelectorAll<HTMLElement>('[data-race]')].map((el) => ({
    el,
    tokens: {
      formats: split(el.dataset.formats),
      distances: split(el.dataset.dists),
      region: el.dataset.region ?? '',
      month: el.dataset.month ?? '',
    },
    counted: el.dataset.counted === '1',
  }));

  const countedTotal = rows.filter((r) => r.counted).length;

  // Sibling-run headings (list view). Each break owns everything after it up to
  // the next break, so the walk is over the shared parent's children.
  const breakRuns = buildBreakRuns();
  // Container groups (calendar view).
  const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')].map((el) => ({
    el,
    key: el.dataset.monthBlock ?? '',
    count: el.querySelector<HTMLElement>('[data-group-count]'),
    empty: el.querySelector<HTMLElement>('[data-group-empty]'),
    rows: [...el.querySelectorAll<HTMLElement>('[data-race]')],
  }));
  const stripLinks = [...document.querySelectorAll<HTMLElement>('[data-strip]')];
  const viewLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-view-link]')];

  const inputs = [...panel.querySelectorAll<HTMLInputElement>('input[data-facet]')];
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const resultCount = panel.querySelector<HTMLElement>('[data-result-count]');
  const resultWord = panel.querySelector<HTMLElement>('[data-result-word]');
  const summary = panel.querySelector<HTMLElement>('[data-filter-summary]');
  const uncounted = panel.querySelector<HTMLElement>('[data-uncounted]');
  const uncountedCount = panel.querySelector<HTMLElement>('[data-uncounted-count]');
  const clearBtn = panel.querySelector<HTMLButtonElement>('[data-clear]');
  const copyBtn = panel.querySelector<HTMLButtonElement>('[data-copy-link]');

  let state = stateFromSearch(location.search);
  const monthLabels = new Map(MONTHS.map((m) => [m.value, m.full ?? m.label]));

  syncInputs();
  apply({ pushUrl: false });
  setUpDisclosure();

  panel.addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-facet]');
    if (!input) return;
    readInputs();
    apply({ pushUrl: true });
  });

  clearBtn?.addEventListener('click', () => {
    inputs.forEach((i) => (i.checked = false));
    readInputs();
    apply({ pushUrl: true });
  });

  copyBtn?.addEventListener('click', async () => {
    const original = copyBtn.dataset.label ?? copyBtn.textContent ?? 'Copy link';
    copyBtn.dataset.label = original;
    try {
      await navigator.clipboard.writeText(location.href);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Press ⌘/Ctrl+C';
    }
    setTimeout(() => (copyBtn.textContent = original), 1600);
  });

  // Someone navigating back to a previously shared/bookmarked filter state.
  addEventListener('popstate', () => {
    state = stateFromSearch(location.search);
    syncInputs();
    apply({ pushUrl: false });
  });

  /**
   * The panel is server-rendered open so it still works with JavaScript off.
   * On a phone that is a wall of chips above the results, so collapse it here —
   * the summary line carries the active-filter state while it's shut. Above the
   * breakpoint the summary is display:none, so the panel must be forced back
   * open on the way up or a narrow-then-widened window loses its filters.
   */
  function setUpDisclosure() {
    const details = document.getElementById('filters') as HTMLDetailsElement | null;
    if (!details) return;
    const wide = matchMedia('(min-width: 60rem)');
    if (!wide.matches) details.open = false;
    wide.addEventListener('change', () => {
      if (wide.matches) details.open = true;
    });
  }

  /** Each `[data-break]` heading paired with the sibling rows it heads. */
  function buildBreakRuns() {
    const runs: { el: HTMLElement; rows: HTMLElement[] }[] = [];
    for (const brk of document.querySelectorAll<HTMLElement>('[data-break]')) {
      const run: HTMLElement[] = [];
      for (let n = brk.nextElementSibling; n; n = n.nextElementSibling) {
        const el = n as HTMLElement;
        if (el.hasAttribute('data-break')) break;
        if (el.hasAttribute('data-race')) run.push(el);
      }
      runs.push({ el: brk, rows: run });
    }
    return runs;
  }

  function split(v: string | undefined): string[] {
    return v ? v.split(' ').filter(Boolean) : [];
  }

  function syncInputs() {
    for (const i of inputs) {
      const facet = i.dataset.facet as Facet | 'sub';
      i.checked = facet === 'sub' ? state.sub : state[facet].has(i.value);
    }
  }

  function readInputs() {
    const next: FilterState = {
      format: new Set(),
      dist: new Set(),
      region: new Set(),
      month: new Set(),
      sub: false,
    };
    for (const i of inputs) {
      if (!i.checked) continue;
      const facet = i.dataset.facet as Facet | 'sub';
      if (facet === 'sub') next.sub = true;
      else next[facet].add(i.value);
    }
    state = next;
  }

  /**
   * A state with one facet's own selections removed. Used for the chip counts,
   * so each number answers "how many results would this chip give me?" rather
   * than "how many results are showing right now?" — the latter would read 0 on
   * every unselected chip as soon as one chip in the group is on.
   *
   * Distance relaxes the sub-50K toggle alongside it: the toggle is part of the
   * distance selection (ARCHITECTURE.md §4), just wearing a different control.
   */
  function relax(facet: Facet): FilterState {
    const s: FilterState = { ...state };
    if (facet === 'dist') {
      s.dist = new Set();
      s.sub = false;
    } else {
      s[facet] = new Set();
    }
    return s;
  }

  function tokensFor(facet: Facet, t: RaceTokens): string[] {
    if (facet === 'format') return t.formats;
    if (facet === 'dist') return t.distances;
    if (facet === 'region') return t.region ? [t.region] : [];
    return t.month ? [t.month] : [];
  }

  function apply({ pushUrl }: { pushUrl: boolean }) {
    // Two different quantities, deliberately not the same variable:
    // `shown` is how many rows are on screen and drives the empty state;
    // `visible` is how many of those count and drives every displayed number.
    // Collapsing them back into one is the bug this split exists to prevent —
    // a filter can legitimately leave a discontinued row as the only survivor,
    // and the "nothing matches" copy must not appear above a visible result.
    let shown = 0;
    let visible = 0;
    for (const r of rows) {
      const ok = matches(state, r.tokens);
      r.el.hidden = !ok;
      if (!ok) continue;
      shown++;
      if (r.counted) visible++;
    }

    // Hide a list month heading once nothing under it survives the filter.
    for (const run of breakRuns) {
      run.el.hidden = !run.rows.some((el) => !el.hidden);
    }

    // Calendar month boxes stay in place — the year keeps its twelve boxes
    // however hard the filter bites — but they collapse to the slim empty
    // treatment and restate their count. The jump strip dims to match.
    for (const g of groups) {
      let gShown = 0;
      let gCounted = 0;
      for (const el of g.rows) {
        if (el.hidden) continue;
        gShown++;
        if (el.dataset.counted === '1') gCounted++;
      }
      g.el.classList.toggle('is-empty', gShown === 0);
      if (g.empty) g.empty.hidden = gShown > 0;
      if (g.count) g.count.textContent = String(gCounted);
      for (const link of stripLinks) {
        if (link.dataset.strip !== g.key) continue;
        const slot = link.querySelector('[data-strip-count]');
        if (slot) slot.textContent = String(gCounted);
        link.classList.toggle('is-empty', gShown === 0);
      }
    }

    updateCounts();

    if (resultCount) resultCount.textContent = String(visible);
    if (resultWord) resultWord.textContent = visible === 1 ? 'event' : 'events';
    if (empty) empty.hidden = shown > 0;

    const extra = shown - visible;
    if (uncounted) uncounted.hidden = extra === 0;
    if (uncountedCount) uncountedCount.textContent = String(extra);

    const active = countActive(state);
    if (clearBtn) clearBtn.hidden = active === 0;
    if (summary) {
      summary.textContent =
        active === 0 ? `All ${countedTotal} events` : describe(visible, active);
      summary.classList.toggle('is-on', active > 0);
    }

    const search = searchFromState(state);
    wireViewLinks(search);
    try {
      sessionStorage.setItem(FILTER_STORE, search);
    } catch {
      // Private-mode storage refusal. The back-link just won't be pre-filtered.
    }

    if (pushUrl) {
      // replaceState, not pushState: toggling six chips shouldn't bury the
      // previous page under six history entries. The URL still reflects state
      // at every moment, so copy/bookmark/share works the same either way.
      history.replaceState(null, '', location.pathname + search + location.hash);
    }

    /*
     * A fifth contract, and the only one that points outward: anything else on
     * the page that has to react to a filter change listens for this instead of
     * being wired in here. The calendar's day-timeline uses it to mirror row
     * visibility onto its marks. Keeps this file's promise — it knows the four
     * DOM contracts above and nothing about what any view looks like.
     */
    document.dispatchEvent(new CustomEvent('gnarlist:filtered'));
  }

  /**
   * Point the other-view link at the same filter state. This is the mechanism
   * behind "filters carry between views" (ARCHITECTURE.md §4.5): the two views
   * are separate pages, so state crosses in the query string, and the link has
   * to be current at the moment it's clicked rather than at page load.
   */
  function wireViewLinks(search: string) {
    for (const a of viewLinks) {
      const base = a.dataset.viewLink;
      if (base) a.href = base + search;
    }
  }

  function describe(visible: number, active: number) {
    const bits: string[] = [`${visible} of ${countedTotal}`];
    if (state.month.size === 1) bits.push(monthLabels.get([...state.month][0]) ?? '');
    bits.push(`${active} filter${active === 1 ? '' : 's'}`);
    return bits.filter(Boolean).join(' · ');
  }

  function updateCounts() {
    for (const facet of FACETS) {
      const base = relax(facet);
      const tally = new Map<string, number>();
      for (const r of rows) {
        if (!r.counted || !matches(base, r.tokens)) continue;
        for (const t of new Set(tokensFor(facet, r.tokens))) tally.set(t, (tally.get(t) ?? 0) + 1);
      }
      for (const chip of panel.querySelectorAll<HTMLElement>(`[data-chip^="${facet}:"]`)) {
        const token = chip.dataset.chip!.slice(facet.length + 1);
        const n = tally.get(token) ?? 0;
        const slot = chip.querySelector('[data-count]');
        if (slot) slot.textContent = String(n);
        chip.classList.toggle('is-empty', n === 0);
      }
    }
  }
}
