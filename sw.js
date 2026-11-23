/* Service worker: l'app e le tiles della carta già viste restano disponibili senza rete. */
const SHELL_CACHE = 'rn-shell-v60';
const TILE_CACHE = 'rn-tiles-v2';
const SHELL = ['./', 'index.html', 'app.js', 'water.js', 'channels.js', 'enc.js', 'seamarks.js', 'firebase-config.js', 'flotta.js', 'comunita.js', 'aiuto.js', 'privacy.html', 'pro-config.js', 'pubblicita.js', 'catalogo.js', 'checklist.js', 'traffico.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const EXTERNAL = /(tile\.openstreetmap\.org|tiles\.openseamap\.org|server\.arcgisonline\.com|ows\.emodnet-bathymetry\.eu|unpkg\.com)$/;
const MAX_TILES = 4000;
let puts = 0;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== TILE_CACHE && k !== 'rn-data' && k !== 'rn-route-tiles').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  if (++puts % 50) return;
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (EXTERNAL.test(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async cache => {
      const hit = await cache.match(req);
      /* una tile salvata senza CORS non può essere letta dal calcolo della rotta */
      if (hit && !(hit.type === 'opaque' && req.mode === 'cors')) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cache); }
        return res;
      } catch (err) {
        return Response.error();
      }
    }));
    return;
  }

  /* dati nautici e profondità: li salva e li aggiorna l'app (pacchetto dati). Qui non si toccano, altrimenti
     resterebbe per sempre la prima copia scaricata */
  if (url.origin === self.location.origin && /\/(nautica|depth)\//.test(url.pathname)) return;

  if (url.origin === self.location.origin) {
    /* prima la rete (così un aggiornamento del sito arriva subito), la copia salvata se manca la rete
       o se la risposta tarda più di 3 secondi */
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
        return res;
      });
      const fallback = () => hit || caches.match('index.html');
      if (!hit) return net.catch(fallback);
      return Promise.race([net.catch(fallback), new Promise(r => setTimeout(() => r(hit), 3000))]);
    }));
  }
});
