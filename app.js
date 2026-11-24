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
/* gradi, primi e secondi: 45°34'22.7"N 13°15'47.1"E */
function fmtDMS(p) {
  if (!p) return '--';
  const f = (v, pl, mi) => {
    const h = v < 0 ? mi : pl; v = Math.abs(v);
    let d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 600) / 10;
    if (s >= 60) { s = 0; m++; } if (m >= 60) { m = 0; d++; }
    return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"${h}`;
  };
  return f(p.lat, 'N', 'S') + ' ' + f(p.lng, 'E', 'W');
}
/* legge le coordinate scritte in tutti i modi comuni: 45.5729, 13.2631 · 45°34'22.7"N 13°15'47.1"E ·
   45°34.378'N 13°15.785'E · N 45 34 22.7 E 13 15 47.1 · 45.5729N 13.2631E (O = ovest). Restituisce null se non sono coordinate. */
function parseCoords(q) {
  let s = String(q || '').trim();
  if (!s) return null;
  const ok = (lat, lng) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/);
  if (m) return ok(parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.')));
  s = s.toUpperCase().replace(/\bNORD\b/g, 'N').replace(/\bSUD\b/g, 'S').replace(/\bEST\b/g, 'E').replace(/\bOVEST\b/g, 'W')
    .replace(/(\d),(\d)/g, '$1.$2').replace(/[°º˚'′’‘"″”“`´:,;]/g, ' ').replace(/\b(LAT|LON|LNG|LONG)\b\.?/g, ' ');
  if (/[A-Z]/.test(s.replace(/\b[NSEWO]\b/g, '').replace(/(\d)[NSEWO]\b/g, '$1').replace(/\b[NSEWO](\d)/g, '$1'))) return null;
  const toks = s.match(/-?\d+(?:\.\d+)?|[NSEWO]/g);
  if (!toks) return null;
  const isH = t => /^[NSEWO]$/.test(t), pre = isH(toks[0]);
  let groups = [], cur = { n: [], h: null };
  for (const t of toks) {
    if (isH(t)) {
      if (pre) { if (cur.n.length || cur.h) groups.push(cur); cur = { n: [], h: t }; }
      else { cur.h = t; groups.push(cur); cur = { n: [], h: null }; }
    } else cur.n.push(+t);
  }
  if (cur.n.length) groups.push(cur);
  if (groups.length === 1 && !groups[0].h && [2, 4, 6].includes(groups[0].n.length)) {
    const k = groups[0].n.length / 2; groups = [{ n: groups[0].n.slice(0, k) }, { n: groups[0].n.slice(k) }];
  }
  if (groups.length !== 2) return null;
  const val = g => {
    if (!g.n.length || g.n.length > 3) return NaN;
    const [d, mi = 0, se = 0] = g.n;
    if (mi < 0 || mi >= 60 || se < 0 || se >= 60 || (g.n.length === 3 && mi % 1)) return NaN;
    const v = Math.abs(d) + mi / 60 + se / 3600;
    return d < 0 || g.h === 'S' || g.h === 'W' || g.h === 'O' ? -v : v;
  };
  const isLat = g => g.h === 'N' || g.h === 'S', isLng = g => g.h && !isLat(g);
  if ((isLat(groups[0]) && isLat(groups[1])) || (isLng(groups[0]) && isLng(groups[1]))) return null;
  let a = val(groups[0]), b = val(groups[1]);
  if (isLng(groups[0]) || isLat(groups[1])) [a, b] = [b, a];
  return ok(a, b);
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
  boat: 'motore', hp: 40, len: 6, lic: 'none', vlim: 'auto', ce: 'ce', pref: 1, pkg: 'all', pkgWifi: true,
  wrecks: false, ais: false, fleetShare: true, fleetName: '', fleetIn: false, pois: true, fonde: false, amp: false, pesca: true, iso: false, servizi: true, comm: true };
const S = {
  set: Object.assign({}, DEF, store.get('set', {})),
  route: store.get('route', { start: null, via: [], dest: null }),
  hazards: store.get('hazards', []),
  pois: store.get('pois', []),
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

/* linee batimetriche calcolate sul telefono dalle profondità EMODnet (vedi "Linee batimetriche" più sotto) */
const isoLayer = L.layerGroup();
const routeLine = L.polyline([], { color: '#e254ff', weight: 4, opacity: .85, dashArray: '10 8' }).addTo(map);
const legLine = L.polyline([], { color: '#e254ff', weight: 6, opacity: .95 }).addTo(map);
const trackLine = L.polyline([], { color: '#ff9f1c', weight: 4, opacity: .95 }).addTo(map);
/* relitti per immersioni (vedi "Relitti per immersioni" più sotto) */
const wreckLayer = L.layerGroup();
let WRECKS = null, wreckLoading = null;
/* barche con Rotta Nautica (vedi "Barche con Rotta Nautica" più sotto) */
const fleetLayer = L.layerGroup().addTo(map);
const fleetMk = new Map();
/* punti di interesse (vedi "Punti di interesse" più sotto) */
const poiLayer = L.layerGroup();
const fondaLayer = L.layerGroup();
const ampLayer = L.layerGroup();
const pescaLayer = L.layerGroup();
let PESCA = null, pescaP = null;
const ptLayer = L.layerGroup().addTo(map);
let POIDATA = null, poiDataP = null;
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
    '<button data-act="ctx" data-k="dest">Destinazione qui</button><button data-act="ctx" data-k="poi">Salva come mio punto</button>' +
    '<button data-act="ctx" data-k="show">Coordinate e meteo qui</button><button data-act="ctx" data-k="hazard">Segna secca / ostacolo</button>';
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
  if (S.set.iso) { if (!map.hasLayer(isoLayer)) { isoLayer.addTo(map); drawIso(); } } else { map.removeLayer(isoLayer); isoLayer.clearLayers(); }
  if (S.set.track) { if (!map.hasLayer(trackLine)) trackLine.addTo(map); } else map.removeLayer(trackLine);
  { if (S.set.wrecks) { if (!map.hasLayer(wreckLayer)) { wreckLayer.addTo(map); loadWrecks(); } } else map.removeLayer(wreckLayer); }
  if (S.set.pois) { if (!map.hasLayer(poiLayer)) poiLayer.addTo(map); } else map.removeLayer(poiLayer);
  if (S.set.amp) { if (!map.hasLayer(ampLayer)) { ampLayer.addTo(map); loadPoiData(); } } else map.removeLayer(ampLayer);
  if (S.set.fonde) { if (!map.hasLayer(fondaLayer)) { fondaLayer.addTo(map); loadPoiData(); } } else map.removeLayer(fondaLayer);
  if (S.set.pesca) { if (!map.hasLayer(pescaLayer)) { pescaLayer.addTo(map); loadPesca(); } } else map.removeLayer(pescaLayer);
  if (S.set.servizi) { if (!map.hasLayer(servLayer)) { servLayer.addTo(map); if (SRV) drawServizi(); else loadServizi(); } } else map.removeLayer(servLayer);
  if (S.set.comm) { if (!map.hasLayer(cpLayer)) { cpLayer.addTo(map); drawComm(); } } else map.removeLayer(cpLayer);
  if ($('bAis')) { $('bAis').hidden = !S.set.ais; if (!S.set.ais) closeAis(); }
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
  /* la sezione ENC si vede solo se sul telefono ci sono carte importate (servono solo per poterle togliere) */
  if ($('encBox')) $('encBox').hidden = !i;
}
/* scheda dei segnali (seamarks.js): se il file manca l'app funziona lo stesso */
let seamarkInspector = { refresh() {} };
/* i segnali vengono dal file locale: niente rete, disegno immediato */
try { if (window.Seamarks) seamarkInspector = Seamarks.attach(map, { isOn: () => S.set.sea, isPicking: () => !!S.pick, nodes: b => nauticaFor(b).then(D => D.nodes) }); }
catch (e) { console.error(e); }
const THEMES = ['day', 'dusk', 'night'], THEME_L = { day: 'Giorno', dusk: 'Sera', night: 'Notte' };
function applyNight() {
  if (!THEMES.includes(S.set.theme)) S.set.theme = S.set.night ? 'night' : 'day';
  S.set.night = S.set.theme === 'night';
  document.body.classList.toggle('night', S.set.theme === 'night');
  document.body.classList.toggle('dusk', S.set.theme === 'dusk');
  $('themeColor').setAttribute('content', { day: '#ffffff', dusk: '#0a1c28', night: '#170505' }[S.set.theme]);
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
window.rnToast = m => toast(m);
/* sezione Barca collegata alla scheda della check-list (checklist.js): mezzo, potenza totale, lunghezza, pescaggio */
window.rnBoatSet = () => ({ boat: S.set.boat, hp: S.set.hp, len: S.set.len, draft: S.set.draft });
window.rnBoatSync = info => {
  if (!info) return;
  const ch = [];
  const put = (k, v, id) => { if (v == null || v === '' || S.set[k] === v) return; S.set[k] = v; ch.push(k); const el = $(id); if (el) el.value = v; };
  put('boat', info.kind, 'sBoat'); put('hp', info.hp, 'sHp'); put('len', info.len, 'sLen'); put('draft', info.draft, 'sDraft');
  saveSet(); renderRules(); boatFromCk();
  if (ch.length) { toast('Sezione Barca aggiornata dalla check-list'); if (S.route.start && S.route.dest && ch.some(k => k !== 'hp')) setTimeout(editRoute, 300); }
};
function boatFromCk() {
  const el = $('ckBoatNote'), info = window.RNCheck && window.RNCheck.boatInfo && window.RNCheck.boatInfo();
  if (!el) return;
  el.hidden = !info;
  if (info) el.innerHTML = `Dati presi dalla scheda della check-list${info.name ? ` (<b>${esc(info.name)}</b>${info.n > 1 ? `, ${info.n} motori` : ''})` : ''}. ` +
    `Se li cambi qui valgono per la rotta; per cambiarli anche nella check-list modifica la scheda della barca.` +
    (info.hp == null || !info.len || info.draft == null ? `<br><span class="mut">Nella scheda mancano ${[info.hp == null && 'potenza', !info.len && 'lunghezza', info.draft == null && 'pescaggio'].filter(Boolean).join(', ')}: per questi restano i valori qui sotto.</span>` : '') +
    `<br><button class="linkBtn" data-act="ckBoatSync">Riprendi i dati della check-list</button>`;
}
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
  else if (type === 'poi') { addPoi(p); return; }
  else if (type === 'show') { showPoint(p); return; }
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
  if (Date.now() - coastT0 > 8000) { coastT0 = Date.now(); coastHere(f).then(r => { if (r) r.center = false; S.coastHere = r; ui(); }).catch(() => {}); }
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

  if (!S.sim && window.Flotta) Flotta.update(fleetPos());
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
/* oltre 40,8 CV (30 kW) in totale, o con una moto d'acqua, la patente è obbligatoria: "Nessuna" non si può scegliere */
let licToast = 0;
function enforceLic() {
  const s = S.set, need = s.boat === 'moto' || (s.boat !== 'remi' && s.hp > 40.8), sel = $('sLic');
  if (sel) { const o = sel.querySelector('option[value="none"]'); if (o) { o.disabled = need; o.textContent = need ? 'Nessuna (non ammessa: serve la patente)' : 'Nessuna (entro 6 miglia)'; } }
  if (need && s.lic === 'none') {
    s.lic = '12'; saveSet(); if (sel) sel.value = '12';
    if (Date.now() - licToast > 3000) { licToast = Date.now(); toast(s.boat === 'moto' ? "Per la moto d'acqua serve la patente: impostata \"entro 12 miglia\", cambiala se è senza limiti" : `Con ${num1(s.hp)} CV serve la patente nautica: impostata "entro 12 miglia", cambiala se è senza limiti`); }
  }
}
function renderRules() {
  enforceLic();
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
  const M = Math.max(Number.isFinite(limM) ? limM + 12000 : 0, 0.3 * spanM, 25000) * (grow || 1);
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
  if (!g || !g.cd || !Number.isFinite(limM)) return null;
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
  const limM = Number.isFinite(rules.limNm) ? rules.limNm * NM - LIM_MARGIN : Infinity;
  w.forEach((p, i) => { p.ui = i; });
  const tooLong = w.some((p, i) => i && !Water.tileBox([w[i - 1], p]));
  /* anche un tratto che starebbe in una carta sola viene diviso se la carta non arriva almeno a zoom 15 */
  const coarseZoom = w.some((p, i) => i && !Water.tileBox([w[i - 1], p], 16, ZOOM_MIN));
  const simple = () => w.slice(1).map((p, i) => ({ kind: 'detail', a: w[i], b: p }));
  if (!Number.isFinite(limM) && !tooLong && !coarseZoom) return { segs: simple(), cg: null, rules, limM };
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
  const edgeM = (Number.isFinite(limM) ? limM : 0) + 4000, ex = Math.ceil(edgeM / cg.dx), ey = Math.ceil(edgeM / cg.dy);
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
    if (L.none) throw new Error(Number.isFinite(limM)
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
/* RAMI MORTI ai raccordi tra un tratto e l'altro: il punto di raccordo scelto dalla griglia costiera può stare fuori
   strada (es. vicino alla riva a Chioggia) e la rotta ci va e torna indietro. Se prima e dopo un raccordo (non scelto
   dall'utente) la rotta passa vicina a se stessa, si toglie il giro, purché il collegamento diretto stia in acqua
   navigabile secondo le carte usate per il calcolo. */
function inWater(p) {
  for (const g of S.grids) {
    if (!g.d) continue;
    const x = Math.floor(Water.lon2px(p.lng, g.z) - g.ox), y = Math.floor(Water.lat2px(p.lat, g.z) - g.oy);
    if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue;
    if (g.d[y * g.W + x] > 0) return true;
  }
  return false;
}
function cutSpurs(pts, joints) {
  for (let n = joints.length - 1; n >= 0; n--) {
    const j = joints[n], WIN = 80;
    let best = null;
    for (let i = Math.max(0, j - WIN); i < j; i++)
      for (let k = j + 1; k <= Math.min(pts.length - 1, j + WIN); k++) {
        const dd = dist(pts[i], pts[k]);
        if (dd > 40) continue;
        let L = 0; for (let q = i; q < k; q++) L += dist(pts[q], pts[q + 1]);
        if (L < 3 * dd + 60 || (best && L <= best.L)) continue;
        let ok = true;
        for (let t = 0; t <= 10 && ok; t++) ok = inWater({ lat: pts[i].lat + (pts[k].lat - pts[i].lat) * t / 10, lng: pts[i].lng + (pts[k].lng - pts[i].lng) * t / 10 });
        if (ok) best = { i, k, L };
      }
    if (best) pts.splice(best.i + 1, best.k - best.i - 1);
  }
}
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
  /* punto di divisione: a metà, poi (solo al primo livello) a un terzo e a due terzi del percorso, se il primo cade male */
  const fr = depth ? [0.5] : [0.5, 0.35, 0.65];
  for (const f of fr) {
    const i = Math.max(1, Math.min(via.length - 2, Math.round((via.length - 1) * f)));
    const m = { lat: via[i].lat, lng: via[i].lng, mid: true };
    busy.set(`Tratto ${k}/${n}: zoom ravvicinato, pezzo ${depth + 2}…`, k, 0.4);
    const A = await closeSolve(a, m, via.slice(0, i + 1), depth + 1, k, n, plan, seq);
    if (!A) continue;
    const B = await closeSolve(m, b, via.slice(i), depth + 1, k, n, plan, seq);
    if (B) return A.concat(B);
  }
  return null;
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
  ['restrict', 'free', 'hard', 'shallow', 'deep', 'lines', 'linesCore', 'lines2', 'axis', 'ext', 'zone', 'barrier', 'nogo', 'far', 'lane', 'sx', 'sy', 'sp', 'sn'].forEach(k => {
    if (light && /^(restrict|shallow|deep|zone|barrier)$/.test(k)) return;
    if (extra[k]) masks[k] = extra[k];
  });
  masks.coastM = extra.coastM;
  /* larghezza minima dell'acqua fuori dai canali: canoe e kayak passano anche nei canaletti stretti */
  if (light) masks.minW = 3;
  if (extra.enc) masks.enc = { cov: extra.enc.cov, ok: extra.enc.ok, wet: extra.enc.wet, pref: extra.enc.pref };
  const msg = { rgba, W, H, box, extra: masks, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng }, relaxM: [500, 1500],
    /* spostamento massimo degli estremi se cadono in una sacca: poco per i punti scelti dall'utente, di più per i raccordi
       tra un tratto e l'altro decisi dalla griglia costiera (possono cadere fuori dal canale) */
    /* l'inizio di un tratto è già l'arrivo del tratto precedente: se si spostasse, il tratto precedente finirebbe con una
       linea dritta fino al nuovo punto, anche sopra la terra (es. Canale Zemole -> Canale Tiel). Si sposta solo di pochi
       metri, salvo la partenza della rotta; l'arrivo del tratto invece può spostarsi (il tratto dopo parte da lì) */
    pocket: [a.ui === 0 ? 250 : 30, b.ui != null ? 250 : 1200] };
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
  const D = { nodes: [], lines: [], corridorAreas: [], restrictAreas: [], freeAreas: [], hazards: [], noGoAreas: [], laneAreas: [] }, seen = new Set();
  parts.forEach(P => ['nodes', 'lines', 'corridorAreas', 'restrictAreas', 'freeAreas', 'hazards', 'noGoAreas', 'laneAreas'].forEach(k => (P[k] || []).forEach(o => {
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
/* ---------- Distanza dalla costa e fondale nel punto (profondità EMODnet, maglia ~115 m, senza rete) ---------- */
let coastT0 = 0;
/* con il GPS spento si calcola dal centro della carta, così si vede lo stesso (e si capisce da dove) */
function refreshCoast() {
  const ref = S.pos || map.getCenter(), center = !S.pos;
  coastHere({ lat: ref.lat, lng: ref.lng }).then(r => { if (r) r.center = center; S.coastHere = r; ui(); }).catch(() => {});
}
map.on('moveend', () => { if (!S.pos && S.tab === 'dati') refreshCoast(); });
async function coastHere(p) {
  const idx = await depthIndex(), R = 30000;   // si cerca la costa entro 30 km
  const kx = Math.cos(p.lat * RAD), dLa = R / 111320, dLo = R / (111320 * kx);
  const b = { s: p.lat - dLa, n: p.lat + dLa, w: p.lng - dLo, e: p.lng + dLo };
  const tiles = (await Promise.all(idx.tiles.filter(t => tileHit(t, b)).map(depthTile))).filter(Boolean);
  if (!tiles.length) return null;
  /* valore di una cella: profondità in metri (mare), -1 (terra o fuori dai dati) */
  const at = (lat, lng) => {
    const d = tiles.find(x => lat >= x.t.s && lat < x.t.n && lng >= x.t.w && lng < x.t.e); if (!d) return -1;
    const px = Math.min(d.w - 1, ((lng - d.t.w) / (d.t.e - d.t.w) * d.w) | 0), py = Math.min(d.h - 1, ((d.t.n - lat) / (d.t.n - d.t.s) * d.h) | 0), j = (py * d.w + px) * 4;
    return d.data[j + 2] === 255 ? (d.data[j] * 256 + d.data[j + 1]) / 10 : -1;
  };
  const here = at(p.lat, p.lng), res = { t: Date.now(), max: R, depth: here >= 0 ? here : null };
  if (here < 0) { res.land = true; res.m = 0; return res; }
  const st = 1 / 960, sy = st * 111320, sx = st * 111320 * kx, N = Math.ceil(R / Math.min(sx, sy));
  /* anelli quadrati crescenti: alla prima terra trovata si controlla ancora fino a r·√2 per avere la distanza vera minima */
  let best = Infinity, stop = N;
  for (let r = 1; r <= stop; r++) {
    for (let k = -r; k <= r; k++) for (const [dx, dy] of [[k, -r], [k, r], [-r, k], [r, k]]) {
      const m = Math.hypot(dx * sx, dy * sy); if (m >= best) continue;
      if (at(p.lat + dy * st, p.lng + dx * st) < 0) { best = m; stop = Math.min(N, Math.ceil(r * 1.42) + 1); }
    }
  }
  res.m = Number.isFinite(best) ? best : null;
  return res;
}

/* ---------- Linee batimetriche: isobate calcolate dalle profondità EMODnet della zona visibile ---------- */
const ISO_C = { 2: '#7fd3ff', 5: '#4fb3f0', 10: '#2a8fd8', 20: '#1f6fb8', 30: '#1a5ca0', 50: '#164b8a', 100: '#123b72', 200: '#0e2d5c', 500: '#0a2048', 1000: '#071634' };
let isoT = 0, isoJob = 0;
map.on('moveend', () => { if (S.set.iso) { clearTimeout(isoT); isoT = setTimeout(drawIso, 250); } });
async function drawIso() {
  if (!S.set.iso) return;
  const job = ++isoJob, z = map.getZoom();
  if (z < 9) { isoLayer.clearLayers(); if (S.tab === 'mappa') toast('Avvicinati per vedere le linee batimetriche'); return; }
  const B = map.getBounds().pad(0.15), b = { s: B.getSouth(), n: B.getNorth(), w: B.getWest(), e: B.getEast() };
  const res = await isoLines(b, z);
  if (job !== isoJob) return;
  isoLayer.clearLayers();
  res.forEach(({ L0, segs }) => {
    const col = ISO_C[L0] || '#123b72';
    L.polyline(segs, { color: col, weight: L0 <= 5 ? 1.8 : 1.3, opacity: 0.9, interactive: false, renderer: isoRenderer }).addTo(isoLayer);
    /* etichette: poche, distanziate sullo schermo */
    const used = [], step = Math.max(1, Math.floor(segs.length / 12));
    for (let i = 0; i < segs.length && used.length < 6; i += step) {
      const pt = map.latLngToContainerPoint(segs[i][0]);
      if (used.some(u => u.distanceTo(pt) < 160)) continue;
      used.push(pt);
      L.marker(segs[i][0], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'isoLbl', html: `<span style="color:${col}">${L0} m</span>`, iconSize: null }) }).addTo(isoLayer);
    }
  });
}
/* isobate della zona b: [{ L0: profondità, segs: [[[lat, lng], [lat, lng]], ...] }] */
async function isoLines(b, z) {
  const idx = await depthIndex();
  const tiles = (await Promise.all(idx.tiles.filter(t => tileHit(t, b)).map(depthTile))).filter(Boolean);
  const out = [];
  if (!tiles.length) return out;
  const levels = z >= 13 ? [2, 5, 10, 20, 50] : z >= 11 ? [5, 10, 20, 50, 100, 200] : [10, 20, 50, 100, 200, 500, 1000];
  /* griglia sulle celle EMODnet (1/960 di grado), diradata se la zona è grande */
  const f = Math.max(1, Math.ceil(Math.sqrt((b.n - b.s) * 960 * (b.e - b.w) * 960 / 250000))), st = f / 960;
  const W = Math.ceil((b.e - b.w) / st) + 1, H = Math.ceil((b.n - b.s) / st) + 1, V = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = b.n - y * st;
    for (let x = 0; x < W; x++) {
      const lng = b.w + x * st, d = tiles.find(q => lat >= q.t.s && lat < q.t.n && lng >= q.t.w && lng < q.t.e);
      if (!d) { V[y * W + x] = NaN; continue; }
      const px = Math.min(d.w - 1, ((lng - d.t.w) / (d.t.e - d.t.w) * d.w) | 0), py = Math.min(d.h - 1, ((d.t.n - lat) / (d.t.n - d.t.s) * d.h) | 0), j = (py * d.w + px) * 4;
      V[y * W + x] = d.data[j + 2] === 255 ? (d.data[j] * 256 + d.data[j + 1]) / 10 : 0;   // terra = 0 m
    }
  }
  const LL = (x, y) => [b.n - y * st, b.w + x * st];
  levels.forEach(L0 => {
    /* marching squares: segmenti dove la profondità attraversa L0 */
    const segs = [];
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const a = V[y * W + x], bb = V[y * W + x + 1], c = V[(y + 1) * W + x + 1], d = V[(y + 1) * W + x];
      if (a !== a || bb !== bb || c !== c || d !== d) continue;
      const k = (a >= L0 ? 8 : 0) | (bb >= L0 ? 4 : 0) | (c >= L0 ? 2 : 0) | (d >= L0 ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const t = (p, q) => (L0 - p) / (q - p);
      const T = () => LL(x + t(a, bb), y), Rr = () => LL(x + 1, y + t(bb, c)), Bo = () => LL(x + t(d, c), y + 1), Le = () => LL(x, y + t(a, d));
      switch (k) {
        case 1: case 14: segs.push([Le(), Bo()]); break;
        case 2: case 13: segs.push([Bo(), Rr()]); break;
        case 3: case 12: segs.push([Le(), Rr()]); break;
        case 4: case 11: segs.push([T(), Rr()]); break;
        case 6: case 9: segs.push([T(), Bo()]); break;
        case 7: case 8: segs.push([Le(), T()]); break;
        case 5: segs.push([Le(), T()], [Bo(), Rr()]); break;
        case 10: segs.push([T(), Rr()], [Le(), Bo()]); break;
      }
    }
    if (segs.length) out.push({ L0, segs });
  });
  return out;
}
window.rnDebug = { coastHere, isoLines, mergeCw: () => mergeCw() };
const isoRenderer = L.canvas({ padding: 0.2 });

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
  const D = { nodes: [], lines: [], corridorAreas: [], restrictAreas: [], freeAreas: [], hazards: [], noGoAreas: [], laneAreas: [], ext: { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity } };
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
    /* darsene e porticcioli (anche dentro la laguna, es. Aprilia Marittima): acqua libera, senza obbligo di briccole */
    const isFree = !isRestrict && (t.leisure === 'marina' || t.landuse === 'harbour' || /^(harbour|dock|marina|basin)$/.test(t.water || '') ||
      /^(harbour|harbour_basin)$/.test(t['seamark:type'] || '')) && t.landuse !== 'aquaculture';
    const isFair = t['seamark:type'] === 'fairway';
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => r.map(ll)));
      polys.forEach(p => {
        /* barene e zone con vegetazione: emerse, mai attraversabili nemmeno nell'ultimo tratto fuori canale */
        const item = { id: id + (polys.length > 1 ? '#' + polys.indexOf(p) : ''), rings: p, bb: bbOf(p[0]), lagoon: t.water === 'lagoon', hard: t.natural === 'wetland' && /^(saltmarsh|marsh|reedbed|swamp|fen|bog|wet_meadow)$/.test(t.wetland || '') };
        if (isRestrict) D.restrictAreas.push(item);
        else if (isFree) D.freeAreas.push(item);
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
  const out = { lines: [], lines2: [], corridorAreas: [], restrictAreas: [], freeAreas: [], hardAreas: [], nodes: [], hazards: [], noGoAreas: [], info: { canali: 0, segnali: 0, coppie: 0, lagune: 0, ostacoli: 0 } };
  const m = 0.01;   // le fasce di rispetto sporgono dal riquadro
  (D.hazards || []).forEach(h => { if (h.lng >= b.w - m && h.lng <= b.e + m && h.lat >= b.s - m && h.lat <= b.n + m) { out.hazards.push(h); out.info.ostacoli++; } });
  (D.noGoAreas || []).forEach(a => { if (a.bb[0] <= b.e + m && a.bb[2] >= b.w - m && a.bb[1] <= b.n + m && a.bb[3] >= b.s - m) { out.noGoAreas.push(a); out.info.ostacoli++; } });
  out.laneAreas = (D.laneAreas || []).filter(a => a.bb[0] <= b.e && a.bb[2] >= b.w && a.bb[1] <= b.n && a.bb[3] >= b.s);
  out.info.corsie = out.laneAreas.length;
  D.lines.forEach(l => { if (!hit(l.bb)) return; if (l.nav) { out.lines.push(l.pts); out.info.canali++; } else out.lines2.push(l.pts); });
  D.corridorAreas.forEach(a => { if (hit(a.bb)) { out.corridorAreas.push(a.rings); out.info.canali++; } });
  (D.freeAreas || []).forEach(a => { if (hit(a.bb)) out.freeAreas.push(a.rings); });
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
  /* darsene e porticcioli: si naviga liberamente anche se stanno dentro il poligono della laguna */
  ctx.clearRect(0, 0, W, H);
  let free = null;
  if (nd.freeAreas && nd.freeAreas.length) {
    nd.freeAreas.forEach(rings => { ctx.beginPath(); rings.forEach(r => { poly(r); ctx.closePath(); }); ctx.fill('evenodd'); });
    free = read();
    if (restrict) for (let i = 0; i < free.length; i++) if (free[i]) restrict[i] = 0;
  }
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
  return { restrict, free, hard, lines, linesCore, lines2, sx: m.sx, sy: m.sy, sp: m.sp, sn: m.sn, axis: m.axis, ext: m.ext, zone: m.zone, barrier: m.barrier, nogo: m.nogo, lane, ch, coastM: S.set.coast };
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
          : `${pName(pt)}: nessuna acqua navigabile nelle vicinanze${plan.cg && Number.isFinite(plan.limM) ? ` entro ${mi(plan.rules.limNm)} dalla costa` : ''}`);
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
      lp.detail = k;
      legs.push(lp);
      }
    }
    /* controllo finale dei raccordi: il primo e l'ultimo segmento di ogni tratto calcolato sulla carta devono stare in
       acqua navigabile (un punto spostato troppo li trasformerebbe in una linea dritta sopra la terra) */
    const seg = (p, q) => { for (let t = 1; t < 10; t++) if (!inWater({ lat: p.lat + (q.lat - p.lat) * t / 10, lng: p.lng + (q.lng - p.lng) * t / 10 })) return false; return true; };
    for (const lp of legs) {
      if (!lp.detail || lp.length < 2) continue;
      const n = lp.length, bad = [[lp[0], lp[1]], [lp[n - 2], lp[n - 1]]].find(([p, q]) => dist(p, q) > 25 && !seg(p, q));
      if (bad) throw new Error(`Tratto ${lp.detail}: il raccordo con il tratto vicino passa sopra la terra. Aggiungi una tappa nel canale che vuoi seguire`);
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
  const pts = [legs[0][0]], joints = [];
  legs.forEach((leg, k) => { if (k && leg[0].ui == null) joints.push(pts.length - 1); pts.push(...leg.slice(1)); });
  cutSpurs(pts, joints);
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
    ? ` Distanza massima dalla costa lungo la rotta: ${mi(farM / NM)}` + (Number.isFinite(rules.limNm) ? ` (limite ${mi(rules.limNm)}, ${rules.why}).` : '.')
    : Number.isFinite(rules.limNm) && plan && plan.noCoast ? ` Limite di ${mi(rules.limNm)} dalla costa non verificato: qui mancano i dati EMODnet (lago, fiume o zona non scaricata).` : '') +
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
  if (on && S.coarse && S.coarse.g.cd && Number.isFinite(S.coarse.limM)) {
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
  $('bWater').hidden = !S.grids.length && !(S.coarse && Number.isFinite(S.coarse.limM));
  S.waterOn = on;
}

/* ---------- Interfaccia ---------- */
const GRID = [['sog', 'Velocità (kn)'], ['cog', 'Direzione (COG)'], ['coast', 'Distanza dalla costa'], ['depth', 'Fondale (EMODnet)'], ['brg', 'Rilevamento del punto'], ['dtw', 'Distanza dal punto'], ['xte', 'Fuori rotta'], ['vmg', 'VMG (kn)'],
  ['ttg', 'Tempo al punto'], ['eta', 'Arrivo al punto'], ['rem', 'Distanza rimanente'], ['fin', 'Arrivo finale'], ['pos', 'Posizione', 1],
  ['trip', 'Percorso'], ['time', 'Tempo'], ['avg', 'Media (kn)'], ['max', 'Massima (kn)'], ['acc', 'Precisione GPS'],
  ['wind', 'Vento'], ['gust', 'Raffica'], ['wave', 'Onda'], ['pres', 'Pressione'], ['anc', 'Deriva ancora'], ['utc', 'Ora UTC']];
$('grid').innerHTML = GRID.map(g => `<div class="g${g[2] ? ' w' : ''}"><span class="lbl">${g[1]}</span><b id="d-${g[0]}">--</b></div>`).join('');
const setD = (id, v) => { const e = $('d-' + id); if (e) e.textContent = v; };

function ui() {
  const p = S.pos, N = nav();
  $('sog').textContent = p ? p.sog.toFixed(1) : '0.0';
  $('cog').textContent = p ? fmtAng(p.cog) : '---°';
  $('tgtLbl').textContent = N.label === 'MOB' ? 'Verso MOB' : 'Rilevamento';
  $('brg').textContent = fmtAng(N.brg);
  $('hud').classList.toggle('tgt', N.brg != null && Number.isFinite(N.brg));
  { const w = wps(); let tot = 0; for (let i = 1; i < w.length; i++) tot += dist(w[i - 1], w[i]);
    const pr = S.active && tot > 0 && N.rem != null ? Math.max(0, Math.min(1, 1 - N.rem / tot)) : 0;
    $('hudProg').style.width = (pr * 100).toFixed(1) + '%'; }
  $('dtw').textContent = fmtDist(N.dtw);
  $('xte').textContent = N.xte != null ? (N.xte >= 0 ? 'D ' : 'S ') + fmtDist(Math.abs(N.xte)) : '--';
  $('eta').textContent = N.eta ? fmtClock(N.eta) : '--:--';
  $('vmg').textContent = N.vmg != null ? N.vmg.toFixed(1) : '--';

  if ($('sheet').hidden || S.tab !== 'dati') return;
  const el = p && S.trip.t0 ? (Date.now() - S.trip.t0) / 1000 : NaN;
  const wx = S.wx || {};
  const f = (v, n, u) => v != null && Number.isFinite(v) ? (+v).toFixed(n) + (u || '') : '--';
  setD('sog', p ? p.sog.toFixed(1) : '--'); setD('cog', p ? fmtAng(p.cog) : '--');
  setD('brg', fmtAng(N.brg)); setD('dtw', fmtDist(N.dtw));
  setD('xte', N.xte != null ? (N.xte >= 0 ? 'D ' : 'S ') + fmtDist(Math.abs(N.xte)) : '--');
  setD('vmg', f(N.vmg, 1)); setD('ttg', fmtDur(N.ttg)); setD('eta', N.eta ? fmtClock(N.eta) : '--');
  setD('rem', fmtDist(N.rem)); setD('fin', N.eta && S.active ? fmtClock(N.eta) : '--');
  setD('pos', fmtPos(p)); setD('trip', fmtDist(S.trip.dist)); setD('time', fmtDur(el));
  { const c = S.coastHere && Date.now() - S.coastHere.t < 60000 && (p ? !S.coastHere.center : S.coastHere.center) ? S.coastHere : null;
    const sfx = c && c.center ? ' (centro carta)' : '';
    setD('coast', !c ? (p ? 'calcolo…' : '--') : (c.land ? 'in porto o a riva' : c.m == null ? `oltre ${fmtDist(c.max)}` : fmtDist(c.m)) + sfx);
    setD('depth', c && c.depth != null ? '~' + (c.depth < 10 ? c.depth.toFixed(1) : Math.round(c.depth)) + ' m' : '--'); }
  setD('avg', Number.isFinite(el) && el > 30 ? (S.trip.dist / el * KN).toFixed(1) : '--');
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
  $('bGpsL').textContent = S.sim ? 'Sim' : !S.gpsOn ? 'GPS off' : (Date.now() - S.lastFix < 8000 ? 'GPS' : 'Cerco');
  $('bFollow').className = 'fab' + (S.set.follow ? ' on' : '');
  $('bNight').className = 'fab' + (S.set.theme !== 'day' ? ' on' : '');
  $('bNightL').textContent = THEME_L[S.set.theme] || 'Giorno';
  $('bNightI').setAttribute('d', S.set.theme === 'day' ? 'M12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8' : 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z');
  $('bLayers').className = 'fab' + (S.tab === 'mappa' ? ' on' : '');
  $('bMute').className = 'fab' + (S.set.mute ? '' : ' on');
  $('bMuteL').textContent = S.set.mute ? 'Muto' : 'Audio';
  $('bMuteW').setAttribute('d', S.set.mute ? 'M16 9.5l5 5M21 9.5l-5 5' : 'M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11');
  const hg = $('homeGo'); if (hg) { hg.hidden = !wps().length; hg.textContent = S.active ? 'Torna alla navigazione' : 'Riprendi la rotta'; }
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
    ? `<span>Totale ${fmtDist(tot)}</span><span>Durata ${fmtDur(tot / (S.set.plan / KN))}</span>` + (bad ? `<span class="wr">${bad} ostacoli vicino alla rotta</span>` : '') +
      ampOnRoute().map(n => `<span class="wr">Attraversa la zona A dell'area marina protetta ${esc(n)}: lì la navigazione è di norma vietata</span>`).join('')
    : '<span class="note">Scegli partenza e destinazione sulla carta, con il GPS o cercando un luogo.</span>';
  $('sPlan').value = S.set.plan;
  $('saved').innerHTML = S.saved.map((r, i) =>
    `<div class="row" style="grid-template-columns:1fr auto auto"><b>${esc(r.name)}</b><button data-act="loadRoute" data-i="${i}">Carica</button><button data-act="delRoute" data-i="${i}" aria-label="Elimina">✕</button></div>`).join('');
  $('results').innerHTML = S.results.map((r, i) =>
    `<div class="res"><p>${esc(r.display)}</p><div class="btns">` +
    ['start|Partenza', 'via|Tappa', 'dest|Destinazione'].map(x => { const [k, l] = x.split('|'); return `<button data-act="useRes" data-k="${k}" data-i="${i}">${l}</button>`; }).join('') +
    `<button data-act="goRes" data-i="${i}">Mostra</button></div></div>`).join('');
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

const TITLES = { rotta: 'Rotta', dati: 'Bordo', mappa: 'Carta e livelli', imp: 'Barca e account', punti: 'Punti di interesse', meteo: 'Meteo', check: 'Check-list', relitto: 'Relitto', recensioni: 'Recensioni', mod: 'Moderazione', condividi: 'Condividi' };
function minSheet(on) { $('sheet').classList.toggle('min', on); if (!on) $('sheet').scrollTop = 0; }
function openSheet(t) {
  if (t === 'avvisi') t = 'dati';
  if (S.tab !== t) $('sheet').classList.remove('tall');
  if (t === 'check') $('sheet').classList.add('tall');
  S.tab = t; $('sheet').hidden = false; minSheet(false); document.body.classList.add('sheetOpen');
  $('sheetTitle').textContent = TITLES[t] || '';
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'p-' + t; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('bSet').classList.toggle('on', t === 'imp');
  if (t === 'rotta') renderRoute();
  if (t === 'dati') { renderHaz(); refreshCoast(); }
  if (t === 'punti') renderPunti();
  if (t === 'imp') boatFromCk();
  if (t === 'meteo') openMeteo();
  if (t === 'imp') renderFleetBox();
  if (t === 'mod') renderModBox();
  if (t === 'check' && window.RNCheck) window.RNCheck.render();
  $('home').hidden = true;
  ui(); fabs();
}
function closeSheet() {
  S.tab = null; $('sheet').hidden = true; $('sheet').classList.remove('min', 'tall'); document.body.classList.remove('sheetOpen');
  if ($('bLayers')) fabs();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
  $('bSet').classList.remove('on');
}
/* ingranaggio: impostazioni della barca e della patente */
$('bSet').onclick = () => { S.tab === 'imp' ? closeSheet() : openSheet('imp'); };
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => { S.tab === b.dataset.t && !$('sheet').classList.contains('min') ? closeSheet() : openSheet(b.dataset.t); }; });

function pick(type) {
  S.pick = type; closeSheet(); map.closePopup();
  $('pickBar').hidden = false;
  $('pickTxt').textContent = { start: 'Tocca la carta: PARTENZA', via: 'Tocca la carta: TAPPE (poi Fine)', dest: 'Tocca la carta: DESTINAZIONE', hazard: 'Tocca la carta: SECCA / OSTACOLO', poi: 'Tocca la carta: NUOVO PUNTO' }[type];
}
function endPick() { const was = S.pick; S.pick = null; $('pickBar').hidden = true; if (!S.tab) openSheet(was === 'poi' ? 'punti' : 'rotta'); if (was !== 'poi') autoSchedule(); }
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
  } else if (swDy < 0 && !sh.classList.contains('min') && !e.target.closest('#sheetHead')) { swY = null; }
}, { passive: false });
$('sheet').addEventListener('touchend', () => {
  if (swY == null) return;
  const sh = $('sheet'), wasMin = sh.classList.contains('min');
  sh.classList.remove('drag'); sh.style.transform = '';
  if (Math.abs(swDy) > 10) swMoved = true;
  const tall = sh.classList.contains('tall');
  if (swDy > 60) { if (wasMin) closeSheet(); else if (tall) sh.classList.remove('tall'); else minSheet(true); }
  else if (swDy < -30) { if (wasMin) minSheet(false); else sh.classList.add('tall'); }
  swY = null;
  setTimeout(() => { swMoved = false; }, 350);
});

