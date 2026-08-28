#!/usr/bin/env node
/*
 * WCAG 2.1 AA contrast audit for the built site.
 *
 *   npm run build && node scripts/contrast-audit.mjs
 *   node scripts/contrast-audit.mjs --widths 1440,753,390 --verbose
 *
 * Why this exists rather than a table of hexes someone maintains by hand:
 * almost nothing on this site is one flat colour on another. Backgrounds are
 * gradients (the marquee gold wash), hatching (discontinued rows), alpha over
 * alpha (chip fills), and on the map, live OpenStreetMap raster tiles under a
 * CSS filter. The only honest way to know what a reader sees is to look at the
 * pixels, so that is what this does:
 *
 *   1. render each page in headless Chrome at a given width;
 *   2. record every text run, its computed colour, size and weight, and the
 *      rectangles it actually occupies — clipped to the element's own box and
 *      to every overflow-hidden ancestor, because -webkit-line-clamp and
 *      Leaflet markers both report rects for pixels nobody ever sees;
 *   3. repaint the page with all text made transparent and screenshot it,
 *      which leaves every background exactly as it renders and no glyphs;
 *   4. sample eighteen points behind each text run and keep the worst ratio.
 *
 * Foreground alpha (including opacity inherited from ancestors, which is
 * multiplicative and is what made three "recede" treatments fail) is
 * composited over the sampled background before the ratio is taken.
 *
 * Thresholds: 4.5:1 normal text, 3:1 large text (>=24px, or >=18.66px bold).
 * Two categories are reported but not failed, both deliberately:
 *   - gradient-clipped display text (background-clip: text), which is painted
 *     by its own background and has to be reasoned about from the gradient
 *     stops -- see ARCHITECTURE.md section 7 item 6;
 *   - inactive controls (.leaflet-disabled and friends), which WCAG 1.4.3 and
 *     1.4.11 both exempt.
 *
 * Non-text contrast (1.4.11 -- control borders, status rings, pins) is not
 * covered here; those pairings are flat colours and are tabulated in
 * ARCHITECTURE.md section 7 item 6 where they can be checked by hand.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PAGES = ['/', '/calendar/', '/map/', '/races/hardrock-100/'];
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const WIDTHS = arg('--widths', '1440,753,390').split(',').map(Number);
const VERBOSE = argv.includes('--verbose');
const PORT = Number(arg('--port', 8099));
const CDP_PORT = Number(arg('--cdp-port', 9223));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.xml': 'application/xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = join(ROOT, p);
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); }
    catch { if (!extname(f)) f = join(ROOT, p, 'index.html'); }
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));
const BASE = `http://127.0.0.1:${PORT}`;

const profile = await mkdtemp(join(tmpdir(), 'gnar-contrast-'));
const CHROME = process.env.CHROME || 'google-chrome';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu',
  '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' });

const cleanup = async (code) => {
  try { chrome.kill(); } catch {}
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => cleanup(130));

/* ---------- minimal CDP client ---------- */
async function connect() {
  let list;
  for (let i = 0; i < 80; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); if (list.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!list || !list.length) { console.error(`Could not reach headless Chrome. Set CHROME=<path> if "${CHROME}" is wrong.`); await cleanup(2); }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const on = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
    else on.forEach((f) => f(msg));
  };
  return {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (f) => on.push(f),
  };
}
const cdp = await connect();
await cdp.send('Runtime.enable');
const evalIn = async (src, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: `(${src})()`, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};
const goto = async (url) => {
  await cdp.send('Page.enable');
  const done = new Promise((res) => cdp.on((m) => { if (m.method === 'Page.loadEventFired') res(); }));
  await cdp.send('Page.navigate', { url });
  await done; await new Promise((r) => setTimeout(r, 450));
};

/* ---------- in-page: collect every text run ---------- */
const COLLECT = `() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent; if (!t || !/\\S/.test(t)) continue;
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let eff = 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) eff *= Number(getComputedStyle(p).opacity);
    if (eff < 0.02) continue;
    const boxes = [el.getBoundingClientRect()];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const q = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(q.overflow + q.overflowX + q.overflowY)) boxes.push(p.getBoundingClientRect());
    }
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].map((b) => {
      let x0 = b.x, x1 = b.right, y0 = b.y, y1 = b.bottom;
      for (const q of boxes) { x0 = Math.max(x0, q.x); x1 = Math.min(x1, q.right); y0 = Math.max(y0, q.y); y1 = Math.min(y1, q.bottom); }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }).filter((b) => b.w > 1 && b.h > 1);
    if (!rects.length) continue;
    const path = [];
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      path.push(p.tagName.toLowerCase() + (typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\\s+/).join('.') : ''));
      if (path.length >= 3) break;
    }
    out.push({ sel: path.join(' < '), text: t.trim().slice(0, 40), color: cs.color, opacity: eff,
      fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, rects,
      clipText: /text/.test(cs.webkitBackgroundClip || '') || /text/.test(cs.backgroundClip || ''),
      disabled: !!el.closest('.leaflet-disabled, [disabled], [aria-disabled="true"]') });
  }
  return out;
}`;

