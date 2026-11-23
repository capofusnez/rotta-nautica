/* Rotta Nautica · attivazione della versione senza pubblicità dopo il pagamento con Stripe.
   Stripe chiama questa funzione (webhook) a ogni pagamento; la funzione scrive nel database pro/<id utente>:
     { tipo: 'unico' }                                  acquisto una volta sola, per sempre
     { tipo: 'annuale', fino: <ms>, sub: <id> }         abbonamento, valido fino alla fine del periodo pagato
   L'id utente arriva da Stripe come client_reference_id: l'app lo aggiunge al link di pagamento (pubblicita.js).
   Segreti (da GitHub, vedi .github/workflows/functions.yml): STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET. */
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp({ databaseURL: 'https://rotta-nautica-default-rtdb.europe-west1.firebasedatabase.app' });
const db = admin.database();
const okUid = u => typeof u === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(u);

async function fromSubscription(stripe, subId, uidHint) {
  const sub = await stripe.subscriptions.retrieve(subId);
  let uid = uidHint || (sub.metadata && sub.metadata.uid);
  if (!okUid(uid)) { const s = await db.ref('pro_abbonamenti/' + subId).get(); uid = s.val(); }
  if (!okUid(uid)) return null;
  await db.ref('pro_abbonamenti/' + subId).set(uid);
  /* in Stripe la fine del periodo sta sull'abbonamento (versioni vecchie) o sulla sua voce (versioni nuove) */
  const end = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end) || 0;
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const cur = (await db.ref('pro/' + uid).get()).val();
  if (cur && (cur.tipo === 'unico' || cur.tipo === 'manuale')) return uid;   // chi ha già il "per sempre" lo tiene
  await db.ref('pro/' + uid).set({ tipo: 'annuale', fino: active ? end * 1000 : Math.min(end * 1000, Date.now()), sub: subId, t: Date.now() });
  return uid;
}

exports.stripeWebhook = onRequest({ region: 'europe-west1', cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Solo POST'); return; }
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    res.status(400).send('Firma non valida'); return;
  }
  try {
    const o = ev.data.object;
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      const uid = o.client_reference_id;
      if (!okUid(uid)) { console.warn('pagamento senza id utente', o.id); res.json({ ok: true, nota: 'senza id utente' }); return; }
      if (o.mode === 'subscription' && o.subscription) {
        await stripe.subscriptions.update(o.subscription, { metadata: { uid } });
        await fromSubscription(stripe, o.subscription, uid);
      } else if (o.payment_status === 'paid') {
        await db.ref('pro/' + uid).set({ tipo: 'unico', t: Date.now(), pagamento: o.id });
      }
    } else if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted' || ev.type === 'customer.subscription.created') {
      await fromSubscription(stripe, o.id);
    } else if (ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded') {
      const subId = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
      if (subId) await fromSubscription(stripe, subId);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Errore');   // Stripe riprova da solo più tardi
  }
});