/* ---------- Ricerca luoghi ---------- */
$('fSearch').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('q').value.trim(); if (!q) return;
  const c = parseCoords(q);
  if (c) {
    S.results = [{ display: 'Coordinate ' + fmtDMS(c), lat: c.lat, lng: c.lng }];
    showPoint(c, 'Coordinate cercate');
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
    const pts = nodes.map(n => ({ lat: +n.getAttribute('lat'), lng: +n.getAttribute('lon') })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
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

/* ---------- Relitti per immersioni (relitti.json, da OpenStreetMap/OpenSeaMap) ---------- */
const WK_CAT = { dangerous: 'pericoloso per la navigazione', 'non-dangerous': 'non pericoloso per la navigazione',
  distributed_remains: 'resti sparsi', mast_showing: 'alberi visibili', hull_showing: 'scafo visibile' };
const WK_LEVEL = { submerged: 'sommerso', awash: 'affiorante', dry: 'emerso', covers: 'coperto dalla marea', always_dry: 'sempre emerso' };
const WK_TYPE = { ship: 'nave', submarine: 'sottomarino', aircraft: 'aereo', boat: 'barca', fishing_boat: 'peschereccio', tanker: 'petroliera', cargo: 'mercantile' };
const wkName = w => w.name || (window.RNCom && RNCom.wreckName(w)) || 'Relitto senza nome';
const wkDepth = w => w.depth && w.maxDepth ? `${w.depth}–${w.maxDepth} m` : w.depth ? `${w.depth} m` : w.maxDepth ? `fino a ${w.maxDepth} m` : null;
function wikiUrl(v) { const m = /^([a-z]{2,3}):(.+)$/.exec(v || ''); return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g, '_'))}` : null; }
function safeUrl(v) { return /^https?:\/\//i.test(v || '') ? v : v && /^www\./i.test(v) ? 'https://' + v : null; }
function wkMarker(w) {
  w.marker = L.marker([w.lat, w.lng], { title: wkName(w), icon: L.divIcon({ className: '', iconSize: w.dive ? [20, 20] : [16, 16], iconAnchor: w.dive ? [10, 10] : [8, 8], html: `<div class="wk${w.dive ? ' dive' : ''}${w.comm ? ' comm' : ''}"></div>` }) })
    .bindPopup(() => wreckPopup(w)).addTo(wreckLayer);
}
/* relitti della community (comunita.js): nuovi relitti approvati e posizioni corrette approvate */
function mergeCw() {
  if (!WRECKS || !window.RNCom) return;
  const cw = RNCom.wrecks() || {}, P = cw.posizioni || {}, N = cw.nuovi || {};
  WRECKS.forEach(w => {
    const p = P[RNCom.key(w.id)];
    if (p) { if (!w.pos0) w.pos0 = { lat: w.lat, lng: w.lng }; w.lat = p.lat; w.lng = p.lng; w.posBy = p.da || ''; w.posFix = true; }
    else if (w.pos0) { w.lat = w.pos0.lat; w.lng = w.pos0.lng; delete w.pos0; w.posFix = false; }
    if (w.marker) w.marker.setLatLng([w.lat, w.lng]);
  });
  Object.entries(N).forEach(([k, v]) => {
    const id = 'u_' + k;
    let w = WRECKS.find(x => x.id === id);
    if (!w) { w = { id, comm: true }; WRECKS.push(w); }
    Object.assign(w, { lat: v.lat, lng: v.lng, name: v.n || '', depth: v.prof != null ? v.prof : null, note: v.note || '', by: v.da || '' });
    if (w.marker) w.marker.setLatLng([w.lat, w.lng]); else wkMarker(w);
  });
  for (let i = WRECKS.length - 1; i >= 0; i--) { const w = WRECKS[i]; if (w.comm && !N[w.id.slice(2)]) { if (w.marker) wreckLayer.removeLayer(w.marker); WRECKS.splice(i, 1); } }
}
const wkComm = w => w.comm ? `Segnalato dalla community${w.by ? ' da ' + esc(w.by) : ''}` : w.posFix ? `Posizione corretta dalla community${w.posBy ? ' da ' + esc(w.posBy) : ''}` : null;
function wreckPopup(w) {
  const rows = [];
  if (wkComm(w)) rows.push(`<span class="mut">${wkComm(w)}</span>`);
  if (w.dive) rows.push('Sito d\'immersione');
  if (wkDepth(w)) rows.push(`Profondità: ${esc(wkDepth(w))}`);
  if (w.type) rows.push(`Tipo: ${esc(WK_TYPE[w.type] || w.type)}`);
  if (w.sunk) rows.push(`Affondato: ${esc(w.sunk)}`);
  if (w.cat) rows.push(`Relitto ${esc(WK_CAT[w.cat] || w.cat)}`);
  if (w.level) rows.push(`Livello: ${esc(WK_LEVEL[w.level] || w.level)}`);
  if (w.note) rows.push(esc(w.note));
  rows.push(`${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`);
  const web = safeUrl(w.web), wiki = wikiUrl(w.wiki);
  const links = [web && `<a href="${esc(web)}" target="_blank" rel="noopener">Sito</a>`, wiki && `<a href="${esc(wiki)}" target="_blank" rel="noopener">Wikipedia</a>`].filter(Boolean).join(' · ');
  return `<div class="wkPop"><b>${esc(wkName(w))}</b><br>${rows.join('<br>')}${links ? '<br>' + links : ''}` +
    `<br><span class="mut">I relitti sono spesso molto pescosi: controlla che non ci siano divieti di pesca o di ancoraggio.</span>` +
    `<div class="pbtn"><button data-act="wreckInfo" data-id="${esc(w.id)}">${w.story ? '📖 ' : ''}Approfondisci</button><button data-act="wreckDest" data-lat="${w.lat}" data-lng="${w.lng}">Destinazione</button></div>` +
    `<div class="pbtn"><button data-act="ptSave" data-lat="${w.lat}" data-lng="${w.lng}" data-c="pesca" data-n="${esc(wkName(w).slice(0, 60))}">Salva come punto pesca</button></div></div>`;
}
function loadWrecks() {
  if (WRECKS || wreckLoading) return wreckLoading;
  wreckLoading = getData('relitti.json').then(d => {
    WRECKS = (d && d.items) || [];
    WRECKS.forEach(w => {
      wkMarker(w);
    });
    mergeCw();
    loadStorie().then(() => renderPunti());
    renderPunti();
    return WRECKS;
  }).catch(() => { wreckLoading = null; toast('Elenco dei relitti non disponibile'); });
  return wreckLoading;
}
/* ---------- Approfondisci: storia del relitto (relitti-storie.json, scritte dalle fonti indicate) ---------- */
let STORIE = null, storieP = null;
function loadStorie() {
  if (STORIE) return Promise.resolve(STORIE);
  if (!storieP) storieP = getData('relitti-storie.json').then(d => { STORIE = (d && d.storie) || {}; (WRECKS || []).forEach(w => { w.story = !!STORIE[w.id]; }); return STORIE; })
    .catch(() => { storieP = null; return {}; });
  return storieP;
}
async function openWreck(id) {
  if (!WRECKS) await loadWrecks();
  const w = (WRECKS || []).find(x => x.id === id); if (!w) return;
  map.closePopup(); openSheet('relitto'); $('sheet').classList.add('tall');
  const el = $('wkBox'); el.innerHTML = '<p class="note">Carico la scheda…</p>';
  const st = (await loadStorie())[w.id];
  const facts = [st && st.luogo ? `<b>Dove:</b> ${esc(st.luogo)}` : null, wkDepth(w) ? `<b>Profondità:</b> ${esc(wkDepth(w))}` : null,
    w.sunk ? `<b>Affondato:</b> ${esc(w.sunk)}` : null, w.type ? `<b>Tipo:</b> ${esc(WK_TYPE[w.type] || w.type)}` : null, w.dive ? 'Sito d\'immersione' : null,
    `<b>Posizione:</b> ${fmtDMS(w)}`, S.pos ? `<b>Da te:</b> ${fmtDist(dist(S.pos, w))}, ${fmtAng(brg(S.pos, w))}` : null].filter(Boolean);
  const a = `data-lat="${w.lat}" data-lng="${w.lng}"`;
  let h = `<h4 class="wkT">${esc(st ? st.titolo : wkName(w))}</h4><p class="wkFacts">${facts.join('<br>')}</p>`;
  if (wkComm(w)) h += `<p class="note">${wkComm(w)}, dopo il controllo di un moderatore.</p>`;
  if (w.comm && w.note) h += `<p class="wkP">${esc(w.note)}</p>`;
  if (!w.name && window.RNCom) h += wreckNameBox(w);
  if (st) {
    h += `<p class="wkIntro">${esc(st.intro)}</p>` + st.sezioni.map(s => `<h5 class="wkH">${esc(s.t)}</h5>` + s.p.map(p => `<p class="wkP">${esc(p)}</p>`).join('')).join('') +
      `<p class="note"><b>Fonti:</b> ${st.fonti.map(f => `<a href="${esc(safeUrl(f.url) || '#')}" target="_blank" rel="noopener">${esc(f.t)}</a>`).join(' · ')}. Scheda scritta solo con le informazioni di queste fonti: dove non sono certe, è detto.</p>`;
  } else {
    h += `<div id="wkWiki"><p class="note">Per questo relitto non c'è ancora una scheda con la storia${w.note ? '' : ' e nei dati nautici non ci sono altre notizie'}.</p>${w.note ? `<p class="wkP">${esc(w.note)}</p>` : ''}</div>`;
    const q = encodeURIComponent((w.name ? w.name + ' ' : '') + 'relitto');
    h += `<p class="note">Cerca notizie: <a href="https://it.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener">Wikipedia</a> · <a href="https://duckduckgo.com/?q=${q}" target="_blank" rel="noopener">web</a></p>`;
  }
  h += `<div class="btns"><button data-act="wreckShow" data-id="${esc(w.id)}">Mostra sulla carta</button><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button></div>` +
    `<div class="btns"><button data-act="revOpen" data-k="${esc(w.id)}" data-n="${esc(wkName(w).slice(0, 60))}" data-back="${esc(w.id)}">★ Recensioni</button><button data-act="ptSave" ${a} data-c="immersione" data-n="${esc(wkName(w).slice(0, 60))}">Salva nei miei punti</button></div>` +
    `<div class="btns"><button data-act="wkFix" data-id="${esc(w.id)}">📍 Correggi la posizione</button><button data-act="wreckBack">Torna ai punti</button></div>` + wreckModBtns(w) +
    '<p class="note">Immergiti solo con il brevetto adatto alla profondità, segnala l\'immersione con boa o bandiera e rispetta i divieti: molti relitti sono tutelati.</p>';
  el.innerHTML = h;
  /* niente scheda ma c'è la voce di Wikipedia nei dati: si mostra il riassunto (serve la rete) */
  const m = !st && /^([a-z]{2,3}):(.+)$/.exec(w.wiki || '');
  if (m && navigator.onLine) {
    try {
      const r = await fetch(`https://${m[1]}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(m[2].replace(/ /g, '_'))}`);
      const j = r.ok ? await r.json() : null, box = $('wkWiki');
      if (j && j.extract && box) box.innerHTML = `<p class="wkP">${esc(j.extract)}</p><p class="note">Da <a href="${esc(wikiUrl(w.wiki))}" target="_blank" rel="noopener">Wikipedia (${esc(m[1])})</a>.</p>`;
    } catch (e) { /* senza rete resta il messaggio */ }
  }
}

