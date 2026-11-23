"""Segna i relitti che stanno sulla terraferma (relitti.json), per non mostrarli: aerei e carri armati nei musei,
relitti in secca su spiagge, ecc. Un relitto è "a terra" se nel raggio di circa 250 m non c'è mare nei dati EMODnet
(depth/*.png) e non sta dentro una laguna o un bacino d'acqua dei dati nautici (nautica/c_*.geojson).
Uso: python3 tools/relitti_terra.py  (riscrive relitti.json togliendo i relitti a terra)"""
import json, glob, os, sys
from PIL import Image

idx = json.load(open('depth/index.json'))
tiles, cache = idx['tiles'], {}
def px(t):
    if t['id'] not in cache:
        cache[t['id']] = Image.open(os.path.join('depth', t['file'])).convert('RGBA').load()
    return cache[t['id']]
def sea(lat, lng):
    for t in tiles:
        if t['s'] <= lat < t['n'] and t['w'] <= lng < t['e']:
            x = min(t['width'] - 1, int((lng - t['w']) / (t['e'] - t['w']) * t['width']))
            y = min(t['height'] - 1, int((t['n'] - lat) / (t['n'] - t['s']) * t['height']))
            return px(t)[x, y][2] == 255
    return None   # fuori dai dati: non si sa
def near_sea(lat, lng, r=2):
    st, known = 1 / 960, False
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            v = sea(lat + dy * st, lng + dx * st)
            if v: return True
            if v is not None: known = True
    return None if not known else False

# lagune e bacini dai dati nautici
water = []
for fn in glob.glob('nautica/c_*.geojson'):
    for f in json.load(open(fn))['features']:
        p, g = f['properties'], f['geometry']
        if g['type'] not in ('Polygon', 'MultiPolygon'): continue
        if p.get('water') in ('lagoon', 'basin', 'harbour', 'dock', 'river', 'canal') or p.get('natural') == 'water' or p.get('leisure') == 'marina' or p.get('landuse') == 'harbour':
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            for P in polys:
                xs = [c[0] for c in P[0]]; ys = [c[1] for c in P[0]]
                water.append((min(xs), min(ys), max(xs), max(ys), P))
def pip(x, y, r):
    c = False
    for i in range(len(r)):
        x1, y1 = r[i - 1]; x2, y2 = r[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def in_water(lat, lng):
    for (a, b, c, d, P) in water:
        if a <= lng <= c and b <= lat <= d and pip(lng, lat, P[0]) and not any(pip(lng, lat, h) for h in P[1:]):
            return True
    return False

d = json.load(open('relitti.json'))
keep, out = [], []
for w in d['items']:
    s = near_sea(w['lat'], w['lng'])
    # i relitti delle carte nautiche (seamark, con categoria) restano sempre: nei porti EMODnet spesso non ha dati di mare
    if s is False and not w.get('cat') and not in_water(w['lat'], w['lng']): out.append(w)
    else: keep.append(w)
for w in out: print('a terra:', w.get('name') or 'senza nome', round(w['lat'], 4), round(w['lng'], 4), w.get('cat', ''))
print(f'{len(out)} relitti a terra tolti, {len(keep)} restano')
if '--prova' not in sys.argv:
    d['items'] = keep; d['tolti_a_terra'] = len(out)
    json.dump(d, open('relitti.json', 'w'), ensure_ascii=False, separators=(',', ':'))
