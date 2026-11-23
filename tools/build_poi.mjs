// Punti di fonda (ancoraggi) e aree marine protette per l'app (poi.json), da OpenStreetMap / OpenSeaMap.
// Lo esegue l'azione GitHub "Aggiorna dati nautici"; a mano: npm i osmtogeojson && node tools/build_poi.mjs
// Le aree marine protette sono quelle mappate dai volontari: la suddivisione in zone A, B, C, D c'è solo dove
// qualcuno l'ha disegnata. Fanno fede le ordinanze e i regolamenti di ogni area.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const osmtogeojson = require('osmtogeojson');

const OUT = 'poi.json';
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'rotta-nautica (github.com/capofusnez/rotta-nautica)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* l'area dell'Italia in OSM comprende anche il mare territoriale (12 miglia) */
const AREA = 'area["ISO3166-1"="IT"][admin_level=2]->.it;';
const Q_FONDE = `[out:json][timeout:300];${AREA}
nwr["seamark:type"~"^(anchorage|anchor_berth)$"](area.it);
out center tags;`;
/* ricerca leggera, divisa in 7 zone di mare: una sola richiesta per tutta l'Italia mandava in timeout i server.
   Chiavi fisse (name, protection_title), niente espressioni sulle chiavi e niente confine dell'Italia (troppo pesante):
   i nomi cercati sono italiani, le poche aree estere coi nomi in inglese si scartano sotto. */
const RX = '(area marina|riserva naturale marina|riserva marina|parco sommerso|parco marino|marine protected)';
const BOXES = [
  [43.0, 7.4, 44.6, 11.0],   // Liguria e Toscana nord
  [41.0, 9.6, 43.0, 13.0],   // Arcipelago toscano e Lazio
  [38.7, 8.0, 41.4, 10.0],   // Sardegna
  [37.8, 13.0, 41.3, 16.4],  // Campania e Calabria tirrenica
  [35.4, 11.8, 38.9, 15.8],  // Sicilia, Egadi, Pelagie
  [37.8, 15.8, 42.3, 18.8],  // Ionio e Puglia
  [42.0, 12.0, 45.9, 15.6]   // Adriatico centro-nord
];
const qAmp = ([s, w, n, e]) => { const f = `(${s},${w},${n},${e})`; return `[out:json][timeout:110];
(
  nwr["boundary"="protected_area"]["protection_title"~"marin",i]${f};
  nwr["boundary"="protected_area"]["name"~"${RX}",i]${f};
  nwr["leisure"="nature_reserve"]["name"~"${RX}",i]${f};
  nwr["seamark:type"="restricted_area"]["name"~"${RX}",i]${f};
  nwr["seamark:type"="restricted_area"]["seamark:name"~"${RX}",i]${f};
);
out body;
>;
out skel qt;`; };

async function overpass(q, rounds = 2, ms = 330000) {
  const errs = [];
  for (let round = 1; round <= rounds; round++) {
    for (const url of SERVERS) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA } });
        const txt = await r.text();
        clearTimeout(to);
        if (!r.ok) { errs.push(`${url}: ${r.status}`); continue; }
        const j = JSON.parse(txt);
        if (j.remark && /error|timed out|out of memory/i.test(j.remark)) { errs.push(`${url}: ${j.remark.slice(0, 80)}`); continue; }
        return j;
      } catch (e) { errs.push(`${url}: ${e.name === 'AbortError' ? 'timeout' : e.message}`); }
      await sleep(5000);
    }
    if (round < rounds) await sleep(30000);
  }
  throw new Error(errs.slice(-3).join(' | '));
}

const first = (t, keys) => { for (const k of keys) if (t[k] != null && t[k] !== '') return t[k]; return null; };
const clean = o => { Object.keys(o).forEach(k => { if (o[k] == null || o[k] === '') delete o[k]; }); return o; };

/* semplificazione delle linee (Douglas-Peucker), tolleranza in gradi (0.00004° ≈ 4 m) */
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}
const simpGeom = g => {
  const ring = r => simplify(r, 0.00004);
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(ring).filter(r => r.length >= 4) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map(p => p.map(ring).filter(r => r.length >= 4)).filter(p => p.length) };
  return null;
};

