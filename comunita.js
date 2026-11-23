/* Community di Rotta Nautica (Firebase, tramite flotta.js):
   - NOMI DEI RELITTI senza nome: ogni utente può dargli un nome per sé (nomi_privati/<utente>) e, se vuole, proporlo
     a tutti (proposte/<relitto>/<utente>). Un moderatore approva (relitti_nomi/<relitto>) o rifiuta.
   - RECENSIONI di marine, distributori, punti di fonda, zone di pesca e relitti: recensioni/<luogo>/<utente>,
     una per utente e per luogo, da 1 a 5 stelle con un testo. I moderatori possono cancellarle.
   - MODERATORI: moderatori/<utente> = true, si impostano solo dalla console di Firebase.
   Leggere nomi approvati e recensioni non richiede l'accesso; scrivere sì. */
(function () {
  'use strict';
  const F = () => window.Flotta;
  const key = id => String(id).replace(/[.#$\[\]\/]/g, '_');
  const LS = 'rn.nomiRelitti';
  let approved = {}, mine = {}, unMine = null, proposals = null, unProp = null;
  /* relitti segnalati dagli utenti: nuovi (relitti_utenti) e posizioni corrette (relitti_posizioni), già approvati;
     proposte in attesa (relitti_proposti/<utente>/<id>), le leggono i moderatori */
  let cw = { nuovi: {}, posizioni: {} }, wkProps = null, unWk = null, myWk = {}, unMyWk = null;
  const LSW = 'rn.relittiCommunity';
  try { cw = JSON.parse(localStorage.getItem(LSW) || 'null') || cw; } catch (e) { /* ignora */ }
  const subs = new Set(), emit = () => subs.forEach(f => { try { f(); } catch (e) { /* ignora */ } });
  try { approved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { approved = {}; }

  /* nomi approvati: si scaricano all'avvio (servono a tutti, anche senza accesso) e restano sul telefono per l'uso offline */
  function loadCw() {
    if (!F() || !F().available) return;
    Promise.all([F().pub('relitti_utenti'), F().pub('relitti_posizioni')]).then(([n, p]) => {
      cw = { nuovi: n || {}, posizioni: p || {} }; try { localStorage.setItem(LSW, JSON.stringify(cw)); } catch (e) { /* ignora */ }
      emit();
    }).catch(() => {});
  }
  function loadApproved() {
    if (!F() || !F().available) return;
    F().pub('relitti_nomi').then(v => {
      if (!v) return;
      approved = v; try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* ignora */ }
      emit();
    }).catch(() => {});
  }
  /* dopo l'accesso: i propri nomi privati e, per i moderatori, le proposte da approvare */
  function onAuth() {
    const f = F(); if (!f) return;
    if (unMine) { unMine(); unMine = null; } if (unProp) { unProp(); unProp = null; }
    if (unWk) { unWk(); unWk = null; } if (unMyWk) { unMyWk(); unMyWk = null; }
    mine = {}; proposals = null; wkProps = null; myWk = {};
    if (f.user) {
      unMine = f.dbWatch('nomi_privati/' + f.user.uid, v => { mine = v || {}; emit(); });
      unMyWk = f.dbWatch('relitti_proposti/' + f.user.uid, v => { myWk = v || {}; emit(); });
      if (f.isMod) {
        unProp = f.dbWatch('proposte', v => { proposals = v || {}; emit(); });
        unWk = f.dbWatch('relitti_proposti', v => { wkProps = v || {}; emit(); });
      }
    }
    emit();
  }
  let lastState = '';
  function hook() {
    const f = F(); if (!f) return;
    f.on(() => { const st = (f.user ? f.user.uid : '') + '|' + f.isMod; if (st !== lastState) { lastState = st; onAuth(); } });
    loadApproved(); loadCw();
  }

  const C = {
    key,
    on: f => { subs.add(f); return () => subs.delete(f); },
    /* nome da mostrare: il proprio, poi quello approvato dalla community */
    wreckName(w) { const k = key(w.id); return (mine[k] && mine[k].n) || (approved[k] && approved[k].n) || null; },
    nameInfo(w) { const k = key(w.id); return { mine: mine[k] ? mine[k].n : null, shared: mine[k] ? !!mine[k].s : false, approved: approved[k] ? approved[k] : null }; },
    async setName(w, name, share) {
      const f = F(); if (!f || !f.user) throw new Error('Per dare un nome a un relitto accedi con Google (Barca e account)');
      const k = key(w.id), n = String(name || '').trim().slice(0, 60);
      if (!n) { await f.dbRemove(`nomi_privati/${f.user.uid}/${k}`); await f.dbRemove(`proposte/${k}/${f.user.uid}`).catch(() => {}); return 'tolto'; }
      await f.dbSet(`nomi_privati/${f.user.uid}/${k}`, { n, s: !!share, t: f.stamp() });
      if (share) {
        await f.dbSet(`proposte/${k}/${f.user.uid}`, { n, id: String(w.id).slice(0, 40), u: (f.user.name || 'Utente').slice(0, 40), lat: +w.lat.toFixed(5), lng: +w.lng.toFixed(5), t: f.stamp() });
        return 'proposto';
      }
      await f.dbRemove(`proposte/${k}/${f.user.uid}`).catch(() => {});
      return 'privato';
    },
    /* moderazione */
    isMod: () => !!(F() && F().isMod),
    proposals: () => proposals,
    async approve(k, uid) {
      const f = F(), p = proposals && proposals[k] && proposals[k][uid]; if (!p) return;
      await f.dbSet(`relitti_nomi/${k}`, { n: p.n, da: p.u || 'utente', t: f.stamp() });
      await f.dbRemove(`proposte/${k}`);
      approved[k] = { n: p.n, da: p.u }; try { localStorage.setItem(LS, JSON.stringify(approved)); } catch (e) { /* ignora */ }
      emit();
    },
    reject: (k, uid) => F().dbRemove(`proposte/${k}/${uid}`),
    removeApproved: k => F().dbRemove(`relitti_nomi/${k}`).then(() => { delete approved[k]; try { localStorage.setItem(LS, JSON.stringify(approved)); } catch (e) { /* ignora */ } emit(); }),
    approvedNames: () => approved,
    /* recensioni */
    reviews: k => F() && F().available ? F().pub('recensioni/' + key(k)).then(v => v || {}) : Promise.resolve({}),
    async review(k, stars, text) {
      const f = F(); if (!f || !f.user) throw new Error('Per scrivere una recensione accedi con Google (Barca e account)');
      const s = Math.max(1, Math.min(5, Math.round(+stars)));
      await f.dbSet(`recensioni/${key(k)}/${f.user.uid}`, { s, txt: String(text || '').trim().slice(0, 500), n: (f.user.name || 'Utente').slice(0, 40), t: f.stamp() });
    },
    delReview: (k, uid) => F().dbRemove(`recensioni/${key(k)}/${uid}`),
    me: () => F() && F().user ? F().user : null,
    /* relitti della community */
    wrecks: () => cw,
    myWreckProps: () => myWk,
    wreckProposals: () => wkProps,
    async submitWreck(o) {
      const f = F(); if (!f || !f.user) throw new Error('Per segnalare un relitto accedi con Google (Barca e account)');
      const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const v = { tipo: o.tipo === 'posizione' ? 'posizione' : 'nuovo', lat: +(+o.lat).toFixed(6), lng: +(+o.lng).toFixed(6), anon: !!o.anon,
        u: (f.user.name || 'Utente').slice(0, 40), t: f.stamp() };
      if (o.id) v.id = String(o.id).slice(0, 40);
      if (o.n) v.n = String(o.n).trim().slice(0, 60);
      if (o.prof != null && isFinite(o.prof)) v.prof = Math.max(0, Math.min(1000, +o.prof));
      if (o.note) v.note = String(o.note).trim().slice(0, 500);
      await f.dbSet(`relitti_proposti/${f.user.uid}/${k}`, v);
      return k;
    },
    async approveWreck(uid, k) {
      const f = F(), p = wkProps && wkProps[uid] && wkProps[uid][k]; if (!p) return;
      const da = p.anon ? null : (p.u || null);
      if (p.tipo === 'posizione' && p.id) {
        await f.dbSet(`relitti_posizioni/${key(p.id)}`, Object.assign({ id: p.id, lat: p.lat, lng: p.lng, t: f.stamp() }, da ? { da } : {}));
      } else {
        const v = { lat: p.lat, lng: p.lng, t: f.stamp() };
        if (p.n) v.n = p.n; if (p.prof != null) v.prof = p.prof; if (p.note) v.note = p.note; if (da) v.da = da;
        await f.dbSet(`relitti_utenti/${uid}_${k}`, v);
      }
      await f.dbRemove(`relitti_proposti/${uid}/${k}`);
      loadCw();
    },
    rejectWreck: (uid, k) => F().dbRemove(`relitti_proposti/${uid}/${k}`),
    removeCommunityWreck: k => F().dbRemove(`relitti_utenti/${k}`).then(() => { delete cw.nuovi[k]; emit(); loadCw(); }),
    removeCommunityPos: k => F().dbRemove(`relitti_posizioni/${k}`).then(() => { delete cw.posizioni[k]; emit(); loadCw(); })
  };
  window.RNCom = C;
  if (document.readyState !== 'loading') hook(); else document.addEventListener('DOMContentLoaded', hook);
})();
