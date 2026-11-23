/* Versione senza pubblicità (pubblicita.js) e pubblicità nell'APK.
   Da compilare quando Stripe e AdMob sono pronti (vedi PRO.md). Finché i link sono vuoti l'acquisto risulta "non ancora attivo";
   finché admobBanner è vuoto, nell'APK compaiono gli annunci di prova di Google (con la scritta "Test Ad"). */
window.RN_PRO = {
  linkUnico: 'https://buy.stripe.com/test_cNi5kv3YC5Wb7L81HQ6AM01',      // Payment Link Stripe dell'acquisto unico, es. 'https://buy.stripe.com/xxxx'
  linkAnnuale: 'https://buy.stripe.com/test_9B6aEP3YC98n1mK0DM6AM02',    // Payment Link Stripe dell'abbonamento annuale
  portale: '',        // link al portale clienti Stripe (per disdire o cambiare carta)
  prezzoUnico: '4,99 €',
  prezzoAnnuale: '9,99 € l\'anno',
  admobBanner: ''     // ID del blocco annunci banner AdMob, es. 'ca-app-pub-1234567890123456/1234567890'
};
