/* Pubblicità e versione senza pubblicità ("Pro").
   - Pubblicità: solo nell'APK (Google AdMob, plugin @capacitor-community/admob), un banner in basso solo mentre è aperto
     un menu, mai sulla carta durante la navigazione. Prima chiede il consenso con il modulo di Google previsto in Europa.
   - Pro: chi ha fatto l'accesso e ha pagato (Stripe, vedi functions/index.js) non vede pubblicità, su tutti i dispositivi.
   - Il riquadro in Barca e account (#proBox) mostra lo stato e i pulsanti per acquistare. */
(function () {
  'use strict';
  const CFG = window.RN_PRO || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = window.Capacitor;
  const native = !!(cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.platform && cap.platform !== 'web'));
  const AD = native && cap.Plugins ? cap.Plugins.AdMob : null;
  const TEST_BANNER = 'ca-app-pub-3940256099942544/6300978111';   // annuncio di prova ufficiale di Google
  const F = () => window.Flotta;
  const isPro = () => !!(F() && F().isPro && F().isPro());
  const termsOk = () => { try { return !!JSON.parse(localStorage.getItem('rn.terms') || 'null'); } catch (e) { return false; } };

  /* ---------- annunci (solo APK) ---------- */
  let adReady = false, adShown = false, adStarting = null;
  async function adInit() {
    if (!AD || adReady) return adReady;
    if (adStarting) return adStarting;
    adStarting = (async () => {
      try {
        await AD.initialize({});
        try {
          const ci = await AD.requestConsentInfo();
          if (ci && ci.isConsentFormAvailable && ci.status === 'REQUIRED') await AD.showConsentForm();
        } catch (e) { /* senza modulo di consenso si usano annunci non personalizzati */ }
        adReady = true;
      } catch (e) { adReady = false; }
      return adReady;
    })();
    return adStarting;
  }
  const navH = () => { const n = document.querySelector('#tabs, nav.tabs, .tabbar'); return n ? Math.round(n.getBoundingClientRect().height) : 0; };
  async function adShow() {
    if (!AD || isPro() || !termsOk()) return adHide(true);
    if (!(await adInit())) return;
    if (isPro()) return adHide(true);
    try {
      if (!adShown) {
        await AD.showBanner({ adId: CFG.admobBanner || TEST_BANNER, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: navH(), isTesting: !CFG.admobBanner });
        adShown = true;
      } else await AD.resumeBanner();
      document.body.classList.add('adOn');
    } catch (e) { /* nessun annuncio disponibile: non è un errore */ }
  }
  async function adHide(remove) {
    document.body.classList.remove('adOn');
    if (!AD || !adShown) return;
    try { if (remove) { await AD.removeBanner(); adShown = false; } else await AD.hideBanner(); } catch (e) { /* ignora */ }
  }
  /* il banner compare solo con un menu aperto */
  function watchSheet() {
    const sh = $('sheet'); if (!sh) return;
    const upd = () => { if (sh.hidden || sh.classList.contains('min')) adHide(false); else adShow(); };
    new MutationObserver(upd).observe(sh, { attributes: true, attributeFilter: ['hidden', 'class'] });
    upd();
  }

  /* ---------- riquadro Pro in Barca e account ---------- */
  const fmtD = t => new Date(+t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  function link(base, u) {
    if (!base) return '';
    const q = new URLSearchParams({ client_reference_id: u.uid }); if (u.email) q.set('prefilled_email', u.email);
    return base + (base.includes('?') ? '&' : '?') + q.toString();
  }
  function renderPro() {
    const el = $('proBox'); if (!el) return;
    const f = F(), u = f && f.user;
    let h = '<h4>Rotta Nautica senza pubblicità</h4>';
    if (!u) {
      h += '<p class="note">Con un piccolo contributo togli la pubblicità e sostieni lo sviluppo dell\'app. Per acquistare e usarla su tutti i tuoi dispositivi accedi con Google qui sopra.</p>';
    } else if (isPro()) {
      const p = f.pro || {};
      h += `<p class="note ckOk">Versione senza pubblicità attiva${p.tipo === 'annuale' && p.fino ? `: abbonamento valido fino al ${fmtD(p.fino)}` : ''}. Grazie del sostegno!</p>` +
        (p.tipo === 'annuale' && CFG.portale ? `<p class="note"><a href="${esc(CFG.portale)}" target="_blank" rel="noopener">Gestisci l'abbonamento</a> (disdetta, carta di pagamento).</p>` : '');
    } else if (!CFG.linkUnico && !CFG.linkAnnuale) {
      h += '<p class="note">L\'acquisto non è ancora attivo: arriverà presto.</p>';
    } else {
      const p = f.pro;
      h += (p && p.tipo === 'annuale' && p.fino ? `<p class="note ckWarn">Il tuo abbonamento è scaduto il ${fmtD(p.fino)}.</p>` : '') +
        '<p class="note">Togli la pubblicità su tutti i tuoi dispositivi con questo account Google. Il pagamento è gestito da Stripe: dopo il pagamento torna nell\'app, si attiva da sola in pochi secondi.</p>' +
        '<div class="btns">' + (CFG.linkUnico ? `<a class="btn primary" href="${esc(link(CFG.linkUnico, u))}" target="_blank" rel="noopener">Per sempre · ${esc(CFG.prezzoUnico || '')}</a>` : '') +
        (CFG.linkAnnuale ? `<a class="btn" href="${esc(link(CFG.linkAnnuale, u))}" target="_blank" rel="noopener">Un anno · ${esc(CFG.prezzoAnnuale || '')}</a>` : '') + '</div>' +
        '<p class="note">Usa nel pagamento la stessa email dell\'account Google con cui sei collegato qui.</p>';
    }
    if (!native) h += '<p class="note">Sul sito non c\'è pubblicità: compare solo nell\'app Android.</p>';
    el.innerHTML = h;
  }

  let lastPro = null;
  function onFleet() {
    const p = isPro();
    if (p !== lastPro) { lastPro = p; if (p) adHide(true); else { const sh = $('sheet'); if (sh && !sh.hidden) adShow(); } }
    renderPro();
  }
  function boot() {
    renderPro(); watchSheet();
    if (F()) F().on(onFleet);
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
  window.RNPro = { render: renderPro, isPro };
})();
