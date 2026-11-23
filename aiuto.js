/* Aiuto, avvio e condizioni d'uso:
   - "i" accanto ai dati di Bordo, ai livelli della carta e ai dati della barca: un tocco apre la spiegazione;
   - schermata di avvio (splash) mentre l'app si prepara;
   - al primo avvio (e a ogni nuova versione delle condizioni) bisogna accettare Condizioni d'uso e Informativa privacy
     (testo completo in privacy.html). */
(function () {
  'use strict';
  const TERMS_VER = '2026-11-23b', LS = 'rn.terms';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- spiegazioni ---------- */
  const INFO = {
    'd-sog': ['Velocità (SOG)', 'La velocità vera rispetto al fondo, misurata dal GPS, in nodi (1 nodo = 1,852 km/h). Con la corrente può essere diversa dalla velocità sull\'acqua.'],
    'd-cog': ['Direzione (COG)', 'La direzione in cui ti stai davvero muovendo, in gradi dal nord (0° nord, 90° est, 180° sud, 270° ovest). Non è la direzione della prua: con vento o corrente possono essere diverse.'],
    'd-coast': ['Distanza dalla costa', 'Distanza dalla riva più vicina, isole comprese, calcolata dai dati di profondità EMODnet (celle di circa 115 m). È indicativa e serve per rispettare i limiti di distanza dalla costa della patente e della marcatura CE. Con il GPS spento è calcolata dal centro della carta.'],
    'd-depth': ['Fondale (EMODnet)', 'Profondità indicativa nel punto, dalla media dei dati EMODnet su celle di circa 115 m. Non è un ecoscandaglio: vicino a riva, in laguna e sui banchi la profondità vera può essere molto diversa.'],
    'd-brg': ['Rilevamento del punto', 'La direzione, in gradi, dal punto in cui sei al prossimo punto della rotta.'],
    'd-dtw': ['Distanza dal punto', 'Distanza in linea retta dal prossimo punto della rotta.'],
    'd-xte': ['Fuori rotta (XTE)', 'Di quanto sei spostato di lato rispetto alla linea della rotta, e da che parte. Vicino a zero vuol dire che sei sulla rotta.'],
    'd-vmg': ['VMG', 'La parte della tua velocità che ti avvicina davvero al punto. Se la prua non punta verso il punto è più bassa della velocità.'],
    'd-ttg': ['Tempo al punto', 'Quanto manca per arrivare al prossimo punto, alla velocità attuale.'],
    'd-eta': ['Arrivo al punto', 'Ora prevista di arrivo al prossimo punto, alla velocità attuale.'],
    'd-rem': ['Distanza rimanente', 'Quanto manca fino all\'arrivo, seguendo tutta la rotta.'],
    'd-fin': ['Arrivo finale', 'Ora prevista di arrivo alla destinazione finale, alla velocità attuale.'],
    'd-pos': ['Posizione', 'Latitudine e longitudine attuali dal GPS.'],
    'd-trip': ['Percorso', 'Distanza percorsa in questa uscita.'],
    'd-time': ['Tempo', 'Tempo trascorso in questa uscita.'],
    'd-avg': ['Media', 'Velocità media in questa uscita.'],
    'd-max': ['Massima', 'Velocità più alta raggiunta in questa uscita.'],
    'd-acc': ['Precisione GPS', 'Il margine di errore della posizione stimato dal telefono. Sotto i 10 m è buona; sopra i 30 m posizione, distanze e velocità sono poco affidabili.'],
    'd-wind': ['Vento', 'Vento previsto adesso in questo punto (Open-Meteo): velocità in nodi e direzione da cui soffia.'],
    'd-gust': ['Raffica', 'Le raffiche previste, cioè i colpi di vento più forti: possono essere molto più forti del vento medio.'],
    'd-wave': ['Onda', 'Altezza significativa dell\'onda prevista (Open-Meteo Marine): è la media del terzo delle onde più alte. Singole onde possono arrivare quasi al doppio.'],
    'd-pres': ['Pressione', 'Pressione atmosferica prevista. Se scende in fretta (più di 3 hPa in 3 ore) di solito sta arrivando brutto tempo.'],
    'd-anc': ['Deriva ancora', 'Distanza dal punto in cui hai dato fondo. Con l\'allarme ancora acceso l\'app ti avvisa se superi il raggio scelto.'],
    'd-utc': ['Ora UTC', 'L\'ora universale usata nei bollettini meteo e nelle comunicazioni radio. In Italia è un\'ora indietro (due con l\'ora legale).'],
    lSea: ['Segnali nautici', 'Boe, fari, mede e altri segnali di OpenSeaMap, mappati da volontari. Toccali per vedere colore, luce e significato. Possono mancare o essere spostati: guarda sempre i segnali veri.'],
    lBathy: ['Profondità', 'Colora il mare in base alla profondità (EMODnet). È indicativa e non sostituisce le carte nautiche ufficiali.'],
    lIso: ['Linee batimetriche', 'Linee che uniscono i punti con la stessa profondità (2, 5, 10, 20, 50 m…), calcolate sul telefono dai dati EMODnet. Sono indicative.'],
    lTrack: ['Traccia', 'Disegna sulla carta la linea del percorso fatto, registrata dal GPS.'],
    lAis: ['Traffico navale (AIS)', 'Mostra il pulsante per vedere le navi in tempo reale da un servizio esterno. Molte barche da diporto non hanno l\'AIS: non usarlo per evitare le collisioni.'],
    lEnc: ['Carte ENC', 'Carte nautiche elettroniche con profondità, costa e segnali, dove sono disponibili.'],
    lPkgWifi: ['Solo con il Wi-Fi', 'Il pacchetto dati per usare l\'app senza rete è grande: con questa opzione si scarica solo quando sei collegato al Wi-Fi.'],
    sBoat: ['Mezzo', 'Il tipo di barca: serve per i limiti di navigazione e per calcolare la rotta.'],
    sHp: ['Potenza del motore', 'Potenza totale dei motori. In Italia oltre 40,8 CV (30 kW) serve la patente nautica.'],
    sLen: ['Lunghezza', 'Lunghezza fuori tutto. Fino a 10 m la barca è un natante, da 10 a 24 m un\'imbarcazione.'],
    sLic: ['Patente nautica', 'Il tipo di patente che hai: l\'app la usa per avvisarti quando ti allontani dalla costa oltre il consentito.'],
    sCe: ['Marcatura CE', 'La categoria di progettazione CE della barca (A, B, C, D) indica vento e onde per cui è costruita, e quindi quanto puoi allontanarti dalla costa.'],
    sDraft: ['Pescaggio', 'Quanto la barca va sotto il livello dell\'acqua. La rotta cerca di evitare i fondali più bassi di questo valore.'],
    sSpd: ['Velocità massima', 'Se la superi l\'app ti avvisa: utile nei canali e vicino a riva, dove ci sono limiti di velocità.']
  };
  function addI(el, k) {
    if (!el || el.querySelector(':scope > .iBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'iBtn'; b.dataset.info = k; b.setAttribute('aria-label', 'Spiegazione: ' + INFO[k][0]); b.textContent = 'i';
    el.appendChild(b);
  }
  function attach() {
    Object.keys(INFO).forEach(k => {
      const t = $(k); if (!t) return;
      if (k.startsWith('d-')) addI(t.parentElement.querySelector('.lbl'), k);   // casella di Bordo: accanto all'etichetta
      else { const lab = t.closest('label'); if (lab) addI(lab, k); }
    });
  }
  function showInfo(k) {
    const v = INFO[k]; if (!v) return;
    const box = $('infoPop');
    box.querySelector('h3').textContent = v[0]; box.querySelector('p').textContent = v[1];
    box.hidden = false; box.querySelector('button').focus();
  }
  /* il tocco sulla "i" non deve spuntare la casella della riga */
  document.addEventListener('click', e => {
    const b = e.target.closest('.iBtn');
    if (b) { e.preventDefault(); e.stopPropagation(); showInfo(b.dataset.info); return; }
    if (e.target.id === 'infoPop' || e.target.closest('[data-info-close]')) $('infoPop').hidden = true;
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('infoPop') && !$('infoPop').hidden) $('infoPop').hidden = true; });

  /* ---------- condizioni d'uso ---------- */
  const accepted = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && v.v === TERMS_VER; } catch (e) { return false; } };
  function showTerms() {
    const t = $('terms'); if (!t) return;
    t.hidden = false;
    const ck = $('termsCk'), ok = $('termsOk');
    ck.onchange = () => { ok.disabled = !ck.checked; };
    ok.onclick = () => {
      if (!ck.checked) return;
      try { localStorage.setItem(LS, JSON.stringify({ v: TERMS_VER, t: Date.now() })); } catch (e) { /* senza memoria si richiede al prossimo avvio */ }
      t.classList.add('out'); setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 300);
    };
  }
  window.rnShowTerms = () => { $('termsCk').checked = false; $('termsOk').disabled = true; showTerms(); };

  /* ---------- schermata di avvio ---------- */
  const t0 = performance.now();
  function endSplash() {
    const s = $('splash'); if (!s || s.dataset.done) return;
    s.dataset.done = '1';
    const wait = Math.max(0, 1400 - (performance.now() - t0));
    setTimeout(() => {
      s.classList.add('out');
      setTimeout(() => { s.remove(); if (!accepted()) showTerms(); }, 450);
    }, wait);
  }
  function boot() { attach(); if (document.readyState === 'complete') endSplash(); else window.addEventListener('load', endSplash); setTimeout(endSplash, 6000); }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
  window.rnInfo = { INFO, attach };
})();
