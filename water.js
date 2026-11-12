'use strict';
/* Rotta automatica via acqua.
   L'acqua viene riconosciuta dal colore della carta OpenStreetMap (#aad3df): mare, laguna, fiumi e canali.
   Sulla griglia di pixel si cerca il percorso più breve che resta in acqua (A*), con una penalità
   vicino a riva per tenersi al centro dei canali e a distanza dalla costa.
   NB: la carta non conosce le profondità. La rotta va sempre verificata. */
(function (root) {
  const TILE = 256, RAD = Math.PI / 180, DEG = 180 / Math.PI, SQ2 = Math.SQRT2;
  /* bridgeM: tratto massimo di "terra" (ponte) che un corso d'acqua non dichiarato navigabile può scavalcare
     minW:    larghezza minima (m) dell'acqua libera fuori da canali segnalati e corsi navigabili (via fossi e scoli)
     sideK:   penalità per chi naviga sulla metà sinistra di un canale (COLREG regola 9: tenere la dritta) */
  const CFG = { maxTiles: 90, closeR: 0, clear: 8, clearM: 120, clearK: 3, snapR: 300, coastM: 300, coastK: 25, bridgeM: 60, minW: 8, sideK: 2 };

  const lon2px = (lng, z) => (lng + 180) / 360 * TILE * 2 ** z;
  const lat2px = (lat, z) => { const s = Math.sin(lat * RAD); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };
  const px2lon = (x, z) => x / (TILE * 2 ** z) * 360 - 180;
  const px2lat = (y, z) => DEG * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * y / (TILE * 2 ** z)));

  /* Riquadro di tiles attorno ai punti, al livello di zoom più dettagliato che sta nel limite. */
  function tileBox(pts, zmax, zmin) {
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    pts.forEach(p => { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lng); lo1 = Math.max(lo1, p.lng); });
    const pLat = Math.max((la1 - la0) * 0.3, 0.012), pLng = Math.max((lo1 - lo0) * 0.3, 0.018);
    la0 -= pLat; la1 += pLat; lo0 -= pLng; lo1 += pLng;
    for (let z = zmax || 16; z >= (zmin || 13); z--) {
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
      /* acqua azzurra, oppure acqua sotto un confine amministrativo (linea viola semitrasparente, es. tra due comuni
         attraverso una bocca di porto): blu prevalente su rosso e verde. Sulla terra il confine resta più rosso che blu. */
      w[i] = rgba[j + 3] > 0 && b >= 150 && ((b - r >= 18 && g - r >= 10) || (b > r + 6 && b > g + 12 && r <= 175 && g <= 185)) ? 1 : 0;
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
  /* Apertura: toglie le strisce d'acqua più strette di 2r+1 pixel (fossi, scoli), lascia intatto il resto. */
  const opening = (w, W, H, r) => r > 0 ? morph(morph(w, W, H, r, false), W, H, r, true) : w;

  /* Pezzi di corso d'acqua (non dichiarato navigabile) disegnati sopra la terra della carta: si accettano solo quelli
     brevi, cioè i ponti; un canale di bonifica che attraversa i campi resta terra. */
  function bridges(L2, water, W, H, mpp) {
    const out = new Uint8Array(W * H), seen = new Uint8Array(W * H), q = new Int32Array(W * H);
    const stroke = Math.max(3, 30 / mpp), maxPx = (CFG.bridgeM / mpp + stroke) * stroke;
    for (let s = 0; s < L2.length; s++) {
      if (!L2[s] || water[s] || seen[s]) continue;
      let h = 0, n = 0; q[n++] = s; seen[s] = 1;
      while (h < n) {
        const i = q[h++], x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (L2[j] && !water[j] && !seen[j]) { seen[j] = 1; q[n++] = j; }
        }
      }
      if (n <= maxPx) for (let k = 0; k < n; k++) out[q[k]] = 1;
    }
    return out;
  }

  /* Regola 9 COLREG: muovendosi di (mx, my) lungo un canale, la cella è fuori dalla corsia di dritta?
     (vedi Channels.paintSide). Chi attraversa il canale di traverso non viene penalizzato. */
  const wrongSide = (g, j, mx, my) => {
    if (!g.sx) return false;
    const a = g.sx[j], b = g.sy[j];
    if (!a && !b) return false;
    const d = mx * a + my * b;
    if (Math.abs(d) < 0.5 * Math.hypot(mx, my) * 100) return false;
    return d > 0 ? g.sp[j] < 0 : g.sn[j] > 0;
  };

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

  /* Griglia navigabile. Maschere in extra (1 = presente):
     restrict: laguna, barene, velme, secche mappate -> si naviga solo nei canali
     zone:     area attorno a briccole e segnali di canale -> si naviga solo sull'asse del canale
     axis:     asse del canale tra i segnali (valido sull'acqua e sulle zone lagunari, mai sulla terra)
     ext:      prolungamento dell'asse verso le acque libere (solo su acqua libera)
     lines:    corsi d'acqua dichiarati navigabili (fairway, boat/motorboat=yes...): restano navigabili anche sotto i ponti
     lines2:   altri corsi d'acqua (canali di bonifica, scoli, fiumi senza indicazioni): solo dove la carta mostra acqua,
               più i ponti brevi (bridgeM); non aprono varchi nelle file di briccole e non valgono in laguna
     barrier:  file di segnali dello stesso lato, non attraversabili
     nogo:     pali, pericoli isolati, scogli, relitti
     sx, sy, sp, sn: corsia di dritta nei canali (regola 9), vedi Channels.paintSide */
  function makeGrid(rgba, W, H, box, extra) {
    const m = waterMask(rgba, W * H), X = extra || {};
    const R = X.restrict, Z = X.zone, A = X.axis, E = X.ext, Ln = X.lines, B = X.barrier, N = X.nogo, SH = X.shallow, F = X.far;
    const mpp0 = box ? 156543.03392 * Math.cos(px2lat(box.ty0 * TILE + H / 2, box.z) * RAD) / 2 ** box.z : 10;
    /* corsi d'acqua non dichiarati navigabili: valgono solo i pezzi brevi sopra la "terra" della carta (ponti) */
    const BR = X.lines2 ? bridges(X.lines2, m, W, H, mpp0) : null;
    /* acqua libera troppo stretta (fossi, scoli, canali di bonifica disegnati come linee sottili): non navigabile */
    const minW = X.minW != null ? X.minW : CFG.minW;
    const wide = minW > 0 ? opening(m, W, H, Math.round(minW / 2 / mpp0)) : m;
    /* oltre il limite di distanza dalla costa (patente o mezzo): mai navigabile, nemmeno nei canali */
    if (F) for (let i = 0; i < m.length; i++) if (F[i]) m[i] = 0;
    /* ENC (S-57): dove c'è copertura decidono solo le carte ufficiali (profondità >= pescaggio + margine,
       niente terra, opere od ostacoli). Fuori copertura vale il metodo con OpenStreetMap/OpenSeaMap. */
    const EN = X.enc, EC = EN && EN.cov;
    let raw = m;
    if (EC) { raw = new Uint8Array(m); for (let i = 0; i < raw.length; i++) if (EC[i]) raw[i] = EN.wet[i]; }
    const coastPx = landDist(raw, W, H);   // distanza dalla riva vera, in pixel
    for (let i = 0; i < m.length; i++) {
      if (F && F[i]) { m[i] = 0; continue; }
      if (EC && EC[i]) { m[i] = EN.ok[i] ? 1 : 0; continue; }
      const water = m[i], r = R && R[i];
      /* fondale EMODnet troppo basso: vietato fuori dai canali segnalati e dai corsi d'acqua navigabili */
      if (SH && SH[i] && !((A && A[i]) || (E && E[i]) || (Ln && Ln[i]))) { m[i] = 0; continue; }
      const z = Z && Z[i];
      let ok = (wide[i] && !r && !z) || (BR && BR[i] && !r && !z) || (Ln && Ln[i]) || (A && A[i] && (water || r)) || (E && E[i] && water && !r);
      /* una fila di briccole è invalicabile, salvo dove la attraversa un canale mappato (lì c'è il varco); i pali restano ostacoli */
      if ((B && B[i] && !(Ln && Ln[i])) || (N && N[i])) ok = false;
      m[i] = ok ? 1 : 0;
    }
    const w = close(m, W, H, CFG.closeR);
    const g = { z: box ? box.z : 0, ox: box ? box.tx0 * TILE : 0, oy: box ? box.ty0 * TILE : 0, W, H, d: landDist(w, W, H) };
    g.mpp = box ? 156543.03392 * Math.cos(px2lat(g.oy + H / 2, g.z) * RAD) / 2 ** g.z : 10;
    g.clear = Math.max(3, Math.min(30, Math.round(CFG.clearM / g.mpp)));
    /* fascia di rispetto dalla costa: navigabile solo per entrare o uscire, salvo canali segnalati e corsi d'acqua */
    const coastM = X.coastM != null ? X.coastM : CFG.coastM, lim = coastM / g.mpp;
    g.buf = new Uint8Array(W * H);
    if (coastM > 0) for (let i = 0; i < g.buf.length; i++)
      if (g.d[i] && coastPx[i] < lim && !((A && A[i]) || (E && E[i]) || (Ln && Ln[i]) || (EN && EN.pref && EN.pref[i]))) g.buf[i] = 1;
    g.coastM = coastM;
    g.sx = X.sx || null; g.sy = X.sy || null; g.sp = X.sp || null; g.sn = X.sn || null;   // dritta dei canali (regola 9)
    g.lane = X.lane || null;   // corsie degli schemi di separazione del traffico: si attraversano, non si percorrono
    g.pref = EN && EN.pref ? EN.pref : null;   // rotte raccomandate e allineamenti ENC: percorso preferito
    return g;
  }
  /* Indice della cella sotto un punto, -1 se fuori dalla griglia. */
  function cellOf(g, p) {
    const [x, y] = toCell(g, p);
    return x < 0 || y < 0 || x >= g.W || y >= g.H ? -1 : y * g.W + x;
  }
  /* Verifica finale: ogni segmento della polilinea deve restare interamente in acqua navigabile. */
  function verify(g, cells) {
    for (let k = 1; k < cells.length; k++) if (!los(g, cells[k - 1], cells[k], 1)) return k;
    return 0;
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
    const C = g.clear || CFG.clear, K = CFG.clearK;
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
        const ng = gs[i] + (k > 3 ? SQ2 : 1) * (1 + K * Math.max(0, C - m) / C) * (g.buf && g.buf[j] ? CFG.coastK : 1) * (g.pref && !g.pref[j] ? 1.5 : 1) * (g.lane && g.lane[j] ? 8 : 1) * (wrongSide(g, j, DX[k], DY[k]) ? 1 + CFG.sideK : 1);
        if (ng < gs[j]) { gs[j] = ng; par[j] = i; push(j, ng + h(j)); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let i = t; i !== -1; i = par[i]) { path.push(i); if (i === s) break; }
    return path.reverse();
  }

  /* Linea di vista: tutte le celle tra a e b hanno distanza da riva >= minD. */
  function los(g, a, b, minD) { return losCount(g, a, b, minD) >= 0; }
  /* come los, ma restituisce quante celle della fascia costiera attraversa (-1 se il segmento è bloccato) */
  function losCount(g, a, b, minD) {
    const { W, d } = g, buf = g.buf;
    let nb = 0;
    let x0 = a % W, y0 = (a / W) | 0;
    const x1 = b % W, y1 = (b / W) | 0, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, vx = x1 - x0, vy = y1 - y0;
    let err = dx + dy;
    for (;;) {
      if (d[y0 * W + x0] < minD) return -1;
      if ((buf && buf[y0 * W + x0]) || (g.lane && g.lane[y0 * W + x0]) || wrongSide(g, y0 * W + x0, vx, vy)) nb++;
      if (x0 === x1 && y0 === y1) return nb;
      const e2 = 2 * err, mx = e2 >= dy, my = e2 <= dx;
      /* passo in diagonale: controlla anche le due celle d'angolo, per non scavalcare strisce di terra sottili */
      if (mx && my && (d[y0 * W + x0 + sx] < minD || d[(y0 + sy) * W + x0] < minD)) return -1;
      if (mx) { err += dy; x0 += sx; }
      if (my) { err += dx; y0 += sy; }
    }
  }
  /* Riduce il percorso a poche tappe, senza avvicinarsi a riva più del percorso originale. */
  function simplify(g, path) {
    const out = [path[0]];
    /* celle della fascia costiera lungo il percorso: una scorciatoia non può attraversarne più del percorso originale */
    const pb = new Int32Array(path.length + 1);
    /* (e celle sul lato sbagliato di un canale, nel verso del moto) */
    for (let k = 0; k < path.length; k++) {
      const c = path[k], p = path[k ? k - 1 : Math.min(1, path.length - 1)], mv = k ? 1 : -1;
      const wr = wrongSide(g, c, mv * ((c % g.W) - (p % g.W)), mv * (((c / g.W) | 0) - ((p / g.W) | 0)));
      pb[k + 1] = pb[k] + ((g.buf && g.buf[c]) || (g.lane && g.lane[c]) || wr ? 1 : 0);
    }
    let i = 0;
    while (i < path.length - 1) {
      let best = i + 1, md = g.d[path[i]], fails = 0;
      for (let j = i + 1; j < path.length; j++) {
        md = Math.min(md, g.d[path[j]]);
        /* il tratto dritto deve restare lontano dagli ostacoli quanto il percorso originale (fino a ~120 m) */
        const nb = losCount(g, path[i], path[j], Math.min(md, g.clear || 3));
        if (nb >= 0 && nb <= pb[j + 1] - pb[i] + 1) { best = j; fails = 0; }
        else if (++fails > 150) break;
      }
      out.push(path[best]); i = best;
    }
    return out;
  }

  /* Calcolo completo di un tratto: griglia, aggancio di partenza e arrivo all'acqua, A*, semplificazione, verifica.
     Usato dal Web Worker (e dalla pagina se il Worker non è disponibile). */
  function solve(m) {
    const g = makeGrid(m.rgba, m.W, m.H, m.box, m.extra);
    const ends = [m.a, m.b].map(p => {
      const own = cellOf(g, p);
      if (own >= 0 && g.d[own]) return { i: own, moved: false };
      return { i: snap(g, p), moved: true };
    });
    const res = { id: m.id, z: g.z, ox: g.ox, oy: g.oy, W: g.W, H: g.H, mpp: g.mpp, ends, d: g.d, buf: g.buf };
    if (ends[0].i >= 0 && ends[1].i >= 0) {
      const path = astar(g, ends[0].i, ends[1].i);
      if (path) { res.cells = simplify(g, path); res.bad = verify(g, res.cells); return res; }
      res.gap = findGap(g, ends[0].i, ends[1].i);
    }
    /* ACQUA PROFONDA EMODnet: se nei dati mancano pezzi di canale (es. tra San Marco e Lido), in laguna si accettano
       anche le celle dove EMODnet indica fondale ben sopra il pescaggio. Terra, barene, file di briccole e pali restano vietati. */
    if (m.extra && m.extra.deep && m.extra.restrict) {
      const DP = m.extra.deep, R0 = m.extra.restrict, HD = m.extra.hard, W = m.W;
      const R2 = new Uint8Array(R0);
      for (let i = 0; i < R2.length; i++) if (R2[i] && DP[i] && !(HD && HD[i])) R2[i] = 0;
      const g3 = makeGrid(m.rgba, m.W, m.H, m.box, Object.assign({}, m.extra, { restrict: R2 }));
      const e3 = [m.a, m.b].map(p => { const own = cellOf(g3, p); return own >= 0 && g3.d[own] ? { i: own, moved: false } : { i: snap(g3, p), moved: true }; });
      if (e3[0].i >= 0 && e3[1].i >= 0) {
        const path3 = astar(g3, e3[0].i, e3[1].i);
        if (path3) {
          let dm = 0;
          path3.forEach((i, k) => { if (k && !g.d[i]) { const a = path3[k - 1]; dm += Math.hypot(i % W - a % W, ((i / W) | 0) - ((a / W) | 0)); } });
          const r3 = { id: m.id, z: g3.z, ox: g3.ox, oy: g3.oy, W: g3.W, H: g3.H, mpp: g3.mpp, ends: e3, d: g3.d, buf: g3.buf };
          r3.cells = simplify(g3, path3); r3.bad = verify(g3, r3.cells);
          r3.deepM = Math.round(dm * g3.mpp);
          return r3;
        }
      }
    }
    /* ULTIMO TRATTO FUORI CANALE: se rispettando i canali non si arriva, si riprova permettendo di lasciare canali e
       zone lagunari solo entro relaxM metri da partenza e arrivo (es. l'approdo di un locale fuori dalle briccole).
       Terra, pali e file di briccole restano invalicabili. Il tratto fuori canale viene misurato e segnalato. */
    if (m.relaxM > 0) {
      const W = m.W, H = m.H, rPx = m.relaxM / g.mpp, r2 = rPx * rPx;
      const P = [cellOfXY(g, m.a), cellOfXY(g, m.b)];
      const X2 = Object.assign({}, m.extra);
      ['restrict', 'zone', 'shallow'].forEach(k => {
        if (!X2[k]) return;
        const c = new Uint8Array(X2[k]);
        P.forEach(([px, py]) => {
          for (let y = Math.max(0, Math.floor(py - rPx)); y <= Math.min(H - 1, Math.ceil(py + rPx)); y++)
            for (let x = Math.max(0, Math.floor(px - rPx)); x <= Math.min(W - 1, Math.ceil(px + rPx)); x++)
              if ((x - px) ** 2 + (y - py) ** 2 <= r2 && !(m.extra.hard && m.extra.hard[y * W + x])) c[y * W + x] = 0;
        });
        X2[k] = c;
      });
      const g2 = makeGrid(m.rgba, W, H, m.box, X2);
      const e2 = [m.a, m.b].map(p => { const own = cellOf(g2, p); return own >= 0 && g2.d[own] ? { i: own, moved: false } : { i: snap(g2, p), moved: true }; });
      if (e2[0].i >= 0 && e2[1].i >= 0) {
        const path2 = astar(g2, e2[0].i, e2[1].i);
        if (path2) {
          let off = 0;
          path2.forEach((i, k) => { if (!g.d[i] && k) { const a = path2[k - 1]; off += Math.hypot(i % W - a % W, ((i / W) | 0) - ((a / W) | 0)); } });
          const r2res = { id: m.id, z: g2.z, ox: g2.ox, oy: g2.oy, W: g2.W, H: g2.H, mpp: g2.mpp, ends: e2, d: g2.d, buf: g2.buf };
          r2res.cells = simplify(g2, path2); r2res.bad = verify(g2, r2res.cells);
          r2res.offChannelM = Math.round(off * g2.mpp);
          return r2res;
        }
      }
    }
    return res;
  }
  const cellOfXY = (g, p) => toCell(g, p);
  /* Quando non c'è passaggio: trova i due punti più vicini tra l'acqua raggiungibile dalla partenza
     e quella raggiungibile dall'arrivo. È lì che la rotta si interrompe (canale non collegato, briccole mancanti...). */
  function findGap(g, s, t) {
    const { W, H, d } = g, N = W * H, DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    const reach = (start, mark, val) => {
      const q = new Int32Array(N); let h = 0, n = 0; q[n++] = start; mark[start] = val;
      while (h < n) {
        const i = q[h++], x = i % W, y = (i / W) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mark[j] || !d[j]) continue;
          if (k > 3 && (!d[y * W + nx] || !d[ny * W + x])) continue;
          mark[j] = val; q[n++] = j;
        }
      }
    };
    const mark = new Uint8Array(N);
    reach(s, mark, 1); reach(t, mark, 2);
    /* espansione da tutta l'acqua della partenza, attraverso qualsiasi cella, finché si tocca l'acqua dell'arrivo */
    const src = new Int32Array(N).fill(-1), q = new Int32Array(N); let h = 0, n = 0;
    for (let i = 0; i < N; i++) if (mark[i] === 1) { src[i] = i; q[n++] = i; }
    while (h < n) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (src[j] >= 0) continue;
        src[j] = src[i];
        if (mark[j] === 2) return { a: src[j], b: j };
        q[n++] = j;
      }
    }
    return null;
  }

  /* ================= ROTTA A LARGA SCALA (navigazione costiera) =================
     Griglia geografica (lat/lng) costruita dalle profondità EMODnet: mare dove c'è il dato di profondità,
     terra altrove. Serve per: distanza vera dalla costa (limiti di patente e del mezzo), rotte lunghe divise
     in tratti, tratti in mare aperto senza scaricare la carta dettagliata. */

  /* Trasformata della distanza euclidea esatta (Felzenszwalb), con passo diverso in x e in y (metri).
     Restituisce, per ogni cella, la distanza in metri dalla cella di terra più vicina. */
  function edt(sea, W, H, dx, dy) {
    const BIG = 1e20, f = new Float64Array(W * H);
    for (let i = 0; i < f.length; i++) f[i] = sea[i] ? BIG : 0;
    const n = Math.max(W, H), g = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    /* inviluppo inferiore delle parabole, posizioni q*s */
    const line = (len, s) => {
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      const cross = (q, p) => ((g[q] + (s * q) ** 2) - (g[p] + (s * p) ** 2)) / (2 * s * (q - p));
      for (let q = 1; q < len; q++) {
        let x = cross(q, v[k]);
        while (x <= z[k]) { k--; x = cross(q, v[k]); }
        k++; v[k] = q; z[k] = x; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < s * q) k++; const p = v[k]; d[q] = (s * (q - p)) ** 2 + g[p]; }
    };
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) g[y] = f[y * W + x];
      line(H, dy);
      for (let y = 0; y < H; y++) f[y * W + x] = Math.min(d[y], BIG);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) g[x] = f[y * W + x];
      line(W, dx);
      for (let x = 0; x < W; x++) f[y * W + x] = d[x];
    }
    const out = new Float32Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = f[i] >= BIG / 2 ? 1e9 : Math.sqrt(f[i]);
    return out;
  }

  /* Rotta sulla griglia geografica.
     m: { W, H, dx, dy (metri per cella), sea, shallow, nogo (Uint8Array), pts: [indice cella] (partenza, tappe, arrivo),
          limitM (distanza massima dalla costa, Infinity = nessuna), prefM (distanza preferita), coastM (fascia di rispetto),
          openM (da qui in poi è mare aperto), snapM }
     Restituisce cd (distanza dalla costa in metri) e, per ogni tratto dell'utente, i pezzi del percorso:
     { open: true, cells } in mare aperto (già semplificati), { open: false, cells } vicino a costa, porti e canali. */
  function coarseSolve(m) {
    const { W, H, dx, dy, sea, shallow, nogo, lagoon, lane, attn } = m, N = W * H;
    const cd = edt(sea, W, H, dx, dy);
    const limit = m.limitM > 0 && isFinite(m.limitM) ? m.limitM : Infinity;
    const pref = Math.min(m.prefM || 0, limit * 0.8), coastM = m.coastM || 0;
    /* pericoli e piattaforme valgono qui solo in mare aperto: vicino a costa e nelle bocche di porto (dove una maglia
       di 115-230 m chiuderebbe il passaggio) li considera la carta dettagliata, molto più precisa */
    const openNoGo = m.openM || 1000;
    const pass = i => sea[i] && !(nogo && nogo[i] && cd[i] >= openNoGo) && cd[i] <= limit;
    const res = { id: m.id, cd, legs: [], ends: [] };
    /* aggancio dei punti dell'utente al mare navigabile più vicino (entro snapM) */
    const snapR = Math.ceil((m.snapM || 5000) / Math.min(dx, dy));
    const ends = m.pts.map(i0 => {
      if (i0 < 0) return { i: -1, why: 'fuori' };
      if (pass(i0)) return { i: i0, moved: false };
      const x0 = i0 % W, y0 = (i0 / W) | 0;
      let best = -1, bd = Infinity, beyond = false;
      for (let y = Math.max(0, y0 - snapR); y <= Math.min(H - 1, y0 + snapR); y++)
        for (let x = Math.max(0, x0 - snapR); x <= Math.min(W - 1, x0 + snapR); x++) {
          const j = y * W + x, dd = ((x - x0) * dx) ** 2 + ((y - y0) * dy) ** 2;
          if (dd >= bd) continue;
          if (pass(j)) { bd = dd; best = j; } else if (sea[j] && cd[j] > limit) beyond = true;
        }
      if (best < 0) return { i: -1, why: sea[i0] && cd[i0] > limit ? 'oltre' : beyond ? 'oltre' : 'terra' };
      return { i: best, moved: true, d: Math.sqrt(bd) };
    });
    res.ends = ends.map((e, k) => Object.assign({ cd: e.i >= 0 ? cd[e.i] : (m.pts[k] >= 0 ? cd[m.pts[k]] : -1) }, e));
    if (ends.some(e => e.i < 0)) return res;

    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], DG = Math.hypot(dx, dy);
    const STEP = [dx, dx, dy, dy, DG, DG, DG, DG];
    const costAt = j => {
      let f = 1;
      if (pref > 0 && cd[j] < pref) f += 2 * (pref - cd[j]) / pref;   // si tiene alla distanza preferita dalla costa
      if (coastM > 0 && cd[j] < coastM) f *= 5;                        // fascia di rispetto (quella vera la applica la carta dettagliata)
      if (shallow && shallow[j] && !(lagoon && lagoon[j])) f *= 20;      // fondali bassi (in laguna decidono canali e briccole)
      if (lane && lane[j]) f *= 8;                                     // corsie di traffico: attraversarle, non seguirle
      if (lagoon && lagoon[j]) f *= 10;                                // laguna: solo per uscire dalla bocca più vicina
      return f;
    };
    const gs = new Float64Array(N), par = new Int32Array(N), closed = new Uint8Array(N);
    function astarC(s, t) {
      gs.fill(Infinity); par.fill(-1); closed.fill(0);
      const tx = t % W, ty = (t / W) | 0, hi = [], hv = [];
      const h = i => Math.hypot(((i % W) - tx) * dx, (((i / W) | 0) - ty) * dy);
      const push = (i, val) => {
        let n = hi.length; hi.push(i); hv.push(val);
        while (n) { const p = (n - 1) >> 1; if (hv[p] <= val) break; hi[n] = hi[p]; hv[n] = hv[p]; n = p; }
        hi[n] = i; hv[n] = val;
      };
      const pop = () => {
        const top = hi[0], li = hi.pop(), lv = hv.pop(), L = hi.length;
        if (L) {
          let n = 0;
          for (;;) { let c = 2 * n + 1; if (c >= L) break; if (c + 1 < L && hv[c + 1] < hv[c]) c++; if (hv[c] >= lv) break; hi[n] = hi[c]; hv[n] = hv[c]; n = c; }
          hi[n] = li; hv[n] = lv;
        }
        return top;
      };
      gs[s] = 0; push(s, h(s));
      while (hi.length) {
        const i = pop();
        if (closed[i]) continue;
        if (i === t) break;
        closed[i] = 1;
        const x = i % W, y = (i / W) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (closed[j] || !pass(j)) continue;
          if (k > 3 && (!pass(y * W + nx) || !pass(ny * W + x))) continue;
          const ng = gs[i] + STEP[k] * costAt(j);
          if (ng < gs[j]) { gs[j] = ng; par[j] = i; push(j, ng + h(j)); }
        }
      }
      if (!isFinite(gs[t])) return null;
      const path = [];
      for (let i = t; i !== -1; i = par[i]) { path.push(i); if (i === s) break; }
      return path.reverse();
    }
    /* linea dritta tra due celle: tutta navigabile, mai più vicina a costa di minCd, senza nuovi fondali bassi */
    function losC(a, b, minCd, maxSh) {
      let x0 = a % W, y0 = (a / W) | 0, sh = 0;
      const x1 = b % W, y1 = (b / W) | 0, ddx = Math.abs(x1 - x0), ddy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = ddx + ddy;
      for (;;) {
        const i = y0 * W + x0;
        if (!pass(i) || cd[i] < minCd) return false;
        if (((shallow && shallow[i]) || (lane && lane[i])) && ++sh > maxSh) return false;
        if (x0 === x1 && y0 === y1) return true;
        const e2 = 2 * err, mx = e2 >= ddy, my = e2 <= ddx;
        if (mx && my && (!pass(y0 * W + x0 + sx) || !pass((y0 + sy) * W + x0))) return false;
        if (mx) { err += ddy; x0 += sx; }
        if (my) { err += ddx; y0 += sy; }
      }
    }
    function simplifyC(path) {
      if (path.length < 3) return path.slice();
      const out = [path[0]];
      let i = 0;
      while (i < path.length - 1) {
        let best = i + 1, md = cd[path[i]], sh = 0, fails = 0;
        for (let j = i + 1; j < path.length && j - i < 3000; j++) {
          md = Math.min(md, cd[path[j]]);
          if ((shallow && shallow[path[j]]) || (lane && lane[path[j]])) sh++;
          const need = Math.min(md, pref > 0 ? pref : md) - Math.max(dx, dy);
          if (losC(path[i], path[j], need, sh)) { best = j; fails = 0; } else if (++fails > 200) break;
        }
        out.push(path[best]); i = best;
      }
      return out;
    }
    /* mare aperto = lontano da costa, lagune, bassi fondali e segnaletica: dove ci sono briccole, boe, canali o
       segnali (attn) il tratto si calcola sulla carta dettagliata, per non perderne nessuno */
    const openM = m.openM || 1000, isOpen = i => cd[i] >= openM && !(shallow && shallow[i]) && !(lagoon && lagoon[i]) && !(attn && attn[i]);
    const lenOf = (cells, a, b) => { let L = 0; for (let k = a + 1; k <= b; k++) L += Math.hypot(((cells[k] % W) - (cells[k - 1] % W)) * dx, ((((cells[k] / W) | 0) - ((cells[k - 1] / W) | 0))) * dy); return L; };
    for (let k = 1; k < ends.length; k++) {
      const path = astarC(ends[k - 1].i, ends[k].i);
      if (!path) { res.legs.push({ none: true }); continue; }
      /* pezzi di mare aperto e pezzi vicino a costa; i pezzi aperti troppo corti restano costieri */
      const runs = [];
      let a = 0;
      for (let q = 1; q <= path.length; q++) {
        if (q === path.length || isOpen(path[q]) !== isOpen(path[a])) { runs.push({ open: isOpen(path[a]), a, b: q - 1 }); a = q; }
      }
      runs.forEach(r => { if (r.open && lenOf(path, r.a, r.b) < (m.minOpenM || 3000)) r.open = false; });
      const merged = [];
      runs.forEach(r => {
        const last = merged[merged.length - 1];
        if (last && last.open === r.open) last.b = r.b; else merged.push({ open: r.open, a: r.a, b: r.b });
      });
      /* i pezzi si toccano: la fine di uno è l'inizio del successivo */
      const pieces = merged.map((r, idx) => {
        const a0 = idx ? merged[idx - 1].b : r.a, cells = path.slice(a0, r.b + 1);
        return { open: r.open, cells: r.open ? simplifyC(cells) : cells };
      });
      let far = 0; path.forEach(i => { if (cd[i] > far) far = cd[i]; });
      res.legs.push({ pieces, far });
    }
    return res;
  }

  root.Water = { CFG, TILE, lon2px, lat2px, tileBox, boxBounds, gridBounds, makeGrid, cellOf, verify, snap, snapXY, astar, simplify, cellLL, landDist, close, waterMask, solve, findGap, edt, coarseSolve };

  /* Quando il file è caricato come Web Worker risponde alle richieste di calcolo della pagina. */
  if (typeof importScripts === 'function' && typeof self !== 'undefined' && typeof document === 'undefined') {
    self.onmessage = e => {
      try {
        if (e.data && e.data.type === 'coarse') { const r = coarseSolve(e.data); self.postMessage(r, [r.cd.buffer]); return; }
        const r = solve(e.data);
        self.postMessage(r, [r.d.buffer, r.buf.buffer]);
      } catch (err) { self.postMessage({ id: e.data && e.data.id, error: String((err && err.message) || err) }); }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
