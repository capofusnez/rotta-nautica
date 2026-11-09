'use strict';
/* Geometria dei canali segnalati (briccole, pali, mede e boe laterali).
   Dai segnali ricava:
   - l'ASSE del canale: punti medi tra segnali posti uno di fronte all'altro, collegati lungo il canale;
   - i PROLUNGAMENTI dell'asse alle due estremità, per entrare e uscire dal canale;
   - le BARRIERE: le file di segnali dello stesso lato, che la rotta non può attraversare;
   - la ZONA CANALIZZATA: l'area attorno ai segnali, dove si naviga solo sull'asse del canale;
   - gli OSTACOLI: pericoli isolati, scogli, relitti e i pali stessi.
   Tutte le distanze sono in metri. */
(function (root) {
  const RAD = Math.PI / 180;
  const CFG = {
    rowMax: 220,        // distanza massima tra segnali consecutivi della stessa fila
    sideMax: 600,       // larghezza massima di un canale con segnali rossi/verdi
    plainMax: 400,      // larghezza massima di un canale con briccole senza colore
    axisMax: 400,       // distanza massima tra due punti dell'asse consecutivi
    zoneR: 300,         // raggio della zona canalizzata attorno a ogni segnale
    extra: 80,          // prolungamento dell'asse oltre la zona canalizzata
    axisW: [16, 80],    // larghezza minima e massima della fascia navigabile sull'asse
    postR: 8,           // distanza minima da un palo
    dangerR: 40         // distanza minima da un pericolo isolato, scoglio o relitto
  };
  const CHANNEL = /^(beacon_lateral|buoy_lateral|beacon_safe_water|beacon_special_purpose|pile)$/;
  const DANGER = /^(beacon_isolated_danger|buoy_isolated_danger|rock|wreck|obstruction)$/;

  /* Lato IALA A: 'port' = rosso (a sinistra entrando dal mare), 'stbd' = verde (a dritta). */
  function side(t) {
    const type = t['seamark:type'] || '';
    const cat = t['seamark:' + type + ':category'] || '';
    if (/^port$/.test(cat)) return 'port';
    if (/^starboard$/.test(cat)) return 'stbd';
    if (/preferred/.test(cat)) return null;
    const col = (t['seamark:' + type + ':colour'] || '').split(';')[0];
    if (/lateral/.test(type)) return col === 'red' ? 'port' : col === 'green' ? 'stbd' : null;
    if (type === 'light_minor') {
      const lc = t['seamark:light:colour'] || t['seamark:light:1:colour'] || '';
      if (lc === 'red') return 'port';
      if (lc === 'green') return 'stbd';
    }
    return null;
  }

  /* Divide i segnali scaricati in segnali di canale e pericoli. */
  function classify(nodes) {
    const marks = [], dangers = [], posts = [];
    nodes.forEach(n => {
      const t = n.tags || {}, type = t['seamark:type'] || '';
      const p = { lat: n.lat, lng: n.lng };
      if (DANGER.test(type)) { dangers.push(p); return; }
      const s = side(t);
      /* man_made=dolphin: così sono mappate molte briccole (es. Laguna di Venezia) */
      if (CHANNEL.test(type) || t.man_made === 'dolphin' || (type === 'light_minor' && s)) marks.push(Object.assign(p, { side: s }));
      else posts.push(p);
    });
    return { marks, dangers, posts };
  }

  function analyze(nodes, cfg) {
    const C = Object.assign({}, CFG, cfg || {});
    const { marks, dangers, posts } = classify(nodes);
    const out = { axis: [], ext: [], barrier: [], zone: [], nogo: [], pairs: 0, marks: marks.length };
    dangers.forEach(p => out.nogo.push({ p, r: C.dangerR }));
    posts.concat(marks).forEach(p => out.nogo.push({ p, r: C.postR }));
    if (!marks.length) return out;

    /* coordinate locali in metri */
    let la = 0, lo = 0;
    marks.forEach(m => { la += m.lat; lo += m.lng; });
    la /= marks.length; lo /= marks.length;
    const kx = 111320 * Math.cos(la * RAD), ky = 110540;
    const M = marks.map(m => ({ x: (m.lng - lo) * kx, y: (m.lat - la) * ky, side: m.side }));
    const back = (x, y) => ({ lat: la + y / ky, lng: lo + x / kx });
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

    /* indice spaziale a celle per trovare in fretta i vicini */
    const CELL = 300, grid = new Map(), key = (i, j) => i + ',' + j;
    M.forEach((m, i) => { const k = key(Math.floor(m.x / CELL), Math.floor(m.y / CELL)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const near = (m, r) => {
      const res = [], n = Math.ceil(r / CELL), ci = Math.floor(m.x / CELL), cj = Math.floor(m.y / CELL);
      for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) (grid.get(key(i, j)) || []).forEach(k => res.push(k));
      return res;
    };

    /* direzione della fila: verso il segnale più vicino dello stesso lato (o qualsiasi, se senza colore) */
    M.forEach((m, i) => {
      let best = -1, bd = C.rowMax ** 2;
      near(m, C.rowMax).forEach(k => {
        if (k === i) return;
        const o = M[k];
        if (m.side && o.side !== m.side) return;
        const dd = d2(m, o);
        if (dd < bd) { bd = dd; best = k; }
      });
      m.row = best;
      m.u = best >= 0 ? unit(M[best].x - m.x, M[best].y - m.y) : null;
    });

    /* coppie trasversali: rosso con verde, oppure briccole una di fronte all'altra */
    const pairs = [], seen = new Set();
    M.forEach((m, i) => {
      const maxW = m.side ? C.sideMax : C.plainMax;
      let best = -1, bd = maxW ** 2;
      near(m, maxW).forEach(k => {
        if (k === i || k === m.row) return;
        const o = M[k];
        if (m.side && o.side && o.side === m.side) return;
        if (!m.side && o.side) return;
        const dd = d2(m, o);
        if (dd >= bd || dd < 15 * 15) return;
        const v = unit(o.x - m.x, o.y - m.y);
        if (!(m.side && o.side)) {
          /* senza colore: il compagno deve stare di traverso rispetto alla fila */
          if (!m.u) return;
          if (Math.abs(v[0] * m.u[0] + v[1] * m.u[1]) > 0.5) return;
          if (o.u && Math.abs(o.u[0] * m.u[0] + o.u[1] * m.u[1]) < 0.7) return;
        }
        bd = dd; best = k;
      });
      if (best < 0) return;
      const id = Math.min(i, best) + '-' + Math.max(i, best);
      if (seen.has(id)) return;
      seen.add(id);
      const o = M[best], w = Math.sqrt(bd);
      const c = unit(o.x - m.x, o.y - m.y);
      /* direzione del canale: lungo la fila, oppure perpendicolare alla coppia */
      let d = m.u || o.u || [-c[1], c[0]];
      if (Math.abs(d[0] * c[0] + d[1] * c[1]) > 0.8) d = [-c[1], c[0]];
      pairs.push({ x: (m.x + o.x) / 2, y: (m.y + o.y) / 2, w, d, a: i, b: best });
    });
    out.pairs = pairs.length;

    /* asse: ogni punto medio si collega al più vicino avanti e al più vicino indietro lungo il canale */
    const axisSegs = [];
    pairs.forEach((p, i) => {
      p.fwd = p.bwd = false;
      [1, -1].forEach(sg => {
        let best = -1, bd = C.axisMax ** 2;
        pairs.forEach((q, k) => {
          if (k === i) return;
          const dx = q.x - p.x, dy = q.y - p.y, dd = dx * dx + dy * dy;
          if (dd >= bd || dd < 1) return;
          const l = Math.sqrt(dd), dot = (dx * p.d[0] + dy * p.d[1]) / l;
          if (dot * sg < 0.6) return;
          bd = dd; best = k;
        });
        if (best >= 0) {
          sg > 0 ? (p.fwd = true) : (p.bwd = true);
          const q = pairs[best];
          axisSegs.push([p, q, Math.min(p.w, q.w)]);
        }
      });
    });
    /* curve secche e incroci: un punto dell'asse rimasto senza continuazione si collega al più vicino entro 250 m,
       qualunque sia la direzione. I prolungamenti verso l'esterno restano decisi dai collegamenti "dritti". */
    const linked = new Set(axisSegs.map(([p, q]) => pairs.indexOf(p) + '-' + pairs.indexOf(q)));
    pairs.forEach((p, i) => {
      if (p.fwd && p.bwd) return;
      let best = -1, bd = 250 * 250;
      pairs.forEach((q, k) => {
        if (k === i || linked.has(i + '-' + k) || linked.has(k + '-' + i)) return;
        const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      });
      if (best >= 0) { axisSegs.push([p, pairs[best], Math.min(p.w, pairs[best].w)]); linked.add(i + '-' + best); }
    });
    out.axisSegs = axisSegs.length;
    const axW = w => Math.max(C.axisW[0], Math.min(C.axisW[1], w * 0.5));
    axisSegs.forEach(([p, q, w]) => out.axis.push({ a: back(p.x, p.y), b: back(q.x, q.y), w: axW(w) }));
    /* punti isolati e estremità: fascia trasversale tra i due segnali e prolungamento verso l'esterno */
    const L = C.zoneR + C.extra;
    pairs.forEach(p => {
      out.axis.push({ a: back(p.x, p.y), b: back(p.x, p.y), w: axW(p.w) });
      /* prolungamento: i primi 150 m valgono come asse (anche dentro la laguna, per raccordarsi a bocche e canali),
         il resto solo in acqua libera */
      const S = Math.min(L, 150);
      [[!p.fwd, 1], [!p.bwd, -1]].forEach(([free, sg]) => {
        if (!free) return;
        out.axis.push({ a: back(p.x, p.y), b: back(p.x + sg * p.d[0] * S, p.y + sg * p.d[1] * S), w: axW(p.w) });
        out.ext.push({ a: back(p.x, p.y), b: back(p.x + sg * p.d[0] * L, p.y + sg * p.d[1] * L), w: axW(p.w) });
      });
    });

    /* barriere: fila di segnali dello stesso lato, salvo dove taglierebbe l'asse */
    const cross = (p1, p2, p3, p4) => {
      const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2);
    };
    const bseen = new Set();
    M.forEach((m, i) => {
      if (m.row < 0) return;
      const o = M[m.row];
      if (!m.side && !o.side && (!m.u || !o.u)) return;
      const id = Math.min(i, m.row) + '-' + Math.max(i, m.row);
      if (bseen.has(id)) return;
      bseen.add(id);
      if (axisSegs.some(([p, q]) => cross(m, o, p, q))) return;
      if (pairs.some(p => (p.a === i && p.b === m.row) || (p.b === i && p.a === m.row))) return;
      out.barrier.push({ a: back(m.x, m.y), b: back(o.x, o.y) });
    });

    marks.forEach(m => out.zone.push({ p: { lat: m.lat, lng: m.lng }, r: C.zoneR }));
    return out;
  }

  /* Disegna le forme su una maschera W x H. toPx(p) -> [x, y] in pixel, mpp = metri per pixel. */
  function rasterize(prims, W, H, toPx, mpp) {
    const mk = () => new Uint8Array(W * H);
    const res = { axis: mk(), ext: mk(), barrier: mk(), zone: mk(), nogo: mk() };
    const seg = (m, a, b, halfPx) => {
      const [ax, ay] = toPx(a), [bx, by] = toPx(b), r = Math.max(0.75, halfPx);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, r2 = r * r;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        let t = l2 ? (px * dx + py * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - t * dx, qy = py - t * dy;
        if (qx * qx + qy * qy <= r2) m[y * W + x] = 1;
      }
    };
    prims.zone.forEach(z => seg(res.zone, z.p, z.p, z.r / mpp));
    prims.axis.forEach(s => seg(res.axis, s.a, s.b, Math.max(1.5, s.w / 2 / mpp)));
    prims.ext.forEach(s => seg(res.ext, s.a, s.b, Math.max(1.5, s.w / 2 / mpp)));
    prims.barrier.forEach(s => seg(res.barrier, s.a, s.b, 0.75));
    prims.nogo.forEach(z => seg(res.nogo, z.p, z.p, Math.max(0.75, z.r / mpp)));
    return res;
  }

  root.Channels = { CFG, side, classify, analyze, rasterize };
})(typeof window !== 'undefined' ? window : globalThis);
