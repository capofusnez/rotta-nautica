'use strict';
(() => {
if (typeof L === 'undefined') {
  window.rnFail && window.rnFail('Libreria della carta (Leaflet) non caricata. Collegati a Internet almeno una volta, poi riapri l\'app.');
  return;
}

/* ---------- Utilità ---------- */
const NM = 1852, R = 6371008.8, RAD = Math.PI / 180, DEG = 180 / Math.PI, KN = 1.943844;
const $ = id => document.getElementById(id);
/* I pulsanti laterali e gli avvisi partono sempre subito sotto la barra degli strumenti, qualunque sia la sua altezza. */
const hudSize = () => { const h = $('hud'); if (h) document.documentElement.style.setProperty('--hudH', h.getBoundingClientRect().bottom + 'px'); };
hudSize(); window.addEventListener('resize', hudSize);
if (window.ResizeObserver && $('hud')) new ResizeObserver(hudSize).observe($('hud'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('rn.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rn.' + k, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } }
};

function dist(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dp = p2 - p1, dl = (b.lng - a.lng) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function brg(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}
function dest(a, bearing, d) {
  const dd = d / R, th = bearing * RAD, p1 = a.lat * RAD, l1 = a.lng * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dd) + Math.cos(p1) * Math.sin(dd) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dd) * Math.cos(p1), Math.cos(dd) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * DEG, lng: ((l2 * DEG + 540) % 360) - 180 };
}
/* scarto laterale in metri: positivo = a dritta della rotta a->b */
function xteCalc(p, a, b) {
  const d13 = dist(a, p) / R, t13 = brg(a, p) * RAD, t12 = brg(a, b) * RAD;
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R;
}
/* distanza in metri da un punto a un segmento (approssimazione piana locale) */
function segDist(p, a, b) {
  const k = Math.cos(p.lat * RAD), m = 111320;
  const ax = (a.lng - p.lng) * k * m, ay = (a.lat - p.lat) * m;
  const bx = (b.lng - p.lng) * k * m, by = (b.lat - p.lat) * m;
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? -(ax * dx + ay * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

const pad2 = n => String(n).padStart(2, '0');
const num1 = v => String(+(+v).toFixed(1)).replace('.', ',');
function fmtDist(m) {
  if (!isFinite(m)) return '--';
  if (m < 370) return Math.round(m) + ' m';
  const n = m / NM;
  return n.toFixed(n < 10 ? 2 : 1) + ' nm';
}
const fmtAng = a => isFinite(a) ? String(Math.round(a) % 360).padStart(3, '0') + '°' : '---°';
function fmtPos(p) {
  if (!p) return '--';
  const f = (v, pl, mi) => {
    const s = v < 0 ? mi : pl; v = Math.abs(v);
    const d = Math.floor(v), m = (v - d) * 60;
    return d + '°' + m.toFixed(3).padStart(6, '0') + "' " + s;
  };
  return f(p.lat, 'N', 'S') + '  ' + f(p.lng, 'E', 'W');
}
function fmtDur(s) {
  if (!isFinite(s) || s < 0 || s > 99 * 3600) return '--';
  return Math.floor(s / 3600) + ':' + pad2(Math.floor((s % 3600) / 60));
}
function fmtClock(ms) {
  if (!isFinite(ms)) return '--:--';
  const d = new Date(ms), n = new Date();
  const t = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  return d.toDateString() === n.toDateString() ? t : t + ' +1g';
}

/* ---------- Stato ---------- */
const DEF = { xte: 0.1, arr: 80, spd: 0, wind: 25, hz: 300, plan: 5, anc: 40, coast: 300, draft: 1, ukc: 0.5, enc: true,
  mute: false, night: false, base: 'osm', sea: true, bathy: false, track: true, follow: true,
  boat: 'motore', hp: 40, len: 6, lic: 'none', vlim: 'auto', ce: 'ce', pref: 1, pkg: 'all', pkgWifi: true };
const S = {
  set: Object.assign({}, DEF, store.get('set', {})),
  route: store.get('route', { start: null, via: [], dest: null }),
  hazards: store.get('hazards', []),
  saved: store.get('routes', []),
  track: store.get('track', []).map(a => ({ lat: a[0], lng: a[1], t: a[2] })),
  trip: store.get('trip', null) || { dist: 0, t0: null, max: 0 },
  view: store.get('view', { c: [42.5, 12.5], z: 7 }),
  pos: null, sogS: null, active: false, leg: 1, legFrom: null,
  pick: null, anchor: null, mob: null, wx: null, wxT: 0,
  sim: null, simBackup: null, watch: null, gpsOn: false, lastFix: 0, centered: false,
  tab: null, results: [], ctx: null, mobTap: 0, grids: [], waterOn: false
};
const wps = () => [S.route.start, ...(S.route.path || S.route.via), S.route.dest].filter(Boolean);
const userPts = () => [S.route.start, ...S.route.via, S.route.dest].filter(Boolean);
const legFrom = w => (S.leg === 1 && S.legFrom) ? S.legFrom : w[S.leg - 1];

/* ---------- Carta ---------- */
const map = L.map('map', { zoomControl: false, worldCopyJump: true, maxZoom: 19 })
  .setView(S.view.c, S.view.z);
map.attributionControl.setPosition('bottomleft');
const base = {
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, zIndex: 1, crossOrigin: true, attribution: '© OpenStreetMap' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, zIndex: 1, attribution: 'Esri' })
};
const sea = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, zIndex: 3, attribution: 'OpenSeaMap' });
const bathy = L.tileLayer.wms('https://ows.emodnet-bathymetry.eu/wms', {
  layers: 'emodnet:mean_multicolour', format: 'image/png', transparent: true, opacity: 0.6, zIndex: 2, className: 'bathy', attribution: 'EMODnet Bathymetry'
});

const routeLine = L.polyline([], { color: '#e254ff', weight: 4, opacity: .85, dashArray: '10 8' }).addTo(map);
const legLine = L.polyline([], { color: '#e254ff', weight: 6, opacity: .95 }).addTo(map);
const trackLine = L.polyline([], { color: '#ff9f1c', weight: 4, opacity: .95 }).addTo(map);
const toTgtLine = L.polyline([], { color: '#35c8ff', weight: 2, dashArray: '2 6' }).addTo(map);
const predLine = L.polyline([], { color: '#ffffff', weight: 2, opacity: .9 }).addTo(map);
const wpLayer = L.layerGroup().addTo(map);
const hzLayer = L.layerGroup().addTo(map);
const ancLayer = L.layerGroup().addTo(map);
const mobLayer = L.layerGroup().addTo(map);
const boat = L.marker([0, 0], {
  icon: L.divIcon({
    className: '', iconSize: [34, 44], iconAnchor: [17, 22],
    html: '<div id="boat"><svg viewBox="-14 -18 28 36" width="34" height="44"><path d="M0-16 L10 14 L0 8 L-10 14Z" fill="#fff" stroke="#07151f" stroke-width="2" stroke-linejoin="round"/></svg></div>'
  }), zIndexOffset: 1000, interactive: false
});

