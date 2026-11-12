'use strict';
/* Geometria dei canali segnalati (briccole, pali, mede e boe laterali).
   Dai segnali ricava:
   - l'ASSE del canale: punti medi tra segnali posti uno di fronte all'altro, collegati lungo il canale;
   - le FILE di segnali (riconosciute dall'allineamento), che diventano BARRIERE invalicabili;
   - le FASCE ESTERNE: il lato di ogni fila opposto al canale, dove non si naviga;
     così nel canale si entra e si esce solo dalle estremità;
   - gli OSTACOLI: pericoli isolati, scogli, relitti e i pali stessi.
   Tutte le distanze sono in metri. */
(function (root) {
  const RAD = Math.PI / 180;
  const CFG = {
    rowMax: 320,        // distanza massima tra briccole consecutive della stessa fila
    rowMaxSided: 900,   // distanza massima tra mede/boe laterali consecutive dello stesso lato
    sideMax: 600,       // larghezza massima di un canale con segnali rossi/verdi
    plainMax: 400,      // larghezza massima di un canale con briccole senza colore
    axisMax: 400,       // distanza massima tra due punti dell'asse consecutivi
    band: 150,          // larghezza della fascia vietata sul lato esterno di ogni fila
    endStub: 150,       // raccordo dell'asse oltre le estremità del canale
    bridge: 500,        // distanza massima per unire la fine di un canale di briccole a un canale mappato
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
      /* briccole mappate come pali d'ormeggio: seamark:type=mooring con categoria dolphin o pile (es. Lignano, Marano) */
      const moorPost = type === 'mooring' && /^(dolphin|pile)$/.test(t['seamark:mooring:category'] || '');
      if (CHANNEL.test(type) || moorPost || t.man_made === 'dolphin' || (type === 'light_minor' && s)) marks.push(Object.assign(p, { side: s }));
      else posts.push(p);
    });
    return { marks, dangers, posts };
  }

  function analyze(nodes, cfg, lines) {
    const C = Object.assign({}, CFG, cfg || {});
    const { marks, dangers, posts } = classify(nodes);
    const out = { axis: [], ext: [], barrier: [], zone: [], band: [], nogo: [], pairs: 0, rows: 0, marks: marks.length };
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
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const rowMax = m => m.side ? C.rowMaxSided : C.rowMax;

    /* indice spaziale a celle */
    const CELL = 300, grid = new Map(), key = (i, j) => i + ',' + j;
    M.forEach((m, i) => { const k = key(Math.floor(m.x / CELL), Math.floor(m.y / CELL)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const near = (m, r) => {
      const res = [], n = Math.ceil(r / CELL), ci = Math.floor(m.x / CELL), cj = Math.floor(m.y / CELL);
      for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) (grid.get(key(i, j)) || []).forEach(k => res.push(k));
      return res;
    };
    const sameRowOk = (m, o) => !(m.side && o.side && m.side !== o.side) && !(!!m.side !== !!o.side);

    /* 1. FILE: ogni segnale sta nella fila dei due vicini con cui è allineato (angolo vicino a 180°).
          Con briccole distanziate lungo la fila quanto tra le due file, "il più vicino" non basta. */
    const cand = M.map((m, i) => near(m, rowMax(m)).filter(k => k !== i && sameRowOk(m, M[k]) && dist(m, M[k]) <= rowMax(m) && dist(m, M[k]) > 5));
    const nb = M.map(() => []);
    M.forEach((m, i) => {
      let best = null, bs = Infinity;
      const c = cand[i];
      for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) {
        const A = M[c[a]], B = M[c[b]];
        const ua = unit(A.x - m.x, A.y - m.y), ub = unit(B.x - m.x, B.y - m.y);
        const cos = ua[0] * ub[0] + ua[1] * ub[1];           // -1 = perfettamente allineati
        if (cos > -0.87) continue;                           // angolo minore di ~150°
        const da = dist(m, A), db = dist(m, B);
        if (Math.max(da, db) > 2.2 * Math.min(da, db)) continue;   // spaziatura troppo diversa
        const sc = da + db + 200 * (1 + cos);
        if (sc < bs) { bs = sc; best = [c[a], c[b]]; }
      }
      if (best) nb[i] = best;
    });
    /* estremità della fila: un solo vicino, che a sua volta la riconosce come vicina */
    M.forEach((m, i) => {
      if (nb[i].length) return;
      let best = -1, bd = Infinity;
      cand[i].forEach(k => { if (nb[k].includes(i) && dist(m, M[k]) < bd) { bd = dist(m, M[k]); best = k; } });
      if (best >= 0) nb[i] = [best];
    });
    /* collegamenti di fila reciproci */
    const edges = [], eSet = new Set();
    M.forEach((m, i) => nb[i].forEach(k => {
      if (!nb[k].includes(i)) return;
      const id = Math.min(i, k) + '-' + Math.max(i, k);
      if (eSet.has(id)) return;
      eSet.add(id); edges.push([i, k]);
    }));
    const deg = M.map(() => 0);
    edges.forEach(([i, k]) => { deg[i]++; deg[k]++; });
    M.forEach((m, i) => {
      const r = nb[i].filter(k => nb[k].includes(i));
      m.u = r.length === 2 ? unit(M[r[1]].x - M[r[0]].x, M[r[1]].y - M[r[0]].y) : r.length === 1 ? unit(M[r[0]].x - m.x, M[r[0]].y - m.y) : null;
      m.row = r;
    });
    /* identificativo di fila (componenti connesse) */
    const rowId = M.map(() => -1); let nRows = 0;
    M.forEach((m, i) => {
      if (rowId[i] >= 0 || !deg[i]) return;
      const st = [i]; rowId[i] = nRows;
      while (st.length) { const j = st.pop(); M[j].row.forEach(k => { if (rowId[k] < 0) { rowId[k] = nRows; st.push(k); } }); }
      nRows++;
    });
    out.rows = nRows;

    /* vicini lungo la fila entro 3 posizioni */
    const close3 = M.map((m, i) => {
      const set = new Set([i]); let front = [i];
      for (let h = 0; h < 3; h++) { const nx = []; front.forEach(j => M[j].row.forEach(k => { if (!set.has(k)) { set.add(k); nx.push(k); } })); front = nx; }
      return set;
    });
    /* 2. COPPIE trasversali: segnale di fronte, su un'altra fila, di traverso e con fila parallela */
    const pairs = [], seen = new Set(), partner = M.map(() => -1);
    M.forEach((m, i) => {
      if (!m.u) return;
      const maxW = m.side ? C.sideMax : C.plainMax;
      let best = -1, bd = maxW;
      near(m, maxW).forEach(k => {
        if (k === i) return;
        const o = M[k];
        if (close3[i].has(k)) return;   // stessa fila, entro 3 posizioni (non tutta la fila: due file unite a U restano accoppiabili)
        if (m.side && o.side && o.side === m.side) return;   // due mede dello stesso lato non formano un canale
        /* una briccola (senza lato) può stare di fronte a una meda laterale: rive segnate in modo diverso */
        const dd = dist(m, o);
        if (dd >= bd || dd < 15) return;
        const v = unit(o.x - m.x, o.y - m.y);
        if (Math.abs(v[0] * m.u[0] + v[1] * m.u[1]) > 0.55) return;          // non di traverso
        if (o.u && Math.abs(o.u[0] * m.u[0] + o.u[1] * m.u[1]) < 0.7) return; // file non parallele
        bd = dd; best = k;
      });
      if (best < 0) return;
      partner[i] = best;
      const id = Math.min(i, best) + '-' + Math.max(i, best);
      if (seen.has(id)) return;
      seen.add(id);
      const o = M[best], c = unit(o.x - m.x, o.y - m.y);
      let d = m.u || o.u || [-c[1], c[0]];
      if (Math.abs(d[0] * c[0] + d[1] * c[1]) > 0.8) d = [-c[1], c[0]];
      pairs.push({ x: (m.x + o.x) / 2, y: (m.y + o.y) / 2, w: bd, d, a: i, b: best });
    });
    out.pairs = pairs.length;

    /* 3. ASSE del canale: punti medi collegati lungo il canale; curve strette con il punto più vicino */
    const axisSegs = [];
    pairs.forEach((p, i) => {
      p.fwd = p.bwd = false;
      [1, -1].forEach(sg => {
        let best = -1, bd = C.axisMax ** 2;
        pairs.forEach((q, k) => {
          if (k === i) return;
          const dx = q.x - p.x, dy = q.y - p.y, dd = dx * dx + dy * dy;
          if (dd >= bd || dd < 1) return;
          if ((dx * p.d[0] + dy * p.d[1]) / Math.sqrt(dd) * sg < 0.6) return;
          bd = dd; best = k;
        });
        if (best >= 0) { sg > 0 ? (p.fwd = true) : (p.bwd = true); axisSegs.push([p, pairs[best], Math.min(p.w, pairs[best].w)]); }
      });
    });
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
    /* tutta la larghezza del canale tra due coppie consecutive (quadrilatero tra le due file):
       la rotta può aggirare pali o ostacoli in mezzo al canale; il centro resta preferito dal calcolo */
    out.chan = [];
    out.chanDir = [];   // stesso quadrilatero con il suo asse: serve per la regola 9 (tenere la dritta)
    axisSegs.forEach(([p, q]) => {
      if (Math.hypot(p.x - q.x, p.y - q.y) > C.axisMax) return;
      const A1 = M[p.a], A2 = M[p.b];
      let B1 = M[q.a], B2 = M[q.b];
      if (Math.hypot(A1.x - B1.x, A1.y - B1.y) + Math.hypot(A2.x - B2.x, A2.y - B2.y) >
          Math.hypot(A1.x - B2.x, A1.y - B2.y) + Math.hypot(A2.x - B1.x, A2.y - B1.y)) [B1, B2] = [B2, B1];
      const quad = [back(A1.x, A1.y), back(B1.x, B1.y), back(B2.x, B2.y), back(A2.x, A2.y)];
      out.chan.push(quad);
      out.chanDir.push({ q: quad, a: back(p.x, p.y), b: back(q.x, q.y), w: Math.min(p.w, q.w) });
    });
    const axW = w => Math.max(C.axisW[0], Math.min(C.axisW[1], w * 0.5));
    axisSegs.forEach(([p, q, w]) => out.axis.push({ a: back(p.x, p.y), b: back(q.x, q.y), w: axW(w) }));
    pairs.forEach(p => {
      out.axis.push({ a: back(p.x, p.y), b: back(p.x, p.y), w: axW(p.w) });
      /* raccordo alle estremità del canale (150 m), anche dentro la laguna */
      [[!p.fwd, 1], [!p.bwd, -1]].forEach(([free, sg]) => {
        if (free) out.axis.push({ a: back(p.x, p.y), b: back(p.x + sg * p.d[0] * C.endStub, p.y + sg * p.d[1] * C.endStub), w: axW(p.w) });
      });
    });

    /* 3a. FILE SPEZZATE: il riconoscimento per allineamento perde le briccole nelle curve strette e dove la spaziatura
           cambia (es. 50 m invece di 90 m). Restava un varco nella barriera, proprio in curva, da cui la rotta usciva dal
           canale sui bassi fondali. Qui si ricuciono le estremità di fila che proseguono nella stessa direzione, senza
           attraversare il canale (coppie di fronte) né chiudere l'imbocco di un canale laterale (raccordi dell'asse). */
    const cross = (P, Q, A, B) => {
      const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      return o(P, Q, A) * o(P, Q, B) < 0 && o(A, B, P) * o(A, B, Q) < 0;
    };
    const guard = pairs.map(p => [M[p.a], M[p.b]]);
    pairs.forEach(p => [[!p.fwd, 1], [!p.bwd, -1]].forEach(([free, sg]) => {
      if (free) guard.push([p, { x: p.x + sg * p.d[0] * C.endStub, y: p.y + sg * p.d[1] * C.endStub }]);
    }));
    const adj = M.map(() => []);
    edges.forEach(([i, k]) => { adj[i].push(k); adj[k].push(i); });
    const comp = M.map((m, i) => i), root = i => { while (comp[i] !== i) i = comp[i] = comp[comp[i]]; return i; };
    edges.forEach(([i, k]) => { comp[root(i)] = root(k); });
    for (let round = 0; round < 3; round++) {
      const cands = [];
      M.forEach((m, i) => {
        if (adj[i].length >= 2) return;
        const di = adj[i].length ? unit(m.x - M[adj[i][0]].x, m.y - M[adj[i][0]].y) : null;
        const li = adj[i].length ? dist(m, M[adj[i][0]]) : 0;
        near(m, rowMax(m)).forEach(k => {
          if (k <= i || adj[k].length >= 2 || root(k) === root(i) || partner[i] === k || partner[k] === i) return;
          const o = M[k];
          if (!sameRowOk(m, o)) return;
          const dd = dist(m, o);
          if (dd < 5 || dd > rowMax(m)) return;
          const dk = adj[k].length ? unit(o.x - M[adj[k][0]].x, o.y - M[adj[k][0]].y) : null;
          if (!di && !dk) return;                                  // due segnali isolati: potrebbero stare di fronte
          const lk = adj[k].length ? dist(o, M[adj[k][0]]) : 0;
          if (dd > 2.5 * Math.max(li, lk)) return;                 // varco molto più lungo della spaziatura della fila
          const v = unit(o.x - m.x, o.y - m.y);
          if (di && v[0] * di[0] + v[1] * di[1] < 0.7) return;    // prosegue la fila di i (entro ~45°)
          if (dk && -(v[0] * dk[0] + v[1] * dk[1]) < 0.7) return;  // e quella di k
          if (guard.some(([A, B]) => A !== m && B !== m && A !== o && B !== o && cross(m, o, A, B))) return;
          if (edges.some(([a, b]) => a !== i && b !== i && a !== k && b !== k && cross(m, o, M[a], M[b]))) return;
          cands.push([dd, i, k]);
        });
      });
      if (!cands.length) break;
      cands.sort((a, b) => a[0] - b[0]);
      let added = 0;
      cands.forEach(([, i, k]) => {
        if (adj[i].length >= 2 || adj[k].length >= 2 || root(i) === root(k)) return;
        edges.push([i, k]); adj[i].push(k); adj[k].push(i); comp[root(i)] = root(k); added++;
      });
      if (!added) break;
    }
    out.joined = edges.length - eSet.size;
    /* file aggiornate (servono all'area tra le file e alle fasce esterne) */
    M.forEach((m, i) => { m.row = adj[i]; rowId[i] = -1; });
    nRows = 0;
    M.forEach((m, i) => {
      if (rowId[i] >= 0 || !adj[i].length) return;
      const st = [i]; rowId[i] = nRows;
      while (st.length) { const j = st.pop(); adj[j].forEach(k => { if (rowId[k] < 0) { rowId[k] = nRows; st.push(k); } }); }
      nRows++;
    });
    out.rows = nRows;

    /* 3b. AREA TRA LE FILE: per due file affiancate (rossa e verde, o due file di briccole) il canale è il poligono
           compreso tra loro, per il tratto in cui corrono vicine. Funziona anche con segnali sfalsati e canali che piegano. */
    out.chanPoly = [];
    const chains = new Map();
    M.forEach((m, i) => {
      if (rowId[i] < 0 || chains.has(rowId[i])) return;
      const ids = []; M.forEach((o, j) => { if (rowId[j] === rowId[i]) ids.push(j); });
      let start = ids.find(j => M[j].row.length < 2);
      if (start === undefined) return;                       // fila chiusa ad anello: si salta
      const ord = [start], seenC = new Set([start]);
      for (let cur = start; ;) { const nx = M[cur].row.find(k => !seenC.has(k)); if (nx === undefined) break; ord.push(nx); seenC.add(nx); cur = nx; }
      chains.set(rowId[i], ord);
    });
    const dPtChain = (P, ch) => {
      let best = Infinity;
      for (let k = 0; k < ch.length; k++) {
        const A = M[ch[k]], B = M[ch[Math.min(k + 1, ch.length - 1)]], dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
        let t = l2 ? ((P.x - A.x) * dx + (P.y - A.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(P.x - A.x - t * dx, P.y - A.y - t * dy));
      }
      return best;
    };
    const chainPairs = new Set();
    pairs.forEach(p => { const a = rowId[p.a], b = rowId[p.b]; if (a >= 0 && b >= 0 && a !== b) chainPairs.add(Math.min(a, b) + '-' + Math.max(a, b)); });
    chainPairs.forEach(key => {
      const [ia, ib] = key.split('-').map(Number), A = chains.get(ia), B = chains.get(ib);
      if (!A || !B) return;
      const maxW = (M[A[0]].side && M[B[0]].side) ? C.sideMax : C.plainMax;
      const clip = (X, Y) => { const ok = X.map(j => dPtChain(M[j], Y) <= maxW); const f = ok.indexOf(true), l = ok.lastIndexOf(true); return f < 0 ? [] : X.slice(f, l + 1); };
      const As = clip(A, B); let Bs = clip(B, A);
      if (As.length + Bs.length < 3 || !As.length || !Bs.length) return;
      const last = M[As[As.length - 1]];
      if (Math.hypot(last.x - M[Bs[0]].x, last.y - M[Bs[0]].y) > Math.hypot(last.x - M[Bs[Bs.length - 1]].x, last.y - M[Bs[Bs.length - 1]].y)) Bs = Bs.slice().reverse();
      out.chanPoly.push(As.concat(Bs).map(j => back(M[j].x, M[j].y)));
    });

    /* 4. BARRIERE: ogni fila è invalicabile */
    edges.forEach(([i, k]) => out.barrier.push({ a: back(M[i].x, M[i].y), b: back(M[k].x, M[k].y) }));

    /* 4b. RACCORDI: dove un canale di briccole finisce e poco più avanti, nella stessa direzione, comincia un canale
           mappato come linea (es. nella gola di una bocca di porto), i due vengono uniti, se il raccordo non scavalca file. */
    if (lines && lines.length) {
      const L2 = lines.map(l => l.map(p => ({ x: (p.lng - lo) * kx, y: (p.lat - la) * ky })));
      const crossesRow = (P, Q) => edges.some(([i, k]) => {
        const A = M[i], B = M[k], o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
        return o(P, Q, A) !== o(P, Q, B) && o(A, B, P) !== o(A, B, Q);
      });
      pairs.forEach(p => {
        [[!p.fwd, 1], [!p.bwd, -1]].forEach(([free, sg]) => {
          if (!free) return;
          const dir = [sg * p.d[0], sg * p.d[1]];
          let best = null, bd = C.bridge;
          L2.forEach(l => {
            for (let k = 1; k < l.length; k++) {
              const A = l[k - 1], B = l[k], dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
              let t = l2 ? ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2 : 0;
              t = Math.max(0, Math.min(1, t));
              const q = { x: A.x + t * dx, y: A.y + t * dy }, vx = q.x - p.x, vy = q.y - p.y, dd = Math.hypot(vx, vy);
              if (dd >= bd || dd < 1) continue;
              if ((vx * dir[0] + vy * dir[1]) / dd < 0.5) continue;      // solo in avanti, nella direzione del canale
              best = q; bd = dd;
            }
          });
          if (best && !crossesRow(p, best)) out.axis.push({ a: back(p.x, p.y), b: back(best.x, best.y), w: Math.max(C.axisW[0], Math.min(C.axisW[1], p.w * 0.5)) });
        });
      });
    }

    /* 5. FASCE ESTERNE: sul lato della fila opposto al canale (dove di solito c'è la secca) non si naviga.
          Così nel canale si entra e si esce solo dalle estremità. Le file senza fila opposta hanno solo la barriera. */
    /* Il lato esterno si ricava dai segnali di fronte; i tratti di fila senza segnale di fronte lo ereditano dai tratti
       vicini della stessa fila (fino a ~15 tratti). Nelle curve si riempie anche lo spicchio tra due fasce consecutive:
       prima restavano varchi proprio lì, e la rotta correva fuori dal canale, sul basso fondale accanto alle briccole. */
    const eOut = edges.map(([i, k]) => {
      const A = M[i], B = M[k], u = unit(B.x - A.x, B.y - A.y), n = [-u[1], u[0]];
      const inner = [i, k].map(j => partner[j]).filter(j => j >= 0).map(j => Math.sign((M[j].x - A.x) * n[0] + (M[j].y - A.y) * n[1]));
      const sgn = inner.reduce((s, v) => s + v, 0);
      return sgn ? [-Math.sign(sgn) * n[0], -Math.sign(sgn) * n[1]] : null;   // normale verso l'esterno
    });
    const eAt = M.map(() => []);
    edges.forEach(([i, k], e) => { eAt[i].push(e); eAt[k].push(e); });
    let front = eOut.map((o, e) => o ? e : -1).filter(e => e >= 0);
    for (let hop = 0; hop < 15 && front.length; hop++) {
      const next = [];
      front.forEach(e => edges[e].forEach(j => eAt[j].forEach(f => {
        if (eOut[f]) return;
        const [i, k] = edges[f], u = unit(M[k].x - M[i].x, M[k].y - M[i].y), n = [-u[1], u[0]];
        const s = n[0] * eOut[e][0] + n[1] * eOut[e][1] >= 0 ? 1 : -1;
        eOut[f] = [s * n[0], s * n[1]]; next.push(f);
      })));
      front = next;
    }
    edges.forEach(([i, k], e) => {
      const o = eOut[e]; if (!o) return;
      const A = M[i], B = M[k], b = C.band;
      out.band.push([back(A.x, A.y), back(B.x, B.y), back(B.x + o[0] * b, B.y + o[1] * b), back(A.x + o[0] * b, A.y + o[1] * b)]);
    });
    M.forEach((m, j) => {
      /* fine fila: quarto di cerchio esterno oltre l'ultimo segnale, così la fascia non si interrompe di netto dove la
         fila cambia (curve con segnali sfalsati); l'imbocco di un canale laterale resta aperto dal suo asse */
      if (eAt[j].length === 1) {
        const e = eAt[j][0], o = eOut[e]; if (!o) return;
        const q = M[edges[e][0] === j ? edges[e][1] : edges[e][0]], f = unit(m.x - q.x, m.y - q.y), mid = unit(o[0] + f[0], o[1] + f[1]), b = C.band;
        out.band.push([back(m.x, m.y), back(m.x + o[0] * b, m.y + o[1] * b), back(m.x + mid[0] * b, m.y + mid[1] * b), back(m.x + f[0] * b, m.y + f[1] * b)]);
        return;
      }
      if (eAt[j].length !== 2) return;
      const o1 = eOut[eAt[j][0]], o2 = eOut[eAt[j][1]];
      if (!o1 || !o2 || o1[0] * o2[0] + o1[1] * o2[1] < -0.2) return;
      const mid = unit(o1[0] + o2[0], o1[1] + o2[1]), b = C.band;
      out.band.push([back(m.x, m.y), back(m.x + o1[0] * b, m.y + o1[1] * b), back(m.x + mid[0] * b, m.y + mid[1] * b), back(m.x + o2[0] * b, m.y + o2[1] * b)]);
    });
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
    const quad = (mask, q) => {
      const P = q.map(toPx), xs = P.map(p => p[0]), ys = P.map(p => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      const cr = (a, b, x, y) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let pos = 0, neg = 0;
        for (let k = 0; k < 4; k++) { const c = cr(P[k], P[(k + 1) % 4], px, py); if (c > 0) pos++; else if (c < 0) neg++; }
        if (!pos || !neg) mask[y * W + x] = 1;
      }
    };
    const poly = (mask, pts) => {
      const P = pts.map(toPx);
      let y0 = Infinity, y1 = -Infinity; P.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
        const yc = y + 0.5, xs = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) mask[y * W + x] = 1;
      }
    };
    (prims.chanPoly || []).forEach(pts => poly(res.axis, pts));
    (prims.band || []).forEach(q => quad(res.zone, q));
    (prims.chan || []).forEach(q => quad(res.axis, q));
    prims.axis.forEach(s => seg(res.axis, s.a, s.b, Math.max(1.5, s.w / 2 / mpp)));
    prims.ext.forEach(s => seg(res.ext, s.a, s.b, Math.max(1.5, s.w / 2 / mpp)));
    prims.barrier.forEach(s => seg(res.barrier, s.a, s.b, 0.75));
    prims.nogo.forEach(z => seg(res.nogo, z.p, z.p, Math.max(0.75, z.r / mpp)));
    /* regola 9: per ogni cella del canale, verso dell'asse e posizione rispetto alla corsia di dritta */
    res.sx = new Int8Array(W * H); res.sy = new Int8Array(W * H); res.sp = new Int8Array(W * H); res.sn = new Int8Array(W * H);
    const S = { res, W, H, toPx, mpp };
    (prims.chanDir || []).forEach(c => paintSide(S, c.a, c.b, c.w, { quad: c.q }));
    prims.axis.forEach(s => { if (s.a.lat !== s.b.lat || s.a.lng !== s.b.lng) paintSide(S, s.a, s.b, s.w * 2, { half: Math.max(1.5, s.w / 2 / mpp) }); });
    return res;
  }

  /* Regola 9 COLREG: in un canale stretto si tiene la dritta. Per ogni cella dentro un quadrilatero (o.quad) o entro
     o.half pixel dal segmento a->b salva:
       sx, sy  verso dell'asse a->b (x100, coordinate in pixel)
       sp      scostamento dall'asse (metri, positivo a destra di a->b) meno la corsia t: chi va da a verso b
               è sul lato giusto se sp >= 0
       sn      scostamento più t: chi va da b verso a è sul lato giusto se sn <= 0
     t = un quarto della larghezza del canale (al massimo 25 m): la rotta sta a metà della metà di dritta,
     lontana sia dal centro (traffico in senso opposto) sia dal bordo (bassi fondali). Nei canali sotto 12 m t = 0. */
  function paintSide(S, a, b, width, o) {
    const { res, W, H, toPx, mpp } = S;
    const [ax, ay] = toPx(a), [bx, by] = toPx(b), L = Math.hypot(bx - ax, by - ay);
    if (L < 1) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L, t = width >= 12 ? Math.min(25, width / 4) : 0;
    const c8 = v => Math.max(-127, Math.min(127, Math.round(v)));
    let P = null, x0, x1, y0, y1;
    if (o.quad) {
      P = o.quad.map(toPx);
      x0 = Math.min(...P.map(p => p[0])); x1 = Math.max(...P.map(p => p[0])); y0 = Math.min(...P.map(p => p[1])); y1 = Math.max(...P.map(p => p[1]));
    } else {
      x0 = Math.min(ax, bx) - o.half; x1 = Math.max(ax, bx) + o.half; y0 = Math.min(ay, by) - o.half; y1 = Math.max(ay, by) + o.half;
    }
    const cr = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const px = x + 0.5, py = y + 0.5;
      if (P) {
        let pos = 0, neg = 0;
        for (let k = 0; k < 4; k++) { const c = cr(P[k], P[(k + 1) % 4], px, py); if (c > 0) pos++; else if (c < 0) neg++; }
        if (pos && neg) continue;
      } else {
        const tt = Math.max(0, Math.min(L, (px - ax) * ux + (py - ay) * uy));
        if (Math.hypot(px - ax - tt * ux, py - ay - tt * uy) > o.half) continue;
      }
      /* normale (-uy, ux): in coordinate schermo (y verso il basso) è la destra di chi va da a verso b */
      const off = (-(px - ax) * uy + (py - ay) * ux) * mpp, i = y * W + x;
      if (o.keep && (res.sx[i] || res.sy[i])) continue;   // il canale di briccole già dipinto ha la precedenza
      res.sx[i] = Math.round(ux * 100); res.sy[i] = Math.round(uy * 100);
      res.sp[i] = c8(off - t); res.sn[i] = c8(off + t);
    }
  }

  root.Channels = { CFG, side, classify, analyze, rasterize, paintSide };
})(typeof window !== 'undefined' ? window : globalThis);
