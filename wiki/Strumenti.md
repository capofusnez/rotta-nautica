# Strumenti

## In alto, sempre visibili

| Dato | Cosa indica |
|---|---|
| **Velocità** | Velocità rispetto al fondo (SOG), in nodi (1 nodo = 1,852 km/h) |
| **Direzione** | Direzione in cui ti muovi davvero (COG), in gradi: 0° nord, 90° est |
| **Distanza** | Distanza dal prossimo punto della rotta |
| **Arrivo** | Ora prevista di arrivo |

## Scheda Bordo

Accanto a ogni dato c'è una **"i"**: toccala per leggerne la spiegazione.

**Navigazione**
- **Velocità (SOG)** e **Direzione (COG)**.
- **Distanza dalla costa**: dalla riva più vicina, isole comprese, aggiornata ogni pochi secondi. Viene dai dati EMODnet (celle di circa 115 m), quindi è indicativa. In porto o in darsena compare "in porto o a riva". Con il GPS spento è calcolata dal centro della carta.
- **Fondale (EMODnet)**: profondità indicativa nel punto. Non è un ecoscandaglio: vicino a riva e in laguna può essere molto diversa.
- **Rilevamento**: direzione, in gradi, verso il prossimo punto.
- **Fuori rotta (XTE)**: D = sei a dritta della rotta, S = a sinistra.
- **VMG**: la parte della velocità che ti avvicina davvero al punto.
- **Tempi**: tempo e ora di arrivo al punto, distanza rimanente, arrivo finale.
- **Posizione**: in gradi e primi, il formato delle comunicazioni radio.

**L'uscita**
- Percorso, tempo, velocità media e massima.
- Precisione GPS: sotto 10 m è buona.

**Meteo** (con la rete)
- Vento e raffica in nodi.
- Onda: altezza significativa.
- Pressione: se scende più di 3 hPa in 3 ore, di solito arriva brutto tempo.

**Altro**
- Deriva ancora.
- Ora UTC.

**Come leggerli insieme:** per andare dritto al punto porta la Direzione uguale al Rilevamento. Se il fuori rotta cresce, correggi verso il lato opposto.

## Carta e livelli

Il pulsante **Carta** a destra apre i livelli:

- **Carta** o **Satellite**. Google strade o satellite si usano solo con una tua chiave API.
- **Segnali nautici** di OpenSeaMap: toccali per vedere colore, luce e significato.
- **Profondità** (EMODnet): colora il mare in base al fondale.
- **Linee batimetriche**: linee di uguale profondità.
  - Da vicino: 2, 5, 10, 20 e 50 m.
  - Da lontano: fino a 1000 m.
  - Sono calcolate sul telefono e funzionano anche senza rete.
- **Traccia percorsa**, con **Azzera traccia e statistiche** ed **Esporta traccia GPX**.
- **Traffico navale (AIS)**: aggiunge il pulsante AIS. Serve internet e mostra solo le navi con trasponditore acceso.
- **Carte ENC (S-57)**: carte nautiche elettroniche da importare come pacchetto.
- **Dati per l'uso senza rete**: scarica i dati nautici e le profondità sul telefono; c'è l'opzione "solo con il Wi-Fi". Con il pacchetto si salvano anche relitti, marine, zone di pesca e punti di fonda.
- **Carta senza rete**: scarica le immagini della carta (e dei segnali OpenSeaMap, se accesi) della zona visibile o intorno alla rotta, fino all'ingrandimento 15. **Interrompi** ferma lo scaricamento, **Cancella** toglie le carte scaricate. Se la zona è troppo grande, avvicina la carta.

## Sulla carta

- **Freccia**: la barca, orientata nella direzione di movimento. La linea davanti mostra dove sarai tra qualche minuto.
- **Linea viola**: la rotta. **Linea arancione**: la traccia percorsa.
- **Pallino P**: partenza. **Pallino D**: destinazione. **Pallini numerati**: tappe.
- **Rombo rosso con cerchio**: secca o ostacolo segnato. **Cerchio giallo**: raggio dell'ancora.
- I simboli dei punti di interesse sono spiegati in [[Punti di interesse]].