map.on('moveend', () => store.set('view', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
map.on('dragstart', () => { if (S.set.follow) { S.set.follow = false; saveSet(); fabs(); } });
map.on('click', e => {
  if (!S.pick) { if (S.tab) minSheet(true); return; }
  const t = S.pick;
  place(t, e.latlng);
  if (t === 'start' && !S.route.dest) pick('dest');
  else if (t !== 'via') endPick();
});
map.on('contextmenu', e => {
  S.ctx = e.latlng;
  const el = document.createElement('div');
  el.className = 'ctx';
  el.innerHTML = '<button data-act="ctx" data-k="start">Partenza qui</button><button data-act="ctx" data-k="via">Tappa qui</button>' +
    '<button data-act="ctx" data-k="dest">Destinazione qui</button><button data-act="ctx" data-k="hazard">Segna secca / ostacolo</button>';
  L.popup({ closeButton: false }).setLatLng(e.latlng).setContent(el).openOn(map);
});

/* ---------- Google Maps (Map Tiles API ufficiale) ----------
   Serve una chiave API dell'utente (Google Cloud, "Map Tiles API" attiva), salvata solo su questo telefono.
   Le immagini Google non vengono salvate per l'uso senza rete: le condizioni d'uso non lo consentono. */
const GKEY = 'rn.gkey', GT = { gmap: 'roadmap', gsat: 'satellite' };
const gKey = () => { try { return localStorage.getItem(GKEY) || ''; } catch (e) { return ''; } };
const gLayers = {};
let gAttrT = 0;
async function gSession(type) {
  const key = gKey();
  if (!key) throw new Error('Inserisci la chiave API di Google nella scheda Carta');
  const sk = 'rn.gsess.' + type;
  try { const c = JSON.parse(localStorage.getItem(sk) || 'null'); if (c && c.key === key && c.expiry * 1000 > Date.now() + 3600e3) return c.session; } catch (e) { /* ignora */ }
  const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: GT[type], language: 'it-IT', region: 'IT' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.session) throw new Error('Google ha rifiutato la chiave: ' + ((j.error && j.error.message) || r.status) + '. Controlla che la "Map Tiles API" sia attiva');
  try { localStorage.setItem(sk, JSON.stringify({ key, session: j.session, expiry: +j.expiry })); } catch (e) { /* ignora */ }
  return j.session;
}
async function gLayer(type) {
  if (gLayers[type]) return gLayers[type];
  const session = await gSession(type), key = gKey();
  const lyr = L.tileLayer(`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${encodeURIComponent(key)}`,
    { maxZoom: 21, maxNativeZoom: type === 'gsat' ? 20 : 21, zIndex: 1, attribution: 'Google' });
  /* attribuzione richiesta da Google per la zona visibile */
  const upd = () => {
    clearTimeout(gAttrT);
    gAttrT = setTimeout(async () => {
      if (!map.hasLayer(lyr)) return;
      const b = map.getBounds();
      try {
        const r = await fetch(`https://tile.googleapis.com/tile/v1/viewport?session=${session}&key=${encodeURIComponent(key)}&zoom=${map.getZoom()}&north=${b.getNorth()}&south=${b.getSouth()}&east=${b.getEast()}&west=${b.getWest()}`);
        const j = await r.json();
        if (j.copyright) { map.attributionControl.removeAttribution(lyr.options.attribution); lyr.options.attribution = '<b>Google</b> ' + j.copyright; map.attributionControl.addAttribution(lyr.options.attribution); }
      } catch (e) { /* ignora */ }
    }, 400);
  };
  lyr.on('add', upd); map.on('moveend', upd);
  gLayers[type] = lyr;
  return lyr;
}
function resetBaseRadio(v) { document.querySelectorAll('input[name=base]').forEach(r => { r.checked = r.value === v; }); }
function applyLayers() {
  Object.keys(base).forEach(k => { if (k === S.set.base) { if (!map.hasLayer(base[k])) base[k].addTo(map); } else map.removeLayer(base[k]); });
  Object.keys(gLayers).forEach(k => { if (k !== S.set.base) map.removeLayer(gLayers[k]); });
  if (GT[S.set.base]) {
    const want = S.set.base;
    gLayer(want).then(l => { if (S.set.base === want && !map.hasLayer(l)) l.addTo(map); })
      .catch(e => { toast(e.message); S.set.base = 'osm'; saveSet(); resetBaseRadio('osm'); applyLayers(); });
  }
  if (S.set.sea) { if (!map.hasLayer(sea)) sea.addTo(map); } else map.removeLayer(sea);
  if (S.set.bathy) { if (!map.hasLayer(bathy)) bathy.addTo(map); } else map.removeLayer(bathy);
  if (S.set.track) { if (!map.hasLayer(trackLine)) trackLine.addTo(map); } else map.removeLayer(trackLine);
  seamarkInspector.refresh();
  encView.render();
}
/* carte ENC ufficiali (enc.js): importate sul telefono, se il file manca l'app funziona lo stesso */
let encView = { render() {} };
try { if (window.ENC) encView = ENC.attach(map, { isOn: () => S.set.enc, need: () => S.set.draft + S.set.ukc, isPicking: () => !!S.pick }); }
catch (e) { console.error(e); }
function encStatus() {
  if (!$('encStatus')) return;
  const i = window.ENC && ENC.info();
  $('encStatus').textContent = i
    ? `${i.cells} celle caricate (${i.editions.slice(0, 4).join(', ')}${i.cells > 4 ? '…' : ''}). Profondità colorate per pescaggio ${S.set.draft} m + margine ${S.set.ukc} m.`
    : 'Nessuna carta ENC caricata: il calcolo usa i dati OpenStreetMap/OpenSeaMap.';
  $('bEncClear').hidden = !i;
}
/* scheda dei segnali (seamarks.js): se il file manca l'app funziona lo stesso */
let seamarkInspector = { refresh() {} };
/* i segnali vengono dal file locale: niente rete, disegno immediato */
try { if (window.Seamarks) seamarkInspector = Seamarks.attach(map, { isOn: () => S.set.sea, isPicking: () => !!S.pick, nodes: b => nauticaFor(b).then(D => D.nodes) }); }
catch (e) { console.error(e); }
function applyNight() {
  document.body.classList.toggle('night', !!S.set.night);
  $('themeColor').setAttribute('content', S.set.night ? '#140404' : '#07151f');
}
const saveSet = () => store.set('set', S.set);

/* ---------- Audio, vibrazione, schermo acceso ---------- */
let ac = null, lastBeep = 0, wl = null;
function audio() {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { /* audio non disponibile */ }
  return ac;
}
function beep(freq, dur, when) {
  if (S.set.mute) return;
  const c = audio(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = freq; g.gain.value = 0.15;
  o.connect(g); g.connect(c.destination);
  const t = c.currentTime + (when || 0);
  o.start(t); o.stop(t + dur);
}
function pattern(level) {
  if (level === 'bad') [0, .25, .5].forEach(w => beep(880, .18, w));
  else if (level === 'warn') { beep(660, .2, 0); beep(660, .2, .3); }
  else beep(520, .15, 0);
}
function vib(level) { try { navigator.vibrate && navigator.vibrate(level === 'bad' ? [300, 100, 300, 100, 300] : [200]); } catch (e) { /* ignora */ } }
async function wake() { try { if (navigator.wakeLock) wl = await navigator.wakeLock.request('screen'); } catch (e) { /* ignora */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (S.gpsOn || S.sim)) wake(); });

/* ---------- Allarmi ---------- */
const A = new Map(), SN = new Map();
let alSig = '';
function renderAlarms() {
  const sig = [...A].map(([id, a]) => id + a.level).join('|');
  if (sig !== alSig) {
    alSig = sig;
    $('alarms').innerHTML = [...A].map(([id, a]) =>
      `<div class="al ${a.level}" data-id="${esc(id)}"><span>${esc(a.text)}</span><button data-act="dismiss" data-id="${esc(id)}" aria-label="Tacita">✕</button></div>`).join('');
  } else {
    [...A].forEach(([id, a]) => {
      const el = $('alarms').querySelector(`.al[data-id="${CSS.escape(id)}"] span`);
      if (el && el.textContent !== a.text) el.textContent = a.text;
    });
  }
}
function raise(id, text, level) {
  const sn = SN.get(id);
  if (sn && sn > Date.now()) return;
  const o = A.get(id);
  A.set(id, { text, level });
  if (!o || o.level !== level) { pattern(level); vib(level); lastBeep = Date.now(); }
  renderAlarms();
  if (level === 'info') setTimeout(() => clearAl(id), 12000);
}
function clearAl(id) { if (A.delete(id)) renderAlarms(); }

let toastT = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- Rotta ---------- */
function persistRoute() { store.set('route', S.route); }
function place(type, ll) {
  const p = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
  if (type === 'start') S.route.start = p;
  else if (type === 'dest') S.route.dest = p;
  else if (type === 'via') S.route.via.push(p);
  else if (type === 'hazard') { addHazard(p); return; }
  editRoute();
}
function editRoute() {
  S.route.path = null; S.route.blocked = !!(S.route.start && S.route.dest);
  autoMsg(S.route.blocked ? 'Calcolo della rotta nei canali…' : ''); routeChanged(); autoSchedule();
}
function routeChanged() {
  persistRoute();
  const w = wps();
  if (S.active) { if (w.length < 2) stopNav(); else S.leg = Math.min(S.leg, w.length - 1); }
  drawRoute(); routeCheck(); renderRoute(); ui();
}
function drawRoute() {
  const w = wps();
  routeLine.setLatLngs(S.route.blocked ? [] : w.map(p => [p.lat, p.lng]));
  wpLayer.clearLayers();
  const items = [];
  if (S.route.start) items.push({ role: 'start', p: S.route.start, label: 'P' });
  const mini = S.route.via.length > 15;
  S.route.via.forEach((p, i) => items.push({ role: 'via', idx: i, p, label: String(i + 1), mini }));
  if (S.route.dest) items.push({ role: 'dest', p: S.route.dest, label: 'D' });
  items.forEach(it => {
    const m = L.marker([it.p.lat, it.p.lng], {
      draggable: true,
      icon: it.mini
        ? L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div class="wp via mini"></div>' })
        : L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="wp ${it.role}">${it.label}</div>` })
    }).addTo(wpLayer);
    m.on('dragend', () => {
      const ll = m.getLatLng(), np = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
      if (it.role === 'start') S.route.start = np; else if (it.role === 'dest') S.route.dest = np; else S.route.via[it.idx] = np;
      editRoute();
    });
  });
}
function routeCheck() {
  const w = wps(), bad = [];
  S.hazards.forEach(h => {
    for (let i = 1; i < w.length; i++) {
      const d = segDist(h, w[i - 1], w[i]);
      if (d < h.r) { bad.push({ h, d }); break; }
    }
  });
  if (bad.length) raise('rc', 'La rotta passa vicino a: ' + bad.map(b => `${b.h.name} (${Math.round(b.d)} m)`).join(', '), 'warn');
  else clearAl('rc');
}
function startNav() {
  const w = wps();
  if (w.length < 2) { toast('Imposta partenza e destinazione'); return; }
  if (S.route.blocked) { toast('Nessuna rotta sicura calcolata: aggiungi una tappa lungo il canale'); return; }
  audio();
  S.active = true; S.leg = 1; S.legFrom = null;
  if (S.pos && dist(S.pos, w[0]) > S.set.arr * 3) S.legFrom = { lat: S.pos.lat, lng: S.pos.lng };
  if (!S.gpsOn && !S.sim) startGps();
  wake();
  closeSheet();
  if (S.pos) { S.set.follow = true; saveSet(); map.setView([S.pos.lat, S.pos.lng], Math.max(map.getZoom(), 13)); }
  else map.fitBounds(routeLine.getBounds().pad(0.25));
  toast('Navigazione avviata');
  renderRoute(); fabs(); ui();
}
function stopNav() {
  S.active = false; S.legFrom = null;
  legLine.setLatLngs([]); toTgtLine.setLatLngs([]);
  clearAl('xte');
  renderRoute(); ui();
}

/* ---------- Ostacoli, ancora, MOB ---------- */
function addHazard(p) {
  const type = $('hType').value || 'Ostacolo';
  const n = S.hazards.filter(h => h.type === type).length + 1;
  S.hazards.push({ id: Date.now().toString(36), lat: p.lat, lng: p.lng, type, name: type + ' ' + n, r: S.set.hz });
  store.set('hazards', S.hazards);
  drawHazards(); routeCheck(); renderHaz();
  toast(type + ' segnata');
}
function drawHazards() {
  hzLayer.clearLayers();
  S.hazards.forEach(h => {
    L.circle([h.lat, h.lng], { radius: h.r, color: '#ff4d4d', weight: 2, fillColor: '#ff4d4d', fillOpacity: .18 }).addTo(hzLayer);
    const m = L.marker([h.lat, h.lng], {
      icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: '<div class="hz"><i>!</i></div>' })
    }).addTo(hzLayer);
    const el = document.createElement('div');
    el.className = 'ctx';
    el.innerHTML = `<b>${esc(h.name)}</b><span>raggio ${h.r} m</span><button data-act="delHaz" data-id="${esc(h.id)}">Elimina</button>`;
    m.bindPopup(el);
  });
}
function setAnchor() {
  if (S.anchor) { S.anchor = null; clearAl('anchor'); ancLayer.clearLayers(); renderHaz(); toast('Allarme ancora disattivato'); return; }
  if (!S.pos) { toast('Serve la posizione GPS'); return; }
  audio();
  S.anchor = { lat: S.pos.lat, lng: S.pos.lng, r: S.set.anc };
  ancLayer.clearLayers();
  L.circle([S.anchor.lat, S.anchor.lng], { radius: S.anchor.r, color: '#fbbf24', weight: 2, fillOpacity: .1 }).addTo(ancLayer);
  renderHaz(); toast('Ancora segnata: allarme attivo');
}
function mobPress() {
  if (S.mob) {
    if (Date.now() - S.mobTap < 4000) { S.mob = null; mobLayer.clearLayers(); clearAl('mob'); ui(); toast('MOB annullato'); }
    else { S.mobTap = Date.now(); toast('Tocca ancora MOB per annullare'); }
    return;
  }
  audio();
  const p = S.pos || map.getCenter();
  S.mob = { lat: p.lat, lng: p.lng, t: Date.now() };
  mobLayer.clearLayers();
  L.marker([S.mob.lat, S.mob.lng], { icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: '<div class="mobm">MOB</div>' }) }).addTo(mobLayer);
  raise('mob', 'UOMO IN MARE: posizione segnata, segui la rotta MOB', 'bad');
  ui();
}

/* ---------- Navigazione: calcoli ---------- */
function nav() {
  const w = wps(), p = S.pos, N = { label: 'BRG' };
  if (S.mob) { N.tgt = S.mob; N.label = 'MOB'; }
  else if (S.active && w.length > S.leg) { N.tgt = w[S.leg]; N.from = legFrom(w); }
  if (p && N.tgt) {
    N.brg = brg(p, N.tgt); N.dtw = dist(p, N.tgt);
    if (N.from) N.xte = xteCalc(p, N.from, N.tgt);
    if (isFinite(p.cog)) N.vmg = p.sog * Math.cos((p.cog - N.brg) * RAD);
    const sp = p.sog > 0.5 ? p.sog : S.set.plan;
    const v = N.vmg > 0.3 ? N.vmg : sp;
    N.ttg = N.dtw / (v / KN);
    let rem = N.dtw;
    if (!S.mob) for (let i = S.leg + 1; i < w.length; i++) rem += dist(w[i - 1], w[i]);
    N.rem = rem;
    N.eta = Date.now() + rem / (sp / KN) * 1000;
  }
  return N;
}

/* ---------- GPS ---------- */
function startGps() {
  if (!navigator.geolocation) { toast('GPS non disponibile su questo dispositivo'); return; }
  if (S.watch != null) return;
  S.gpsOn = true;
  S.watch = navigator.geolocation.watchPosition(p => {
    if (S.sim) return;
    onFix({ lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, heading: p.coords.heading, acc: p.coords.accuracy, t: p.timestamp });
  }, e => {
    if (e.code === 1) { toast('Permesso di posizione negato: abilitalo nelle impostazioni del sito'); stopGps(); }
    else toast('GPS: ' + (e.message || 'segnale assente'));
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  wake(); fabs();
}
function stopGps() {
  if (S.watch != null) { navigator.geolocation.clearWatch(S.watch); S.watch = null; }
  S.gpsOn = false; clearAl('gps'); fabs();
}

function onFix(f) {
  const now = f.t || Date.now();
  S.lastFix = Date.now(); clearAl('gps');
  const lt = S.track[S.track.length - 1];
  let sog = (f.speed != null && isFinite(f.speed)) ? f.speed * KN : null;
  if (sog == null && S.pos) { const dt = (now - S.pos.t) / 1000; sog = dt > 0.5 ? dist(S.pos, f) / dt * KN : S.pos.sog; }
  if (sog == null) sog = 0;
  S.sogS = S.sogS == null ? sog : S.sogS * 0.6 + sog * 0.4;
  const s = S.sogS < 0.2 ? 0 : S.sogS;
  let cog = (f.heading != null && isFinite(f.heading) && s > 0.8) ? f.heading : null;
  if (cog == null && lt && dist(lt, f) > 8) cog = brg(lt, f);
  if (cog == null) cog = S.pos ? S.pos.cog : NaN;
  S.pos = { lat: f.lat, lng: f.lng, sog: s, cog, acc: f.acc, t: now };

  if ((f.acc == null || f.acc <= 50) && (!lt || dist(lt, f) > 8)) {
    if (lt) S.trip.dist += dist(lt, f);
    if (!S.trip.t0) S.trip.t0 = now;
    S.track.push({ lat: f.lat, lng: f.lng, t: now });
    if (S.track.length > 5000) S.track.shift();
    trackLine.addLatLng([f.lat, f.lng]);
  }
  S.trip.max = Math.max(S.trip.max, s);

  if (!map.hasLayer(boat)) boat.addTo(map);
  boat.setLatLng([f.lat, f.lng]);
  const bEl = document.getElementById('boat');
  if (bEl && isFinite(cog)) bEl.style.transform = `rotate(${cog}deg)`;
  if (s > 0.8 && isFinite(cog)) predLine.setLatLngs([[f.lat, f.lng], dest(S.pos, cog, s / KN * 360)]);
  else predLine.setLatLngs([]);

  if (!S.centered) { S.centered = true; map.setView([f.lat, f.lng], Math.max(map.getZoom(), 13)); }
  else if (S.set.follow) map.panTo([f.lat, f.lng], { animate: false });

  checks(); ui(); fabs();
}

function checks() {
  const p = S.pos; if (!p) return;
  const N = nav(), w = wps();
  if (S.active && !S.mob && N.tgt) {
    if (Math.abs(N.xte) > S.set.xte * NM) raise('xte', 'Fuori rotta di ' + fmtDist(Math.abs(N.xte)) + (N.xte > 0 ? ' a dritta' : ' a sinistra'), 'warn');
    else clearAl('xte');
    if (N.dtw < S.set.arr) {
      if (S.leg < w.length - 1) { raise('wp', 'Punto ' + S.leg + ' raggiunto', 'info'); S.leg++; S.legFrom = null; }
      else { raise('arr', 'Destinazione raggiunta', 'info'); stopNav(); }
    }
  } else clearAl('xte');

  S.hazards.forEach(h => {
    const id = 'h' + h.id, d = dist(p, h);
    if (d < h.r) { raise(id, `${h.name}: a ${fmtDist(d)}, PERICOLO`, 'bad'); return; }
    let hit = 0;
    if (p.sog > 0.8 && isFinite(p.cog)) {
      for (let m = 1; m <= 5 && !hit; m++) if (dist(dest(p, p.cog, p.sog / KN * 60 * m), h) < h.r) hit = m;
    }
    if (hit) raise(id, `${h.name} sulla prua tra circa ${hit} min`, 'warn'); else clearAl(id);
  });

  if (S.set.spd > 0 && p.sog > S.set.spd) raise('spd', `Velocità ${p.sog.toFixed(1)} nodi sopra il limite di ${S.set.spd}`, 'warn'); else clearAl('spd');
  if (S.anchor) {
    const d = dist(p, S.anchor);
    if (d > S.anchor.r) raise('anchor', `Ancora che borda: ${fmtDist(d)} dal punto`, 'bad'); else clearAl('anchor');
  }
  if (S.mob) raise('mob', 'UOMO IN MARE: ' + fmtDist(N.dtw) + ' rotta ' + fmtAng(N.brg), 'bad'); else clearAl('mob');

  if (N.tgt && N.from && S.active) legLine.setLatLngs([[N.from.lat, N.from.lng], [N.tgt.lat, N.tgt.lng]]);
  toTgtLine.setLatLngs(N.tgt ? [[p.lat, p.lng], [N.tgt.lat, N.tgt.lng]] : []);
}

/* ---------- Meteo (Open-Meteo, quando c'è rete) ---------- */
async function fetchWx() {
  if (!S.pos || !navigator.onLine) return;
  S.wxT = Date.now();
  const q = `latitude=${S.pos.lat.toFixed(3)}&longitude=${S.pos.lng.toFixed(3)}`;
  const [a, b] = await Promise.allSettled([
    fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl&wind_speed_unit=kn`).then(r => r.json()),
    fetch(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,wave_direction,wave_period`).then(r => r.json())
  ]);
  const wx = {};
  if (a.status === 'fulfilled' && a.value.current) Object.assign(wx, a.value.current);
  if (b.status === 'fulfilled' && b.value.current) Object.assign(wx, b.value.current);
  if (Object.keys(wx).length) {
    S.wx = wx;
    if (S.set.wind > 0 && wx.wind_gusts_10m > S.set.wind) raise('wind', `Raffiche a ${Math.round(wx.wind_gusts_10m)} nodi`, 'warn'); else clearAl('wind');
  }
}

/* ---------- Mezzo e patente: distanza massima dalla costa ----------
   Codice della nautica da diporto (D.Lgs. 171/2005): senza patente si naviga entro 6 miglia dalla costa;
   la patente "entro 12 miglia" porta il limite a 12; la patente "senza alcun limite" lo toglie.
   Il mezzo può avere un limite più stretto (omologazione, categoria di progettazione, unità a remi). Vale il più stretto. */
const BOATS = { motore: 'Barca a motore', gommone: 'Gommone', vela: 'Barca a vela', moto: "Moto d'acqua", remi: 'Canoa, kayak, SUP, pedalò, a remi' };
const mi = v => num1(v) + (+(+v).toFixed(1) === 1 ? ' miglio' : ' miglia');
const LIC = { none: 'senza patente', '12': 'patente entro 12 miglia', unl: 'patente senza limiti' };
function seaRules() {
  const s = S.set, warn = [];
  const licNm = s.lic === 'unl' ? Infinity : s.lic === '12' ? 12 : 6;
  /* art. 27: moto d'acqua, canoe, kayak, pedalò, tavole entro 1 miglio; natanti (fino a 10 m) con marcatura CE
     entro 12 miglia; natanti senza marcatura CE entro 6 miglia (12 se omologati per la navigazione senza limiti).
     Imbarcazioni oltre 10 m: nessun limite di distanza del mezzo (vale la categoria di progettazione). */
  const natante = s.len <= 10;
  const autoV = s.boat === 'remi' || s.boat === 'moto' ? 1 : !natante ? Infinity : s.ce === 'noce' ? 6 : 12;
  const autoWhy = s.boat === 'remi' ? 'limite per canoe, kayak, pedalò e tavole' : s.boat === 'moto' ? "limite per le moto d'acqua"
    : s.ce === 'noce' ? 'limite per i natanti senza marcatura CE' : 'limite per i natanti fino a 10 m';
  const vNm = s.vlim === 'auto' ? autoV : s.vlim === 'none' ? Infinity : +s.vlim;
  const limNm = Math.min(licNm, vNm > 0 ? vNm : Infinity);
  const why = limNm === Infinity ? 'nessun limite' : vNm < licNm ? (s.vlim === 'auto' ? autoWhy : 'limite del mezzo') : LIC[s.lic] || LIC.none;
  if (s.lic === 'none') {
    if (s.boat === 'moto') warn.push("Per condurre una moto d'acqua serve sempre la patente nautica.");
    if (s.boat !== 'remi' && s.hp > 40.8) warn.push(`Con un motore di ${num1(s.hp)} CV (oltre 40,8 CV / 30 kW) serve la patente nautica anche entro 6 miglia.`);
  }
  if (s.len > 24) warn.push('Oltre 24 m è una nave da diporto: servono la patente per navi da diporto e i documenti della nave.');
  return { limNm, why, warn };
}
function renderRules() {
  const el = $('licInfo'); if (!el) return;
  const r = seaRules();
  el.textContent = (r.limNm === Infinity
    ? 'Nessun limite di distanza dalla costa: la rotta segue la via più breve e si tiene comunque fuori dalla fascia di rispetto.'
    : `La rotta resta entro ${mi(r.limNm)} dalla costa (${r.why}) e preferisce stare a circa ${mi(Math.min(S.set.pref, r.limNm * 0.8))} da riva.`) +
    (r.warn.length ? ' ATTENZIONE: ' + r.warn.join(' ') : '');
  el.className = 'note' + (r.warn.length ? ' warn' : '');
}

/* Griglia geografica di mare e terra per la navigazione costiera, dalle profondità EMODnet già scaricate:
   mare dove c'è il dato di profondità, terra altrove. Maglia ~115 m (più larga sulle rotte molto lunghe). */
/* Estensione dei dati EMODnet scaricati (oltre non c'è costa da vedere: inutile allargare il riquadro). */
const depthExtent = idx => idx.tiles.reduce((b, t) => ({ s: Math.min(b.s, t.s), n: Math.max(b.n, t.n), w: Math.min(b.w, t.w), e: Math.max(b.e, t.e) }),
  { s: 90, n: -90, w: 180, e: -180 });
async function coastGrid(w, limM, grow) {
  const idx = await depthIndex();
  if (!idx.tiles.length) return null;
  const X = depthExtent(idx);
  let s = 90, n = -90, we = 180, e = -180;
  w.forEach(p => { s = Math.min(s, p.lat); n = Math.max(n, p.lat); we = Math.min(we, p.lng); e = Math.max(e, p.lng); });
  const lat0 = (s + n) / 2, kx = Math.cos(lat0 * RAD);
  const spanM = Math.max((n - s) * 111320, (e - we) * 111320 * kx);
  /* margine attorno ai punti: la costa che conta può sporgere (capi, delta, lagune). Se il percorso tocca il bordo
     si riprova con un riquadro più grande (grow = 1, 2, 4...) */
  const M = Math.max(isFinite(limM) ? limM + 12000 : 0, 0.3 * spanM, 25000) * (grow || 1);
  s -= M / 111320; n += M / 111320; we -= M / (111320 * kx); e += M / (111320 * kx);
  /* il riquadro non va oltre i dati: con grow = Infinity copre tutti i mari scaricati (es. giro dell'Italia da
     Genova a Rimini, passando dallo Stretto di Messina) */
  s = Math.max(s, X.s); n = Math.min(n, X.n); we = Math.max(we, X.w); e = Math.min(e, X.e);
  if (s >= n || we >= e) return null;
  const full = s <= X.s && n >= X.n && we <= X.w && e >= X.e;
  const RES = 960;   // celle per grado dei PNG EMODnet
  const f = Math.max(1, Math.ceil(Math.sqrt(((n - s) * RES) * ((e - we) * RES) / 3e6)));
  const dLat = f / RES, dLng = f / RES, W = Math.ceil((e - we) / dLng), H = Math.ceil((n - s) / dLat);
  /* sulle griglie larghe (f > 1) bastano tessere ridotte: tutte le 114 tessere intere occuperebbero ~420 MB */
  const tiles = (await Promise.all(idx.tiles.filter(t => tileHit(t, { s, n, w: we, e })).map(t => f > 1 ? depthTileLow(t, f) : depthTile(t)))).filter(Boolean);
  if (!tiles.length) return null;
  const sea = new Uint8Array(W * H), shallow = new Uint8Array(W * H), need = (S.set.draft > 0 ? S.set.draft + S.set.ukc : 0) * 10;
  let any = 0;
  tiles.forEach(d => {
    const t = d.t, y0 = Math.max(0, Math.floor((n - t.n) / dLat)), y1 = Math.min(H - 1, Math.ceil((n - t.s) / dLat));
    const x0 = Math.max(0, Math.floor((t.w - we) / dLng)), x1 = Math.min(W - 1, Math.ceil((t.e - we) / dLng));
    for (let y = y0; y <= y1; y++) {
      const lat = n - (y + 0.5) * dLat; if (lat < t.s || lat >= t.n) continue;
      const py = Math.min(d.h - 1, ((t.n - lat) / (t.n - t.s) * d.h) | 0);
      for (let x = x0; x <= x1; x++) {
        const lng = we + (x + 0.5) * dLng; if (lng < t.w || lng >= t.e) continue;
        const px = Math.min(d.w - 1, ((lng - t.w) / (t.e - t.w) * d.w) | 0), j = (py * d.w + px) * 4, i = y * W + x;
        if (d.data[j + 2] === 255) { sea[i] = 1; any = 1; if (need && d.data[j] * 256 + d.data[j + 1] < need) shallow[i] = 1; }
      }
    }
  });
  if (!any) return null;
  const g = { s, n, w: we, e, dLat, dLng, W, H, sea, shallow, dx: dLng * 111320 * kx, dy: dLat * 111320, full };
  /* pericoli isolati dei dati nautici (scogli, relitti, ostruzioni, mede di pericolo isolato): da evitare anche al largo */
  g.nogo = new Uint8Array(W * H);
  try {
    const D = await nauticaFor({ s, n, w: we, e });
    const DANGER = /^(rock|wreck|obstruction|beacon_isolated_danger|buoy_isolated_danger)$/;
    const rx = Math.ceil(150 / g.dx), ry = Math.ceil(150 / g.dy);
    D.nodes.forEach(o => {
      if (!DANGER.test(o.tags['seamark:type'] || '')) return;
      const c = coastCell(g, o); if (c < 0) return;
      const cx = c % W, cy = (c / W) | 0;
      for (let y = Math.max(0, cy - ry); y <= Math.min(H - 1, cy + ry); y++)
        for (let x = Math.max(0, cx - rx); x <= Math.min(W - 1, cx + rx); x++) g.nogo[y * W + x] = 1;
    });
    /* piattaforme e allevamenti */
    const PP = p => [(p.lng - we) / dLng, (n - p.lat) / dLat], mppC = Math.min(g.dx, g.dy);
    drawNoGo(g.nogo, W, H, PP, mppC, D.hazards || [], D.noGoAreas || []);
    /* corsie di traffico */
    if (D.laneAreas && D.laneAreas.length) { g.lane = new Uint8Array(W * H); drawNoGo(g.lane, W, H, PP, mppC, [], D.laneAreas); }
    /* attenzione: entro 1,5 km da briccole, boe, fari e segnali, e lungo canali e corridoi segnalati, il percorso
       si calcola sulla carta dettagliata al massimo ingrandimento, per seguire la segnaletica */
    g.attn = new Uint8Array(W * H);
    drawNoGo(g.attn, W, H, PP, mppC, D.nodes.map(o => ({ lat: o.lat, lng: o.lng, r: ATTN_M })),
      D.corridorAreas.map(a => ({ rings: a.rings, r: 500 })).concat(D.lines.map(l => ({ rings: [l.pts], r: 500, line: true }))));
    /* lagune, barene, velme e secche: per EMODnet sono mare, ma lì si naviga solo nei canali (carta dettagliata) */
    if (D.restrictAreas.length) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = '#000';
      D.restrictAreas.forEach(a => {
        cx.beginPath();
        a.rings.forEach(r => { r.forEach((p, i) => { const x = (p.lng - we) / dLng, y = (n - p.lat) / dLat; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }); cx.closePath(); });
        cx.fill('evenodd');
      });
      const px = cx.getImageData(0, 0, W, H).data;
      g.lagoon = new Uint8Array(W * H);
      /* l'acqua della laguna è collegata anche dove EMODnet non ha dati (canali tra le isole): qui serve solo
         a scegliere la bocca di porto, il passaggio vero nei canali lo trova la carta dettagliata */
      for (let i = 0; i < g.lagoon.length; i++) if (px[i * 4 + 3] > 96) g.lagoon[i] = 1;
      /* riempie solo l'interno: una cella diventa acqua se tutte le vicine sono laguna o mare, così i cordoni
         sottili (Lido, Pellestrina) restano terra anche se il contorno della laguna li sfiora */
      const fill = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!g.lagoon[i] || sea[i]) continue;
        let ok = true;
        for (let dy2 = -1; dy2 <= 1 && ok; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) { const j = i + dy2 * W + dx2; if (!g.lagoon[j] && !sea[j]) { ok = false; break; } }
        if (ok) fill.push(i);
      }
      fill.forEach(i => { sea[i] = 1; });
    }
    /* Canali segnalati e corsi d'acqua navigabili aprono la griglia: a maglia di 100-200 m le dighe e i bordi della
       laguna chiudono le imboccature vere (es. bocca di Grado: la rotta per il porto di Grado faceva il giro da
       Primero). Solo vicino al mare o in laguna, così un canale interno non diventa una scorciatoia nei campi.
       Solo sulle griglie fini (fino a ~250 m): su quelle larghe i porti li gestisce l'aggancio di coarseSolve. */
    if (Math.min(g.dx, g.dy) <= 250) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.strokeStyle = cx.fillStyle = '#000'; cx.lineCap = cx.lineJoin = 'round';
      cx.lineWidth = Math.max(1.5, 60 / Math.min(g.dx, g.dy));
      const XY = p => [(p.lng - we) / dLng, (n - p.lat) / dLat];
      D.lines.forEach(l => { if (!l.nav) return; cx.beginPath(); l.pts.forEach((p, i) => { const [x, y] = XY(p); i ? cx.lineTo(x, y) : cx.moveTo(x, y); }); cx.stroke(); });
      const rr = Math.max(1, 60 / Math.min(g.dx, g.dy));
      D.nodes.forEach(o => { if (!Channels.side(o.tags)) return; const [x, y] = XY(o); cx.beginPath(); cx.arc(x, y, rr, 0, 2 * Math.PI); cx.fill(); });
      const px = cx.getImageData(0, 0, W, H).data, near = Math.ceil(300 / Math.min(g.dx, g.dy)), add = [];
      /* chan: celle di canale segnalato. Lì il calcolo non applica la fascia dei 300 m da riva né la penalità della
         laguna: in un'imboccatura o in un canale si passa per forza vicino alle dighe */
      g.chan = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (px[i * 4 + 3] < 64) continue;
        if (sea[i]) { g.chan[i] = 1; continue; }
        let ok = g.lagoon && g.lagoon[i];
        for (let yy = Math.max(0, y - near); yy <= Math.min(H - 1, y + near) && !ok; yy++)
          for (let xx = Math.max(0, x - near); xx <= Math.min(W - 1, x + near); xx++) if (sea[yy * W + xx]) { ok = true; break; }
        if (ok) add.push(i);
      }
      add.forEach(i => { sea[i] = 1; g.chan[i] = 1; });
    }
  } catch (err) { /* dati nautici non disponibili: restano costa e fondali */ }
  return g;
}
const coastCell = (g, p) => {
  const x = Math.floor((p.lng - g.w) / g.dLng), y = Math.floor((g.n - p.lat) / g.dLat);
  return x < 0 || y < 0 || x >= g.W || y >= g.H ? -1 : y * g.W + x;
};
const coastLL = (g, i) => ({ lat: +(g.n - (((i / g.W) | 0) + 0.5) * g.dLat).toFixed(6), lng: +(g.w + ((i % g.W) + 0.5) * g.dLng).toFixed(6) });
/* distanza dalla costa (metri) in un punto, -1 se fuori dalla griglia */
const coastDistAt = (g, p) => { const c = coastCell(g, p); return c < 0 || !g.cd ? -1 : g.cd[c]; };
/* maschera "oltre il limite" per la griglia dettagliata di un tratto (stessa proiezione delle tiles OSM) */
function farMask(box, W, H, g, limM) {
  if (!g || !g.cd || !isFinite(limM)) return null;
  const z = box.z, ox = box.tx0 * Water.TILE, oy = box.ty0 * Water.TILE, N = Water.TILE * 2 ** z;
  const cols = new Int32Array(W);
  for (let x = 0; x < W; x++) { const lng = (ox + x + 0.5) / N * 360 - 180, c = Math.floor((lng - g.w) / g.dLng); cols[x] = c >= 0 && c < g.W ? c : -1; }
  const m = new Uint8Array(W * H); let any = 0;
  for (let y = 0; y < H; y++) {
    const lat = DEG * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * (oy + y + 0.5) / N)), r = Math.floor((g.n - lat) / g.dLat);
    if (r < 0 || r >= g.H) continue;
    for (let x = 0; x < W; x++) { const c = cols[x]; if (c >= 0 && g.cd[r * g.W + c] > limM) { m[y * W + x] = 1; any = 1; } }
  }
  return any ? m : null;
}

/* Divide la rotta in tratti: in mare aperto direttamente dalla griglia della costa, vicino a costa, porti, lagune
   e canali con la carta dettagliata (che rispetta briccole e segnali). Rispetta i limiti di patente e mezzo. */
/* tratti dettagliati corti: ognuno deve stare in una carta a zoom 15-16 (circa 1-2 m per pixel), dove si vedono
   singole briccole, pali e canali stretti. Il numero di tratti cresce, ma nessun segnale si perde. */
const LEG_MAX = 4 * NM, LIM_MARGIN = 0.15 * NM, ZOOM_MIN = 15, ATTN_M = 1500;
async function planSegments(w, label) {
  const rules = seaRules();
  const limM = isFinite(rules.limNm) ? rules.limNm * NM - LIM_MARGIN : Infinity;
  w.forEach((p, i) => { p.ui = i; });
  const tooLong = w.some((p, i) => i && !Water.tileBox([w[i - 1], p]));
  /* anche un tratto che starebbe in una carta sola viene diviso se la carta non arriva almeno a zoom 15 */
  const coarseZoom = w.some((p, i) => i && !Water.tileBox([w[i - 1], p], 16, ZOOM_MIN));
  const simple = () => w.slice(1).map((p, i) => ({ kind: 'detail', a: w[i], b: p }));
  if (!isFinite(limM) && !tooLong && !coarseZoom) return { segs: simple(), cg: null, rules, limM };
  let cg = null, res = null;
  /* riquadro sempre più grande: 1, 2, 4 volte il margine, poi tutti i mari scaricati. Prima si fermava a 4: da
     Genova a Rimini il riquadro arrivava a 41° N e non vedeva mai lo Stretto di Messina ("nessun passaggio") */
  for (let grow = 1; ; grow = grow >= 4 ? Infinity : grow * 2) {
  busy.set(grow === Infinity ? 'Navigazione costiera: cerco il passaggio su tutti i mari scaricati (può richiedere un po\'…)'
    : grow > 1 ? 'Navigazione costiera: allargo la zona di calcolo…' : 'Navigazione costiera: leggo costa e fondali…', 1, 0.02);
  cg = await coastGrid(w, limM, grow);
  if (!cg) {
    if (tooLong) throw new Error('Tratto troppo lungo e mancano i dati di costa (profondità EMODnet) per dividerlo: aggiungi tappe intermedie');
    return { segs: simple(), cg: null, rules, limM, noCoast: true };
  }
  busy.set('Navigazione costiera: cerco il percorso lungo la costa…', 1, 0.05);
  const msg = { type: 'coarse', W: cg.W, H: cg.H, dx: cg.dx, dy: cg.dy, sea: cg.sea, shallow: S.set.boat === 'remi' ? null : cg.shallow, nogo: cg.nogo, lagoon: cg.lagoon || null,
    lane: cg.lane || null, attn: cg.attn || null, chan: cg.chan || null,
    pts: w.map(p => coastCell(cg, p)), limitM: limM, prefM: S.set.pref * NM, coastM: S.set.coast,
    openM: Math.max(1000, S.set.coast + 600), minOpenM: 4000, snapM: 5000 };
  res = await workerRun(msg, [], () => Water.coarseSolve(msg));
  if (res.error) throw new Error('errore nel calcolo costiero (' + res.error + ')');
  cg.cd = res.cd;
  /* il percorso (o la mancanza di percorso) dipende dal bordo del riquadro? fuori dal riquadro la costa non si vede */
  if (cg.full || grow === Infinity || res.ends.some(e => e.i < 0)) break;
  const edgeM = (isFinite(limM) ? limM : 0) + 4000, ex = Math.ceil(edgeM / cg.dx), ey = Math.ceil(edgeM / cg.dy);
  /* i bordi che coincidono con il limite dei dati non contano: lì non c'è altro da vedere */
  const X = depthExtent(await depthIndex()), inner = { l: cg.w > X.w, r: cg.e < X.e, t: cg.n < X.n, b: cg.s > X.s };
  const nearEdge = i => { const x = i % cg.W, y = (i / cg.W) | 0; return (inner.l && x < ex) || (inner.t && y < ey) || (inner.r && x >= cg.W - ex) || (inner.b && y >= cg.H - ey); };
  const touches = res.legs.some(L => L.none || L.pieces.some(pc => pc.cells.some(nearEdge)));
  if (!touches) break;
  }
  const bad = res.ends.findIndex(e => e.i < 0);
  if (bad >= 0) {
    const e = res.ends[bad];
    if (e.why === 'oltre') throw new Error(`${label(bad)} è a ${mi(e.cd / NM)} dalla costa, oltre il limite di ${mi(rules.limNm)} (${rules.why})`);
    /* lago, fiume o zona senza dati EMODnet: niente controllo della distanza dalla costa */
    if (tooLong) throw new Error(`${label(bad)} non è in mare (o mancano i dati EMODnet della zona): aggiungi tappe intermedie, ogni tratto al massimo circa 13 miglia`);
    return { segs: simple(), cg: null, rules, limM, noCoast: true };
  }
  const segs = [];
  let far = 0;
  res.legs.forEach((L, k) => {
    if (L.none) throw new Error(isFinite(limM)
      ? `${w.length > 2 ? `Tratto ${k + 1}: n` : 'N'}essun passaggio che resti entro ${mi(rules.limNm)} dalla costa (${rules.why}). ` +
        (/^limite/.test(rules.why) ? 'Con questo mezzo la destinazione non si raggiunge restando nel limite: scegli una destinazione più vicina' : 'Serve una patente con un limite più ampio, oppure una rotta diversa')
      : `Tratto ${k + 1}: nessun passaggio in mare tra i due punti`);
    far = Math.max(far, L.far);
    const A = w[k], B = w[k + 1];
    L.pieces.forEach((pc, j) => {
      const a = j === 0 ? A : segs[segs.length - 1].b;
      const b = j === L.pieces.length - 1 ? B : coastLL(cg, pc.cells[pc.cells.length - 1]);
      if (pc.open) { segs.push({ kind: 'open', a, b, mid: pc.cells.slice(1, -1).map(i => coastLL(cg, i)) }); return; }
      /* vicino a costa: tratti dettagliati di al massimo LEG_MAX lungo il percorso, che stiano nella carta */
      const c = pc.cells;
      /* la carta di ogni tratto deve contenere tutto il percorso costiero tra i due estremi (bocche di porto comprese) */
      const span = (q0, q1) => { const pts = []; for (let r = q0; r <= q1; r++) pts.push(coastLL(cg, c[r])); return pts; };
      /* tratti che toccano una laguna: carta più ampia, perché la bocca di porto vera può essere lontana dal percorso
         della griglia (EMODnet a 115 m non vede i cordoni sottili come il Lido) */
      const padOf = (q0, q1) => { if (!cg.lagoon) return 0; for (let r = q0; r <= q1; r++) if (cg.lagoon[c[r]]) return 6000; return 0; };
      let from = a, fromQ = 0, acc = 0;
      for (let q = 1; q < c.length - 1; q++) {
        const p0 = coastLL(cg, c[q - 1]), p1 = coastLL(cg, c[q]);
        acc += dist(p0, p1);
        const next = coastLL(cg, c[q + 1]);
        if (acc + dist(p1, next) > LEG_MAX || !Water.tileBox([from, next, ...span(fromQ, q + 1)], 16, ZOOM_MIN)) {
          /* punto di taglio: il più lontano da riva negli ultimi passi, mai dentro una laguna (lì solo i canali sono navigabili) */
          const score = i => (cg.lagoon && cg.lagoon[i] ? -1e9 : 0) + res.cd[i];
          let best = q;
          for (let r = q; r > Math.max(fromQ + 1, q - 25); r--) if (score(c[r]) > score(c[best])) best = r;
          const cut = coastLL(cg, c[best]);
          segs.push({ kind: 'detail', a: from, b: cut, via: span(fromQ, best), pad: padOf(fromQ, best) });
          from = cut; fromQ = best; acc = 0; q = best;
        }
      }
      segs.push({ kind: 'detail', a: from, b, via: span(fromQ, c.length - 1), pad: padOf(fromQ, c.length - 1) });
    });
  });
  return { segs, cg, rules, limM, far };
}

/* ---------- Rotta automatica via acqua (vedi water.js) ---------- */
function autoMsg(t) { $('autoMsg').textContent = t; $('autoMsg').hidden = !t; }
/* Barra di avanzamento del calcolo, sempre visibile sopra le schede (anche a pannello chiuso). */
const busy = {
  t0: 0, timer: 0, legs: 1,
  start(legs) {
    this.t0 = Date.now(); this.legs = legs || 1;
    const el = $('routeBusy'); el.className = ''; el.hidden = false;
    $('rbBar').style.width = '2%'; $('rbBtn').textContent = 'Annulla'; $('rbBtn').dataset.act = 'cancelRoute';
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1000); this.tick();
    $('bAuto').textContent = 'Calcolo in corso…';
  },
  /* k = tratto (1..n), phase = 0..1 dentro il tratto */
  set(text, k, phase) {
    $('rbText').textContent = text;
    if (k != null) $('rbBar').style.width = Math.max(2, Math.min(100, ((k - 1 + phase) / this.legs) * 100)).toFixed(1) + '%';
    autoMsg(text);
  },
  tick() { $('rbTime').textContent = Math.round((Date.now() - this.t0) / 1000) + ' s'; },
  stop() { clearInterval(this.timer); $('bAuto').textContent = 'Ricalcola rotta'; },
  done(text) {
    this.stop(); const el = $('routeBusy'); el.className = 'ok';
    $('rbText').textContent = text; $('rbBar').style.width = '100%'; $('rbBtn').textContent = 'OK'; $('rbBtn').dataset.act = 'closeBusy';
    clearTimeout(this.hideT); this.hideT = setTimeout(() => { if (el.className === 'ok') el.hidden = true; }, 6000);
  },
  fail(text) {
    this.stop(); const el = $('routeBusy'); el.className = 'bad';
    $('rbText').textContent = text; $('rbBtn').textContent = 'Chiudi'; $('rbBtn').dataset.act = 'closeBusy';
  },
  hide() { this.stop(); $('routeBusy').hidden = true; }
};
const yieldUI = () => new Promise(r => setTimeout(r, 40));
/* Prepara i dati di un tratto: carte ENC, immagini della carta OSM (salvate sul telefono) e dati nautici locali.
   Il calcolo vero e proprio avviene nel Web Worker (vedi routeLeg), così l'interfaccia non si blocca. */
/* Scansione ravvicinata: carta a zoom 16-17 (1-2 m per pixel) con margine stretto attorno al percorso. */
const CLOSE = { zmax: 17, zmin: 16, padM: 300 };
const closeBox = (a, b, via) => Water.tileBox([a, b, ...(via || [])], CLOSE.zmax, CLOSE.zmin, CLOSE.padM);
/* SCANSIONI RAVVICINATE, solo come riserva: rifà il tratto a zoom 16-17; se non basta lo divide a metà lungo il percorso
   della griglia costiera e rifà ogni metà (fino a 8 pezzi). Restituisce i pezzi riusciti, oppure null: in quel caso
   resta il risultato normale con il suo messaggio (cerchi rossi dove manca il passaggio). Un punto di metà che a zoom
   alto cade su una barena o sulla spiaggia fa solo fallire questo tentativo, non tutta la rotta. */
async function closeSolve(a, b, via, depth, k, n, plan, seq) {
  if (seq !== autoSeq) return null;
  if (closeBox(a, b, via)) {
    const prep = await loadGrid(a, b, k, n, plan, via, 0, undefined, true);
    if (seq !== autoSeq) return null;
    const res = await routeLeg(prep, a, b);
    if (!res.error && res.cells && !res.bad && res.ends.every(e => e.i >= 0)) {
      /* i punti di metà (non dell'utente) si spostano subito dove il calcolo li ha agganciati, così il pezzo dopo parte da lì */
      [a, b].forEach((pt, j) => {
        const e = res.ends[j];
        if (pt.ui != null || !pt.mid || !e.moved) return;
        const np = Water.cellLL({ z: res.z, ox: res.ox, oy: res.oy, W: res.W }, e.i);
        pt.lat = np.lat; pt.lng = np.lng; e.moved = false;
      });
      return [{ prep, res, a, b }];
    }
  }
  if (depth >= 3 || via.length < 3) return null;
  const i = via.length >> 1, m = { lat: via[i].lat, lng: via[i].lng, mid: true };
  busy.set(`Tratto ${k}/${n}: zoom ravvicinato, pezzo ${depth + 2}…`, k, 0.4);
  const A = await closeSolve(a, m, via.slice(0, i + 1), depth + 1, k, n, plan, seq);
  if (!A) return null;
  const B = await closeSolve(m, b, via.slice(i), depth + 1, k, n, plan, seq);
  return B ? A.concat(B) : null;
}
async function loadGrid(a, b, k, n, plan, via, pad, zmin, close) {
  let pts = [a, b, ...(via || [])];
  if (pad > 0) {
    let s = 90, nn = -90, w = 180, e = -180;
    pts.forEach(p => { s = Math.min(s, p.lat); nn = Math.max(nn, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); });
    /* margine più ampio possibile senza scendere sotto lo zoom 15 */
    for (const pd of [pad, pad * 0.6, pad * 0.35]) {
      const dl = pd / 111320, dg = pd / (111320 * Math.cos((s + nn) / 2 * RAD));
      const big = pts.concat([{ lat: s - dl, lng: w - dg }, { lat: nn + dl, lng: e + dg }]);
      if (Water.tileBox(big, 16, zmin || ZOOM_MIN)) { pts = big; break; }
    }
  }
  const box = (close && closeBox(a, b, via)) || Water.tileBox(pts) || Water.tileBox([a, b]);
  if (!box) throw new Error(`Tratto ${k} troppo lungo: aggiungi una tappa a metà strada`);
  const nx = box.tx1 - box.tx0 + 1, ny = box.ty1 - box.ty0 + 1, W = nx * Water.TILE, H = ny * Water.TILE;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  /* carte ENC ufficiali, se importate: dove coprono tutta la zona non serve nient'altro */
  let enc = null;
  if (window.ENC && ENC.loaded()) {
    busy.set(`Tratto ${k}/${n}: leggo le carte ENC…`, k, 0.05);
    await yieldUI();
    const ox = box.tx0 * Water.TILE, oy = box.ty0 * Water.TILE, bb = Water.boxBounds(box);
    const mpp = 156543.03392 * Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) / 2 ** box.z;
    enc = ENC.routingMasks(bb, W, H, p => [Water.lon2px(p.lng, box.z) - ox, Water.lat2px(p.lat, box.z) - oy], mpp, S.set.draft + S.set.ukc);
  }
  const encFull = enc && enc.fraction > 0.999;
  let nautical = { lines: [], corridorAreas: [], restrictAreas: [], nodes: [], info: { canali: 0, segnali: 0, coppie: 0, lagune: 0 } };
  if (!encFull) {
    /* dati nautici: istantanei dai riquadri salvati. Partenza e arrivo devono stare in zone scaricate. */
    const idx = await nauticaIndex();
    if (idx.legacy) {
      const E = idx.tiles[0].core, ins = p => p.lat >= E.s && p.lat <= E.n && p.lng >= E.w && p.lng <= E.e;
      if (!ins(a) || !ins(b)) S.edgeWarn = true;
    }
    if (!(await nauticaCovers(a)) || !(await nauticaCovers(b))) throw new Error(`Tratto ${k}: è fuori dalle zone di cui sono stati scaricati i dati nautici. Avvia l'azione "Aggiorna dati nautici" su GitHub`);
    nautical = await fetchNautical(box);
    /* immagini della carta OSM per distinguere acqua e terra: salvate sul telefono, la seconda volta non serve la rete */
    const jobs = [];
    for (let y = box.ty0; y <= box.ty1; y++) for (let x = box.tx0; x <= box.tx1; x++) jobs.push([x, y]);
    let done = 0, failed = 0, cache = null;
    try { cache = await caches.open('rn-route-tiles'); } catch (e) { /* cache non disponibile */ }
    const work = async () => {
      while (jobs.length) {
        const [x, y] = jobs.shift(), url = `https://tile.openstreetmap.org/${box.z}/${x}/${y}.png`;
        try {
          let r = cache ? await cache.match(url) : null;
          if (!r) {
            r = await fetch(url, { mode: 'cors' });
            if (!r.ok) throw new Error(r.status);
            if (cache) cache.put(url, r.clone()).catch(() => {});
          }
          const bm = await createImageBitmap(await r.blob());
          ctx.drawImage(bm, (x - box.tx0) * Water.TILE, (y - box.ty0) * Water.TILE);
          if (bm.close) bm.close();
        } catch (e) { failed++; }
        busy.set(`Tratto ${k}/${n}: carta ${Math.round(++done / (nx * ny) * 100)}%`, k, 0.5 * done / (nx * ny));
      }
    };
    await Promise.all([0, 1, 2, 3, 4, 5].map(work));
    if (failed > nx * ny * 0.15) throw new Error('Carta non disponibile per questa zona: serve la connessione a Internet la prima volta');
  }
  busy.set(`Tratto ${k}/${n}: riconosco canali, briccole e acque navigabili…`, k, 0.6);
  await yieldUI();
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const extra = rasterNautical(ctx, W, H, box, nautical);
  if (enc) extra.enc = enc;
  /* oltre il limite di patente o mezzo: vietato */
  const far = plan && plan.cg ? farMask(box, W, H, plan.cg, plan.limM) : null;
  if (far) extra.far = far;
  /* profondità EMODnet: fuori dai canali si evitano i fondali sotto pescaggio + margine */
  let depthUsed = false;
  if (!encFull && S.set.draft > 0) {
    busy.set(`Tratto ${k}/${n}: leggo le profondità EMODnet…`, k, 0.65);
    const dm = await depthMask(box, W, H, S.set.draft + S.set.ukc).catch(() => null);
    if (dm && dm.sh) { extra.shallow = dm.sh; depthUsed = true; }
    if (dm && dm.deep) extra.deep = dm.deep;
  }
  return { rgba, W, H, box, extra, info: nautical.info, ch: extra.ch, depthUsed, enc: enc ? { fraction: enc.fraction, cells: enc.cells } : null };
}

/* ---------- Calcolo del percorso nel Web Worker ----------
   water.js gira anche come Worker: griglia, A*, semplificazione e verifica avvengono fuori dall'interfaccia.
   Se il Worker non è disponibile si calcola qui, come prima. */
let routeWorker = null, routeJob = 0;
function routeLeg(prep, a, b) {
  const { rgba, W, H, box, extra } = prep;
  const masks = {};
  /* canoe, kayak, SUP e pedalò: pescaggio quasi nullo, non sono obbligati a stare nei canali né a evitare i bassi fondali */
  const light = S.set.boat === 'remi';
  ['restrict', 'hard', 'shallow', 'deep', 'lines', 'linesCore', 'lines2', 'axis', 'ext', 'zone', 'barrier', 'nogo', 'far', 'lane', 'sx', 'sy', 'sp', 'sn'].forEach(k => {
    if (light && /^(restrict|shallow|deep|zone|barrier)$/.test(k)) return;
    if (extra[k]) masks[k] = extra[k];
  });
  masks.coastM = extra.coastM;
  /* larghezza minima dell'acqua fuori dai canali: canoe e kayak passano anche nei canaletti stretti */
  if (light) masks.minW = 3;
  if (extra.enc) masks.enc = { cov: extra.enc.cov, ok: extra.enc.ok, wet: extra.enc.wet, pref: extra.enc.pref };
  const msg = { rgba, W, H, box, extra: masks, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng }, relaxM: 500,
    /* spostamento massimo degli estremi se cadono in una sacca: poco per i punti scelti dall'utente, di più per i raccordi
       tra un tratto e l'altro decisi dalla griglia costiera (possono cadere fuori dal canale) */
    pocket: [a, b].map(p => p.ui != null ? 250 : 1200) };
  return workerRun(msg, [rgba.buffer], () => Water.solve(msg));
}
function workerRun(msg, transfer, local) {
  if (!window.Worker) return Promise.resolve().then(local);
  return new Promise(resolve => {
    try {
      if (!routeWorker) routeWorker = new Worker('water.js');
      const id = ++routeJob;
      routeWorker.onmessage = e => { if (e.data && e.data.id === id) resolve(e.data); };
      routeWorker.onerror = ev => { ev.preventDefault && ev.preventDefault(); routeWorker = null; resolve(local()); };
      routeWorker.postMessage(Object.assign({ id }, msg), transfer);
    } catch (e) { routeWorker = null; resolve(local()); }
  });
}
/* interrompe un calcolo in corso (nuova rotta o Annulla) */
function stopWorker() { if (routeWorker) { routeWorker.terminate(); routeWorker = null; } }

/* ---------- Dati nautici locali (nautica_locale.geojson) ----------
   Il file si scarica una volta da Overpass Turbo (query in tools/overpass_turbo_nautica.txt) e si pubblica
   accanto a index.html. L'app lo legge una sola volta con fetch(): nessuna richiesta a Overpass, segnali e
   calcolo della rotta sono immediati e funzionano anche senza rete. */
/* Dati pubblicati con l'app (GitHub Pages). Nell'APK si leggono dal sito, poi restano salvati sul telefono. */
const DATA_BASE = window.Capacitor ? 'https://capofusnez.github.io/rotta-nautica/' : '';
async function getData(path, type) {
  let cache = null;
  try { cache = await caches.open('rn-data'); } catch (e) { /* cache non disponibile */ }
  const url = DATA_BASE + path;
  /* riquadri del pacchetto scaricato: si leggono dal telefono (li tiene aggiornati syncPackage all'avvio) */
  if (cache && S.set.pkg !== 'off' && /^(nautica\/c_|depth\/d_)/.test(path)) {
    const hit = await cache.match(url).catch(() => null);
    if (hit) return type === 'blob' ? hit.blob() : hit.json();
  }
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { cache: 'no-cache', signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) { if (cache) cache.put(url, r.clone()).catch(() => {}); return type === 'blob' ? r.blob() : r.json(); }
    if (r.status === 404) { const hit = cache && await cache.match(url); if (hit) return type === 'blob' ? hit.blob() : hit.json(); return null; }
  } catch (e) { /* senza rete: copia salvata */ }
  const hit = cache && await cache.match(url);
  if (hit) return type === 'blob' ? hit.blob() : hit.json();
  return null;
}
/* ---------- Pacchetto dati per l'uso senza rete ----------
   Al primo avvio scarica tutti i riquadri dei dati nautici (e, se scelto, delle profondità EMODnet); agli avvii
   successivi confronta l'indice pubblicato con quello salvato e scarica solo i riquadri nuovi o cambiati. */
const PKG = { running: false, done: 0, todo: 0, mb: 0 };
function pkgInfo(text) { const el = $('pkgInfo'); if (el) el.textContent = text; }
function pkgStatus() {
  const st = store.get('pkgState', null);
  if (S.set.pkg === 'off') return pkgInfo('Si salvano solo le zone usate per calcolare le rotte.');
  if (PKG.running) return pkgInfo(`Scarico i dati: ${PKG.done}/${PKG.todo} riquadri…`);
  if (!st) return pkgInfo('Dati non ancora scaricati: partirà al prossimo collegamento' + (S.set.pkgWifi ? ' Wi-Fi.' : '.'));
  pkgInfo(`Dati salvati sul telefono: ${st.n} riquadri, circa ${Math.round(st.mb)} MB. Dati nautici del ${st.date || '?'}. Ultimo controllo ${new Date(st.checked).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`);
}
async function syncPackage(force) {
  if (PKG.running || S.set.pkg === 'off' || !navigator.onLine) return;
  const c = navigator.connection;
  if (!force && S.set.pkgWifi && c && c.type && !/^(wifi|ethernet)$/.test(c.type)) { pkgStatus(); return; }
  let cache;
  try { cache = await caches.open('rn-data'); } catch (e) { return; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* facoltativo */ }
  const fresh = async path => { try { const r = await fetch(DATA_BASE + path, { cache: 'no-cache' }); return r.ok ? r.json() : null; } catch (e) { return null; } };
  const ni = await fresh('nautica/index.json');
  if (!ni || !ni.tiles) return;
  const di = S.set.pkg === 'all' ? await fresh('depth/index.json') : null;
  const items = ni.tiles.filter(t => t.file).map(t => ({ key: 'n:' + t.id, path: 'nautica/' + t.file, sig: t.bytes + '/' + t.count, bytes: t.bytes || 0 }))
    .concat(di && di.tiles ? di.tiles.map(t => ({ key: 'd:' + t.id, path: 'depth/' + t.file, sig: String(t.bytes), bytes: t.bytes || 0 })) : []);
  const saved = store.get('pkgSig', {}), want = new Set(items.map(x => x.key));
  /* riquadri tolti dall'indice (diventati vuoti) o profondità non più volute: si cancellano dal telefono */
  for (const k of Object.keys(saved)) if (!want.has(k)) {
    const path = k.startsWith('n:') ? 'nautica/' + k.slice(2) + '.geojson' : 'depth/' + k.slice(2) + '.png';
    await cache.delete(DATA_BASE + path).catch(() => {}); delete saved[k];
  }
  const todo = [];
  for (const x of items) if (saved[x.key] !== x.sig || !(await cache.match(DATA_BASE + x.path).catch(() => null))) todo.push(x);
  /* l'indice aggiornato va salvato anche lui, per l'uso senza rete */
  await cache.put(DATA_BASE + 'nautica/index.json', new Response(JSON.stringify(ni), { headers: { 'Content-Type': 'application/json' } })).catch(() => {});
  if (di) await cache.put(DATA_BASE + 'depth/index.json', new Response(JSON.stringify(di), { headers: { 'Content-Type': 'application/json' } })).catch(() => {});
  const totMb = items.reduce((a, x) => a + x.bytes, 0) / 1e6;
  const finish = () => {
    store.set('pkgSig', saved);
    store.set('pkgState', { n: Object.keys(saved).length, mb: totMb, date: (ni.created || '').slice(0, 10).split('-').reverse().join('/'), checked: Date.now() });
  };
  if (!todo.length) { finish(); pkgStatus(); return; }
  PKG.running = true; PKG.done = 0; PKG.todo = todo.length;
  const first = !Object.keys(saved).length;
  const mb = todo.reduce((a, x) => a + x.bytes, 0) / 1e6;
  toast(first ? `Scarico i dati nautici per l'uso senza rete (circa ${Math.round(mb)} MB)…` : `Aggiorno i dati nautici: ${todo.length} riquadri cambiati`);
  pkgStatus();
  let failed = 0;
  const work = async () => {
    while (todo.length) {
      const x = todo.shift();
      try {
        const r = await fetch(DATA_BASE + x.path, { cache: 'no-cache' });
        if (!r.ok) throw new Error(r.status);
        await cache.put(DATA_BASE + x.path, r);
        saved[x.key] = x.sig;
        /* il riquadro in memoria è vecchio: verrà riletto */
        if (x.key.startsWith('n:')) nTiles.delete(x.key.slice(2)); else dTiles.delete(x.key.slice(2));
      } catch (e) { failed++; }
      PKG.done++;
      if (PKG.done % 10 === 0) { store.set('pkgSig', saved); pkgStatus(); }
    }
  };
  await Promise.all([work(), work(), work()]);
  PKG.running = false;
  nIndexP = null; dIndexP = null;   // si rileggono gli indici nuovi
  finish(); pkgStatus();
  toast(failed ? `Dati nautici: ${failed} riquadri non scaricati, riprovo al prossimo avvio` : first ? 'Dati nautici salvati: ora funzionano anche senza rete' : 'Dati nautici aggiornati');
}

/* Dati nautici di tutta Italia a riquadri (nautica/index.json, creato dall'azione "Aggiorna dati nautici").
   Se l'indice non c'è si usa il vecchio file unico nautica_locale.geojson. */
let nIndexP = null;
const nTiles = new Map();
function nauticaIndex() {
  if (!nIndexP) nIndexP = (async () => {
    const idx = await getData('nautica/index.json');
    if (idx && idx.tiles) return idx;
    const gj = await getData('nautica_locale.geojson');
    if (!gj) throw new Error('Mancano i dati nautici (cartella nautica/ o file nautica_locale.geojson): avvia l\'azione "Aggiorna dati nautici" su GitHub');
    const D = indexNautical(gj), M = 0.1;
    nTiles.set('legacy', Promise.resolve(D));
    return { legacy: true, tiles: [{ id: 'legacy', s: D.ext.s - M, w: D.ext.w - M, n: D.ext.n + M, e: D.ext.e + M, file: null, core: D.ext }] };
  })().catch(e => { nIndexP = null; throw e; });
  return nIndexP;
}
function nauticaTile(t) {
  if (!nTiles.has(t.id)) nTiles.set(t.id, getData('nautica/' + t.file).then(gj => indexNautical(gj || { features: [] })).catch(e => { nTiles.delete(t.id); throw e; }));
  return nTiles.get(t.id);
}
const tileHit = (t, b) => t.s <= b.n && t.n >= b.s && t.w <= b.e && t.e >= b.w;
/* Unisce i riquadri che toccano la zona richiesta (gli oggetti a cavallo di due riquadri compaiono una volta sola). */
async function nauticaFor(b) {
  const idx = await nauticaIndex();
  const list = idx.tiles.filter(t => tileHit(t, b) && (t.file || t.id === 'legacy'));
  const parts = await Promise.all(list.map(nauticaTile));
  if (parts.length === 1) return parts[0];
  const D = { nodes: [], lines: [], corridorAreas: [], restrictAreas: [], hazards: [], noGoAreas: [], laneAreas: [] }, seen = new Set();
  parts.forEach(P => ['nodes', 'lines', 'corridorAreas', 'restrictAreas', 'hazards', 'noGoAreas', 'laneAreas'].forEach(k => (P[k] || []).forEach(o => {
    const key = k + ':' + o.id;
    if (o.id != null && seen.has(key)) return;
    seen.add(key); D[k].push(o);
  })));
  return D;
}
/* ---------- Profondità EMODnet (depth/index.json, creato dall'azione "Aggiorna dati nautici") ----------
   PNG con la profondità nei colori: (R*256 + G) decimetri, B = 255 dove c'è mare con dato. Maglia ~115 m: indicativa. */
let dIndexP = null;
const dTiles = new Map();
function depthIndex() {
  if (!dIndexP) dIndexP = getData('depth/index.json').then(j => (j && j.tiles) ? j : { tiles: [] }).catch(() => ({ tiles: [] }));
  return dIndexP;
}
/* Tessere intere in memoria: al massimo 16 (3,7 MB l'una), le meno usate di recente escono. */
function depthTile(t) {
  if (dTiles.has(t.id)) { const p = dTiles.get(t.id); dTiles.delete(t.id); dTiles.set(t.id, p); return p; }
  while (dTiles.size >= 16) dTiles.delete(dTiles.keys().next().value);
  if (!dTiles.has(t.id)) dTiles.set(t.id, (async () => {
    const blob = await getData('depth/' + t.file, 'blob');
    if (!blob) return null;
    const bm = await createImageBitmap(blob);
    const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bm, 0, 0);
    const data = cx.getImageData(0, 0, bm.width, bm.height).data;
    if (bm.close) bm.close();
    return { t, w: cv.width, h: cv.height, data };
  })().catch(() => { dTiles.delete(t.id); return null; }));
  return dTiles.get(t.id);
}
/* Tessera ridotta di un fattore f (vicino più prossimo, senza sfumature: i colori sono dati, non immagine). */
const dLow = new Map();
function depthTileLow(t, f) {
  const key = t.id + '/' + f;
  if (!dLow.has(key)) dLow.set(key, (async () => {
    const blob = await getData('depth/' + t.file, 'blob');
    if (!blob) return null;
    const bm = await createImageBitmap(blob);
    const w = Math.max(1, Math.ceil(bm.width / f)), h = Math.max(1, Math.ceil(bm.height / f));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(bm, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h).data;
    if (bm.close) bm.close();
    return { t, w, h, data };
  })().catch(() => { dLow.delete(key); return null; }));
  return dLow.get(key);
}
/* Maschera dei fondali troppo bassi per il pescaggio (1 = profondità nota e minore di need metri). */
async function depthMask(box, W, H, need) {
  const idx = await depthIndex(), b = Water.boxBounds(box);
  const list = (await Promise.all(idx.tiles.filter(t => tileHit(t, b)).map(depthTile))).filter(Boolean);
  if (!list.length) return null;
  const m = new Uint8Array(W * H), deep = new Uint8Array(W * H), z = box.z, ox = box.tx0 * Water.TILE, oy = box.ty0 * Water.TILE, N = Water.TILE * 2 ** z;
  const lim = need * 10, limDeep = (need + 1.5) * 10;   // acqua profonda: pescaggio + margine + 1,5 m (maglia di 115 m)
  let any = 0, anyDeep = 0;
  for (let y = 0; y < H; y++) {
    const lat = 180 / Math.PI * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * (oy + y + 0.5) / N));
    const rowT = list.filter(d => lat >= d.t.s && lat < d.t.n);
    if (!rowT.length) continue;
    for (let x = 0; x < W; x++) {
      const lng = (ox + x + 0.5) / N * 360 - 180;
      for (const d of rowT) {
        if (lng < d.t.w || lng >= d.t.e) continue;
        const px = Math.min(d.w - 1, ((lng - d.t.w) / (d.t.e - d.t.w) * d.w) | 0), py = Math.min(d.h - 1, ((d.t.n - lat) / (d.t.n - d.t.s) * d.h) | 0);
        const j = (py * d.w + px) * 4;
        if (d.data[j + 2] === 255) {
          const dm = d.data[j] * 256 + d.data[j + 1];
          if (dm < lim) { m[y * W + x] = 1; any = 1; } else if (dm >= limDeep) { deep[y * W + x] = 1; anyDeep = 1; }
        }
        break;
      }
    }
  }
  return any || anyDeep ? { sh: any ? m : null, deep: anyDeep ? deep : null } : null;
}
/* il punto è in una zona per cui i dati nautici sono stati scaricati? */
async function nauticaCovers(p) {
  const idx = await nauticaIndex();
  return idx.tiles.some(t => p.lat >= t.s && p.lat <= t.n && p.lng >= t.w && p.lng <= t.e);
}
const WATERWAY = /^(river|canal|fairway|tidal_channel|dock)$/;
/* Corso d'acqua dichiarato navigabile? Solo questi valgono come canali (anche sotto i ponti, in laguna e attraverso le
   file di briccole). Gli altri (canali di bonifica e di scolo, canali delle valli da pesca, ghebi, fiumi senza
   indicazioni) contano solo dove la carta mostra acqua abbastanza larga. */
