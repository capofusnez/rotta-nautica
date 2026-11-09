# Carte ENC (IHO S-57) in Rotta Nautica

## 1. Procurarsi le celle
- Servono celle **S-57 non cifrate** (file `.000` più gli aggiornamenti `.001`, `.002`, …).
- Le ENC commerciali sono di norma cifrate **S-63** e GDAL non le legge: vanno decifrate con i permessi del distributore.
- Le ENC ufficiali sono coperte da licenza. **Non caricarle nel repository** né pubblicarle altrove: il pacchetto si importa nell'app sul telefono e resta lì.

## 2. Convertire (sul computer)
Serve GDAL per Python (QGIS → "OSGeo4W Shell" su Windows, `brew install gdal` su macOS, `apt install python3-gdal gdal-bin` su Linux).

```bash
python3 enc2rotta.py ENC_ROOT -o enc-rotta.json
python3 enc2rotta.py ENC_ROOT -o enc-rotta.json --bbox 12.9,45.55,13.45,45.80   # solo una zona
python3 enc2rotta.py ENC_ROOT -o enc-rotta.json --geojson geojson/              # anche un GeoJSON per layer
```

Gli aggiornamenti `.001…` accanto al `.000` vengono applicati automaticamente.

### Gli stessi layer con ogr2ogr
```bash
export OGR_S57_OPTIONS="RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=OFF,UPDATES=APPLY,LIST_AS_STRING=OFF,RECODE_BY_DSSI=ON"
for L in DEPARE DRGARE LNDARE COALNE SLCONS PONTON NAVLNE RECTRC FAIRWY OBSTRN WRECKS UWTROC M_COVR \
         BCNLAT BOYLAT BCNCAR BOYCAR BCNISD BOYISD BCNSAW BOYSAW BCNSPP BOYSPP LIGHTS TOPMAR FOGSIG; do
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7 geojson/$L.geojson CELLA.000 $L
done
# controllare cosa contiene una cella:
ogrinfo -so CELLA.000
ogrinfo CELLA.000 LIGHTS -fields=YES | less
```

## 3. Importare nell'app
Scheda **Carta → Carte ENC ufficiali → Importa pacchetto ENC** e scegli `enc-rotta.json`.
In **Avvisi** imposta **pescaggio** e **margine sotto la chiglia**.

## Come vengono usati i layer
| Layer | Uso |
|---|---|
| DEPARE, DRGARE | acqua navigabile solo se `DRVAL1` ≥ pescaggio + margine |
| LNDARE, COALNE, SLCONS, PONTON | terra, costa, moli e pontili: invalicabili |
| OBSTRN, WRECKS, UWTROC | evitati se `VALSOU` è ignota o minore di pescaggio + margine, o se emergono (`WATLEV`) |
| NAVLNE, RECTRC, FAIRWY | percorso preferito |
| M_COVR (CATCOV=1) | dove le ENC coprono decide solo l'ENC; fuori si usano i dati OpenStreetMap/OpenSeaMap |
| BCNxxx, BOYxxx, LIGHTS, TOPMAR, FOGSIG | simboli sulla carta e scheda con gli attributi S-57 decodificati |
