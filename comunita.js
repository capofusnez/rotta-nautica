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
  const subs = new Set(), emit = () => subs.forEach(f => { try { f(); } catch (e) { /* ignora */ } });
  try { approved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { approved = {}; }

  /* nomi approvati: si scaricano all'avvio (servono a tutti, anche senza accesso) e restano sul telefono per l'uso offline */
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
    mine = {}; proposals = null;
    if (f.user) {
      unMine = f.dbWatch('nomi_privati/' + f.user.uid, v => { mine = v || {}; emit(); });
      if (f.isMod) unProp = f.dbWatch('proposte', v => { proposals = v || {}; emit(); });
    }
    emit();
  }
  let lastState = '';
  function hook() {
    const f = F(); if (!f) return;
    f.on(() => { const st = (f.user ? f.user.uid : '') + '|' + f.isMod; if (st !== lastState) { lastState = st; onAuth(); } });
    loadApproved();
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
    removeApproved: k => F().dbRemove(`relitti_nomi/${k}`).then(() => { delete approved[k]; emit(); }),
    /* recensioni */
    reviews: k => F() && F().available ? F().pub('recensioni/' + key(k)).then(v => v || {}) : Promise.resolve({}),
    async review(k, stars, text) {
      const f = F(); if (!f || !f.user) throw new Error('Per scrivere una recensione accedi con Google (Barca e account)');
      const s = Math.max(1, Math.min(5, Math.round(+stars)));
      await f.dbSet(`recensioni/${key(k)}/${f.user.uid}`, { s, txt: String(text || '').trim().slice(0, 500), n: (f.user.name || 'Utente').slice(0, 40), t: f.stamp() });
    },
    delReview: (k, uid) => F().dbRemove(`recensioni/${key(k)}/${uid}`),
    me: () => F() && F().user ? F().user : null
  };
  window.RNCom = C;
  if (document.readyState !== 'loading') hook(); else document.addEventListener('DOMContentLoaded', hook);
})();