const SAMPLE = (items, dataUrl) => `async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const rat = (a, b) => { const A = lum(a), B = lum(b), h = Math.max(A, B), l = Math.min(A, B); return (h + 0.05) / (l + 0.05); };
  const parse = (s) => { const m = s.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (f, bg) => [f.r, f.g, f.b].map((v, i) => Math.round(v * f.a + bg[i] * (1 - f.a)));
  const out = [];
  for (const it of ${JSON.stringify(items)}) {
    const fc = parse(it.color); fc.a *= it.opacity;
    let worst = null;
    for (const r of it.rects) for (let i = 1; i <= 6; i++) for (let j = 1; j <= 3; j++) {
      const X = Math.round(r.x + r.w * i / 7), Y = Math.round(r.y + r.h * j / 4);
      if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) continue;
      const d = x.getImageData(X, Y, 1, 1).data, bg = [d[0], d[1], d[2]];
      const fg = fc.a < 1 ? over(fc, bg) : [fc.r, fc.g, fc.b];
      const cr = rat(fg, bg);
      if (!worst || cr < worst.cr) worst = { cr, bg, fg };
    }
    if (!worst) continue;
    const large = it.fontSize >= 24 || (it.fontSize >= 18.66 && Number(it.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    out.push({ sel: it.sel, text: it.text, fontSize: it.fontSize, fontWeight: it.fontWeight, large, need,
      ratio: Math.round(worst.cr * 100) / 100, fg: worst.fg, bg: worst.bg,
      skip: it.clipText ? 'gradient-clipped' : it.disabled ? 'inactive control' : null,
      pass: worst.cr >= need });
  }
  return out;
}`;

/* ---------- run ---------- */
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
let failures = 0, checked = 0, skipped = 0, tightest = [];

for (const W of WIDTHS) {
  const rows = [];
  for (const page of PAGES) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 700 });
    await goto(BASE + page);
    const h = await evalIn(`() => Math.min(document.documentElement.scrollHeight, 15000)`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: W < 700 });
    await new Promise((r) => setTimeout(r, 600));
    // The map hides behind a one-tap veil whose label covers live map content.
    await evalIn(`() => { document.querySelector('.map-veil')?.click(); return 1; }`);
    await new Promise((r) => setTimeout(r, 500));

    const items = await evalIn(COLLECT);
    await evalIn(`() => { const s = document.createElement('style'); s.id = '__nt';
      s.textContent = '*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;text-decoration-color:transparent !important;}';
      document.head.appendChild(s); return 1; }`);
    await new Promise((r) => setTimeout(r, 250));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await evalIn(`() => { document.getElementById('__nt')?.remove(); return 1; }`);
    for (const r of await evalIn(SAMPLE(items, 'data:image/png;base64,' + shot.data), true)) rows.push({ page, ...r });
  }
  // Unique pairings: same selector, same colours, same type size.
  const uniq = new Map();
  for (const r of rows) {
    const k = `${r.sel}|${hex(r.fg)}|${hex(r.bg)}|${r.fontSize}|${r.fontWeight}`;
    if (!uniq.has(k) || r.ratio < uniq.get(k).ratio) uniq.set(k, r);
  }
  const list = [...uniq.values()].sort((a, b) => a.ratio - b.ratio);
  const skips = list.filter((r) => r.skip);
  const real = list.filter((r) => !r.skip);
  const bad = real.filter((r) => !r.pass);
  checked += real.length; skipped += skips.length; failures += bad.length;
  tightest = tightest.concat(real.filter((r) => r.pass));

  console.log(`\n=== ${W}px — ${rows.length} text runs, ${real.length} unique pairings, ${skips.length} reported-not-failed ===`);
  for (const r of bad) console.log(`  FAIL ${String(r.ratio).padStart(5)} (needs ${r.need})  ${hex(r.fg)} on ${hex(r.bg)}  ${r.page}  ${r.sel}  "${r.text}"`);
  for (const r of skips) console.log(`  SKIP ${String(r.ratio).padStart(5)} [${r.skip}]  ${r.page}  ${r.sel}  "${r.text}"`);
  if (!bad.length) console.log('  no failures');
  if (VERBOSE) for (const r of real.sort((a, b) => a.ratio - b.ratio))
    console.log(`   ${r.pass ? 'ok  ' : 'FAIL'} ${String(r.ratio).padStart(6)}/${r.need}  ${hex(r.fg)} on ${hex(r.bg)}  ${r.fontSize}px/${r.fontWeight}  ${r.sel}`);
}

const norm = tightest.filter((r) => !r.large).sort((a, b) => a.ratio - b.ratio);
const larg = tightest.filter((r) => r.large).sort((a, b) => a.ratio - b.ratio);
console.log(`\n--- tightest passing normal text ---`);
for (const r of norm.slice(0, 6)) console.log(`  ${String(r.ratio).padStart(5)}  ${hex(r.fg)} on ${hex(r.bg)}  ${r.sel}`);
console.log(`--- tightest passing large text ---`);
for (const r of larg.slice(0, 3)) console.log(`  ${String(r.ratio).padStart(5)}  ${hex(r.fg)} on ${hex(r.bg)}  ${r.sel}`);
console.log(`\n${checked} pairings checked across ${WIDTHS.length} widths, ${skipped} reported-not-failed, ${failures} failures.`);
await cleanup(failures ? 1 : 0);
