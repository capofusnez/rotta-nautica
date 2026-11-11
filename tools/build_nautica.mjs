// Scarica da OpenStreetMap/OpenSeaMap i dati nautici di tutta Italia (e coste vicine) a riquadri di 1° × 1°
// e li salva in nautica/c_<lat>_<lng>.geojson, con l'indice nautica/index.json.
// Lo esegue l'azione GitHub "Aggiorna dati nautici", una riga di latitudine per job, in parallelo.
// Uso:
//   node tools/build_nautica.mjs                 tutta l'Italia, in sequenza (lento: ore)
//   node tools/build_nautica.mjs <lat> <lng>     un solo riquadro
//   node tools/build_nautica.mjs --row <lat>     una riga di riquadri → parts/row_<lat>/ (per l'azione GitHub)
//   node tools/build_nautica.mjs --merge         unisce parts/row_*/ in nautica/ e rifà nautica/index.json
// Variabile BUDGET_MIN (minuti, facoltativa): oltre questo tempo non inizia nuovi riquadri,
// tiene le versioni precedenti e termina, così il job non viene mai interrotto a metà.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const LAT = [36, 47], LNG = [6, 18];          // angoli sud-ovest dei riquadri (inclusi)
const OUT = 'nautica';
const PARTS = 'parts';
const SERVERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const UA = 'rotta-nautica (' + (process.env.GITHUB_REPOSITORY || 'local') + ')';
const BUDGET_MS = process.env.BUDGET_MIN ? +process.env.BUDGET_MIN * 60000 : Infinity;
const START = Date.now();
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
  // piattaforme in mare e allevamenti di mitili / acquacoltura: da evitare
  nwr["man_made"="offshore_platform"];
  nwr["seamark:type"~"^(platform|marine_farm)$"];
  way["landuse"="aquaculture"];
  relation["landuse"="aquaculture"];
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
  for (let round = 1; round <= 3; round++) {
    for (const url of SERVERS) {
      if (Date.now() - START > BUDGET_MS) throw new Error('tempo a disposizione finito');
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

function readOldIndex() {
  const idxPath = `${OUT}/index.json`;
  const old = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { tiles: [] };
  return new Map(old.tiles.map(t => [t.id, t]));
}

function writeIndex(tiles) {
  tiles.sort((a, b) => a.s - b.s || a.w - b.w);
  fs.writeFileSync(`${OUT}/index.json`, JSON.stringify({ format: 'rotta-nautica-tiles-1', created: new Date().toISOString(), cell: 1, tiles }, null, 1));
}

/* Scarica le celle indicate in dir; restituisce le voci d'indice (per le celle non scaricate, quelle vecchie). */
async function fetchCells(cells, dir, oldById) {
  const osmtogeojson = require('osmtogeojson');
  fs.mkdirSync(dir, { recursive: true });
  const tiles = [];
  let ok = 0, fail = 0;
  for (const [la, lo] of cells) {
    const id = `c_${la}_${lo}`;
    const t0 = Date.now();
    try {
      if (Date.now() - START > BUDGET_MS) throw new Error('tempo a disposizione finito');
      const osm = await overpass(query(la, lo, la + 1, lo + 1));
      const gj = osmtogeojson(osm, { flatProperties: true });
      gj.features.forEach(f => { if (f.geometry) f.geometry.coordinates = round7(f.geometry.coordinates); });
      const n = gj.features.length;
      const tile = { id, s: la, w: lo, n: la + 1, e: lo + 1, count: n, file: n ? `${id}.geojson` : null };
      if (n) {
        fs.writeFileSync(`${dir}/${id}.geojson`, JSON.stringify({ type: 'FeatureCollection', features: gj.features }));
        tile.bytes = fs.statSync(`${dir}/${id}.geojson`).size;
      } else if (dir === OUT && fs.existsSync(`${OUT}/${id}.geojson`)) fs.unlinkSync(`${OUT}/${id}.geojson`);
      tiles.push(tile); ok++;
      console.log(`${id}: ${n} oggetti${n ? ', ' + (tile.bytes / 1e6).toFixed(2) + ' MB' : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (e) {
      fail++;
      console.log(`${id}: NON SCARICATO (${e.message}) – resta la versione precedente`);
      if (oldById.has(id)) tiles.push(oldById.get(id));
    }
    await sleep(2000);
  }
  console.log(`Fatto: ${ok} riquadri aggiornati, ${fail} non scaricati.`);
  return { tiles, ok };
}

/* Unisce i risultati delle righe (parts/row_<lat>/) in nautica/ e rifà l'indice. */
function merge() {
  const oldById = readOldIndex();
  const byId = new Map(oldById);
  fs.mkdirSync(OUT, { recursive: true });
  const rows = fs.existsSync(PARTS) ? fs.readdirSync(PARTS).filter(d => /^row_-?\d+$/.test(d)) : [];
  let updated = 0;
  for (const d of rows) {
    const dir = path.join(PARTS, d);
    const partFile = path.join(dir, 'part.json');
    if (!fs.existsSync(partFile)) { console.log(`${d}: part.json mancante, riga ignorata`); continue; }
    for (const t of JSON.parse(fs.readFileSync(partFile, 'utf8')).tiles) {
      const fresh = t.file ? fs.existsSync(path.join(dir, t.file)) : true;
      if (t.file && fresh) fs.copyFileSync(path.join(dir, t.file), path.join(OUT, t.file));
      if (!t.file && fs.existsSync(path.join(OUT, `${t.id}.geojson`))) fs.unlinkSync(path.join(OUT, `${t.id}.geojson`));
      if (fresh) updated++;
      byId.set(t.id, t);
    }
  }
  writeIndex([...byId.values()]);
  console.log(`Unite ${rows.length} righe: ${updated} riquadri, ${byId.size} nell'indice.`);
  if (!updated) process.exit(1);
}

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === '--merge') return merge();

  const oldById = readOldIndex();
  if (a[0] === '--row') {
    const la = +a[1];
    const cells = [];
    for (let lo = LNG[0]; lo <= LNG[1]; lo++) cells.push([la, lo]);
    const dir = path.join(PARTS, `row_${la}`);
    const { tiles } = await fetchCells(cells, dir, oldById);
    fs.writeFileSync(path.join(dir, 'part.json'), JSON.stringify({ row: la, tiles }));
    return;   // anche con 0 riquadri scaricati: le versioni precedenti restano valide
  }

  const cells = [];
  if (a.length >= 2) cells.push([+a[0], +a[1]]);
  else for (let la = LAT[0]; la <= LAT[1]; la++) for (let lo = LNG[0]; lo <= LNG[1]; lo++) cells.push([la, lo]);
  const { tiles, ok } = await fetchCells(cells, OUT, oldById);
  const byId = new Map(oldById);
  tiles.forEach(t => byId.set(t.id, t));
  writeIndex([...byId.values()]);
  if (!ok) process.exit(1);
}
main();
