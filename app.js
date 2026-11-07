'use strict';
(() => {
if (typeof L === 'undefined') {
  document.body.insertAdjacentHTML('afterbegin',
    '<p style="padding:24px;font:16px system-ui">Libreria cartografica non caricata. Collegati a Internet almeno una volta, poi riapri l\'app.</p>');
  return;
}

/* ---------- Utilità ---------- */
const NM = 1852, R = 6371008.8, RAD = Math.PI / 180, DEG = 180 / Math.PI, KN = 1.943844;
const $ = id => document.getElementById(id);
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
const DEF = { xte: 0.1, arr: 80, spd: 0, wind: 25, hz: 300, plan: 5, anc: 40,
  mute: false, night: false, base: 'osm', sea: true, bathy: false, track: true, follow: true,
  chv: 5, ch: true, bea: true };
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
  tab: null, results: [], ctx: null, mobTap: 0,
  userCh: store.get('userCh', []).map(c => Object.assign(c, { user: true })),
  osmCh: store.get('osmCh', []),
  zones: store.get('zones', []),
  reports: store.get('reports', []),
  beacons: [], draft: [], pickTab: null, auto: false, cver: 0, chAll: [], rt: null
};
const wps = () => [S.route.start, ...S.route.via, S.route.dest].filter(Boolean);
const legFrom = w => (S.leg === 1 && S.legFrom) ? S.legFrom : w[S.leg - 1];

/* ---------- Carta ---------- */
const map = L.map('map', { zoomControl: false, worldCopyJump: true, maxZoom: 19 })
  .setView(S.view.c, S.view.z);
map.attributionControl.setPosition('bottomleft');
const base = {
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, zIndex: 1, attribution: '© OpenStreetMap' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, zIndex: 1, attribution: 'Esri' })
};
const sea = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, zIndex: 3, attribution: 'OpenSeaMap' });
const bathy = L.tileLayer.wms('https://ows.emodnet-bathymetry.eu/wms', {
  layers: 'emodnet:mean_multicolour', format: 'image/png', transparent: true, opacity: 0.55, zIndex: 2, attribution: 'EMODnet Bathymetry'
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
const chLayer = L.layerGroup().addTo(map);
const osmLayer = L.layerGroup().addTo(map);
const zoneLayer = L.layerGroup().addTo(map);
const repLayer = L.layerGroup().addTo(map);
const beaconLayer = L.layerGroup().addTo(map);
const draftLine = L.polyline([], { color: '#00e5ff', weight: 4, dashArray: '6 6' }).addTo(map);
const boat = L.marker([0, 0], {
  icon: L.divIcon({
    className: '', iconSize: [34, 44], iconAnchor: [17, 22],
    html: '<div id="boat"><svg viewBox="-14 -18 28 36" width="34" height="44"><path d="M0-16 L10 14 L0 8 L-10 14Z" fill="#fff" stroke="#07151f" stroke-width="2" stroke-linejoin="round"/></svg></div>'
  }), zIndexOffset: 1000, interactive: false
});

map.on('moveend', () => store.set('view', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
map.on('dragstart', () => { if (S.set.follow) { S.set.follow = false; saveSet(); fabs(); } });
map.on('click', e => {
  if (!S.pick) return;
  const t = S.pick;
  if (t === 'chan') { S.draft.push({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }); draftLine.setLatLngs(S.draft.map(p => [p.lat, p.lng])); return; }
  if (t === 'zone') { addZone(e.latlng); endPick(); return; }
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
  [chLayer, osmLayer, zoneLayer].forEach(l => { if (S.set.ch) { if (!map.hasLayer(l)) l.addTo(map); } else map.removeLayer(l); });
  if (S.set.bea) { if (!map.hasLayer(beaconLayer)) beaconLayer.addTo(map); } else map.removeLayer(beaconLayer);
}
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
  routeChanged();
}
function routeChanged() {
  persistRoute();
  const w = wps();
  if (S.active) { if (w.length < 2) stopNav(); else S.leg = Math.min(S.leg, w.length - 1); }
  drawRoute(); routeCheck(); renderRoute(); ui();
}
function drawRoute() {
  const w = wps();
  routeLine.setLatLngs(w.map(p => [p.lat, p.lng]));
  wpLayer.clearLayers();
  const items = [];
  if (S.route.start) items.push({ role: 'start', p: S.route.start, label: 'P' });
  S.route.via.forEach((p, i) => items.push({ role: 'via', idx: i, p, label: String(i + 1) }));
  if (S.route.dest) items.push({ role: 'dest', p: S.route.dest, label: 'D' });
  items.forEach(it => {
    const m = L.marker([it.p.lat, it.p.lng], {
      draggable: true,
      icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="wp ${it.role}">${it.label}</div>` })
    }).addTo(wpLayer);
    m.on('dragend', () => {
      const ll = m.getLatLng(), np = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
      if (it.role === 'start') S.route.start = np; else if (it.role === 'dest') S.route.dest = np; else S.route.via[it.idx] = np;
      routeChanged();
    });
  });
}
function routeCheck() {
  const w = wps(), bad = [];
  dangers().forEach(h => {
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
    if (!S.mob && S.active && w.length > S.leg) {
      const rt = routeTimes(w);
      if (rt.legs.some(l => l.vmin < S.set.plan - 0.05)) {
        const cur = rt.legs[S.leg - 1], part = cur ? cur.t * Math.min(1, N.dtw / Math.max(cur.d, 1)) : 0;
        let t = part;
        for (let i = S.leg; i < rt.legs.length; i++) t += rt.legs[i].t;
        N.eta = Date.now() + t * 1000; N.ttg = part;
      }
    }
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

  dangers().forEach(h => {
    const id = h.aid, d = dist(p, h);
    if (d < h.r) { raise(id, `${h.name}: a ${fmtDist(d)}, PERICOLO`, 'bad'); return; }
    let hit = 0;
    if (p.sog > 0.8 && isFinite(p.cog)) {
      for (let m = 1; m <= 5 && !hit; m++) if (dist(dest(p, p.cog, p.sog / KN * 60 * m), h) < h.r) hit = m;
    }
    if (hit) raise(id, `${h.name} sulla prua tra circa ${hit} min`, 'warn'); else clearAl(id);
  });

  const lm = limitHere(p);
  if (lm && p.sog > lm.v + 0.3) raise('spd', `Velocità ${p.sog.toFixed(1)} nodi: limite ${lm.v} (${lm.why})`, 'warn'); else clearAl('spd');
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

/* ---------- Interfaccia ---------- */
const GRID = [['sog', 'SOG nodi'], ['cog', 'COG'], ['brg', 'BRG al punto'], ['dtw', 'DTW'], ['xte', 'XTE'], ['vmg', 'VMG nodi'],
  ['ttg', 'TTG punto'], ['eta', 'ETA punto'], ['rem', 'Distanza rimanente'], ['fin', 'Arrivo finale'], ['pos', 'Posizione', 1],
  ['lim', 'Limite velocità'], ['trip', 'Percorso'], ['time', 'Tempo'], ['avg', 'Media nodi'], ['max', 'Max nodi'], ['acc', 'Precisione GPS'],
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
  const lmt = p ? limitHere(p) : null;
  setD('lim', lmt ? `${lmt.v} kn (${lmt.why})` : 'nessuno');
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
  let html = '', tot = 0, totT = 0;
  const rt = w.length > 1 ? routeTimes(w) : { legs: [] };
  for (let i = 1; i < w.length; i++) {
    const d = dist(w[i - 1], w[i]); tot += d; totT += rt.legs[i - 1].t;
    const a = i === 1 ? 'P' : String(i - 1), b = i === w.length - 1 ? 'D' : String(i);
    const isVia = i < w.length - 1, vm = rt.legs[i - 1].vmin;
    html += `<div class="leg"><b>${a} → ${b}${vm < S.set.plan - 0.05 ? ' · max ' + vm.toFixed(1) + ' kn' : ''}${S.active && i === S.leg ? ' (in corso)' : ''}</b><span>${fmtAng(brg(w[i - 1], w[i]))}</span><span>${fmtDist(d)}</span>` +
      (isVia ? `<button data-act="delVia" data-i="${i - 1}" aria-label="Elimina tappa ${i}">✕</button>` : '<span></span>') + '</div>';
  }
  $('legs').innerHTML = html;
  const bad = routeConflicts();
  $('sum').innerHTML = w.length > 1
    ? `<span>Totale ${fmtDist(tot)}</span><span>Durata ${fmtDur(totT)}</span><span>${w.length - 1} prue</span>` + (bad ? `<span class="wr">${bad} ostacoli vicino alla rotta</span>` : '')
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
  dangers().forEach(h => { for (let i = 1; i < w.length; i++) if (segDist(h, w[i - 1], w[i]) < h.r) { n++; break; } });
  return n;
}
function renderHaz() {
  $('hList').innerHTML = S.hazards.map(h =>
    `<div class="row" style="grid-template-columns:1fr auto auto auto"><b>${esc(h.name)}</b><span>${h.r} m</span><button data-act="goHaz" data-id="${esc(h.id)}">Vai</button><button data-act="delHaz" data-id="${esc(h.id)}" aria-label="Elimina">✕</button></div>`).join('')
    || '<p class="note">Nessuna secca o ostacolo segnato.</p>';
  $('bAnchor').textContent = S.anchor ? 'Ritira ancora (allarme attivo)' : 'Getta ancora qui';
}

function openSheet(t) {
  S.tab = t; $('sheet').hidden = false;
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'p-' + t; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'rotta') renderRoute();
  if (t === 'avvisi') renderHaz();
  if (t === 'canali') renderCh();
  if (t === 'segnala') renderRep();
  ui();
}
function closeSheet() {
  S.tab = null; $('sheet').hidden = true;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
}
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => { S.tab === b.dataset.t ? closeSheet() : openSheet(b.dataset.t); }; });

function pick(type) {
  S.pick = type; S.draft = []; draftLine.setLatLngs([]); S.pickTab = S.tab || 'rotta'; closeSheet(); map.closePopup();
  $('pickBar').hidden = false;
  $('pickTxt').textContent = { start: 'Tocca la carta: PARTENZA', via: 'Tocca la carta: TAPPE (poi Fine)', dest: 'Tocca la carta: DESTINAZIONE', hazard: 'Tocca la carta: SECCA / OSTACOLO',
    chan: 'Tocca i punti lungo la mezzeria del canale (poi Fine)', zone: 'Tocca il centro della zona di velocità' }[type];
}
function endPick() {
  S.pick = null; $('pickBar').hidden = true; S.draft = []; draftLine.setLatLngs([]);
  if (!S.tab) openSheet(S.pickTab || 'rotta');
}
$('pickDone').onclick = () => { if (S.pick === 'chan') finalizeChannel(); else endPick(); };

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
function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/gpx+xml' }));
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
    S.route = { start: pts[0], via: pts.slice(1, -1), dest: pts[pts.length - 1] };
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
    case 'delVia': S.route.via.splice(i, 1); routeChanged(); break;
    case 'reverse': {
      stopNav();
      const s = S.route.start; S.route.start = S.route.dest; S.route.dest = s; S.route.via.reverse(); routeChanged(); break;
    }
    case 'clear': stopNav(); S.route = { start: null, via: [], dest: null }; routeChanged(); break;
    case 'useRes': { const r = S.results[i]; place(d.k, r); map.setView([r.lat, r.lng], Math.max(map.getZoom(), 12)); break; }
    case 'goRes': { const r = S.results[i]; map.setView([r.lat, r.lng], 13); S.set.follow = false; saveSet(); fabs(); break; }
    case 'loadRoute': stopNav(); S.route = JSON.parse(JSON.stringify(S.saved[i].route)); routeChanged();
      if (wps().length > 1) map.fitBounds(routeLine.getBounds().pad(0.2)); break;
    case 'delRoute': S.saved.splice(i, 1); store.set('routes', S.saved); renderRoute(); break;
    case 'gpxOut': if (wps().length) download('rotta.gpx', gpxText(false)); else toast('Nessuna rotta da esportare'); break;
    case 'gpxIn': $('fileIn').click(); break;
    case 'trackGpx': if (S.track.length) download('traccia.gpx', gpxText(true)); else toast('Traccia vuota'); break;
    case 'trackClear': S.track = []; S.trip = { dist: 0, t0: null, max: 0 }; trackLine.setLatLngs([]); store.set('track', []); store.set('trip', S.trip); toast('Traccia azzerata'); ui(); break;
    case 'anchor': setAnchor(); break;
    case 'delHaz': S.hazards = S.hazards.filter(h => h.id !== d.id); clearAl('h' + d.id); store.set('hazards', S.hazards); map.closePopup(); drawHazards(); routeCheck(); renderHaz(); renderRoute(); break;
    case 'goHaz': { const h = S.hazards.find(x => x.id === d.id); if (h) { map.setView([h.lat, h.lng], 15); S.set.follow = false; saveSet(); fabs(); } break; }
    case 'dismiss': SN.set(d.id, Date.now() + 60000); clearAl(d.id); break;
    case 'auto': autoRoute(); break;
    case 'pickChan': pick('chan'); break;
    case 'pickZone': pick('zone'); break;
    case 'delCh': S.userCh = S.userCh.filter(c => c.id !== d.id); persistCh(); map.closePopup(); drawChannels(); renderCh(); renderRoute(); break;
    case 'goCh': { const c = S.userCh.find(x => x.id === d.id); if (c) { map.fitBounds(L.latLngBounds(c.pts.map(p => [p.lat, p.lng])).pad(.3)); S.set.follow = false; saveSet(); fabs(); } break; }
    case 'delZone': S.zones = S.zones.filter(z => z.id !== d.id); persistZones(); map.closePopup(); drawZones(); renderCh(); renderRoute(); break;
    case 'goZone': { const z = S.zones.find(x => x.id === d.id); if (z) { map.setView([z.lat, z.lng], 15); S.set.follow = false; saveSet(); fabs(); } break; }
    case 'rep': addReport(d.k); break;
    case 'repOk': confirmReport(d.id, true); break;
    case 'repNo': confirmReport(d.id, false); break;
    case 'goRep': { const r = S.reports.find(x => x.id === d.id); if (r) { map.setView([r.lat, r.lng], 15); S.set.follow = false; saveSet(); fabs(); } break; }
    case 'dataOut': exportData(); break;
    case 'dataIn': $('fileData').click(); break;
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

/* impostazioni */
const FIELDS = { sXte: 'xte', sArr: 'arr', sSpd: 'spd', sWind: 'wind', sHz: 'hz', sAnc: 'anc', sPlan: 'plan', sChv: 'chv' };
Object.keys(FIELDS).forEach(id => {
  const el = $(id); el.value = S.set[FIELDS[id]];
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (isFinite(v)) { S.set[FIELDS[id]] = v; saveSet(); if (id === 'sPlan') renderRoute(); }
  });
});
document.querySelectorAll('input[name=base]').forEach(r => {
  r.checked = r.value === S.set.base;
  r.addEventListener('change', () => { S.set.base = r.value; saveSet(); applyLayers(); });
});
[['lSea', 'sea'], ['lBathy', 'bathy'], ['lTrack', 'track'], ['lCh', 'ch'], ['lBea', 'bea']].forEach(([id, k]) => {
  $(id).checked = !!S.set[k];
  $(id).addEventListener('change', () => { S.set[k] = $(id).checked; saveSet(); applyLayers(); });
});

/* ---------- Canali, zone di velocità, limiti ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const strip = arr => arr.map(c => { const o = Object.assign({}, c); delete o.bb; return o; });
const persistCh = () => { store.set('userCh', strip(S.userCh)); chChanged(); };
const persistZones = () => { store.set('zones', S.zones); chChanged(); };
function persistOsm() {
  const data = S.osmCh.map(c => ({ name: c.name, limit: c.limit, pts: c.pts.map(p => ({ lat: +(+p.lat).toFixed(5), lng: +(+p.lng).toFixed(5) })) }));
  try { if (JSON.stringify(data).length < 1200000) store.set('osmCh', data); } catch (e) { /* troppo grande */ }
}
function chChanged() {
  S.cver++;
  S.chAll = Router.prep([...S.userCh, ...S.osmCh]);
}
function limitHere(p) {
  const l = Router.limitAt(p, S.chAll, S.zones);
  let v = S.set.spd > 0 ? S.set.spd : 0, why = 'limite impostato';
  if (l && (!v || l.v < v)) { v = l.v; why = l.why; }
  return v ? { v, why } : null;
}
function routeTimes(w) {
  const key = w.map(p => p.lat + ',' + p.lng).join(';') + '|' + S.cver + '|' + S.set.plan;
  if (S.rt && S.rt.key === key) return S.rt;
  const legs = [];
  for (let i = 1; i < w.length; i++) legs.push(Router.legTime(w[i - 1], w[i], S.chAll, S.zones, S.set.plan));
  S.rt = { key, legs };
  return S.rt;
}

function drawChannels() {
  chLayer.clearLayers(); osmLayer.clearLayers();
  S.userCh.forEach(c => {
    const el = document.createElement('div');
    el.className = 'ctx';
    el.innerHTML = `<b>${esc(c.name)}</b><span>limite ${c.limit} nodi</span><button data-act="delCh" data-id="${esc(c.id)}">Elimina</button>`;
    L.polyline(c.pts.map(p => [p.lat, p.lng]), { color: '#00e5ff', weight: 5, opacity: .75 }).bindPopup(el).addTo(chLayer);
  });
  S.osmCh.forEach(c => L.polyline(c.pts.map(p => [p.lat, p.lng]), { color: '#3fd0d9', weight: 2, opacity: .7, dashArray: '4 5', interactive: false }).addTo(osmLayer));
}
function drawBeacons() {
  beaconLayer.clearLayers();
  const col = { red: '#e53935', green: '#43a047', yellow: '#fdd835', grey: '#9e9e9e' };
  S.beacons.forEach(b => {
    const m = L.marker([b.lat, b.lng], { icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: `<div class="bcn" style="background:${col[b.color] || col.grey}"></div>` }), keyboard: false }).addTo(beaconLayer);
    if (b.name) m.bindTooltip(esc(b.name));
  });
}
function drawZones() {
  zoneLayer.clearLayers();
  S.zones.forEach(z => {
    const el = document.createElement('div');
    el.className = 'ctx';
    el.innerHTML = `<b>${esc(z.name)}</b><span>limite ${z.limit} nodi, raggio ${z.r} m</span><button data-act="delZone" data-id="${esc(z.id)}">Elimina</button>`;
    L.circle([z.lat, z.lng], { radius: z.r, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: .12, dashArray: '6 4' }).bindPopup(el).addTo(zoneLayer);
  });
}
function addZone(ll) {
  const lim = parseFloat($('zLim').value) || S.set.chv, r = parseFloat($('zR').value) || 200;
  S.zones.push({ id: uid(), name: $('zName').value.trim() || 'Zona ' + (S.zones.length + 1), lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), r, limit: lim });
  $('zName').value = '';
  persistZones(); drawZones(); renderCh(); renderRoute(); toast('Zona di velocità segnata');
}
function finalizeChannel() {
  if (S.draft.length < 2) { toast('Servono almeno 2 punti'); return; }
  const lim = parseFloat($('cLim').value) || S.set.chv;
  S.userCh.push({ id: uid(), name: $('cName').value.trim() || 'Canale ' + (S.userCh.length + 1), limit: lim, pts: S.draft.slice(), user: true });
  $('cName').value = '';
  persistCh(); drawChannels(); endPick(); renderCh(); renderRoute(); toast('Canale salvato');
}
function renderCh() {
  $('sChv').value = S.set.chv;
  if (!$('cLim').value) $('cLim').value = S.set.chv;
  $('chList').innerHTML = S.userCh.map(c =>
    `<div class="row" style="grid-template-columns:1fr auto auto auto"><b>${esc(c.name)}</b><span>${c.limit} kn</span><button data-act="goCh" data-id="${esc(c.id)}">Vai</button><button data-act="delCh" data-id="${esc(c.id)}" aria-label="Elimina">✕</button></div>`).join('')
    || '<p class="note">Nessun canale disegnato.</p>';
  $('zList').innerHTML = S.zones.map(z =>
    `<div class="row" style="grid-template-columns:1fr auto auto auto"><b>${esc(z.name)}</b><span>${z.limit} kn</span><button data-act="goZone" data-id="${esc(z.id)}">Vai</button><button data-act="delZone" data-id="${esc(z.id)}" aria-label="Elimina">✕</button></div>`).join('')
    || '<p class="note">Nessuna zona di velocità.</p>';
  $('osmInfo').textContent = S.osmCh.length || S.beacons.length
    ? `${S.osmCh.length} tratti di canale e ${S.beacons.length} segnali dalla zona dell'ultimo calcolo.`
    : 'Nessun dato scaricato: arrivano quando calcoli una rotta automatica, con la rete attiva.';
}

/* ---------- Segnalazioni dei naviganti ---------- */
const REP = {
  detriti: { l: 'Detriti / tronco', c: 'D', ttl: 12, r: 150, block: 0 },
  secca: { l: 'Secca / basso fondale', c: 'S', ttl: 720, r: 200, block: 1 },
  briccola: { l: 'Briccola danneggiata', c: 'B', ttl: 720, r: 100, block: 0 },
  lavori: { l: 'Lavori / draga', c: 'L', ttl: 168, r: 250, block: 0 },
  controllo: { l: 'Controllo', c: 'C', ttl: 3, r: 300, block: 0 },
  onda: { l: 'Moto ondoso / traffico', c: 'T', ttl: 3, r: 400, block: 0 },
  chiuso: { l: 'Canale chiuso', c: 'X', ttl: 168, r: 100, block: 1 },
  altro: { l: 'Altro pericolo', c: '!', ttl: 24, r: 150, block: 0 }
};
$('repGrid').innerHTML = Object.keys(REP).map(k => `<button data-act="rep" data-k="${k}"><b>${REP[k].c}</b>  ${REP[k].l}</button>`).join('');
const repActive = r => REP[r.type] && Date.now() - r.t < REP[r.type].ttl * 3600e3;
const persistRep = () => store.set('reports', S.reports);
function fmtAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'ora';
  if (m < 60) return m + ' min fa';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h fa' : Math.round(h / 24) + ' giorni fa';
}
/* tutto ciò che va evitato: ostacoli segnati e segnalazioni ancora valide */
function dangers() {
  return [
    ...S.hazards.map(h => ({ aid: 'h' + h.id, name: h.name, lat: h.lat, lng: h.lng, r: h.r })),
    ...S.reports.filter(repActive).map(r => ({ aid: 'r' + r.id, name: REP[r.type].l, lat: r.lat, lng: r.lng, r: REP[r.type].r }))
  ];
}
function blocksList() {
  return [
    ...S.hazards.map(h => ({ lat: h.lat, lng: h.lng, r: h.r })),
    ...S.reports.filter(r => repActive(r) && REP[r.type].block).map(r => ({ lat: r.lat, lng: r.lng, r: REP[r.type].r }))
  ];
}
function drawReports() {
  repLayer.clearLayers();
  S.reports.filter(repActive).forEach(r => {
    const t = REP[r.type];
    const m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="rep${t.block ? ' blk' : ''}">${t.c}</div>` }) }).addTo(repLayer);
    const el = document.createElement('div');
    el.className = 'ctx';
    el.innerHTML = `<b>${esc(t.l)}</b><span>segnalato ${fmtAgo(r.t)}, ${r.n} ${r.n === 1 ? 'conferma' : 'conferme'}</span>` +
      `<button data-act="repOk" data-id="${esc(r.id)}">Ancora presente</button><button data-act="repNo" data-id="${esc(r.id)}">Non c'è più</button>`;
    m.bindPopup(el);
  });
}
function addReport(type) {
  if (!REP[type]) return;
  const p = S.pos || map.getCenter();
  S.reports.push({ id: uid(), type, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), t: Date.now(), n: 1 });
  persistRep(); drawReports(); routeCheck(); closeSheet();
  toast(REP[type].l + ' segnalato' + (S.pos ? '' : ' al centro della carta'));
}
function confirmReport(id, still) {
  const r = S.reports.find(x => x.id === id); if (!r) return;
  if (still) { r.t = Date.now(); r.n++; toast('Conferma registrata'); }
  else { S.reports = S.reports.filter(x => x.id !== id); clearAl('r' + id); toast('Segnalazione rimossa'); }
  persistRep(); drawReports(); routeCheck(); map.closePopup(); if (S.tab === 'segnala') renderRep();
}
function purgeReports() {
  const keep = S.reports.filter(repActive);
  if (keep.length !== S.reports.length) {
    S.reports.filter(r => !repActive(r)).forEach(r => clearAl('r' + r.id));
    S.reports = keep; persistRep(); drawReports();
  }
}
function renderRep() {
  const list = S.reports.filter(repActive).sort((a, b) => b.t - a.t);
  $('rList').innerHTML = list.map(r =>
    `<div class="row" style="grid-template-columns:1fr auto auto"><b>${esc(REP[r.type].l)}<br><span class="note">${fmtAgo(r.t)}${S.pos ? ', a ' + fmtDist(dist(S.pos, r)) : ''}</span></b><button data-act="goRep" data-id="${esc(r.id)}">Vai</button><button data-act="repNo" data-id="${esc(r.id)}" aria-label="Non c'è più">✕</button></div>`).join('')
    || '<p class="note">Nessuna segnalazione attiva.</p>';
}

/* ---------- Esporta e importa dati condivisibili ---------- */
function exportData() {
  const data = { v: 1, t: Date.now(), reports: S.reports.filter(repActive), channels: strip(S.userCh), zones: S.zones, hazards: S.hazards };
  download('rotta-nautica-dati.json', JSON.stringify(data), 'application/json');
}
$('fileData').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const merge = (mine, theirs) => { let n = 0; (theirs || []).forEach(x => { if (x && x.id && !mine.some(y => y.id === x.id)) { mine.push(x); n++; } }); return n; };
    const nr = merge(S.reports, (d.reports || []).filter(r => REP[r.type] && isFinite(r.lat) && isFinite(r.lng) && isFinite(r.t)));
    const nc = merge(S.userCh, (d.channels || []).filter(c => c.pts && c.pts.length > 1).map(c => Object.assign(c, { user: true })));
    const nz = merge(S.zones, d.zones);
    const nh = merge(S.hazards, d.hazards);
    persistRep(); persistCh(); persistZones(); store.set('hazards', S.hazards);
    drawReports(); drawChannels(); drawZones(); drawHazards(); routeCheck(); renderCh(); renderRoute();
    toast(`Importati: ${nr} segnalazioni, ${nc} canali, ${nz} zone, ${nh} ostacoli`);
  } catch (err) { toast('File non valido'); }
  e.target.value = '';
});

/* ---------- Rotta automatica ---------- */
async function autoRoute() {
  const a = S.route.start, b = S.route.dest, msg = t => { $('autoMsg').textContent = t; };
  if (!a || !b) { toast('Imposta partenza e destinazione'); return; }
  if (S.auto) return;
  S.auto = true; $('bAuto').disabled = true;
  try {
    if (!navigator.onLine) throw new Error('Serve la connessione per calcolare la rotta. Una rotta già calcolata resta salvata.');
    const g = Router.plan(a, b);
    msg('Scarico canali e briccole…');
    let osm = null, mk = null;
    try { osm = await Router.fetchOverpass(g.bbox, S.set.chv); } catch (e) { osm = null; }
    msg('Leggo la carta…');
    try { mk = await Router.loadTileMask(g, msg); } catch (e) { mk = null; }
    if (osm) { S.osmCh = osm.channels; S.beacons = osm.beacons; persistOsm(); drawBeacons(); }
    chChanged(); drawChannels();
    const useMask = !!(mk && mk.ok);
    msg('Calcolo la rotta…');
    await new Promise(r => setTimeout(r, 30));
    const res = Router.route(g, { water: useMask ? mk.water : null, channels: S.chAll, blocks: blocksList(), cruise: S.set.plan });
    if (!res) throw new Error(useMask
      ? 'Nessun percorso in acqua trovato. Controlla partenza e destinazione, oppure disegna i canali che mancano.'
      : 'Carta non leggibile e nessun canale che colleghi i due punti. Disegna i canali o riprova con più rete.');
    S.route.via = res.via.map(p => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
    stopNav(); routeChanged();
    if (wps().length > 1) map.fitBounds(routeLine.getBounds().pad(0.2));
    const w = wps(), rt = routeTimes(w);
    const tot = rt.legs.reduce((s, l) => s + l.d, 0), tt = rt.legs.reduce((s, l) => s + l.t, 0);
    msg(`${w.length - 1} prue, ${fmtDist(tot)}, circa ${fmtDur(tt)}. ` +
      (useMask ? `${Math.round(res.stats.chanShare * 100)}% su canali noti.` : 'Calcolata solo sui canali noti: la carta non era leggibile.') +
      (res.stats.startSnap > 100 || res.stats.destSnap > 100 ? ' Partenza o destinazione non sono in acqua: il primo o l\'ultimo tratto va controllato a mano.' : '') +
      ' Verifica la rotta prima di partire.');
    toast('Rotta calcolata');
  } catch (e) {
    msg(e.message || 'Errore nel calcolo'); toast(e.message || 'Errore nel calcolo');
  } finally {
    S.auto = false; $('bAuto').disabled = false;
  }
}
$('bRep').onclick = () => { S.tab === 'segnala' ? closeSheet() : openSheet('segnala'); };

/* ---------- Ciclo a 1 Hz ---------- */
setInterval(() => {
  const gpsActive = S.gpsOn || S.sim;
  if (gpsActive && S.lastFix && Date.now() - S.lastFix > 12000) raise('gps', 'Segnale GPS assente da ' + Math.round((Date.now() - S.lastFix) / 1000) + ' s', 'bad');
  if ([...A.values()].some(a => a.level === 'bad') && Date.now() - lastBeep > 8000) { pattern('bad'); vib('bad'); lastBeep = Date.now(); }
  if (S.pos && Date.now() - S.wxT > 600000) fetchWx();
  ui(); fabs();
}, 1000);
setInterval(() => { purgeReports(); if (S.tab === 'segnala') renderRep(); }, 60000);
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
chChanged(); purgeReports();
drawHazards(); drawChannels(); drawZones(); drawReports(); drawRoute(); renderRoute(); renderHaz(); fabs(); ui();
if (wps().length > 1 && !store.get('view', null)) map.fitBounds(routeLine.getBounds().pad(0.2));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode non disponibile */ });
startGps();
if (!wps().length) setTimeout(() => openSheet('rotta'), 400);
})();
