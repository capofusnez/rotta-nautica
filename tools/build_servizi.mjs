// Marine, distributori di carburante per barche e scivoli delle coste italiane (servizi.json), da OpenStreetMap / OpenSeaMap.
// Lo esegue l'azione GitHub "Punti di fonda e aree protette" insieme a build_poi.mjs; a mano: node tools/build_servizi.mjs
// I servizi di ogni marina si ricavano dai tag della marina e dagli oggetti mappati vicino (entro 400 m):
// distributori, bagni, docce, acqua, scivoli, gru, negozi nautici... Possono mancare o essere incompleti.
import fs from 'fs';

const OUT = 'servizi.json';
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'rotta-nautica (github.com/capofusnez/rotta-nautica)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* coste italiane in riquadri piccoli: una richiesta sola per tutta l'Italia manda in timeout i server */
const BOXES = [
  [43.6, 7.4, 44.6, 10.2],   // Liguria
  [42.3, 9.8, 44.2, 11.4],   // Toscana e Arcipelago
  [40.8, 11.0, 42.5, 14.2],  // Lazio e Campania nord
  [38.7, 8.0, 41.4, 10.0],   // Sardegna
  [39.5, 14.0, 41.0, 16.4],  // Campania e Basilicata tirrenica
  [37.8, 15.0, 39.8, 17.3],  // Calabria
  [36.4, 12.0, 38.4, 15.8],  // Sicilia
  [35.4, 11.8, 36.4, 13.0],  // Pelagie
  [39.7, 16.4, 42.0, 18.8],  // Puglia
  [42.0, 13.3, 44.0, 15.6],  // Abruzzo, Marche, Molise
  [44.0, 12.0, 45.0, 13.0],  // Romagna e delta del Po
  [45.0, 12.0, 45.9, 13.95]  // Veneto e Friuli Venezia Giulia
];
const q = ([s, w, n, e]) => `[out:json][timeout:110][bbox:${s},${w},${n},${e}];
nwr["leisure"="marina"]->.m;
(
  .m;
  nwr["waterway"~"^(fuel|water_point|sanitary_dump_station)$"];
  nwr["amenity"="fuel"]["boat"~"^(yes|designated)$"];
  nwr["seamark:type"="small_craft_facility"];
  nwr["leisure"="slipway"];
  nwr["amenity"~"^(toilets|shower|drinking_water)$"](around.m:300);
  nwr["shop"~"^(boat|marine|fishing|chandler)$"](around.m:400);
  nwr["man_made"="crane"](around.m:300);
);
out center tags;`;

async function overpass(query) {
  const errs = [];
  for (const url of SERVERS) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 130000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA } });
      const txt = await r.text();
      clearTimeout(to);
      if (!r.ok) { errs.push(`${url}: ${r.status}`); continue; }
      const j = JSON.parse(txt);
      if (j.remark && /error|timed out|out of memory/i.test(j.remark)) { errs.push(`${url}: ${j.remark.slice(0, 60)}`); continue; }
      return j;
    } catch (e) { errs.push(`${url}: ${e.name === 'AbortError' ? 'timeout' : e.message}`); }
    await sleep(4000);
  }
  throw new Error(errs.join(' | '));
}

