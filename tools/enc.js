'use strict';
/* Carte nautiche elettroniche ENC (IHO S-57) per Rotta Nautica.
   - Il pacchetto (enc-rotta.json) si crea sul computer con tools/enc2rotta.py e si importa nell'app:
     resta salvato solo su questo telefono, perché le ENC ufficiali sono coperte da licenza.
   - Disegna aree di profondità, aree dragate, terra, costa, opere, rotte raccomandate, segnali e fanali.
   - Al tocco su un segnale mostra gli attributi S-57 decodificati.
   - Fornisce al calcolo della rotta le maschere: acqua abbastanza profonda per il pescaggio, terra,
     opere, ostacoli, rotte raccomandate. */
(function (root) {
  const KEY = 'https://rotta-nautica.local/enc/bundle-v1';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => String(+(+v).toFixed(2)).replace('.', ',');

  /* ---------- Tabelle di decodifica S-57 ---------- */
  const T = {
    COLOUR: { 1: 'bianco', 2: 'nero', 3: 'rosso', 4: 'verde', 5: 'blu', 6: 'giallo', 7: 'grigio', 8: 'marrone', 9: 'ambra', 10: 'viola', 11: 'arancione', 12: 'magenta', 13: 'rosa' },
    COLPAT: { 1: 'a bande orizzontali', 2: 'a bande verticali', 3: 'a bande diagonali', 4: 'a scacchi', 5: 'a strisce', 6: 'con bordo' },
    CATLAM: {
      1: ['lato sinistro (babordo)', 'Sistema IALA A: rosso. Entrando dal mare si lascia a <b>sinistra</b>.'],
      2: ['lato dritto (tribordo)', 'Sistema IALA A: verde. Entrando dal mare si lascia a <b>dritta</b>.'],
      3: ['canale preferito a dritta', 'Biforcazione: entrando dal mare il canale principale prosegue a <b>dritta</b> del segnale.'],
      4: ['canale preferito a sinistra', 'Biforcazione: entrando dal mare il canale principale prosegue a <b>sinistra</b> del segnale.']
    },
    CATCAM: {
      1: ['cardinale Nord', 'Acque sicure a <b>nord</b> del segnale.'], 2: ['cardinale Est', 'Acque sicure a <b>est</b> del segnale.'],
      3: ['cardinale Sud', 'Acque sicure a <b>sud</b> del segnale.'], 4: ['cardinale Ovest', 'Acque sicure a <b>ovest</b> del segnale.']
    },
    MARSYS: { 1: 'IALA A', 2: 'IALA B', 9: 'nessun sistema', 10: 'altro sistema', 11: 'CEVNI (acque interne europee)' },
    BCNSHP: { 1: 'palo / asta', 2: 'frasca', 3: 'torretta', 4: 'traliccio', 5: 'palo (briccola)', 6: 'mucchio di pietre', 7: 'meda galleggiante' },
    BOYSHP: { 1: 'conica', 2: 'cilindrica', 3: 'sferica', 4: 'a pilastro', 5: 'ad asta', 6: 'a botte', 7: 'grande boa', 8: 'da ghiaccio' },
    LITCHR: {
      1: ['F', 'fissa'], 2: ['Fl', 'a lampi'], 3: ['LFl', 'a lampi lunghi'], 4: ['Q', 'scintillante'], 5: ['VQ', 'scintillante rapida'],
      6: ['UQ', 'scintillante ultrarapida'], 7: ['Iso', 'isofase'], 8: ['Oc', 'intermittente (a eclissi)'], 9: ['IQ', 'scintillante interrotta'],
      10: ['IVQ', 'scintillante rapida interrotta'], 11: ['IUQ', 'ultrarapida interrotta'], 12: ['Mo', 'codice Morse'], 13: ['FFl', 'fissa e a lampi'],
      14: ['Fl+LFl', 'lampi e lampi lunghi'], 15: ['Oc+Fl', 'intermittente e a lampi'], 16: ['FLFl', 'fissa e a lampi lunghi'],
      17: ['Al.Oc', 'intermittente alternata'], 18: ['Al.LFl', 'a lampi lunghi alternata'], 19: ['Al.Fl', 'a lampi alternata'],
      20: ['Al.Gr', 'a gruppi alternata'], 25: ['Q+LFl', 'scintillante e lampo lungo'], 26: ['VQ+LFl', 'scintillante rapida e lampo lungo'],
      27: ['UQ+LFl', 'ultrarapida e lampo lungo'], 28: ['Al', 'alternata'], 29: ['Al.FFl', 'fissa e a lampi alternata']
    },
    LCOL: { 1: 'W', 3: 'R', 4: 'G', 5: 'Bu', 6: 'Y', 10: 'Vi', 11: 'Or' },
    CATLIT: { 1: 'direzionale', 4: 'di allineamento', 5: 'aeronautica', 6: 'ostacolo aereo', 8: 'proiettore', 10: 'sussidiaria', 12: 'anteriore di allineamento', 13: 'posteriore di allineamento', 14: 'inferiore', 15: 'superiore', 17: 'di emergenza', 18: 'di rilevamento' },
    LITVIS: { 1: 'alta intensità', 2: 'bassa intensità', 3: 'debole', 4: 'intensificata', 5: 'non intensificata', 6: 'visibilità limitata di proposito', 7: 'oscurata', 8: 'parzialmente oscurata' },
    EXCLIT: { 1: 'senza cambio di caratteristica', 2: 'accesa anche di giorno', 3: 'accesa con la nebbia', 4: 'accesa solo di notte' },
    TOPSHP: {
      1: 'cono con la punta in alto', 2: 'cono con la punta in basso', 3: 'sfera', 4: 'due sfere', 5: 'cilindro', 6: 'tabella', 7: 'croce di Sant\'Andrea',
      8: 'croce verticale', 10: 'due coni uniti per la punta (Ovest)', 11: 'due coni uniti per la base (Est)', 12: 'rombo',
      13: 'due coni con le punte in alto (Nord)', 14: 'due coni con le punte in basso (Sud)', 17: 'bandiera', 19: 'quadrato',
      20: 'rettangolo orizzontale', 21: 'rettangolo verticale', 24: 'triangolo con la punta in alto', 25: 'triangolo con la punta in basso', 26: 'cerchio'
    },
    WATLEV: { 1: 'in parte sommerso con l\'alta marea', 2: 'sempre emerso', 3: 'sempre sommerso', 4: 'emerge e si copre con la marea', 5: 'a fior d\'acqua', 6: 'soggetto ad allagamento', 7: 'galleggiante' },
    CATOBS: { 1: 'ceppo / palo sommerso', 2: 'testa di pozzo', 3: 'diffusore', 4: 'gabbia', 5: 'barriera per pesci', 6: 'area ingombra', 7: 'fondale ingombro', 8: 'sbarramento galleggiante', 9: 'ancoraggi a terra', 10: 'barriera' },
    CATWRK: { 1: 'non pericoloso', 2: 'pericoloso', 3: 'resti sparsi', 4: 'albero visibile', 5: 'scafo visibile' }
  };
  const TITLE = {
    BCNLAT: 'Meda laterale', BOYLAT: 'Boa laterale', BCNCAR: 'Meda cardinale', BOYCAR: 'Boa cardinale',
    BCNISD: 'Meda di pericolo isolato', BOYISD: 'Boa di pericolo isolato', BCNSAW: 'Meda di acque sicure', BOYSAW: 'Boa di acque sicure',
    BCNSPP: 'Meda speciale', BOYSPP: 'Boa speciale', LIGHTS: 'Fanale', TOPMAR: 'Miraglio', DAYMAR: 'Segnale diurno', FOGSIG: 'Segnale da nebbia',
    OBSTRN: 'Ostruzione', WRECKS: 'Relitto', UWTROC: 'Scoglio'
  };
  const CSS = { 1: '#ffffff', 2: '#111111', 3: '#e0262b', 4: '#1a9a3a', 5: '#2a5bd7', 6: '#f2c200', 7: '#8a8a8a', 8: '#8b5a2b', 9: '#ffbf00', 10: '#8a2be2', 11: '#ff8c00', 12: '#e254ff', 13: '#ff9ec4' };
  const POINT_LAYERS = ['BCNLAT', 'BOYLAT', 'BCNCAR', 'BOYCAR', 'BCNISD', 'BOYISD', 'BCNSAW', 'BOYSAW', 'BCNSPP', 'BOYSPP', 'LIGHTS', 'TOPMAR', 'DAYMAR', 'FOGSIG', 'OBSTRN', 'WRECKS', 'UWTROC'];
  const list = v => v == null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/[,;]/).filter(Boolean);
  const dec = (tab, v) => list(v).map(c => (T[tab][c] != null ? (Array.isArray(T[tab][c]) ? T[tab][c][0] : T[tab][c]) : 'codice ' + c));

  /* ---------- Dati ---------- */
  let bundle = null, readyP = Promise.resolve();
  const bboxOf = g => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const walk = c => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
    if (g && g.coordinates) walk(g.coordinates);
    return [w, s, e, n];
  };
  function prepare(b) {
    if (!b || b.format !== 'rotta-enc-1' || !b.layers) throw new Error('Il file non è un pacchetto ENC di Rotta Nautica (crealo con tools/enc2rotta.py)');
    Object.keys(b.layers).forEach(k => (b.layers[k].features || []).forEach(f => { f._lyr = k; f._bb = bboxOf(f.geometry); }));
    return b;
  }
  const feats = k => (bundle && bundle.layers[k] && bundle.layers[k].features) || [];
  function load() { readyP = loadNow(); return readyP; }
  async function loadNow() {
    try {
      const c = await caches.open('rn-enc'), hit = await c.match(KEY);
      if (hit) bundle = prepare(await hit.json());
    } catch (e) { bundle = null; }
    return info();
  }
  async function importFile(file) {
    const txt = await file.text();
    const b = prepare(JSON.parse(txt));
    try { const c = await caches.open('rn-enc'); await c.put(KEY, new Response(txt, { headers: { 'Content-Type': 'application/json' } })); }
    catch (e) { /* salvataggio non disponibile: resta valido fino alla chiusura dell'app */ }
    bundle = b;
    return info();
  }
  async function clear() { bundle = null; try { await (await caches.open('rn-enc')).delete(KEY); } catch (e) { /* ignora */ } }
  function info() {
    if (!bundle) return null;
    const cells = bundle.cells || [];
    return {
      cells: cells.length, names: cells.map(c => c.name), created: bundle.created,
      editions: cells.map(c => `${c.name} ed.${c.edition != null ? c.edition : '?'}/${c.update != null ? c.update : '?'}`),
      counts: Object.fromEntries(Object.keys(bundle.layers).map(k => [k, feats(k).length]))
    };
  }

  /* ---------- Scheda S-57 ---------- */
  function lightParts(p) {
    const ch = T.LITCHR[p.LITCHR] || null;
    const abbr = ch ? ch[0] : (p.LITCHR != null ? 'LITCHR ' + p.LITCHR : '?');
    let grp = p.SIGGRP ? String(p.SIGGRP).replace(/^\(|\)$/g, '').replace(/\)\(/g, '+') : '';
    const cols = list(p.COLOUR).map(c => T.LCOL[c] || '?');
    return { abbr, grp, cols, ch };
  }
  function lightRows(p) {
    const rows = [], L = lightParts(p);
    const [a1, a2] = L.abbr.split('+');
    const str = `${a1}${L.grp ? '(' + L.grp + ')' : ''}${a2 ? '+' + a2 : ''} ${L.cols.join('')}${p.SIGPER != null ? ' ' + num(p.SIGPER) + 's' : ''}${p.HEIGHT != null ? ' ' + num(p.HEIGHT) + 'm' : ''}${p.VALNMR != null ? ' ' + num(p.VALNMR) + 'M' : ''}`;
    let text = '';
    if (root.Seamarks && root.Seamarks.lightText) {
      const [c, plus] = L.abbr.replace(/^Al\./, '').split('+');
      text = root.Seamarks.lightText({ char: c, plus: plus || '', alt: /^Al/.test(L.abbr), group: L.grp, colours: L.cols, period: p.SIGPER, height: p.HEIGHT,
        range: p.VALNMR, start: p.SECTR1, end: p.SECTR2, orient: p.ORIENT }).join('<br>');
    }
    rows.push(['Caratteristica', `<code>${esc(str)}</code>` + (text ? '<br>' + text : '')]);
    rows.push(['Ritmo (LITCHR)', p.LITCHR != null ? `${esc(p.LITCHR)} = ${L.ch ? L.ch[1] + ' (' + L.ch[0] + ')' : 'non in tabella'}` : 'non indicato']);
    if (p.SIGGRP) rows.push(['Gruppo (SIGGRP)', esc(p.SIGGRP)]);
    rows.push(['Colore (COLOUR)', list(p.COLOUR).length ? list(p.COLOUR).map(c => `${c} = ${T.COLOUR[c] || '?'}`).join(', ') : 'non indicato']);
    if (p.SIGPER != null) rows.push(['Periodo (SIGPER)', `${num(p.SIGPER)} secondi`]);
    if (p.SIGSEQ) rows.push(['Sequenza (SIGSEQ)', esc(p.SIGSEQ) + ' s (luce + buio)']);
    if (p.HEIGHT != null) rows.push(['Elevazione (HEIGHT)', `${num(p.HEIGHT)} m sul livello del mare`]);
    if (p.VALNMR != null) rows.push(['Portata (VALNMR)', `${num(p.VALNMR)} miglia nautiche (circa ${String((p.VALNMR * 1.852).toFixed(1)).replace('.', ',')} km)`]);
    if (p.SECTR1 != null && p.SECTR2 != null) rows.push(['Settore (SECTR1-2)', `da ${num(p.SECTR1)}° a ${num(p.SECTR2)}°, rilevamenti dal mare verso la luce`]);
    if (p.ORIENT != null) rows.push(['Orientamento', `${num(p.ORIENT)}°`]);
    if (p.CATLIT) rows.push(['Categoria (CATLIT)', dec('CATLIT', p.CATLIT).join(', ')]);
    if (p.LITVIS) rows.push(['Visibilità (LITVIS)', dec('LITVIS', p.LITVIS).join(', ')]);
    if (p.EXCLIT) rows.push(['Esercizio (EXCLIT)', dec('EXCLIT', p.EXCLIT).join(', ')]);
    return rows;
  }
  function featureRows(f) {
    const p = f.properties || {}, k = f._lyr, rows = [];
    let title = TITLE[k] || k;
    if (p.CATLAM != null && T.CATLAM[p.CATLAM]) {
      title += ' – ' + T.CATLAM[p.CATLAM][0];
      let txt = T.CATLAM[p.CATLAM][1];
      if (String(p.MARSYS) === '2') txt += ' <b>Attenzione: sistema IALA B, i colori sono invertiti.</b>';
      rows.push([`Categoria (CATLAM=${esc(p.CATLAM)})`, txt]);
    }
    if (p.CATCAM != null && T.CATCAM[p.CATCAM]) { title += ' – ' + T.CATCAM[p.CATCAM][0]; rows.push([`Categoria (CATCAM=${esc(p.CATCAM)})`, T.CATCAM[p.CATCAM][1]]); }
    if (p.MARSYS != null) rows.push(['Sistema (MARSYS)', `${esc(p.MARSYS)} = ${T.MARSYS[p.MARSYS] || '?'}`]);
    if (p.BCNSHP != null) rows.push(['Forma (BCNSHP)', `${esc(p.BCNSHP)} = ${T.BCNSHP[p.BCNSHP] || '?'}`]);
    if (p.BOYSHP != null) rows.push(['Forma (BOYSHP)', `${esc(p.BOYSHP)} = ${T.BOYSHP[p.BOYSHP] || '?'}`]);
    if (p.TOPSHP != null) rows.push(['Forma (TOPSHP)', `${esc(p.TOPSHP)} = ${T.TOPSHP[p.TOPSHP] || '?'}`]);
    if (k === 'LIGHTS') rows.push(...lightRows(p));
    else if (p.COLOUR) rows.push(['Colore (COLOUR)', list(p.COLOUR).map(c => `${c} = ${T.COLOUR[c] || '?'}`).join(', ') + (p.COLPAT ? ', ' + dec('COLPAT', p.COLPAT).join(', ') : '')]);
    if (k !== 'LIGHTS' && p.HEIGHT != null) rows.push(['Altezza (HEIGHT)', `${num(p.HEIGHT)} m`]);
    if (p.VALSOU != null) rows.push(['Profondità (VALSOU)', `${num(p.VALSOU)} m d'acqua sopra ${k === 'WRECKS' ? 'il relitto' : k === 'UWTROC' ? 'lo scoglio' : 'l\'ostruzione'}`]);
    if (p.WATLEV != null) rows.push(['Livello (WATLEV)', `${esc(p.WATLEV)} = ${T.WATLEV[p.WATLEV] || '?'}`]);
    if (p.CATOBS != null) rows.push(['Tipo (CATOBS)', `${esc(p.CATOBS)} = ${T.CATOBS[p.CATOBS] || '?'}`]);
    if (p.CATWRK != null) rows.push(['Tipo (CATWRK)', `${esc(p.CATWRK)} = ${T.CATWRK[p.CATWRK] || '?'}`]);
    if (p.INFORM) rows.push(['Note (INFORM)', esc(p.INFORM)]);
    if (p.NINFOM) rows.push(['Note (NINFOM)', esc(p.NINFOM)]);
    return { title, name: p.OBJNAM || p.NOBJNM || '', rows };
  }
  const ORDER = k => /^(BCN|BOY)/.test(k) ? 0 : k === 'TOPMAR' ? 1 : k === 'DAYMAR' ? 2 : k === 'LIGHTS' ? 3 : k === 'FOGSIG' ? 4 : 5;
  function popupHtml(group) {
    group.sort((a, b) => ORDER(a._lyr) - ORDER(b._lyr) || (a.properties.SECTR1 || 0) - (b.properties.SECTR1 || 0));
    const cells = new Map((bundle.cells || []).map(c => [c.name, c]));
    let html = '<div class="sm">', first = true;
    group.forEach(f => {
      const d = featureRows(f);
      html += `${first ? '' : '<hr>'}<b class="smt">${esc(d.title)}</b>` + (d.name ? `<div class="smn">${esc(d.name)}</div>` : '') +
        d.rows.map(r => `<div class="smr"><span>${r[0]}</span><div>${r[1]}</div></div>`).join('');
      const raw = Object.keys(f.properties).filter(k => k !== '_cell').sort().map(k => `<tr><td>${esc(k)}</td><td>${esc(JSON.stringify(f.properties[k]))}</td></tr>`).join('');
      html += `<details><summary>Attributi S-57 (${esc(f._lyr)})</summary><table>${raw}</table></details>`;
      first = false;
    });
    const c = cells.get(group[0].properties._cell);
    html += `<p class="smw">Fonte: ENC ${esc(group[0].properties._cell || '')}` + (c ? `, edizione ${esc(c.edition != null ? c.edition : '?')}, aggiornamento ${esc(c.update != null ? c.update : '?')}${c.update_date ? ' del ' + esc(c.update_date) : ''}` : '') +
      '. Verifica che la carta sia aggiornata con gli ultimi Avvisi ai Naviganti.</p></div>';
    return html;
  }

  /* ---------- Visualizzazione ---------- */
  function attach(map, opts) {
    ['encArea', 'encLine', 'encPt'].forEach((n, i) => { if (!map.getPane(n)) map.createPane(n).style.zIndex = [250, 260, 420][i]; });
    const rArea = L.canvas({ pane: 'encArea' }), rLine = L.canvas({ pane: 'encLine' }), rPt = L.canvas({ pane: 'encPt', tolerance: 6 });
    const group = L.layerGroup();
    const fc = k => ({ type: 'FeatureCollection', features: feats(k) });
    function depthStyle(f) {
      const p = f.properties, need = opts.need(), d1 = p.DRVAL1 != null ? +p.DRVAL1 : null;
      let c = '#e9f4fb', o = 0.35;
      if (d1 == null) { c = '#c7c7c7'; o = 0.4; }
      else if (d1 < 0) { c = '#b8c99a'; o = 0.7; }
      else if (d1 < need) { c = '#5aa1dd'; o = 0.55; }
      else if (d1 < Math.max(need * 2, 5)) { c = '#a9d0f0'; o = 0.45; }
      return { renderer: rArea, stroke: false, fillColor: c, fillOpacity: o, interactive: false };
    }
    function pointStyle(f) {
      const p = f.properties, k = f._lyr, col = list(p.COLOUR), c0 = CSS[col[0]] || '#888';
      if (k === 'LIGHTS') return { radius: 3.5, color: '#c000c0', weight: 1.5, fillColor: CSS[col[0]] || '#e254ff', fillOpacity: 1 };
      if (/^(OBSTRN|WRECKS|UWTROC)$/.test(k)) return { radius: 4.5, color: '#111', weight: 1.5, dashArray: '2 2', fillOpacity: 0 };
      if (k === 'TOPMAR' || k === 'DAYMAR' || k === 'FOGSIG') return { radius: 2, stroke: false, fillColor: c0, fillOpacity: 0.9 };
      const ring = /CAR/.test(k) ? '#111' : /ISD/.test(k) ? '#e0262b' : /SAW/.test(k) ? '#fff' : '#222';
      return { radius: /^BOY/.test(k) ? 6 : 5, color: ring, weight: 2, fillColor: c0, fillOpacity: 1 };
    }
    function render() {
      group.clearLayers();
      if (!bundle || !opts.isOn()) { map.removeLayer(group); return; }
      L.geoJSON(fc('DEPARE'), { style: depthStyle }).addTo(group);
      L.geoJSON(fc('DRGARE'), { style: f => Object.assign(depthStyle(f), { stroke: true, color: '#2f6fb5', weight: 1, dashArray: '6 4' }) }).addTo(group);
      L.geoJSON(fc('LNDARE'), { style: { renderer: rArea, color: '#8a7a4a', weight: 1, fillColor: '#e8d9a8', fillOpacity: 0.85, interactive: false } }).addTo(group);
      L.geoJSON(fc('FAIRWY'), { style: { renderer: rArea, color: '#7a3db8', weight: 1.5, dashArray: '10 6', fillOpacity: 0.04, interactive: false } }).addTo(group);
      ['COALNE', 'SLCONS', 'PONTON'].forEach(k => L.geoJSON(fc(k), { style: { renderer: rLine, color: '#2b2b2b', weight: k === 'COALNE' ? 1.2 : 2.2, fillColor: '#9b8f75', fillOpacity: 0.8, interactive: false } }).addTo(group));
      L.geoJSON(fc('NAVLNE'), { style: { renderer: rLine, color: '#222', weight: 1.5, dashArray: '8 6', interactive: false } }).addTo(group);
      L.geoJSON(fc('RECTRC'), { style: { renderer: rLine, color: '#6b2c91', weight: 2, dashArray: '14 6', interactive: false } }).addTo(group);
      ['OBSTRN', 'WRECKS', 'UWTROC'].forEach(k => L.geoJSON({ type: 'FeatureCollection', features: feats(k).filter(f => !/Point/.test(f.geometry.type)) },
        { style: { renderer: rArea, color: '#111', weight: 1.2, dashArray: '3 3', fillColor: '#5aa1dd', fillOpacity: 0.3, interactive: false } }).addTo(group));
      const pts = [];
      POINT_LAYERS.forEach(k => feats(k).forEach(f => { if (f.geometry.type === 'Point') pts.push(f); }));
      pts.sort((a, b) => (a._lyr === 'LIGHTS') - (b._lyr === 'LIGHTS'));
      pts.forEach(f => {
        const [lng, lat] = f.geometry.coordinates;
        L.circleMarker([lat, lng], Object.assign({ renderer: rPt, bubblingMouseEvents: false }, pointStyle(f)))
          .on('click', ev => {
            if (opts.isPicking && opts.isPicking()) { map.fire('click', { latlng: ev.latlng }); return; }
            /* tutti gli oggetti S-57 dello stesso segnale: struttura, miraglio, fanale (anche a settori), nebbia */
            const near = pts.filter(o => { const [x, y] = o.geometry.coordinates; return Math.abs(y - lat) < 0.0002 && Math.abs((x - lng) * Math.cos(lat * Math.PI / 180)) < 0.0002; });
            L.popup({ maxWidth: 320, className: 'smpop' }).setLatLng([lat, lng]).setContent(popupHtml(near)).openOn(map);
          }).addTo(group);
      });
      group.addTo(map);
    }
    return { render };
  }

  /* ---------- Maschere per il calcolo della rotta ----------
     box: riquadro della griglia; toPx(lat,lng) -> [x,y]; mpp: metri per pixel; need: pescaggio + margine (m). */
  function routingMasks(bounds, W, H, toPx, mpp, need) {
    if (!bundle) return null;
    const hit = f => f._bb[0] <= bounds.e && f._bb[2] >= bounds.w && f._bb[1] <= bounds.n && f._bb[3] >= bounds.s;
    const sel = (k, test) => feats(k).filter(f => hit(f) && (!test || test(f.properties)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ring = r => r.forEach((c, i) => { const [x, y] = toPx({ lat: c[1], lng: c[0] }); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const lines = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
    const points = g => g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [];
    const read = () => { const d = ctx.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0; ctx.clearRect(0, 0, W, H); return m; };
    const fill = fs => fs.forEach(f => polys(f.geometry).forEach(p => { ctx.beginPath(); p.forEach(r => { ring(r); ctx.closePath(); }); ctx.fill('evenodd'); }));
    const stroke = (fs, wPx) => { ctx.lineWidth = wPx; fs.forEach(f => lines(f.geometry).forEach(l => { ctx.beginPath(); ring(l); ctx.stroke(); })); };
    const dots = (fs, rPx) => fs.forEach(f => points(f.geometry).forEach(c => { const [x, y] = toPx({ lat: c[1], lng: c[0] }); ctx.beginPath(); ctx.arc(x, y, rPx, 0, 2 * Math.PI); ctx.fill(); }));

    // copertura delle celle (M_COVR); in mancanza, l'insieme di aree di profondità e terra
    let covF = sel('M_COVR');
    if (!covF.length) covF = sel('DEPARE').concat(sel('DRGARE'), sel('LNDARE'));
    if (!covF.length) return null;
    fill(covF); const cov = read();
    let covered = 0; for (let i = 0; i < cov.length; i++) covered += cov[i];
    if (!covered) return null;
    // tutta l'acqua (qualsiasi profondità) e acqua abbastanza profonda per il pescaggio
    fill(sel('DEPARE').concat(sel('DRGARE'))); const wetAll = read();
    const deepEnough = p => p.DRVAL1 != null && +p.DRVAL1 >= need;
    fill(sel('DEPARE', deepEnough).concat(sel('DRGARE', deepEnough))); const deep = read();
    // terra, opere costiere, pontili: aree piene e contorni (minimo 4 m)
    fill(sel('LNDARE').concat(sel('SLCONS'), sel('PONTON')));
    stroke(sel('LNDARE').concat(sel('COALNE'), sel('SLCONS'), sel('PONTON')), Math.max(1.5, 4 / mpp));
    dots(sel('LNDARE'), Math.max(1.5, 10 / mpp));
    const land = read();
    // ostacoli pericolosi per il pescaggio: profondità ignota o minore, oppure emergenti
    const danger = p => p.VALSOU == null || +p.VALSOU < need || [1, 2, 4, 5, 7].includes(+p.WATLEV);
    const obs = sel('OBSTRN', danger).concat(sel('WRECKS', danger), sel('UWTROC', danger));
    fill(obs); stroke(obs, Math.max(1.5, 20 / mpp)); dots(obs, Math.max(1.5, 30 / mpp));
    const pts = []; ['BCNLAT', 'BCNCAR', 'BCNISD', 'BCNSAW', 'BCNSPP'].forEach(k => pts.push(...sel(k)));
    dots(pts, Math.max(0.75, 8 / mpp));   // pali delle mede
    const obst = read();
    // rotte raccomandate e allineamenti (fascia di 60 m), canali navigabili
    stroke(sel('NAVLNE').concat(sel('RECTRC')), Math.max(3, 60 / mpp)); fill(sel('FAIRWY'));
    const pref = read();
    let anyPref = 0; for (let i = 0; i < pref.length; i++) anyPref |= pref[i];
    const ok = new Uint8Array(W * H), wet = new Uint8Array(W * H);
    for (let i = 0; i < ok.length; i++) {
      wet[i] = wetAll[i] && !land[i] ? 1 : 0;
      ok[i] = deep[i] && !land[i] && !obst[i] ? 1 : 0;
    }
    return { cov, ok, wet, pref: anyPref ? pref : null, fraction: covered / cov.length,
      cells: [...new Set(covF.map(f => f.properties._cell))] };
  }

  root.ENC = { whenReady: () => readyP, load, importFile, clear, info, attach, routingMasks, decode: featureRows, tables: T, loaded: () => !!bundle };
})(typeof window !== 'undefined' ? window : globalThis);