const NAV_ACCESS = /^(yes|designated|permissive|destination|official)$/;
function navWay(t) {
  if (t['seamark:type'] === 'fairway' || t.waterway === 'fairway' || t.waterway === 'dock') return true;
  if (t.waterway === 'tidal_channel') return false;
  if (NAV_ACCESS.test(t.motorboat || '') || NAV_ACCESS.test(t.boat || '') || !!t.CEMT || t.ship === 'yes') return true;
  if (/^(no|private)$/.test(t.motorboat || t.boat || '')) return false;
  /* canali portuali e navigabili mappati senza boat/motorboat (es. "Canale di Zaule / Canale Navigabile" a Muggia,
     "Canale Navigabile Eugenio Valentinis" a Monfalcone, i porti canale): prima venivano trattati come fossi */
  if (t.usage === 'transportation') return true;
  return t.waterway === 'canal' && !/antic/i.test(t.name || '') &&
    /navigabil|porto ?canale|bocca di porto|darsena|canale (portuale|industriale)|idrovia|litoranea veneta/i.test(t.name || '');
}
/* oggetti in mare da evitare, con la distanza di rispetto in metri */
function noGoKind(t) {
  if (t.man_made === 'offshore_platform' || t['seamark:type'] === 'platform') return { kind: 'piattaforma', r: 500 };
  if (t['seamark:type'] === 'marine_farm') return { kind: 'allevamento', r: 50 };
  if (t.landuse === 'aquaculture') return { kind: 'allevamento', r: 0 };   // anche valli da pesca: solo l'area, senza fascia
  /* schemi di separazione del traffico (COLREG regola 10): zone e linee di separazione vietate, corsie solo da attraversare */
  const st = t['seamark:type'] || '';
  /* Regola 10: chi attraversa lo schema può passare corsie, linee e zone di separazione, il più possibile ad angolo
     retto; non si percorrono. Per questo valgono come zone da attraversare (costose), non come muri: prima le linee di
     separazione e di confine diventavano barriere larghe 100 m che partivano dall'imboccatura del porto (es. Ancona)
     e chiudevano ogni passaggio lungo la costa. Il confine esterno dello schema non è un ostacolo. */
  if (st === 'separation_boundary') return null;
  if (/^(separation_zone|separation_roundabout)$/.test(st)) return { kind: 'separazione del traffico', r: 100, lane: true };
  if (st === 'separation_line') return { kind: 'separazione del traffico', r: 100, lane: true };
  if (/^(separation_lane|precautionary_area)$/.test(st)) return { kind: 'corsia di traffico', r: 400, lane: true };
  if (st === 'restricted_area' && /entry_prohibited/.test(t['seamark:restricted_area:restriction'] || '')) return { kind: 'zona vietata', r: 0 };
  return null;
}
/* disegna piattaforme e allevamenti (con la fascia di rispetto) su una maschera; P = coordinate in pixel, mpp = metri per pixel */
function drawNoGo(mask, W, H, P, mpp, hazards, areas) {
  if (!hazards.length && !areas.length) return 0;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.strokeStyle = '#000'; cx.lineJoin = 'round'; cx.lineCap = 'round';
  hazards.forEach(h => { const [x, y] = P(h); cx.beginPath(); cx.arc(x, y, Math.max(1, h.r / mpp), 0, 2 * Math.PI); cx.fill(); });
  areas.forEach(a => {
    cx.beginPath(); a.rings.forEach(r => { r.forEach((p, i) => { const [x, y] = P(p); i ? cx.lineTo(x, y) : cx.moveTo(x, y); }); if (!a.line) cx.closePath(); });
    if (!a.line) cx.fill('evenodd');
    cx.lineWidth = Math.max(a.line ? 2 : 1, 2 * a.r / mpp); cx.stroke();
  });
  const d = cx.getImageData(0, 0, W, H).data; let n = 0;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 64) { mask[i] = 1; n++; }
  return n;
}
/* Prepara il GeoJSON (formato di Overpass Turbo / osmtogeojson): divide per tipo e calcola gli ingombri. */
function indexNautical(gj) {
  const D = { nodes: [], lines: [], corridorAreas: [], restrictAreas: [], hazards: [], noGoAreas: [], laneAreas: [], ext: { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity } };
  const ll = c => ({ lat: c[1], lng: c[0] });
  const bbOf = pts => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; pts.forEach(p => { if (p.lng < w) w = p.lng; if (p.lng > e) e = p.lng; if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; }); return [w, s, e, n]; };
  const grow = b => { D.ext.w = Math.min(D.ext.w, b[0]); D.ext.s = Math.min(D.ext.s, b[1]); D.ext.e = Math.max(D.ext.e, b[2]); D.ext.n = Math.max(D.ext.n, b[3]); };
  (gj.features || []).forEach((f, k) => {
    const g = f.geometry, P = f.properties || {};
    if (!g) return;
    /* Overpass Turbo mette i tag direttamente nelle properties; osmtogeojson classico li mette in properties.tags */
    const t = P.tags && typeof P.tags === 'object' ? P.tags : P;
    const id = P['@id'] || P.id || f.id || 'f' + k;
    /* piattaforme in mare (divieto di avvicinamento entro 500 m) e allevamenti di mitili/acquacoltura: da evitare */
    const keep = noGoKind(t);
    if (keep && g.type === 'Point' && !keep.lane) { const p = ll(g.coordinates); D.hazards.push({ id, lat: p.lat, lng: p.lng, r: keep.r, kind: keep.kind }); grow([p.lng, p.lat, p.lng, p.lat]); }
    if (keep && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
      (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach((pp, j) => {
        const rings = pp.map(r => r.map(ll)), bb = bbOf(rings[0]), item = { id: id + '#' + j, rings, bb, r: keep.lane ? 0 : keep.r, kind: keep.kind };
        (keep.lane ? D.laneAreas : D.noGoAreas).push(item); grow(bb);
      });
      return;
    }
    /* corsie e separazioni mappate come linee: fascia da attraversare (r metri per lato) */
    if (keep && keep.lane && (g.type === 'LineString' || g.type === 'MultiLineString')) {
      (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach((l, j) => { const pts = l.map(ll), bb = bbOf(pts); D.laneAreas.push({ id: id + '~' + j, rings: [pts], bb, r: keep.r, kind: keep.kind, line: true }); grow(bb); });
      return;
    }
    if (keep && !keep.lane && (g.type === 'LineString' || g.type === 'MultiLineString')) {
      (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach((l, j) => { const pts = l.map(ll), bb = bbOf(pts); D.noGoAreas.push({ id: id + '~' + j, rings: [pts], bb, r: keep.r, kind: keep.kind, line: true }); grow(bb); });
      return;
    }
    if (g.type === 'Point') {
      if (t['seamark:type'] || t.man_made === 'dolphin') { const p = ll(g.coordinates); D.nodes.push({ id, lat: p.lat, lng: p.lng, tags: t }); grow([p.lng, p.lat, p.lng, p.lat]); }
      return;
    }
    const isRestrict = t.water === 'lagoon' || t.natural === 'wetland' || t.natural === 'shoal';
    const isFair = t['seamark:type'] === 'fairway';
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => r.map(ll)));
      polys.forEach(p => {
        /* barene e zone con vegetazione: emerse, mai attraversabili nemmeno nell'ultimo tratto fuori canale */
        const item = { id: id + (polys.length > 1 ? '#' + polys.indexOf(p) : ''), rings: p, bb: bbOf(p[0]), lagoon: t.water === 'lagoon', hard: t.natural === 'wetland' && /^(saltmarsh|marsh|reedbed|swamp|fen|bog|wet_meadow)$/.test(t.wetland || '') };
        if (isRestrict) D.restrictAreas.push(item);
        else if (isFair) D.corridorAreas.push(item);
        else if (WATERWAY.test(t.waterway || '')) D.lines.push({ id: item.id, pts: p[0], bb: item.bb, nav: navWay(t) });   // canale chiuso ad anello
        else return;
        grow(item.bb);
      });
      return;
    }
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      if (!(WATERWAY.test(t.waterway || '') || isFair)) return;
      (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach((l, j) => { const pts = l.map(ll), bb = bbOf(pts); D.lines.push({ id: id + '#' + j, pts, bb, nav: navWay(t) }); grow(bb); });
    }
  });
  return D;
}
/* Estrae i dati locali che toccano il riquadro della griglia. Nessuna rete. */
async function fetchNautical(box) {
  const b = Water.boxBounds(box), D = await nauticaFor(b);
  const hit = bb => bb[0] <= b.e && bb[2] >= b.w && bb[1] <= b.n && bb[3] >= b.s;
  const out = { lines: [], lines2: [], corridorAreas: [], restrictAreas: [], hardAreas: [], nodes: [], hazards: [], noGoAreas: [], info: { canali: 0, segnali: 0, coppie: 0, lagune: 0, ostacoli: 0 } };
  const m = 0.01;   // le fasce di rispetto sporgono dal riquadro
  (D.hazards || []).forEach(h => { if (h.lng >= b.w - m && h.lng <= b.e + m && h.lat >= b.s - m && h.lat <= b.n + m) { out.hazards.push(h); out.info.ostacoli++; } });
  (D.noGoAreas || []).forEach(a => { if (a.bb[0] <= b.e + m && a.bb[2] >= b.w - m && a.bb[1] <= b.n + m && a.bb[3] >= b.s - m) { out.noGoAreas.push(a); out.info.ostacoli++; } });
  out.laneAreas = (D.laneAreas || []).filter(a => a.bb[0] <= b.e && a.bb[2] >= b.w && a.bb[1] <= b.n && a.bb[3] >= b.s);
  out.info.corsie = out.laneAreas.length;
  D.lines.forEach(l => { if (!hit(l.bb)) return; if (l.nav) { out.lines.push(l.pts); out.info.canali++; } else out.lines2.push(l.pts); });
  D.corridorAreas.forEach(a => { if (hit(a.bb)) { out.corridorAreas.push(a.rings); out.info.canali++; } });
  D.restrictAreas.forEach(a => { if (hit(a.bb)) { out.restrictAreas.push(a.rings); if (a.hard) out.hardAreas.push(a.rings); if (a.lagoon) out.info.lagune++; } });
  D.nodes.forEach(n => { if (n.lng >= b.w && n.lng <= b.e && n.lat >= b.s && n.lat <= b.n) out.nodes.push(n); });
  return out;
}
/* Disegna i dati nautici sulla griglia: zone lagunari, corsi d'acqua e canali segnalati (vedi channels.js). */
function rasterNautical(ctx, W, H, box, nd) {
  const ox = box.tx0 * Water.TILE, oy = box.ty0 * Water.TILE;
  const P = p => [Water.lon2px(p.lng, box.z) - ox, Water.lat2px(p.lat, box.z) - oy];
  const bb = Water.boxBounds(box), mpp = 156543.03392 * Math.cos((bb.s + bb.n) / 2 * Math.PI / 180) / 2 ** box.z;
  const read = () => { const d = ctx.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 96 ? 1 : 0; return m; };
  const poly = r => r.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // laguna, barene, velme, secche
  ctx.clearRect(0, 0, W, H);
  let restrict = null;
  /* ogni zona è un poligono con eventuali buchi (isole): riempita da sola, così zone sovrapposte non si annullano */
  if (nd.restrictAreas.length) { nd.restrictAreas.forEach(rings => { ctx.beginPath(); rings.forEach(r => { poly(r); ctx.closePath(); }); ctx.fill('evenodd'); }); restrict = read(); }
  ctx.clearRect(0, 0, W, H);
  let hard = null;
  if (nd.hardAreas && nd.hardAreas.length) { nd.hardAreas.forEach(rings => { ctx.beginPath(); rings.forEach(r => { poly(r); ctx.closePath(); }); ctx.fill('evenodd'); }); hard = read(); }
  // corsi d'acqua e canali mappati come aree
  ctx.clearRect(0, 0, W, H);
  let lines = null;
  if (nd.lines.length || nd.corridorAreas.length) {
    ctx.lineWidth = Math.max(3, 30 / mpp);
    nd.lines.forEach(l => { ctx.beginPath(); poly(l); ctx.stroke(); });
    nd.corridorAreas.forEach(rings => { ctx.beginPath(); rings.forEach(r => { poly(r); ctx.closePath(); }); ctx.fill('evenodd'); });
    lines = read();
  }
  ctx.clearRect(0, 0, W, H);
  /* solo il centro della linea del canale (pochi metri) apre il varco in una fila di briccole: con tutta la fascia di 30 m,
     un canale mappato lungo una fila di pali la rendeva attraversabile e la rotta faceva lo slalom tra i pali (Chioggia) */
  let linesCore = null;
  if (nd.lines.length) {
    ctx.lineWidth = Math.max(1.5, 4 / mpp);
    nd.lines.forEach(l => { ctx.beginPath(); poly(l); ctx.stroke(); });
    linesCore = read();
  }
  ctx.clearRect(0, 0, W, H);
  /* corsi d'acqua non dichiarati navigabili: water.js li usa solo per scavalcare i ponti */
  let lines2 = null;
  if (nd.lines2 && nd.lines2.length) {
    ctx.lineWidth = Math.max(3, 30 / mpp);
    nd.lines2.forEach(l => { ctx.beginPath(); poly(l); ctx.stroke(); });
    lines2 = read();
  }
  ctx.clearRect(0, 0, W, H);
  // canali segnalati da briccole e segnali laterali (channels.js)
  if (!window.Channels) throw new Error('Manca il file channels.js: aggiorna l\'app');
  const ch = Channels.analyze(nd.nodes, null, nd.lines);
  nd.info.segnali = ch.marks; nd.info.coppie = ch.pairs;
  const m = Channels.rasterize(ch, W, H, P, mpp);
  /* regola 9 anche nei canali navigabili mappati come linea: corsia di dritta rispetto alla linea del canale */
  const sideS = { res: m, W, H, toPx: P, mpp };
  nd.lines.forEach(l => { for (let k = 1; k < l.length; k++) Channels.paintSide(sideS, l[k - 1], l[k], 30, { half: Math.max(1.5, 15 / mpp), keep: true }); });
  /* raccordo alle estremità dei canali navigabili: 200 m in prosecuzione dove i fondali EMODnet (maglia 115 m, non vedono
     i dragaggi) non contano. Es. l'imbocco del canale di Zaule cadeva in una casella "troppo bassa". Terra e briccole restano. */
  if (m.ext) nd.lines.forEach(l => {
    if (l.length < 2) return;
    [[l[1], l[0]], [l[l.length - 2], l[l.length - 1]]].forEach(([p, q]) => {
      const [px, py] = P(p), [qx, qy] = P(q), L = Math.hypot(qx - px, qy - py);
      if (L < 0.5) return;
      const ux = (qx - px) / L, uy = (qy - py) / L, n = Math.round(200 / mpp), r = Math.max(1, Math.round(15 / mpp));
      for (let t = 0; t <= n; t++) {
        const cx = Math.round(qx + ux * t), cy = Math.round(qy + uy * t);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= r * r) m.ext[y * W + x] = 1;
        }
      }
    });
  });
  if (nd.hazards && (nd.hazards.length || nd.noGoAreas.length)) drawNoGo(m.nogo, W, H, P, mpp, nd.hazards, nd.noGoAreas);
  let lane = null;
  if (nd.laneAreas && nd.laneAreas.length) { lane = new Uint8Array(W * H); drawNoGo(lane, W, H, P, mpp, [], nd.laneAreas); }
  return { restrict, hard, lines, linesCore, lines2, sx: m.sx, sy: m.sy, sp: m.sp, sn: m.sn, axis: m.axis, ext: m.ext, zone: m.zone, barrier: m.barrier, nogo: m.nogo, lane, ch, coastM: S.set.coast };
}

