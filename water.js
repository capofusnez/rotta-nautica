'use strict';
/* Rotta automatica via acqua.
   L'acqua viene riconosciuta dal colore della carta OpenStreetMap (#aad3df): mare, laguna, fiumi e canali.
   Sulla griglia di pixel si cerca il percorso più breve che resta in acqua (A*), con una penalità
   vicino a riva per tenersi al centro dei canali e a distanza dalla costa.
   NB: la carta non conosce le profondità. La rotta va sempre verificata. */
(function (root) {
  const TILE = 256, RAD = Math.PI / 180, DEG = 180 / Math.PI, SQ2 = Math.SQRT2;
  const CFG = { maxTiles: 90, closeR: 2, clear: 8, clearK: 3, snapR: 300 };

  const lon2px = (lng, z) => (lng + 180) / 360 * TILE * 2 ** z;
  const lat2px = (lat, z) => { const s = Math.sin(lat * RAD); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };
  const px2lon = (x, z) => x / (TILE * 2 ** z) * 360 - 180;
  const px2lat = (y, z) => DEG * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * y / (TILE * 2 ** z)));

  /* Riquadro di tiles attorno ai punti, al livello di zoom più dettagliato che sta nel limite. */
  function tileBox(pts) {
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    pts.forEach(p => { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lng); lo1 = Math.max(lo1, p.lng); });
    const pLat = Math.max((la1 - la0) * 0.4, 0.02), pLng = Math.max((lo1 - lo0) * 0.4, 0.03);
    la0 -= pLat; la1 += pLat; lo0 -= pLng; lo1 += pLng;
    for (let z = 15; z >= 13; z--) {
      const tx0 = Math.floor(lon2px(lo0, z) / TILE), tx1 = Math.floor(lon2px(lo1, z) / TILE);
      const ty0 = Math.floor(lat2px(la1, z) / TILE), ty1 = Math.floor(lat2px(la0, z) / TILE);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= CFG.maxTiles) return { z, tx0, tx1, ty0, ty1 };
    }
    return null;
  }

  /* RGBA -> maschera acqua (1 = acqua). Riconosce l'azzurro dell'acqua (#aad3df) anche sui bordi
     sfumati dei fiumi e dei canali stretti, e le scritte blu disegnate sull'acqua. */
  function waterMask(rgba, n) {
    const w = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      w[i] = b - r >= 18 && g - r >= 10 && b >= 150 && rgba[j + 3] > 0 ? 1 : 0;
    }
    return w;
  }
  /* Disegna sulla maschera le linee dei corsi d'acqua (fiumi, canali), larghe 3 pixel:
     così restano continue anche sotto i ponti e dove la carta non le disegna. */
  function drawLines(w, W, H, box, lines) {
    const z = box.z, ox = box.tx0 * TILE, oy = box.ty0 * TILE;
    const dot = (x, y) => {
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++)
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) w[yy * W + xx] = 1;
    };
    lines.forEach(line => {
      for (let k = 1; k < line.length; k++) {
        let x0 = Math.floor(lon2px(line[k - 1].lng, z) - ox), y0 = Math.floor(lat2px(line[k - 1].lat, z) - oy);
        const x1 = Math.floor(lon2px(line[k].lng, z) - ox), y1 = Math.floor(lat2px(line[k].lat, z) - oy);
        if ((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 >= W && x1 >= W) || (y0 >= H && y1 >= H)) continue;
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 20000; guard++) {
          dot(x0, y0);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }
    });
  }
  /* Limiti geografici del riquadro di tiles (per scaricare i corsi d'acqua della stessa zona). */
  const boxBounds = box => ({
    s: px2lat((box.ty1 + 1) * TILE, box.z), n: px2lat(box.ty0 * TILE, box.z),
    w: px2lon(box.tx0 * TILE, box.z), e: px2lon((box.tx1 + 1) * TILE, box.z)
  });
  const gridBounds = g => [[px2lat(g.oy + g.H, g.z), px2lon(g.ox, g.z)], [px2lat(g.oy, g.z), px2lon(g.ox + g.W, g.z)]];

  /* Dilatazione / erosione binaria con finestra quadrata, separabile. */
  function pass(src, out, W, H, r, dil, horiz) {
    const L = horiz ? W : H, N = horiz ? H : W, oob = dil ? 0 : 1, full = 2 * r + 1;
    for (let n = 0; n < N; n++) {
      const base = horiz ? n * W : n, step = horiz ? 1 : W;
      let c = oob * r;
      for (let i = 0; i <= r; i++) c += i < L ? src[base + i * step] : oob;
      for (let i = 0; i < L; i++) {
        out[base + i * step] = dil ? (c > 0 ? 1 : 0) : (c === full ? 1 : 0);
        const add = i + r + 1, rem = i - r;
        c += add < L ? src[base + add * step] : oob;
        c -= rem >= 0 ? src[base + rem * step] : oob;
      }
    }
  }
  function morph(src, W, H, r, dil) {
    const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
    pass(src, t, W, H, r, dil, true); pass(t, o, W, H, r, dil, false);
    return o;
  }
  /* Chiusura: riempie interruzioni sottili dell'acqua (ponti, scritte sulla carta). */
  const close = (w, W, H, r) => r > 0 ? morph(morph(w, W, H, r, true), W, H, r, false) : w;

  /* Distanza da terra in pixel (scacchiera), 0 = terra, max 255. */
  function landDist(w, W, H) {
    const d = new Uint8Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = w[i] ? 255 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 1);
      if (y > 0) {
        m = Math.min(m, d[i - W] + 1);
        if (x > 0) m = Math.min(m, d[i - W - 1] + 1);
        if (x < W - 1) m = Math.min(m, d[i - W + 1] + 1);
      }
      d[i] = m;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      let m = d[i];
      if (x < W - 1) m = Math.min(m, d[i + 1] + 1);
      if (y < H - 1) {
        m = Math.min(m, d[i + W] + 1);
        if (x < W - 1) m = Math.min(m, d[i + W + 1] + 1);
        if (x > 0) m = Math.min(m, d[i + W - 1] + 1);
      }
      d[i] = m;
    }
    return d;
  }

  function makeGrid(rgba, W, H, box, lines) {
    const m = waterMask(rgba, W * H);
    if (box && lines && lines.length) drawLines(m, W, H, box, lines);
    const w = close(m, W, H, CFG.closeR);
    return { z: box ? box.z : 0, ox: box ? box.tx0 * TILE : 0, oy: box ? box.ty0 * TILE : 0, W, H, d: landDist(w, W, H) };
  }

  const toCell = (g, p) => [Math.floor(lon2px(p.lng, g.z) - g.ox), Math.floor(lat2px(p.lat, g.z) - g.oy)];
  const cellLL = (g, i) => {
    const x = i % g.W, y = (i / g.W) | 0;
    return { lat: +px2lat(g.oy + y + 0.5, g.z).toFixed(6), lng: +px2lon(g.ox + x + 0.5, g.z).toFixed(6) };
  };

  /* Cella d'acqua più vicina a (x, y), preferendo un minimo di distanza da riva. */
  function snapXY(g, x0, y0) {
    const { W, H, d } = g;
    for (const need of [2, 1]) {
      let best = -1, bd = Infinity;
      for (let r = 0; r <= CFG.snapR; r++) {
        for (let y = y0 - r; y <= y0 + r; y++) {
          if (y < 0 || y >= H) continue;
          const edge = y === y0 - r || y === y0 + r;
          for (let x = x0 - r; x <= x0 + r; x += edge ? 1 : 2 * r || 1) {
            if (x < 0 || x >= W) continue;
            const i = y * W + x;
            if (d[i] >= need) { const dd = (x - x0) ** 2 + (y - y0) ** 2; if (dd < bd) { bd = dd; best = i; } }
          }
        }
        if (best >= 0 && Math.sqrt(bd) <= r) return best;
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  const snap = (g, p) => { const [x, y] = toCell(g, p); return snapXY(g, x, y); };

  /* A* su 8 direzioni, senza tagliare gli angoli di terra. */
  function astar(g, s, t) {
    const { W, H, d } = g, N = W * H;
    const gs = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const tx = t % W, ty = (t / W) | 0;
    const hi = [], hv = [];
    const h = i => { const dx = (i % W) - tx, dy = ((i / W) | 0) - ty; return Math.sqrt(dx * dx + dy * dy); };
    const push = (i, v) => {
      let n = hi.length; hi.push(i); hv.push(v);
      while (n) { const p = (n - 1) >> 1; if (hv[p] <= v) break; hi[n] = hi[p]; hv[n] = hv[p]; n = p; }
      hi[n] = i; hv[n] = v;
    };
    const pop = () => {
      const top = hi[0], li = hi.pop(), lv = hv.pop(), L = hi.length;
      if (L) {
        let n = 0;
        for (;;) {
          let c = 2 * n + 1; if (c >= L) break;
          if (c + 1 < L && hv[c + 1] < hv[c]) c++;
          if (hv[c] >= lv) break;
          hi[n] = hi[c]; hv[n] = hv[c]; n = c;
        }
        hi[n] = li; hv[n] = lv;
      }
      return top;
    };
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    const C = CFG.clear, K = CFG.clearK;
    gs[s] = 0; push(s, h(s));
    let found = s === t;
    while (hi.length && !found) {
      const i = pop();
      if (closed[i]) continue;
      if (i === t) { found = true; break; }
      closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!d[j] || closed[j]) continue;
        if (k > 3 && (!d[y * W + nx] || !d[ny * W + x])) continue;
        const m = Math.min(d[i], d[j]);
        const ng = gs[i] + (k > 3 ? SQ2 : 1) * (1 + K * Math.max(0, C - m) / C);
        if (ng < gs[j]) { gs[j] = ng; par[j] = i; push(j, ng + h(j)); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let i = t; i !== -1; i = par[i]) { path.push(i); if (i === s) break; }
    return path.reverse();
  }

  /* Linea di vista: tutte le celle tra a e b hanno distanza da riva >= minD. */
  function los(g, a, b, minD) {
    const { W, d } = g;
    let x0 = a % W, y0 = (a / W) | 0;
    const x1 = b % W, y1 = (b / W) | 0, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (d[y0 * W + x0] < minD) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /* Riduce il percorso a poche tappe, senza avvicinarsi a riva più del percorso originale. */
  function simplify(g, path) {
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let best = i + 1, md = g.d[path[i]], fails = 0;
      for (let j = i + 1; j < path.length; j++) {
        md = Math.min(md, g.d[path[j]]);
        if (los(g, path[i], path[j], Math.min(md, 3))) { best = j; fails = 0; }
        else if (++fails > 150) break;
      }
      out.push(path[best]); i = best;
    }
    return out;
  }

  root.Water = { CFG, TILE, tileBox, boxBounds, gridBounds, makeGrid, snap, snapXY, astar, simplify, cellLL, landDist, close, waterMask };
})(typeof window !== 'undefined' ? window : globalThis);
