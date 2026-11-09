#!/usr/bin/env python3
"""
Scarica la batimetria EMODnet (modello digitale "mean", circa 115 m) per i mari italiani a riquadri di 1° × 1°
e la salva come PNG in depth/d_<lat>_<lng>.png, con l'indice depth/index.json.

Codifica dei pixel: R = decimetri // 256, G = decimetri % 256, B = 255 dove c'è mare con profondità nota,
B = 0 su terra o dove il dato manca. Profondità = (R*256 + G) / 10 metri.

Lo esegue l'azione GitHub "Aggiorna dati nautici" (passaggio profondità). Requisiti: pip install rasterio numpy pillow
Fonte: EMODnet Bathymetry Consortium, EMODnet Digital Bathymetry (DTM). Uso libero citando la fonte.
"""
import io
import json
import os
import sys
import time
import urllib.request

import numpy as np
import rasterio
from PIL import Image

LAT = (36, 47)   # angoli sud-ovest inclusi
LNG = (6, 18)
OUT = "depth"
WCS = ("https://ows.emodnet-bathymetry.eu/wcs?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
       "&CoverageId=emodnet__mean&SUBSET=Lat({s},{n})&SUBSET=Long({w},{e})&FORMAT=image/tiff")


def fetch(url, tries=4):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "rotta-nautica (" + os.environ.get("GITHUB_REPOSITORY", "local") + ")"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
            if data[:2] in (b"II", b"MM"):   # firma TIFF
                return data
            last = data[:300].decode("utf8", "replace")
        except Exception as e:  # noqa: BLE001
            last = str(e)
        time.sleep(10 * (k + 1))
    raise RuntimeError(last)


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for la in range(LAT[0], LAT[1] + 1):
        for lo in range(LNG[0], LNG[1] + 1):
            tid = f"d_{la}_{lo}"
            try:
                tif = fetch(WCS.format(s=la, n=la + 1, w=lo, e=lo + 1))
            except Exception as e:  # noqa: BLE001
                print(f"{tid}: non scaricato ({str(e)[:120]})")
                continue
            with rasterio.open(io.BytesIO(tif)) as ds:
                z = ds.read(1).astype("float64")
                nod = ds.nodata
                b = ds.bounds
            valid = np.isfinite(z)
            if nod is not None:
                valid &= z != nod
            sea = valid & (z < 0)
            if not sea.any():
                print(f"{tid}: solo terra, saltato")
                continue
            dm = np.clip(np.round(-z * 10), 1, 65535)
            dm[~sea] = 0
            dm = dm.astype("uint32")
            img = np.zeros(z.shape + (3,), dtype="uint8")
            img[..., 0] = (dm // 256).astype("uint8")
            img[..., 1] = (dm % 256).astype("uint8")
            img[..., 2] = np.where(sea, 255, 0).astype("uint8")
            path = f"{OUT}/{tid}.png"
            Image.fromarray(img, "RGB").save(path, optimize=True)
            tiles.append({"id": tid, "file": f"{tid}.png", "s": b.bottom, "w": b.left, "n": b.top, "e": b.right,
                          "width": int(z.shape[1]), "height": int(z.shape[0]), "bytes": os.path.getsize(path)})
            print(f"{tid}: {z.shape[1]}x{z.shape[0]} px, {os.path.getsize(path) / 1e6:.2f} MB")
            time.sleep(1)
    if not tiles:
        sys.exit("Nessun riquadro di profondità scaricato")
    with open(f"{OUT}/index.json", "w") as f:
        json.dump({"format": "rotta-depth-1", "source": "EMODnet Digital Bathymetry (DTM), mean", "unit": "dm",
                   "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tiles": tiles}, f, indent=1)
    print(f"Fatto: {len(tiles)} riquadri di profondità")


if __name__ == "__main__":
    main()
