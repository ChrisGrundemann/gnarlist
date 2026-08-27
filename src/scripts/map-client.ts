// Phase 5 — the map view's browser half.
//
// Leaflet plus leaflet.markercluster over free CARTO/OSM tiles (ARCHITECTURE.md
// §2.2: no API key, no Mapbox, no billing tier to hit).
//
// Deliberately separate from filter-client.ts, exactly as calendar-timeline.ts
// is. That file was generalized in Phase 4 to know four DOM contracts and
// nothing about layout, and it dispatches one outbound signal — a
// `gnarlist:filtered` CustomEvent on `document` — precisely so a later view
// could react without either side learning about the other. This is that later
// view. Nothing in filter-client.ts changed to make the map work.
//
// Everything here is an enhancement. With JavaScript off the page still lists
// all 102 events, grouped by region, each linked to its full record; the map
// container collapses to a sentence saying so.

import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import { COLORADO_BOUNDS, PRECISION_NOTE, TIER_PX, pinClass, type MapPoint } from '../lib/map';

const FILTERED = 'gnarlist:filtered';

/** Zoom at which the route's start/finish labels stop overlapping each other. */
const LABEL_ZOOM = 9;

interface GnarMarker extends L.Marker {
  gnar: MapPoint;
}

/**
 * Read a design token out of the stylesheet.
 *
 * Leaflet paints the spider legs through JS options rather than CSS, and the
 * one thing this session must not do is scatter hex values through components —
 * a colour sweep is coming and it should be a values-only edit in global.css.
 * So the value is fetched from the same custom property everything else uses.
 */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const shell = document.querySelector<HTMLElement>('[data-map-shell]');
const host = document.querySelector<HTMLElement>('[data-map]');
const payload = document.getElementById('map-points');

if (shell && host && payload?.textContent) {
  init(shell, host, JSON.parse(payload.textContent) as MapPoint[]);
}