const first = (t, keys) => { for (const k of keys) if (t[k] != null && t[k] !== '') return String(t[k]).slice(0, 120); return null; };
const yes = v => /^(yes|true|1|designated)$/i.test(v || '');
const clean = o => { Object.keys(o).forEach(k => { if (o[k] == null || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; }); return o; };
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
const posOf = e => e.type === 'node' ? { lat: e.lat, lng: e.lon } : e.center ? { lat: e.center.lat, lng: e.center.lon } : null;

/* categorie OpenSeaMap delle strutture per piccole imbarcazioni -> servizi dell'app */
const SCF = { fuel_station: 'carburante', water_tap: 'acqua', electrical_supply: 'elettricita', toilets: 'bagni', showers: 'docce',
  slipway: 'scivolo', boat_hoist: 'gru', chandler: 'nautica', provisions: 'cambusa', laundrette: 'lavanderia', waste_disposal: 'rifiuti',
  refuse_bin: 'rifiuti', pump_out: 'svuotamento', visitor_berth: 'ospiti', visitors_mooring: 'ospiti', sailmaker: 'velaio',
  car_park: 'parcheggio', parking_for_cars_and_trailers: 'parcheggio', car_park_and_trailers: 'parcheggio', nautical_club: 'circolo',
  doctor: 'medico', pharmacy: 'farmacia', wifi: 'wifi' };
function servOf(t) {
  const s = new Set();
  String(t['seamark:small_craft_facility:category'] || '').split(';').forEach(c => { if (SCF[c.trim()]) s.add(SCF[c.trim()]); });
  if (yes(t.fuel) || yes(t['fuel:diesel']) || t.waterway === 'fuel' || t.amenity === 'fuel') s.add('carburante');
  if (yes(t.drinking_water) || yes(t.water_point) || t.waterway === 'water_point' || t.amenity === 'drinking_water') s.add('acqua');
  if (yes(t.electricity) || yes(t.power_supply) || yes(t.shore_power)) s.add('elettricita');
  if (yes(t.toilets) || t.amenity === 'toilets') s.add('bagni');
  if (yes(t.shower) || yes(t.showers) || t.amenity === 'shower') s.add('docce');
  if (yes(t.slipway) || t.leisure === 'slipway') s.add('scivolo');
  if (yes(t.crane) || yes(t.boat_hoist) || yes(t.travel_lift) || t.man_made === 'crane') s.add('gru');
  if (/^(boat|marine|chandler)$/.test(t.shop || '')) s.add('nautica');
  if (t.shop === 'fishing') s.add('pesca');
  if (yes(t.sanitary_dump_station) || t.waterway === 'sanitary_dump_station') s.add('svuotamento');
  if (/^(yes|wlan|wifi)$/i.test(t.internet_access || '')) s.add('wifi');
  if (yes(t['repair']) || yes(t['boat:repair']) || yes(t['service:boat:repair'])) s.add('riparazioni');
  return s;
}

const marine = new Map(), fuel = new Map(), slip = new Map(), facil = [];
let ok = 0;
const failed = [];
for (const bx of BOXES) {
  try {
    const osm = await overpass(q(bx));
    ok++;
    for (const e of osm.elements) {
      const t = e.tags || {}, p = posOf(e); if (!p) continue;
      const id = `${e.type[0]}${e.id}`;
      if (t.leisure === 'marina') {
        marine.set(id, clean({ id, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), name: first(t, ['name:it', 'name', 'official_name']),
          posti: first(t, ['capacity', 'seamark:harbour:category_capacity', 'mooring:capacity']), vhf: first(t, ['vhf', 'vhf_channel', 'communication:vhf', 'seamark:radio_station:channel']),
          tel: first(t, ['phone', 'contact:phone']), web: first(t, ['website', 'contact:website', 'url']), mail: first(t, ['email', 'contact:email']),
          prof: first(t, ['depth', 'maxdraft', 'seamark:harbour:depth']), s: [...servOf(t)] }));
      }
      if (t.waterway === 'fuel' || (t.amenity === 'fuel' && /^(yes|designated)$/.test(t.boat || '')) || /fuel_station/.test(t['seamark:small_craft_facility:category'] || '')) {
        fuel.set(id, clean({ id, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), name: first(t, ['name', 'brand', 'operator']), brand: first(t, ['brand']),
          diesel: yes(t['fuel:diesel']) || null, benzina: yes(t['fuel:octane_95']) || yes(t['fuel:octane_98']) || null, miscela: yes(t['fuel:2T']) || yes(t['fuel:two_stroke']) || null,
          orari: first(t, ['opening_hours']), tel: first(t, ['phone', 'contact:phone']) }));
      }
      if (t.leisure === 'slipway') slip.set(id, clean({ id, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), name: first(t, ['name']), fee: t.fee || null }));
      if (t.leisure !== 'marina') { const s = servOf(t); if (s.size) facil.push({ p, s }); }
    }
  } catch (e) { failed.push(`${bx.join(',')}: ${e.message}`); }
  await sleep(3000);
}
/* servizi vicini (entro 400 m) assegnati alla marina più vicina */
const M = [...marine.values()];
facil.forEach(f => {
  let best = null, bd = 400;
  M.forEach(m => { const d = dist(m, f.p); if (d < bd) { bd = d; best = m; } });
  if (best) { const s = new Set(best.s || []); f.s.forEach(x => s.add(x)); best.s = [...s]; }
});
fuel.forEach(f => { let bd = 400, best = null; M.forEach(m => { const d = dist(m, f); if (d < bd) { bd = d; best = m; } }); if (best) f.marina = best.name || 'marina'; });

let old = null;
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* primo giro */ }
/* se qualche riquadro non è arrivato si tengono i suoi dati precedenti */
const keepOld = (list, oldList) => {
  if (!failed.length || !oldList) return list;
  const inFailed = o => failed.some(f => { const [s, w, n, e] = f.split(':')[0].split(',').map(Number); return o.lat >= s && o.lat <= n && o.lng >= w && o.lng <= e; });
  const ids = new Set(list.map(o => o.id));
  return list.concat(oldList.filter(o => inFailed(o) && !ids.has(o.id)));
};
const out = { format: 'rotta-nautica-servizi-1', created: new Date().toISOString(), source: 'OpenStreetMap / OpenSeaMap',
  marine: keepOld(M, old && old.marine), carburante: keepOld([...fuel.values()], old && old.carburante), scivoli: keepOld([...slip.values()], old && old.scivoli) };
if (!ok && old) { console.log('Nessun riquadro scaricato: resta il file precedente. ' + failed.join(' | ')); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${out.marine.length} marine, ${out.carburante.length} distributori, ${out.scivoli.length} scivoli; ${ok}/${BOXES.length} riquadri scaricati` +
  (failed.length ? `; non scaricati: ${failed.join(' | ')}` : ''));
