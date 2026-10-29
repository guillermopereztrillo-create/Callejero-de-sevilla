#!/usr/bin/env python3
"""
Origen del nombre de cada calle, a partir de Wikipedia en español (CC BY-SA 4.0).

Para cada calle de public/datos/calles.json se busca, por este orden:
  1. un artículo sobre la propia calle («Calle Feria (Sevilla)», «Sierpes (Sevilla)»…): se toman las frases
     que explican el nombre o, si no las hay, el comienzo del artículo;
  2. el artículo de la persona, lugar, santo o advocación que da nombre a la calle («Rodrigo Caro»,
     «San Eloy» → Eligio, «Huelva»…), solo si no es una página de desambiguación y su descripción encaja
     con algo a lo que se dedica una calle (para no confundir «Calle Verde» con el color).

Escribe public/datos/etimologias.json: { id de calle: [tipo, título, descripción, texto, url] }.
Las respuestas de Wikipedia se guardan en datos-fuente/wiki/ para no repetir peticiones.

Uso:  python3 scripts/etimologias.py
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(RAIZ, 'datos-fuente', 'wiki')
API = 'https://es.wikipedia.org/w/api.php'
UA = 'CallejeroSevilla/1.0 (https://github.com/guillermopereztrillo-create/Callejero-de-sevilla)'

# descripciones (Wikidata) de lo que suele dar nombre a una calle
DEDICATORIAS = re.compile(
    r'español|española|sevillan|andaluz|hispan|escritor|poeta|pintor|escultor|arquitecto|músico|compositor|'
    r'cantante|cantaor|bailaor|torero|matador|actor|actriz|político|militar|marino|navegante|explorador|'
    r'conquistador|rey|reina|príncipe|princesa|infant|emperador|papa|santo|santa|beato|beata|obispo|arzobispo|'
    r'cardenal|sacerdote|religios|fraile|monja|mártir|advocación|virgen|cristo|cofrad|hermandad|filósofo|'
    r'historiador|científic|médic|ingenier|jurista|periodista|futbolista|deportista|empresari|humanista|'
    r'mecenas|noble|duque|marqués|conde|municipio|ciudad|capital|provincia|comarca|país|región|isla|río|'
    r'batalla|sierra|monte|pueblo|localidad|aldea|barrio|personaje|dramaturgo|novelista|ensayista|teólogo|'
    r'botánic|astrónom|matemátic|pedagog|educador|maestr|alcalde|presidente|ministro|abogado|guitarrista|'
    r'pianista|director|cineasta|fotógraf|aviador|orden religiosa|congregación|fiesta|festividad', re.I)
NOMBRE = re.compile(r'(nombre|se llam|denomin|rotul|dedicad|debe su|honor|recuerd|conocid[ao] como|apelativ)', re.I)


def log(*a):
    print('·', *a, file=sys.stderr, flush=True)


def api(**params):
    params = {'format': 'json', 'formatversion': '2', **params}
    q = urllib.parse.urlencode(sorted(params.items()))
    ruta = os.path.join(CACHE, hashlib.sha1(q.encode()).hexdigest() + '.json')
    if os.path.exists(ruta):
        return json.load(open(ruta, encoding='utf-8'))
    os.makedirs(CACHE, exist_ok=True)
    for intento in range(8):
        try:
            req = urllib.request.Request(API + '?' + q, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                datos = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
            espera = int(e.headers.get('retry-after') or 0) or 5 * (intento + 1)
            log(f'Wikipedia pide esperar {espera} s')
            time.sleep(espera + 1)
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (intento + 1))
    else:
        raise RuntimeError('Wikipedia no responde')
    json.dump(datos, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False)
    time.sleep(0.5)
    return datos


def paginas(titulos):
    """Título buscado → página (siguiendo redirecciones), por lotes de 50."""
    out = {}
    titulos = sorted(set(titulos))
    for i in range(0, len(titulos), 50):
        lote = titulos[i:i + 50]
        q = api(action='query', redirects='1', prop='pageprops|description', ppprop='disambiguation|wikibase_item', titles='|'.join(lote))['query']
        destino = {t: t for t in lote}
        for n in q.get('normalized', []):
            destino = {k: (n['to'] if v == n['from'] else v) for k, v in destino.items()}
        for r in q.get('redirects', []):
            destino = {k: (r['to'] if v == r['from'] else v) for k, v in destino.items()}
        por_titulo = {p['title']: p for p in q.get('pages', [])}
        for t in lote:
            p = por_titulo.get(destino[t])
            if p and not p.get('missing') and not p.get('invalid'):
                out[t] = p
        if i % 1000 == 0:
            log(f'títulos {i}/{len(titulos)}')
    return out


def introducciones(titulos):
    out = {}
    titulos = sorted(set(titulos))
    for i in range(0, len(titulos), 20):
        lote = titulos[i:i + 20]
        q = api(action='query', prop='extracts', exintro='1', explaintext='1', exsentences='3', titles='|'.join(lote))['query']
        for p in q.get('pages', []):
            out[p['title']] = (p.get('extract') or '').strip()
    return out


def texto_completo(titulo):
    q = api(action='query', prop='extracts', explaintext='1', titles=titulo)['query']
    return (q['pages'][0].get('extract') or '') if q.get('pages') else ''


def frases(texto):
    texto = re.sub(r'\s+', ' ', texto)
    return [f.strip() for f in re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿«])', texto) if f.strip()]


def recortar(texto, maximo=420):
    texto = re.sub(r'\s*\([^()]*\)', '', texto) if len(texto) > maximo else texto
    if len(texto) <= maximo:
        return texto
    corte = texto[:maximo].rsplit(' ', 1)[0]
    return corte.rstrip(',;:') + '…'


def main():
    calles = json.load(open(os.path.join(RAIZ, 'public', 'datos', 'calles.json'), encoding='utf-8'))
    propios, dedicados = {}, {}
    for c in calles:
        corto = (c.get('c') or '').strip()
        if not corto or corto.lower().startswith('sin nombre') or re.fullmatch(r'[\d\s]+', corto):
            continue
        propios[c['id']] = [f"{c['n']} (Sevilla)", f'{corto} (Sevilla)']
        dedicados[c['id']] = corto

    pags = paginas([t for ts in propios.values() for t in ts] + list(dedicados.values()))

    elegido = {}
    for c in calles:
        i = c['id']
        if i not in dedicados:
            continue
        # 1. artículo de la propia calle
        for t in propios[i]:
            p = pags.get(t)
            if p and 'disambiguation' not in p.get('pageprops', {}) and 'Sevilla' in (p.get('description') or '') + p['title']:
                elegido[i] = ('calle', p)
                break
        if i in elegido:
            continue
        # 2. a quién o a qué está dedicada
        p = pags.get(dedicados[i])
        if p and 'disambiguation' not in p.get('pageprops', {}) and DEDICATORIAS.search(p.get('description') or ''):
            elegido[i] = ('dedicada', p)
    log('calles con artículo propio:', sum(1 for v in elegido.values() if v[0] == 'calle'),
        '· con dedicatoria:', sum(1 for v in elegido.values() if v[0] == 'dedicada'))

    intros = introducciones([p['title'] for _, p in elegido.values()])
    completos = {}
    for tipo, p in elegido.values():
        if tipo == 'calle' and p['title'] not in completos:
            completos[p['title']] = texto_completo(p['title'])

    out = {}
    for i, (tipo, p) in sorted(elegido.items()):
        titulo = p['title']
        texto = intros.get(titulo, '')
        if tipo == 'calle':
            # las frases que explican el nombre, si el artículo las tiene
            sobre_nombre = [f for f in frases(completos.get(titulo, '')) if NOMBRE.search(f) and len(f) < 400][:2]
            if sobre_nombre:
                texto = ' '.join(sobre_nombre)
        else:
            texto = ' '.join(frases(texto)[:2])
        texto = recortar(texto.replace('\n', ' '))
        if not texto:
            continue
        out[str(i)] = [tipo, titulo, p.get('description') or '', texto, 'https://es.wikipedia.org/wiki/' + urllib.parse.quote(titulo.replace(' ', '_'))]

    ruta = os.path.join(RAIZ, 'public', 'datos', 'etimologias.json')
    json.dump(out, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    log(f'etimologias.json: {len(out)} calles · {os.path.getsize(ruta) / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