/* Calcolo automatico: parte da solo quando partenza, tappe o destinazione cambiano.
   Le tappe dell'utente restano in S.route.via; il percorso calcolato va in S.route.path.
   Finché non c'è una rotta verificata, sulla carta non viene tracciata nessuna linea. */
let autoT = 0, autoSeq = 0;
function autoSchedule() {
  clearTimeout(autoT);
  if (S.pick || !S.route.start || !S.route.dest) return;
  autoT = setTimeout(autoRoute, 600);
  busy.start(1); busy.set('Calcolo della rotta…', 1, 0.01);
}
async function autoRoute() { return autoRouteRun(); }
async function autoRouteRun() {
  if (window.ENC && ENC.whenReady) await ENC.whenReady();
  const w = userPts().map(p => ({ lat: p.lat, lng: p.lng }));
  if (w.length < 2) { toast('Imposta partenza e destinazione'); return; }
  stopWorker();
  S.gapTxt = ''; gapLayer.clearLayers();
  const seq = ++autoSeq, MOVE_MAX = 600;
  S.edgeWarn = false;
  $('bAuto').disabled = true;
  busy.start(w.length - 1);
  busy.set(w.length > 2 ? `Calcolo della rotta: ${w.length - 1} tratti…` : 'Calcolo della rotta…', 1, 0.01);
  S.grids = []; S.coarse = null; showWater(false);
  const legs = [], moved = [], offLegs = [], deepLegs = [], info = { canali: 0, segnali: 0, coppie: 0, lagune: 0, ostacoli: 0 };
  const name = i => i === 0 ? 'La partenza' : i === w.length - 1 ? "L'arrivo" : `La tappa ${i}`;
  const pName = p => p.ui != null ? name(p.ui) : 'Un punto intermedio della rotta';
  let plan = null;
  try {
    plan = await planSegments(w, name);
    if (seq !== autoSeq) return;
    if (plan.cg) S.coarse = { g: plan.cg, limM: plan.limM };
    const segs = plan.segs;
    busy.legs = segs.length;
    for (let k = 1; k <= segs.length; k++) {
      const sg = segs[k - 1], n = segs.length;
      /* mare aperto: il percorso della griglia costiera è già verificato (acqua, limiti, pericoli, fondali) */
      if (sg.kind === 'open') { legs.push([sg.a, ...sg.mid, sg.b]); busy.set(`Tratto ${k}/${n}: mare aperto`, k, 1); continue; }
      let prep = await loadGrid(sg.a, sg.b, k, n, plan, sg.via, sg.pad);
      if (seq !== autoSeq) return;
      busy.set(`Tratto ${k}/${n}: cerco il percorso…`, k, 0.75);
      let res = await routeLeg(prep, sg.a, sg.b);
      if (seq !== autoSeq) return;
      /* nessun passaggio in una carta stretta: si riprova una volta su una carta più ampia (la bocca di porto o il canale
         giusto possono stare appena fuori), anche a zoom più basso */
      if (!res.error && !res.cells && plan.cg) {
        busy.set(`Tratto ${k}/${n}: allargo la carta…`, k, 0.4);
        const prep2 = await loadGrid(sg.a, sg.b, k, n, plan, sg.via, Math.max(sg.pad || 0, 6000), 13);
        if (seq !== autoSeq) return;
        const res2 = await routeLeg(prep2, sg.a, sg.b);
        if (seq !== autoSeq) return;
        if (res2.cells) { prep = prep2; res = res2; }
      }
      /* zoom ravvicinato (16-17), con divisione del tratto se serve: solo se il resto non è bastato */
      let pieces = [{ prep, res, a: sg.a, b: sg.b }];
      if (!res.error && !res.cells) {
        busy.set(`Tratto ${k}/${n}: zoom ravvicinato…`, k, 0.4);
        const cs = await closeSolve(sg.a, sg.b, sg.via || [], 0, k, n, plan, seq);
        if (seq !== autoSeq) return;
        if (cs) pieces = cs;
      }
      for (const pc of pieces) {
      const res = pc.res, prep = pc.prep, sa = pc.a, sb = pc.b;
      if (res.error) throw new Error(`Tratto ${k}: errore nel calcolo (${res.error})`);
      /* griglia restituita dal Worker: serve per le coordinate e per "Mostra acque navigabili" */
      const g = { z: res.z, ox: res.ox, oy: res.oy, W: res.W, H: res.H, mpp: res.mpp, d: res.d, buf: res.buf, info: prep.info, ch: prep.ch, enc: prep.enc, depthUsed: prep.depthUsed };
      S.grids.push(g);
      Object.keys(info).forEach(x => { info[x] = Math.max(info[x], g.info[x] || 0); });
      [sa, sb].forEach((pt, j) => {
        const e = res.ends[j];
        if (e.i < 0) throw new Error(g.enc ? `${pName(pt)}: secondo le carte ENC non c'è acqua profonda almeno ${num1(S.set.draft + S.set.ukc)} m (pescaggio + margine) nelle vicinanze`
          : `${pName(pt)}: nessuna acqua navigabile nelle vicinanze${plan.cg && isFinite(plan.limM) ? ` entro ${mi(plan.rules.limNm)} dalla costa` : ''}`);
        if (!e.moved) return;
        const np = Water.cellLL(g, e.i), dd = dist(pt, np);
        if (dd > (pt.ui != null ? MOVE_MAX : 1500)) throw new Error(`${pName(pt)}: il punto navigabile più vicino è a ${fmtDist(dd)}${g.enc ? ` (profondità almeno ${num1(S.set.draft + S.set.ukc)} m)` : ''}. Sposta il punto in un canale`);
        /* il punto è condiviso con il tratto vicino: spostandolo resta collegato */
        pt.lat = np.lat; pt.lng = np.lng;
        if (pt.ui != null && !moved.includes(pt.ui)) moved.push(pt.ui);
      });
      if (!res.cells && res.gap) {
        /* segna sulla carta dove si interrompe il passaggio e mostra le acque navigabili */
        const ga = Water.cellLL(g, res.gap.a), gb = Water.cellLL(g, res.gap.b), gd = dist(ga, gb);
        gapLayer.clearLayers();
        L.polyline([[ga.lat, ga.lng], [gb.lat, gb.lng]], { color: '#ff2d2d', weight: 4, dashArray: '6 6', interactive: false }).addTo(gapLayer);
        [ga, gb].forEach(p => L.circleMarker([p.lat, p.lng], { radius: 9, color: '#ff2d2d', weight: 3, fillColor: '#fff', fillOpacity: 0.9, interactive: false }).addTo(gapLayer));
        gapLayer.addTo(map);
        map.fitBounds(L.latLngBounds([[ga.lat, ga.lng], [gb.lat, gb.lng]]).pad(3));
        S.gapTxt = ` La rotta si interrompe tra i due cerchi rossi sulla carta (${fmtDist(gd)} senza passaggio): lì nei dati mancano canale o briccole, oppure c'è una zona vietata. Puoi aggiungere una tappa in quel punto, se lo conosci navigabile.`;
      }
      if (!res.cells) throw new Error(g.enc ? `Tratto ${k}: secondo le carte ENC non esiste un passaggio con almeno ${num1(S.set.draft + S.set.ukc)} m di profondità (pescaggio ${num1(S.set.draft)} m + margine ${num1(S.set.ukc)} m)`
        : `Tratto ${k}: nessun passaggio nei canali navigabili dei dati nautici locali. Aggiungi una tappa lungo il canale che vuoi seguire`);
      if (res.bad) throw new Error(`Tratto ${k}: verifica fallita, un segmento esce dalle acque navigabili`);
      const cells = res.cells;
      if (res.offChannelM > 0) offLegs.push(`tratto ${k}: ${fmtDist(res.offChannelM)}`);
      if (res.deepM > 0) deepLegs.push(`tratto ${k}: ${fmtDist(res.deepM)}`);
      const lp = cells.map(i => Water.cellLL(g, i));
      lp[0] = sa; lp[lp.length - 1] = sb;
      legs.push(lp);
      }
    }
  } catch (e) {
    if (seq !== autoSeq) return;
    S.route.path = null; S.route.blocked = true; routeChanged();
    autoMsg('Nessuna rotta sicura: ' + (e.message || 'calcolo non riuscito') + '.' +
      (S.grids.length ? ' Tocca "Mostra acque navigabili" per vedere i canali trovati.' : ''));
    busy.fail('Rotta non calcolata: ' + (e.message || 'calcolo non riuscito') + '.' + (S.gapTxt || ''));
    if (S.gapTxt) { autoMsg($('autoMsg').textContent + S.gapTxt); showWater(true); }
    if (!S.gapTxt) showWater(false);
    $('bAuto').disabled = false; return;
  }
  if (seq !== autoSeq) return;
  const pts = [legs[0][0]];
  legs.forEach(leg => { pts.push(...leg.slice(1)); });
  const clean = pts.map(p => ({ lat: p.lat, lng: p.lng })).filter((p, i, a) => i === 0 || i === a.length - 1 || dist(p, a[i - 1]) > 15);
  if (S.active) stopNav();
  const wu = w.map(p => ({ lat: p.lat, lng: p.lng }));
  S.route.start = wu[0]; S.route.via = wu.slice(1, -1); S.route.dest = wu[wu.length - 1];
  S.route.path = clean.slice(1, -1); S.route.blocked = false;
  routeChanged();
  map.fitBounds(routeLine.getBounds().pad(0.15));
  if (S.tab) minSheet(true);
  showWater(false);
  const depTxt = S.grids.some(g => g.depthUsed) ? ` Fuori dai canali evitati i fondali sotto ${num1(S.set.draft + S.set.ukc)} m secondo EMODnet (dato indicativo, maglia di circa 115 m).` : '';
  const offTxt = offLegs.length ? ` ATTENZIONE: per raggiungere partenza, arrivo o tappe la rotta esce dai canali segnalati vicino a quei punti (${offLegs.join(', ')}). In quei tratti i fondali non sono noti: procedi a vista e a velocità ridotta.` : '';
  const deepTxt = deepLegs.length ? ` ATTENZIONE: dove mancano canali o briccole nei dati la rotta segue l'acqua profonda secondo EMODnet (${deepLegs.join(', ')}): in laguna verifica i segnalamenti, i canali possono essere diversi.` : '';
  const edge = S.edgeWarn ? ' Attenzione: partenza o arrivo sono al margine dell\'area dei dati nautici, lì canali e briccole potrebbero mancare.' : '';
  const mv = moved.length ? ' ' + moved.map(name).join(', ') + (moved.length > 1 ? ' sono state spostate' : ' è stata spostata') + ' nel punto navigabile più vicino.' : '';
  const encUsed = S.grids.filter(g => g.enc).map(g => g.enc), encAll = encUsed.length === S.grids.length && encUsed.every(e => e.fraction > 0.999);
  const encCells = [...new Set(encUsed.flatMap(e => e.cells))].join(', ');
  const osmTxt = `${info.canali} canali mappati, ${info.segnali} briccole e segnali di canale, ${info.coppie} sezioni di canale riconosciute, ${info.lagune ? 'laguna riconosciuta' : 'nessuna laguna nei dati'}${info.ostacoli ? `, ${info.ostacoli} piattaforme o allevamenti evitati` : ''}`;
  autoMsg(encAll
    ? `Rotta calcolata con le carte ENC ufficiali (${encCells}): passa solo dove la profondità è almeno ${num1(S.set.draft + S.set.ukc)} m (pescaggio ${num1(S.set.draft)} m + margine ${num1(S.set.ukc)} m) e lontano da terra, opere e ostacoli.${mv} Verifica che le celle siano aggiornate con gli ultimi Avvisi ai Naviganti.`
    : encUsed.length
      ? `Rotta calcolata con le carte ENC (${encCells}) dove disponibili e con OpenStreetMap/OpenSeaMap altrove (${osmTxt}).${mv}${depTxt}${deepTxt}${edge}${offTxt} Fuori dalle ENC le profondità non sono note: verifica con i segnalamenti in acqua.`
      : `Rotta calcolata (${osmTxt}).${mv}${depTxt}${deepTxt}${edge}${offTxt} I dati OpenStreetMap/OpenSeaMap del file locale non indicano le profondità e possono essere incompleti: verifica sempre con i segnalamenti in acqua.`);
  let tot = 0; for (let i = 1; i < clean.length; i++) tot += dist(clean[i - 1], clean[i]);
  /* distanza massima dalla costa lungo la rotta (campionata ogni ~100 m sulla griglia costiera) */
  const rules = plan ? plan.rules : seaRules();
  let farM = -1;
  if (plan && plan.cg && plan.cg.cd) for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i], nS = Math.max(1, Math.ceil(dist(a, b) / 100));
    for (let s = 0; s <= nS; s++) farM = Math.max(farM, coastDistAt(plan.cg, { lat: a.lat + (b.lat - a.lat) * s / nS, lng: a.lng + (b.lng - a.lng) * s / nS }));
  }
  const coastTxt = (farM >= 0
    ? ` Distanza massima dalla costa lungo la rotta: ${mi(farM / NM)}` + (isFinite(rules.limNm) ? ` (limite ${mi(rules.limNm)}, ${rules.why}).` : '.')
    : isFinite(rules.limNm) && plan && plan.noCoast ? ` Limite di ${mi(rules.limNm)} dalla costa non verificato: qui mancano i dati EMODnet (lago, fiume o zona non scaricata).` : '') +
    (rules.warn.length ? ' ATTENZIONE: ' + rules.warn.join(' ') : '');
  if (coastTxt) autoMsg($('autoMsg').textContent + coastTxt);
  if (offLegs.length || rules.warn.length) busy.fail(`Rotta calcolata: ${fmtDist(tot)}.` + (offLegs.length ? ` Attenzione: ultimo tratto fuori dai canali segnalati (${offLegs.join(', ')}), procedi a vista e piano.` : '') + (rules.warn.length ? ' ' + rules.warn.join(' ') : ''));
  else busy.done(`Rotta calcolata: ${fmtDist(tot)}, circa ${fmtDur(tot / (S.set.plan / KN))} a ${S.set.plan} nodi` + (farM >= 0 ? `, al massimo a ${mi(farM / NM)} dalla costa` : '') + '. Verificala sulla carta.');
  $('bAuto').disabled = false;
}

