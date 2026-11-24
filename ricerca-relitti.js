/* Ricerca automatica delle notizie su un relitto (Wikipedia in italiano, poi in inglese).
   Cerca per nome e, intorno alla posizione, tra le voci con coordinate entro 10 km. Tiene solo voci che parlano
   di relitti, naufragi o navi affondate. Il risultato ha la stessa forma delle schede di relitti-storie.json:
   { titolo, intro, sezioni: [{ t, p: [..] }], fonti: [{ t, url }], auto: true, lang, km }
   window.RNWreckSearch.find({ n, lat, lng, wiki }) → Promise<scheda | null>  (null anche senza rete) */
(function () {
  'use strict';
  const LANGS = ['it', 'en'];
  const WK = /relitt|naufrag|affondat|affondò|affondament|sommergibil|sottomarin|piroscaf|incrociator|cacciatorpedinier|torpedinier|corazzat|motonave|mercantile|peschereccio|petroliera|dragamine|rimorchiator|\bnave\b|wreck|\bsank\b|\bsunk\b|scuttled|submarine|steamship|torpedoed|aereo precipitat|ammarag|ditched/i;
  const GENERIC = /^(relitto|relitti|aereo|nave|barca|peschereccio|wreck|relitto \d+|senza nome)$/i;
  const SKIP = /^(note|bibliografia|voci correlate|collegamenti esterni|altri progetti|riferimenti|fonti|references|notes|see also|external links|further reading|bibliography|sources|galleria|gallery|filmografia|curiosità)$/i;
  const CACHE = 'rn.wkr.';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
  const dist = (a, b) => {
    const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const api = async (lang, params) => {
    const q = new URLSearchParams(Object.assign({ action: 'query', format: 'json', formatversion: '2', origin: '*' }, params));
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
    try { const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?${q}`, { signal: ctl.signal }); return r.ok ? r.json() : null; }
    finally { clearTimeout(to); }
  };
  const PROPS = { prop: 'coordinates|extracts|pageprops', exintro: '1', explaintext: '1', exlimit: '20', ppprop: 'disambiguation', colimit: 'max' };

  function score(pg, o) {
    if (!pg || (pg.pageprops && 'disambiguation' in pg.pageprops)) return -99;
    const txt = (pg.title || '') + ' ' + (pg.extract || '');
    let s = 0;
    const wreck = WK.test(txt); if (wreck) s += 3; else s -= 4;
    const nm = o.n && !GENERIC.test(o.n.trim()) ? norm(o.n).split(' ').filter(w => w.length > 2 && !/^(relitto|nave|wreck|the|del|della)$/.test(w)) : [];
    if (nm.length) { const t = norm(pg.title), x = norm(pg.extract); if (nm.every(w => t.includes(w))) s += 5; else if (nm.every(w => x.includes(w))) s += 2; }
    const c = pg.coordinates && pg.coordinates[0];
    let km = null;
    if (c && isFinite(o.lat)) {
      km = dist(o, { lat: c.lat, lng: c.lon });
      s += km < 1.5 ? 4 : km < 5 ? 3 : km < 15 ? 1 : km < 60 ? 0 : -3;
    }
    return { s, km, wreck, nameHit: nm.length > 0 && s >= 5 };
  }

  async function candidates(lang, o) {
    const out = [];
    const add = j => { ((j && j.query && j.query.pages) || []).forEach(p => out.push(p)); };
    const nm = o.n && !GENERIC.test(o.n.trim()) ? o.n.trim() : '';
    const jobs = [];
    if (nm) jobs.push(api(lang, Object.assign({ generator: 'search', gsrsearch: `${nm} ${lang === 'it' ? 'relitto OR nave OR affondata' : 'wreck OR ship OR sank'}`, gsrlimit: '6' }, PROPS)).then(add).catch(() => {}));
    if (isFinite(o.lat)) jobs.push(api(lang, Object.assign({ generator: 'geosearch', ggscoord: `${o.lat}|${o.lng}`, ggsradius: '10000', ggslimit: '20' }, PROPS)).then(add).catch(() => {}));
    await Promise.all(jobs);
    return out;
  }

  /* testo completo della voce, diviso nei suoi paragrafi "== Titolo ==" */
  async function story(lang, title, km) {
    const j = await api(lang, { prop: 'extracts', explaintext: '1', exsectionformat: 'wiki', titles: title, redirects: '1' });
    const pg = j && j.query && j.query.pages && j.query.pages[0]; if (!pg || !pg.extract) return null;
    const blocks = pg.extract.split(/\n(?===+ )/);
    const paras = t => t.split(/\n+/).map(x => x.trim()).filter(x => x.length > 40);
    const intro = paras(blocks.shift() || '').slice(0, 2).join(' ').slice(0, 900);
    const sezioni = [];
    for (const b of blocks) {
      const m = /^(=+)\s*(.+?)\s*\1\s*\n?([\s\S]*)$/.exec(b); if (!m) continue;
      if (m[1].length > 2 || SKIP.test(m[2])) continue;            // solo i titoli principali
      const p = paras(m[3]).slice(0, 3).map(x => x.length > 700 ? x.slice(0, 700).replace(/\s+\S*$/, '') + '…' : x);
      if (p.length) sezioni.push({ t: m[2], p });
      if (sezioni.length >= 4) break;
    }
    if (!intro && !sezioni.length) return null;
    const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`;
    return { titolo: pg.title, intro, sezioni, fonti: [{ t: `Wikipedia (${lang}): ${pg.title}`, url }], auto: true, lang, km: km != null ? Math.round(km * 10) / 10 : null };
  }

  async function find(o) {
    o = Object.assign({}, o); o.lat = +o.lat; o.lng = +o.lng;
    const key = CACHE + norm(o.n || '').slice(0, 40) + '|' + (isFinite(o.lat) ? o.lat.toFixed(3) + ',' + o.lng.toFixed(3) : '') + '|' + (o.wiki || '');
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 30 * 864e5) return c.v; } catch (e) { /* ignora */ }
    if (!navigator.onLine) return null;
    let best = null;
    try {
      /* voce indicata nei dati (tag wikipedia=it:...) */
      const m = /^([a-z]{2,3}):(.+)$/.exec(o.wiki || '');
      if (m) best = await story(m[1], m[2], null);
      for (const lang of LANGS) {
        if (best) break;
        const list = await candidates(lang, o), seen = new Set();
        let top = null;
        for (const pg of list) {
          if (seen.has(pg.pageid)) continue; seen.add(pg.pageid);
          const sc = score(pg, o); if (!sc.wreck || sc.s < 5) continue;
          if (!top || sc.s > top.sc.s) top = { pg, sc };
        }
        if (top) best = await story(lang, top.pg.title, top.sc.km);
      }
    } catch (e) { return null; }   // rete assente o lenta: si riprova la prossima volta
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: best })); } catch (e) { /* spazio pieno */ }
    return best;
  }

  /* versione compatta da salvare con la segnalazione (al massimo circa 6000 caratteri) */
  function pack(st) {
    if (!st) return null;
    const c = { titolo: st.titolo, intro: st.intro, sezioni: (st.sezioni || []).map(s => ({ t: s.t, p: s.p.slice(0, 2) })), fonti: st.fonti, auto: true, lang: st.lang };
    let s = JSON.stringify(c);
    while (s.length > 6000 && c.sezioni.length) { c.sezioni.pop(); s = JSON.stringify(c); }
    if (s.length > 6000) { c.intro = c.intro.slice(0, 600); c.sezioni = []; s = JSON.stringify(c); }
    return s;
  }
  const unpack = s => { try { const o = typeof s === 'string' ? JSON.parse(s) : s; return o && o.titolo ? o : null; } catch (e) { return null; } };

  window.RNWreckSearch = { find, pack, unpack };
})();