/* ---------- Segnala un relitto o correggi la posizione (va ai moderatori) ---------- */
let WKF = null;   // { tipo: 'nuovo'|'posizione', id, lat, lng, n, prof, note, anon, poi: id del mio punto, share }
/* punti "Relitto" già segnalati alla community (solo su questo telefono) */
const wkSent = () => { try { return JSON.parse(localStorage.getItem('rn.wkSent') || '{}') || {}; } catch (e) { return {}; } };
const wkSentSet = (id, k) => { try { const m = wkSent(); m[id] = k; localStorage.setItem('rn.wkSent', JSON.stringify(m)); } catch (e) { /* ignora */ } };
/* dal mio punto di tipo Relitto: nome, profondità, note e, se vuoi, invio alla community */
function wreckFromPoi(id, fresh) {
  const o = S.pois.find(x => x.id === id && !x.del); if (!o) return;
  const auto = /^Relitto \d+$/.test(o.name);
  openWreckForm({ tipo: 'nuovo', id: null, poi: o.id, fresh, lat: o.lat, lng: o.lng, n: auto ? '' : o.name, note: o.note || '', prof: null, share: true });
}
function openWreckForm(o) {
  WKF = Object.assign({ tipo: 'nuovo', anon: false }, WKF && o.keep ? WKF : {}, o); delete WKF.keep;
  map.closePopup(); openSheet('relitto'); $('sheet').classList.add('tall');
  const me = window.RNCom && RNCom.me(), w = WKF.id && (WRECKS || []).find(x => x.id === WKF.id);
  const pos = isFinite(WKF.lat) ? `${(+WKF.lat).toFixed(6)}, ${(+WKF.lng).toFixed(6)}` : '';
  let h = `<h4 class="wkT">${WKF.tipo === 'posizione' ? 'Correggi la posizione' : WKF.poi ? (WKF.fresh ? 'Nuovo relitto: completa la scheda' : 'Il tuo relitto') : 'Segnala un relitto'}</h4>`;
  if (WKF.poi) {
    /* dal mio punto: si salva sempre per me; la condivisione è facoltativa e richiede l'accesso */
    h += '<p class="note">Il punto è salvato nei tuoi punti. Dagli un nome e, se vuoi, condividilo: un moderatore lo controlla prima di mostrarlo a tutti.</p>' +
      `<div class="form wkForm"><label>Nome del relitto <span><input id="wkfN" maxlength="60" value="${esc(WKF.n || '')}" placeholder="es. Aereo, Peschereccio Maria…" autocomplete="off"></span></label>` +
      `<label>Posizione <span><input id="wkfP" value="${esc(pos)}" autocomplete="off"></span></label>` +
      `<div class="btns"><button type="button" data-act="wkGps">Usa la mia posizione</button><button type="button" data-act="wkPick">Scegli sulla carta</button></div>` +
      `<label>Profondità del fondo <span><input id="wkfD" type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${esc(WKF.prof != null ? WKF.prof : '')}"> m</span></label>` +
      `<label class="wide">Note <textarea id="wkfT" rows="3" maxlength="500" placeholder="Che cos'è, com'è messo, se è adatto alle immersioni, pericoli…">${esc(WKF.note || '')}</textarea></label>` +
      (me ? `<label class="chk"><input type="checkbox" id="wkfS"${WKF.share === false ? '' : ' checked'}> <span>Condividi con la community</span></label>` +
        `<label class="chk"><input type="checkbox" id="wkfA"${WKF.anon ? '' : ' checked'}> <span>Mostra il mio nome (${esc(me.name || 'utente')}) con la segnalazione</span></label>`
        : '<p class="note">Per condividerlo con tutti accedi con Google in <a href="#" data-act="goAccount">Barca e account</a>; intanto resta tra i tuoi punti.</p>') +
      `</div><div class="btns"><button class="primary" data-act="wkSend">Salva</button><button data-act="wreckBack">Annulla</button></div>`;
    $('wkBox').innerHTML = h; return;
  }
  if (!me) { $('wkBox').innerHTML = h + '<p class="note">Per segnalare un relitto o correggerne la posizione accedi con Google in <a href="#" data-act="goAccount">Barca e account</a>.</p><div class="btns"><button data-act="wreckBack">Indietro</button></div>'; return; }
  h += WKF.tipo === 'posizione' ? `<p class="note">Relitto: <b>${esc(w ? wkName(w) : 'relitto')}</b>. Posizione attuale: ${w ? fmtDMS(w.pos0 || w) : ''}. Indica quella giusta: un moderatore la controlla prima di renderla visibile a tutti.</p>`
    : '<p class="note">Indica dove si trova il relitto. Un moderatore controlla la segnalazione prima di renderla visibile a tutti.</p>';
  h += `<div class="form wkForm">` +
    (WKF.tipo === 'nuovo' ? `<label>Nome (se lo conosci) <span><input id="wkfN" maxlength="60" value="${esc(WKF.n || '')}" placeholder="es. Peschereccio Maria" autocomplete="off"></span></label>` : '') +
    `<label>Posizione <span><input id="wkfP" value="${esc(pos)}" placeholder="45.6321, 13.0712 oppure 45°37'55&quot;N 13°04'16&quot;E" autocomplete="off"></span></label>` +
    `<div class="btns"><button type="button" data-act="wkGps">Usa la mia posizione</button><button type="button" data-act="wkPick">Scegli sulla carta</button></div>` +
    (WKF.tipo === 'nuovo' ? `<label>Profondità del fondo <span><input id="wkfD" type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${esc(WKF.prof != null ? WKF.prof : '')}"> m</span></label>` +
      `<label class="wide">Note <textarea id="wkfT" rows="3" maxlength="500" placeholder="Che cos'è, com'è messo, se è adatto alle immersioni, pericoli…">${esc(WKF.note || '')}</textarea></label>` : '') +
    `<label class="chk"><input type="checkbox" id="wkfA"${WKF.anon ? '' : ' checked'}> <span>Mostra il mio nome (${esc(me.name || 'utente')}) con la segnalazione</span></label>` +
    `</div><div class="btns"><button class="primary" data-act="wkSend">Invia ai moderatori</button><button data-act="${w ? 'wreckInfo' : 'wreckBack'}"${w ? ` data-id="${esc(w.id)}"` : ''}>Annulla</button></div>`;
  const mineN = Object.keys((RNCom.myWreckProps && RNCom.myWreckProps()) || {}).length;
  if (mineN) h += `<p class="note">${mineN === 1 ? 'Hai 1 segnalazione' : `Hai ${mineN} segnalazioni`} in attesa di controllo.</p>`;
  $('wkBox').innerHTML = h;
}
function wkFormRead() {
  if (!WKF || !$('wkfP')) return;
  const p = parseCoords($('wkfP').value); if (p) { WKF.lat = p.lat; WKF.lng = p.lng; }
  if ($('wkfN')) WKF.n = $('wkfN').value;
  if ($('wkfD')) WKF.prof = $('wkfD').value === '' ? null : parseFloat($('wkfD').value.replace(',', '.'));
  if ($('wkfT')) WKF.note = $('wkfT').value;
  WKF.anon = $('wkfA') ? !$('wkfA').checked : WKF.anon;
  WKF.share = $('wkfS') ? $('wkfS').checked : false;
}
/* scelta del punto sulla carta: mirino al centro, sposti la carta e confermi */
function wkPickStart() {
  wkFormRead(); minSheet(true);
  if (isFinite(WKF.lat)) map.setView([WKF.lat, WKF.lng], Math.max(map.getZoom(), 15));
  document.body.classList.add('picking'); $('pickBar').hidden = false;
}
function wkPickEnd(ok) {
  document.body.classList.remove('picking'); $('pickBar').hidden = true;
  if (ok) { const c = map.getCenter(); WKF.lat = c.lat; WKF.lng = c.lng; }
  minSheet(false); openWreckForm({ keep: true });
}
function renderWkMod() {
  const P = RNCom.wreckProposals(); if (P === null) return '<p class="note">Carico le segnalazioni…</p>';
  const rows = [];
  Object.entries(P || {}).forEach(([uid, byK]) => Object.entries(byK || {}).forEach(([k, p]) => rows.push({ uid, k, p })));
  rows.sort((a, b) => (a.p.t || 0) - (b.p.t || 0));
  if (!rows.length) return '<p class="note">Nessuna segnalazione di relitti da controllare.</p>';
  return `<p class="note">${rows.length === 1 ? '1 segnalazione' : rows.length + ' segnalazioni'} di relitti:</p>` + rows.map(r => {
    const w = r.p.id && (WRECKS || []).find(x => x.id === r.p.id);
    const what = r.p.tipo === 'posizione' ? `Posizione corretta per <b>${esc(w ? wkName(w) : r.p.id)}</b>${w ? ` (spostamento di ${fmtDist(dist(w.pos0 || w, r.p))})` : ''}` : `Nuovo relitto: <b>${esc(r.p.n || 'senza nome')}</b>`;
    return `<div class="revItem"><div>${what}</div><div class="mut">${fmtDMS(r.p)}${r.p.prof != null ? ` · fondo ${esc(r.p.prof)} m` : ''} · da ${esc(r.p.u || 'utente')}${r.p.anon ? ' (nome nascosto al pubblico)' : ''}${r.p.t ? ' il ' + new Date(r.p.t).toLocaleDateString('it-IT') : ''}</div>` +
      (r.p.note ? `<p>${esc(r.p.note)}</p>` : '') +
      `<div class="btns"><button class="primary" data-act="modWkOk" data-u="${esc(r.uid)}" data-k="${esc(r.k)}">Approva</button><button class="danger" data-act="modWkNo" data-u="${esc(r.uid)}" data-k="${esc(r.k)}">Rifiuta</button><button data-act="modWkShow" data-lat="${r.p.lat}" data-lng="${r.p.lng}">Vedi sulla carta</button></div></div>`;
  }).join('');
}

