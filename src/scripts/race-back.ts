// Carry filter state back from an event permalink into the view it came from.
//
// Permalinks keep clean canonical URLs (ARCHITECTURE.md §4.6) — putting
// `?region=…&dist=…` on /races/hardrock-100/ would mean a hundred indexable
// variants of the same page. So the state rides in sessionStorage instead,
// written by the filter client on every change, and read here to point the
// "back to the list / calendar / map" links at the state the visitor left behind.
//
// Purely additive: with no stored state, or with storage refused, the links are
// exactly the plain hrefs already in the HTML.

import { FILTER_STORE, stateFromSearch, searchFromState } from '../lib/filters';

let search = '';
try {
  // Round-tripped through the parser rather than used raw: whatever is in
  // storage came from this site, but a link built straight from it would still
  // be a link built from unvalidated input.
  search = searchFromState(stateFromSearch(sessionStorage.getItem(FILTER_STORE) ?? ''));
} catch {
  search = '';
}

if (search) {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-back]')) {
    const base = a.dataset.back;
    if (base) a.href = base + search;
  }
}