/* Mostra sulla carta l'acqua riconosciuta dall'ultimo calcolo (in azzurro): utile per capire perché
   una rotta passa da un punto o perché non si trova un passaggio. */
const waterLayer = L.layerGroup(), gapLayer = L.layerGroup();
function showWater(on) {
  waterLayer.clearLayers();
  /* zona oltre il limite di distanza dalla costa (rosso), riproiettata in Mercatore per la carta */
  if (on && S.coarse && S.coarse.g.cd && isFinite(S.coarse.limM)) {
    const g = S.coarse.g, sc = Math.max(1, Math.ceil(Math.max(g.W, g.H) / 2000)), OW = Math.ceil(g.W / sc), OH = Math.ceil(g.H / sc);
    const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
    const cx = cv.getContext('2d'), im = cx.createImageData(OW, OH);
    const my = lat => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)), y0 = my(g.n), y1 = my(g.s);
    for (let oy = 0; oy < OH; oy++) {
      const lat = DEG * (2 * Math.atan(Math.exp(y0 + (y1 - y0) * (oy + 0.5) / OH)) - Math.PI / 2), r = Math.floor((g.n - lat) / g.dLat);
      if (r < 0 || r >= g.H) continue;
      for (let ox = 0; ox < OW; ox++) {
        const i = r * g.W + Math.min(g.W - 1, ox * sc), j = (oy * OW + ox) * 4;
        if (g.sea[i] && g.cd[i] > S.coarse.limM) { im.data[j] = 230; im.data[j + 1] = 30; im.data[j + 2] = 30; im.data[j + 3] = 70; }
      }
    }
    cx.putImageData(im, 0, 0);
    L.imageOverlay(cv.toDataURL(), [[g.s, g.w], [g.n, g.e]], { interactive: false, zIndex: 3 }).addTo(waterLayer);
    waterLayer.addTo(map);
  }
  if (on && S.grids.length) {
    S.grids.forEach(g => {
      const cv = document.createElement('canvas'); cv.width = g.W; cv.height = g.H;
      const cx = cv.getContext('2d'), im = cx.createImageData(g.W, g.H);
      for (let i = 0; i < g.d.length; i++) if (g.d[i]) {
        const j = i * 4, b = g.buf && g.buf[i];
        im.data[j] = b ? 255 : 0; im.data[j + 1] = b ? 150 : 140; im.data[j + 2] = b ? 40 : 255; im.data[j + 3] = b ? 120 : 150;
      }
      cx.putImageData(im, 0, 0);
      L.imageOverlay(cv.toDataURL(), Water.gridBounds(g), { interactive: false, zIndex: 4 }).addTo(waterLayer);
      /* asse dei canali riconosciuto (verde) e file di briccole usate come barriera (rosso) */
      if (g.ch) {
        g.ch.axis.concat(g.ch.ext).forEach(s => { if (s.a.lat !== s.b.lat || s.a.lng !== s.b.lng)
          L.polyline([[s.a.lat, s.a.lng], [s.b.lat, s.b.lng]], { color: '#16c060', weight: 3, interactive: false }).addTo(waterLayer); });
        g.ch.barrier.forEach(s => L.polyline([[s.a.lat, s.a.lng], [s.b.lat, s.b.lng]], { color: '#ff2d2d', weight: 2, interactive: false }).addTo(waterLayer));
        (g.ch.band || []).forEach(q => L.polygon(q.map(p => [p.lat, p.lng]), { color: '#ff2d2d', weight: 0, fillColor: '#ff2d2d', fillOpacity: 0.25, interactive: false }).addTo(waterLayer));
      }
    });
    waterLayer.addTo(map);
  } else if (!(on && S.coarse)) map.removeLayer(waterLayer);
  $('bWater').textContent = on ? 'Nascondi acque navigabili' : 'Mostra acque navigabili';
  $('bWater').hidden = !S.grids.length && !(S.coarse && isFinite(S.coarse.limM));
  S.waterOn = on;
}

