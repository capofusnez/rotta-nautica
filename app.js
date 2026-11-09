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
  mute: false, night: false, base: 'osm', sea: true, bathy: false, track: true, follow: true };
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

function applyLayers() {
  Object.keys(base).forEach(k => { if (k === S.set.base) { if (!map.hasLayer(base[k])) base[k].addTo(map); } else map.removeLayer(base[k]); });
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
try { if (window.Seamarks) seamarkInspector = Seamarks.attach(map, { isOn: () => S.set.sea, isPicking: () => !!S.pick, nodes: () => localNautical().then(D => D.nodes) }); }
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
async function loadGrid(a, b, k, n) {
  const box = Water.tileBox([a, b]);
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
    /* dati nautici locali: istantanei. Il tratto deve stare nell'area coperta dal file. */
    /* i limiti del file si ricavano dai dati: in mare aperto non ci sono segnali, quindi si tollerano ~10 km di margine */
    const D = await localNautical(), inside = (p, M) => p.lat >= D.ext.s - M && p.lat <= D.ext.n + M && p.lng >= D.ext.w - M && p.lng <= D.ext.e + M;
    if (!inside(a, 0.0) || !inside(b, 0.0)) S.edgeWarn = true;
    if (!inside(a, 0.1) || !inside(b, 0.1)) throw new Error(`Tratto ${k}: è fuori dall'area di nautica_locale.geojson (${D.ext.s.toFixed(2)}-${D.ext.n.toFixed(2)} N, ${D.ext.w.toFixed(2)}-${D.ext.e.toFixed(2)} E). Scarica i dati anche per questa zona con Overpass Turbo`);
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
  return { rgba, W, H, box, extra, info: nautical.info, ch: extra.ch, enc: enc ? { fraction: enc.fraction, cells: enc.cells } : null };
}

/* ---------- Calcolo del percorso nel Web Worker ----------
   water.js gira anche come Worker: griglia, A*, semplificazione e verifica avvengono fuori dall'interfaccia.
   Se il Worker non è disponibile si calcola qui, come prima. */
let routeWorker = null, routeJob = 0;
function routeLeg(prep, a, b) {
  const { rgba, W, H, box, extra } = prep;
  const masks = {};
  ['restrict', 'hard', 'lines', 'axis', 'ext', 'zone', 'barrier', 'nogo'].forEach(k => { if (extra[k]) masks[k] = extra[k]; });
  masks.coastM = extra.coastM;
  if (extra.enc) masks.enc = { cov: extra.enc.cov, ok: extra.enc.ok, wet: extra.enc.wet, pref: extra.enc.pref };
  const msg = { rgba, W, H, box, extra: masks, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng }, relaxM: 500 };
  const local = () => Water.solve(msg);
  if (!window.Worker) return Promise.resolve(local());
  return new Promise(resolve => {
    try {
      if (!routeWorker) routeWorker = new Worker('water.js');
      const id = ++routeJob;
      routeWorker.onmessage = e => { if (e.data && e.data.id === id) resolve(e.data); };
      routeWorker.onerror = ev => { ev.preventDefault && ev.preventDefault(); routeWorker = null; resolve(local()); };
      routeWorker.postMessage(Object.assign({ id }, msg), [rgba.buffer]);
    } catch (e) { routeWorker = null; resolve(local()); }
  });
}
/* interrompe un calcolo in corso (nuova rotta o Annulla) */
function stopWorker() { if (routeWorker) { routeWorker.terminate(); routeWorker = null; } }

/* ---------- Dati nautici locali (nautica_locale.geojson) ----------
   Il file si scarica una volta da Overpass Turbo (query in tools/overpass_turbo_nautica.txt) e si pubblica
   accanto a index.html. L'app lo legge una sola volta con fetch(): nessuna richiesta a Overpass, segnali e
   calcolo della rotta sono immediati e funzionano anche senza rete. */
