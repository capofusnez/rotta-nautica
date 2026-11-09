'use strict';
/* Ispettore dei segnali nautici: toccando un faro, fanale, boa, briccola o meda sulla carta
   si apre una scheda con il tipo di segnale, il significato (sistema IALA A), la luce decodificata,
   la struttura, il miraglio e il nome. I dati arrivano da OpenStreetMap / OpenSeaMap (Overpass). */
(function (root) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => String(v).replace('.', ',');

  const TYPES = {
    light_major: 'Faro', light_minor: 'Fanale', light_vessel: 'Battello faro', light_float: 'Fanale galleggiante',
    beacon_lateral: 'Meda laterale (palo / briccola)', buoy_lateral: 'Boa laterale',
    beacon_cardinal: 'Meda cardinale', buoy_cardinal: 'Boa cardinale',
    beacon_isolated_danger: 'Meda di pericolo isolato', buoy_isolated_danger: 'Boa di pericolo isolato',
    beacon_safe_water: 'Meda di acque sicure (spesso una briccola)', buoy_safe_water: 'Boa di acque sicure',
    beacon_special_purpose: 'Meda speciale', buoy_special_purpose: 'Boa speciale',
    pile: 'Palo / briccola', mooring: 'Ormeggio', landmark: 'Punto cospicuo', harbour: 'Porto',
    rock: 'Scoglio', wreck: 'Relitto', obstruction: 'Ostruzione', bridge: 'Ponte', notice: 'Cartello',
    anchorage: 'Ancoraggio', small_craft_facility: 'Servizi per la nautica', signal_station_warning: 'Stazione di segnalazione',
    signal_station_traffic: 'Stazione di controllo del traffico', fog_signal: 'Segnale da nebbia', radar_transponder: 'Risponditore radar',
    cable_submarine: 'Cavo sottomarino', pipeline_submarine: 'Condotta sottomarina', restricted_area: 'Zona regolamentata',
    berth: 'Posto di ormeggio', gate: 'Porta / chiusa', dam: 'Diga', fairway: 'Canale navigabile', recommended_track: 'Rotta raccomandata'
  };
  const MEANING = {
    port: ['Lato sinistro (rosso)', 'Sistema IALA A: entrando dal mare in porto o in canale si lascia a <b>sinistra</b> (babordo). Uscendo verso il mare resta a dritta.'],
    starboard: ['Lato dritto (verde)', 'Sistema IALA A: entrando dal mare in porto o in canale si lascia a <b>dritta</b> (tribordo). Uscendo verso il mare resta a sinistra.'],
    preferred_channel_port: ['Biforcazione, canale principale a sinistra', 'Verde con fascia rossa: entrando dal mare, il canale principale prosegue a sinistra del segnale.'],
    preferred_channel_starboard: ['Biforcazione, canale principale a dritta', 'Rosso con fascia verde: entrando dal mare, il canale principale prosegue a dritta del segnale.'],
    north: ['Cardinale Nord', 'Acque sicure a <b>nord</b> del segnale, pericolo a sud.'],
    east: ['Cardinale Est', 'Acque sicure a <b>est</b> del segnale, pericolo a ovest.'],
    south: ['Cardinale Sud', 'Acque sicure a <b>sud</b> del segnale, pericolo a nord.'],
    west: ['Cardinale Ovest', 'Acque sicure a <b>ovest</b> del segnale, pericolo a est.']
  };
  const TYPE_NOTE = {
    isolated_danger: 'Pericolo isolato proprio sotto il segnale, acque navigabili tutt\'intorno: passare al largo.',
    safe_water: 'Acque navigabili tutt\'intorno (in mare segna l\'atterraggio o il centro del canale). In laguna OpenStreetMap usa spesso questo tipo per le briccole che delimitano i canali.',
    special_purpose: 'Segnale giallo: indica zone o strutture particolari (aree riservate, condotte, campi boe), non il lato del canale.',
    rock: 'Pericolo per la navigazione.', wreck: 'Pericolo per la navigazione.', obstruction: 'Pericolo per la navigazione.'
  };
  const COLOURS = { red: 'rosso', green: 'verde', white: 'bianco', yellow: 'giallo', black: 'nero', orange: 'arancione',
    blue: 'blu', grey: 'grigio', brown: 'marrone', amber: 'ambra', violet: 'viola', magenta: 'magenta', pink: 'rosa' };
  const PATTERNS = { horizontal: 'a bande orizzontali', vertical: 'a bande verticali', diagonal: 'a bande diagonali', squared: 'a scacchi', stripes: 'a strisce', border: 'con bordo' };
  const SHAPES = {
    stake: 'asta / palo', pole: 'palo', perch: 'pertica', withy: 'frasca', tower: 'torretta', lattice: 'traliccio',
    pile: 'palo (briccola)', cairn: 'mucchio di pietre', buoyant: 'galleggiante', conical: 'conica', can: 'cilindrica',
    spherical: 'sferica', pillar: 'a pilastro', spar: 'ad asta', barrel: 'a botte', super_buoy: 'grande boa', ice_buoy: 'boa da ghiaccio'
  };
  const TOPMARKS = {
    'cylinder': 'cilindro (lato sinistro)', 'cone, point up': 'cono con la punta in alto (lato dritto)', 'cone, point down': 'cono con la punta in basso',
    '2 cones up': 'due coni con le punte in alto (cardinale Nord)', '2 cones down': 'due coni con le punte in basso (cardinale Sud)',
    '2 cones base together': 'due coni uniti per la base (cardinale Est)', '2 cones point together': 'due coni uniti per la punta (cardinale Ovest)',
    '2 spheres': 'due sfere (pericolo isolato)', 'sphere': 'sfera (acque sicure)', 'x-shape': 'croce di Sant\'Andrea (speciale)',
    'board': 'tabella', 'square': 'quadrato', 'rectangle, horizontal': 'rettangolo orizzontale', 'rectangle, vertical': 'rettangolo verticale',
    'triangle, point up': 'triangolo con la punta in alto', 'triangle, point down': 'triangolo con la punta in basso', 'flag': 'bandiera'
  };
  const colourList = v => String(v || '').split(';').filter(Boolean).map(c => COLOURS[c] || c);

  /* ---------- Luci ---------- */
  const CHAR = {
    F: ['F', 'Luce fissa', 'luce fissa continua'], Fl: ['Fl', 'A lampi', 'lampo'], LFl: ['LFl', 'A lampi lunghi', 'lampo lungo (almeno 2 s)'],
    Q: ['Q', 'Scintillante', 'scintillazione (50-60 al minuto)'], VQ: ['VQ', 'Scintillante rapida', 'scintillazione (100-120 al minuto)'],
    UQ: ['UQ', 'Scintillante ultrarapida', 'scintillazione (oltre 160 al minuto)'], IQ: ['IQ', 'Scintillante interrotta', 'scintillazione'],
    IVQ: ['IVQ', 'Scintillante rapida interrotta', 'scintillazione'], IUQ: ['IUQ', 'Ultrarapida interrotta', 'scintillazione'],
    Iso: ['Iso', 'Isofase', 'luce e buio di uguale durata'], Oc: ['Oc', 'Intermittente (a eclissi)', 'eclissi'],
    Mo: ['Mo', 'Codice Morse', 'segnale Morse'], FFl: ['FFl', 'Fissa con lampi', 'lampo'], Al: ['Al', 'Alternata', 'cambio di colore']
  };
  const TAGCHAR = { F: 'F', Fl: 'Fl', LFl: 'LFl', Q: 'Q', VQ: 'VQ', UQ: 'UQ', IQ: 'IQ', IVQ: 'IVQ', IUQ: 'IUQ', Iso: 'Iso', Oc: 'Oc', Mo: 'Mo', FFl: 'FFl', 'Al.Fl': 'Al.Fl', 'Al.Oc': 'Al.Oc', 'Al.LFl': 'Al.LFl', 'Q+LFl': 'Q+LFl', 'VQ+LFl': 'VQ+LFl' };
  const LCOL = { W: 'bianca', R: 'rossa', G: 'verde', Y: 'gialla', Bu: 'blu', Or: 'arancione', Vi: 'viola' };
  const COL2ABBR = { white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu', orange: 'Or', violet: 'Vi' };

  /* Legge una caratteristica scritta in forma abbreviata, es. "Fl(2)G.7s8m4M", "Fl.WG.2s5m4/2M", "Q(6)+LFl.15s". */
  function parseLight(str) {
    let s = String(str || '').replace(/\s+/g, '');
    const L = {};
    let m = s.match(/^(Al\.)?((?:IVQ|IUQ|IQ|VQ|UQ|Q|LFl|FFl|Fl|Iso|Oc|Mo|F)(?:\([^)]*\))?(?:\+(?:LFl|Fl))?)/);
    if (!m) return null;
    L.alt = !!m[1];
    const core = m[2];
    s = s.slice(m[0].length);
    const cm = core.match(/^([A-Za-z]+)(?:\(([^)]*)\))?(?:\+([A-Za-z]+))?/);
    L.char = cm[1]; L.group = cm[2] || ''; L.plus = cm[3] || '';
    s = s.replace(/^\./, '');
    m = s.match(/^((?:Bu|Or|Vi|W|R|G|Y)+)\.?/);
    if (m) { L.colours = m[1].match(/Bu|Or|Vi|W|R|G|Y/g); s = s.slice(m[0].length); }
    m = s.match(/^(\d+(?:[.,]\d+)?)s\.?/); if (m) { L.period = m[1]; s = s.slice(m[0].length); }
    m = s.match(/^(\d+(?:[.,]\d+)?)m\.?/); if (m) { L.height = m[1]; s = s.slice(m[0].length); }
    m = s.match(/^(\d+(?:[.,]\d+)?(?:[/-]\d+(?:[.,]\d+)?)*)M/); if (m) { L.range = m[1]; }
    return L;
  }

  /* Ricostruisce la luce dai tag OpenSeaMap. */
  function lightFromTags(t, pre) {
    const g = k => t[pre + k];
    if (!g('character') && !g('colour') && !g('period') && !g('range')) return null;
    const raw = g('character') || '';
    const p = parseLight(raw) || {};
    const L = {
      char: p.char || raw.replace(/^Al\./, '') || '', alt: p.alt || /^Al\./.test(raw), plus: p.plus || '',
      group: g('group') || p.group || '',
      colours: g('colour') ? String(g('colour')).split(';').map(c => COL2ABBR[c] || c) : (p.colours || []),
      period: g('period') || p.period || '', height: g('height') || p.height || '', range: g('range') || p.range || '',
      start: g('sector_start'), end: g('sector_end'), orient: g('orientation'), sequence: g('sequence'), category: g('category'), visibility: g('visibility')
    };
    return L;
  }
  function lightAbbr(L) {
    const c = (L.alt ? 'Al.' : '') + (L.char || '?') + (L.group ? '(' + L.group + ')' : '') + (L.plus ? '+' + L.plus : '');
    return [c, (L.colours || []).join('') || '', L.period ? L.period + 's' : '', L.height ? L.height + 'm' : '', L.range ? L.range + 'M' : '']
      .filter(Boolean).join(' ');
  }
  function lightText(L) {
    const out = [], ch = CHAR[L.char];
    const cols = (L.colours || []).map(c => LCOL[c] || COLOURS[c] || c);
    const colTxt = cols.length > 1 ? (L.alt ? 'alternata ' + cols.join(' / ') : cols.join(', ') + ' (a settori)') : cols[0] || '';
    let main = 'Luce ' + colTxt;
    if (ch) {
      const groups = String(L.group || '').split('+').filter(Boolean);
      if (L.char === 'F') main += ', fissa';
      else if (L.char === 'Iso') main += ', isofase (luce e buio di uguale durata)';
      else if (L.char === 'Mo') main += `, lettera "${esc(L.group)}" in codice Morse`;
      else if (groups.length > 1) main += `, ${ch[1].toLowerCase()} a gruppi composti di ${groups.join(' + ')}`;
      else if (groups.length === 1 && +groups[0] > 1) main += `, a gruppi di ${groups[0]} ${L.char === 'Oc' ? 'eclissi' : L.char === 'Fl' ? 'lampi' : L.char === 'LFl' ? 'lampi lunghi' : 'scintillazioni'}`;
      else if (/^(Fl|LFl|Oc)$/.test(L.char) && L.period) { main += `, un ${ch[2].replace(/ \(.*\)/, '')} ogni ${num(L.period)} secondi`; L._p = 1; }
      else main += ', ' + ch[1].toLowerCase();
      if (L.plus) main += ` seguite da un ${CHAR[L.plus] ? CHAR[L.plus][2] : L.plus}`;
    } else if (L.char) main += ', caratteristica ' + esc(L.char);
    if (L.period && !L._p) main += `, ripetuti ogni ${num(L.period)} secondi`;
    out.push(main.replace('Luce ,', 'Luce') + '.');
    if (L.height) out.push(`Elevazione: ${num(L.height)} m sul livello medio del mare.`);
    if (L.range) {
      const r = String(L.range).split(/[/-]/), km = v => (parseFloat(String(v).replace(',', '.')) * 1.852).toFixed(1).replace('.', ',');
      out.push(r.length > 1 && cols.length === r.length
        ? 'Portata nominale: ' + r.map((v, i) => `${num(v)} miglia (${cols[i]})`).join(', ') + '.'
        : `Portata nominale: ${num(r[0])} miglia nautiche (circa ${km(r[0])} km).`);
    }
    if (L.start != null && L.end != null) out.push(`Settore visibile dal mare tra ${num(L.start)}° e ${num(L.end)}° (rilevamenti verso la luce).`);
    if (L.orient) out.push(`Luce direzionale orientata a ${num(L.orient)}°.`);
    if (L.sequence) out.push(`Sequenza luce/buio (secondi): ${esc(L.sequence)}.`);
    return out;
  }

  /* ---------- Scheda del segnale ---------- */
  function describe(t) {
    const type = t['seamark:type'] || '';
    const k = s => t['seamark:' + type + ':' + s];
    const name = t['seamark:name'] || t.name || k('name') || '';
    const ref = t['seamark:light:reference'] || k('reference') || t.ref || '';
    let title = TYPES[type] || (type ? type.replace(/_/g, ' ') : 'Segnale nautico');
    const briccola = (type === 'mooring' && /^(dolphin|pile)$/.test(t['seamark:mooring:category'] || '')) || (!type && t.man_made === 'dolphin');
    if (briccola) title = 'Briccola (palo)';
    const rows = [];
    const cat = k('category');
    if (briccola) rows.push(['Significato', 'Palo o gruppo di pali (in OpenStreetMap: palo d\'ormeggio "dolphin"). In laguna e alle foci le file di briccole delimitano i canali navigabili: si naviga tra le due file.']);
    else if (cat && MEANING[cat]) { title += ' – ' + MEANING[cat][0].toLowerCase(); rows.push(['Significato', MEANING[cat][1]]); }
    else {
      const note = Object.keys(TYPE_NOTE).find(n => type.endsWith(n) || type === n);
      if (note) rows.push(['Significato', TYPE_NOTE[note]]);
      if (cat && !MEANING[cat]) rows.push(['Categoria', esc(cat.replace(/_/g, ' '))]);
    }
    /* luci: principale e settori numerati */
    const lights = [];
    const main = lightFromTags(t, 'seamark:light:');
    if (main) lights.push(main);
    for (let i = 1; i <= 12; i++) { const L = lightFromTags(t, `seamark:light:${i}:`); if (L) lights.push(L); }
    if (!main && t['seamark:light:height']) rows.push(['Elevazione luci', `${num(t['seamark:light:height'])} m sul livello medio del mare.`]);
    lights.forEach((L, i) => {
      if (!L.char && lights[0] && lights[0].char) L.char = lights[0].char;
      if (!L.period && lights[0]) L.period = lights[0].period;
      rows.push([lights.length > 1 ? `Luce ${i + 1}` : 'Luce', `<code>${esc(lightAbbr(L))}</code><br>` + lightText(L).join('<br>')]);
    });
    /* struttura */
    const st = [];
    if (k('shape')) st.push('forma ' + (SHAPES[k('shape')] || esc(k('shape'))));
    if (k('colour')) st.push('colore ' + colourList(k('colour')).join(' e ') + (k('colour_pattern') ? ' ' + (PATTERNS[k('colour_pattern')] || k('colour_pattern')) : ''));
    const h = k('height') || t.height;
    if (h) st.push(`altezza ${num(h)} m`);
    if (k('material')) st.push('materiale ' + esc(k('material')));
    if (t['seamark:radar_reflector'] || t['seamark:radar_reflector:category']) st.push('con riflettore radar');
    if (st.length) rows.push(['Struttura', st.join(', ') + '.']);
    const tm = t['seamark:topmark:shape'];
    if (tm) rows.push(['Miraglio', (TOPMARKS[tm] || esc(tm)) + (t['seamark:topmark:colour'] ? ', ' + colourList(t['seamark:topmark:colour']).join(' e ') : '') + '.']);
    else if (/lateral|cardinal|danger|safe_water/.test(type)) rows.push(['Miraglio', 'non indicato nei dati.']);
    const fog = t['seamark:fog_signal:category'];
    if (fog) rows.push(['Segnale da nebbia', esc(fog) + (t['seamark:fog_signal:period'] ? `, ogni ${num(t['seamark:fog_signal:period'])} s` : '')]);
    if (ref) rows.push(['Riferimento', esc(ref)]);
    return { title, name, rows };
  }

  function popupHtml(tags, lat, lng) {
    const d = describe(tags);
    const raw = Object.keys(tags).filter(k => k[0] !== '@' && typeof tags[k] !== 'object').sort().map(k => `<tr><td>${esc(k)}</td><td>${esc(tags[k])}</td></tr>`).join('');
    return `<div class="sm"><b class="smt">${esc(d.title)}</b>` +
      (d.name ? `<div class="smn">${esc(d.name)}</div>` : '') +
      d.rows.map(r => `<div class="smr"><span>${r[0]}</span><div>${r[1]}</div></div>`).join('') +
      `<div class="smr"><span>Posizione</span><div>${lat.toFixed(5)}, ${lng.toFixed(5)}</div></div>` +
      `<details><summary>Dati OpenSeaMap</summary><table>${raw}</table></details>` +
      `<p class="smw">Dati OpenStreetMap/OpenSeaMap dal file locale nautica_locale.geojson: possono essere incompleti o non aggiornati. Fanno fede le carte e gli elenchi fari ufficiali.</p></div>`;
  }

  /* ---------- Simboli dei segnali (dal file locale) ---------- */
  const CSS = { red: '#e0262b', green: '#1a9a3a', yellow: '#f2c200', black: '#111', white: '#fff', orange: '#ff8c00', blue: '#2a5bd7', grey: '#8a8a8a', brown: '#7a5230' };
  function symbol(t) {
    let type = t['seamark:type'] || (t.man_made === 'dolphin' ? 'pile' : '');
    if (type === 'mooring' && /^(dolphin|pile)$/.test(t['seamark:mooring:category'] || '')) type = 'pile';
    const k = s => t['seamark:' + type + ':' + s];
    const cols = String(k('colour') || '').split(';').filter(Boolean), c0 = CSS[cols[0]];
    const cat = k('category') || '';
    const lit = t['seamark:light:colour'] || t['seamark:light:1:colour'] || '';
    const hasLight = !!(t['seamark:light:character'] || t['seamark:light:1:character'] || lit);
    const ring = hasLight ? '#c000c0' : '#222';
    if (/lateral/.test(type)) {
      const col = cat === 'port' ? CSS.red : cat === 'starboard' ? CSS.green : c0 || '#888';
      return { radius: /^buoy/.test(type) ? 6.5 : 5.5, color: ring, weight: 2, fillColor: col, fillOpacity: 1 };
    }
    if (/cardinal/.test(type)) return { radius: 6, color: '#111', weight: 2.5, fillColor: CSS.yellow, fillOpacity: 1 };
    if (/isolated_danger/.test(type)) return { radius: 6, color: CSS.red, weight: 2.5, fillColor: '#111', fillOpacity: 1 };
    if (type === 'buoy_safe_water') return { radius: 6, color: '#fff', weight: 2.5, fillColor: CSS.red, fillOpacity: 1 };
    if (type === 'beacon_safe_water' || type === 'pile') return { radius: 3.5, color: ring, weight: 1.5, fillColor: c0 || CSS.brown, fillOpacity: 1 };
    if (/special_purpose/.test(type)) return { radius: 4.5, color: ring, weight: 1.5, fillColor: c0 || CSS.yellow, fillOpacity: 1 };
    if (type === 'light_major') return { radius: 7, color: '#fff', weight: 2, fillColor: '#c000c0', fillOpacity: 1 };
    if (/^light/.test(type)) return { radius: 4.5, color: '#c000c0', weight: 2, fillColor: CSS[lit.split(';')[0]] || '#e254ff', fillOpacity: 1 };
    if (/^(rock|wreck|obstruction)$/.test(type)) return { radius: 5, color: '#111', weight: 1.5, dashArray: '2 2', fillOpacity: 0 };
    return { radius: 3, color: '#444', weight: 1, fillColor: c0 || '#999', fillOpacity: 0.9 };
  }

  /* ---------- Livello interattivo sulla carta ----------
     opts.nodes(): Promise con i segnali locali [{id, lat, lng, tags}]. Si disegnano solo quelli visibili. */
  function attach(map, opts) {
    if (!map.getPane('smPane')) map.createPane('smPane').style.zIndex = 430;
    const renderer = L.canvas({ pane: 'smPane', tolerance: 8 }), layer = L.layerGroup(), MINZOOM = 12, MAX = 4000;
    let nodes = null, timer = 0;
    function draw() {
      layer.clearLayers();
      if (!nodes || !opts.isOn() || map.getZoom() < MINZOOM) { map.removeLayer(layer); return; }
      const b = map.getBounds().pad(0.2);
      let n = 0;
      for (const e of nodes) {
        if (e.lat < b.getSouth() || e.lat > b.getNorth() || e.lng < b.getWest() || e.lng > b.getEast()) continue;
        if (++n > MAX) break;
        L.circleMarker([e.lat, e.lng], Object.assign({ renderer, bubblingMouseEvents: false }, symbol(e.tags)))
          .on('click', ev => {
            if (opts.isPicking && opts.isPicking()) { map.fire('click', { latlng: ev.latlng }); return; }
            L.popup({ maxWidth: 300, className: 'smpop' }).setLatLng([e.lat, e.lng]).setContent(popupHtml(e.tags, e.lat, e.lng)).openOn(map);
          })
          .addTo(layer);
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
    }
    function refresh() {
      if (nodes) { draw(); return; }
      if (!opts.isOn()) return;
      opts.nodes().then(list => { nodes = list || []; draw(); }).catch(() => { nodes = null; });
    }
    map.on('moveend zoomend', () => { clearTimeout(timer); timer = setTimeout(refresh, 120); });
    return { refresh };
  }

  root.Seamarks = { parseLight, lightFromTags, lightAbbr, lightText, describe, popupHtml, attach, symbol };
})(typeof window !== 'undefined' ? window : globalThis);