/* ---------- Interfaccia ---------- */
const GRID = [['sog', 'SOG nodi'], ['cog', 'COG'], ['brg', 'BRG al punto'], ['dtw', 'DTW'], ['xte', 'XTE'], ['vmg', 'VMG nodi'],
  ['ttg', 'TTG punto'], ['eta', 'ETA punto'], ['rem', 'Distanza rimanente'], ['fin', 'Arrivo finale'], ['pos', 'Posizione', 1],
  ['trip', 'Percorso'], ['time', 'Tempo'], ['avg', 'Media nodi'], ['max', 'Max nodi'], ['acc', 'Precisione GPS'],
  ['wind', 'Vento'], ['gust', 'Raffica'], ['wave', 'Onda'], ['pres', 'Pressione'], ['anc', 'Deriva ancora'], ['utc', 'Ora UTC']];
$('grid').innerHTML = GRID.map(g => `<div class="g${g[2] ? ' w' : ''}"><span class="lbl">${g[1]}</span><b id="d-${g[0]}">--</b></div>`).join('');
const setD = (id, v) => { const e = $('d-' + id); if (e) e.textContent = v; };

function ui() {
  const p = S.pos, N = nav();
  $('sog').textContent = p ? p.sog.toFixed(1) : '0.0';
  $('cog').textContent = p ? fmtAng(p.cog) : '---°';
  $('tgtLbl').textContent = N.label;
  $('brg').textContent = fmtAng(N.brg);
  $('dtw').textContent = fmtDist(N.dtw);
  $('xte').textContent = N.xte != null ? (N.xte >= 0 ? 'D ' : 'S ') + fmtDist(Math.abs(N.xte)) : '--';
  $('eta').textContent = N.eta ? fmtClock(N.eta) : '--:--';
  $('vmg').textContent = N.vmg != null ? N.vmg.toFixed(1) : '--';

  if ($('sheet').hidden || S.tab !== 'dati') return;
  const el = p && S.trip.t0 ? (Date.now() - S.trip.t0) / 1000 : NaN;
  const wx = S.wx || {};
  const f = (v, n, u) => v != null && isFinite(v) ? (+v).toFixed(n) + (u || '') : '--';
  setD('sog', p ? p.sog.toFixed(1) : '--'); setD('cog', p ? fmtAng(p.cog) : '--');
  setD('brg', fmtAng(N.brg)); setD('dtw', fmtDist(N.dtw));
  setD('xte', N.xte != null ? (N.xte >= 0 ? 'D ' : 'S ') + fmtDist(Math.abs(N.xte)) : '--');
  setD('vmg', f(N.vmg, 1)); setD('ttg', fmtDur(N.ttg)); setD('eta', N.eta ? fmtClock(N.eta) : '--');
  setD('rem', fmtDist(N.rem)); setD('fin', N.eta && S.active ? fmtClock(N.eta) : '--');
  setD('pos', fmtPos(p)); setD('trip', fmtDist(S.trip.dist)); setD('time', fmtDur(el));
  setD('avg', isFinite(el) && el > 30 ? (S.trip.dist / el * KN).toFixed(1) : '--');
  setD('max', S.trip.max.toFixed(1)); setD('acc', p && p.acc != null ? '±' + Math.round(p.acc) + ' m' : '--');
  setD('wind', wx.wind_speed_10m != null ? `${fmtAng(wx.wind_direction_10m)} ${Math.round(wx.wind_speed_10m)} kn` : '--');
  setD('gust', f(wx.wind_gusts_10m, 0, ' kn'));
  setD('wave', wx.wave_height != null ? `${wx.wave_height.toFixed(1)} m ${f(wx.wave_period, 0, ' s')}` : '--');
  setD('pres', f(wx.pressure_msl, 0, ' hPa'));
  setD('anc', S.anchor && p ? fmtDist(dist(p, S.anchor)) + ' / ' + S.anchor.r + ' m' : '--');
  const u = new Date(); setD('utc', pad2(u.getUTCHours()) + ':' + pad2(u.getUTCMinutes()) + ':' + pad2(u.getUTCSeconds()));
}