const NAUTICA_URL = 'nautica_locale.geojson';
let nauticaP = null;
function localNautical() {
  if (!nauticaP) nauticaP = (async () => {
    let r;
    try { r = await fetch(NAUTICA_URL, { cache: 'no-cache' }); }
    catch (e) { r = await caches.match(NAUTICA_URL).catch(() => null); }
    if (!r || !r.ok) throw new Error('Manca il file nautica_locale.geojson con canali e briccole: crealo con Overpass Turbo (vedi tools/overpass_turbo_nautica.txt) e caricalo accanto a index.html');
    return indexNautical(await r.json());
  })().catch(e => { nauticaP = null; throw e; });
  return nauticaP;
}
const WATERWAY = /^(river|canal|fairway|tidal_channel|dock)$/;
/* Prepara il GeoJSON (formato di Overpass Turbo / osmtogeojson): divide per tipo e calcola gli ingombri. */
function indexNautical(gj) {
  const D = { nodes: [], lines: [], corridorAreas: [], restrictAreas: [], ext: { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity } };
  const ll = c => ({ lat: c[1], lng: c[0] });
  const bbOf = pts => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; pts.forEach(p => { if (p.lng < w) w = p.lng; if (p.lng > e) e = p.lng; if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; }); return [w, s, e, n]; };
  const grow = b => { D.ext.w = Math.min(D.ext.w, b[0]); D.ext.s = Math.min(D.ext.s, b[1]); D.ext.e = Math.max(D.ext.e, b[2]); D.ext.n = Math.max(D.ext.n, b[3]); };
  (gj.features || []).forEach((f, k) => {
    const g = f.geometry, P = f.properties || {};
    if (!g) return;
    /* Overpass Turbo mette i tag direttamente nelle properties; osmtogeojson classico li mette in properties.tags */
    const t = P.tags && typeof P.tags === 'object' ? P.tags : P;
    const id = P['@id'] || P.id || f.id || 'f' + k;
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
        const item = { rings: p, bb: bbOf(p[0]), lagoon: t.water === 'lagoon', hard: t.natural === 'wetland' && /^(saltmarsh|marsh|reedbed|swamp|fen|bog|wet_meadow)$/.test(t.wetland || '') };
        if (isRestrict) D.restrictAreas.push(item);
        else if (isFair) D.corridorAreas.push(item);
        else if (WATERWAY.test(t.waterway || '')) D.lines.push({ pts: p[0], bb: item.bb });   // canale chiuso ad anello
        else return;
        grow(item.bb);
      });
      return;
    }
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      if (!(WATERWAY.test(t.waterway || '') || isFair)) return;
      (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach(l => { const pts = l.map(ll), bb = bbOf(pts); D.lines.push({ pts, bb }); grow(bb); });
    }
  });
  return D;
}
/* Estrae i dati locali che toccano il riquadro della griglia. Nessuna rete. */
async function fetchNautical(box) {
  const D = await localNautical(), b = Water.boxBounds(box);
  const hit = bb => bb[0] <= b.e && bb[2] >= b.w && bb[1] <= b.n && bb[3] >= b.s;
  const out = { lines: [], corridorAreas: [], restrictAreas: [], hardAreas: [], nodes: [], info: { canali: 0, segnali: 0, coppie: 0, lagune: 0 } };
  D.lines.forEach(l => { if (hit(l.bb)) { out.lines.push(l.pts); out.info.canali++; } });
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
  // canali segnalati da briccole e segnali laterali (channels.js)
  if (!window.Channels) throw new Error('Manca il file channels.js: aggiorna l\'app');
  const ch = Channels.analyze(nd.nodes, null, nd.lines);
  nd.info.segnali = ch.marks; nd.info.coppie = ch.pairs;
  const m = Channels.rasterize(ch, W, H, P, mpp);
  return { restrict, hard, lines, axis: m.axis, ext: m.ext, zone: m.zone, barrier: m.barrier, nogo: m.nogo, ch, coastM: S.set.coast };
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
  S.grids = []; showWater(false);
  const legs = [], moved = [], offLegs = [], info = { canali: 0, segnali: 0, coppie: 0, lagune: 0 };
  const name = i => i === 0 ? 'La partenza' : i === w.length - 1 ? "L'arrivo" : `La tappa ${i}`;
  try {
    for (let k = 1; k < w.length; k++) {
      const n = w.length - 1;
      const prep = await loadGrid(w[k - 1], w[k], k, n);
      if (seq !== autoSeq) return;
      busy.set(`Tratto ${k}/${n}: cerco il percorso…`, k, 0.75);
      const res = await routeLeg(prep, w[k - 1], w[k]);
      if (seq !== autoSeq) return;
      if (res.error) throw new Error(`Tratto ${k}: errore nel calcolo (${res.error})`);
      /* griglia restituita dal Worker: serve per le coordinate e per "Mostra acque navigabili" */
      const g = { z: res.z, ox: res.ox, oy: res.oy, W: res.W, H: res.H, mpp: res.mpp, d: res.d, buf: res.buf, info: prep.info, ch: prep.ch, enc: prep.enc };
      S.grids.push(g);
      Object.keys(info).forEach(x => { info[x] = Math.max(info[x], g.info[x] || 0); });
      [k - 1, k].forEach((idx, j) => {
        const e = res.ends[j];
        if (e.i < 0) throw new Error(g.enc ? `${name(idx)}: secondo le carte ENC non c'è acqua profonda almeno ${num1(S.set.draft + S.set.ukc)} m (pescaggio + margine) nelle vicinanze`
          : `${name(idx)}: nessuna acqua navigabile nelle vicinanze`);
        if (!e.moved) return;
        const np = Water.cellLL(g, e.i), dd = dist(w[idx], np);
        if (dd > MOVE_MAX) throw new Error(`${name(idx)}: il punto navigabile più vicino è a ${fmtDist(dd)}${g.enc ? ` (profondità almeno ${num1(S.set.draft + S.set.ukc)} m)` : ''}. Sposta il punto in un canale`);
        w[idx] = np; if (!moved.includes(idx)) moved.push(idx);
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
      legs.push(cells.map(i => Water.cellLL(g, i)));
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
  const pts = [w[0]];
  legs.forEach((leg, k) => { pts.push(...leg.slice(1, -1), w[k + 1]); });
  const clean = pts.filter((p, i) => i === 0 || i === pts.length - 1 || dist(p, pts[i - 1]) > 15);
  if (S.active) stopNav();
  S.route.start = w[0]; S.route.via = w.slice(1, -1); S.route.dest = w[w.length - 1];
  S.route.path = clean.slice(1, -1); S.route.blocked = false;
  routeChanged();
  map.fitBounds(routeLine.getBounds().pad(0.15));
  if (S.tab) minSheet(true);
  showWater(false);
  const offTxt = offLegs.length ? ` ATTENZIONE: per raggiungere partenza, arrivo o tappe la rotta esce dai canali segnalati vicino a quei punti (${offLegs.join(', ')}). In quei tratti i fondali non sono noti: procedi a vista e a velocità ridotta.` : '';
  const edge = S.edgeWarn ? ' Attenzione: partenza o arrivo sono al margine dell\'area di nautica_locale.geojson, lì canali e briccole potrebbero mancare.' : '';
  const mv = moved.length ? ' ' + moved.map(name).join(', ') + (moved.length > 1 ? ' sono state spostate' : ' è stata spostata') + ' nel punto navigabile più vicino.' : '';
  const encUsed = S.grids.filter(g => g.enc).map(g => g.enc), encAll = encUsed.length === S.grids.length && encUsed.every(e => e.fraction > 0.999);
  const encCells = [...new Set(encUsed.flatMap(e => e.cells))].join(', ');
  const osmTxt = `${info.canali} canali mappati, ${info.segnali} briccole e segnali di canale, ${info.coppie} sezioni di canale riconosciute, ${info.lagune ? 'laguna riconosciuta' : 'nessuna laguna nei dati'}`;
  autoMsg(encAll
    ? `Rotta calcolata con le carte ENC ufficiali (${encCells}): passa solo dove la profondità è almeno ${num1(S.set.draft + S.set.ukc)} m (pescaggio ${num1(S.set.draft)} m + margine ${num1(S.set.ukc)} m) e lontano da terra, opere e ostacoli.${mv} Verifica che le celle siano aggiornate con gli ultimi Avvisi ai Naviganti.`
    : encUsed.length
      ? `Rotta calcolata con le carte ENC (${encCells}) dove disponibili e con OpenStreetMap/OpenSeaMap altrove (${osmTxt}).${mv}${edge}${offTxt} Fuori dalle ENC le profondità non sono note: verifica con i segnalamenti in acqua.`
      : `Rotta calcolata (${osmTxt}).${mv}${edge}${offTxt} I dati OpenStreetMap/OpenSeaMap del file locale non indicano le profondità e possono essere incompleti: verifica sempre con i segnalamenti in acqua.`);
  let tot = 0; for (let i = 1; i < clean.length; i++) tot += dist(clean[i - 1], clean[i]);
  if (offLegs.length) busy.fail(`Rotta calcolata: ${fmtDist(tot)}. Attenzione: ultimo tratto fuori dai canali segnalati (${offLegs.join(', ')}), procedi a vista e piano.`);
  else busy.done(`Rotta calcolata: ${fmtDist(tot)}, circa ${fmtDur(tot / (S.set.plan / KN))} a ${S.set.plan} nodi. Verificala sulla carta.`);
  $('bAuto').disabled = false;
}

/* Mostra sulla carta l'acqua riconosciuta dall'ultimo calcolo (in azzurro): utile per capire perché
   una rotta passa da un punto o perché non si trova un passaggio. */
const waterLayer = L.layerGroup(), gapLayer = L.layerGroup();
function showWater(on) {
  waterLayer.clearLayers();
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
  } else map.removeLayer(waterLayer);
  $('bWater').textContent = on ? 'Nascondi acque navigabili' : 'Mostra acque navigabili';
  $('bWater').hidden = !S.grids.length;
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
const FIELDS = { sXte: 'xte', sArr: 'arr', sSpd: 'spd', sWind: 'wind', sHz: 'hz', sAnc: 'anc', sPlan: 'plan', sCoast: 'coast', sDraft: 'draft', sUkc: 'ukc' };
Object.keys(FIELDS).filter(id => $(id)).forEach(id => {
  const el = $(id); el.value = S.set[FIELDS[id]];
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (isFinite(v)) {
      S.set[FIELDS[id]] = v; saveSet(); if (id === 'sPlan') renderRoute();
      if (/^(sCoast|sDraft|sUkc)$/.test(id) && S.route.start && S.route.dest) { clearTimeout(coastT); coastT = setTimeout(editRoute, 1200); }
      if (/^(sDraft|sUkc)$/.test(id)) encView.render();
    }
  });
});
document.querySelectorAll('input[name=base]').forEach(r => {
  r.checked = r.value === S.set.base;
  r.addEventListener('change', () => { S.set.base = r.value; saveSet(); applyLayers(); });
});
[['lSea', 'sea'], ['lBathy', 'bathy'], ['lTrack', 'track'], ['lEnc', 'enc']].filter(([id]) => $(id)).forEach(([id, k]) => {
  $(id).checked = !!S.set[k];
  $(id).addEventListener('change', () => { S.set[k] = $(id).checked; saveSet(); applyLayers(); });
});

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
if (S.route.path === undefined) S.route.path = null;
if (!S.route.path && S.route.start && S.route.dest) { S.route.blocked = true; drawRoute(); renderRoute(); autoSchedule(); }
if (!wps().length) setTimeout(() => openSheet('rotta'), 400);
})();