function zoneOf(t) {
  const txt = ['name', 'official_name', 'protection_title', 'designation', 'description', 'zone', 'ref', 'seamark:name'].map(k => t[k] || '').join(' | ');
  const m = /\bzona\s*([abcd])\b/i.exec(txt) || /^\s*([abcd])\s*$/i.exec(t.zone || '');
  return m ? m[1].toUpperCase() : null;
}

const fonde = [], amp = [];
const log = [];

try {
  const osm = await overpass(Q_FONDE);
  for (const e of osm.elements) {
    const t = e.tags || {}, c = e.type === 'node' ? e : e.center;
    if (!c) continue;
    fonde.push(clean({
      id: `${e.type[0]}${e.id}`, lat: +c.lat.toFixed(5), lng: +c.lon.toFixed(5),
      name: first(t, ['name:it', 'name', 'seamark:name', 'seamark:anchorage:name']),
      cat: first(t, ['seamark:anchorage:category', 'seamark:anchor_berth:category']),
      kind: t['seamark:type'] === 'anchor_berth' ? 'berth' : null,
      depth: first(t, ['depth', 'seamark:anchorage:depth']),
      note: first(t, ['description:it', 'description', 'note', 'seamark:information'])
    }));
  }
  log.push(`${fonde.length} punti di fonda`);
} catch (e) { log.push('punti di fonda non scaricati: ' + e.message); }

const boxErr = [];
{
  const gj = { features: [] };
  for (const bx of BOXES) {
    try { gj.features.push(...osmtogeojson(await overpass(qAmp(bx), 1, 125000), { flatProperties: true }).features); }
    catch (e) { boxErr.push(`zona ${bx.join(',')}: ${e.message}`); }
  }
  for (const f of gj.features) {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
    const t = f.properties || {};
    /* si tengono le aree marine (non i parchi a terra che hanno "Marina" nel nome di un paese) */
    const txt = ['name', 'official_name', 'protection_title', 'designation', 'seamark:name'].map(k => t[k] || '').join(' | ');
    /* il Santuario Pelagos copre quasi tutto il Mar Ligure e non ha zone: coprirebbe la carta */
    if (/malta|gozo|comino|corse|corsica|hrvatsk|croat|sloven|tunisi|\bfrance\b/i.test(txt + ' ' + (t['name:en'] || ''))) continue;
    if (/pelagos|santuario (internazionale )?(per i|dei) mammiferi/i.test(txt)) continue;
    if (!zoneOf(t) && !/area marina|riserva (naturale )?marina(?! di\b)|parco (marino|sommerso)|marine protected|santuario|sanctuary|marine reserve/i.test(txt)) continue;
    const g = simpGeom(f.geometry);
    if (!g || !g.coordinates.length) continue;
    if (amp.some(a => a.properties.id === (t.id || f.id))) continue;
    amp.push({ type: 'Feature', geometry: g, properties: clean({
      id: t.id || f.id, name: first(t, ['name:it', 'name', 'official_name', 'seamark:name']),
      zone: zoneOf(t), title: first(t, ['protection_title', 'designation']),
      web: first(t, ['website', 'url', 'contact:website']), wiki: first(t, ['wikipedia'])
    }) });
  }
  log.push(`${amp.length} aree marine protette o zone (${amp.filter(f => f.properties.zone).length} con la zona A/B/C/D)`);
  if (boxErr.length) log.push(`${boxErr.length} zone di mare non scaricate: ${boxErr.join(' | ')}`);
}

/* se una delle due richieste fallisce si tiene la parte del file precedente */
let old = null;
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* nessun file precedente */ }
const out = {
  format: 'rotta-nautica-poi-1', created: new Date().toISOString(), source: 'OpenStreetMap / OpenSeaMap',
  fonde: fonde.length ? fonde.sort((a, b) => a.lat - b.lat || a.lng - b.lng) : (old && old.fonde) || [],
  amp: amp.length && (!boxErr.length || !(old && old.amp && old.amp.length > amp.length)) ? amp : (old && old.amp) || []
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ` + log.join(', ') + ` (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