/* già approvati: il moderatore può toglierli se si accorge di un errore (doppio tocco per confermare) */
const modDel = (act, k, label) => `<button class="danger" data-act="${act}" data-k="${esc(k)}">${label}</button>`;
function renderModDone() {
  const N = RNCom.approvedNames() || {}, cw = RNCom.wrecks() || {}, U = cw.nuovi || {}, P = cw.posizioni || {};
  const byKey = k => (WRECKS || []).find(w => RNCom.key(w.id) === k);
  const CP = RNCom.points() || {};
  const tot = Object.keys(N).length + Object.keys(U).length + Object.keys(P).length + Object.keys(CP).length;
  let h = `<h4>Già approvati</h4>`;
  if (!tot) return h + '<p class="note">Niente di approvato finora.</p>';
  h += '<p class="note">Se ti accorgi che qualcosa è sbagliato puoi toglierlo: tocca due volte il pulsante rosso per confermare.</p>';
  const row = (title, sub, show, del) => `<div class="revItem"><div>${title}</div>${sub ? `<div class="mut">${sub}</div>` : ''}<div class="btns">${show}${del}</div></div>`;
  if (Object.keys(N).length) h += `<details class="info"><summary>Nomi dei relitti (${Object.keys(N).length})</summary>` + Object.entries(N).map(([k, v]) => {
    const w = byKey(k);
    return row(`<b>${esc(v.n)}</b>`, v.da ? `proposto da ${esc(v.da)}` : '', w ? `<button data-act="wreckInfo" data-id="${esc(w.id)}">Vedi il relitto</button>` : '', modDel('modDelName', k, 'Togli il nome'));
  }).join('') + '</details>';
  if (Object.keys(U).length) h += `<details class="info"><summary>Relitti aggiunti (${Object.keys(U).length})</summary>` + Object.entries(U).map(([k, v]) =>
    row(`<b>${esc(v.n || 'Relitto senza nome')}</b>`, `${fmtDMS(v)}${v.da ? ` · da ${esc(v.da)}` : ''}`, `<button data-act="wreckInfo" data-id="u_${esc(k)}">Vedi</button>`, modDel('modDelWk', k, 'Elimina il relitto'))).join('') + '</details>';
  if (Object.keys(P).length) h += `<details class="info"><summary>Posizioni corrette (${Object.keys(P).length})</summary>` + Object.entries(P).map(([k, v]) => {
    const w = byKey(k);
    return row(`<b>${esc(w ? (w.name || wkName(w)) : v.id)}</b>`, `nuova posizione ${fmtDMS(v)}${v.da ? ` · da ${esc(v.da)}` : ''}`, w ? `<button data-act="wreckInfo" data-id="${esc(w.id)}">Vedi</button>` : '', modDel('modDelPos', k, 'Torna alla posizione originale'));
  }).join('') + '</details>';
  if (Object.keys(CP).length) h += `<details class="info"><summary>Punti della community (${Object.keys(CP).length})</summary>` + Object.entries(CP).map(([k, v]) =>
    row(`${poiCat(v.cat).i} <b>${esc(v.n)}</b>`, `${esc(poiCat(v.cat).l)} · ${fmtDMS(v)}${v.da ? ` · da ${esc(v.da)}` : ''}`, `<button data-act="cpGo" data-k="${esc(k)}">Vedi</button>`, modDel('modDelCp', k, 'Elimina il punto'))).join('') + '</details>';
  return h;
}
/* pulsanti del moderatore nella scheda del relitto */
function wreckModBtns(w) {
  if (!window.RNCom || !RNCom.isMod()) return '';
  const k = RNCom.key(w.id), b = [];
  if (w.comm) b.push(modDel('modDelWk', w.id.slice(2), 'Elimina il relitto'));
  if (w.posFix) b.push(modDel('modDelPos', k, 'Torna alla posizione originale'));
  if ((RNCom.approvedNames() || {})[k]) b.push(modDel('modDelName', k, 'Togli il nome della community'));
  return b.length ? `<div class="cmBox"><h5 class="wkH">Moderatore</h5><div class="btns">${b.join('')}</div></div>` : '';
}

