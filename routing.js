'use strict';
/* Calcolo della rotta sull'acqua: griglia acqua/terra + canali, A* a costo di tempo, semplificazione in poche prue. */
(function (root) {
const RAD = Math.PI / 180, M = 111320, MPS = 0.514444;

function dist(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dp = p2 - p1, dl = (b.lng - a.lng) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function segDistM(p, a, b) {
  const k = Math.cos(p.lat * RAD);
  const ax = (a.lng - p.lng) * k * M, ay = (a.lat - p.lat) * M;
  const bx = (b.lng - p.lng) * k * M, by = (b.lat - p.lat) * M;
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? -(ax * dx + ay * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/* ---- limiti di velocità ---- */
function parseLimit(tags) {
  const raw = tags.maxspeed || tags['maxspeed:nautical'] || tags['maxspeed:boat'];
  if (!raw) return 0;
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)\s*(kn|knots|kt|nodi|mph|km\/h|kmh)?/i);
  if (!m) return 0;
  let v = parseFloat(m[1].replace(',', '.'));
  const u = (m[2] || '').toLowerCase();
  if (u === 'kn' || u === 'knots' || u === 'kt' || u === 'nodi') { /* già in nodi */ }
  else if (u === 'mph') v *= 0.868976;
  else v /= 1.852;
  return +v.toFixed(1);
}
function prep(chs) {
  chs.forEach(c => {
    if (c.bb) return;
    let a = 90, b = 180, cc = -90, d = -180;
    c.pts.forEach(p => { a = Math.min(a, p.lat); cc = Math.max(cc, p.lat); b = Math.min(b, p.lng); d = Math.max(d, p.lng); });
    c.bb = [a, b, cc, d];
  });
  return chs;
}
/* limite (nodi) valido in un punto: zone di velocità e canali entro 35 m. null = nessun limite locale */
function limitAt(p, chs, zones) {
  let v = 0, why = '';
  (zones || []).forEach(z => {
    if (z.limit > 0 && (!v || z.limit < v) && dist(p, z) <= z.r) { v = z.limit; why = z.name || 'zona'; }
  });
  const mLat = 0.0007, mLng = 0.0007 / Math.max(0.2, Math.cos(p.lat * RAD));
  (chs || []).forEach(c => {
    if (!(c.limit > 0) || (v && c.limit >= v) || !c.bb) return;
    if (p.lat < c.bb[0] - mLat || p.lat > c.bb[2] + mLat || p.lng < c.bb[1] - mLng || p.lng > c.bb[3] + mLng) return;
    for (let i = 1; i < c.pts.length; i++) {
      if (segDistM(p, c.pts[i - 1], c.pts[i]) <= 35) { v = c.limit; why = c.name || 'canale'; break; }
    }
  });
  return v ? { v, why } : null;
}
/* tempo (s) per percorrere a->b a velocità di crociera, rallentando nei tratti con limite */
function legTime(a, b, chs, zones, cruise) {
  const d = dist(a, b), n = Math.max(1, Math.ceil(d / 30)), step = d / n;
  let t = 0, vmin = cruise;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const l = limitAt({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, chs, zones);
    const v = l ? Math.min(cruise, l.v) : cruise;
    vmin = Math.min(vmin, v);
    t += step / (v * MPS);
  }
  return { d, t, vmin };
}

/* ---- griglia di lavoro ---- */
function plan(start, dest, opt) {
  opt = opt || {};
  const lat0 = (start.lat + dest.lat) / 2, lng0 = (start.lng + dest.lng) / 2, k = Math.cos(lat0 * RAD);
  const toXY = p => ({ x: (p.lng - lng0) * k * M, y: (p.lat - lat0) * M });
  const toLL = (x, y) => ({ lat: lat0 + y / M, lng: lng0 + x / (k * M) });
  const s = toXY(start), d = toXY(dest);
  const span = Math.max(Math.abs(d.x - s.x), Math.abs(d.y - s.y));
  if (span > 70000) throw new Error('Tratta troppo lunga per il calcolo automatico: aggiungi una tappa intermedia.');
  const pad = Math.max(1500, 0.3 * span);
  const minX = Math.min(s.x, d.x) - pad, maxX = Math.max(s.x, d.x) + pad;
  const minY = Math.min(s.y, d.y) - pad, maxY = Math.max(s.y, d.y) + pad;
  const W = maxX - minX, H = maxY - minY;
  const cs = Math.max(opt.minCell || 20, Math.ceil(Math.max(W, H) / 700));
  const cols = Math.ceil(W / cs), rows = Math.ceil(H / cs);
  const sw = toLL(minX, minY), ne = toLL(maxX, maxY);
  return { lat0, lng0, k, toXY, toLL, minX, minY, cs, cols, rows, start, dest, bbox: { s: sw.lat, w: sw.lng, n: ne.lat, e: ne.lng } };
}

/* ---- dati OpenStreetMap: canali navigabili e briccole ---- */
async function fetchOverpass(bb, defLimit) {
  const b = `${bb.s.toFixed(5)},${bb.w.toFixed(5)},${bb.n.toFixed(5)},${bb.e.toFixed(5)}`;
  const q = '[out:json][timeout:25];(' +
    `way["waterway"="fairway"](${b});` +
    `way["seamark:type"~"^(fairway|recommended_track|navigation_line)$"](${b});` +
    `way["waterway"="canal"]["motorboat"="yes"](${b});` +
    `way["waterway"="canal"]["boat"="yes"](${b});` +
    ');out geom;' +
    `node["seamark:type"~"^(beacon_lateral|beacon_cardinal|buoy_lateral|buoy_cardinal)$"](${b});out;`;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q), signal: ctl.signal
    });
    if (!r.ok) throw new Error('Overpass ' + r.status);
    const j = await r.json();
    const channels = [], beacons = [];
    (j.elements || []).forEach(el => {
      const t = el.tags || {};
      if (el.type === 'way' && el.geometry && el.geometry.length > 1) {
        channels.push({
          name: t.name || t['seamark:name'] || '', limit: parseLimit(t) || defLimit || 5,
          pts: el.geometry.map(g => ({ lat: +g.lat.toFixed(5), lng: +g.lon.toFixed(5) }))
        });
      } else if (el.type === 'node' && isFinite(el.lat)) {
        const ck = Object.keys(t).find(k => /:colour$/.test(k));
        const col = ck ? String(t[ck]) : '';
        beacons.push({ lat: el.lat, lng: el.lon, color: /red/.test(col) ? 'red' : /green/.test(col) ? 'green' : /yellow/.test(col) ? 'yellow' : 'grey', name: t['seamark:name'] || t.name || '' });
      }
    });
    return { channels, beacons: beacons.slice(0, 600) };
  } finally { clearTimeout(to); }
}

