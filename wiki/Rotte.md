# Rotte

## La rotta automatica via acqua

Quando partenza e destinazione sono impostate, l'app calcola da sola una rotta che passa solo in acqua:

- **in laguna, nei porti e nei fiumi** segue i canali segnati dalle **briccole** (dati OpenStreetMap / OpenSeaMap) e non attraversa barene e secche note;
- **darsene e porticcioli** sono acqua libera, anche quando stanno dentro la laguna (per esempio Aprilia Marittima);
- **in mare** esce dalle bocche di porto e si tiene lontana dalla riva, **entro la distanza dalla costa consentita** da patente e mezzo (vedi [[Barca e account]]);
- tiene conto del **pescaggio** per evitare i fondali troppo bassi dei dati EMODnet.

Il pulsante **Ricalcola rotta** rifà il calcolo, per esempio dopo aver cambiato i dati della barca. Con **Mostra acque navigabili** vedi sulla carta dove l'app considera navigabile.

> ⚠️ Canali e briccole vengono dai dati dei volontari e possono mancare o essere spostati. Controlla sempre la rotta e **segui i segnalamenti in acqua**.

### Tratti fuori canale

Vicino alla partenza e all'arrivo la rotta può uscire dai canali per qualche centinaio di metri, per esempio per arrivare dal posto barca all'inizio delle briccole. Nella scheda Rotta questi tratti sono segnalati con la loro lunghezza.

## Scegliere il passaggio con le tappe

Se ci sono più strade, per esempio via mare o via canali interni, l'app sceglie la più breve. Per seguirne un'altra:

1. Tocca **+ Tappa**.
2. Tocca la carta nel punto da cui vuoi passare. Puoi toccare più punti.
3. La rotta si ricalcola passando dalle tappe.

Per togliere una tappa tocca ✕ accanto al suo nome. Per spostarla trascinala sulla carta.

**Esempio:** da Porto Baseleghe ad Ai Ciodi via canali metti una tappa sul Fiume Stella. Per andarci via mare mettila in mare davanti alla costa.

## Cercare un luogo

Nella casella **Cerca** in cima alla scheda Rotta puoi scrivere:
- il nome di un porto, di una località o di un locale;
- delle coordinate, decimali (`45.64, 13.04`) o in gradi, primi e secondi (`45°38'24"N 13°02'24"E`).

Per ogni risultato puoi scegliere **Partenza**, **Tappa**, **Destinazione** o vederlo sulla carta.

## Rotte salvate e GPX

- **Salva**: dai un nome alla rotta (es. "Ai Ciodi via mare").
- **Carica**: la ritrovi nell'elenco delle rotte salvate.
- **Inverti rotta**: scambia partenza e destinazione, utile per il ritorno.
- **Cancella rotta**: toglie la rotta dalla carta; quelle salvate restano.
- **Esporta GPX** e **Importa GPX**: il formato usato da plotter e GPS, per passare la rotta ad altri.

## Se il calcolo non riesce

Compare un messaggio con il motivo. Sulla carta due **cerchi rossi** segnano il tratto in cui l'app non trova un passaggio.

| Messaggio | Cosa fare |
|---|---|
| Nessun passaggio nei canali dei dati nautici | In quel tratto mancano briccole o c'è una zona vietata: aggiungi una tappa dove sai che si passa |
| Serve la connessione | La carta della zona non è in memoria: riprova con la rete o scarica il pacchetto dati |
| Troppo lontano dall'acqua | Sposta partenza o destinazione più vicino all'acqua |

Se il problema si ripete sempre nello stesso posto, mandaci uno screenshot: spesso si risolve correggendo i dati.
