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
import unicodedata
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


def miembros(categoria, nivel=0):
    """Títulos de los artículos de una categoría (y de sus subcategorías, hasta dos niveles)."""
    out, seguir = [], {}
    while True:
        q = api(action='query', list='categorymembers', cmtitle=categoria, cmlimit='500', cmtype='page|subcat', **seguir)
        for m in q.get('query', {}).get('categorymembers', []):
            if m['ns'] == 14 and nivel < 2:
                out += miembros(m['title'], nivel + 1)
            elif m['ns'] == 0:
                out.append(m['title'])
        if 'continue' not in q:
            return out
        seguir = {'cmcontinue': q['continue']['cmcontinue']}


def introducciones(titulos):
    out = {}
    titulos = sorted(set(titulos))
    for i in range(0, len(titulos), 20):
        lote = titulos[i:i + 20]
        q = api(action='query', prop='extracts', exintro='1', explaintext='1', exsentences='5', titles='|'.join(lote))['query']
        for p in q.get('pages', []):
            out[p['title']] = (p.get('extract') or '').strip()
    return out


def frases(texto):
    texto = re.sub(r'\s+', ' ', texto)
    return [f.strip() for f in re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿«])', texto) if f.strip()]


def recortar(texto, maximo=420):
    texto = re.sub(r'\s*\([^()]*\)', '', texto) if len(texto) > maximo else texto
    if len(texto) <= maximo:
        return texto
    corte = texto[:maximo].rsplit(' ', 1)[0]
    return corte.rstrip(',;:') + '…'


TIPOS = r'(calle|plaza|plazuela|plazoleta|avenida|paseo|ronda|glorieta|callejon|pasaje|puente|camino|carretera|barriada|cuesta|costanilla|travesia|jardines|parque)'


def clave(t):
    t = unicodedata.normalize('NFD', t.lower())
    t = ''.join(ch for ch in t if unicodedata.category(ch) != 'Mn')
    t = re.sub(r'\s*\(sevilla\)\s*$', '', t)
    t = re.sub(r'\b(de|del|la|las|los|el|y)\b', ' ', t)
    return ' '.join(re.sub(r'[^a-z0-9ñ ]+', ' ', t).split())


def sin_tipo(k):
    return re.sub('^' + TIPOS + r'\s+', '', k)


def main():
    calles = json.load(open(os.path.join(RAIZ, 'public', 'datos', 'calles.json'), encoding='utf-8'))
    dedicados = {}
    for c in calles:
        corto = (c.get('c') or '').strip()
        if not corto or corto.lower().startswith('sin nombre') or re.fullmatch(r'[\d\s]+', corto):
            continue
        dedicados[c['id']] = corto

    # artículos sobre calles de Sevilla: se sacan de las categorías (pocas peticiones) en vez de probar cada título
    articulos_calles = set()
    for cat in ('Calles de Sevilla', 'Plazas de Sevilla', 'Avenidas de Sevilla'):
        articulos_calles |= set(miembros('Categoría:' + cat))
    log('artículos de calles y plazas de Sevilla:', len(articulos_calles))
    con_tipo = {clave(t): t for t in articulos_calles}
    # «Sierpes (Sevilla)», sin tipo de vía en el título
    sin_tipo_ = {clave(t): t for t in articulos_calles if not re.match(TIPOS + r'\s', clave(t))}

    pags = paginas(list(dedicados.values()))

    elegido = {}
    for c in calles:
        i = c['id']
        if i not in dedicados:
            continue
        # 1. artículo de la propia calle
        t = con_tipo.get(clave(c['n'])) or sin_tipo_.get(sin_tipo(clave(c['n'])))
        if t:
            elegido[i] = ('calle', {'title': t})
            continue
        # 2. a quién o a qué está dedicada
        p = pags.get(dedicados[i])
        if p and 'disambiguation' not in p.get('pageprops', {}) and DEDICATORIAS.search(p.get('description') or ''):
            elegido[i] = ('dedicada', p)
    log('calles con artículo propio:', sum(1 for v in elegido.values() if v[0] == 'calle'),
        '· con dedicatoria:', sum(1 for v in elegido.values() if v[0] == 'dedicada'))

    intros = introducciones([p['title'] for _, p in elegido.values()])

    out = {}
    for i, (tipo, p) in sorted(elegido.items()):
        titulo = p['title']
        texto = intros.get(titulo, '')
        if tipo == 'calle':
            # las frases que explican el nombre, si el artículo las tiene
            sobre_nombre = [f for f in frases(texto) if NOMBRE.search(f) and len(f) < 400][:2]
            if sobre_nombre:
                texto = ' '.join(sobre_nombre)
            else:
                texto = ' '.join(frases(texto)[:2])
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