function fabs() {
  const g = $('bGps');
  g.className = 'fab' + (S.sim ? ' on' : !S.gpsOn ? '' : (Date.now() - S.lastFix < 8000 ? ' ok' : ' search'));
  g.textContent = S.sim ? 'SIM' : 'GPS';
  $('bFollow').className = 'fab' + (S.set.follow ? ' on' : '');
  $('bNight').className = 'fab' + (S.set.night ? ' on' : '');
  $('bMute').className = 'fab' + (S.set.mute ? '' : ' on');
  $('bMute').textContent = S.set.mute ? 'MUTO' : 'AUDIO';
  $('bGo').textContent = S.active ? 'Ferma navigazione' : 'Avvia navigazione';
  $('bSim').textContent = S.sim ? 'Ferma simulazione' : 'Simula';
}

function renderRoute() {
  const w = wps(), st = S.route.start, de = S.route.dest;
  $('tStart').textContent = st ? fmtPos(st) : 'non impostata';
  $('tDest').textContent = de ? fmtPos(de) : 'non impostata';
  let html = '', tot = 0;
  for (let i = 1; i < w.length; i++) {
    const d = dist(w[i - 1], w[i]); tot += d;
    const a = i === 1 ? 'P' : String(i - 1), b = i === w.length - 1 ? 'D' : String(i);
    const isVia = i < w.length - 1;
    html += `<div class="leg"><b>${a} → ${b}${S.active && i === S.leg ? ' (in corso)' : ''}</b><span>${fmtAng(brg(w[i - 1], w[i]))}</span><span>${fmtDist(d)}</span>` +
      (isVia ? `<button data-act="delVia" data-i="${i - 1}" aria-label="Elimina tappa ${i}">✕</button>` : '<span></span>') + '</div>';
  }
  if (S.route.path) html = S.route.via.map((p, i) =>
    `<div class="leg"><b>Tappa ${i + 1}</b><span></span><span></span><button data-act="delVia" data-i="${i}" aria-label="Elimina tappa ${i + 1}">✕</button></div>`).join('');
  $('legs').innerHTML = !S.route.path && w.length > 13 ? `<p class="note">${w.length - 1} tratti</p>` : html;
  $('bUndo').hidden = true;
  const bad = routeConflicts();
  $('sum').innerHTML = S.route.blocked ? '<span class="wr">Rotta non tracciata: vedi il messaggio sopra</span>' : w.length > 1
    ? `<span>Totale ${fmtDist(tot)}</span><span>Durata ${fmtDur(tot / (S.set.plan / KN))}</span>` + (bad ? `<span class="wr">${bad} ostacoli vicino alla rotta</span>` : '')
    : '<span class="note">Scegli partenza e destinazione sulla carta, con il GPS o cercando un luogo.</span>';
  $('sPlan').value = S.set.plan;
  $('saved').innerHTML = S.saved.map((r, i) =>
    `<div class="row" style="grid-template-columns:1fr auto auto"><b>${esc(r.name)}</b><button data-act="loadRoute" data-i="${i}">Carica</button><button data-act="delRoute" data-i="${i}" aria-label="Elimina">✕</button></div>`).join('');
  $('results').innerHTML = S.results.map((r, i) =>
    `<div class="res"><p>${esc(r.display)}</p><div class="btns">` +
    ['start|Partenza', 'via|Tappa', 'dest|Destinazione'].map(x => { const [k, l] = x.split('|'); return `<button data-act="useRes" data-k="${k}" data-i="${i}">${l}</button>`; }).join('') +
    `<button data-act="goRes" data-i="${i}">Vai</button></div></div>`).join('');
  fabs();
}
function routeConflicts() {
  const w = wps(); let n = 0;
  S.hazards.forEach(h => { for (let i = 1; i < w.length; i++) if (segDist(h, w[i - 1], w[i]) < h.r) { n++; break; } });
  return n;
}
function renderHaz() {
  $('hList').innerHTML = S.hazards.map(h =>
    `<div class="row" style="grid-template-columns:1fr auto auto auto"><b>${esc(h.name)}</b><span>${h.r} m</span><button data-act="goHaz" data-id="${esc(h.id)}">Vai</button><button data-act="delHaz" data-id="${esc(h.id)}" aria-label="Elimina">✕</button></div>`).join('')
    || '<p class="note">Nessuna secca o ostacolo segnato.</p>';
  $('bAnchor').textContent = S.anchor ? 'Ritira ancora (allarme attivo)' : 'Getta ancora qui';
}

const TITLES = { rotta: 'Rotta', dati: 'Dati', avvisi: 'Avvisi', mappa: 'Carta' };
function minSheet(on) { $('sheet').classList.toggle('min', on); if (!on) $('sheet').scrollTop = 0; }
function openSheet(t) {
  S.tab = t; $('sheet').hidden = false; minSheet(false);
  $('sheetTitle').textContent = TITLES[t] || '';
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'p-' + t; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'rotta') renderRoute();
  if (t === 'avvisi') renderHaz();
  ui();
}
function closeSheet() {
  S.tab = null; $('sheet').hidden = true; $('sheet').classList.remove('min');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
}
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => { S.tab === b.dataset.t ? closeSheet() : openSheet(b.dataset.t); }; });