/* ---- maschera acqua/terra letta dalle tiles OpenStreetMap (solo browser) ---- */
async function loadTileMask(g, onProgress) {
  const cosl = Math.cos(g.lat0 * RAD);
  let z = Math.ceil(Math.log2(156543.03 * cosl / (g.cs / 4)));
  z = Math.max(12, Math.min(17, z));
  const tilesFor = zz => {
    const n = 2 ** zz, gx0 = (g.lng0 + 180) / 360 * n * 256;
    const gy0 = (1 - Math.asinh(Math.tan(g.lat0 * RAD)) / Math.PI) / 2 * n * 256;
    const ppm = n * 256 / (40075016.686 * cosl);
    const x0 = gx0 + g.minX * ppm, x1 = gx0 + (g.minX + g.cols * g.cs) * ppm;
    const y0 = gy0 - (g.minY + g.rows * g.cs) * ppm, y1 = gy0 - g.minY * ppm;
    return { gx0, gy0, ppm, tx0: Math.floor(x0 / 256), tx1: Math.floor(x1 / 256), ty0: Math.floor(y0 / 256), ty1: Math.floor(y1 / 256) };
  };
  let T = tilesFor(z);
  while (z > 12 && (T.tx1 - T.tx0 + 1) * (T.ty1 - T.ty0 + 1) > 150) { z--; T = tilesFor(z); }
  const list = [];
  for (let ty = T.ty0; ty <= T.ty1; ty++) for (let tx = T.tx0; tx <= T.tx1; tx++) list.push([tx, ty]);
  const tiles = new Map();
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const load = (tx, ty) => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const to = setTimeout(() => { img.src = ''; res(false); }, 15000);
    img.onload = () => {
      clearTimeout(to);
      try { cx.clearRect(0, 0, 256, 256); cx.drawImage(img, 0, 0); tiles.set(tx + '_' + ty, cx.getImageData(0, 0, 256, 256).data); res(true); }
      catch (e) { res(false); }
    };
    img.onerror = () => { clearTimeout(to); res(false); };
    img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png?m=1`;
  });
  let done = 0;
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(([tx, ty]) => load(tx, ty).then(() => { done++; if (onProgress) onProgress(`Leggo la carta: ${done}/${list.length}`); })));
  }
  const missing = list.length - tiles.size;
  if (missing > list.length * 0.2) return { ok: false, missing, total: list.length };
  const water = new Uint8Array(g.cols * g.rows), q = g.cs / 4;
  const offs = [[0, 0], [-q, -q], [q, -q], [-q, q], [q, q]];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const x0 = g.minX + (c + 0.5) * g.cs, y0 = g.minY + (r + 0.5) * g.cs;
      let v = 0;
      for (const o of offs) {
        const gx = T.gx0 + (x0 + o[0]) * T.ppm, gy = T.gy0 - (y0 + o[1]) * T.ppm;
        const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), d = tiles.get(tx + '_' + ty);
        if (!d) continue;
        const off = ((Math.floor(gy) - ty * 256) * 256 + (Math.floor(gx) - tx * 256)) * 4;
        if (Math.abs(d[off] - 170) + Math.abs(d[off + 1] - 211) + Math.abs(d[off + 2] - 223) <= 24 && d[off + 3] > 200) v++;
      }
      water[r * g.cols + c] = v >= 3 ? 1 : 0;
    }
  }
  return { ok: true, water, missing, total: list.length, z };
}

/* ---- coda con priorità ---- */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/* ---- calcolo ----
   o.water: Uint8Array acqua(1)/terra(0) oppure null = si naviga solo sui canali noti
   o.channels: [{pts, limit, user}]   o.blocks: [{lat,lng,r}]   o.cruise: nodi */
function route(g, o) {
  const cols = g.cols, rows = g.rows, cs = g.cs, N = cols * rows, cruise = o.cruise || 5;
  const channelOnly = !o.water;
  const chan = new Uint8Array(N), lim = new Float32Array(N), blk = new Uint8Array(N);
  const water = o.water ? Uint8Array.from(o.water) : new Uint8Array(N);
  const cellAt = (x, y) => {
    const c = Math.floor((x - g.minX) / cs), r = Math.floor((y - g.minY) / cs);
    return (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : r * cols + c;
  };
  (o.channels || []).forEach(ch => {
    const xy = ch.pts.map(g.toXY);
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1], b = xy[i], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / (cs / 2)));
      for (let s = 0; s <= n; s++) {
        const idx = cellAt(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n);
        if (idx < 0) continue;
        water[idx] = 1; chan[idx] = Math.max(chan[idx], ch.user ? 2 : 1);
        if (ch.limit > 0) lim[idx] = lim[idx] > 0 ? Math.min(lim[idx], ch.limit) : ch.limit;
      }
    }
  });
  (o.blocks || []).forEach(b => {
    const p = g.toXY(b), c0 = Math.floor((p.x - g.minX) / cs), r0 = Math.floor((p.y - g.minY) / cs), rc = Math.ceil(b.r / cs) + 1;
    for (let dr = -rc; dr <= rc; dr++) for (let dc = -rc; dc <= rc; dc++) {
      const c = c0 + dc, r = r0 + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      if (Math.hypot(g.minX + (c + 0.5) * cs - p.x, g.minY + (r + 0.5) * cs - p.y) <= b.r) blk[r * cols + c] = 1;
    }
  });
  const pass = i => water[i] === 1 && !blk[i];

  const snap = (pt, maxR) => {
    const p = g.toXY(pt), c0 = Math.floor((p.x - g.minX) / cs), r0 = Math.floor((p.y - g.minY) / cs);
    for (let rad = 0; rad <= maxR; rad++) {
      let best = -1, bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const i = r * cols + c;
        if (!pass(i)) continue;
        const dd = dc * dc + dr * dr;
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best >= 0) return { idx: best, d: Math.sqrt(bd) * cs };
    }
    return null;
  };
  const maxR = Math.ceil((channelOnly ? 1500 : 800) / cs);
  const ss = snap(g.start, maxR), sd = snap(g.dest, maxR);
  if (!ss || !sd) return null;

  const cpm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!pass(i)) continue;
    const v = lim[i] > 0 ? Math.min(cruise, lim[i]) : cruise;
    let m = chan[i] === 2 ? 0.7 : chan[i] === 1 ? 1 : 2.5;
    if (!chan[i]) {
      const c = i % cols, r = (i / cols) | 0;
      if ((c > 0 && !water[i - 1]) || (c < cols - 1 && !water[i + 1]) || (r > 0 && !water[i - cols]) || (r < rows - 1 && !water[i + cols])) m *= 1.5;
    }
    cpm[i] = m / (v * MPS);
  }

  /* costo "morbido" per la semplificazione: una linea che costeggia un canale a una cella di distanza conta come canale */
  const cpmS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!pass(i)) continue;
    const c = i % cols, r = (i / cols) | 0;
    let m = cpm[i];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (pass(j) && chan[j] && cpm[j] < m) m = cpm[j];
    }
    cpmS[i] = m;
  }

  const s0 = ss.idx, goal = sd.idx;
  const gS = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const minC = 0.7 / (cruise * MPS), gc = goal % cols, gr = (goal / cols) | 0;
  const h = i => Math.hypot((i % cols) - gc, ((i / cols) | 0) - gr) * cs * minC;
  const heap = new Heap();
  gS[s0] = 0; heap.push(h(s0), s0);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false, pops = 0;
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goal) { found = true; break; }
    if (++pops > N * 3) break;
    const c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (closed[j] || !pass(j)) continue;
      if (dc && dr && !((pass(r * cols + nc) && pass(nr * cols + c)) || (chan[i] && chan[j]))) continue;
      const step = cs * (dc && dr ? 1.41421356 : 1), ng = gS[i] + 0.5 * (cpm[i] + cpm[j]) * step;
      if (ng < gS[j]) { gS[j] = ng; par[j] = i; heap.push(ng + h(j), j); }
    }
  }
  if (!found) return null;

  const cells = [];
  for (let i = goal; i !== -1; i = par[i]) cells.push(i);
  cells.reverse();
  const px = cells.map(i => g.minX + ((i % cols) + 0.5) * cs), py = cells.map(i => g.minY + (((i / cols) | 0) + 0.5) * cs);
  const cum = cells.map(i => gS[i]);

  const segOK = (a, b) => {
    const dx = px[b] - px[a], dy = py[b] - py[a], len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / (cs / 2)));
    let cost = 0;
    for (let s = 0; s <= n; s++) {
      const idx = cellAt(px[a] + dx * s / n, py[a] + dy * s / n);
      if (idx < 0 || !pass(idx)) return false;
      if (s < n) cost += cpmS[idx] * (len / n);
    }
    return cost <= (cum[b] - cum[a]) * 1.12 + 1e-9;
  };
  const tol = cs * 1.0, last = cells.length - 1, keep = new Set([0, last]), stack = [[0, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = px[a], ay = py[a], dx = px[b] - ax, dy = py[b] - ay, L = Math.hypot(dx, dy) || 1;
    let md = -1, mk = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((px[k] - ax) * dy - (py[k] - ay) * dx) / L;
      if (d > md) { md = d; mk = k; }
    }
    if (md <= tol && segOK(a, b)) continue;
    const k = md <= tol ? (a + b) >> 1 : mk;
    keep.add(k); stack.push([a, k], [k, b]);
  }
  const idxs = [...keep].sort((a, b) => a - b);
  const startFar = ss.d > cs * 1.5, destFar = sd.d > cs * 1.5;
  const sel = idxs.filter(k => (k > 0 && k < last) || (k === 0 && startFar && last > 0) || (k === last && destFar));
  const via = [];
  let prev = g.start;
  sel.forEach(k => {
    const p = g.toLL(px[k], py[k]);
    if (dist(prev, p) > cs * 0.8) { via.push(p); prev = p; }
  });
  if (via.length && dist(via[via.length - 1], g.dest) <= cs * 0.8) via.pop();

  let chanCells = 0;
  cells.forEach(i => { if (chan[i]) chanCells++; });
  return { via, stats: { cs, cells: cells.length, chanShare: chanCells / cells.length, startSnap: ss.d, destSnap: sd.d, channelOnly } };
}

const Router = { plan, fetchOverpass, loadTileMask, route, prep, limitAt, legTime, parseLimit };
if (typeof module !== 'undefined' && module.exports) module.exports = Router;
else root.Router = Router;
})(typeof window !== 'undefined' ? window : globalThis);
