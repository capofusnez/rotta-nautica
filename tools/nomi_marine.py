"""Nomi per marine, distributori e scivoli che in OpenStreetMap non hanno il nome (servizi.json).

Per ogni punto senza nome chiede a Nominatim (OpenStreetMap) che cosa c'è in quel punto:
- se trova una marina, un porto o una darsena con nome, usa quel nome;
- altrimenti usa la località: "Marina (Bibione)", "Distributore (Caorle)", "Scivolo (Grado)".
Il nome trovato va nel campo "nmA" (nome automatico), così l'app lo distingue da quello di OpenStreetMap.
Nominatim chiede al massimo una richiesta al secondo e un User-Agent che identifichi l'app.
"""
import json, time, urllib.request, urllib.parse, sys

UA = 'RottaNautica/1.8 (https://github.com/capofusnez/rotta-nautica)'
KIND = {'marine': 'Marina', 'carburante': 'Distributore', 'scivoli': 'Scivolo'}
PORT = {'marina', 'harbour', 'dock', 'boatyard', 'slipway', 'port', 'pier', 'fuel', 'ferry_terminal', 'basin'}
LOC = ['suburb', 'village', 'town', 'hamlet', 'city', 'locality', 'municipality']


def rev(lat, lng, zoom):
    q = urllib.parse.urlencode({'format': 'jsonv2', 'lat': lat, 'lon': lng, 'zoom': zoom, 'accept-language': 'it', 'addressdetails': 1})
    req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    d = json.load(open('servizi.json'))
    done = fail = 0
    for k, label in KIND.items():
        for o in d.get(k, []):
            if o.get('name') or o.get('nmA'):
                continue
            try:
                j = rev(o['lat'], o['lng'], 18); time.sleep(1.1)
                nm = j.get('name') if j.get('type') in PORT else None
                a = j.get('address') or {}
                loc = next((a[x] for x in LOC if a.get(x)), None)
                if not loc:
                    j2 = rev(o['lat'], o['lng'], 14); time.sleep(1.1)
                    a2 = j2.get('address') or {}
                    loc = next((a2[x] for x in LOC if a2.get(x)), None)
                o['nmA'] = nm or (f'{label} ({loc})' if loc else None)
                if not o['nmA']:
                    del o['nmA']; fail += 1
                else:
                    done += 1; print(k, o['id'], '→', o['nmA'], flush=True)
            except Exception as e:
                fail += 1; print(k, o['id'], 'errore', e, flush=True); time.sleep(3)
    json.dump(d, open('servizi.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'Fatto: {done} nomi trovati, {fail} senza')


if __name__ == '__main__':
    sys.exit(main())
