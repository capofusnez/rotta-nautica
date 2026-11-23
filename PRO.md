# Versione senza pubblicità: come attivarla

L'app è una sola. Nell'APK chi non ha pagato vede un piccolo banner di Google AdMob, solo mentre è aperto un menu. Chi ha fatto l'accesso con Google e ha pagato non vede pubblicità, né sul sito né nell'APK, su tutti i dispositivi con lo stesso account. Sul sito la pubblicità non c'è mai.

Funziona così:

1. Nell'app, in **Barca e account**, l'utente collegato tocca "Per sempre" o "Un anno". Si apre la pagina di pagamento di Stripe, con il codice dell'account nel link (`client_reference_id`).
2. Dopo il pagamento Stripe chiama la funzione Firebase `stripeWebhook` (`functions/index.js`).
3. La funzione scrive nel database `pro/<codice utente>` e l'app toglie la pubblicità in pochi secondi.

Finché i link in `pro-config.js` sono vuoti, l'acquisto risulta "non ancora attivo". Finché manca il codice AdMob, nell'APK compaiono gli annunci di prova di Google, con la scritta "Test Ad".

## 1. Firebase: piano Blaze

Le funzioni di Firebase richiedono il piano **Blaze** (a consumo). Per questo uso si resta quasi sempre nella quota gratuita, ma serve una carta.

1. Apri console.firebase.google.com e il progetto rotta-nautica.
2. In basso a sinistra tocca **Esegui l'upgrade** e scegli Blaze.
3. Imposta un avviso di budget, per esempio 5 €.

## 2. Account di servizio per pubblicare da GitHub

1. Apri console.cloud.google.com, progetto rotta-nautica, poi **IAM e amministrazione → Account di servizio → Crea account di servizio**. Nome: `github-deploy`.
2. Assegnagli questi ruoli:
   - **Editor**
   - **Amministratore Cloud Functions**
   - **Amministratore Cloud Run**
   - **Utente account di servizio**
3. Apri l'account appena creato, poi **Chiavi → Aggiungi chiave → JSON**. Si scarica un file.
4. Su GitHub apri il repository, poi **Settings → Secrets and variables → Actions → New repository secret**.
   - Nome: `FIREBASE_SERVICE_ACCOUNT`.
   - Valore: tutto il contenuto del file JSON.
5. Cancella il file dal computer.

## 3. Stripe

1. Crea l'account su stripe.com. Per le prove puoi lavorare in **modalità test**.
2. In **Catalogo prodotti** crea il prodotto "Rotta Nautica senza pubblicità" con due prezzi:
   - pagamento **una tantum**, per esempio 4,99 €;
   - **ricorrente annuale**, per esempio 9,99 €.
3. Crea un **Payment Link** per ciascun prezzo.
   - In "Dopo il pagamento" scegli di mostrare una pagina di conferma, oppure di reindirizzare a https://capofusnez.github.io/rotta-nautica/
4. In **Impostazioni → Portale clienti** attiva il portale e copia il suo link: serve per disdire l'abbonamento.
5. In **Sviluppatori → Chiavi API** copia la **chiave segreta** (`sk_test_...` o `sk_live_...`).
6. Su GitHub aggiungi il segreto `STRIPE_SECRET_KEY` con quella chiave.

## 4. Prima pubblicazione della funzione

1. Su GitHub apri **Actions → Pubblica funzioni Firebase → Run workflow** e scegli "funzione e regole".
2. Pubblica anche le regole del database: non devi più incollarle a mano.
3. In Stripe apri **Sviluppatori → Webhook → Aggiungi endpoint**.
   - URL: `https://europe-west1-rotta-nautica.cloudfunctions.net/stripeWebhook`
   - Eventi:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `invoice.paid`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
4. Copia il **segreto di firma** del webhook (`whsec_...`) e aggiungilo su GitHub come segreto `STRIPE_WEBHOOK_SECRET`.
5. Rilancia **Pubblica funzioni Firebase**.

## 5. Link nell'app

In `pro-config.js` incolla:

- in `linkUnico` e `linkAnnuale`, i due Payment Link;
- in `portale`, il link del portale clienti;
- in `prezzoUnico` e `prezzoAnnuale`, i prezzi da mostrare.

## 6. AdMob (pubblicità nell'APK)

1. Crea l'account su admob.google.com.
2. Aggiungi un'app Android. Dato che non è sul Play Store, scegli che l'app non è pubblicata.
3. Copia il **codice app**, `ca-app-pub-…~…`. Su GitHub apri **Settings → Secrets and variables → Actions → Variables → New repository variable** e aggiungi la variabile `ADMOB_APP_ID` con quel codice.
4. Crea un **blocco di annunci banner** e copia il suo codice, `ca-app-pub-…/…`, in `admobBanner` dentro `pro-config.js`.
5. In AdMob, sotto **Privacy e messaggi**, crea il messaggio **GDPR** per l'Europa: l'app lo mostra da sola al primo avvio.

## Attivare a mano la versione senza pubblicità

Per regalarla o dopo un bonifico:

1. In Firebase apri **Realtime Database → Dati**.
2. Sotto `pro` aggiungi il codice utente della persona (lo trovi in **Authentication → Users**).
3. Dentro, aggiungi la chiave `tipo` con valore `manuale`.

Per toglierla, cancella la riga.
