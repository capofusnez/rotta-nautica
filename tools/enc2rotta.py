#!/usr/bin/env python3
"""
enc2rotta.py — Converte carte nautiche elettroniche ENC IHO S-57 (.000 + aggiornamenti .001, .002, ...)
nel pacchetto che Rotta Nautica importa sul telefono (enc-rotta.json).
Su richiesta scrive anche un GeoJSON per ogni layer (--geojson DIR).

Requisiti: Python 3 con GDAL/OGR (pacchetto "gdal"). Il modo più semplice:
  - Windows:  installa QGIS e usa la "OSGeo4W Shell"
  - macOS:    brew install gdal   (poi:  pip3 install gdal==$(gdal-config --version))
  - Linux:    sudo apt install python3-gdal gdal-bin

Uso:
  python3 enc2rotta.py CARTELLA_ENC [altre cartelle o file .000] -o enc-rotta.json
  python3 enc2rotta.py ENC_ROOT -o enc-rotta.json --bbox 12.9,45.55,13.45,45.80
  python3 enc2rotta.py ENC_ROOT -o enc-rotta.json --geojson geojson/

ATTENZIONE
  - Le ENC cifrate S-63 (quelle commerciali, con permessi di cella) NON sono leggibili da GDAL:
    servono celle S-57 non cifrate.
  - Le ENC ufficiali sono coperte da licenza: il pacchetto prodotto va importato nell'app sul proprio
    telefono e NON va pubblicato (né su GitHub né altrove) se la licenza non lo consente.
"""
import argparse
import datetime
import json
import os
import sys

try:
    from osgeo import gdal, ogr
except ImportError:
    sys.exit("Manca GDAL per Python (modulo osgeo). Vedi le istruzioni in cima al file.")

# Opzioni del driver S-57 di GDAL:
#  UPDATES=APPLY        applica gli aggiornamenti .001, .002... presenti accanto al .000
#  RETURN_PRIMITIVES=OFF solo oggetti, non le primitive geometriche
#  SPLIT_MULTIPOINT=OFF  scandagli come multipunto (non li usiamo)
#  LIST_AS_STRING=OFF    attributi lista (COLOUR, COLPAT, ...) come liste vere
#  RECODE_BY_DSSI=ON     testi (OBJNAM, NOBJNM, INFORM) nella codifica corretta
os.environ["OGR_S57_OPTIONS"] = ("RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=OFF,UPDATES=APPLY,"
                                 "SPLIT_MULTIPOINT=OFF,ADD_SOUNDG_DEPTH=OFF,LIST_AS_STRING=OFF,RECODE_BY_DSSI=ON")
gdal.UseExceptions()

# Layer S-57 estratti e a cosa servono nell'app
LAYERS = {
    # aree e linee usate per il calcolo della rotta
    "DEPARE": "aree di profondità (DRVAL1/DRVAL2)",
    "DRGARE": "aree dragate / canali dragati (DRVAL1)",
    "LNDARE": "terra emersa",
    "COALNE": "linea di costa",
    "SLCONS": "opere costiere: moli, dighe, banchine",
    "PONTON": "pontili galleggianti",
    "NAVLNE": "allineamenti di navigazione",
    "RECTRC": "rotte raccomandate",
    "FAIRWY": "canali navigabili (fairway)",
    "OBSTRN": "ostruzioni",
    "WRECKS": "relitti",
    "UWTROC": "scogli sommersi o affioranti",
    "M_COVR": "copertura della cella",
    # segnali per la visualizzazione e la scheda
    "BCNLAT": "mede laterali", "BOYLAT": "boe laterali",
    "BCNCAR": "mede cardinali", "BOYCAR": "boe cardinali",
    "BCNISD": "mede di pericolo isolato", "BOYISD": "boe di pericolo isolato",
    "BCNSAW": "mede di acque sicure", "BOYSAW": "boe di acque sicure",
    "BCNSPP": "mede speciali", "BOYSPP": "boe speciali",
    "LIGHTS": "fari e fanali", "TOPMAR": "miragli", "DAYMAR": "segnali diurni", "FOGSIG": "segnali da nebbia",
}
DECIMALS = 7  # ~1 cm


def rnd(coords):
    if isinstance(coords, (list, tuple)):
        if coords and isinstance(coords[0], (int, float)):
            return [round(coords[0], DECIMALS), round(coords[1], DECIMALS)]
        return [rnd(c) for c in coords]
    return coords


def clean(v):
    if isinstance(v, float) and v != v:  # NaN
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    if isinstance(v, list):
        v = [x for x in (clean(x) for x in v) if x is not None]
        return v or None
    return v


def find_cells(paths):
    cells = []
    for p in paths:
        if os.path.isfile(p) and p.lower().endswith(".000"):
            cells.append(p)
        elif os.path.isdir(p):
            for root, _, files in os.walk(p):
                cells += [os.path.join(root, f) for f in files if f.lower().endswith(".000")]
    return sorted(set(cells))


def in_bbox(env, bbox):
    if not bbox:
        return True
    w, s, e, n = bbox
    minx, maxx, miny, maxy = env
    return not (maxx < w or minx > e or maxy < s or miny > n)


