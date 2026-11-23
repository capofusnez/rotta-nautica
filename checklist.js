/* Check-list di bordo: pre partenza, navigazione, rientro e spegnimento, manutenzione.
   Le voci vengono proposte in base al tipo di barca e di motore; ogni voce si può modificare, cancellare o aggiungere.
   Ogni check-list completata diventa un report con data, ore motore e voci fatte o saltate.
   Le manutenzioni hanno un intervallo in ore motore e/o in mesi: l'app avvisa quando sono vicine o scadute.
   Gli intervalli proposti sono indicativi: fanno fede il libretto di uso e manutenzione del motore e il tuo meccanico.
   Tutto è salvato sul telefono (localStorage 'rn.ck'); si può esportare e reimportare una copia. */
(function () {
  'use strict';
  const KEY = 'rn.ck';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  const toast = m => (window.rnToast ? window.rnToast(m) : console.log(m));
  const DAY = 864e5;

  const LISTS = {
    pre: { t: 'Pre partenza', s: 'Prima di mollare gli ormeggi' },
    nav: { t: 'Navigazione', s: 'Controlli da ripetere in mare' },
    rit: { t: 'Rientro e spegnimento', s: 'In porto, prima di lasciare la barca' },
    man: { t: 'Manutenzione', s: 'Scadenze a ore motore e a mesi' }
  };
  const KIND = { motore: 'Barca a motore', gommone: 'Gommone', vela: 'Barca a vela', moto: 'Moto d\'acqua', remi: 'Canoa, kayak, SUP' };
  const ENG = {
    fb4: 'Fuoribordo 4 tempi', fb2: 'Fuoribordo 2 tempi', efbB: 'Entrofuoribordo a benzina', efbD: 'Entrofuoribordo diesel',
    ebD: 'Entrobordo diesel', ebB: 'Entrobordo a benzina', moto: 'Motore della moto d\'acqua', el: 'Motore elettrico', none: 'Senza motore'
  };

  /* etichette usate dalle condizioni delle voci */
  function tags(b) {
    const e = b.eng, t = new Set([b.kind, e]);
    const comb = !/^(el|none)$/.test(e);
    if (comb) t.add('mot');
    if (/^fb/.test(e)) t.add('fb');
    if (/^(efb|eb)/.test(e)) t.add('inb');
    if (/^efb/.test(e)) t.add('efb');
    if (/^(fb|efb)/.test(e)) t.add('piede');
    if (e === 'ebB' || e === 'efbB') t.add('benzInb');
    if (e === 'ebD' || e === 'efbD') t.add('dsl');
    if (e === 'el') t.add('el');
    if (b.kind !== 'remi') t.add('barca');
    if (b.kind !== 'remi' && b.kind !== 'moto') t.add('cabina');
    if (+b.n > 1) t.add('twin');
    return t;
  }
  /* w: deve avere tutte queste etichette (spazio = e); x: non deve averne nessuna */
  const ok = (T, w, x) => (!w || w.split(' ').every(k => T.has(k))) && (!x || !x.split(' ').some(k => T.has(k)));

  const TPL = {
    pre: [
      ['Meteo e bollettino del mare controllati per tutta la durata dell\'uscita'],
      ['Rotta e orario di rientro comunicati a qualcuno a terra'],
      ['Documenti a bordo: patente, documento della barca, assicurazione', 'barca'],
      ['Giubbotti di salvataggio per tutte le persone a bordo, della misura giusta'],
      ['Giubbotto indossato, fischietto e sacca stagna', 'remi'],
      ['Dotazioni di sicurezza a bordo e non scadute: razzi e fuochi, salvagente anulare, estintore, cassetta di pronto soccorso', 'barca'],
      ['Telefono carico, in custodia stagna'],
      ['VHF acceso e sul canale 16', 'cabina'],
      ['Staccabatterie acceso e tensione della batteria regolare (circa 12,6 V a motore spento)', 'barca', 'none'],
      ['Tappi di scarico della carena chiusi', 'barca', 'vela'],
      ['Sentina asciutta e pompa di sentina funzionante', 'cabina'],
      ['Carburante sufficiente: un terzo per l\'andata, un terzo per il ritorno, un terzo di riserva', 'mot'],
      ['Batteria del motore carica, autonomia sufficiente per andare e tornare', 'el'],
      ['Livello dell\'olio motore controllato', 'fb4'],
      ['Olio per la miscela: serbatoio del miscelatore pieno o miscela fatta nella proporzione giusta', 'fb2'],
      ['Tubo del carburante innestato, pompetta premuta finché diventa dura, sfiato del serbatoio aperto', 'fb'],
      ['Motore abbassato e bloccato, elica libera da cime e alghe', 'fb'],
      ['Cavo di sicurezza (stacco motore) collegato al polso o al giubbotto del pilota', 'fb'],
      ['Cavo di sicurezza (stacco motore) collegato al polso o al giubbotto del pilota', 'moto'],
      ['Vano motore: nessun odore di carburante e nessuna perdita di olio, acqua o carburante', 'inb'],
      ['Aspiratore del vano motore acceso per almeno 4 minuti prima dell\'avviamento', 'benzInb'],
      ['Livello dell\'olio motore e del liquido di raffreddamento', 'inb'],
      ['Presa a mare aperta e filtro dell\'acqua di mare pulito', 'inb'],
      ['Cinghie in tensione e senza crepe', 'inb'],
      ['Prefiltro del gasolio senza acqua sul fondo', 'dsl'],
      ['Livello dell\'olio del trim e del piede', 'efb'],
      ['Timone, acceleratore e invertitore si muovono liberi', 'mot'],
      ['Dopo l\'avviamento esce l\'acqua di raffreddamento (getto di controllo o scarico)', 'mot', 'moto'],
      ['Dopo l\'avviamento le spie e gli allarmi del cruscotto sono spenti', 'mot'],
      ['Luci di navigazione funzionanti', 'cabina'],
      ['Ancora con catena e cima pronte all\'uso', 'cabina'],
      ['Cime d\'ormeggio e parabordi a bordo', 'barca'],
      ['Sartiame, coppiglie e arridatoi controllati', 'vela'],
      ['Vele, drizze e scotte pronte, maniglie dei winch a bordo', 'vela'],
      ['Pagaia o remi a bordo, cordino della pagaia', 'remi'],
      ['Equipaggio informato su giubbotti, estintore, VHF e manovra di uomo a mare', 'barca']
    ],
    nav: [
      ['Vedetta continua: barche, bagnanti, sub (bandiera rossa con striscia bianca o bandiera Alfa)'],
      ['Fuori dalla fascia riservata ai bagnanti e alla velocità consentita vicino alla costa', 'barca'],
      ['Posizione nota sulla carta e distanza dal porto di rientro sotto controllo'],
      ['Evoluzione del meteo: vento, mare, nuvole e temporali in arrivo'],
      ['L\'acqua di raffreddamento esce regolarmente', 'mot', 'moto'],
      ['Temperatura del motore e pressione dell\'olio nella norma, nessun allarme', 'mot'],
      ['Batteria in carica con il motore acceso (circa 13,8–14,4 V)', 'mot'],
      ['Nessuna vibrazione o rumore strano da elica, piede o trasmissione', 'mot'],
      ['Carburante rimasto sufficiente per rientrare con un terzo di riserva', 'mot'],
      ['Carica rimasta sufficiente per rientrare', 'el'],
      ['Sentina asciutta (controllo almeno ogni ora)', 'cabina'],
      ['Vela ridotta per tempo se il vento rinforza', 'vela'],
      ['Equipaggio bene: acqua, protezione dal sole, giubbotti indossati se il mare aumenta']
    ],
    rit: [
      ['Motore al minimo per 2–3 minuti prima di spegnerlo', 'mot'],
      ['Ormeggio sicuro: cime, spring e parabordi regolati', 'barca'],
      ['Motore sciacquato con acqua dolce per 5–10 minuti (attacco per il lavaggio o vaschetta)', 'fb'],
      ['Circuito di raffreddamento sciacquato con acqua dolce come indicato dal costruttore', 'moto'],
      ['Motore alzato', 'fb'],
      ['Sfiato del serbatoio chiuso e tubo del carburante staccato', 'fb'],
      ['Presa a mare chiusa se la barca resta ferma a lungo', 'inb'],
      ['Vano motore controllato: perdite, acqua in sentina, odore di carburante', 'inb'],
      ['Sentina controllata e pulita', 'cabina'],
      ['Elettronica spenta e staccabatterie spento (resta acceso solo ciò che serve, come la pompa di sentina automatica)', 'barca', 'none'],
      ['Batteria del motore messa in carica', 'el'],
      ['Rifornimento fatto (il serbatoio pieno fa meno condensa)', 'mot'],
      ['Vele piegate o coperte, drizze allontanate dall\'albero', 'vela'],
      ['Barca e dotazioni sciacquate con acqua dolce'],
      ['Rifiuti sbarcati'],
      ['Tambucci, oblò e gavoni chiusi, telo di copertura messo', 'cabina'],
      ['Guasti o problemi annotati qui sotto per la manutenzione']
    ],
    /* [voce, ore, mesi, con, senza] */
    man: [
      ['Olio motore e filtro dell\'olio', 100, 12, 'fb4'],
      ['Olio del piede', 100, 12, 'piede'],
      ['Filtro del carburante', 100, 12, 'fb'],
      ['Candele', 200, 24, 'fb4'],
      ['Candele', 100, 12, 'fb2'],
      ['Girante della pompa dell\'acqua', 200, 24, 'fb'],
      ['Termostato', 200, 24, 'fb4'],
      ['Ingrassaggio: ingrassatori, perni e cremagliera dello sterzo', 100, 12, 'fb'],
      ['Elica: controllo e grasso sull\'albero', 100, 12, 'piede'],
      ['Serbatoio e filtro dell\'olio del miscelatore', 100, 12, 'fb2'],
      ['Olio motore e filtro dell\'olio', 200, 12, 'dsl'],
      ['Olio motore e filtro dell\'olio', 100, 12, 'benzInb'],
      ['Filtro del gasolio e prefiltro separatore', 200, 12, 'dsl'],
      ['Filtro della benzina', 100, 12, 'benzInb'],
      ['Girante della pompa dell\'acqua di mare', 300, 24, 'inb'],
      ['Filtro dell\'aria', 400, 24, 'dsl'],
      ['Filtro antifiamma e filtro dell\'aria', 200, 24, 'benzInb'],
      ['Candele', 200, 24, 'benzInb'],
      ['Cinghie: controllo ed eventuale sostituzione', 200, 24, 'inb'],
      ['Liquido di raffreddamento', null, 24, 'inb'],
      ['Scambiatore di calore: pulizia', 1000, 48, 'dsl'],
      ['Gioco delle valvole', 1000, null, 'dsl'],
      ['Olio dell\'invertitore', 200, 12, 'inb', 'efb'],
      ['Soffietti del piede', null, 24, 'efb'],
      ['Tenuta dell\'asse dell\'elica (premistoppa)', null, 12, 'inb', 'efb'],
      ['Aspiratore del vano motore funzionante', null, 12, 'benzInb'],
      ['Manutenzione del motore secondo il libretto del costruttore', 50, 12, 'moto'],
      ['Cavi, connettori e batteria del motore elettrico', null, 12, 'el'],
      ['Anodi sacrificali di motore, trasmissione e carena', null, 12, 'barca'],
      ['Batterie di avviamento e servizi', null, 12, 'barca', 'none'],
      ['Pompe di sentina e interruttore automatico', null, 6, 'cabina'],
      ['Estintori: controllo e revisione alla scadenza', null, 12, 'barca'],
      ['Razzi e fuochi: data di scadenza', null, 12, 'barca'],
      ['Giubbotti autogonfiabili: bomboletta e pastiglia', null, 12],
      ['Cassetta di pronto soccorso: scadenze', null, 12, 'barca'],
      ['Zattera di salvataggio: revisione (se presente)', null, 12, 'cabina'],
      ['Antivegetativa e pulizia della carena', null, 12, 'barca', 'gommone moto'],
      ['Tubolari e valvole', null, 12, 'gommone'],
      ['Sartiame: ispezione completa', null, 12, 'vela'],
      ['Vele e winch: controllo e manutenzione', null, 12, 'vela']
    ]
  };

  /* voci di manutenzione che riguardano il motore (sostituite dal programma del costruttore, se c'è) */
  const ENG_TAG = /^(fb4|fb2|fb|piede|dsl|benzInb|inb|efb|moto|el)$/;
  function build(b) {
    const T = tags(b), seen = new Set(), L = {}, P = profileOf(b), mod = mkey(b.emodel);
    ['pre', 'nav', 'rit'].forEach(k => {
      L[k] = TPL[k].filter(r => ok(T, r[1], r[2])).filter(r => !seen.has(k + r[0]) && seen.add(k + r[0])).map(r => ({ id: uid(), t: r[0] }));
    });
    if (P && P.pre) L.pre.push(...P.pre.map(t => ({ id: uid(), t })));
    const rows = P
      ? P.man.filter(r => ok(T, r[3], r[4]) && (!r[5] || new RegExp(r[5]).test(mod))).concat(TPL.man.filter(r => !(r[3] && ENG_TAG.test(r[3])) && ok(T, r[3], r[4])))
      : TPL.man.filter(r => ok(T, r[3], r[4]));
    L.man = rows.filter(r => !seen.has('m' + r[0]) && seen.add('m' + r[0]))
      .map(r => ({ id: uid(), t: r[0], h: T.has('mot') ? r[1] : null, m: r[2], last: null }));
    b.prof = P ? P.id : null;
    return L;
  }
  /* programma di manutenzione del costruttore per questo motore (catalogo.js), se lo conosciamo */
  const mkey = x => String(x || '').toLowerCase().replace(/[\s.\-_/]+/g, '');
  function profileOf(b) {
    if (!b || !b.emodel) return null;
    const m = mkey(b.emodel), br = norm(b.ebrand);
    return (CAT().profili || []).find(p => new RegExp(p.re).test(m) && (!p.marchio || !br || br.includes(p.marchio))) || null;
  }

  /* tipo di motore riconosciuto da marchio e modello, anche se il modello non è nell'elenco */
  const INB_DSL = /nanni|vetus|perkins|cummins|caterpillar|^cat\b|\bman\b|fpt|iveco|lombardini|mtu|isotta|aifo|john deere|beta marine|solé|sole diesel|steyr|deutz|kubota|hyundai|yanmar|scania|baudouin|doosan/;
  function engGuess(brand, model) {
    const B = norm(brand), M = mkey(model), all = (B + ' ' + norm(model));
    if (!M && !B) return null;
    const k = findKey(CAT().motori, brand);
    if (k && M) { const C = CAT().motori[k], t = Object.keys(C).find(t => C[t].some(x => mkey(x) === M)); if (t) return t; }
    if (/elettric|electric|torqeedo|epropulsion|avator/.test(all)) return 'el';
    if (/entrofuoribordo|sterndrive|piede/.test(all)) return /diesel|gasolio/.test(all) ? 'efbD' : 'efbB';
    if (/fuoribordo|outboard/.test(all)) return /2 ?t/.test(all) ? 'fb2' : 'fb4';
    if (!M) return INB_DSL.test(B) ? 'ebD' : null;
    if (/volvo/.test(B)) {
      if (/dp$|dps$|^aqad|^ad\d|^kad/.test(M)) return 'efbD';
      if (/^(tamd|tmd|kamd|md|tad|twd|tmd|ips|d\d+-?\d*$|d\d+-\d+)/.test(M) || /^d\d/.test(M)) return 'ebD';
      if (/osi$/.test(M)) return 'ebB';
      if (/^aq\d|gl$|gi$|gxi|^v[68]|^[3-8]\d?(gl|gxi|gi|sx)/.test(M)) return 'efbB';
    }
    if (/mercruiser/.test(B)) return /qsd|tdi|diesel|^d\d/.test(M) ? 'efbD' : 'efbB';
    if (/yanmar/.test(B)) return /zt|stp|sd\d|-z$/.test(M) ? 'efbD' : 'ebD';
    if (/yamaha/.test(B) && !/moto/.test(B)) return /^(\d+[a-z]*mh|enduro|e\d)/.test(M) ? 'fb2' : /^(f|fl|lf|xto|vf|vmax)\d|^xto/.test(M) ? 'fb4' : null;
    if (/suzuki/.test(B)) return /^dt/.test(M) ? 'fb2' : /^df/.test(M) ? 'fb4' : null;
    if (/honda/.test(B)) return /^bf/.test(M) ? 'fb4' : null;
    if (/tohatsu|nissan/.test(B)) return /^(mfs|bft|nsf)/.test(M) ? 'fb4' : /^(m|md|ns)\d/.test(M) ? 'fb2' : null;
    if (/evinrude|johnson/.test(B)) return 'fb2';
    if (/^mercury/.test(B)) return /diesel|tdi/.test(M) ? 'ebD' : /optimax|seapro|2t/.test(M) ? 'fb2' : 'fb4';
    if (INB_DSL.test(B)) return /dp$|zt|sterndrive/.test(M) ? 'efbD' : 'ebD';
    if (/diesel|gasolio/.test(all)) return 'ebD';
    return null;
  }

  /* ---------- dati ---------- */
  let D = load();
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* ignora */ }
    if (!d || d.v !== 1) d = { v: 1, boat: null, hours: null, hoursLog: [], lists: null, run: {}, reports: [] };
    d.run = d.run || {}; d.reports = d.reports || []; d.hoursLog = d.hoursLog || [];
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast('Memoria del telefono piena: check-list non salvata'); } }
  const motor = () => D.boat && !/^(el|none)$/.test(D.boat.eng);
  const boatName = () => D.boat ? [D.boat.brand, D.boat.model].filter(Boolean).join(' ') || KIND[D.boat.kind] : '';
  const engName = () => D.boat ? ([D.boat.ebrand, D.boat.emodel].filter(Boolean).join(' ') || ENG[D.boat.eng]) + (+D.boat.n > 1 ? ` (×${D.boat.n})` : '') : '';
  const fmtD = t => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDT = t => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtH = h => (Math.round(h * 10) / 10).toLocaleString('it-IT');
  const curH = () => (D.hours ? D.hours.h : null);

  function setHours(h, quiet) {
    h = Math.round(h * 10) / 10;
    if (!Number.isFinite(h) || h < 0 || h > 100000) { toast('Ore motore non valide'); return false; }
    const prev = curH();
    if (prev != null && h < prev && !quiet) toast(`Attenzione: ${fmtH(h)} h è meno delle ${fmtH(prev)} h segnate prima`);
    D.hours = { h, d: Date.now() };
    D.hoursLog.push({ h, d: D.hours.d }); if (D.hoursLog.length > 500) D.hoursLog.splice(0, D.hoursLog.length - 500);
    return true;
  }

  /* stato di una manutenzione: scaduta, vicina, a posto, mai segnata */
  function due(it) {
    const H = curH(), now = Date.now(), r = { st: 'mai', txt: 'Mai segnata' };
    if (!it.last) return r;
    const over = [], next = [];
    let st = 'ok';
    if (it.h && it.last.h != null && H != null) {
      const at = it.last.h + it.h, left = at - H;
      if (left <= 0) { over.push(`da ${fmtH(-left)} h`); st = 'bad'; }
      else { next.push(`tra ${fmtH(left)} h (a ${fmtH(at)} h)`); if (left <= Math.max(10, it.h * 0.1)) st = 'warn'; }
    }
    if (it.m && it.last.d) {
      const nd = new Date(it.last.d); nd.setMonth(nd.getMonth() + +it.m);
      const dl = (nd - now) / DAY;
      if (dl <= 0) { over.push(`dal ${fmtD(nd)}`); st = 'bad'; }
      else { next.push(`entro il ${fmtD(nd)}`); if (dl <= 30 && st !== 'bad') st = 'warn'; }
    }
    r.st = st;
    r.txt = over.length ? 'Scaduta ' + over.join(' e ') : next.length ? 'Prossima ' + next.join(' o ') : 'A posto';
    return r;
  }
  function dueCount() {
    if (!D.lists) return 0;
    return D.lists.man.filter(it => { const s = due(it).st; return s === 'bad' || s === 'warn'; }).length;
  }
  const every = it => [it.h ? `ogni ${fmtH(it.h)} h` : '', it.m ? `ogni ${it.m} ${+it.m === 1 ? 'mese' : 'mesi'}` : ''].filter(Boolean).join(' o ') || 'senza scadenza';

  /* ---------- interfaccia ---------- */
  let view = 'home', edit = false, confirmKey = null, openRep = null;
  const box = () => $('ckBox');
  const back = (to, lbl) => `<button class="ckBack" data-ck="view" data-v="${to}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>${lbl}</button>`;
  const opt = (o, v) => Object.keys(o).map(k => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(o[k])}</option>`).join('');
  const hoursBox = () => motor()
    ? `<div class="ckHours"><div><b>${curH() != null ? fmtH(curH()) + ' h' : '— h'}</b><span>${D.hours ? 'Ore motore, segnate il ' + fmtD(D.hours.d) : 'Ore motore non ancora segnate'}</span></div>` +
      `<form class="ckHForm" data-ckf="hours"><input id="ckH" type="number" inputmode="decimal" step="0.1" min="0" placeholder="Ore" aria-label="Ore motore attuali" value=""><button>Segna</button></form></div>`
    : '';

  function render() {
    const el = box(); if (!el) return;
    if (!D.boat || view === 'boat') { el.innerHTML = boatForm(); return; }
    if (view === 'reports') { el.innerHTML = reportsView(); return; }
    if (LISTS[view]) { el.innerHTML = view === 'man' ? manView() : listView(view); return; }
    el.innerHTML = homeView();
  }

  function boatForm() {
    const B0 = window.rnBoatSet ? window.rnBoatSet() : {};
    const b = D.boat || { kind: guessKind(), eng: guessEng(), n: 1, len: B0.len || null, draft: B0.draft || null };
    const first = !D.boat;
    return (first ? '' : back('home', 'Check-list')) +
      `<h4>${first ? 'La tua barca' : 'Modifica la barca'}</h4>` +
      (first ? '<p class="note">Inserisci barca e motore: l\'app prepara le quattro check-list e le scadenze di manutenzione adatte. Dopo puoi modificare, cancellare o aggiungere ogni voce.</p>' : '') +
      `<form class="form" data-ckf="boat">
        <label>Marchio della barca <span><input id="ckBb" list="ckBbL" maxlength="40" value="${esc(b.brand)}" placeholder="Scegli o scrivi" autocomplete="off"></span></label>
        <label>Modello <span><input id="ckBm" list="ckBmL" maxlength="40" value="${esc(b.model)}" placeholder="Scegli o scrivi" autocomplete="off"></span></label>
        <label>Tipo di mezzo <span><select id="ckBk">${opt(KIND, b.kind)}</select></span></label>
        <label>Motore <span><select id="ckE">${opt(ENG, b.eng)}</select></span></label>
        <label>Marchio del motore <span><input id="ckEb" list="ckEbL" maxlength="40" value="${esc(b.ebrand)}" placeholder="Scegli o scrivi" autocomplete="off"></span></label>
        <label>Modello del motore <span><input id="ckEm" list="ckEmL" maxlength="40" value="${esc(b.emodel)}" placeholder="Scegli o scrivi" autocomplete="off"></span></label>
        <label>Numero di motori <span><select id="ckN">${[1, 2, 3, 4].map(n => `<option${n === +b.n ? ' selected' : ''}>${n}</option>`).join('')}</select></span></label>
        <label>Potenza di ogni motore <span><input id="ckHp" type="number" inputmode="decimal" step="1" min="0" value="${esc(b.hp != null ? b.hp : '')}" placeholder="es. 200"> CV</span></label>
        <label>Lunghezza fuori tutto <span><input id="ckLen" type="number" inputmode="decimal" step="0.1" min="1" value="${esc(b.len != null ? b.len : '')}" placeholder="es. 9,8"> m</span></label>
        <label>Pescaggio <span><input id="ckDr" type="number" inputmode="decimal" step="0.1" min="0" value="${esc(b.draft != null ? b.draft : '')}" placeholder="es. 0,9"> m</span></label>
        ${first ? '<label>Ore motore attuali <span><input id="ckH0" type="number" inputmode="decimal" step="0.1" min="0" placeholder="es. 245"> h</span></label>' : ''}
        <p class="note ckOk" id="ckProf"${profileOf(b) ? '' : ' hidden'}>${profileOf(b) ? `Programma di manutenzione dal libretto del costruttore: ${esc(profileOf(b).nome)}.` : ''}</p>
        <p class="note">Mezzo, potenza, lunghezza e pescaggio passano anche nella sezione Barca, dove servono per la rotta e i limiti di distanza dalla costa.</p>
        <p class="note">Tocca una casella per vedere l'elenco o inizia a scrivere: se marchio o modello non ci sono, scrivili tu. Dal modello del motore l'app riconosce se è fuoribordo, entrobordo o entrofuoribordo: controlla comunque la casella "Motore".</p>
        <div class="btns"><button class="primary">${first ? 'Prepara le check-list' : 'Salva'}</button></div>
      </form>
      <datalist id="ckBbL">${dl(boatBrands())}</datalist><datalist id="ckBmL">${dl(boatModels(b.brand))}</datalist>
      <datalist id="ckEbL">${dl(engBrands())}</datalist><datalist id="ckEmL">${dl(engModels(b.ebrand, b.eng))}</datalist>` +
      (first ? '' : `<p class="note">Se hai cambiato tipo di motore puoi rifare le voci proposte: i report salvati restano.</p>
        <div class="btns"><button data-ck="rebuild"${confirmKey === 'rebuild' ? ' class="danger"' : ''}>${confirmKey === 'rebuild' ? 'Tocca di nuovo: sostituisce tutte le voci' : 'Rifai le voci per questa barca'}</button></div>`) +
      `<details class="info"><summary>Come funziona</summary><p class="note">Per i motori di cui l'app conosce il programma del costruttore, le manutenzioni e gli intervalli sono quelli del libretto (la fonte è scritta in Manutenzione). Per gli altri le voci sono proposte in base al tipo di motore e gli intervalli sono indicativi. Controlla gli intervalli sul libretto di uso e manutenzione del tuo motore e correggili dove serve. Con più motori segna le ore del motore che ne ha di più.</p></details>`;
  }
  /* elenchi a tendina di marchi e modelli (catalogo.js); si può sempre scrivere a mano */
  const CAT = () => window.RN_CAT || { barche: {}, motori: {} };
  const norm = x => String(x || '').trim().toLowerCase();
  const findKey = (o, name) => Object.keys(o).find(k => norm(k) === norm(name));
  const dl = arr => arr.map(v => `<option value="${esc(v)}"></option>`).join('');
  /* elenchi in ordine alfabetico, con i numeri in ordine di grandezza (F9.9 prima di F15) */
  const abc = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }));
  const boatBrands = () => abc(Object.keys(CAT().barche));
  const boatModels = brand => { const k = findKey(CAT().barche, brand); return k ? abc(CAT().barche[k].m) : []; };
  const engBrands = () => abc(Object.keys(CAT().motori));
  function engModels(brand, type) {
    const k = findKey(CAT().motori, brand); if (!k) return [];
    const M = CAT().motori[k];
    return abc([].concat(...Object.keys(M).map(t => M[t])));
  }
  function engTypeOf(brand, model) {
    const k = findKey(CAT().motori, brand); if (!k) return null;
    const M = CAT().motori[k], t = Object.keys(M).find(t => M[t].some(m => norm(m) === norm(model)));
    return t || (Object.keys(M).length === 1 ? Object.keys(M)[0] : null);
  }
  function setKind(kind) {
    if (!kind || $('ckBk').value === kind) return;
    $('ckBk').value = kind;
    if (kind === 'moto') $('ckE').value = 'moto';
    else if (kind === 'vela' && /^fb/.test($('ckE').value)) $('ckE').value = 'ebD';
  }
  function onInput(e) {
    const t = e.target; if (!t.id || !/^ck(Bb|Bm|Eb|Em|E)$/.test(t.id) || !$('ckBmL')) return;
    if (t.id === 'ckE' && e.type === 'change' && e.isTrusted) t.dataset.man = '1';
    if (t.id === 'ckBb') {
      $('ckBmL').innerHTML = dl(boatModels(t.value));
      const k = findKey(CAT().barche, t.value);
      if (k && e.type === 'change') {
        setKind(CAT().barche[k].k);
        const pe = CAT().barche[k].e;
        if (pe && /^fb/.test($('ckE').value) && !$('ckE').dataset.man) { $('ckE').value = pe; $('ckEbL').innerHTML = dl(engBrands()); toast('Motore proposto: ' + ENG[pe] + ' (cambialo se non è così)'); }
      }
    }
    if (t.id === 'ckBm') setKind(/sun odyssey|sun fast|oceanis|^first /i.test(t.value) && boatModels($('ckBb').value).some(m => norm(m) === norm(t.value)) ? 'vela' : null);
    if (t.id === 'ckEb' || t.id === 'ckE') {
      $('ckEmL').innerHTML = dl(engModels($('ckEb').value, $('ckE').value));
      if (t.id === 'ckE') $('ckEbL').innerHTML = dl(engBrands());
      if (t.id === 'ckEb' && e.type === 'change') { const ty = engTypeOf(t.value, ''); if (ty && ty !== $('ckE').value && !CAT().motori[findKey(CAT().motori, t.value)][$('ckE').value]) $('ckE').value = ty; }
    }
    if (t.id === 'ckEm' || (t.id === 'ckEb' && e.type === 'change' && $('ckEm').value)) {
      const pw = /^fb|^el/.test(engGuess($('ckEb').value, $('ckEm').value) || $('ckE').value) && /(?:^|[a-z\s])(\d{1,3}(?:[.,]\d)?)(?:\s|$|[a-z])/i.exec($('ckEm').value);
      if (pw && !/^el/.test($('ckE').value) && $('ckHp') && (!$('ckHp').value || $('ckHp').dataset.auto)) { $('ckHp').value = parseFloat(pw[1].replace(',', '.')); $('ckHp').dataset.auto = '1'; }
      const listed = engModels($('ckEb').value, $('ckE').value).some(m => mkey(m) === mkey($('ckEm').value));
      if (e.type === 'change' || listed) {
        const ty = engGuess($('ckEb').value, $('ckEm').value);
        if (ty && ty !== $('ckE').value) { $('ckE').value = ty; delete $('ckE').dataset.man; toast('Motore riconosciuto: ' + ENG[ty]); }
      }
      showProf();
    }
  }
  function showProf() {
    const el = $('ckProf'); if (!el) return;
    const P = profileOf({ ebrand: $('ckEb').value, emodel: $('ckEm').value });
    el.hidden = !P; if (P) el.textContent = `Programma di manutenzione dal libretto del costruttore: ${P.nome}.`;
  }
  function guessKind() { try { const s = JSON.parse(localStorage.getItem('rn.set') || '{}'); return KIND[s.boat] ? s.boat : 'motore'; } catch (e) { return 'motore'; } }
  function guessEng() { const k = guessKind(); return k === 'vela' ? 'ebD' : k === 'moto' ? 'moto' : k === 'remi' ? 'none' : 'fb4'; }

  function homeView() {
    const n = dueCount(), bad = D.lists.man.filter(it => due(it).st === 'bad').length;
    const cnt = k => { const r = D.run[k], tot = D.lists[k].length, done = r ? D.lists[k].filter(it => r.c && r.c[it.id]).length : 0;
      return done ? `${done} di ${tot} fatte` : `${tot} voci`; };
    const last = D.reports[0];
    return fixBox() + `<div class="ckBoat"><div><b>${esc(boatName())}</b><span>${esc(motor() || D.boat.eng === 'el' ? engName() : KIND[D.boat.kind])}</span></div><button data-ck="view" data-v="boat">Modifica</button></div>` +
      hoursBox() +
      (n ? `<button class="ckAlert${bad ? ' bad' : ''}" data-ck="view" data-v="man">${bad ? `${bad} manutenzion${bad === 1 ? 'e scaduta' : 'i scadute'}` : ''}${bad && n - bad ? ', ' : ''}${n - bad ? `${n - bad} in arrivo` : ''}<span>Apri</span></button>` : '') +
      `<div class="ckMenu">` + Object.keys(LISTS).map(k =>
        `<button data-ck="view" data-v="${k}">${ICON[k]}<b>${LISTS[k].t}</b><span>${k === 'man' ? (n ? `${n} da fare` : `${D.lists.man.length} voci`) : cnt(k)}</span></button>`).join('') + `</div>` +
      `<button class="ckRep" data-ck="view" data-v="reports"><span><b>Report salvati</b><span>${D.reports.length ? `${D.reports.length}, l'ultimo il ${fmtD(last.d)}` : 'Ancora nessuno'}</span></span><span>›</span></button>` +
      `<div class="btns"><button data-ck="backup">Salva una copia</button><button data-ck="restore">Carica una copia</button></div>
      <input id="ckFile" type="file" accept=".json,application/json" hidden>
      <details class="info"><summary>Come funziona</summary><p class="note">Apri una check-list, spunta le voci e alla fine tocca "Salva il report": resta lo storico con data, ore motore, voci fatte e saltate e le tue note. In ogni check-list "Modifica le voci" permette di cambiare il testo, cancellare o aggiungere controlli. Check-list e report sono salvati solo su questo telefono: con "Salva una copia" ottieni un file da conservare o da caricare su un altro telefono.</p></details>`;
  }
  /* barca salvata con un tipo di motore che non torna col modello, o motore di cui ora c'è il programma del costruttore */
  function fixInfo() {
    if (!D.boat) return null;
    const g = engGuess(D.boat.ebrand, D.boat.emodel), P = profileOf(D.boat);
    const key = (g || '') + '|' + (P ? P.id : '');
    if (D.boat.fixSeen === key) return null;
    if (g && g !== D.boat.eng && D.boat.kind !== 'remi') return { key, g, P, t: `${esc(engName())} risulta un motore "${ENG[g]}", ma la barca è salvata come "${ENG[D.boat.eng]}": alcune voci non sono adatte.` };
    if (P && D.boat.prof !== P.id) return { key, g: D.boat.eng, P, t: `Per ${esc(engName())} ora c'è il programma di manutenzione del libretto ${esc(P.nome)}.` };
    return null;
  }
  function fixBox() {
    const f = fixInfo(); if (!f) return '';
    return `<div class="ckFix"><p>${f.t}</p><p class="note">Rifacendo le voci restano i report salvati e le date delle manutenzioni già segnate con lo stesso nome.</p>` +
      `<div class="btns"><button class="primary" data-ck="fixEng">Correggi e rifai le voci</button><button data-ck="keepEng">Lascia così</button></div></div>`;
  }
  /* rifà le voci tenendo le date delle manutenzioni già fatte (stesso nome o stessa voce di partenza) */
  function rebuildKeep() {
    const old = D.lists ? D.lists.man : [], L = build(D.boat);
    const word = t => mkey(t).replace(/[^a-z]/g, '').slice(0, 14);
    L.man.forEach(it => { const o = old.find(x => x.last && (mkey(x.t) === mkey(it.t) || word(x.t) === word(it.t))); if (o) it.last = o.last; });
    D.lists = L; D.run = {};
  }

  const ICON = {
    pre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6v3H9z"/><path d="M15 5.5h2.5v15h-11v-15H9"/><path d="M9 13l2 2 4-4"/></svg>',
    nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    rit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13"/><path d="M8 7h8"/><circle cx="12" cy="4.5" r="1.5"/><path d="M4.5 13a7.5 7.5 0 0015 0"/><path d="M3 13h3M18 13h3"/></svg>',
    man: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5a4 4 0 005 5l-8.5 8.5a2.1 2.1 0 01-3-3z"/><path d="M14.5 6.5L17 4l3 3-2.5 2.5"/></svg>'
  };

  function listView(k) {
    const L = D.lists[k], r = D.run[k] || { c: {} }, done = L.filter(it => r.c[it.id]).length;
    const hrs = motor() && k !== 'nav';
    let h = back('home', 'Check-list') + `<h4>${LISTS[k].t}</h4>`;
    if (edit) {
      h += `<p class="note">Cambia il testo, togli o aggiungi le voci. Le modifiche valgono per le prossime volte.</p><div class="ckEdit">` +
        L.map((it, i) => `<div class="ckE"><textarea rows="2" maxlength="200" data-ckt="${it.id}" aria-label="Testo della voce">${esc(it.t)}</textarea>` +
          `<div class="ckEb"><button data-ck="up" data-id="${it.id}" aria-label="Sposta su"${i ? '' : ' disabled'}>↑</button><button data-ck="down" data-id="${it.id}" aria-label="Sposta giù"${i < L.length - 1 ? '' : ' disabled'}>↓</button><button class="danger" data-ck="del" data-id="${it.id}" aria-label="Cancella la voce">✕</button></div></div>`).join('') + `</div>` +
        `<form class="search" data-ckf="add"><input id="ckNew" maxlength="200" placeholder="Nuova voce" enterkeyhint="done"><button>Aggiungi</button></form>` +
        `<div class="btns"><button class="primary" data-ck="edit">Fatto</button><button data-ck="reset"${confirmKey === 'reset' ? ' class="danger"' : ''}>${confirmKey === 'reset' ? 'Tocca di nuovo per confermare' : 'Ripristina le voci proposte'}</button></div>`;
      return h;
    }
    h += `<div class="ckProg"><i style="width:${L.length ? done / L.length * 100 : 0}%"></i></div><p class="ckCount">${done} di ${L.length} fatte${r.s ? ' · iniziata ' + fmtDT(r.s) : ''}</p>`;
    h += L.length ? `<div class="ckList">` + L.map(it => `<label class="ckI${r.c[it.id] ? ' on' : ''}"><input type="checkbox" data-ckc="${it.id}"${r.c[it.id] ? ' checked' : ''}><span>${esc(it.t)}</span></label>`).join('') + `</div>`
      : '<p class="note">Nessuna voce: tocca "Modifica le voci" per aggiungerne.</p>';
    h += `<div class="btns"><button data-ck="all">Spunta tutto</button><button data-ck="edit">Modifica le voci</button></div>`;
    h += `<div class="form">` + (hrs ? `<label>Ore motore ${k === 'rit' ? 'all\'arrivo' : 'alla partenza'} <span><input id="ckRH" type="number" inputmode="decimal" step="0.1" min="0" value="${curH() != null ? curH() : ''}" placeholder="Ore"> h</span></label>` : '') +
      `<textarea id="ckNote" rows="3" maxlength="1000" placeholder="Note: guasti, consumi, cose da sistemare…" aria-label="Note">${esc(r.n || '')}</textarea></div>`;
    h += `<div class="btns"><button class="primary" data-ck="saveRep">Salva il report</button>${done || r.n ? '<button data-ck="clear">Azzera</button>' : ''}</div>`;
    if (k === 'rit' && hrs) h += '<p class="note">Segna le ore al rientro: servono a calcolare le scadenze di manutenzione.</p>';
    return h;
  }

  function manView() {
    const L = D.lists.man;
    let h = back('home', 'Check-list') + `<h4>Manutenzione</h4>` + hoursBox();
    if (edit) {
      h += `<p class="note">Cambia testo e intervalli, togli o aggiungi voci. Lascia vuoto ore o mesi se non servono. Puoi anche scrivere quando l'hai fatta l'ultima volta.</p><div class="ckEdit">` +
        L.map(it => `<div class="ckE"><textarea rows="2" maxlength="200" data-ckt="${it.id}" aria-label="Testo della voce">${esc(it.t)}</textarea>` +
          `<div class="ckInt">${motor() ? `<label>ogni <input type="number" min="0" step="1" data-ckh="${it.id}" value="${it.h || ''}"> h</label>` : ''}<label>ogni <input type="number" min="0" step="1" data-ckm="${it.id}" value="${it.m || ''}"> mesi</label></div>` +
          `<div class="ckInt"><label>Ultima volta <input type="date" data-ckld="${it.id}" value="${it.last && it.last.d ? new Date(it.last.d).toISOString().slice(0, 10) : ''}"></label>${motor() ? `<label>a <input type="number" min="0" step="0.1" data-cklh="${it.id}" value="${it.last && it.last.h != null ? it.last.h : ''}"> h</label>` : ''}</div>` +
          `<div class="ckEb"><button class="danger" data-ck="del" data-id="${it.id}">Cancella</button></div></div>`).join('') + `</div>` +
        `<form class="search" data-ckf="add"><input id="ckNew" maxlength="200" placeholder="Nuova manutenzione" enterkeyhint="done"><button>Aggiungi</button></form>` +
        `<div class="btns"><button class="primary" data-ck="edit">Fatto</button><button data-ck="reset"${confirmKey === 'reset' ? ' class="danger"' : ''}>${confirmKey === 'reset' ? 'Tocca di nuovo per confermare' : 'Ripristina le voci proposte'}</button></div>`;
      return h;
    }
    if (motor()) {
      const P = (CAT().profili || []).find(p => p.id === D.boat.prof);
      h += P ? `<p class="note ckOk">Intervalli dal libretto del costruttore: ${esc(P.fonte)}. <a href="${esc(P.url)}" target="_blank" rel="noopener">Apri il programma</a></p>`
        : `<p class="note ckWarn">Per ${esc(engName())} l'app non ha il programma del costruttore: le voci sono quelle tipiche di un motore "${ENG[D.boat.eng]}" e gli intervalli sono indicativi. Correggili con il libretto del tuo motore.</p>`;
    }
    if (motor() && curH() == null) h += '<p class="note ckWarn">Segna le ore motore attuali per calcolare le scadenze a ore.</p>';
    if (L.some(it => !it.last)) h += '<p class="note">Per le voci "Mai segnata" tocca "Fatta" quando le fai, oppure in "Modifica le voci" scrivi quando le hai fatte l\'ultima volta.</p>';
    const order = { bad: 0, warn: 1, mai: 2, ok: 3 };
    const rows = L.map(it => ({ it, s: due(it) })).sort((a, b) => order[a.s.st] - order[b.s.st]);
    h += `<div class="ckMan">` + rows.map(({ it, s }) =>
      `<div class="ckM ${s.st}"><div><b>${esc(it.t)}</b><span>${every(it)}</span>` +
      (it.last ? `<span>Fatta ${it.last.d ? 'il ' + fmtD(it.last.d) : ''}${it.last.h != null ? ` a ${fmtH(it.last.h)} h` : ''}</span>` : '') +
      `<span class="ckSt">${s.txt}</span></div>` +
      `<button data-ck="did" data-id="${it.id}">Fatta</button></div>`).join('') + `</div>`;
    h += `<div class="btns"><button data-ck="edit">Modifica le voci</button></div>`;
    h += `<details class="info"><summary>Come funziona</summary><p class="note">"Fatta" segna la manutenzione con la data di oggi${motor() ? ' e le ore motore attuali' : ''} e la aggiunge ai report. Arancione: mancano meno di 30 giorni${motor() ? ' o meno del 10% delle ore' : ''}. Rosso: scaduta. Gli intervalli proposti sono indicativi: controllali sul libretto del tuo motore.</p></details>`;
    return h;
  }

  function reportsView() {
    let h = back('home', 'Check-list') + `<h4>Report salvati</h4>`;
    if (!D.reports.length) return h + '<p class="note">Ancora nessun report. Completa una check-list e tocca "Salva il report".</p>';
    h += `<div class="ckReps">` + D.reports.map(r => {
      const tot = r.items.length, okN = r.items.filter(i => i.ok).length;
      const open = openRep === r.id;
      return `<div class="ckR${open ? ' open' : ''}"><button data-ck="rep" data-id="${r.id}"><span><b>${esc(LISTS[r.list] ? LISTS[r.list].t : r.list)}</b><span>${fmtDT(r.d)}${r.h != null ? ' · ' + fmtH(r.h) + ' h' : ''}</span></span>` +
        `<span class="${r.list === 'man' || okN === tot ? 'okT' : 'noT'}">${r.list === 'man' ? 'fatta' : `${okN}/${tot}`}</span></button>` +
        (open ? `<div class="ckRd"><p class="mut">${esc(r.boat || '')}</p><ul>${r.items.map(i => `<li class="${i.ok ? 'y' : 'n'}">${i.ok ? '✓' : '✗'} ${esc(i.t)}</li>`).join('')}</ul>` +
          (r.n ? `<p class="pnote">${esc(r.n)}</p>` : '') +
          `<div class="btns"><button class="danger" data-ck="delRep" data-id="${r.id}">${confirmKey === 'rep' + r.id ? 'Tocca di nuovo per cancellare' : 'Cancella il report'}</button></div></div>` : '') + `</div>`;
    }).join('') + `</div>`;
    h += `<div class="btns"><button data-ck="exportRep">Esporta i report (testo)</button></div>`;
    return h;
  }

  /* ---------- azioni ---------- */
  const find = (k, id) => D.lists[k].findIndex(it => it.id === id);
  function onClick(e) {
    const b = e.target.closest('[data-ck]'); if (!b || !box() || !box().contains(b)) return;
    const a = b.dataset.ck, id = b.dataset.id, k = view;
    if (a !== 'rebuild' && a !== 'reset' && a !== 'delRep') confirmKey = null;
    switch (a) {
      case 'view': view = b.dataset.v; edit = false; openRep = null; render(); box().closest('#sheet') && (box().closest('#sheet').scrollTop = 0); return;
      case 'edit': edit = !edit; render(); return;
      case 'up': case 'down': {
        const L = D.lists[k], i = find(k, id), j = a === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= L.length) return;
        [L[i], L[j]] = [L[j], L[i]]; save(); render(); return;
      }
      case 'del': { const i = find(k, id); if (i < 0) return; const [it] = D.lists[k].splice(i, 1); if (D.run[k]) delete D.run[k].c[it.id]; save(); render(); toast('Voce cancellata'); return; }
      case 'fixEng': { const f = fixInfo(); if (!f) return; D.boat.eng = f.g; rebuildKeep(); D.boat.fixSeen = null; save(); render(); badge(); toast('Voci rifatte per ' + ENG[f.g]); return; }
      case 'keepEng': { const f = fixInfo(); if (f) D.boat.fixSeen = f.key; save(); render(); return; }
      case 'reset': case 'rebuild':
        if (confirmKey !== a) { confirmKey = a; render(); return; }
        confirmKey = null;
        if (a === 'reset') { D.lists[k] = build(D.boat)[k]; D.run[k] = null; }
        else { rebuildKeep(); view = 'home'; }
        save(); edit = false; render(); toast('Voci proposte ripristinate'); return;
      case 'all': { const r = D.run[k] || (D.run[k] = { c: {}, s: Date.now() }); D.lists[k].forEach(it => { r.c[it.id] = 1; }); save(); render(); return; }
      case 'clear': D.run[k] = null; save(); render(); return;
      case 'saveRep': saveReport(k); return;
      case 'did': {
        const it = D.lists.man.find(x => x.id === id); if (!it) return;
        if (motor() && curH() == null) { toast('Segna prima le ore motore attuali'); const f = $('ckH'); if (f) f.focus(); return; }
        it.last = { d: Date.now(), h: motor() ? curH() : null };
        D.reports.unshift({ id: uid(), list: 'man', d: Date.now(), h: motor() ? curH() : null, boat: boatName() + ' – ' + engName(), items: [{ t: it.t, ok: 1 }], n: '' });
        save(); render(); toast('Manutenzione segnata: ' + it.t); badge(); return;
      }
      case 'rep': openRep = openRep === id ? null : id; render(); return;
      case 'delRep':
        if (confirmKey !== 'rep' + id) { confirmKey = 'rep' + id; render(); return; }
        D.reports = D.reports.filter(r => r.id !== id); confirmKey = null; openRep = null; save(); render(); toast('Report cancellato'); return;
      case 'exportRep': download(`report-${slug()}.txt`, reportsText(), 'text/plain'); return;
      case 'backup': download(`checklist-${slug()}.json`, JSON.stringify(D, null, 1), 'application/json'); return;
      case 'restore': { const f = $('ckFile'); if (f) f.click(); return; }
    }
  }
  function onChange(e) {
    const t = e.target, k = view; if (!box() || !box().contains(t)) return;
    if (t.dataset.ckc) {
      const r = D.run[k] || (D.run[k] = { c: {}, s: Date.now() });
      if (t.checked) r.c[t.dataset.ckc] = 1; else delete r.c[t.dataset.ckc];
      save(); const lab = t.closest('.ckI'); if (lab) lab.classList.toggle('on', t.checked);
      const L = D.lists[k], done = L.filter(it => r.c[it.id]).length;
      const pr = box().querySelector('.ckProg i'), ct = box().querySelector('.ckCount');
      if (pr) pr.style.width = (done / L.length * 100) + '%';
      if (ct) ct.textContent = `${done} di ${L.length} fatte · iniziata ${fmtDT(r.s)}`;
      if (done === L.length) toast('Tutte le voci fatte: salva il report');
      return;
    }
    if (t.dataset.ckt) { const i = find(k, t.dataset.ckt); const v = t.value.trim(); if (i >= 0 && v) { D.lists[k][i].t = v; save(); } else if (i >= 0) t.value = D.lists[k][i].t; return; }
    const it = id => D.lists.man.find(x => x.id === id);
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
    if (t.dataset.ckh) { const x = it(t.dataset.ckh); if (x) { x.h = num(t.value); save(); } return; }
    if (t.dataset.ckm) { const x = it(t.dataset.ckm); if (x) { x.m = num(t.value) && Math.round(num(t.value)); save(); } return; }
    if (t.dataset.ckld) { const x = it(t.dataset.ckld); if (x) { const d = t.value ? new Date(t.value + 'T12:00').getTime() : null; x.last = d || (x.last && x.last.h != null) ? { d, h: x.last ? x.last.h : null } : null; save(); badge(); } return; }
    if (t.dataset.cklh) { const x = it(t.dataset.cklh); if (x) { const h = t.value === '' ? null : parseFloat(t.value.replace(',', '.')); x.last = h != null || (x.last && x.last.d) ? { d: x.last ? x.last.d : null, h: Number.isFinite(h) ? h : null } : null; save(); badge(); } return; }
    if (t.id === 'ckNote') { const r = D.run[k] || (D.run[k] = { c: {}, s: Date.now() }); r.n = t.value; save(); return; }
    if (t.id === 'ckFile' && t.files[0]) { restore(t.files[0]); t.value = ''; }
  }
  function onSubmit(e) {
    const f = e.target.closest('[data-ckf]'); if (!f || !box() || !box().contains(f)) return;
    e.preventDefault();
    const w = f.dataset.ckf;
    if (w === 'hours') {
      const v = parseFloat(String($('ckH').value).replace(',', '.'));
      if (setHours(v)) { save(); render(); badge(); toast(`Ore motore: ${fmtH(v)} h`); }
      return;
    }
    if (w === 'add') {
      const v = $('ckNew').value.trim(); if (!v) return;
      const it = { id: uid(), t: v };
      if (view === 'man') Object.assign(it, { h: null, m: 12, last: null });
      D.lists[view].push(it); save(); render(); const n = $('ckNew'); if (n) n.focus(); toast('Voce aggiunta');
      return;
    }
    if (w === 'boat') {
      const pnum = id => { const v = parseFloat(String($(id) ? $(id).value : '').replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null; };
      const nb = { brand: $('ckBb').value.trim(), model: $('ckBm').value.trim(), kind: $('ckBk').value, eng: $('ckE').value,
        ebrand: $('ckEb').value.trim(), emodel: $('ckEm').value.trim(), n: +$('ckN').value || 1, hp: pnum('ckHp'), len: pnum('ckLen'), draft: pnum('ckDr') };
      if (nb.kind === 'remi' && nb.eng !== 'el') nb.eng = 'none';
      const g = engGuess(nb.ebrand, nb.emodel);
      if (g && g !== nb.eng && !$('ckE').dataset.man && nb.kind !== 'remi') { nb.eng = g; toast('Motore riconosciuto: ' + ENG[g]); }
      const first = !D.boat, changed = !first && (D.boat.kind !== nb.kind || D.boat.eng !== nb.eng || (profileOf(nb) ? profileOf(nb).id : null) !== (D.boat.prof || null));
      if (!first) nb.prof = D.boat.prof;
      D.boat = nb;
      if (first) {
        D.lists = build(nb);
        const h0 = $('ckH0') && parseFloat(String($('ckH0').value).replace(',', '.'));
        if (Number.isFinite(h0) && motor()) setHours(h0, true);
      }
      save(); view = changed ? 'boat' : 'home'; render(); badge(); syncBoat();
      toast(first ? 'Check-list pronte: puoi modificare ogni voce' : changed ? 'Barca salvata. Hai cambiato mezzo o motore: tocca "Rifai le voci" per avere i controlli adatti' : 'Barca salvata');
    }
  }

  function saveReport(k) {
    const L = D.lists[k], r = D.run[k] || { c: {} };
    const note = ($('ckNote') && $('ckNote').value.trim()) || '';
    const done = L.filter(it => r.c[it.id]).length;
    if (!done && !note) { toast('Spunta almeno una voce prima di salvare'); return; }
    let h = null;
    if (motor() && k !== 'nav') {
      const raw = $('ckRH') ? String($('ckRH').value).trim() : '';
      if (raw) { const v = parseFloat(raw.replace(',', '.')); if (!setHours(v)) return; h = D.hours.h; }
      else if (k === 'rit') { toast('Scrivi le ore motore all\'arrivo'); $('ckRH').focus(); return; }
    }
    D.reports.unshift({ id: uid(), list: k, d: Date.now(), h: h != null ? h : (motor() ? curH() : null), boat: boatName() + (engName() ? ' – ' + engName() : ''),
      items: L.map(it => ({ t: it.t, ok: r.c[it.id] ? 1 : 0 })), n: note });
    if (D.reports.length > 1000) D.reports.length = 1000;
    D.run[k] = null; save(); view = 'home'; render(); badge();
    toast(done === L.length ? 'Report salvato' : `Report salvato: ${L.length - done} voci non spuntate`);
    const n = dueCount(); if (n && k === 'rit') setTimeout(() => toast(`${n} manutenzion${n === 1 ? 'e da fare' : 'i da fare'}: guarda Manutenzione`), 2600);
  }

  const slug = () => (boatName() || 'barca').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'barca';
  function reportsText() {
    const lines = [`Rotta Nautica – report check-list`, `Barca: ${boatName()}`, `Motore: ${engName()}`, curH() != null ? `Ore motore: ${fmtH(curH())} h (${fmtD(D.hours.d)})` : '', ''];
    D.reports.forEach(r => {
      lines.push(`== ${LISTS[r.list] ? LISTS[r.list].t : r.list} – ${fmtDT(r.d)}${r.h != null ? ' – ' + fmtH(r.h) + ' h' : ''}`);
      r.items.forEach(i => lines.push(`${i.ok ? '[x]' : '[ ]'} ${i.t}`));
      if (r.n) lines.push('Note: ' + r.n);
      lines.push('');
    });
    return lines.filter((l, i) => l !== '' || i > 3).join('\n');
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function restore(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || d.v !== 1 || !d.boat || !d.lists || !['pre', 'nav', 'rit', 'man'].every(k => Array.isArray(d.lists[k]))) throw new Error('formato');
      d.run = d.run || {}; d.reports = Array.isArray(d.reports) ? d.reports : []; d.hoursLog = d.hoursLog || [];
      D = d; save(); view = 'home'; render(); badge(); toast('Copia caricata: ' + (boatName() || 'barca'));
    } catch (e) { toast('Il file non è una copia valida delle check-list'); }
  }

  /* dati per la sezione Barca della navigazione (mezzo, potenza totale, lunghezza, pescaggio) */
  function boatInfo() {
    if (!D.boat) return null;
    const b = D.boat, noEng = /^(el|none)$/.test(b.eng) && b.eng === 'none';
    return { name: [b.brand, b.model].filter(Boolean).join(' '), kind: b.kind, hp: noEng ? 0 : b.hp != null ? Math.round(b.hp * (+b.n || 1)) : null,
      len: b.len || null, draft: b.draft != null ? b.draft : null, n: +b.n || 1 };
  }
  function syncBoat() { if (D.boat && window.rnBoatSync) { window.rnBoatSync(boatInfo()); D.boat.synced = 1; save(); } }

  /* numero di manutenzioni da fare sul pulsante del menu principale */
  function badge() {
    const n = dueCount();
    document.querySelectorAll('[data-ckbadge]').forEach(el => { el.textContent = n || ''; el.hidden = !n; });
  }

  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  window.RNCheck = {
    render: () => { edit = false; confirmKey = null; render(); },
    badge, dueCount,
    _data: () => D, _guess: engGuess, boatInfo, syncBoat
  };
  /* la prima volta dopo l'aggiornamento: passa alla sezione Barca la scheda già compilata */
  const boot = () => { badge(); if (D.boat && !D.boat.synced) syncBoat(); };
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