/* ---------- Punti condivisi con la community (pesca, fonda, immersione, bagno) ---------- */
const SHARE_CAT = ['pesca', 'fonda', 'immersione', 'bagno'];
function openPointShare(id) {
  const o = S.pois.find(x => x.id === id && !x.del); if (!o) return;
  map.closePopup(); openSheet('condividi'); $('sheet').classList.add('tall');
  const me = window.RNCom && RNCom.me(), c = poiCat(o.cat), auto = new RegExp('^' + c.l + ' \\d+$').test(o.name);
  let h = `<h4 class="wkT">${c.i} Condividi con la community</h4>`;
  if (!me) { $('shBox').innerHTML = h + '<p class="note">Per condividere un punto accedi con Google in <a href="#" data-act="goAccount">Barca e account</a>.</p><div class="btns"><button data-act="wreckBack">Indietro</button></div>'; return; }
  h += `<p class="note">${esc(c.l)} in ${fmtDMS(o)}. Un moderatore lo controlla prima di mostrarlo a tutti; il punto resta comunque tra i tuoi.</p>` +
    `<div class="form wkForm"><label>Nome <span><input id="shN" maxlength="60" value="${esc(auto ? '' : o.name)}" placeholder="es. Secca della Mula, Tegnùa piccola…" autocomplete="off"></span></label>` +
    `<label class="wide">Note per gli altri <textarea id="shT" rows="3" maxlength="500" placeholder="${o.cat === 'pesca' ? 'Cosa si pesca, con che tecnica, profondità, periodo migliore…' : 'Fondale, profondità, ridosso, cosa vedere…'}">${esc(o.note || '')}</textarea></label>` +
    `<label class="chk"><input type="checkbox" id="shA" checked> <span>Mostra il mio nome (${esc(me.name || 'utente')}) con il punto</span></label></div>` +
    `<div class="btns"><button class="primary" data-act="shSend" data-id="${o.id}">Invia ai moderatori</button><button data-act="wreckBack">Annulla</button></div>`;
  $('shBox').innerHTML = h;
}
const cpLayer = L.layerGroup(), cpMk = new Map();
function drawComm() {
  cpLayer.clearLayers(); cpMk.clear();
  if (!S.set.comm || !window.RNCom) return;
  Object.entries(RNCom.points() || {}).forEach(([k, v]) => {
    const c = poiCat(v.cat);
    const m = L.marker([v.lat, v.lng], { title: v.n, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="cpI">${c.i}</div>` }) })
      .bindPopup(() => cpPopup(k)).addTo(cpLayer);
    cpMk.set(k, m);
  });
}
function cpPopup(k) {
  const v = (RNCom.points() || {})[k]; if (!v) return 'Punto non più disponibile';
  const c = poiCat(v.cat), a = `data-lat="${v.lat}" data-lng="${v.lng}"`;
  return `<div class="wkPop"><b>${c.i} ${esc(v.n)}</b><br>${esc(c.l)} · <span class="mut">condiviso${v.da ? ' da ' + esc(v.da) : ' dalla community'}</span>` +
    (v.note ? `<p class="pnote">${esc(v.note)}</p>` : '<br>') + `${fmtDMS(v)}${S.pos ? `<br>Da te: ${fmtDist(dist(S.pos, v))}, ${fmtAng(brg(S.pos, v))}` : ''}` +
    `<div class="pbtn"><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button><button data-act="ptMeteo" ${a}>Meteo qui</button></div>` +
    `<div class="pbtn"><button data-act="revOpen" data-k="cp_${esc(k)}" data-n="${esc(v.n.slice(0, 60))}">★ Recensioni</button><button data-act="ptSave" ${a} data-c="${esc(v.cat)}" data-n="${esc(v.n.slice(0, 60))}">Salva nei miei punti</button></div>` +
    (RNCom.isMod() ? `<div class="pbtn">${modDel('modDelCp', k, 'Elimina (moderatore)')}</div>` : '') +
    '<span class="mut">Indicazione di un altro utente: controlla divieti e ordinanze.</span></div>';
}
function renderComm(ref, from) {
  const el = $('commList'); if (!el) return;
  if (!S.set.comm || !window.RNCom) { el.innerHTML = ''; return; }
  const L1 = Object.entries(RNCom.points() || {}).map(([k, v]) => ({ k, v, d: dist(ref, v) })).filter(x => x.d < 30 * NM).sort((a, b) => a.d - b.d).slice(0, 10);
  const mineN = Object.keys(RNCom.myPointProps() || {}).length;
  el.innerHTML = (L1.length ? `<p class="note">Più vicini ${from}:</p>` + L1.map(x => `<button data-act="cpGo" data-k="${esc(x.k)}"><span><i class="cpI sm">${poiCat(x.v.cat).i}</i><b>${esc(x.v.n)}</b>${x.v.da ? ' · ' + esc(x.v.da) : ''}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`).join('')
    : '<p class="note">Ancora nessun punto condiviso qui vicino: condividi i tuoi aprendoli sulla carta.</p>') +
    (mineN ? `<p class="note">${mineN === 1 ? 'Hai 1 punto' : `Hai ${mineN} punti`} in attesa di controllo.</p>` : '');
}
function renderPpMod() {
  const P = RNCom.pointProposals(); if (P === null) return '<p class="note">Carico i punti…</p>';
  const rows = [];
  Object.entries(P || {}).forEach(([uid, byK]) => Object.entries(byK || {}).forEach(([k, p]) => rows.push({ uid, k, p })));
  rows.sort((a, b) => (a.p.t || 0) - (b.p.t || 0));
  if (!rows.length) return '<p class="note">Nessun punto da controllare.</p>';
  return rows.map(r => `<div class="revItem"><div>${poiCat(r.p.cat).i} <b>${esc(r.p.n)}</b> · ${esc(poiCat(r.p.cat).l)}</div>` +
    `<div class="mut">${fmtDMS(r.p)} · da ${esc(r.p.u || 'utente')}${r.p.anon ? ' (nome nascosto al pubblico)' : ''}${r.p.t ? ' il ' + new Date(r.p.t).toLocaleDateString('it-IT') : ''}</div>` +
    (r.p.note ? `<p>${esc(r.p.note)}</p>` : '') +
    `<div class="btns"><button class="primary" data-act="modPpOk" data-u="${esc(r.uid)}" data-k="${esc(r.k)}">Approva</button><button class="danger" data-act="modPpNo" data-u="${esc(r.uid)}" data-k="${esc(r.k)}">Rifiuta</button><button data-act="modWkShow" data-lat="${r.p.lat}" data-lng="${r.p.lng}">Vedi sulla carta</button></div></div>`).join('');
}

/* nome di un relitto senza nome: privato o proposto alla community (comunita.js) */
function wreckNameBox(w) {
  const info = RNCom.nameInfo(w), me = RNCom.me();
  return `<div class="cmBox"><h5 class="wkH">Nome del relitto</h5>` +
    (info.approved ? `<p class="note">Nome dato dalla community: <b>${esc(info.approved.n)}</b>${info.approved.da ? ` (proposto da ${esc(info.approved.da)})` : ''}.</p>` : '<p class="note">Il nome di questo relitto non è noto. Se lo conosci, scrivilo: lo vedrai tu e, se lo condividi, tutti dopo l\'approvazione di un moderatore.</p>') +
    (me ? `<form class="search" onsubmit="return false"><input id="wkNameIn" maxlength="60" value="${esc(info.mine || '')}" placeholder="Nome del relitto" autocomplete="off"><button type="button" data-act="wkNameSave" data-id="${esc(w.id)}">Salva</button></form>` +
      `<label class="chk"><input type="checkbox" id="wkNameShare"${info.shared ? ' checked' : ''}> Condividi con la community</label>` +
      (info.mine ? `<p class="note">Il nome che hai dato tu: <b>${esc(info.mine)}</b>${info.shared ? ' (proposto alla community)' : ' (solo per te)'}. Per toglierlo svuota la casella e tocca Salva.</p>` : '')
      : '<p class="note">Per dare un nome al relitto accedi con Google in <a href="#" data-act="goAccount">Barca e account</a>.</p>') + '</div>';
}

/* ---------- Recensioni (comunita.js): marine, distributori, punti di fonda, zone di pesca, relitti ---------- */
let REV = null;
async function openReviews(k, title, back) {
  REV = { k, title, back, s: 0 };
  map.closePopup(); openSheet('recensioni'); $('sheet').classList.add('tall');
  const el = $('revBox'); el.innerHTML = `<h4 class="wkT">${esc(title || 'Recensioni')}</h4><p class="note">Carico le recensioni…</p>`;
  let list = {};
  try { list = await RNCom.reviews(k); } catch (e) { list = null; }
  if (!REV || REV.k !== k) return;
  const me = RNCom.me(), mod = RNCom.isMod(), arr = Object.entries(list || {}).map(([uid, r]) => Object.assign({ uid }, r)).sort((a, b) => (b.t || 0) - (a.t || 0));
  const mine = me && arr.find(r => r.uid === me.uid);
  REV.s = mine ? mine.s : 0;
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n), avg = arr.length ? arr.reduce((a, r) => a + r.s, 0) / arr.length : 0;
  let h = `<h4 class="wkT">${esc(title || 'Recensioni')}</h4>` +
    (list === null ? '<p class="note warn">Recensioni non disponibili: serve la connessione a internet.</p>'
      : arr.length ? `<p class="revAvg"><span class="stars">${stars(Math.round(avg))}</span> <b>${avg.toFixed(1).replace('.', ',')}</b> su 5 · ${arr.length} ${arr.length === 1 ? 'recensione' : 'recensioni'}</p>` : '<p class="note">Ancora nessuna recensione: scrivi la prima.</p>');
  h += me ? `<div class="cmBox"><h5 class="wkH">${mine ? 'La tua recensione' : 'Scrivi una recensione'}</h5><div class="starIn">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="revStar" data-s="${n}" aria-label="${n} stelle" class="${n <= REV.s ? 'on' : ''}">★</button>`).join('')}</div>` +
      `<textarea id="revTxt" rows="3" maxlength="500" placeholder="Com'è andata? Servizi, prezzi, cortesia, fondale…">${esc(mine ? mine.txt || '' : '')}</textarea>` +
      `<div class="btns"><button class="primary" data-act="revSave">Pubblica</button>${mine ? '<button class="danger" data-act="revDel">Cancella la mia</button>' : ''}</div>` +
      '<p class="note">La recensione è pubblica, con il nome del tuo account Google.</p></div>'
    : '<p class="note">Per scrivere una recensione accedi con Google in <a href="#" data-act="goAccount">Barca e account</a>.</p>';
  h += arr.filter(r => !me || r.uid !== me.uid || true).map(r => `<div class="revItem"><div><span class="stars">${stars(r.s)}</span> <b>${esc(r.n || 'Utente')}</b>${r.t ? ' · ' + new Date(r.t).toLocaleDateString('it-IT') : ''}</div>` +
    (r.txt ? `<p>${esc(r.txt)}</p>` : '') + (mod && (!me || r.uid !== me.uid) ? `<button class="danger sm" data-act="revModDel" data-u="${esc(r.uid)}">Cancella (moderatore)</button>` : '') + '</div>').join('');
  h += `<div class="btns"><button data-act="revBack">Indietro</button></div>`;
  el.innerHTML = h;
}

/* ---------- Moderazione (Barca e account): proposte di nomi dei relitti ---------- */
/* sezione Moderazione: pulsante nel menu principale visibile solo ai moderatori, con il numero di cose da controllare */
function modCount() {
  if (!window.RNCom || !RNCom.isMod()) return 0;
  let n = 0;
  Object.values(RNCom.proposals() || {}).forEach(x => { n += Object.keys(x || {}).length; });
  Object.values(RNCom.wreckProposals() || {}).forEach(x => { n += Object.keys(x || {}).length; });
  Object.values(RNCom.pointProposals() || {}).forEach(x => { n += Object.keys(x || {}).length; });
  return n;
}
function modHome() {
  const b = $('hmMod'); if (!b) return;
  const on = !!(window.RNCom && RNCom.me() && RNCom.isMod());
  b.hidden = !on;
  const n = on ? modCount() : 0, bd = $('modBadge');
  if (bd) { bd.hidden = !n; bd.textContent = n > 99 ? '99+' : String(n); }
  /* su telefono l'ultimo pulsante, se sono dispari, occupa tutta la riga */
  const vis = [...document.querySelectorAll('.hmGrid button')].filter(x => !x.hidden);
  vis.forEach((x, i) => x.classList.toggle('full', i === vis.length - 1 && vis.length % 2 === 1));
  if (!on && S.tab === 'mod' && !$('sheet').hidden) closeSheet();
}
function renderModBox() {
  const el = $('modBox'); if (!el) return;
  const me = window.RNCom && RNCom.me();
  if (!me || !RNCom.isMod()) { el.innerHTML = '<p class="note">Questa sezione è riservata ai moderatori.</p>'; return; }
  let h = '';
  if (RNCom.isMod()) {
    const P = RNCom.proposals(), rows = [];
    Object.entries(P || {}).forEach(([k, byU]) => Object.entries(byU || {}).forEach(([uid, p]) => rows.push({ k, uid, p })));
    rows.sort((a, b) => (a.p.t || 0) - (b.p.t || 0));
    h += `<h4>Nomi dei relitti</h4>` + (P === null ? '<p class="note">Carico le proposte…</p>' : rows.length ? `<p class="note">${rows.length === 1 ? '1 proposta' : rows.length + ' proposte'} di nomi per i relitti:</p>` +
      rows.map(r => `<div class="revItem"><div><b>${esc(r.p.n)}</b> · proposto da ${esc(r.p.u || 'utente')}${r.p.t ? ' il ' + new Date(r.p.t).toLocaleDateString('it-IT') : ''}</div>` +
        `<div class="btns"><button class="primary" data-act="modOk" data-k="${esc(r.k)}" data-u="${esc(r.uid)}">Approva</button><button class="danger" data-act="modNo" data-k="${esc(r.k)}" data-u="${esc(r.uid)}">Rifiuta</button><button data-act="wreckInfo" data-id="${esc(r.p.id)}">Vedi il relitto</button></div></div>`).join('')
      : '<p class="note">Nessuna proposta di nomi da approvare.</p>') + '<h4>Relitti segnalati</h4>' + renderWkMod() + '<h4>Punti condivisi</h4>' + renderPpMod() + renderModDone();
  }
  el.innerHTML = h;
}
if (window.RNCom) RNCom.on(() => { mergeCw(); drawComm(); modHome(); if (S.tab === 'mod') renderModBox(); if (S.tab === 'punti') renderPunti(); });
if (window.Flotta) window.Flotta.on(() => modHome());
modHome();

/* ---------- Marine, distributori di carburante e scivoli (servizi.json, da OpenStreetMap) ---------- */
const SERV = { carburante: ['⛽', 'Carburante'], acqua: ['🚰', 'Acqua'], elettricita: ['🔌', 'Corrente'], bagni: ['🚻', 'Bagni'], docce: ['🚿', 'Docce'],
  scivolo: ['🛶', 'Scivolo'], gru: ['🏗️', 'Gru / alaggio'], nautica: ['🛒', 'Negozio nautico'], cambusa: ['🛍️', 'Cambusa'], lavanderia: ['🧺', 'Lavanderia'],
  rifiuti: ['♻️', 'Rifiuti'], svuotamento: ['🚽', 'Svuotamento acque nere'], ospiti: ['⚓', 'Posti per ospiti'], velaio: ['⛵', 'Velaio'], parcheggio: ['🅿️', 'Parcheggio'],
  circolo: ['🏁', 'Circolo nautico'], medico: ['⚕️', 'Medico'], farmacia: ['💊', 'Farmacia'], wifi: ['📶', 'Wi-Fi'], pesca: ['🎣', 'Negozio di pesca'], riparazioni: ['🔧', 'Riparazioni'] };
const servLayer = L.layerGroup();
let SRV = null, srvP = null;
const srvMk = new Map();
function loadServizi() {
  if (SRV || srvP) return srvP || Promise.resolve(SRV);
  srvP = getData('servizi.json').then(d => { SRV = { marine: (d && d.marine) || [], carburante: (d && d.carburante) || [], scivoli: (d && d.scivoli) || [], created: d && d.created }; drawServizi(); renderPunti(); return SRV; })
    .catch(() => { srvP = null; SRV = { marine: [], carburante: [], scivoli: [], missing: true }; renderPunti(); });
  return srvP;
}
function drawServizi() {
  servLayer.clearLayers(); srvMk.clear();
  if (!SRV || !S.set.servizi || map.getZoom() < 10) return;
  const B = map.getBounds().pad(0.2), inB = o => B.contains([o.lat, o.lng]);
  const add = (o, k, html, size, pop) => { const m = L.marker([o.lat, o.lng], { title: o.name || '', icon: L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html }) }).bindPopup(pop).addTo(servLayer); srvMk.set(k + o.id, m); };
  SRV.marine.filter(inB).slice(0, 250).forEach(o => add(o, 'm', '<div class="svI ma">⛵</div>', 24, () => marinaPopup(o)));
  SRV.carburante.filter(inB).slice(0, 150).forEach(o => add(o, 'f', '<div class="svI fu">⛽</div>', 24, () => fuelPopup(o)));
  if (map.getZoom() >= 12) SRV.scivoli.filter(inB).slice(0, 150).forEach(o => add(o, 's', '<div class="svI sl">S</div>', 18, () => slipPopup(o)));
}
map.on('moveend', () => { if (S.set.servizi && SRV) drawServizi(); });
const svcChips = s => (s || []).filter(k => SERV[k]).map(k => `<span class="svc">${SERV[k][0]} ${SERV[k][1]}</span>`).join('');
function srvFoot(o, kind, name) {
  const a = `data-lat="${o.lat}" data-lng="${o.lng}"`;
  return `<br>${fmtDMS(o)}${S.pos ? `<br>Da te: ${fmtDist(dist(S.pos, o))}, ${fmtAng(brg(S.pos, o))}` : ''}` +
    `<div class="pbtn"><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button><button data-act="ptMeteo" ${a}>Meteo qui</button></div>` +
    `<div class="pbtn"><button data-act="revOpen" data-k="${kind}_${esc(o.id)}" data-n="${esc(name.slice(0, 60))}">★ Recensioni</button><button data-act="ptSave" ${a} data-c="altro" data-n="${esc(name.slice(0, 60))}">Salva nei miei punti</button></div>` +
    '<span class="mut">Dati da OpenStreetMap: orari e servizi possono mancare o essere cambiati, conviene chiamare prima.</span></div>';
}
function marinaPopup(o) {
  const name = o.name || 'Marina', web = safeUrl(o.web);
  const rows = [o.posti ? `Posti barca: ${esc(o.posti)}` : null, o.prof ? `Profondità: ${esc(o.prof)} m` : null, o.vhf ? `VHF: canale ${esc(o.vhf)}` : null,
    o.tel ? `Tel.: <a href="tel:${esc(o.tel.replace(/[^+\d]/g, ''))}">${esc(o.tel)}</a>` : null, web ? `<a href="${esc(web)}" target="_blank" rel="noopener">Sito della marina</a>` : null].filter(Boolean);
  return `<div class="wkPop"><b>⛵ ${esc(name)}</b><br>` + (o.s && o.s.length ? `<div class="svcs">${svcChips(o.s)}</div>` : '<span class="mut">Servizi non indicati nei dati.</span><br>') + rows.join('<br>') + srvFoot(o, 'm', name);
}
function fuelPopup(o) {
  const name = o.name || 'Distributore per barche', fu = [o.diesel && 'gasolio', o.benzina && 'benzina', o.miscela && 'miscela'].filter(Boolean);
  const rows = [o.brand && o.brand !== o.name ? esc(o.brand) : null, fu.length ? 'Carburanti: ' + fu.join(', ') : null, o.orari ? `Orari: ${esc(o.orari)}` : null,
    o.tel ? `Tel.: <a href="tel:${esc(o.tel.replace(/[^+\d]/g, ''))}">${esc(o.tel)}</a>` : null, o.marina ? `Nella ${esc(o.marina)}` : null].filter(Boolean);
  return `<div class="wkPop"><b>⛽ ${esc(name)}</b><br>${rows.join('<br>')}` + srvFoot(o, 'f', name);
}
function slipPopup(o) { return `<div class="wkPop"><b>🛶 ${esc(o.name || 'Scivolo')}</b><br>Scivolo per alare e varare${o.fee ? ` · ${/^no$/i.test(o.fee) ? 'gratuito' : 'a pagamento'}` : ''}` + srvFoot(o, 's', o.name || 'Scivolo'); }
function renderServizi(ref, from) {
  const el = $('servList'); if (!el) return;
  if (!S.set.servizi) { el.innerHTML = ''; return; }
  if (!SRV) { el.innerHTML = '<p class="note">Carico marine e distributori…</p>'; loadServizi(); return; }
  if (SRV.missing || !(SRV.marine.length + SRV.carburante.length)) { el.innerHTML = '<p class="note">Marine e distributori non ancora disponibili: l\'elenco si scarica da OpenStreetMap e arriva con il prossimo aggiornamento dei dati.</p>'; return; }
  const L1 = SRV.marine.map((o, i) => ({ o, i, k: 'm', d: dist(ref, o) })).concat(SRV.carburante.map((o, i) => ({ o, i, k: 'f', d: dist(ref, o) })))
    .filter(x => x.d < 25 * NM).sort((a, b) => a.d - b.d).slice(0, 10);
  el.innerHTML = L1.length ? `<p class="note">Più vicini ${from}:</p>` + L1.map(x => `<button data-act="srvGo" data-k="${x.k}" data-i="${x.i}"><span><i class="svI sm ${x.k === 'm' ? 'ma' : 'fu'}">${x.k === 'm' ? '⛵' : '⛽'}</i><b>${esc(x.o.name || (x.k === 'm' ? 'Marina' : 'Distributore'))}</b>${x.k === 'm' && x.o.s && x.o.s.length ? ' · ' + x.o.s.slice(0, 4).map(s => SERV[s] ? SERV[s][0] : '').join('') : ''}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`).join('')
    : '<p class="note">Nessuna marina o distributore entro 25 miglia.</p>';
}

/* elenco dei relitti più vicini (alla barca se c'è il GPS, altrimenti al centro della carta) */
function renderWrecks() {
  const el = $('wreckList'); if (!el) return;
  if (!S.set.wrecks) { el.innerHTML = ''; return; }
  if (!WRECKS) { el.innerHTML = '<p class="note">Carico i relitti…</p>'; loadWrecks(); return; }
  const c = S.pos || map.getCenter(), from = S.pos ? 'dalla barca' : 'dal centro della carta';
  const list = WRECKS.map((w, i) => ({ w, i, d: dist(c, w) })).filter(x => x.d < 60 * 1852).sort((a, b) => a.d - b.d).slice(0, 12);
  el.innerHTML = list.length
    ? `<p class="note">Più vicini ${from}: tocca un relitto per la sua scheda (📖 = con la storia).</p>` + list.map(x => `<button data-act="wreckInfo" data-id="${esc(x.w.id)}"><span><i class="wk${x.w.dive ? ' dive' : ''}" style="display:inline-block;vertical-align:middle;margin-right:6px"></i><b>${esc(wkName(x.w))}</b>${x.w.story ? ' 📖' : ''}${wkDepth(x.w) ? ' · ' + esc(wkDepth(x.w)) : ''}</span><span>${(x.d / 1852).toFixed(1)} mn</span></button>`).join('')
    : '<p class="note">Nessun relitto entro 60 miglia.</p>';
}
map.on('moveend', () => { if (S.tab === 'punti' && !S.pos) renderPunti(); });

/* ---------- Traffico navale (AIS, mappa gratuita di VesselFinder in traffico.html) ---------- */
function openAis() {
  if (!navigator.onLine) { toast('Il traffico navale richiede la connessione a internet'); return; }
  const c = map.getCenter(), z = Math.max(3, Math.min(18, Math.round(map.getZoom())));
  $('aisFrame').src = `${DATA_BASE}traffico.html?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&zoom=${z}`;
  $('aisBox').hidden = false; $('bAis').classList.add('on');
}
function closeAis() {
  if (!$('aisBox') || $('aisBox').hidden) return;
  $('aisBox').hidden = true; $('aisFrame').src = 'about:blank'; $('bAis').classList.remove('on');
}
$('bAis').onclick = () => { $('aisBox').hidden ? openAis() : closeAis(); };
$('aisClose').onclick = closeAis;

/* ---------- Barche con Rotta Nautica (accesso Google, flotta.js) ---------- */
const BOAT_L = { motore: 'Barca a motore', gommone: 'Gommone', vela: 'Barca a vela', moto: "Moto d'acqua", remi: 'Canoa, kayak, SUP, pedalò' };
const FL = window.Flotta || null;
function fleetName() {
  const n = (S.set.fleetName || '').trim() || (FL && FL.user && FL.user.name.split(' ')[0]) || 'Barca';
  return n.slice(0, 30);
}
const fleetPos = () => ({ lat: S.pos.lat, lng: S.pos.lng, cog: S.pos.cog, sog: S.pos.sog, name: fleetName(), boat: S.set.boat });
function ago(ms) { const s = Math.round(ms / 1000); return s < 20 ? 'adesso' : s < 90 ? s + ' s fa' : Math.round(s / 60) + ' min fa'; }
function fleetIcon(o) {
  const moving = o.cog != null && o.sog != null && o.sog > 0.5;
  const shape = moving ? '<path d="M0-12 L8 10 L0 5 L-8 10Z" fill="#1fbf7a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
    : '<circle r="6" fill="#1fbf7a" stroke="#fff" stroke-width="2"/>';
  return L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
    html: `<div class="fl${FL.age(o) > 180e3 ? ' old' : ''}"><svg viewBox="-15 -15 30 30" width="30" height="30"><g transform="rotate(${moving ? o.cog : 0})">${shape}</g></svg><span>${esc(o.name)}</span></div>` });
}
function fleetPopup(id) {
  const o = FL && FL.list().find(x => x.id === id);
  if (!o) return 'Barca non più collegata';
  const rows = [BOAT_L[o.boat] || o.boat, o.sog != null ? `Velocità: ${o.sog.toFixed(1)} nodi` : null,
    o.cog != null && o.sog > 0.5 ? `Rotta: ${String(o.cog).padStart(3, '0')}°` : null,
    S.pos ? `Distanza: ${fmtDist(dist(S.pos, o))}` : null, `Aggiornata ${ago(FL.age(o))}`].filter(Boolean).map(esc);
  return `<div class="wkPop"><b>${esc(o.name)}</b><br>${rows.join('<br>')}` +
    `<button data-act="fleetDest" data-lat="${o.lat}" data-lng="${o.lng}">Imposta come destinazione</button></div>`;
}
function renderFleetMarkers() {
  const list = FL && FL.user ? FL.list() : [], ids = new Set(list.map(o => o.id));
  fleetMk.forEach((m, id) => { if (!ids.has(id)) { fleetLayer.removeLayer(m); fleetMk.delete(id); } });
  list.forEach(o => {
    let m = fleetMk.get(o.id);
    if (!m) { m = L.marker([o.lat, o.lng], { title: o.name, zIndexOffset: 500 }).bindPopup(() => fleetPopup(o.id)).addTo(fleetLayer); fleetMk.set(o.id, m); }
    else m.setLatLng([o.lat, o.lng]);
    m.setIcon(fleetIcon(o));
    if (m.isPopupOpen()) m.setPopupContent(fleetPopup(o.id));
  });
}
let fleetKey = '';
function renderFleetBox() {
  const el = $('fleetBox'); if (!el) return;
  if (!FL || !FL.available) { el.innerHTML = '<p class="note">Funzione non ancora attiva in questa versione dell\'app.</p>'; fleetKey = ''; return; }
  const key = [FL.user && FL.user.uid, FL.sharing, FL.loading, FL.error, !!S.pos].join('|');
  if (key !== fleetKey) {
    fleetKey = key;
    if (!FL.user) {
      el.innerHTML = `<button data-act="fleetLogin"${FL.loading ? ' disabled' : ''}>${FL.loading ? 'Collegamento…' : 'Accedi con Google'}</button>` +
        (FL.error ? `<p class="note warn">${esc(FL.error)}</p>` : '');
      return;
    }
    el.innerHTML = `<p class="note">Collegato come <b>${esc(FL.user.name || FL.user.email)}</b> · <a href="#" data-act="fleetLogout">Esci</a></p>` +
      `<label class="chk"><input type="checkbox" id="lFleetShare"${FL.sharing ? ' checked' : ''}> Condividi la mia posizione con le altre barche</label>` +
      `<form class="search" onsubmit="return false"><input id="fleetNameIn" maxlength="30" placeholder="Nome da mostrare (es. nome della barca)" autocomplete="off"><button type="button" data-act="fleetName">Salva</button></form>` +
      (FL.error ? `<p class="note warn">${esc(FL.error)}</p>` : '') +
      (FL.sharing && !S.pos ? '<p class="note">La tua posizione partirà appena il GPS la trova.</p>' : '') +
      '<div id="fleetList"></div>';
    $('fleetNameIn').value = S.set.fleetName || '';
    $('lFleetShare').onchange = () => { S.set.fleetShare = $('lFleetShare').checked; saveSet(); FL.share(S.set.fleetShare); toast(S.set.fleetShare ? 'Posizione condivisa' : 'Condivisione spenta'); };
  }
  const lst = $('fleetList'); if (!lst) return;
  const ref = S.pos || map.getCenter();
  const list = FL.list().map(o => ({ o, d: dist(ref, o) })).sort((a, b) => a.d - b.d);
  lst.innerHTML = list.length
    ? `<p class="note">${list.length === 1 ? '1 barca collegata' : list.length + ' barche collegate'}${S.pos ? ', dalla più vicina' : ''}:</p>` +
      list.slice(0, 10).map(x => `<button data-act="fleetGo" data-id="${esc(x.o.id)}"><span><i class="flLeg"></i><b>${esc(x.o.name)}</b> · ${esc(ago(FL.age(x.o)))}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`).join('')
    : '<p class="note">Nessun\'altra barca collegata in questo momento.</p>';
}
let fleetT = null, fleetWasIn = false;
if (FL) FL.on(() => {
  const inNow = !!FL.user;
  if (inNow !== fleetWasIn) {
    fleetWasIn = inNow;
    if (S.set.fleetIn !== inNow) { S.set.fleetIn = inNow; saveSet(); }
    if (inNow) { if (S.pos && !S.sim) FL.update(fleetPos()); FL.share(S.set.fleetShare); }
  }
  clearTimeout(fleetT);
  fleetT = setTimeout(() => { renderFleetMarkers(); renderFleetBox(); }, 250);
});

