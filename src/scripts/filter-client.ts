// Client-side filtering for the list view.
//
// Every row is rendered at build time and stays in the DOM; filtering only
// toggles visibility. At 75 records that is instant, needs no framework, and
// means the full list still renders with JavaScript disabled or still loading.
//
// All filter semantics live in ../lib/filters.ts, shared with the build-time
// render and with Phases 4-5.

import {
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
}

const list = document.querySelector<HTMLElement>('[data-race-list]');
const panel = document.querySelector<HTMLElement>('.filters-wrap');
if (list && panel) init(list, panel);

function init(list: HTMLElement, panel: HTMLElement) {
  const rows: Row[] = [...list.querySelectorAll<HTMLElement>('[data-race]')].map((el) => ({
    el,
    tokens: {
      formats: split(el.dataset.formats),
      distances: split(el.dataset.dists),
      region: el.dataset.region ?? '',
      month: el.dataset.month ?? '',
    },
  }));

  const nodes = [...list.children] as HTMLElement[];
  const inputs = [...panel.querySelectorAll<HTMLInputElement>('input[data-facet]')];
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const resultCount = panel.querySelector<HTMLElement>('[data-result-count]');
  const resultWord = panel.querySelector<HTMLElement>('[data-result-word]');
  const summary = panel.querySelector<HTMLElement>('[data-filter-summary]');
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
   * On a phone that is a wall of chips above the list, so collapse it here —
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
    let visible = 0;
    for (const r of rows) {
      const ok = matches(state, r.tokens);
      r.el.hidden = !ok;
      if (ok) visible++;
    }

    // Hide a month heading once nothing under it survives the filter.
    let heading: HTMLElement | null = null;
    let under = 0;
    for (const node of nodes) {
      if (node.hasAttribute('data-break')) {
        if (heading) heading.hidden = under === 0;
        heading = node;
        under = 0;
      } else if (!node.hidden) {
        under++;
      }
    }
    if (heading) heading.hidden = under === 0;

    updateCounts();

    if (resultCount) resultCount.textContent = String(visible);
    if (resultWord) resultWord.textContent = visible === 1 ? 'event' : 'events';
    if (empty) empty.hidden = visible > 0;

    const active = countActive(state);
    if (clearBtn) clearBtn.hidden = active === 0;
    if (summary) {
      summary.textContent = active === 0 ? `All ${rows.length} events` : describe(visible, active);
      summary.classList.toggle('is-on', active > 0);
    }

    if (pushUrl) {
      // replaceState, not pushState: toggling six chips shouldn't bury the
      // previous page under six history entries. The URL still reflects state
      // at every moment, so copy/bookmark/share works the same either way.
      history.replaceState(null, '', location.pathname + searchFromState(state) + location.hash);
    }
  }

  function describe(visible: number, active: number) {
    const bits: string[] = [`${visible} of ${rows.length}`];
    if (state.month.size === 1) bits.push(monthLabels.get([...state.month][0]) ?? '');
    bits.push(`${active} filter${active === 1 ? '' : 's'}`);
    return bits.filter(Boolean).join(' · ');
  }

  function updateCounts() {
    for (const facet of FACETS) {
      const base = relax(facet);
      const tally = new Map<string, number>();
      for (const r of rows) {
        if (!matches(base, r.tokens)) continue;
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