def cell_info(ds, path):
    info = {"name": os.path.splitext(os.path.basename(path))[0]}
    lyr = ds.GetLayerByName("DSID")
    if lyr is not None:
        f = lyr.GetNextFeature()
        if f is not None:
            d = f.items()
            for src, dst in (("DSID_EDTN", "edition"), ("DSID_UPDN", "update"), ("DSID_ISDT", "issue_date"),
                             ("DSID_UADT", "update_date"), ("DSPM_CSCL", "scale"), ("DSID_INTU", "usage_band")):
                if d.get(src) not in (None, ""):
                    info[dst] = d[src]
    return info


def convert(cells, bbox):
    out = {name: [] for name in LAYERS}
    infos, warnings = [], []
    for path in cells:
        try:
            ds = gdal.OpenEx(path, gdal.OF_VECTOR)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            warnings.append(f"{os.path.basename(path)}: non leggibile ({msg}). "
                            "Se la cella è cifrata S-63 va decifrata con i permessi del distributore.")
            continue
        info = cell_info(ds, path)
        cell = info["name"]
        env_all = None
        for name in LAYERS:
            lyr = ds.GetLayerByName(name)
            if lyr is None:
                continue
            for f in lyr:
                g = f.GetGeometryRef()
                if g is None:
                    continue
                env = g.GetEnvelope()
                env_all = env if env_all is None else (min(env_all[0], env[0]), max(env_all[1], env[1]),
                                                       min(env_all[2], env[2]), max(env_all[3], env[3]))
                if not in_bbox(env, bbox):
                    continue
                if name == "M_COVR" and f.GetField("CATCOV") not in (1, "1"):
                    continue
                gj = json.loads(g.ExportToJson())
                if gj.get("type") in ("Point", "MultiPoint") and len(gj.get("coordinates", [])) and \
                        isinstance(gj["coordinates"][0], (int, float)):
                    gj["coordinates"] = gj["coordinates"][:2]
                gj["coordinates"] = rnd(gj["coordinates"])
                props = {k: clean(v) for k, v in f.items().items()}
                props = {k: v for k, v in props.items()
                         if v is not None and k not in ("RCID", "PRIM", "GRUP", "OBJL", "RVER", "AGEN",
                                                        "FIDN", "FIDS", "LNAM", "LNAM_REFS", "FFPT_RIND")}
                props["_cell"] = cell
                out[name].append({"type": "Feature", "geometry": gj, "properties": props})
        if env_all:
            info["bbox"] = [round(env_all[0], 5), round(env_all[2], 5), round(env_all[1], 5), round(env_all[3], 5)]
        infos.append(info)
        ds = None
        print(f"  {cell}: ed. {info.get('edition', '?')} agg. {info.get('update', '?')}", file=sys.stderr)
    return out, infos, warnings


def main():
    ap = argparse.ArgumentParser(description="Converte ENC S-57 nel pacchetto per Rotta Nautica")
    ap.add_argument("inputs", nargs="+", help="cartelle ENC_ROOT o file .000")
    ap.add_argument("-o", "--output", default="enc-rotta.json", help="pacchetto da importare nell'app")
    ap.add_argument("--bbox", help="ovest,sud,est,nord per tenere solo una zona (es. 12.9,45.55,13.45,45.8)")
    ap.add_argument("--geojson", help="cartella dove scrivere anche un GeoJSON per layer")
    a = ap.parse_args()
    bbox = [float(v) for v in a.bbox.split(",")] if a.bbox else None
    cells = find_cells(a.inputs)
    if not cells:
        sys.exit("Nessun file .000 trovato.")
    print(f"Celle trovate: {len(cells)}", file=sys.stderr)
    layers, infos, warnings = convert(cells, bbox)
    for w in warnings:
        print("ATTENZIONE: " + w, file=sys.stderr)
    bundle = {
        "format": "rotta-enc-1",
        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "IHO S-57",
        "bbox": bbox,
        "cells": infos,
        "layers": {k: {"type": "FeatureCollection", "features": v} for k, v in layers.items() if v},
    }
    with open(a.output, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(a.output) / 1e6
    print(f"Scritto {a.output} ({size:.1f} MB): " +
          ", ".join(f"{k} {len(v)}" for k, v in layers.items() if v), file=sys.stderr)
    if a.geojson:
        os.makedirs(a.geojson, exist_ok=True)
        for k, v in layers.items():
            if v:
                with open(os.path.join(a.geojson, k + ".geojson"), "w", encoding="utf-8") as fh:
                    json.dump({"type": "FeatureCollection", "features": v}, fh, ensure_ascii=False)
        print(f"GeoJSON per layer in {a.geojson}/", file=sys.stderr)
    if not layers.get("DEPARE") and not layers.get("DRGARE"):
        print("ATTENZIONE: nessuna area di profondità (DEPARE/DRGARE): il calcolo della rotta con le ENC "
              "non sarà possibile in questa zona.", file=sys.stderr)


if __name__ == "__main__":
    main()