function init(shell: HTMLElement, host: HTMLElement, points: MapPoint[]) {
  // Size the container before Leaflet measures it.
  shell.classList.add('is-ready');

  /*
   * Every gesture handler starts disabled — a cooperative-gesture map.
   *
   * This is a baseline-mobile-usability decision (ARCHITECTURE.md §4.5), not
   * polish. A 68vh map in the middle of a scrolling page will otherwise eat a
   * one-finger swipe on a phone and a scroll wheel on a desktop, and the reader
   * gets stuck on it. One deliberate tap on the veil hands the gestures over.
   */
  const map = L.map(host, {
    minZoom: 6,
    maxZoom: 17,
    zoomControl: true,
    // Keeps a pan from wandering off to Kansas without hard-locking the view;
    // the map is about Colorado but the state line isn't a wall.
    maxBounds: L.latLngBounds([33.5, -114.5], [44.5, -96.5]),
    maxBoundsViscosity: 0.55,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  const veil = shell.querySelector<HTMLButtonElement>('[data-map-veil]');
  if (veil) {
    veil.hidden = false;
    veil.addEventListener('click', () => {
      map.dragging.enable();
      map.touchZoom.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      veil.hidden = true;
      shell.classList.add('is-engaged');
    });
  } else {
    // No veil in the DOM (shouldn't happen) — don't ship a dead map.
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
  }

  /*
   * Plain OpenStreetMap raster tiles, darkened in CSS (see `.leaflet-tile-pane`
   * in map.css).
   *
   * §2.2 named CARTO's dark basemap as the example to use. It no longer
   * qualifies under that decision's own terms: CARTO's keyless tiles now come
   * back stamped "API KEY REQUIRED" across every tile, which is the billing
   * tier §2.2 chose Leaflet+OSM specifically to avoid. Standard OSM tiles are
   * keyless, ODbL, and literally the "free OSM-derived tiles" the decision
   * asks for; the dark treatment moves from the provider into one CSS filter.
   * Documented in ARCHITECTURE.md §2.2 as an amendment, not a reversal.
   *
   * OSMF's tile usage policy applies: attribution is required (below), and the
   * site must stay a light user. A hand-maintained index of ~100 races is.
   */
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  map.fitBounds(COLORADO_BOUNDS);

  /*
   * Clustering is load-bearing here, not decoration. 102 events sit on 55
   * distinct coordinates because 98 of them are geocoded from a town name —
   * eleven races share one Colorado Springs point. Without clustering those
   * eleven are one unreadable pile with ten unreachable markers underneath.
   *
   * `disableClusteringAtZoom` is deliberately NOT set: coincident points never
   * separate however far you zoom, so the cluster has to survive to max zoom
   * and hand off to spiderfy. That is the whole mechanism by which a
   * same-town pile becomes clickable.
   */
  const cluster = L.markerClusterGroup({
    maxClusterRadius: 44,
    showCoverageOnHover: false, // degenerate for coincident points; just noise
    spiderfyDistanceMultiplier: 1.7,
    iconCreateFunction: clusterIcon,
    // The plugin's default legs are #222 at half opacity — invisible on this
    // ground, which loses the one thing the legs are for: showing that a fanned
    // marker still belongs to the single point at the centre.
    spiderLegPolylineOptions: { weight: 1, color: token('--map-pin'), opacity: 0.5 },
    // Both defaults off — the click behaviour below replaces them wholesale.
    zoomToBoundsOnClick: false,
    spiderfyOnMaxZoom: false,
  });
  map.addLayer(cluster);

  /*
   * Cluster clicks, hand-rolled, and this is not gold-plating — the plugin's
   * default is wrong for this dataset.
   *
   * Out of the box a cluster click zooms to its children's bounds and only
   * spiderfies once the map is at max zoom. That assumes zooming eventually
   * separates the points. Here it never does: 98 coordinates are town
   * centroids, so eleven Colorado Springs races are on *literally the same
   * point* and stay one cluster at every zoom. The default behaviour makes a
   * reader click eight times, watching the map zoom uselessly, before the fan
   * finally opens at z17.
   *
   * So: if every child shares one coordinate, spiderfy immediately — zooming
   * cannot help. Otherwise zoom to the bounds, which is the right answer for a
   * cluster of genuinely distinct places.
   */
  cluster.on('clusterclick', (e) => {
    const c = (e as unknown as { layer: L.MarkerCluster }).layer;
    const kids = c.getAllChildMarkers() as GnarMarker[];
    // Coincidence is judged from our own record, NOT from `marker.getLatLng()`.
    // Spiderfying physically moves each child's latlng to its position on the
    // fan, so asking Leaflet where a marker is returns the fanned position and
    // an already-open cluster would look non-coincident — which sent a second
    // click straight to max zoom. `gnar` is the source data and doesn't move.
    const home = kids[0].gnar;
    const same = kids.every((m) => m.gnar.lat === home.lat && m.gnar.lng === home.lng);
    if (same) {
      // A fan opened against the edge of the frame throws half its markers off
      // screen. Nudge the point inward first — the minimum pan that makes the
      // whole fan land inside, rather than a re-centre that moves everything.
      map.panInside(c.getLatLng(), { padding: [130, 130] });
      c.spiderfy();
    } else {
      c.zoomToBounds({ padding: [40, 40] });
    }
  });

  // ---------------------------------------------------------------
  // Markers, and the one route
  // ---------------------------------------------------------------

  const markers = new Map<string, GnarMarker>();
  /** Layers that belong to a route rather than to the cluster group. */
  const routeLayers = new Map<string, L.Layer[]>();
  /** Elements to paint when a slug is cued, resolved fresh on every cue. */
  const routeEls = new Map<string, () => Element[]>();

  for (const p of points) {
    if (p.route) buildRoute(p);
    else markers.set(p.slug, buildMarker(p, TIER_PX[p.tier]));
  }

  function buildMarker(p: MapPoint, d: number): GnarMarker {
    const marker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: '',
        html: `<span class="${pinClass(p)}" style="--d:${d}px"></span>`,
        iconSize: [d, d],
        iconAnchor: [d / 2, d / 2],
      }),
      // The index rows below carry every semantic and all keyboard access; the
      // markers duplicate them. Same call the calendar made for its timeline
      // marks — exposing both would read the dataset twice to a screen reader
      // and put a hundred stops in the tab order.
      keyboard: false,
      title: p.name,
      riseOnHover: true,
    }) as GnarMarker;
    marker.gnar = p;
    marker.bindPopup(() => popup(p), { closeButton: true, autoPanPadding: [24, 24] });
    marker.on('mouseover', () => setCue(p.slug, false));
    marker.on('click', () => setCue(p.slug, true));
    return marker;
  }

  /**
   * TransRockies — the deferred cross-boundary case (ARCHITECTURE.md §4,
   * SCHEMA.md §6.7). Leadville to Red Cliff over Tennessee Pass is a route, and
   * this is the view where it stops being pretended into a point.
   *
   * The route is deliberately NOT in the cluster group. Clustering its
   * endpoints would fold them into the Leadville pile at every zoom below the
   * last one, which would hide exactly the thing the route treatment exists to
   * show. It filters with everything else — it just isn't clusterable.
   */
  function buildRoute(p: MapPoint) {
    const r = p.route!;
    const line = L.polyline(r.path, { className: 'rt-line', interactive: true });
    const cap = (
      at: [number, number],
      label: string,
      letter: string,
      finish: boolean,
    ): L.Marker =>
      L.marker(at, {
        icon: L.divIcon({
          className: '',
          html: `<span class="rt-cap${finish ? ' is-finish' : ''}">${letter}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        keyboard: false,
        title: `${p.name} — ${label}`,
        riseOnHover: true,
      }).bindTooltip(label, {
        permanent: true,
        direction: finish ? 'right' : 'left',
        className: 'rt-tip',
        offset: [finish ? 10 : -10, 0],
      });

    const start = cap(r.path[0], r.startLabel, 'S', false);
    const finish = cap(r.path[r.path.length - 1], r.finishLabel, 'F', true);

    for (const layer of [line, start, finish]) {
      layer.on('mouseover', () => setCue(p.slug, false));
      layer.on('click', () => setCue(p.slug, true));
      if (layer !== line) (layer as L.Marker).bindPopup(() => popup(p));
    }
    line.bindPopup(() => popup(p));

    routeLayers.set(p.slug, [line, start, finish]);
    routeEls.set(p.slug, () =>
      [
        line.getElement(),
        start.getElement()?.querySelector('.rt-cap'),
        finish.getElement()?.querySelector('.rt-cap'),
      ].filter(Boolean) as Element[],
    );
  }

  // ---------------------------------------------------------------
  // Popups
  // ---------------------------------------------------------------

  function popup(p: MapPoint): HTMLElement {
    const el = document.createElement('div');
    if (p.marquee) el.className = 'is-marquee-pp';

    const head = add(el, 'div', 'pp-head');
    if (p.marquee) add(head, 'span', 'pp-star', '★');
    const name = add(head, 'a', 'pp-name', p.name) as HTMLAnchorElement;
    name.href = p.href;

    // The date reads with the same tilde the list and calendar use for an
    // unconfirmed one, rather than being silently presented as settled.
    const when = add(el, 'p', 'pp-when');
    if (p.dateApprox) add(when, 'span', 'tilde', '~ ');
    when.append(p.when);

    const where = add(el, 'p', 'pp-where');
    const town = document.createElement('b');
    town.textContent = p.town;
    where.append(town, ` · ${p.region}`);

    if (p.distances) add(el, 'p', 'pp-dist', p.distances);

    if (p.status !== 'active') {
      add(el, 'span', `pp-status s-${p.status}`, p.status);
    }

    /*
     * The precision line, on every single popup with no exceptions. A pin says
     * "here"; for 98 of 102 records the data only supports "somewhere in this
     * town". The other two views never had to admit that because neither draws
     * a position — this one does, so it says so in words as well as in the
     * pin's soft edge. Same discipline as gating JSON-LD's `startDate` on
     * `date_confirmed` and the calendar's dashed gutter marks: state the
     * confidence, don't launder it.
     */
    const prec = add(el, 'p', 'pp-prec', PRECISION_NOTE[p.precision](p.from));
    if (p.route) {
      prec.textContent =
        'Drawn as an approximate corridor — Leadville over Tennessee Pass to Red Cliff. ' +
        'The shape of the route, not a surveyed course.';
    }

    const go = add(el, 'a', 'pp-go', 'Full record →') as HTMLAnchorElement;
    go.href = p.href;
    return el;
  }

  function add(parent: Element, tag: string, cls: string, text?: string) {
    const n = document.createElement(tag);
    n.className = cls;
    if (text != null) n.textContent = text;
    parent.append(n);
    return n;
  }

  // ---------------------------------------------------------------
  // Cluster badges
  // ---------------------------------------------------------------

  /**
   * A cluster badge is a displayed number, so §4's counting rule applies to it
   * the same as to the results bar and the region headings: discontinued and
   * unverified events don't contribute. They are still on the map, still
   * clustered, still clickable — the badge just doesn't count them, and says
   * "+n" in rust when it isn't counting some, which is the same wording and the
   * same colour the results bar uses for the same gap.
   */
  function clusterIcon(c: L.MarkerCluster): L.DivIcon {
    const kids = c.getAllChildMarkers() as GnarMarker[];
    let counted = 0;
    let marquee = false;
    for (const m of kids) {
      if (m.gnar?.counted) counted++;
      if (m.gnar?.marquee) marquee = true;
    }
    const extra = kids.length - counted;
    const size = kids.length < 10 ? 34 : kids.length < 30 ? 42 : 50;
    const cls = ['cl', size >= 42 && 'is-lg', marquee && 'has-marquee'].filter(Boolean).join(' ');
    const tail = extra ? `<span class="x">+${extra}</span>` : '';
    return L.divIcon({
      // `marker-cluster` is markercluster's own hook class — the plugin's
      // animation CSS and this file's hover/cue rules both key off it, so it
      // has to survive replacing the default icon.
      className: 'marker-cluster',
      html: `<span class="${cls}"><span class="n">${counted}</span>${tail}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  // ---------------------------------------------------------------
  // The index rows below the map
  // ---------------------------------------------------------------

  const rows = new Map<string, HTMLElement>();
  for (const row of document.querySelectorAll<HTMLElement>('[data-ev]')) {
    rows.set(row.dataset.ev!, row);
  }

  let cued: string | null = null;

  function clearMapCue() {
    for (const el of host.querySelectorAll('.pin.is-cued, .rt-cap.is-cued, .rt-line.is-cued')) {
      el.classList.remove('is-cued');
    }
    for (const el of host.querySelectorAll('.marker-cluster.is-cued')) {
      el.classList.remove('is-cued');
    }
  }

  /**
   * Light one race in both places at once, so the map and the index read as one
   * object rather than two stacked ones — the same relationship the calendar
   * built between a timeline mark and its row.
   *
   * A cued marker that is currently inside a collapsed cluster paints the
   * cluster instead. Zooming the map on hover would be worse than useless.
   */
  function setCue(slug: string | null, scroll: boolean) {
    if (cued === slug && !scroll) return;
    cued = slug;

    for (const [key, row] of rows) row.classList.toggle('is-cued', key === slug);
    clearMapCue();

    if (!slug) return;

    const marker = markers.get(slug);
    if (marker) {
      const parent = cluster.hasLayer(marker) ? cluster.getVisibleParent(marker) : null;
      if (parent && parent !== marker) {
        parent.getElement()?.classList.add('is-cued');
      } else {
        marker.getElement()?.querySelector('.pin')?.classList.add('is-cued');
      }
    }
    for (const el of routeEls.get(slug)?.() ?? []) el.classList.add('is-cued');

    if (scroll) rows.get(slug)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  for (const [slug, row] of rows) {
    row.addEventListener('pointerenter', () => setCue(slug, false));
  }
  document.addEventListener('pointerleave', () => setCue(null, false));
  // Re-paint after a cluster redraw, which throws away the elements we painted.
  cluster.on('animationend spiderfied unspiderfied', () => {
    const slug = cued;
    cued = null;
    setCue(slug, false);
  });

  // ---------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------

  /**
   * Mirror row visibility onto the map. The filter engine hides `[data-race]`
   * elements and knows nothing else; a marker is not one of those — giving a
   * marker the filter data attributes would have doubled every count in the
   * results bar, which is the same trap the calendar's timeline marks avoided.
   * So the markers follow their rows.
   *
   * `clearLayers` + `addLayers` rather than per-marker add/remove: markercluster
   * bulk-loads in one pass and re-clusters once, where 102 individual removals
   * re-cluster 102 times.
   */
  function syncMarkers() {
    const visible: GnarMarker[] = [];
    for (const [slug, marker] of markers) {
      if (!rows.get(slug)?.hidden) visible.push(marker);
    }
    cluster.clearLayers();
    cluster.addLayers(visible);

    for (const [slug, layers] of routeLayers) {
      const on = !rows.get(slug)?.hidden;
      for (const layer of layers) {
        if (on) layer.addTo(map);
        else map.removeLayer(layer);
      }
    }

    if (cued && rows.get(cued)?.hidden) setCue(null, false);
    else if (cued) {
      const slug = cued;
      cued = null;
      setCue(slug, false);
    }
  }

  document.addEventListener(FILTERED, syncMarkers);
  syncMarkers();

  /*
   * Frame the results on arrival when — and only when — the URL already carries
   * a filter. Someone who followed a filtered link from the list or calendar
   * means "show me these", and a state-sized frame around three San Juan races
   * answers a question they didn't ask. Toggling a chip afterwards deliberately
   * does NOT move the map: by then the reader has panned and zoomed somewhere
   * on purpose, and yanking the viewport out from under them is worse than a
   * result sitting off-screen with a button that fetches it.
   */
  if (location.search.length > 1) fitResults();

  // ---------------------------------------------------------------
  // Chrome
  // ---------------------------------------------------------------

  /**
   * Frame whatever is currently showing.
   *
   * "Fit Colorado" was the obvious control and the wrong one: filters carry
   * across views, so arriving from the calendar with `?region=san-juans` leaves
   * fourteen races in one corner of a state-sized frame. Fitting the *results*
   * is the same button doing a more useful job, and it still answers "show me
   * the whole state" when nothing is filtered — because then the results are
   * the whole state.
   *
   * Positions come from `gnar`, not `getLatLng()`, for the same reason the
   * cluster-click test does: spiderfy moves a marker's latlng onto the fan.
   */
  function fitResults() {
    const b = L.latLngBounds([]);
    for (const [slug, m] of markers) {
      if (!rows.get(slug)?.hidden) b.extend([m.gnar.lat, m.gnar.lng]);
    }
    for (const [slug, layers] of routeLayers) {
      if (rows.get(slug)?.hidden) continue;
      for (const layer of layers) if (layer instanceof L.Polyline) b.extend(layer.getBounds());
    }
    // maxZoom so a single surviving race frames its region rather than slamming
    // to street level on a town-centre coordinate it can't justify.
    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 12 });
    else map.fitBounds(COLORADO_BOUNDS);
  }

  document.querySelector<HTMLButtonElement>('[data-fit]')?.addEventListener('click', fitResults);

  // The route's two endpoint labels are ~20 miles apart, which is about ten
  // pixels at statewide zoom. They appear once there's room for them.
  const syncZoomClass = () => shell.classList.toggle('is-close', map.getZoom() >= LABEL_ZOOM);
  map.on('zoomend', syncZoomClass);
  syncZoomClass();
}