/* ---------- Punto sulla carta (ricerca, coordinate, tocco lungo) ---------- */
function showPoint(p, label) {
  ptLayer.clearLayers();
  const ll = [p.lat, p.lng];
  L.marker(ll, { zIndexOffset: 900, icon: L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30],
    html: '<svg viewBox="0 0 26 34" width="26" height="34"><path d="M13 1C6.4 1 1 6.2 1 12.6 1 21.8 13 33 13 33s12-11.2 12-20.4C25 6.2 19.6 1 13 1z" fill="#ff3d71" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.5" r="4.3" fill="#fff"/></svg>' }) })
    .bindPopup(() => ptPopup(p, label)).addTo(ptLayer).openPopup();
  minSheet(true);
  map.setView(ll, Math.max(map.getZoom(), 13));
  S.set.follow = false; saveSet(); fabs();
}
function ptPopup(p, label) {
  const dd = S.pos ? `<br>Da te: ${fmtDist(dist(S.pos, p))}, ${fmtAng(brg(S.pos, p))}` : '';
  const a = `data-lat="${p.lat}" data-lng="${p.lng}"`;
  return `<div class="wkPop"><b>${esc(label || 'Punto')}</b><br>${fmtDMS(p)}<br><span class="mut">${fmtPos(p)}<br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>${dd}` +
    `<div class="pbtn"><button data-act="ptUse" data-k="start" ${a}>Partenza</button><button data-act="ptUse" data-k="via" ${a}>Tappa</button><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button></div>` +
    `<div class="pbtn"><button data-act="ptSave" ${a} data-n="${esc(label && label !== 'Coordinate cercate' ? label.slice(0, 60) : '')}">Salva punto</button><button data-act="ptMeteo" ${a}>Meteo qui</button><button data-act="ptClose">Togli</button></div></div>`;
}