function pick(type) {
  S.pick = type; closeSheet(); map.closePopup();
  $('pickBar').hidden = false;
  $('pickTxt').textContent = { start: 'Tocca la carta: PARTENZA', via: 'Tocca la carta: TAPPE (poi Fine)', dest: 'Tocca la carta: DESTINAZIONE', hazard: 'Tocca la carta: SECCA / OSTACOLO' }[type];
}
function endPick() { S.pick = null; $('pickBar').hidden = true; if (!S.tab) openSheet('rotta'); autoSchedule(); }
$('pickDone').onclick = endPick;
/* pannello: tocco sulla maniglia = abbassa/alza; trascina giù = abbassa (e se già abbassato chiude), su = alza */
let swY = null, swDy = 0, swMoved = false;
$('sheetClose').onclick = () => { if (swMoved) { swMoved = false; return; } minSheet(!$('sheet').classList.contains('min')); };
$('sheet').addEventListener('touchstart', e => {
  const sh = $('sheet');
  if (e.target.closest('#sheetClose') || sh.scrollTop <= 0 || sh.classList.contains('min')) { swY = e.touches[0].clientY; swDy = 0; }
  else swY = null;
}, { passive: true });
$('sheet').addEventListener('touchmove', e => {
  if (swY == null) return;
  const sh = $('sheet'); swDy = e.touches[0].clientY - swY;
  if (swDy > 0 && (sh.scrollTop <= 0 || e.target.closest('#sheetClose'))) {
    e.preventDefault(); sh.classList.add('drag'); sh.style.transform = `translateY(${swDy}px)`;
  } else if (swDy < 0 && !sh.classList.contains('min')) { swY = null; }
}, { passive: false });
$('sheet').addEventListener('touchend', () => {
  if (swY == null) return;
  const sh = $('sheet'), wasMin = sh.classList.contains('min');
  sh.classList.remove('drag'); sh.style.transform = '';
  if (Math.abs(swDy) > 10) swMoved = true;
  if (swDy > 60) { if (wasMin) closeSheet(); else minSheet(true); }
  else if (swDy < -30 && wasMin) minSheet(false);
  swY = null;
  setTimeout(() => { swMoved = false; }, 350);
});

/* ---------- Ricerca luoghi ---------- */
$('fSearch').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('q').value.trim(); if (!q) return;
  const m = q.match(/^(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/);
  if (m) {
    S.results = [{ display: 'Coordinate ' + q, lat: parseFloat(m[1].replace(',', '.')), lng: parseFloat(m[2].replace(',', '.')) }];
  } else {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=it&q=' + encodeURIComponent(q));
      const j = await r.json();
      S.results = j.map(x => ({ display: x.display_name, lat: +x.lat, lng: +x.lon }));
      if (!S.results.length) toast('Nessun risultato');
    } catch (err) { toast('Ricerca non disponibile senza rete'); S.results = []; }
  }
  renderRoute();
});

/* ---------- GPX ---------- */
function gpxText(withTrack) {
  const w = wps();
  let s = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rotta Nautica" xmlns="http://www.topografix.com/GPX/1/1">\n';
  if (!withTrack && w.length) {
    s += '<rte><name>Rotta</name>\n' + w.map((p, i) =>
      `<rtept lat="${p.lat}" lon="${p.lng}"><name>${i === 0 ? 'Partenza' : i === w.length - 1 ? 'Destinazione' : 'Tappa ' + i}</name></rtept>`).join('\n') + '\n</rte>\n';
  }
  if (withTrack && S.track.length) {
    s += '<trk><name>Traccia</name><trkseg>\n' + S.track.map(p =>
      `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n') + '\n</trkseg></trk>\n';
  }
  return s + '</gpx>';
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const doc = new DOMParser().parseFromString(await f.text(), 'text/xml');
    let nodes = [...doc.getElementsByTagName('rtept')];
    if (!nodes.length) nodes = [...doc.getElementsByTagName('wpt')];
    const pts = nodes.map(n => ({ lat: +n.getAttribute('lat'), lng: +n.getAttribute('lon') })).filter(p => isFinite(p.lat) && isFinite(p.lng));
    if (pts.length < 2) { toast('Il file non contiene una rotta valida'); return; }
    stopNav();
    S.route = { start: pts[0], via: [], dest: pts[pts.length - 1], path: pts.slice(1, -1) };
    routeChanged(); map.fitBounds(routeLine.getBounds().pad(0.2)); toast('Rotta importata');
  } catch (err) { toast('Impossibile leggere il file GPX'); }
  e.target.value = '';
});

/* ---------- Simulazione ---------- */
function startSim() {
  const w = wps();
  if (w.length < 2) { toast('Imposta partenza e destinazione'); return; }
  audio(); stopGps();
  S.simBackup = { track: S.track.slice(), trip: Object.assign({}, S.trip) };
  S.track = []; trackLine.setLatLngs([]); S.trip = { dist: 0, t0: null, max: 0 };
  S.pos = null; S.sogS = null;
  S.sim = { i: 0, pt: { lat: w[0].lat, lng: w[0].lng }, done: 0 };
  S.centered = false; S.legFrom = null;
  startNav();
  S.sim.timer = setInterval(simStep, 1000);
  wake(); fabs(); toast('Simulazione a velocità accelerata');
}
function simStep() {
  const w = wps(), sm = S.sim; if (!sm) return;
  if (sm.i + 1 >= w.length) { if (++sm.done > 3) stopSim(); return; }
  const tgt = w[sm.i + 1], step = Math.max(S.set.plan, 1) / KN * 15;
  const d = dist(sm.pt, tgt), hdg = brg(sm.pt, tgt);
  if (d <= step) { sm.pt = { lat: tgt.lat, lng: tgt.lng }; sm.i++; }
  else sm.pt = dest(sm.pt, hdg, step);
  const rep = dest(sm.pt, (hdg + 90) % 360, Math.sin(Date.now() / 9000) * 40);
  onFix({ lat: rep.lat, lng: rep.lng, speed: S.set.plan / KN, heading: hdg, acc: 5, t: Date.now() });
}
function stopSim() {
  if (!S.sim) return;
  clearInterval(S.sim.timer); S.sim = null;
  if (S.simBackup) {
    S.track = S.simBackup.track; S.trip = S.simBackup.trip; S.simBackup = null;
    trackLine.setLatLngs(S.track.map(p => [p.lat, p.lng]));
  }
  S.pos = null; S.sogS = null; predLine.setLatLngs([]); toTgtLine.setLatLngs([]);
  if (map.hasLayer(boat)) map.removeLayer(boat);
  stopNav(); fabs(); ui(); toast('Simulazione terminata');
}

/* ---------- Azioni (pulsanti) ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, i = +d.i;
  switch (d.act) {
    case 'startGps':
      if (!S.pos) { toast('In attesa della posizione GPS'); break; }
      place('start', S.pos); toast('Partenza: posizione attuale'); break;
    case 'pickStart': pick('start'); break;
    case 'pickDest': pick('dest'); break;
    case 'pickVia': pick('via'); break;
    case 'pickHazard': pick('hazard'); break;
    case 'ctx': map.closePopup(); place(d.k, S.ctx); if (d.k !== 'hazard') { openSheet('rotta'); } break;
    case 'delVia': S.route.via.splice(i, 1); editRoute(); break;
    case 'reverse': {
      stopNav();
      const s = S.route.start; S.route.start = S.route.dest; S.route.dest = s; S.route.via.reverse(); if (S.route.path) S.route.path.reverse(); routeChanged(); break;
    }
    case 'encImport': $('encFile').click(); break;
    case 'pkgSync': if (!navigator.onLine) toast('Serve la connessione a Internet'); else { toast('Controllo gli aggiornamenti dei dati…'); syncPackage(true); } break;
    case 'encClear': if (window.ENC) ENC.clear().then(() => { encStatus(); encView.render(); toast('Carte ENC rimosse'); if (S.route.start && S.route.dest) editRoute(); }); break;
    case 'cancelRoute': clearTimeout(autoT); autoSeq++; stopWorker(); busy.fail('Calcolo annullato. Tocca "Ricalcola rotta" nella scheda Rotta per riprovare.'); $('bAuto').disabled = false; autoMsg('Calcolo annullato.'); break;
    case 'closeBusy': busy.hide(); break;
    case 'clear': stopNav(); clearTimeout(autoT); autoSeq++; busy.hide(); S.route = { start: null, via: [], dest: null, path: null }; autoMsg(''); routeChanged(); break;
    case 'useRes': { const r = S.results[i]; place(d.k, r); map.setView([r.lat, r.lng], Math.max(map.getZoom(), 12)); break; }
    case 'goRes': { const r = S.results[i]; map.setView([r.lat, r.lng], 13); S.set.follow = false; saveSet(); fabs(); break; }
    case 'loadRoute': stopNav(); S.route = JSON.parse(JSON.stringify(S.saved[i].route)); routeChanged();
      if (wps().length > 1) map.fitBounds(routeLine.getBounds().pad(0.2));
      if (!S.route.path) { S.route.blocked = true; routeChanged(); autoSchedule(); } break;
    case 'delRoute': S.saved.splice(i, 1); store.set('routes', S.saved); renderRoute(); break;
    case 'gpxOut': if (wps().length) download('rotta.gpx', gpxText(false)); else toast('Nessuna rotta da esportare'); break;
    case 'gpxIn': $('fileIn').click(); break;
    case 'trackGpx': if (S.track.length) download('traccia.gpx', gpxText(true)); else toast('Traccia vuota'); break;
    case 'trackClear': S.track = []; S.trip = { dist: 0, t0: null, max: 0 }; trackLine.setLatLngs([]); store.set('track', []); store.set('trip', S.trip); toast('Traccia azzerata'); ui(); break;
    case 'anchor': setAnchor(); break;
    case 'autoRoute': autoRoute(); break;
    case 'water': showWater(!S.waterOn); if (S.waterOn && S.grids.length) minSheet(true); break;
    case 'delHaz': S.hazards = S.hazards.filter(h => h.id !== d.id); clearAl('h' + d.id); store.set('hazards', S.hazards); map.closePopup(); drawHazards(); routeCheck(); renderHaz(); renderRoute(); break;
    case 'goHaz': { const h = S.hazards.find(x => x.id === d.id); if (h) { map.setView([h.lat, h.lng], 15); S.set.follow = false; saveSet(); fabs(); } break; }
    case 'dismiss': SN.set(d.id, Date.now() + 60000); clearAl(d.id); break;
  }
});

$('bGo').onclick = () => { S.active ? stopNav() : startNav(); fabs(); };
$('bSim').onclick = () => { S.sim ? stopSim() : startSim(); };
$('bGps').onclick = () => { if (S.sim) return; if (S.gpsOn) { stopGps(); toast('GPS disattivato'); } else startGps(); };
$('bFollow').onclick = () => {
  S.set.follow = !S.set.follow; saveSet(); fabs();
  if (S.set.follow && S.pos) map.panTo([S.pos.lat, S.pos.lng]);
};
$('bNight').onclick = () => { S.set.night = !S.set.night; saveSet(); applyNight(); fabs(); };
$('bMute').onclick = () => { S.set.mute = !S.set.mute; saveSet(); audio(); fabs(); };
$('bMob').onclick = mobPress;
$('fSave').addEventListener('submit', e => {
  e.preventDefault();
  if (wps().length < 2) { toast('Imposta prima partenza e destinazione'); return; }
  const name = $('rName').value.trim() || 'Rotta ' + (S.saved.length + 1);
  S.saved.push({ name, route: JSON.parse(JSON.stringify(S.route)) });
  store.set('routes', S.saved); $('rName').value = ''; renderRoute(); toast('Rotta salvata');
});

if ($('encFile')) $('encFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !window.ENC) return;
  toast('Importo le carte ENC…');
  try {
    const i = await ENC.importFile(f);
    encStatus(); S.set.enc = true; $('lEnc').checked = true; saveSet(); encView.render();
    toast(`Carte ENC importate: ${i.cells} celle`);
    if (S.route.start && S.route.dest) editRoute();
  } catch (err) { toast('Importazione non riuscita: ' + (err.message || err)); }
});

/* impostazioni */
let coastT = 0;
const FIELDS = { sXte: 'xte', sArr: 'arr', sSpd: 'spd', sWind: 'wind', sHz: 'hz', sAnc: 'anc', sPlan: 'plan', sCoast: 'coast', sDraft: 'draft', sUkc: 'ukc',
  sHp: 'hp', sLen: 'len', sPref: 'pref' };
const RULE_IDS = /^(sHp|sLen|sPref|sBoat|sLic|sVlim|sCe)$/;
Object.keys(FIELDS).filter(id => $(id)).forEach(id => {
  const el = $(id); el.value = S.set[FIELDS[id]];
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (isFinite(v)) {
      S.set[FIELDS[id]] = v; saveSet(); if (id === 'sPlan') renderRoute();
      if (RULE_IDS.test(id)) renderRules();
      if (/^(sCoast|sDraft|sUkc|sPref)$/.test(id) && S.route.start && S.route.dest) { clearTimeout(coastT); coastT = setTimeout(editRoute, 1200); }
      if (/^(sDraft|sUkc)$/.test(id)) encView.render();
    }
  });
});
/* mezzo, patente e limite del mezzo: cambiano il limite di distanza dalla costa e quindi la rotta */
const SELECTS = { sBoat: 'boat', sLic: 'lic', sVlim: 'vlim', sCe: 'ce' };
Object.keys(SELECTS).filter(id => $(id)).forEach(id => {
  const el = $(id); el.value = S.set[SELECTS[id]];
  el.addEventListener('change', () => {
    S.set[SELECTS[id]] = el.value; saveSet(); renderRules();
    if (S.route.start && S.route.dest) { clearTimeout(coastT); coastT = setTimeout(editRoute, 300); }
  });
});
renderRules();
if ($('gKey')) {
  $('gKey').value = gKey();
  $('gKeySave').onclick = () => {
    const v = $('gKey').value.trim();
    try { v ? localStorage.setItem(GKEY, v) : localStorage.removeItem(GKEY); Object.keys(GT).forEach(t => localStorage.removeItem('rn.gsess.' + t)); } catch (e) { /* ignora */ }
    Object.keys(gLayers).forEach(k => { map.removeLayer(gLayers[k]); delete gLayers[k]; });
    toast(v ? 'Chiave Google salvata su questo telefono' : 'Chiave Google rimossa');
    applyLayers();
  };
}
document.querySelectorAll('input[name=base]').forEach(r => {
  r.checked = r.value === S.set.base;
  r.addEventListener('change', () => { S.set.base = r.value; saveSet(); applyLayers(); });
});
[['lSea', 'sea'], ['lBathy', 'bathy'], ['lTrack', 'track'], ['lEnc', 'enc']].filter(([id]) => $(id)).forEach(([id, k]) => {
  $(id).checked = !!S.set[k];
  $(id).addEventListener('change', () => { S.set[k] = $(id).checked; saveSet(); applyLayers(); });
});

/* pacchetto dati per l'uso senza rete */
if ($('sPkg')) {
  $('sPkg').value = S.set.pkg;
  $('sPkg').addEventListener('change', () => { S.set.pkg = $('sPkg').value; saveSet(); pkgStatus(); syncPackage(true); });
}
if ($('lPkgWifi')) {
  $('lPkgWifi').checked = !!S.set.pkgWifi;
  $('lPkgWifi').addEventListener('change', () => { S.set.pkgWifi = $('lPkgWifi').checked; saveSet(); pkgStatus(); });
}
pkgStatus();

/* ---------- Ciclo a 1 Hz ---------- */
setInterval(() => {
  const gpsActive = S.gpsOn || S.sim;
  if (gpsActive && S.lastFix && Date.now() - S.lastFix > 12000) raise('gps', 'Segnale GPS assente da ' + Math.round((Date.now() - S.lastFix) / 1000) + ' s', 'bad');
  if ([...A.values()].some(a => a.level === 'bad') && Date.now() - lastBeep > 8000) { pattern('bad'); vib('bad'); lastBeep = Date.now(); }
  if (S.pos && Date.now() - S.wxT > 600000) fetchWx();
  ui(); fabs();
}, 1000);
setInterval(() => {
  store.set('track', S.track.slice(-3000).map(p => [+p.lat.toFixed(6), +p.lng.toFixed(6), p.t]));
  store.set('trip', S.trip);
}, 20000);
window.addEventListener('pagehide', () => {
  store.set('track', S.track.slice(-3000).map(p => [+p.lat.toFixed(6), +p.lng.toFixed(6), p.t]));
  store.set('trip', S.trip);
});

/* ---------- Avvio ---------- */
applyLayers(); applyNight();
trackLine.setLatLngs(S.track.map(p => [p.lat, p.lng]));
drawHazards(); drawRoute(); renderRoute(); renderHaz(); fabs(); ui();
if (wps().length > 1 && !store.get('view', null)) map.fitBounds(routeLine.getBounds().pad(0.2));
/* Nel browser il service worker salva l'app per l'uso senza rete. Nell'APK i file sono già dentro l'app:
   il service worker non serve e su alcuni Android interferisce con il caricamento, quindi viene tolto. */
if ('serviceWorker' in navigator) {
  if (window.Capacitor) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  else navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode non disponibile */ });
}
window.rnStarted = true;
if (window.ENC) ENC.load().then(() => { encStatus(); encView.render(); }); else encStatus();
startGps();
/* pacchetto dati: controllo a ogni avvio (dopo che la carta è partita) e quando torna la rete */
setTimeout(() => syncPackage(), 4000);
window.addEventListener('online', () => syncPackage());
if (S.route.path === undefined) S.route.path = null;
if (!S.route.path && S.route.start && S.route.dest) { S.route.blocked = true; drawRoute(); renderRoute(); autoSchedule(); }
if (!wps().length) setTimeout(() => openSheet('rotta'), 400);
})();
