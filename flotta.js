/* Flotta: chi usa Rotta Nautica e ha fatto l'accesso con Google vede sulla carta le altre barche collegate.
   Servizio: Firebase (Authentication con Google + Realtime Database), configurato in firebase-config.js.
   Sul sito l'accesso usa la finestra di Google; nell'APK Google non permette l'accesso dentro l'app, quindi lo fa
   il componente nativo @capacitor-firebase/authentication e qui arriva solo il "biglietto" (idToken) da usare.
   Dati salvati per ogni barca in flotta/<id utente>: nome scelto, tipo di mezzo, posizione, rotta, velocità, ora.
   La posizione si invia solo con la condivisione accesa e si cancella da sola quando l'app si chiude o perde la rete. */
(function () {
  'use strict';
  const VER = '10.14.1', CDN = `https://www.gstatic.com/firebasejs/${VER}/`;
  const CFG = window.RN_FIREBASE || {};
  const MAX_AGE = 10 * 60e3;          // oltre 10 minuti senza aggiornamenti la barca sparisce
  const SEND_MIN = 10e3, SEND_MAX = 30e3, SEND_MOVE = 40; // invio: almeno ogni 30 s, prima se ti sei spostato di 40 m
  const cap = window.Capacitor;
  const native = !!(cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.platform && cap.platform !== 'web'));

  const F = {
    available: !!(CFG.apiKey && CFG.databaseURL && CFG.projectId && CFG.appId),
    user: null, sharing: false, error: null, loading: false, isMod: false
  };
  let fb = null, loadP = null, auth = null, db = null, offset = 0, unsub = [], lastSent = null, meRef = null, cur = null;
  let poiCb = null, poiUnsub = null, modUnsub = null;
  const others = new Map(), listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(F); } catch (e) { /* ignora */ } });
  const now = () => Date.now() + offset;
  const dist = (a, b) => {
    const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const plugin = () => cap && ((cap.Plugins && cap.Plugins.FirebaseAuthentication) || (cap.registerPlugin && cap.registerPlugin('FirebaseAuthentication')));

  /* il codice di Firebase si scarica solo quando serve (accesso già fatto o tocco su "Accedi") */
  function load() {
    if (!F.available) return Promise.reject(new Error('Condivisione non ancora configurata'));
    if (loadP) return loadP;
    F.loading = true; emit();
    loadP = Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-database.js'].map(f => import(CDN + f)))
      .then(([app, a, d]) => {
        const fa = app.initializeApp(CFG);
        auth = native ? a.initializeAuth(fa, { persistence: [a.indexedDBLocalPersistence, a.browserLocalPersistence] }) : a.getAuth(fa);
        auth.languageCode = 'it';
        db = d.getDatabase(fa);
        fb = { a, d };
        d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
        a.onAuthStateChanged(auth, u => {
          F.user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null;
          F.loading = false; F.isMod = false;
          if (modUnsub) { modUnsub(); modUnsub = null; }
          /* moderatore: si controlla a ogni avvio e resta in ascolto, così aggiungere o togliere un moderatore vale subito */
          if (u) { listen(); listenPois(); modUnsub = d.onValue(d.ref(db, 'moderatori/' + u.uid), s => { const m = s.val() === true; if (m !== F.isMod) { F.isMod = m; emit(); } }, () => { if (F.isMod) { F.isMod = false; emit(); } }); }
          else { quiet(); others.clear(); if (poiUnsub) { poiUnsub(); poiUnsub = null; } }
          emit();
        });
        return fb;
      })
      .catch(e => { loadP = null; F.loading = false; F.error = 'Servizio non raggiungibile: controlla la connessione'; emit(); throw e; });
    return loadP;
  }

  function listen() {
    quiet();
    const { d } = fb;
    const q = d.query(d.ref(db, 'flotta'), d.orderByChild('t'), d.startAt(now() - MAX_AGE));
    const put = s => {
      const v = s.val();
      if (!F.user || s.key === F.user.uid || !v || !isFinite(v.lat) || !isFinite(v.lng)) return;
      others.set(s.key, { id: s.key, name: String(v.n || 'Barca').slice(0, 30), boat: v.b || '', lat: v.lat, lng: v.lng,
        cog: isFinite(v.c) ? v.c : null, sog: isFinite(v.v) ? v.v : null, t: +v.t || 0 });
      emit();
    };
    unsub = [d.onChildAdded(q, put), d.onChildChanged(q, put),
      d.onChildRemoved(q, s => { if (others.delete(s.key)) emit(); }, () => { F.error = 'Accesso ai dati negato'; emit(); })];
  }
  /* punti personali (pesca, fonda...): privati, in punti/<id utente>, li legge e scrive solo il proprietario */
  function listenPois() {
    if (poiUnsub) { poiUnsub(); poiUnsub = null; }
    if (!fb || !F.user || !poiCb) return;
    const { d } = fb;
    poiUnsub = d.onValue(d.ref(db, 'punti/' + F.user.uid), s => poiCb(s.val() || {}), () => { F.error = 'Punti salvati: accesso ai dati negato'; emit(); });
  }
  function quiet() { unsub.forEach(u => { try { u(); } catch (e) { /* ignora */ } }); unsub = []; }

  /* invio della propria posizione (chiamata a ogni posizione GPS) */
  function send(force) {
    if (!fb || !F.user || !F.sharing || !cur) return;
    const t = Date.now();
    if (!force && lastSent) {
      const dt = t - lastSent.t, moved = dist(lastSent, cur);
      if (dt < SEND_MIN || (dt < SEND_MAX && moved < SEND_MOVE)) return;
    }
    const { d } = fb;
    if (!meRef) { meRef = d.ref(db, 'flotta/' + F.user.uid); d.onDisconnect(meRef).remove(); }
    const p = cur;
    const v = { n: (p.name || 'Barca').slice(0, 30), b: (p.boat || '').slice(0, 20), lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), t: d.serverTimestamp() };
    if (isFinite(p.cog)) v.c = Math.round(((p.cog % 360) + 360) % 360);
    if (isFinite(p.sog)) v.v = Math.round(Math.min(p.sog, 99) * 10) / 10;
    lastSent = { lat: p.lat, lng: p.lng, t };
    d.set(meRef, v).then(() => { if (F.error) { F.error = null; emit(); } })
      .catch(() => { F.error = 'Posizione non inviata: permesso negato dal server'; emit(); });
  }
  function unshare() {
    lastSent = null;
    if (fb && meRef) { const { d } = fb; d.onDisconnect(meRef).cancel(); d.remove(meRef).catch(() => {}); }
    meRef = null;
  }

  F.onPois = cb => { poiCb = cb; listenPois(); };
  F.putPoi = p => {
    if (!fb || !F.user) return Promise.resolve(false);
    const v = {}; Object.keys(p).forEach(k => { if (p[k] != null && p[k] !== '') v[k] = p[k]; });
    return fb.d.set(fb.d.ref(db, `punti/${F.user.uid}/${p.id}`), v).then(() => true);
  };
  F.on = f => { listeners.add(f); return () => listeners.delete(f); };
  /* dati della community (comunita.js): nomi dei relitti, proposte da moderare, recensioni.
     pub: lettura pubblica senza accesso (API REST del database), per chi non ha fatto l'accesso o è offline. */
  F.pub = path => fetch(`${CFG.databaseURL}/${path}.json`).then(r => r.ok ? r.json() : null);
  F.dbSet = (path, v) => { if (!fb || !F.user) return Promise.reject(new Error('Serve l\'accesso con Google')); return fb.d.set(fb.d.ref(db, path), v); };
  F.dbRemove = path => { if (!fb || !F.user) return Promise.reject(new Error('Serve l\'accesso con Google')); return fb.d.remove(fb.d.ref(db, path)); };
  F.dbWatch = (path, cb) => { if (!fb || !F.user) return () => {}; return fb.d.onValue(fb.d.ref(db, path), s => cb(s.val()), () => cb(null)); };
  F.stamp = () => fb ? fb.d.serverTimestamp() : Date.now();
  /* all'avvio: se l'accesso era già stato fatto, si ricollega da solo */
  F.init = wasIn => { if (F.available && wasIn) load().catch(() => {}); };
  F.login = async () => {
    F.error = null;
    const { a } = await load();
    if (native) {
      const P = plugin();
      if (!P || !P.signInWithGoogle) throw new Error('Accesso con Google non disponibile in questa versione dell\'app');
      const r = await P.signInWithGoogle();
      const tok = r && r.credential && r.credential.idToken;
      if (!tok) throw new Error('Accesso annullato');
      await a.signInWithCredential(auth, a.GoogleAuthProvider.credential(tok));
    } else {
      const pr = new a.GoogleAuthProvider();
      pr.setCustomParameters({ prompt: 'select_account' });
      try { await a.signInWithPopup(auth, pr); }
      catch (e) {
        if (e && e.code === 'auth/popup-blocked') return a.signInWithRedirect(auth, pr);
        if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) throw new Error('Accesso annullato');
        if (e && e.code === 'auth/unauthorized-domain') throw new Error('Dominio non autorizzato: aggiungilo in Firebase → Authentication → Impostazioni');
        throw e;
      }
    }
  };
  F.logout = async () => {
    unshare(); F.sharing = false;
    if (native) { const P = plugin(); if (P && P.signOut) await P.signOut().catch(() => {}); }
    if (fb) await fb.a.signOut(auth);
  };
  F.share = on => { F.sharing = !!on; if (on) send(true); else unshare(); emit(); };
  /* p: { lat, lng, cog, sog, name, boat } */
  F.update = p => { cur = p; send(false); };
  F.rename = () => send(true);
  F.list = () => { const lim = now() - MAX_AGE; return [...others.values()].filter(o => o.t > lim); };
  F.age = o => Math.max(0, now() - o.t);
  window.Flotta = F;
})();
