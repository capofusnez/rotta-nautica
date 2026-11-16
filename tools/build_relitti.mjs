// Elenco dei relitti per l'app (relitti.json), ricavato dai dati nautici già scaricati in nautica/*.geojson.
// Lo esegue l'azione GitHub "Aggiorna dati nautici" dopo l'unione dei riquadri; a mano: node tools/build_relitti.mjs
// Fonte: OpenStreetMap / OpenSeaMap (seamark:type=wreck, historic=wreck). Posizioni e profondità sono quelle mappate
// dai volontari: indicative, da verificare prima di un'immersione.
import fs from 'fs';

const DIR = 'nautica', OUT = 'relitti.json';
const num = v => { if (v == null) return null; const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Math.abs(+m[0]) : null; };
const first = (t, keys) => { for (const k of keys) if (t[k] != null && t[k] !== '') return t[k]; return null; };

const seen = new Map();
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.geojson')).sort()) {
  const gj = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  for (const ft of gj.features) {
    const t = ft.properties || {}, g = ft.geometry;
    if (!g || (t['seamark:type'] !== 'wreck' && t.historic !== 'wreck')) continue;
    const id = t.id || ft.id;
    if (!id || seen.has(id)) continue;
    let c = null;
    if (g.type === 'Point') c = g.coordinates;
    else { const all = JSON.stringify(g.coordinates).match(/-?\d+\.\d+,-?\d+\.\d+/g) || []; if (all.length) c = all[0].split(',').map(Number); }
    if (!c) continue;
    const dive = t.sport === 'scuba_diving' || Object.keys(t).some(k => k.startsWith('scuba_diving')) || t.tourism === 'attraction';
    const depth = num(first(t, ['scuba_diving:depth', 'wreck:depth', 'seamark:wreck:depth', 'depth']));
    const maxDepth = num(first(t, ['scuba_diving:maxdepth', 'maxdepth']));
    const r = {
      id, lat: +c[1].toFixed(6), lng: +c[0].toFixed(6),
      name: first(t, ['name:it', 'name', 'seamark:name', 'wreck:name']),
      depth: depth && depth < 500 ? depth : null,
      maxDepth: maxDepth && maxDepth < 500 ? maxDepth : null,
      sunk: first(t, ['wreck:date_sunk', 'start_date']),
      type: first(t, ['wreck:type', 'wreck:cargo']),
      cat: first(t, ['seamark:wreck:category']),             // dangerous / non-dangerous / mast_showing / hull_showing...
      level: first(t, ['seamark:wreck:water_level']),
      visible: t['wreck:visible_at_low_tide'] === 'yes' || t['wreck:visible_at_high_tide'] === 'yes' || null,
      dive: dive || null,
      web: first(t, ['website', 'url', 'contact:website']),
      wiki: first(t, ['wikipedia']),
      note: first(t, ['description:it', 'description', 'note'])
    };
    Object.keys(r).forEach(k => { if (r[k] == null) delete r[k]; });
    seen.set(id, r);
  }
}
const list = [...seen.values()].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
fs.writeFileSync(OUT, JSON.stringify({ format: 'rotta-nautica-relitti-1', created: new Date().toISOString(), source: 'OpenStreetMap / OpenSeaMap', items: list }));
console.log(`${OUT}: ${list.length} relitti, ${list.filter(r => r.name).length} con nome, ${list.filter(r => r.dive).length} siti d'immersione, ${list.filter(r => r.depth).length} con profondità`);