/* ---------- Punti di interesse: i miei punti (pesca, fonda...), punti di fonda, aree marine protette ---------- */
const POI_CAT = {
  pesca: { l: 'Punto pesca', i: '🐟', c: '#0f9db0' }, fonda: { l: 'Punto di fonda', i: '⚓', c: '#2f6fd6' },
  immersione: { l: 'Immersione', i: '🤿', c: '#e8811a' }, bagno: { l: 'Sosta e bagno', i: '🏖️', c: '#c99a06' }, relitto: { l: 'Relitto', i: '🚢', c: '#5d4037' },
  altro: { l: 'Altro', i: '📍', c: '#8e44ad' }
};
const poiCat = c => POI_CAT[c] || POI_CAT.altro;
const livePois = () => S.pois.filter(p => !p.del);
const savePois = () => store.set('pois', S.pois);
const poiId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function pushPoi(o) { if (FL && FL.user) FL.putPoi(o).catch(() => {}); }
function addPoi(p, opt = {}) {
  const cat = POI_CAT[opt.cat] ? opt.cat : (($('poiCat') && $('poiCat').value) || 'pesca');
  const n = livePois().filter(x => x.cat === cat).length + 1, now = Date.now();
  const o = { id: poiId(), name: String(opt.name || poiCat(cat).l + ' ' + n).slice(0, 60), cat,
    lat: +(+p.lat).toFixed(6), lng: +(+p.lng).toFixed(6), note: String(opt.note || '').slice(0, 500), t: now, u: now };
  S.pois.push(o); savePois(); pushPoi(o);
  if (!S.set.pois) { S.set.pois = true; saveSet(); applyLayers(); if ($('lPois')) $('lPois').checked = true; }
  drawPois(); renderPunti();
  if (!opt.quiet) toast('Punto salvato: ' + o.name);
  if (cat === 'relitto' && !opt.quiet) setTimeout(() => wreckFromPoi(o.id, true), 200);
  return o;
}
function updPoi(id, ch) {
  const o = S.pois.find(x => x.id === id); if (!o) return;
  Object.assign(o, ch, { u: Date.now() });
  if (o.del) { o.name = ''; o.note = ''; }
  savePois(); pushPoi(o); drawPois(); renderPunti();
}
/* unione con i punti salvati sull'account: per ogni punto vince la modifica più recente (anche le eliminazioni) */
function mergePois(remote) {
  const byId = new Map(S.pois.map(p => [p.id, p]));
  let changed = false;
  Object.values(remote || {}).forEach(r => {
    if (!r || !r.id) return;
    const l = byId.get(r.id);
    if (!l || (r.u || 0) > (l.u || 0)) { byId.set(r.id, Object.assign({ name: '', note: '', cat: 'altro' }, r)); changed = true; }
  });
  byId.forEach(l => { const r = remote && remote[l.id]; if (!r || (l.u || 0) > (r.u || 0)) pushPoi(l); });
  if (changed) { S.pois = [...byId.values()]; savePois(); drawPois(); renderPunti(); }
}
if (FL && FL.onPois) FL.onPois(mergePois);
function drawPois() {
  poiLayer.clearLayers();
  livePois().forEach(o => {
    const c = poiCat(o.cat);
    L.marker([o.lat, o.lng], { title: o.name, zIndexOffset: 400, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="poi" style="background:${c.c}">${c.i}<span>${esc(o.name)}</span></div>` }) })
      .bindPopup(() => poiPopup(o.id), { minWidth: 220 }).addTo(poiLayer);
  });
}
function poiPopup(id) {
  const o = S.pois.find(x => x.id === id && !x.del); if (!o) return 'Punto eliminato';
  const c = poiCat(o.cat), a = `data-lat="${o.lat}" data-lng="${o.lng}"`;
  const dd = S.pos ? `<br>Da te: ${fmtDist(dist(S.pos, o))}, ${fmtAng(brg(S.pos, o))}` : '';
  return `<div class="wkPop"><b>${c.i} ${esc(o.name)}</b><br>${esc(c.l)}<br>${fmtDMS(o)}<br><span class="mut">${fmtPos(o)}</span>${dd}` +
    (o.note ? `<p class="pnote">${esc(o.note)}</p>` : '') +
    (o.cat === 'relitto' ? (wkSent()[o.id] ? '<p class="pnote">Segnalato alla community: compare a tutti dopo il controllo di un moderatore.</p>'
      : `<div class="pbtn"><button data-act="poiWk" data-id="${o.id}">Condividi il relitto con tutti</button></div>`) : '') +
    (SHARE_CAT.includes(o.cat) ? (wkSent()['p_' + o.id] ? '<p class="pnote">Condiviso con la community: compare a tutti dopo il controllo di un moderatore.</p>'
      : `<div class="pbtn"><button data-act="poiShare" data-id="${o.id}">Condividi con la community</button></div>`) : '') +
    `<div class="pbtn"><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button><button data-act="ptMeteo" ${a}>Meteo qui</button></div>` +
    `<details class="pedit"><summary>Modifica</summary>` +
    `<input id="pe-n" maxlength="60" value="${esc(o.name)}" aria-label="Nome">` +
    `<select id="pe-c" aria-label="Tipo">${Object.keys(POI_CAT).map(k => `<option value="${k}"${k === o.cat ? ' selected' : ''}>${POI_CAT[k].i} ${POI_CAT[k].l}</option>`).join('')}</select>` +
    `<textarea id="pe-t" maxlength="500" rows="3" placeholder="Note (esca, fondale, orari, profondità…)" aria-label="Note">${esc(o.note || '')}</textarea>` +
    `<div class="pbtn"><button data-act="poiSave" data-id="${o.id}">Salva</button><button data-act="poiDel" data-id="${o.id}" class="danger">Elimina</button></div></details></div>`;
}
function renderPunti() {
  if (S.tab !== 'punti') return;
  const ref = S.pos || map.getCenter(), from = S.pos ? 'dalla tua posizione' : 'dal centro della carta';
  const el = $('poiList');
  if (el) {
    const list = livePois().map(o => ({ o, d: dist(ref, o) })).sort((a, b) => a.d - b.d);
    el.innerHTML = list.length ? list.slice(0, 50).map(x => { const c = poiCat(x.o.cat);
      return `<button data-act="poiGo" data-id="${x.o.id}"><span><i class="poiDot" style="background:${c.c}">${c.i}</i><b>${esc(x.o.name)}</b></span><span>${(x.d / NM).toFixed(1)} mn</span></button>`; }).join('') +
      (list.length > 50 ? `<p class="note">e altri ${list.length - 50} punti più lontani</p>` : '')
      : '<p class="note">Nessun punto salvato. Aggiungilo con il GPS, toccando la carta, scrivendo le coordinate o tenendo premuto sulla carta.</p>';
  }
  const sy = $('poiSync');
  if (sy) sy.textContent = FL && FL.user ? `I tuoi punti sono privati e salvati anche sull'account ${FL.user.email || FL.user.name}: li ritrovi su ogni telefono dove fai l'accesso.`
    : 'I tuoi punti sono salvati solo su questo telefono. Con l\'accesso Google (Barche e impostazioni) restano privati e li ritrovi su tutti i tuoi telefoni.';
  renderFonde(ref, from);
  renderServizi(ref, from);
  renderComm(ref, from);
  renderPesca(ref, from);
  renderWrecks();
}

/* punti di fonda e aree marine protette (poi.json, da OpenStreetMap/OpenSeaMap) */
const FD_CAT = { pleasure: 'per diporto', small_craft: 'per piccole unità', small_craft_mooring: 'campo boe per piccole unità', unrestricted: 'libero',
  near_harbour: 'vicino al porto', time_limited: 'a tempo limitato', buoy: 'su boa', deep_water: 'per navi di grande pescaggio', tanker: 'per petroliere',
  explosives: 'per navi con esplosivi', quarantine: 'per la quarantena', 'sea-plane': 'per idrovolanti', waiting: 'di attesa per navi', cargo_transhipment: 'trasbordo merci' };
const fdShips = f => /^(deep_water|tanker|explosives|quarantine|sea-plane|waiting|cargo_transhipment)$/.test(f.cat || '');
const ZONE = {
  A: { c: '#e53935', t: 'Zona A – riserva integrale', r: 'Di norma vietati navigazione, sosta, ancoraggio, pesca e balneazione, salvo i mezzi autorizzati.' },
  B: { c: '#fb8c00', t: 'Zona B – riserva generale', r: 'Navigazione a velocità ridotta; ancoraggio e pesca vietati o limitati secondo il regolamento.' },
  C: { c: '#fdd835', t: 'Zona C – riserva parziale', r: 'Navigazione, balneazione e pesca sportiva consentite con le regole dell\'area (velocità, ancoraggio solo dove previsto).' },
  D: { c: '#43a047', t: 'Zona D – zona di protezione', r: 'Regole meno restrittive, valgono comunque i limiti dell\'area.' },
  P: { c: '#1e88e5', t: 'Area marina protetta', r: 'Le zone A, B, C non sono disegnate nei dati: controlla il regolamento prima di entrare.' }
};
function loadPoiData() {
  if (POIDATA || poiDataP) return poiDataP || Promise.resolve(POIDATA);
  poiDataP = getData('poi.json').then(d => {
    POIDATA = d || { fonde: [], amp: [], missing: true };
    (POIDATA.amp || []).forEach(f => { f.bb = bboxOf(f.geometry); f.z = f.properties.zone || 'P'; });
    drawFonde(); drawAmp(); renderPunti(); renderRoute();
    return POIDATA;
  }).catch(() => { poiDataP = null; });
  return poiDataP;
}
function bboxOf(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = c => { if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c.forEach(walk); };
  walk(g.coordinates); return b;
}
function drawFonde() {
  fondaLayer.clearLayers();
  ((POIDATA && POIDATA.fonde) || []).forEach((f, i) => {
    f.marker = L.marker([f.lat, f.lng], { title: f.name || 'Punto di fonda', icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      html: `<div class="fd${fdShips(f) ? ' ship' : ''}">⚓</div>` }) }).bindPopup(() => fondaPopup(i)).addTo(fondaLayer);
  });
}
function fondaPopup(i) {
  const f = POIDATA.fonde[i], a = `data-lat="${f.lat}" data-lng="${f.lng}"`;
  const rows = [f.kind === 'berth' ? 'Posto di ancoraggio' : 'Zona di ancoraggio', f.cat ? 'Ancoraggio ' + esc(FD_CAT[f.cat] || f.cat) : null,
    fdShips(f) ? '<span class="wr">Riservato alle navi: non adatto al diporto</span>' : null, f.depth ? 'Profondità: ' + esc(f.depth) + ' m' : null,
    f.note ? esc(f.note) : null, fmtDMS(f), S.pos ? `Da te: ${fmtDist(dist(S.pos, f))}, ${fmtAng(brg(S.pos, f))}` : null].filter(Boolean);
  return `<div class="wkPop"><b>⚓ ${esc(f.name || 'Punto di fonda')}</b><br>${rows.join('<br>')}` +
    `<div class="pbtn"><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button><button data-act="ptMeteo" ${a}>Meteo qui</button></div>` +
    `<div class="pbtn"><button data-act="ptSave" ${a} data-c="fonda" data-n="${esc((f.name || 'Fonda').slice(0, 60))}">Salva nei miei punti</button><button data-act="revOpen" data-k="fd_${esc(f.id)}" data-n="${esc((f.name || 'Punto di fonda').slice(0, 60))}">★ Recensioni</button></div></div>`;
}
function renderFonde(ref, from) {
  const el = $('fondaList'); if (!el) return;
  if (!S.set.fonde) { el.innerHTML = ''; return; }
  if (!POIDATA) { el.innerHTML = '<p class="note">Carico i punti di fonda…</p>'; loadPoiData(); return; }
  if (POIDATA.missing || !(POIDATA.fonde || []).length) { el.innerHTML = '<p class="note">Punti di fonda non ancora disponibili.</p>'; return; }
  const list = POIDATA.fonde.map((f, i) => ({ f, i, d: dist(ref, f) })).filter(x => x.d < 30 * NM && !fdShips(x.f)).sort((a, b) => a.d - b.d).slice(0, 8);
  el.innerHTML = list.length ? `<p class="note">Più vicini ${from}:</p>` + list.map(x =>
    `<button data-act="fondaGo" data-i="${x.i}"><span><i class="fd sm">⚓</i><b>${esc(x.f.name || 'Punto di fonda')}</b>${x.f.cat ? ' · ' + esc(FD_CAT[x.f.cat] || x.f.cat) : ''}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`).join('')
    : '<p class="note">Nessun punto di fonda per il diporto entro 30 miglia.</p>';
}
function drawAmp() {
  ampLayer.clearLayers();
  const order = { P: 0, D: 1, C: 2, B: 3, A: 4 };
  ((POIDATA && POIDATA.amp) || []).slice().sort((a, b) => order[a.z] - order[b.z]).forEach(f => {
    const z = ZONE[f.z];
    L.geoJSON(f, { style: { color: z.c, weight: f.z === 'P' ? 2 : 1.5, dashArray: f.z === 'P' ? '6 5' : null, fillColor: z.c, fillOpacity: f.z === 'P' ? 0.06 : 0.2 } })
      .bindPopup(() => ampPopup(f)).addTo(ampLayer);
  });
}
function ampPopup(f) {
  const p = f.properties, z = ZONE[f.z], web = safeUrl(p.web), wiki = wikiUrl(p.wiki);
  const links = [web && `<a href="${esc(web)}" target="_blank" rel="noopener">Sito</a>`, wiki && `<a href="${esc(wiki)}" target="_blank" rel="noopener">Wikipedia</a>`].filter(Boolean).join(' · ');
  return `<div class="wkPop"><b>${esc(p.name || 'Area marina protetta')}</b><br><span class="zt" style="border-color:${z.c}">${esc(z.t)}</span><br>${esc(z.r)}` +
    (p.title ? `<br><span class="mut">${esc(p.title)}</span>` : '') + (links ? '<br>' + links : '') +
    '<br><span class="mut">Fa fede il regolamento dell\'area marina protetta.</span></div>';
}
/* punto dentro un poligono GeoJSON (lng, lat) */
function inPoly(lng, lat, g) {
  const ring = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  const poly = p => ring(p[0]) && !p.slice(1).some(ring);
  return g.type === 'Polygon' ? poly(g.coordinates) : g.type === 'MultiPolygon' ? g.coordinates.some(poly) : false;
}
/* nomi delle aree marine protette la cui zona A è attraversata dalla rotta */
function ampOnRoute() {
  if (!POIDATA || !(POIDATA.amp || []).length || S.route.blocked) return [];
  const w = wps(); if (w.length < 2) return [];
  const za = POIDATA.amp.filter(f => f.z === 'A'), hit = new Set();
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1], b = w[i], n = Math.min(400, Math.ceil(dist(a, b) / 40));
    for (let k = 0; k <= n; k++) {
      const lat = a.lat + (b.lat - a.lat) * k / n, lng = a.lng + (b.lng - a.lng) * k / n;
      for (const f of za) if (lng >= f.bb[0] && lng <= f.bb[2] && lat >= f.bb[1] && lat <= f.bb[3] && inPoly(lng, lat, f.geometry)) hit.add(f.properties.name || 'senza nome');
    }
  }
  return [...hit];
}

/* ---------- Zone di pesca conosciute (pesca.json, raccolte a mano con la fonte) e relitti vicini ---------- */
const PZ = {
  vietata: { c: '#e53935', i: '⛔', t: 'Pesca vietata' },
  limiti: { c: '#fb8c00', i: '⚠️', t: 'Pesca con limiti' },
  consentita: { c: '#0f9db0', i: '🎣', t: 'Pesca consentita' }
};
const pzCenter = z => z.punto ? { lat: z.punto[0], lng: z.punto[1] } : { lat: z.poly.reduce((a, p) => a + p[0], 0) / z.poly.length, lng: z.poly.reduce((a, p) => a + p[1], 0) / z.poly.length };
function loadPesca() {
  if (PESCA || pescaP) return pescaP || Promise.resolve(PESCA);
  pescaP = getData('pesca.json').then(d => {
    PESCA = (d && d.zone) || [];
    PESCA.forEach(z => { z.c = pzCenter(z); });
    drawPesca(); renderPunti();
    return PESCA;
  }).catch(() => { pescaP = null; });
  return pescaP;
}
function drawPesca() {
  pescaLayer.clearLayers();
  const order = { limiti: 0, consentita: 1, vietata: 2 };
  (PESCA || []).slice().sort((a, b) => order[a.stato] - order[b.stato]).forEach(z => {
    const k = PZ[z.stato] || PZ.limiti;
    if (z.poly) L.polygon(z.poly, { color: k.c, weight: 2, dashArray: z.stato === 'consentita' ? null : '5 4', fillColor: k.c, fillOpacity: z.stato === 'limiti' ? 0.05 : 0.16 })
      .bindPopup(() => pescaPopup(z)).addTo(pescaLayer);
    z.marker = L.marker([z.c.lat, z.c.lng], { title: z.nome, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="pzI" style="border-color:${k.c}">${k.i}</div>` }) }).bindPopup(() => pescaPopup(z)).addTo(pescaLayer);
  });
}
function pescaPopup(z) {
  const k = PZ[z.stato] || PZ.limiti, a = `data-lat="${z.c.lat.toFixed(5)}" data-lng="${z.c.lng.toFixed(5)}"`, url = safeUrl(z.url);
  return `<div class="wkPop"><b>${k.i} ${esc(z.nome)}</b><br><span class="zt" style="border-color:${k.c}">${k.t}</span><br><span class="mut">${esc(z.tipo || '')}</span><br>${esc(z.regole)}` +
    `<br>${fmtDMS(z.c)}${S.pos ? `<br>Da te: ${fmtDist(dist(S.pos, z.c))}, ${fmtAng(brg(S.pos, z.c))}` : ''}` +
    `<br><span class="mut">Fonte: ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(z.fonte)}</a>` : esc(z.fonte)}. Fanno fede le ordinanze della Capitaneria e le norme in vigore.</span>` +
    `<div class="pbtn"><button data-act="ptUse" data-k="dest" ${a}>Destinazione</button><button data-act="ptMeteo" ${a}>Meteo qui</button></div>` +
    `<div class="pbtn">${z.stato !== 'vietata' ? `<button data-act="ptSave" ${a} data-c="pesca" data-n="${esc(z.nome.slice(0, 60))}">Salva nei miei punti</button>` : ''}<button data-act="revOpen" data-k="pz_${esc(z.id)}" data-n="${esc(z.nome.slice(0, 60))}">★ Recensioni</button></div></div>`;
}
function renderPesca(ref, from) {
  const el = $('pescaList'); if (!el) return;
  if (!S.set.pesca) { el.innerHTML = ''; return; }
  if (!PESCA) { el.innerHTML = '<p class="note">Carico le zone di pesca…</p>'; loadPesca(); return; }
  if (!WRECKS) loadWrecks();
  const zs = PESCA.map((z, i) => ({ z, i, d: dist(ref, z.c) })).filter(x => x.d < 40 * NM).sort((a, b) => a.d - b.d).slice(0, 8);
  const wk = (WRECKS || []).map((w, i) => ({ w, i, d: dist(ref, w) })).filter(x => x.d < 20 * NM).sort((a, b) => a.d - b.d).slice(0, 6);
  el.innerHTML = (zs.length ? `<p class="note">Zone conosciute ${from}:</p>` + zs.map(x => { const k = PZ[x.z.stato] || PZ.limiti;
    return `<button data-act="pescaGo" data-i="${x.i}"><span><i class="pzI sm" style="border-color:${k.c}">${k.i}</i><b>${esc(x.z.nome)}</b> · ${k.t.toLowerCase()}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`; }).join('')
    : '<p class="note">Nessuna zona di pesca conosciuta entro 40 miglia: per ora l\'elenco copre l\'Alto Adriatico.</p>') +
    (wk.length ? `<p class="note">Relitti vicini, spesso molto pescosi:</p>` + wk.map(x =>
      `<button data-act="pescaWreck" data-i="${x.i}"><span><i class="wk${x.w.dive ? ' dive' : ''}" style="display:inline-block;vertical-align:middle;margin-right:6px"></i><b>${esc(wkName(x.w))}</b>${wkDepth(x.w) ? ' · ' + esc(wkDepth(x.w)) : ''}</span><span>${(x.d / NM).toFixed(1)} mn</span></button>`).join('') : '');
}

/* esportazione e importazione dei miei punti (GPX, waypoint) */
function poiGpx() {
  const x = s => esc(s);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rotta Nautica" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    livePois().map(o => `<wpt lat="${o.lat}" lon="${o.lng}"><name>${x(o.name)}</name>${o.note ? `<desc>${x(o.note)}</desc>` : ''}<type>${x(o.cat)}</type></wpt>`).join('\n') + '\n</gpx>';
}
$('poiFileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const doc = new DOMParser().parseFromString(await f.text(), 'text/xml');
    const tx = (n, t) => { const el = n.getElementsByTagName(t)[0]; return el ? el.textContent.trim() : ''; };
    const pts = [...doc.getElementsByTagName('wpt')].map(n => ({ lat: +n.getAttribute('lat'), lng: +n.getAttribute('lon'), name: tx(n, 'name'), note: tx(n, 'desc') || tx(n, 'cmt'), cat: tx(n, 'type') }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!pts.length) { toast('Il file non contiene punti (waypoint)'); return; }
    const have = new Set(livePois().map(o => o.lat.toFixed(5) + ',' + o.lng.toFixed(5)));
    let n = 0;
    pts.forEach(p => { if (have.has(p.lat.toFixed(5) + ',' + p.lng.toFixed(5))) return; addPoi(p, { name: p.name, note: p.note, cat: POI_CAT[p.cat] ? p.cat : undefined, quiet: true }); n++; });
    toast(n ? `${n} punti importati` : 'Punti già presenti');
  } catch (err) { toast('Impossibile leggere il file GPX'); }
  e.target.value = '';
});
$('fPoiCoord').addEventListener('submit', e => {
  e.preventDefault();
  const c = parseCoords($('poiQ').value);
  if (!c) { toast('Coordinate non riconosciute. Esempio: 45°34\'22.7"N 13°15\'47.1"E'); return; }
  const o = addPoi(c); $('poiQ').value = '';
  minSheet(true); map.setView([o.lat, o.lng], Math.max(map.getZoom(), 13));
});

/* ---------- Meteo (Open-Meteo: previsioni e mare) ---------- */
const WX = { p: null, label: '', data: null, t: 0, busy: false };
const WMO = { 0: 'Sereno', 1: 'Poco nuvoloso', 2: 'Parzialmente nuvoloso', 3: 'Coperto', 45: 'Nebbia', 48: 'Nebbia con brina', 51: 'Pioviggine debole', 53: 'Pioviggine',
  55: 'Pioviggine forte', 56: 'Pioviggine gelata', 57: 'Pioviggine gelata', 61: 'Pioggia debole', 63: 'Pioggia', 65: 'Pioggia forte', 66: 'Pioggia gelata', 67: 'Pioggia gelata',
  71: 'Neve debole', 73: 'Neve', 75: 'Neve forte', 77: 'Neve granulosa', 80: 'Rovesci deboli', 81: 'Rovesci', 82: 'Rovesci violenti', 85: 'Rovesci di neve', 86: 'Rovesci di neve',
  95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale con grandine' };
const WMO_I = c => c == null ? '' : c === 0 ? '☀️' : c <= 2 ? '⛅' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';
const DIR16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const VENTI = ['Tramontana', 'Grecale', 'Levante', 'Scirocco', 'Ostro', 'Libeccio', 'Ponente', 'Maestrale'];
const dir16 = d => Number.isFinite(d) ? DIR16[Math.round(((d % 360) + 360) % 360 / 22.5) % 16] : '';
const vento = d => Number.isFinite(d) ? VENTI[Math.round(((d % 360) + 360) % 360 / 45) % 8] : '';
const beaufort = kn => [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].filter(t => kn >= t).length;
const BF = ['calma', 'bava di vento', 'brezza leggera', 'brezza tesa', 'vento moderato', 'vento teso', 'vento fresco', 'vento forte', 'burrasca', 'burrasca forte', 'tempesta', 'fortunale', 'uragano'];
const douglas = h => [0.1, 0.5, 1.25, 2.5, 4, 6, 9, 14].filter(t => h > t).length + (h > 0 ? 1 : 0);
const DG = ['calmo', 'quasi calmo', 'poco mosso', 'mosso', 'molto mosso', 'agitato', 'molto agitato', 'grosso', 'molto grosso', 'tempestoso'];
const at = (a, i) => (a && a[i] != null ? a[i] : null);
const rnd = v => (v == null || !Number.isFinite(v) ? '--' : Math.round(v));
const arrow = d => Number.isFinite(d) ? `<i class="wa" style="transform:rotate(${(d + 180) % 360}deg)">↑</i>` : '';
function openMeteo() {
  if (!WX.data || Date.now() - WX.t > 30 * 60e3) loadMeteo(S.pos ? { lat: S.pos.lat, lng: S.pos.lng } : map.getCenter(), S.pos ? 'La tua posizione' : 'Centro della carta');
  else renderMeteo();
}
async function loadMeteo(p, label) {
  WX.p = { lat: +p.lat, lng: +p.lng }; WX.label = label; WX.busy = true; renderMeteo();
  if (!navigator.onLine) { WX.busy = false; WX.err = 'Il meteo richiede la connessione a internet'; renderMeteo(); return; }
  const q = `latitude=${WX.p.lat.toFixed(3)}&longitude=${WX.p.lng.toFixed(3)}&timezone=auto&forecast_days=4`;
  const [a, b] = await Promise.allSettled([
    fetch(`https://api.open-meteo.com/v1/forecast?${q}&wind_speed_unit=kn&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl` +
      '&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset').then(r => r.ok ? r.json() : Promise.reject()),
    fetch(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,wave_direction,wave_period,sea_surface_temperature` +
      '&hourly=wave_height,wave_direction,wave_period&daily=wave_height_max,wave_direction_dominant').then(r => r.ok ? r.json() : Promise.reject())
  ]);
  WX.busy = false;
  if (a.status !== 'fulfilled') { WX.err = 'Previsioni non disponibili in questo momento'; WX.data = null; renderMeteo(); return; }
  WX.err = null; WX.t = Date.now();
  WX.data = { f: a.value, m: b.status === 'fulfilled' ? b.value : null };
  renderMeteo();
}
function renderMeteo() {
  const el = $('wxBox'); if (!el) return;
  const where = WX.p ? `<p class="note"><b>${esc(WX.label)}</b> · ${fmtDMS(WX.p)}</p>` : '';
  if (WX.busy) { el.innerHTML = where + '<p class="note">Carico le previsioni…</p>'; return; }
  if (!WX.data) { el.innerHTML = where + `<p class="note${WX.err ? ' warn' : ''}">${esc(WX.err || 'Scegli dove vedere il meteo.')}</p>`; return; }
  const f = WX.data.f, m = WX.data.m, c = f.current || {}, mc = (m && m.current) || {};
  const ws = c.wind_speed_10m, wg = c.wind_gusts_10m, wd = c.wind_direction_10m, wh = mc.wave_height;
  const warn = [];
  if (wg >= 25) warn.push(`raffiche fino a ${Math.round(wg)} nodi`);
  if (wh >= 1.5) warn.push(`onda di ${wh.toFixed(1)} m`);
  const g = (l, v, sub, w) => `<div class="g${w ? ' w' : ''}"><span class="lbl">${l}</span><b>${v}</b>${sub ? `<span class="note">${sub}</span>` : ''}</div>`;
  let h = where + (warn.length ? `<p class="note warn">Attenzione: ${warn.join(' e ')}. Valuta se uscire con una piccola barca.</p>` : '') +
    '<div class="grid">' +
    g('Vento', Number.isFinite(ws) ? `${arrow(wd)} ${Math.round(ws)} kn` : '--', Number.isFinite(ws) ? `${dir16(wd)} · ${vento(wd)} · forza ${beaufort(ws)} (${BF[beaufort(ws)]})` : '') +
    g('Raffiche', Number.isFinite(wg) ? `${Math.round(wg)} kn` : '--') +
    g('Onda', Number.isFinite(wh) ? `${wh.toFixed(1)} m` : '--', Number.isFinite(wh) ? `${DG[Math.min(9, douglas(wh))]}${Number.isFinite(mc.wave_period) ? ' · periodo ' + Math.round(mc.wave_period) + ' s' : ''}${Number.isFinite(mc.wave_direction) ? ' · da ' + dir16(mc.wave_direction) : ''}` : (m ? '' : 'dati del mare non disponibili')) +
    g('Cielo', `${WMO_I(c.weather_code)} ${Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) + '°' : ''}`, WMO[c.weather_code] || '') +
    g('Mare', Number.isFinite(mc.sea_surface_temperature) ? `${mc.sea_surface_temperature.toFixed(0)}°` : '--', 'temperatura dell\'acqua') +
    g('Pressione', Number.isFinite(c.pressure_msl) ? `${Math.round(c.pressure_msl)}` : '--', 'hPa') + '</div>';
  /* prossime 24 ore, ogni 3 ore */
  const H = f.hourly || {}, MH = (m && m.hourly) || {}, now = Date.now();
  const rows = [];
  (H.time || []).forEach((t, i) => {
    const ms = new Date(t).getTime();
    if (ms < now - 3600e3 || ms > now + 27 * 3600e3 || new Date(t).getHours() % 3) return;
    const j = (MH.time || []).indexOf(t), wv = j >= 0 ? at(MH.wave_height, j) : null, gu = at(H.wind_gusts_10m, i), wd = at(H.wind_direction_10m, i), pp = at(H.precipitation_probability, i);
    rows.push(`<tr><td>${t.slice(11, 16)}</td><td>${WMO_I(at(H.weather_code, i))} ${rnd(at(H.temperature_2m, i))}°</td>` +
      `<td${gu >= 25 ? ' class="wr"' : ''}>${arrow(wd)} ${rnd(at(H.wind_speed_10m, i))} <span class="mut">(${rnd(gu)})</span> ${dir16(wd)}</td>` +
      `<td${wv >= 1.5 ? ' class="wr"' : ''}>${wv != null ? wv.toFixed(1) + ' m' : '--'}</td><td>${pp != null ? pp + '%' : ''}</td></tr>`);
  });
  if (rows.length) h += '<h4>Prossime 24 ore</h4><table class="wxt"><tr><th>Ora</th><th>Cielo</th><th>Vento kn (raffiche)</th><th>Onda</th><th>Pioggia</th></tr>' + rows.join('') + '</table>';
  const D = f.daily || {}, MD = (m && m.daily) || {};
  if ((D.time || []).length) {
    h += '<h4>Prossimi giorni</h4><table class="wxt"><tr><th>Giorno</th><th>Cielo</th><th>Vento kn (raffiche)</th><th>Onda max</th></tr>' + D.time.map((t, i) => {
      const day = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : new Date(t + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
      const wv = at(MD.wave_height_max, i), gu = at(D.wind_gusts_10m_max, i), wd = at(D.wind_direction_10m_dominant, i);
      return `<tr><td>${esc(day)}</td><td>${WMO_I(at(D.weather_code, i))} ${rnd(at(D.temperature_2m_min, i))}–${rnd(at(D.temperature_2m_max, i))}°</td>` +
        `<td${gu >= 25 ? ' class="wr"' : ''}>${arrow(wd)} ${rnd(at(D.wind_speed_10m_max, i))} <span class="mut">(${rnd(gu)})</span> ${dir16(wd)}</td>` +
        `<td${wv >= 1.5 ? ' class="wr"' : ''}>${wv != null ? wv.toFixed(1) + ' m' : '--'}</td></tr>`;
    }).join('') + '</table>';
    if (D.sunrise && D.sunset && D.sunrise[0] && D.sunset[0]) h += `<p class="note">Oggi il sole sorge alle ${D.sunrise[0].slice(11, 16)} e tramonta alle ${D.sunset[0].slice(11, 16)}.</p>`;
  }
  h += `<p class="note">Aggiornato alle ${new Date(WX.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Le frecce indicano dove soffia il vento.</p>`;
  el.innerHTML = h;
}

/* ---------- Menu principale ---------- */
function openHome() { closeSheet(); map.closePopup(); $('home').hidden = false; if (window.RNCheck) window.RNCheck.badge(); modHome(); }
document.querySelectorAll('[data-home]').forEach(b => {
  b.onclick = () => {
    const k = b.dataset.home; $('home').hidden = true;
    if (k === 'nav') { if (!wps().length) openSheet('rotta'); else closeSheet(); }
    else openSheet(k);
  };
});
$('bHome').onclick = openHome;

/* ---------- Azioni (pulsanti) ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, i = +d.i;
  switch (d.act) {
    case 'startGps':
      if (!S.pos) { toast('In attesa della posizione GPS'); break; }
      place('start', S.pos); toast('Partenza: posizione attuale'); break;
    case 'pickStart': pick('start'); break;
    case 'wreckDest': place('dest', { lat: +d.lat, lng: +d.lng }); map.closePopup(); toast('Destinazione: relitto'); break;
    case 'ptUse': { const p = { lat: +d.lat, lng: +d.lng }; map.closePopup(); place(d.k, p); ptLayer.clearLayers();
      toast({ start: 'Partenza impostata', via: 'Tappa aggiunta', dest: 'Destinazione impostata' }[d.k]); openSheet('rotta'); break; }
    case 'ptSave': { map.closePopup(); ptLayer.clearLayers(); addPoi({ lat: +d.lat, lng: +d.lng }, { name: d.n || '', cat: d.c }); openSheet('punti'); break; }
    case 'ptMeteo': map.closePopup(); openSheet('meteo'); loadMeteo({ lat: +d.lat, lng: +d.lng }, 'Punto scelto'); break;
    case 'ptClose': map.closePopup(); ptLayer.clearLayers(); break;
    case 'poiGps': if (!S.pos) { toast('In attesa della posizione GPS'); break; } addPoi(S.pos); break;
    case 'poiPick': pick('poi'); break;
    case 'poiGo': { const o = S.pois.find(x => x.id === d.id); if (!o) break; if (!S.set.pois) { S.set.pois = true; saveSet(); applyLayers(); if ($('lPois')) $('lPois').checked = true; }
      minSheet(true); map.setView([o.lat, o.lng], Math.max(map.getZoom(), 14));
      poiLayer.eachLayer(m => { if (m.options.title === o.name && m.getLatLng().lat === o.lat) m.openPopup(); }); break; }
    case 'poiSave': {
      const n = ($('pe-n').value || '').trim().slice(0, 60), c = $('pe-c').value, t = ($('pe-t').value || '').trim().slice(0, 500);
      const wasWk = (S.pois.find(x => x.id === d.id) || {}).cat === 'relitto';
      updPoi(d.id, { name: n || poiCat(c).l, cat: POI_CAT[c] ? c : 'altro', note: t }); map.closePopup(); toast('Punto aggiornato');
      if (c === 'relitto' && !wasWk && !wkSent()[d.id]) setTimeout(() => wreckFromPoi(d.id, true), 200);
      break; }
    case 'poiWk': wreckFromPoi(d.id, false); break;
    case 'poiShare': openPointShare(d.id); break;
    case 'shSend': {
      const o = S.pois.find(x => x.id === d.id); if (!o) break;
      const n = ($('shN').value || '').trim(), note = ($('shT').value || '').trim();
      if (!n) { toast('Scrivi un nome per il punto'); $('shN').focus(); break; }
      RNCom.submitPoint({ cat: o.cat, n, note, lat: o.lat, lng: o.lng, anon: !$('shA').checked })
        .then(k => { wkSentSet('p_' + o.id, k); toast('Inviato ai moderatori: lo vedranno tutti dopo il controllo'); openSheet('punti'); })
        .catch(err => toast('Non inviato: ' + (err.message || err)));
      break;
    }
    case 'cpGo': {
      const v = (RNCom.points() || {})[d.k]; if (!v) break;
      if (!S.set.comm) { S.set.comm = true; saveSet(); applyLayers(); if ($('lComm')) $('lComm').checked = true; }
      minSheet(true); map.setView([v.lat, v.lng], Math.max(map.getZoom(), 14), { animate: false }); drawComm();
      const m = cpMk.get(d.k); if (m) m.openPopup();
      break;
    }
    case 'modPpOk': RNCom.approvePoint(d.u, d.k).then(() => { toast('Punto approvato: ora lo vedono tutti'); renderModBox(); }).catch(err => toast('Non approvato: ' + (err.message || err))); break;
    case 'modPpNo': RNCom.rejectPoint(d.u, d.k).then(() => { toast('Punto rifiutato'); renderModBox(); }).catch(err => toast('Errore: ' + (err.message || err))); break;
    case 'poiDel':
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tocca di nuovo per eliminare'; break; }
      updPoi(d.id, { del: true }); map.closePopup(); toast('Punto eliminato'); break;
    case 'poiGpxOut': if (livePois().length) download('miei-punti.gpx', poiGpx()); else toast('Nessun punto da esportare'); break;
    case 'poiGpxIn': $('poiFileIn').click(); break;
    case 'fondaGo': { const f = POIDATA && POIDATA.fonde[i]; if (!f || !f.marker) break; minSheet(true); map.setView([f.lat, f.lng], Math.max(map.getZoom(), 14)); f.marker.openPopup(); break; }
    case 'wxGps': if (!S.pos) { toast('In attesa della posizione GPS'); break; } loadMeteo(S.pos, 'La tua posizione'); break;
    case 'wxCenter': loadMeteo(map.getCenter(), 'Centro della carta'); break;
    case 'wxRefresh': if (WX.p) loadMeteo(WX.p, WX.label); else openMeteo(); break;
    case 'fleetDest': place('dest', { lat: +d.lat, lng: +d.lng }); map.closePopup(); toast('Destinazione: barca (posizione attuale)'); break;
    case 'fleetGo': { const m = fleetMk.get(d.id); if (!m) break; minSheet(true); map.setView(m.getLatLng(), Math.max(map.getZoom(), 14)); m.openPopup(); break; }
    case 'fleetLogin':
      if (!navigator.onLine) { toast('Serve la connessione a internet'); break; }
      S.set.fleetShare = true; saveSet();
      FL.login().then(() => toast('Accesso fatto: la tua posizione è visibile alle altre barche')).catch(err => { toast(err && err.message ? err.message : 'Accesso non riuscito'); renderFleetBox(); });
      break;
    case 'fleetLogout': e.preventDefault(); FL.logout().then(() => toast('Sei uscito: la tua posizione non è più condivisa')); break;
    case 'fleetName': {
      const v = $('fleetNameIn').value.trim().slice(0, 30);
      S.set.fleetName = v; saveSet(); toast(v ? 'Nome salvato: ' + v : 'Nome predefinito'); if (S.pos && !S.sim) { FL.update(fleetPos()); FL.rename(); }
      break;
    }
    case 'ckBoatSync': if (window.RNCheck) window.RNCheck.syncBoat(); break;
    case 'wreckInfo': openWreck(d.id); break;
    case 'wkNew': { const c = S.pos || map.getCenter(); openWreckForm({ tipo: 'nuovo', id: null, lat: c.lat, lng: c.lng, n: '', prof: null, note: '' }); break; }
    case 'wkFix': { const w = (WRECKS || []).find(x => x.id === d.id); if (w) openWreckForm({ tipo: 'posizione', id: w.id, lat: w.lat, lng: w.lng }); break; }
    case 'wkGps': if (!S.pos) { toast('GPS non attivo: accendilo o scegli il punto sulla carta'); break; } wkFormRead(); WKF.lat = S.pos.lat; WKF.lng = S.pos.lng; openWreckForm({ keep: true }); break;
    case 'wkPick': wkPickStart(); break;
    case 'wkPickOk': wkPickEnd(true); break;
    case 'wkPickNo': wkPickEnd(false); break;
    case 'wkSend': {
      wkFormRead();
      if (!parseCoords($('wkfP').value)) { toast('Scrivi una posizione valida o sceglila sulla carta'); break; }
      if (WKF.prof != null && !(WKF.prof >= 0 && WKF.prof <= 1000)) { toast('Profondità non valida'); break; }
      if (WKF.poi) {
        /* aggiorna il mio punto; poi, se richiesto, invia alla community */
        const nm = (WKF.n || '').trim(), pid = WKF.poi;
        const note = [WKF.note && WKF.note.trim(), WKF.prof != null ? `Fondo ${WKF.prof} m` : ''].filter(Boolean).join(' · ').slice(0, 500);
        updPoi(pid, { name: nm || 'Relitto', lat: +(+WKF.lat).toFixed(6), lng: +(+WKF.lng).toFixed(6), note });
        if (!WKF.share || !RNCom.me()) { toast('Relitto salvato nei tuoi punti'); WKF = null; openSheet('punti'); break; }
        if (!nm && !b.dataset.noname) { b.dataset.noname = '1'; toast('Senza nome? Se lo conosci scrivilo; altrimenti tocca di nuovo Salva'); $('wkfN').focus(); break; }
        RNCom.submitWreck(WKF).then(k => { wkSentSet(pid, k); toast('Salvato e inviato ai moderatori: lo vedranno tutti dopo il controllo'); WKF = null; openSheet('punti'); })
          .catch(err => toast('Salvato nei tuoi punti, ma non inviato: ' + (err.message || err)));
        break;
      }
      RNCom.submitWreck(WKF).then(() => { toast('Segnalazione inviata: la vedranno tutti dopo il controllo di un moderatore'); const id = WKF.id; WKF = null; if (id) openWreck(id); else openSheet('punti'); })
        .catch(err => toast('Segnalazione non inviata: ' + (err.message || err)));
      break;
    }
    case 'modWkOk': RNCom.approveWreck(d.u, d.k).then(() => { toast('Segnalazione approvata: ora la vedono tutti'); renderModBox(); }).catch(err => toast('Non approvata: ' + (err.message || err))); break;
    case 'modWkNo': RNCom.rejectWreck(d.u, d.k).then(() => { toast('Segnalazione rifiutata'); renderModBox(); }).catch(err => toast('Errore: ' + (err.message || err))); break;
    case 'modDelName': case 'modDelWk': case 'modDelPos': case 'modDelCp': {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.dataset.txt = b.textContent; b.textContent = 'Tocca di nuovo per confermare'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = b.dataset.txt; } }, 4000); break; }
      const a = d.act, fn = a === 'modDelName' ? RNCom.removeApproved : a === 'modDelWk' ? RNCom.removeCommunityWreck : a === 'modDelCp' ? RNCom.removeCommunityPoint : RNCom.removeCommunityPos;
      fn(d.k).then(() => { map.closePopup(); toast(a === 'modDelName' ? 'Nome tolto' : a === 'modDelWk' ? 'Relitto eliminato' : a === 'modDelCp' ? 'Punto eliminato' : 'Posizione originale ripristinata'); mergeCw(); if (S.tab === 'mod') renderModBox(); else if (S.tab === 'relitto') openSheet('punti'); })
        .catch(err => toast('Non riuscito: ' + (err.message || err)));
      break;
    }
    case 'modWkShow': {
      const ll = [+d.lat, +d.lng]; minSheet(true); map.setView(ll, 15);
      const m = L.circleMarker(ll, { radius: 14, color: '#e65100', weight: 3, fillOpacity: 0.15 }).addTo(map).bindTooltip('Posizione segnalata', { permanent: true, direction: 'top' });
      setTimeout(() => map.removeLayer(m), 20000);
      break;
    }
    case 'goAccount': e && e.preventDefault && e.preventDefault(); openSheet('imp'); break;
    case 'wkNameSave': {
      const w = (WRECKS || []).find(x => x.id === d.id); if (!w) break;
      RNCom.setName(w, $('wkNameIn').value, $('wkNameShare').checked)
        .then(r => { toast(r === 'proposto' ? 'Nome salvato e proposto alla community: lo vedranno tutti dopo l\'approvazione' : r === 'tolto' ? 'Nome tolto' : 'Nome salvato, solo per te'); setTimeout(() => openWreck(w.id), 400); })
        .catch(err => toast('Nome non salvato: ' + (err.message || err)));
      break;
    }
    case 'revOpen': openReviews(d.k, d.n, d.back); break;
    case 'revStar': if (REV) { REV.s = +d.s; document.querySelectorAll('.starIn button').forEach(x => x.classList.toggle('on', +x.dataset.s <= REV.s)); } break;
    case 'revSave': if (!REV) break;
      if (!REV.s) { toast('Scegli da 1 a 5 stelle'); break; }
      RNCom.review(REV.k, REV.s, $('revTxt').value).then(() => { toast('Recensione pubblicata'); openReviews(REV.k, REV.title, REV.back); }).catch(err => toast('Recensione non pubblicata: ' + (err.message || err)));
      break;
    case 'revDel': if (REV && RNCom.me()) RNCom.delReview(REV.k, RNCom.me().uid).then(() => { toast('Recensione cancellata'); openReviews(REV.k, REV.title, REV.back); }).catch(() => toast('Non cancellata')); break;
    case 'revModDel': if (REV) RNCom.delReview(REV.k, d.u).then(() => { toast('Recensione cancellata'); openReviews(REV.k, REV.title, REV.back); }).catch(() => toast('Non cancellata')); break;
    case 'revBack': if (REV && REV.back) openWreck(REV.back); else openSheet('punti'); break;
    case 'modOk': RNCom.approve(d.k, d.u).then(() => { toast('Nome approvato: ora lo vedono tutti'); renderModBox(); }).catch(err => toast('Non approvato: ' + (err.message || err))); break;
    case 'modNo': RNCom.reject(d.k, d.u).then(() => { toast('Proposta rifiutata'); renderModBox(); }).catch(err => toast('Errore: ' + (err.message || err))); break;
    case 'copyUid': (navigator.clipboard ? navigator.clipboard.writeText(d.u) : Promise.reject()).then(() => toast('Codice copiato')).catch(() => toast(d.u)); break;
    case 'srvGo': {
      const o = SRV && (d.k === 'm' ? SRV.marine : SRV.carburante)[i]; if (!o) break;
      if (!S.set.servizi) { S.set.servizi = true; saveSet(); applyLayers(); }
      minSheet(true); map.setView([o.lat, o.lng], Math.max(map.getZoom(), 14), { animate: false }); drawServizi();
      const m = srvMk.get(d.k + o.id); if (m) m.openPopup();
      break;
    }
    case 'wreckBack': openSheet('punti'); break;
    case 'wreckShow': { const w = (WRECKS || []).find(x => x.id === d.id); if (!w) break; if (!S.set.wrecks) { S.set.wrecks = true; saveSet(); applyLayers(); if ($('lWrecks')) $('lWrecks').checked = true; } minSheet(true); map.setView([w.lat, w.lng], Math.max(map.getZoom(), 14)); w.marker.openPopup(); break; }
    case 'pescaGo': { const z = PESCA && PESCA[i]; if (!z || !z.marker) break; minSheet(true); map.setView([z.c.lat, z.c.lng], Math.max(map.getZoom(), z.poly ? 13 : 12)); z.marker.openPopup(); break; }
    case 'pescaWreck': { const w = WRECKS && WRECKS[i]; if (!w) break; if (!S.set.wrecks) { S.set.wrecks = true; saveSet(); applyLayers(); if ($('lWrecks')) $('lWrecks').checked = true; } minSheet(true); map.setView([w.lat, w.lng], Math.max(map.getZoom(), 14)); w.marker.openPopup(); break; }
    case 'wreckGo': { const w = WRECKS && WRECKS[i]; if (!w) break; minSheet(true); map.setView([w.lat, w.lng], Math.max(map.getZoom(), 14)); w.marker.openPopup(); break; }
    case 'pickDest': pick('dest'); break;
    case 'pickVia': pick('via'); break;
    case 'pickHazard': pick('hazard'); break;
    case 'ctx': map.closePopup(); place(d.k, S.ctx); if (d.k === 'poi') openSheet('punti'); else if (d.k !== 'hazard' && d.k !== 'show') openSheet('rotta'); break;
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
    case 'goRes': { const r = S.results[i]; showPoint(r, r.display.split(',')[0]); break; }
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
$('bNight').onclick = () => { S.set.theme = THEMES[(THEMES.indexOf(S.set.theme) + 1) % 3]; saveSet(); applyNight(); fabs(); toast('Tema: ' + THEME_L[S.set.theme]); };
$('bLayers').onclick = () => { S.tab === 'mappa' ? closeSheet() : openSheet('mappa'); };
$('sheetX').onclick = () => closeSheet();
$('homeGo').onclick = () => { $('home').hidden = true; closeSheet(); };
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
[['lSea', 'sea'], ['lBathy', 'bathy'], ['lIso', 'iso'], ['lTrack', 'track'], ['lEnc', 'enc'], ['lWrecks', 'wrecks'], ['lAis', 'ais'], ['lPois', 'pois'], ['lFonde', 'fonde'], ['lAmp', 'amp'], ['lPesca', 'pesca'], ['lServizi', 'servizi'], ['lComm', 'comm']].filter(([id]) => $(id)).forEach(([id, k]) => {
  $(id).checked = !!S.set[k];
  $(id).addEventListener('change', () => { S.set[k] = $(id).checked; saveSet(); applyLayers(); renderPunti(); });
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
  if (FL && FL.user && ++fleetTick % 15 === 0) { renderFleetMarkers(); if (S.tab === 'imp') renderFleetBox(); }
  ui(); fabs();
}, 1000);
let fleetTick = 0;
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
drawHazards(); drawPois(); drawRoute(); renderRoute(); renderHaz(); fabs(); ui();
if (wps().length > 1 && !store.get('view', null)) map.fitBounds(routeLine.getBounds().pad(0.2));
/* Nel browser il service worker salva l'app per l'uso senza rete. Nell'APK i file sono già dentro l'app:
   il service worker non serve e su alcuni Android interferisce con il caricamento, quindi viene tolto. */
if ('serviceWorker' in navigator) {
  if (window.Capacitor) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  else navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode non disponibile */ });
}
window.rnStarted = true;
if (window.ENC) ENC.load().then(() => { encStatus(); encView.render(); }); else encStatus();
renderFleetBox();
if (FL) FL.init(S.set.fleetIn);
startGps();
/* pacchetto dati: controllo a ogni avvio (dopo che la carta è partita) e quando torna la rete */
setTimeout(() => syncPackage(), 4000);
window.addEventListener('online', () => syncPackage());
if (S.route.path === undefined) S.route.path = null;
if (!S.route.path && S.route.start && S.route.dest) { S.route.blocked = true; drawRoute(); renderRoute(); autoSchedule(); }
openHome();
setTimeout(() => { if (S.set.amp || S.set.fonde || S.route.start) loadPoiData(); }, 5000);
})();
