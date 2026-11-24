# Community e moderazione

Per partecipare serve l'**accesso con Google** in **Barca → Barche con Rotta Nautica**. Leggere recensioni e punti condivisi è possibile anche senza accesso.

## Recensioni

Il pulsante **★ Recensioni** c'è su:
- marine, distributori e scivoli;
- punti di fonda;
- zone di pesca;
- punti della community;
- relitti.

Dai da 1 a 5 stelle e scrivi un commento: una recensione per persona per luogo, che puoi modificare o cancellare. Le recensioni sono pubbliche, con il nome del tuo account Google.

## Condividere i tuoi punti

**Punti pesca, immersioni, punti di fonda, soste**
1. Tocca il punto sulla carta.
2. Premi **Condividi con la community**.
3. Scrivi il nome e le note per gli altri: cosa si pesca, con che tecnica, profondità, fondale.
4. Scegli se **mostrare il tuo nome** e tocca **Invia ai moderatori**.

**Relitti**
1. Aggiungi un punto di tipo **🚢 Relitto**.
2. Nella scheda che si apre scrivi nome, profondità e note.
3. Lascia spuntato **Condividi con la community** e scegli se mostrare il tuo nome.
4. Tocca **Salva**.

**Ricerca automatica:** mentre compili, l'app cerca da sola su Wikipedia (in italiano, poi in inglese) le voci su relitti e naufragi con quel nome o entro 10 km dalla posizione. Se trova il relitto completa i campi vuoti (nome e note) e allega alla segnalazione la **scheda con la storia**, con il link alla fonte. Se non è il relitto giusto tocca **Non è questo relitto**. Il moderatore vede la scheda allegata prima di approvare.

Il punto resta sempre tra i tuoi e lo vedi subito. Gli altri lo vedono dopo l'**approvazione di un moderatore**.

Sulla carta i punti e i relitti approvati compaiono con il contorno arancione tratteggiato. Si vedono finché in **Punti di interesse** è spuntato **Mostra i punti e i relitti condivisi dagli altri utenti**, anche con lo strato **Relitti** spento.

## Correggere un relitto

Nella scheda del relitto (**Approfondisci**):
- **Nome del relitto**: per i relitti senza nome. Il nome lo vedi tu; se spunti **Condividi con la community**, dopo l'approvazione lo vedono tutti, con "proposto da …".
- **📍 Correggi la posizione**: indica la posizione giusta in uno di questi modi:
  - con le coordinate;
  - con **Usa la mia posizione**;
  - con **Scegli sulla carta**: sposta la carta finché il mirino è sul relitto e tocca **Conferma questo punto**.

## Per i moderatori

I moderatori vedono nel **Menu** il pulsante **Moderazione**. Gli altri utenti non lo vedono. Il **pallino rosso** indica quante cose ci sono da controllare.

- **Nomi dei relitti**, **Relitti segnalati**, **Punti condivisi**:
  - **Approva**, e la proposta diventa visibile a tutti;
  - **Rifiuta**;
  - **Vedi sulla carta**, con il punto proposto in un cerchio arancione.

  Per le correzioni di posizione compare anche di quanto si sposta il relitto.

  **Approva come**: prima di approvare puoi cambiare il tipo. Per esempio un relitto segnalato che è meglio come 🐟 punto pesca, o un punto pesca che in realtà è un 🚢 relitto. Si può scegliere tra relitto, punto pesca, immersione, punto di fonda e sosta per il bagno.
- **Già approvati**: puoi togliere un nome, eliminare un relitto o un punto della community, o riportare un relitto alla posizione originale. Per relitti e punti c'è anche **Tipo** con **Cambia tipo**, per correggere il tipo dopo l'approvazione. I pulsanti rossi chiedono un **secondo tocco** di conferma. Gli stessi pulsanti ci sono nella scheda del relitto e nel riquadro del punto sulla carta.
- Sotto ogni recensione c'è **Cancella (moderatore)**.

### Aggiungere o togliere un moderatore

Si fa dalla console di Firebase:
1. In **Authentication → Users** copia l'**UID utente** della persona. Deve aver fatto l'accesso nell'app almeno una volta.
2. In **Realtime Database → Dati**, dentro `moderatori`, aggiungi una riga con quell'UID e valore `true` (tipo boolean).
3. Per togliere un moderatore cancella la riga.

Il pulsante Moderazione compare o sparisce subito.

## Regole

Scrivi solo cose vere e rispettose: niente offese, pubblicità o dati personali di altri. I moderatori possono rifiutare o cancellare i contenuti fuori regola. Vedi le [condizioni d'uso](https://capofusnez.github.io/rotta-nautica/privacy.html).
