"""Carta di base per l'uso senza rete: terraferma e mare d'Italia a riquadri di 1°.

Fonte: poligoni della terraferma di OpenStreetMap (osmdata.openstreetmap.de, land-polygons-split-4326, ODbL).
Ogni riquadro di 1° è diviso in 16 parti da 0,25°: l'app disegna solo le parti che toccano l'immagine da mostrare.
Coordinate in centomillesimi di grado (circa 1 m), ogni anello come differenze tra un punto e il precedente.

Uscita: terra/t_<lat>_<lng>.json e terra/index.json
  index: { format, created, cover: [s, w, n, e], tiles: [{ id, file, s, w, n, e, bytes }], land: [id, ...] }
  riquadri non elencati dentro "cover": tutto mare; "land": tutto terra (senza file).
"""
import json, os, sys, time, zipfile, urllib.request
from datetime import datetime, timezone

import shapefile                      # pyshp
from shapely.geometry import shape, box, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import set_precision

URL = 'https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip'
COVER = (35, 6, 48, 19)               # s, w, n, e: Italia, Corsica, Malta, coste di Francia, Slovenia e Croazia
SUB = 4                               # 4 x 4 parti per riquadro
TOL = 0.00002                         # semplificazione (circa 2 m)
Q = 100000                            # centomillesimi di grado
OUT = 'terra'


def download(path):
    if os.path.exists(path):
        return
    print('Scarico', URL, flush=True)
    t = time.time()
    urllib.request.urlretrieve(URL, path)
    print(f'  {os.path.getsize(path) / 1e6:.0f} MB in {time.time() - t:.0f} s', flush=True)


def enc_ring(coords):
    out, px, py = [], 0, 0
    for x, y in coords[:-1]:          # l'ultimo punto ripete il primo
        ix, iy = round(x * Q), round(y * Q)
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def enc_poly(p):
    rings = [enc_ring(list(p.exterior.coords))] + [enc_ring(list(r.coords)) for r in p.interiors]
    return [r for r in rings if len(r) >= 6]


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [x for x in getattr(g, 'geoms', []) if isinstance(x, Polygon)]


def main():
    os.makedirs(OUT, exist_ok=True)
    zp = 'land-polygons.zip'
    download(zp)
    with zipfile.ZipFile(zp) as z:
        names = [n for n in z.namelist() if n.endswith(('.shp', '.shx', '.dbf'))]
        z.extractall('land', names)
    shp = [os.path.join('land', n) for n in names if n.endswith('.shp')][0]
    r = shapefile.Reader(shp)
    s0, w0, n0, e0 = COVER
    cells = {}                         # (lat, lng) -> [geometrie]
    t = time.time(); kept = 0
    for i, sh in enumerate(r.iterShapes()):
        bx = sh.bbox                   # [w, s, e, n]
        if bx[2] < w0 or bx[0] > e0 or bx[3] < s0 or bx[1] > n0:
            continue
        g = shape(sh.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        kept += 1
        for la in range(max(s0, int(bx[1] // 1)), min(n0 - 1, int(bx[3] // 1)) + 1):
            for lo in range(max(w0, int(bx[0] // 1)), min(e0 - 1, int(bx[2] // 1)) + 1):
                cells.setdefault((la, lo), []).append(g)
    print(f'{kept} poligoni nella zona, {len(cells)} riquadri con terra ({time.time() - t:.0f} s)', flush=True)

    tiles, land = [], []
    for (la, lo), gs in sorted(cells.items()):
        cid = f't_{la}_{lo}'
        u = unary_union(gs).intersection(box(lo, la, lo + 1, la + 1))
        if u.is_empty:
            continue
        if u.area > 0.99999:           # tutto terra
            land.append(cid)
            continue
        parts = []
        d = 1 / SUB
        for i in range(SUB):
            for j in range(SUB):
                b = box(lo + j * d, la + i * d, lo + (j + 1) * d, la + (i + 1) * d)
                g = u.intersection(b)
                if g.is_empty or g.area < 1e-10:
                    continue
                part = {'b': [round(la + i * d, 4), round(lo + j * d, 4), round(la + (i + 1) * d, 4), round(lo + (j + 1) * d, 4)]}
                if g.area > d * d * 0.99999:
                    part['L'] = 1      # parte tutta terra
                else:
                    g = g.simplify(TOL, preserve_topology=True)
                    ps = [enc_poly(p) for p in polys(g)]
                    ps = [p for p in ps if p]
                    if not ps:
                        continue
                    part['p'] = ps
                parts.append(part)
        if not parts:
            continue
        doc = {'format': 'rotta-terra-1', 'id': cid, 's': la, 'w': lo, 'n': la + 1, 'e': lo + 1, 'q': Q, 'parts': parts}
        fn = cid + '.json'
        with open(os.path.join(OUT, fn), 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        by = os.path.getsize(os.path.join(OUT, fn))
        tiles.append({'id': cid, 'file': fn, 's': la, 'w': lo, 'n': la + 1, 'e': lo + 1, 'bytes': by})
        print(f'  {cid}: {len(parts)} parti, {by / 1e3:.0f} kB', flush=True)

    idx = {'format': 'rotta-terra-1', 'source': 'OpenStreetMap land polygons (osmdata.openstreetmap.de), ODbL',
           'created': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'cover': list(COVER), 'tiles': tiles, 'land': land}
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(idx, f, separators=(',', ':'))
    tot = sum(x['bytes'] for x in tiles)
    print(f'Fatto: {len(tiles)} riquadri con costa, {len(land)} tutti terra, {tot / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
