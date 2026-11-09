// Scarica da OpenStreetMap/OpenSeaMap i dati nautici di tutta Italia (e coste vicine) a riquadri di 1° × 1°
// e li salva in nautica/c_<lat>_<lng>.geojson, con l'indice nautica/index.json.
// Lo esegue l'azione GitHub "Aggiorna dati nautici". Uso locale: node tools/build_nautica.mjs [lat lng]
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const osmtogeojson = require('osmtogeojson');

const LAT = [36, 47], LNG = [6, 18];          // angoli sud-ovest dei riquadri (inclusi)
const OUT = 'nautica';
const SERVERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const UA = 'rotta-nautica (' + (process.env.GITHUB_REPOSITORY || 'local') + ')';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Fiumi, canali e zone umide solo entro 3 km dalla costa: quelli dell'entroterra non servono e peserebbero troppo.
   Segnali, lagune e secche ovunque (anche sui laghi). */
const query = (s, w, n, e) => `[out:json][timeout:300][bbox:${s},${w},${n},${e}];
way["natural"="coastline"]->.coast;
(
  way["waterway"~"^(river|canal|fairway|tidal_channel|dock)$"]["tunnel"!="culvert"]["boat"!="no"](around.coast:3000);
  way["seamark:type"="fairway"];
  relation["seamark:type"="fairway"];
  node["seamark:type"~"^(beacon_lateral|buoy_lateral|beacon_cardinal|buoy_cardinal|beacon_isolated_danger|buoy_isolated_danger|beacon_safe_water|buoy_safe_water|beacon_special_purpose|buoy_special_purpose|pile|light_major|light_minor|light_float|light_vessel|rock|wreck|obstruction|mooring|landmark|fog_signal)$"];
  node["man_made"="dolphin"];
  way["water"="lagoon"];
  relation["water"="lagoon"];
  way["natural"="wetland"](around.coast:3000);
  relation["natural"="wetland"](around.coast:3000);
  way["natural"="shoal"];
  relation["natural"="shoal"];
);
out body;
>;
out skel qt;`;

async function overpass(q) {
  const errs = [];
  for (let round = 1; round <= 4; round++) {
    for (const url of SERVERS) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 330000);
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA } });
        const txt = await r.text();
        clearTimeout(to);
        if (!r.ok) { errs.push(`${url}: ${r.status}`); continue; }
        const j = JSON.parse(txt);
        if (j.remark && /error|timed out|out of memory/i.test(j.remark)) { errs.push(`${url}: ${j.remark.slice(0, 80)}`); continue; }
        return j;
      } catch (e) { errs.push(`${url}: ${e.name === 'AbortError' ? 'timeout' : e.message}`); }
      await sleep(3000);
    }
    await sleep(round * 30000);
  }
  throw new Error(errs.slice(-3).join(' | '));
}

const round7 = c => typeof c[0] === 'number' ? [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7] : c.map(round7);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const idxPath = `${OUT}/index.json`;
  const old = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { tiles: [] };
  const oldById = new Map(old.tiles.map(t => [t.id, t]));
  const only = process.argv.length >= 4 ? [[+process.argv[2], +process.argv[3]]] : null;
  const cells = [];
  for (let la = LAT[0]; la <= LAT[1]; la++) for (let lo = LNG[0]; lo <= LNG[1]; lo++) cells.push([la, lo]);
  const tiles = [];
  let ok = 0, fail = 0;
  for (const [la, lo] of cells) {
    const id = `c_${la}_${lo}`;
    if (only && !(only[0][0] === la && only[0][1] === lo)) { if (oldById.has(id)) tiles.push(oldById.get(id)); continue; }
    const t0 = Date.now();
    try {
      const osm = await overpass(query(la, lo, la + 1, lo + 1));
      const gj = osmtogeojson(osm, { flatProperties: true });
      gj.features.forEach(f => { if (f.geometry) f.geometry.coordinates = round7(f.geometry.coordinates); });
      const n = gj.features.length;
      const tile = { id, s: la, w: lo, n: la + 1, e: lo + 1, count: n, file: n ? `${id}.geojson` : null };
      if (n) fs.writeFileSync(`${OUT}/${id}.geojson`, JSON.stringify({ type: 'FeatureCollection', features: gj.features }));
      else if (fs.existsSync(`${OUT}/${id}.geojson`)) fs.unlinkSync(`${OUT}/${id}.geojson`);
      if (n) tile.bytes = fs.statSync(`${OUT}/${id}.geojson`).size;
      tiles.push(tile); ok++;
      console.log(`${id}: ${n} oggetti${n ? ', ' + (tile.bytes / 1e6).toFixed(2) + ' MB' : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (e) {
      fail++;
      console.log(`${id}: NON SCARICATO (${e.message}) – resta la versione precedente`);
      if (oldById.has(id)) tiles.push(oldById.get(id));
    }
    await sleep(2000);
  }
  fs.writeFileSync(idxPath, JSON.stringify({ format: 'rotta-nautica-tiles-1', created: new Date().toISOString(), cell: 1, tiles }, null, 1));
  console.log(`Fatto: ${ok} riquadri aggiornati, ${fail} non scaricati.`);
  if (!ok) process.exit(1);
}
main();
