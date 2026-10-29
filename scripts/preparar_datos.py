#!/usr/bin/env python3
"""
Prepara los datos del Callejero de Sevilla a partir de fuentes oficiales y abiertas.

  · Callejero Digital de Andalucía Unificado (CDAU), Junta de Andalucía · CC BY 4.0
      viales (calles con nombre normalizado) y tramos (red de calles con topología)
  · Dirección General del Catastro · cartografía de manzanas (INSPIRE CadastralZoning)
  · Ayuntamiento de Sevilla, ide.SEVILLA (datos abiertos) · distritos, barrios,
      término municipal, parques de bomberos y equipamientos (puntos de interés)
  · OpenStreetMap (ODbL) vía Protomaps · mapa base, sentido de circulación y calles peatonales
  · Exámenes oficiales publicados por el Ayuntamiento de Sevilla (documentos públicos)

La ortofoto PNOA (IGN, CC BY 4.0) se sirve directamente desde el WMTS del IGN en el navegador.

Uso:
    pip install pyproj shapely mapbox-vector-tile lxml
    go install github.com/protomaps/go-pmtiles@latest   # solo para regenerar el mapa base
    python3 scripts/preparar_datos.py            # descarga lo que falte y genera public/datos/
    python3 scripts/preparar_datos.py --refrescar  # vuelve a descargar todo
"""

import gzip
import json
import math
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

from lxml import etree
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, Point, Polygon, MultiPolygon, mapping, shape
import warnings
from shapely.ops import linemerge, transform, unary_union

warnings.filterwarnings('ignore', category=DeprecationWarning)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, 'datos-fuente')
SALIDA = os.path.join(RAIZ, 'public', 'datos')
REFRESCAR = '--refrescar' in sys.argv

INE_SEVILLA = '41091'
CDAU_WFS = 'https://www.callejerodeandalucia.es/servicios/cdau/wfs'
CATASTRO_ZIP = 'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/41/41900-SEVILLA/A.ES.SDGC.CP.41900.zip'
IDESEVILLA = 'https://services1.arcgis.com/hcmP7kr0Cx3AcTJk/arcgis/rest/services'
PROTOMAPS_BUILD = 'https://build.protomaps.com/{fecha}.pmtiles'
BBOX = (-6.08, 37.30, -5.86, 37.47)
EXAMENES = [
    {
        'id': 'bombero-67-2026',
        'titulo': 'Bombero/a · 67 plazas · segundo ejercicio (22/01/2026)',
        'cuestionario': 'https://www.femas.es/servicios/empleo/servicio-de-recursos-humanos/convocatorias-oposiciones-concursos/ayuntamiento-de-sevilla/funcionario/acceso-libre/bombero-31-plazas/21-segundo-ejercicio.pdf',
        'plantilla_provisional': 'https://www.femas.es/servicios/empleo/servicio-de-recursos-humanos/convocatorias-oposiciones-concursos/ayuntamiento-de-sevilla/funcionario/acceso-libre/bombero-31-plazas/22-anuncio-plantilla-provisional-segundo-ejercicio.pdf',
        'plantilla_definitiva': 'https://www.femas.es/servicios/empleo/servicio-de-recursos-humanos/convocatorias-oposiciones-concursos/ayuntamiento-de-sevilla/funcionario/acceso-libre/bombero-31-plazas/23-anuncio-plantilla-definitiva-segundo-ejercicio.pdf',
    },
]

A_UTM = Transformer.from_crs('EPSG:4326', 'EPSG:25830', always_xy=True).transform
A_GEO = Transformer.from_crs('EPSG:25830', 'EPSG:4326', always_xy=True).transform


# ----------------------------------------------------------------------------- utilidades

def log(*a):
    print('·', *a, flush=True)


def descargar(url, nombre, timeout=600):
    ruta = os.path.join(FUENTE, nombre)
    if os.path.exists(ruta) and os.path.getsize(ruta) > 0 and not REFRESCAR:
        return ruta
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    log('descargando', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'callejero-sevilla/1.0 (preparar_datos.py)'})
    with urllib.request.urlopen(req, timeout=timeout) as r, open(ruta + '.tmp', 'wb') as f:
        shutil.copyfileobj(r, f)
    os.replace(ruta + '.tmp', ruta)
    return ruta


def guardar(nombre, datos):
    os.makedirs(SALIDA, exist_ok=True)
    ruta = os.path.join(SALIDA, nombre)
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, separators=(',', ':'))
    log(f'{nombre}: {os.path.getsize(ruta) / 1e6:.2f} MB')


def redondear(geom, dec=5):
    """GeoJSON con coordenadas recortadas (5 decimales ≈ 1 m)."""
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], dec), round(c[1], dec)]
        return [r(x) for x in c]
    g = mapping(geom) if not isinstance(geom, dict) else geom
    return {'type': g['type'], 'coordinates': r(g['coordinates'])}


def sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


MINUSCULAS = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al'}
TILDES = {
    'Jeronimo': 'Jerónimo', 'Heliopolis': 'Heliópolis', 'Atlantico': 'Atlántico', 'Maria': 'María',
    'Linea': 'Línea', 'Letanias': 'Letanías', 'Cantabrico': 'Cantábrico', 'Romeria': 'Romería',
    'Pajaros': 'Pájaros', 'Jardin': 'Jardín', 'Matias': 'Matías', 'Policlinico': 'Policlínico',
    'Nicolas': 'Nicolás', 'Marañon': 'Marañón', 'Torrejon': 'Torrejón', 'Rocio': 'Rocío',
    'Principes': 'Príncipes', 'Pio': 'Pío', 'Poligono': 'Polígono', 'Leon': 'León', 'Tardon': 'Tardón',
    'Jose': 'José', 'Arbol': 'Árbol', 'Guadaira': 'Guadaíra', 'Julian': 'Julián', 'Bartolome': 'Bartolomé',
    'Nervion': 'Nervión', 'Encarnacion': 'Encarnación', 'Consolacion': 'Consolación', 'Eden': 'Edén',
    'Bami': 'Bami', 'Felipe': 'Felipe', 'Hispalis': 'Híspalis',
}


def titulo(s):
    s = s.strip().lower()
    partes = re.split(r'(\s+|-|,)', s)
    out = []
    for i, p in enumerate(partes):
        if not p.strip() or p in '-,':
            out.append(p)
            continue
        w = p if (p in MINUSCULAS and i > 0) else p[:1].upper() + p[1:]
        if w.upper() in ('II', 'III', 'XIII', 'XXIII', 'XII', 'C', 'D', 'E', 'A', 'B') and i > 0:
            w = w.upper() if w.lower() != 'e' or partes[i - 2:i - 1] != ['d'] else w
        out.append(TILDES.get(w, w))
    t = ''.join(out)
    t = re.sub(r'\s*-\s*', ' - ', t)
    t = re.sub(r'(?<= - )(\w)', lambda m: m.group(1).upper(), t)
    t = re.sub(r'\bSan Pablo D y e\b', 'San Pablo D y E', t)
    return t


def matiz(hexa, f):
    """Aclara (f > 0) u oscurece (f < 0) un color hexadecimal."""
    r, g, b = (int(hexa[i:i + 2], 16) for i in (1, 3, 5))
    m = 255 if f > 0 else 0
    f = abs(f)
    return '#%02X%02X%02X' % tuple(round(c + (m - c) * f) for c in (r, g, b))


ABREVIATURAS = [('Calle ', 'C/ '), ('Avenida ', 'Av. '), ('Plaza ', 'Pl. '), ('Plazuela ', 'Pza. '), ('Plazoleta ', 'Pza. '),
                ('Callejón ', 'Cjón. '), ('Pasaje ', 'Pje. '), ('Glorieta ', 'Gta. '), ('Barreduela ', 'Brda. '),
                ('Paseo ', 'P.º '), ('Carretera ', 'Ctra. '), ('Ronda ', 'Rda. '), ('Camino ', 'Cno. '), ('Costanilla ', 'Cost. '),
                ('Urbanización ', 'Urb. '), ('Barriada ', 'Bda. '), ('Polígono ', 'Pol. '), ('Autovía ', 'Autov. ')]


def rotulo(nombre):
    """Nombre corto para el plano, con el tipo de vía abreviado como en el original: «C/ Feria», «Av. de la Cruz»."""
    for largo, corto in ABREVIATURAS:
        if nombre.startswith(largo):
            return corto + nombre[len(largo):]
    return nombre


def ajuste_rotulo(c):
    """Factor para que el nombre quepa dentro de la calle: tamaño de letra (px) = f · 2^zoom.
    Se calcula con el tramo continuo más largo de la calle (~0,58 em por carácter y un 8 % de margen)."""
    unida = linemerge(c['utm']) if c['utm'].geom_type == 'MultiLineString' else c['utm']
    largo = max(l.length for l in lineas(unida))
    return float('%.4g' % (0.92 * largo / (124350 * 0.58 * max(len(rotulo(c['nombre'])), 1))))


def normalizar(s):
    """Forma de comparación de nombres de calle: sin tildes, sin signos, sin artículos."""
    s = sin_tildes(s.lower())
    s = re.sub(r'[^a-z0-9ñ ]+', ' ', s)
    palabras = [p for p in s.split() if p not in MINUSCULAS]
    return ' '.join(palabras)


# ----------------------------------------------------------------------------- descargas

def wfs_cdau(tipo, nombre):
    q = urllib.parse.urlencode({
        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': tipo,
        'outputFormat': 'application/json', 'CQL_FILTER': f"ine_mun='{INE_SEVILLA}'",
    })
    return json.load(open(descargar(f'{CDAU_WFS}?{q}', nombre)))


def ide_sevilla(servicio):
    q = urllib.parse.urlencode({'where': '1=1', 'outFields': '*', 'outSR': '4326', 'f': 'geojson'})
    return json.load(open(descargar(f'{IDESEVILLA}/{servicio}/FeatureServer/0/query?{q}', f'{servicio}.geojson')))


# ----------------------------------------------------------------------------- zonas

COLORES_DISTRITO = {
    'Bellavista - La Palmera': '#8C8A2E', 'Casco Antiguo': '#B5502D', 'Cerro - Amate': '#B9822F',
    'Este - Alcosa - Torreblanca': '#3F8E86', 'Los Remedios': '#A45A3C', 'Macarena': '#7A5BA0',
    'Nervión': '#2F7C9A', 'Norte': '#4F6FA8', 'San Pablo - Santa Justa': '#7C6243', 'Sur': '#4D8B4A',
    'Triana': '#BB4F6A',
}


def zonas():
    dist = ide_sevilla('Distritos_de_Sevilla')
    barr = ide_sevilla('Barrios_de_Sevilla')
    termino = ide_sevilla('Termino_Municipal')

    distritos = []
    for f in dist['features']:
        p = f['properties']
        nombre = p['Distri_11D'].strip()
        g = shape(f['geometry']).buffer(0)
        distritos.append({'nombre': nombre, 'geom': g, 'color': COLORES_DISTRITO.get(nombre, '#8a6d4b'),
                          'poblacion': p.get('POB_2016'), 'superficie': p.get('Superficie'),
                          'direccion': p.get('Direccion'), 'web': p.get('Web')})
    distritos.sort(key=lambda d: sin_tildes(d['nombre']))

    por_nombre = defaultdict(list)
    for f in barr['features']:
        p = f['properties']
        por_nombre[(p['Barrio'].strip(), p['DISTRITO_N'].strip())].append(shape(f['geometry']).buffer(0))
    barrios = []
    for (nombre, dn), geoms in por_nombre.items():
        barrios.append({'nombre': titulo(nombre), 'oficial': nombre, 'distrito': dn, 'geom': unary_union(geoms)})
    barrios.sort(key=lambda b: (sin_tildes(b['distrito']), sin_tildes(b['nombre'])))
    for i, b in enumerate(barrios):
        b['id'] = i
    for i, d in enumerate(distritos):
        d['id'] = i
        d['barrios'] = [b['id'] for b in barrios if b['distrito'] == d['nombre']]
    term = unary_union([shape(f['geometry']).buffer(0) for f in termino['features']])
    return distritos, barrios, term


# ----------------------------------------------------------------------------- calles (CDAU)

TIPOS_PRINCIPALES = {'AVENIDA', 'RONDA', 'AUTOVIA', 'CARRETERA', 'PASEO', 'PUENTE', 'ENLACE', 'AUTOPISTA'}
TIPOS_ZONA = {'GRUPO', 'BARRIADA', 'POLIGONO', 'URBANIZACION', 'PARQUE', 'JARDINES', 'JARDIN', 'LUGAR',
              'HUERTA, HUERTO'}
TIPO_CORTO = {
    'CALLE': 'Calle', 'PLAZA': 'Plaza', 'VIA': 'Vía', 'AVENIDA': 'Avenida', 'GLORIETA': 'Glorieta',
    'CALLEJON': 'Callejón', 'GRUPO': 'Grupo', 'PASAJE': 'Pasaje', 'PARQUE': 'Parque', 'CARRETERA': 'Carretera',
    'PASEO': 'Paseo', 'CAMINO': 'Camino', 'POLIGONO': 'Polígono', 'BARRIADA': 'Barriada', 'PUENTE': 'Puente',
    'AUTOVIA': 'Autovía', 'BARREDUELA': 'Barreduela', 'JARDINES': 'Jardines', 'JARDIN': 'Jardín',
    'ROTONDA': 'Rotonda', 'PLAZOLETA': 'Plazoleta', 'PLAZUELA': 'Plazuela', 'LUGAR': 'Lugar',
    'URBANIZACION': 'Urbanización', 'RONDA': 'Ronda', 'ENLACE': 'Enlace', 'HUERTA, HUERTO': 'Huerta',
    'ACCESO': 'Acceso', 'RINCON': 'Rincón', 'VEREDA': 'Vereda', 'COSTANILLA': 'Costanilla',
}


def lineas(g):
    if g.geom_type == 'LineString':
        return [g]
    if g.geom_type == 'MultiLineString':
        return list(g.geoms)
    return []


def orientacion(g):
    """Rumbo principal (0-180º) por componentes principales de los vértices."""
    xs, ys = [], []
    for ln in lineas(g):
        for x, y in ln.coords:
            xs.append(x)
            ys.append(y)
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    rect = 0 if (sxx + syy) == 0 else (1 - (4 * (sxx * syy - sxy * sxy)) / ((sxx + syy) ** 2)) ** 0.5
    return math.degrees(ang) % 180, rect


def dif_angulo(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def rumbo_local(ln, d):
    """Rumbo de la línea en la distancia d (grados 0-180)."""
    a = ln.interpolate(max(0, d - 4))
    b = ln.interpolate(min(ln.length, d + 4))
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x)) % 180


def calles(barrios, distritos):
    viales = wfs_cdau('cdau:v_vial', 'viales.json')
    log('viales CDAU:', len(viales['features']))
    barrios_utm = [transform(A_UTM, b['geom']) for b in barrios]
    arbol_b = STRtree(barrios_utm)
    dist_idx = {d['nombre']: d['id'] for d in distritos}

    out = []
    for f in viales['features']:
        p = f['properties']
        if not f['geometry']:
            continue
        g = shape(f['geometry'])
        gu = transform(A_UTM, g)
        if gu.length < 1:
            continue
        tipo = p['nom_tip_via'] or 'CALLE'
        nombre = (p['nom_normalizado'] or '').strip()
        tc = TIPO_CORTO.get(tipo, titulo(tipo))
        resto = nombre[len(tc):].strip() if nombre.lower().startswith(tc.lower()) else nombre
        # longitud por barrio
        por_barrio = Counter()
        for i in arbol_b.query(gu):
            inter = gu.intersection(barrios_utm[i])
            if not inter.is_empty:
                por_barrio[int(i)] += inter.length
        if not por_barrio:
            i = int(arbol_b.nearest(gu))
            por_barrio[i] = gu.length
        b_ppal = por_barrio.most_common(1)[0][0]
        otros = [i for i, l in por_barrio.items() if i != b_ppal and (l > 40 or l > 0.25 * gu.length)]
        out.append({
            'id': len(out), 'cdau': p['id_vial'], 'ine': p['ine_via'], 'tipo': tipo, 'tc': tc,
            'nombre': nombre, 'corto': resto or nombre, 'sobrenombre': p.get('sobrenombre'),
            'geom': g, 'utm': gu, 'longitud': round(gu.length),
            'barrio': b_ppal, 'barrios': [b_ppal] + otros,
            'distrito': dist_idx[barrios[b_ppal]['distrito']],
            'principal': tipo in TIPOS_PRINCIPALES or gu.length > 1800,
            'zona': tipo in TIPOS_ZONA,
        })

    # dificultad: según la longitud de la calle dentro de su tipo (las largas y principales se conocen más)
    longitudes = sorted(c['longitud'] for c in out if not c['zona'])
    t1 = longitudes[int(len(longitudes) * 0.66)]
    t2 = longitudes[int(len(longitudes) * 0.33)]
    for c in out:
        if c['principal'] or c['longitud'] >= t1:
            c['dif'] = 1
        elif c['longitud'] >= t2:
            c['dif'] = 2
        else:
            c['dif'] = 3
    return out


def relaciones(cs):
    """Cruces, calles en las que acaba cada calle, paralelas y perpendiculares."""
    log('calculando cruces y calles vecinas…')
    geoms = [c['utm'] for c in cs]
    arbol = STRtree(geoms)
    TOL = 4.0
    for c in cs:
        c['cruza'], c['acaba'], c['paralelas'], c['perpendiculares'] = set(), set(), set(), set()
        c['ori'], c['recta'] = orientacion(c['utm'])

    for c in cs:
        g = c['utm']
        # extremos libres (no compartidos entre las partes de la propia calle)
        merged = linemerge(g) if g.geom_type == 'MultiLineString' else g
        extremos = []
        for ln in lineas(merged):
            extremos += [Point(ln.coords[0]), Point(ln.coords[-1])]
        for j in arbol.query(g.buffer(TOL)):
            j = int(j)
            if j == c['id']:
                continue
            o = cs[j]
            if g.distance(o['utm']) > TOL:
                continue
            acaba = any(e.distance(o['utm']) <= TOL for e in extremos)
            if acaba:
                c['acaba'].add(j)
            c['cruza'].add(j)
            # perpendicular: ángulo en el punto de contacto
            try:
                pc = g.buffer(TOL).intersection(o['utm']).centroid
                ln_c = min(lineas(g), key=lambda l: l.distance(pc))
                ln_o = min(lineas(o['utm']), key=lambda l: l.distance(pc))
                a1 = rumbo_local(ln_c, ln_c.project(pc))
                a2 = rumbo_local(ln_o, ln_o.project(pc))
                if dif_angulo(a1, a2) > 60 and c['recta'] > 0.75 and o['recta'] > 0.75:
                    c['perpendiculares'].add(j)
            except Exception:
                pass

    # paralelas: próximas, sin tocarse, mismo rumbo y que se solapen a lo largo
    for c in cs:
        if c['longitud'] < 50 or c['recta'] < 0.85 or c['zona'] or c['tipo'] in ('PLAZA', 'GLORIETA', 'ROTONDA'):
            continue
        g = c['utm']
        ang = math.radians(c['ori'])
        ux, uy = math.cos(ang), math.sin(ang)
        for j in arbol.query(g.buffer(140)):
            j = int(j)
            o = cs[j]
            if j == c['id'] or j in c['cruza'] or o['longitud'] < 50 or o['recta'] < 0.85 or o['zona']:
                continue
            if o['tipo'] in ('PLAZA', 'GLORIETA', 'ROTONDA'):
                continue
            if dif_angulo(c['ori'], o['ori']) > 14:
                continue
            if g.distance(o['utm']) > 140:
                continue
            pa = [x * ux + y * uy for ln in lineas(g) for x, y in ln.coords]
            pb = [x * ux + y * uy for ln in lineas(o['utm']) for x, y in ln.coords]
            solape = min(max(pa), max(pb)) - max(min(pa), min(pb))
            if solape > 0.4 * min(max(pa) - min(pa), max(pb) - min(pb)):
                c['paralelas'].add(j)
                o['paralelas'].add(c['id'])


# ----------------------------------------------------------------------------- OSM: sentidos y peatonales

def mapa_base():
    ruta = os.path.join(FUENTE, 'base-sevilla.pmtiles')
    if os.path.exists(ruta) and not REFRESCAR:
        return ruta
    pmt = shutil.which('go-pmtiles') or shutil.which('pmtiles') or os.path.expanduser('~/go/bin/go-pmtiles')
    import datetime
    for dias in range(1, 8):
        fecha = (datetime.date.today() - datetime.timedelta(days=dias)).strftime('%Y%m%d')
        try:
            subprocess.run([pmt, 'extract', PROTOMAPS_BUILD.format(fecha=fecha), ruta,
                            f'--bbox={BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}', '--maxzoom=15'], check=True)
            return ruta
        except Exception as e:
            log('no se pudo extraer', fecha, e)
    raise SystemExit('No se pudo obtener el mapa base de Protomaps')


def leer_pmtiles(ruta):
    """Lector mínimo de PMTiles v3 (directorios comprimidos con gzip)."""
    f = open(ruta, 'rb')
    cab = f.read(127)
    le = lambda o, n: int.from_bytes(cab[o:o + n], 'little')
    root_off, root_len = le(8, 8), le(16, 8)
    leaf_off, data_off = le(40, 8), le(56, 8)

    def varint(b, i):
        r, s = 0, 0
        while True:
            x = b[i]
            i += 1
            r |= (x & 0x7f) << s
            s += 7
            if x < 0x80:
                return r, i

    def directorio(off, ln):
        f.seek(off)
        b = gzip.decompress(f.read(ln))
        i = 0
        n, i = varint(b, i)
        ids, runs, lens, offs = [], [], [], []
        last = 0
        for _ in range(n):
            v, i = varint(b, i)
            last += v
            ids.append(last)
        for _ in range(n):
            v, i = varint(b, i)
            runs.append(v)
        for _ in range(n):
            v, i = varint(b, i)
            lens.append(v)
        for k in range(n):
            v, i = varint(b, i)
            offs.append(offs[k - 1] + lens[k - 1] if (v == 0 and k > 0) else v - 1)
        return list(zip(ids, runs, lens, offs))

    entradas = {}

    def recorrer(off, ln, hoja=False):
        for tid, run, l, o in directorio(off, ln):
            if run == 0:
                recorrer(leaf_off + o, l, True)
            else:
                for r in range(run):
                    entradas[tid + r] = (data_off + o, l)
    recorrer(root_off, root_len)

    def zxy_a_id(z, x, y):
        acc = sum(4 ** i for i in range(z))
        n = 2 ** z
        d, s, xx, yy = 0, n // 2, x, y
        while s > 0:
            rx = 1 if (xx & s) > 0 else 0
            ry = 1 if (yy & s) > 0 else 0
            d += s * s * ((3 * rx) ^ ry)
            if ry == 0:
                if rx == 1:
                    xx, yy = s - 1 - xx, s - 1 - yy
                xx, yy = yy, xx
            s //= 2
        return acc + d

    def tesela(z, x, y):
        e = entradas.get(zxy_a_id(z, x, y))
        if not e:
            return None
        f.seek(e[0])
        b = f.read(e[1])
        return gzip.decompress(b) if b[:2] == b'\x1f\x8b' else b
    return tesela


def teselas_osm(z, capa, bbox=BBOX):
    """Recorre las teselas del mapa base (Protomaps) y devuelve (propiedades, geometría en lon/lat).
    Las líneas se recortan al borde exacto de cada tesela para no duplicar tramos."""
    import mapbox_vector_tile
    from shapely.geometry import box
    tesela = leer_pmtiles(mapa_base())
    n = 2 ** z
    tx = lambda lon: int((lon + 180) / 360 * n)
    ty = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    for x in range(tx(bbox[0]), tx(bbox[2]) + 1):
        for y in range(ty(bbox[3]), ty(bbox[1]) + 1):
            datos = tesela(z, x, y)
            if not datos:
                continue
            c = mapbox_vector_tile.decode(datos).get(capa)
            if not c:
                continue
            ext = c['extent']
            marco = box(0, 0, ext, ext)

            def geo(px, py):
                lon = (x + px / ext) / n * 360 - 180
                yy = (y + 1 - py / ext) / n
                return (lon, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy)))))

            for ft in c['features']:
                g = shape(ft['geometry'])
                if g.geom_type in ('LineString', 'MultiLineString'):
                    g = g.intersection(marco)
                    if g.is_empty:
                        continue
                yield ft['properties'], transform(lambda a, b, z=None: tuple(zip(*[geo(px, py) for px, py in zip(a, b)])) if hasattr(a, '__len__') else geo(a, b), g)


def vias_osm():
    sentido, peatonal, otras = [], [], []
    for p, g in teselas_osm(15, 'roads'):
        kind = p.get('kind')
        if kind not in ('highway', 'major_road', 'medium_road', 'minor_road', 'path', 'other'):
            continue
        det = p.get('kind_detail')
        for ln in lineas(g):
            if len(ln.coords) < 2:
                continue
            ln = transform(A_UTM, ln)
            if kind == 'path' and det in ('pedestrian', 'living_street'):
                peatonal.append(ln)
            elif kind == 'other' and det == 'living_street':
                peatonal.append(ln)
            elif kind in ('highway', 'major_road', 'medium_road', 'minor_road') or (kind == 'other' and det in ('service', None)):
                if p.get('oneway') in ('yes', True, 1, '1'):
                    sentido.append(ln)
                elif kind != 'other':
                    otras.append(ln)
    log(f'OSM: {len(sentido)} tramos de sentido único, {len(peatonal)} peatonales, {len(otras)} doble sentido')
    return sentido, peatonal, otras


def unir_dirigidas(lineas_):
    """Une tramos consecutivos (fin de uno = inicio del otro) sin cambiar su sentido."""
    k = lambda c: (round(c[0] * 2), round(c[1] * 2))
    por_inicio = defaultdict(list)
    for i, ln in enumerate(lineas_):
        por_inicio[k(ln.coords[0])].append(i)
    entradas = Counter(k(ln.coords[-1]) for ln in lineas_)
    usado = set()
    out = []

    def cadena(i):
        coords = list(lineas_[i].coords)
        usado.add(i)
        while True:
            sig = [j for j in por_inicio.get(k(coords[-1]), []) if j not in usado]
            if len(sig) != 1 or entradas[k(coords[-1])] != 1:
                break
            usado.add(sig[0])
            coords += list(lineas_[sig[0]].coords)[1:]
        return LineString(coords)

    # se empieza por los tramos a los que no llega ningún otro
    for i, ln in enumerate(lineas_):
        if i not in usado and entradas[k(ln.coords[0])] != 1:
            out.append(cadena(i))
    for i in range(len(lineas_)):
        if i not in usado:
            out.append(cadena(i))
    return out


# ----------------------------------------------------------------------------- red de tramos (rutas)

def red(cs, sentido, peatonal, otras):
    tramos = wfs_cdau('cdau:v_tramo', 'tramos.json')
    log('tramos CDAU:', len(tramos['features']))
    arbol_c = STRtree([c['utm'] for c in cs])
    arbol_s = STRtree(sentido)
    arbol_p = STRtree(peatonal)
    arbol_o = STRtree(otras)

    nodos, idx_nodo = [], {}

    def nodo(x, y):
        k = (round(x / 1.5), round(y / 1.5))
        if k not in idx_nodo:
            idx_nodo[k] = len(nodos)
            nodos.append((x, y))
        return idx_nodo[k]

    def candidato(arbol, lista, ln, d, ang, tol=7):
        pt = ln.interpolate(d)
        mejor, md = None, tol
        for i in arbol.query(pt.buffer(tol)):
            o = lista[int(i)]
            dd = o.distance(pt)
            if dd < md:
                pr = o.project(pt)
                if dif_angulo(rumbo_local(o, pr), ang) < 28:
                    mejor, md = o, dd
        return mejor

    def signos_sentido(ln, d, ang, tol=13):
        """Tramos OSM de sentido único paralelos cerca del punto: [(distancia, +1 mismo sentido / -1 contrario)]."""
        pt = ln.interpolate(d)
        p1 = ln.interpolate(max(0, d - 3))
        p2 = ln.interpolate(min(ln.length, d + 3))
        r = []
        for i in arbol_s.query(pt.buffer(tol)):
            o = sentido[int(i)]
            dd = o.distance(pt)
            if dd > tol:
                continue
            q = o.project(pt)
            if dif_angulo(rumbo_local(o, q), ang) >= 28:
                continue
            q1 = o.interpolate(max(0, q - 3))
            q2 = o.interpolate(min(o.length, q + 3))
            dot = (p2.x - p1.x) * (q2.x - q1.x) + (p2.y - p1.y) * (q2.y - q1.y)
            qp = o.interpolate(q)
            lado = (p2.x - p1.x) * (qp.y - pt.y) - (p2.y - p1.y) * (qp.x - pt.x)
            r.append((dd, 1 if dot > 0 else -1, 1 if lado > 0 else -1))
        return sorted(r)

    aristas = []
    for f in tramos['features']:
        if not f['geometry']:
            continue
        g = transform(A_UTM, shape(f['geometry']))
        for ln in lineas(g):
            if ln.length < 0.5:
                continue
            a = nodo(*ln.coords[0])
            b = nodo(*ln.coords[-1])
            if a == b:
                continue
            mid = ln.interpolate(0.5, normalized=True)
            # calle a la que pertenece
            calle, mejor = -1, 3.5
            for i in arbol_c.query(mid.buffer(3.5)):
                dd = cs[int(i)]['utm'].distance(mid)
                if dd < mejor:
                    calle, mejor = int(i), dd
            # sentido de circulación (OSM)
            votos = 0
            hay_doble = 0
            pe = 0
            for frac in (0.25, 0.5, 0.75):
                d = ln.length * frac
                ang = rumbo_local(ln, d)
                cercanos = signos_sentido(ln, d, ang)
                if cercanos and cercanos[0][0] <= 3.5:
                    # la vía OSM coincide con la del callejero: una sola calzada
                    votos += cercanos[0][1]
                elif len({c[1] for c in cercanos}) == 2 and len({c[2] for c in cercanos}) == 2:
                    # dos calzadas de sentido contrario, una a cada lado: la vía es de doble sentido
                    hay_doble += 1
                elif cercanos and cercanos[0][0] <= 7:
                    votos += cercanos[0][1]
                elif candidato(arbol_o, otras, ln, d, ang) is not None:
                    hay_doble += 1
                if candidato(arbol_p, peatonal, ln, d, ang) is not None:
                    pe += 1
            sentido_t = 0
            if abs(votos) >= 2 and hay_doble == 0:
                sentido_t = 1 if votos > 0 else -1
            peat = 1 if pe >= 2 and abs(votos) == 0 and hay_doble == 0 else 0
            aristas.append({'a': a, 'b': b, 'l': ln.length, 'c': calle, 's': sentido_t, 'p': peat, 'g': ln})
    log(f'red: {len(nodos)} nodos, {len(aristas)} tramos, '
        f'{sum(1 for e in aristas if e["s"])} de sentido único, {sum(e["p"] for e in aristas)} peatonales')

    # resumen por calle: tramos peatonales y sentido
    por_calle = defaultdict(list)
    for e in aristas:
        if e['c'] >= 0:
            por_calle[e['c']].append(e)
    for c in cs:
        es = por_calle.get(c['id'], [])
        total = sum(e['l'] for e in es) or 1
        lp = sum(e['l'] for e in es if e['p'])
        c['peatonal'] = 0 if lp < 15 else (2 if lp > 0.9 * total else 1)
        ls = sum(e['l'] for e in es if e['s'])
        c['sentido'] = 0 if ls < 0.3 * total else (2 if ls > 0.9 * total else 1)
    return nodos, aristas


# ----------------------------------------------------------------------------- carreteras de acceso

CARRETERAS = {
    # ref: (nombre, itinerario, ruta europea) — solo las principales; el resto se describe por su titularidad
    'A-4': ('Autovía del Sur', 'Madrid · Córdoba · Sevilla · Jerez · Cádiz', 'E-5'),
    'A-49': ('Autovía del Quinto Centenario', 'Sevilla · Huelva · Portugal', 'E-1'),
    'A-66': ('Autovía Ruta de la Plata', 'Sevilla · Mérida · Salamanca · Gijón', 'E-803'),
    'A-92': ('Autovía de Andalucía', 'Sevilla · Antequera · Granada · Almería', None),
    'SE-30': ('Ronda de circunvalación SE-30', 'Anillo de circunvalación de Sevilla', None),
    'SE-40': ('Autovía de circunvalación SE-40', 'Segunda circunvalación del área metropolitana', None),
    'SE-20': ('Ronda Supernorte SE-20', 'Ronda urbana del norte de Sevilla', None),
    'A-376': ('Autovía A-376', 'Sevilla · Utrera', None),
    'N-630': ('Carretera nacional N-630, Ruta de la Plata', 'Sevilla · Mérida · Gijón', None),
    'N-4': ('Carretera nacional N-IV', 'Madrid · Sevilla · Cádiz', None),
}


def titularidad(ref):
    if ref == 'A-92' or re.fullmatch(r'A-[34]\d\d', ref):
        return 'Junta de Andalucía · red autonómica'
    if re.fullmatch(r'A-\d{1,2}', ref) or ref.startswith('N-') or re.fullmatch(r'SE-\d{2}', ref):
        return 'Estado · Red de Carreteras del Estado'
    if re.fullmatch(r'A-8\d{3}', ref):
        return 'Junta de Andalucía · red complementaria metropolitana'
    if re.fullmatch(r'SE-\d{3,4}', ref):
        return 'Diputación de Sevilla · red provincial'
    return 'Sin datos de titularidad'


def carreteras(union_geo, barrios, cs):
    union = transform(A_UTM, union_geo)
    cerca = union.buffer(2500)
    piezas = defaultdict(list)
    tipos = defaultdict(Counter)
    nombres_osm = defaultdict(Counter)
    for p, g in teselas_osm(13, 'roads'):
        if p.get('kind') not in ('highway', 'major_road', 'medium_road') or not p.get('ref'):
            continue
        for ref in re.findall(r'\b(?:A|N|SE)-\d+', p['ref']):
            for ln in lineas(g):
                lu = transform(A_UTM, ln)
                if lu.intersects(cerca):
                    piezas[ref].append(lu)
                    tipos[ref][p.get('kind')] += 1
                    if p.get('name'):
                        nombres_osm[ref][p['name']] += 1
    borde = union.boundary
    barrios_utm = [(b['nombre'], transform(A_UTM, b['geom'])) for b in barrios]
    vias_cdau = [c for c in cs if c['tipo'] in ('AUTOVIA', 'CARRETERA', 'VIA', 'RONDA', 'ENLACE', 'AUTOPISTA', 'PUENTE', 'AVENIDA')]
    out, entradas = [], []
    for ref, ls in sorted(piezas.items(), key=lambda kv: (titularidad(kv[0]), kv[0])):
        u = unary_union(ls)
        g = (linemerge(u) if u.geom_type == 'MultiLineString' else u).simplify(3)
        dentro = g.intersection(union).length
        if g.length < 300 or (g.distance(union) > 150 and ref not in CARRETERAS):
            continue
        nombre, itinerario, europea = CARRETERAS.get(ref, (None, None, None))
        patron = re.compile(r'\b' + re.escape(ref).replace('\\-', '[- ]?') + r'\b', re.I)
        oficiales = list(dict.fromkeys(c['nombre'] for c in vias_cdau if patron.search(c['nombre'])))[:3]
        tipo = 'Autovía' if tipos[ref].most_common(1)[0][0] == 'highway' else 'Carretera'
        pts = []
        cruce = g.intersection(borde)
        for pt in (getattr(cruce, 'geoms', [cruce]) if not cruce.is_empty else []):
            if pt.geom_type != 'Point' or any(pt.distance(q) < 400 for q in pts):
                continue
            pts.append(pt)
        lugares_entrada = []
        for pt in pts:
            barrio = min(barrios_utm, key=lambda b: b[1].distance(pt))[0]
            lugares_entrada.append(barrio)
            lon, lat = A_GEO(pt.x, pt.y)
            entradas.append({'type': 'Feature', 'properties': {'ref': ref, 'barrio': barrio, 'destino': (itinerario or nombre or '').split(' · ')[-1] if itinerario else ''},
                             'geometry': {'type': 'Point', 'coordinates': [round(lon, 5), round(lat, 5)]}})
        props = {
            'ref': ref, 'tipo': tipo, 'nombre': nombre or (nombres_osm[ref].most_common(1)[0][0] if nombres_osm[ref] else f'{tipo} {ref}'),
            'itinerario': itinerario, 'europea': europea, 'titular': titularidad(ref),
            'oficial': oficiales, 'km_sevilla': round(dentro / 1000, 1), 'entradas': sorted(set(lugares_entrada)),
            'red': 'estado' if titularidad(ref).startswith('Estado') else 'junta' if 'Junta' in titularidad(ref) else 'diputacion',
        }
        out.append({'type': 'Feature', 'properties': props, 'geometry': redondear(transform(A_GEO, g))})
    log('carreteras de acceso:', len(out), [f['properties']['ref'] for f in out])
    return {'type': 'FeatureCollection', 'features': out}, {'type': 'FeatureCollection', 'features': entradas}


# ----------------------------------------------------------------------------- manzanas (Catastro)

def manzanas(termino):
    ruta_gml = os.path.join(FUENTE, 'cat', 'A.ES.SDGC.CP.41900.cadastralzoning.gml')
    if not os.path.exists(ruta_gml) or REFRESCAR:
        import zipfile
        z = descargar(CATASTRO_ZIP, 'cat/cp.zip')
        zipfile.ZipFile(z).extractall(os.path.join(FUENTE, 'cat'))
    ns = {'gml': 'http://www.opengis.net/gml/3.2', 'cp': 'http://inspire.ec.europa.eu/schemas/cp/4.0',
          'gmd': 'http://www.isotc211.org/2005/gmd'}
    out = []
    for _, el in etree.iterparse(ruta_gml, tag='{%s}CadastralZoning' % ns['cp']):
        nivel = el.find('cp:levelName/gmd:LocalisedCharacterString', ns)
        if nivel is not None and nivel.text.strip() == 'MANZANA':
            ref = el.findtext('cp:nationalCadastalZoningReference', namespaces=ns)
            polis = []
            for patch in el.iter('{%s}PolygonPatch' % ns['gml']):
                anillos = []
                for pl in patch.iter('{%s}posList' % ns['gml']):
                    v = list(map(float, pl.text.split()))
                    anillos.append([A_GEO(v[i], v[i + 1]) for i in range(0, len(v), 2)])
                if anillos and len(anillos[0]) >= 4:
                    polis.append(Polygon(anillos[0], anillos[1:]))
            if polis:
                g = (polis[0] if len(polis) == 1 else MultiPolygon(polis)).simplify(0.000008, preserve_topology=True)
                out.append({'type': 'Feature', 'properties': {'ref': ref}, 'geometry': redondear(g, 6)})
        el.clear()
        while el.getprevious() is not None:
            del el.getparent()[0]
    log('manzanas Catastro:', len(out))
    return {'type': 'FeatureCollection', 'features': out}


# ----------------------------------------------------------------------------- polígonos industriales y colegios

NOMBRES_POLIGONO = {'Higueron Sur': 'Higuerón Sur', 'San Jeronimo': 'San Jerónimo', 'Zonas Industriales': 'Zona industrial'}


def poligonos():
    """Polígonos industriales del Ayuntamiento, con su nombre (los trozos de un mismo polígono se unen)."""
    partes = {}
    for f in ide_sevilla('AREA_POLIGONOS')['features']:
        if f.get('geometry'):
            n = (f['properties'].get('Nombre') or '').strip()
            n = NOMBRES_POLIGONO.get(n, n)
            partes.setdefault(n, []).append(shape(f['geometry']).buffer(0))
    out = []
    for n, gs in partes.items():
        # las zonas industriales sueltas son pequeñas y están separadas: cada una por su lado
        for g in (gs if n == 'Zona industrial' else [unary_union(gs)]):
            out.append({'type': 'Feature', 'properties': {'nombre': n if n == 'Zona industrial' else 'P.I. ' + n},
                        'geometry': redondear(g.simplify(0.000005), 6)})
    log('polígonos industriales:', len(out))
    return {'type': 'FeatureCollection', 'features': out}


def colegios():
    """Parcelas de los centros educativos (Ayuntamiento · Educación), con nombre, tipo y dirección."""
    out = []
    for f in ide_sevilla('Ayto_Educacion_Colegios_DATOS')['features']:
        p = f['properties']
        if f.get('geometry') and (p.get('DENOMINACI') or '').strip():
            out.append({'type': 'Feature', 'properties': {
                'nombre': p['DENOMINACI'].strip(), 'tipo': (p.get('Tipo') or '').strip(),
                'titularidad': (p.get('TITULARIDA') or '').strip(), 'direccion': re.sub(r'\s+', ' ', p.get('DOMICILIO') or '').strip()},
                'geometry': redondear(shape(f['geometry']).buffer(0).simplify(0.000003), 6)})
    log('parcelas de colegios:', len(out))
    return {'type': 'FeatureCollection', 'features': out}


# ----------------------------------------------------------------------------- lugares de interés

def lugares(cs, union_geo):
    arbol = STRtree([c['utm'] for c in cs])
    zona = union_geo.buffer(0.0006)

    def calle_cercana(lon, lat):
        p = Point(A_UTM(lon, lat))
        i = int(arbol.nearest(p))
        return i

    def punto(f):
        g = f.get('geometry')
        if not g:
            return None
        s = shape(g)
        if s.is_empty:
            return None
        return s if s.geom_type == 'Point' else s.representative_point()

    out = []

    def anadir(cat, nombre, f, extra=None):
        pt = punto(f)
        if not pt or not nombre:
            return
        if not zona.contains(pt):
            return
        if any(o['properties']['cat'] == cat and o['properties']['nombre'] == nombre.strip() and
               abs(o['geometry']['coordinates'][0] - pt.x) + abs(o['geometry']['coordinates'][1] - pt.y) < 0.001 for o in out):
            return
        props = {'id': len(out), 'cat': cat, 'nombre': nombre.strip(), 'calle': calle_cercana(pt.x, pt.y)}
        props.update({k: v for k, v in (extra or {}).items() if v})
        out.append({'type': 'Feature', 'properties': props, 'geometry': redondear(pt, 6)})

    # parques de bomberos: se agrupan las dependencias repetidas en el mismo punto
    vistos = set()
    for f in ide_sevilla('Equipamiento_Bomberos')['features']:
        c = tuple(round(v, 5) for v in f['geometry']['coordinates'])
        if c in vistos:
            continue
        vistos.add(c)
        nombre = f['properties'].get('NOMBRE') or 'Dependencia del Servicio de Bomberos'
        m = re.search(r'n[ºo°]\s*(\d)', nombre)
        anadir('bomberos', nombre, f, {'parque': int(m.group(1)) if m else None})

    for f in ide_sevilla('Centros_de_Salud')['features']:
        p = f['properties']
        cat = 'hospital' if 'ospital' in (p.get('Tipo') or '') else 'salud'
        anadir(cat, p.get('Nombre'), f, {'tipo': p.get('Tipo'), 'direccion': p.get('Dirección')})
    for f in ide_sevilla('Museo')['features']:
        p = f['properties']
        anadir('museo', p.get('NOMBRE'), f, {'direccion': p.get('DIRECCION')})
    for f in ide_sevilla('BIC_Sevilla')['features']:
        p = f['properties']
        anadir('monumento', p.get('DENOMINACI'), f, {'tipo': (p.get('TJ_R_E') or '').strip()})
    for f in ide_sevilla('APP_Mercados')['features']:
        p = f['properties']
        anadir('mercado', p.get('Nombre'), f, {'direccion': p.get('Dirección')})
    for f in ide_sevilla('Equipamiento_Escolar')['features']:
        p = f['properties']
        anadir('educacion', p.get('Nombre'), f, {'tipo': p.get('Tipo'), 'direccion': p.get('Direccion')})
    for f in ide_sevilla('Policia_local')['features']:
        p = f['properties']
        anadir('policia', p.get('Nombre'), f, {'direccion': p.get('Dirección')})
    for f in ide_sevilla('APP_Bibliotecas_Mobile')['features']:
        p = f['properties']
        anadir('biblioteca', p.get('NOMBRE'), f, {'direccion': p.get('DIRECCION')})
    for f in ide_sevilla('Centros_Civicos_2016')['features']:
        p = f['properties']
        anadir('civico', p.get('Nombre'), f, {'direccion': p.get('Dirección')})
    for f in ide_sevilla('APP_Sede_Distritos')['features']:
        p = f['properties']
        anadir('distrito', f"Junta Municipal del Distrito {p.get('NOMBRE')}", f, {'direccion': p.get('CALLE')})
    for f in ide_sevilla('APP_Centros_de_Servicios_Sociales')['features']:
        p = f['properties']
        anadir('social', p.get('Nombre'), f, {'tipo': p.get('Tipo')})
    for f in ide_sevilla('APP_Espacios_Icas')['features']:
        p = f['properties']
        anadir('cultura', p.get('Nombre'), f, {'tipo': 'Espacio cultural (ICAS)'})
    # transporte, universidades y estadios de OpenStreetMap
    osm = {'station': ('transporte', 'Estación de metro o tren'), 'bus_station': ('transporte', 'Estación de autobuses'),
           'university': ('universidad', 'Universidad'), 'college': ('universidad', 'Centro de estudios'),
           'stadium': ('deporte', 'Estadio')}
    for p, g in teselas_osm(15, 'pois'):
        if p.get('kind') in osm and p.get('name') and g.geom_type == 'Point' and len(p['name']) > 3:
            cat, tipo = osm[p['kind']]
            anadir(cat, p['name'], {'geometry': mapping(g)}, {'tipo': tipo, 'fuente': 'OpenStreetMap'})
    log('lugares de interés:', len(out), Counter(f['properties']['cat'] for f in out))
    return {'type': 'FeatureCollection', 'features': out}


# ----------------------------------------------------------------------------- exámenes oficiales

def pdf_texto(ruta):
    return subprocess.run(['pdftotext', '-layout', ruta, '-'], capture_output=True, text=True, check=True).stdout


def plantilla(texto):
    r = {}
    for m in re.finditer(r'^\s{10,}(\d{1,2})\s+([abc]|RESERVA\s*\d+|ANULADA)\s*$', texto, re.M):
        r[int(m.group(1))] = m.group(2).strip()
    return r


def tipo_pregunta(t):
    tl = sin_tildes(t.lower())
    if 'itinerario' in tl or 'parque de bomberos' in tl:
        return 'itinerario'
    if 'sentido' in tl or 'infringir' in tl:
        return 'sentido'
    if 'peatonal' in tl:
        return 'peatonal'
    if 'paralela' in tl or 'perpendicular' in tl:
        return 'relacion'
    if 'barrio' in tl or 'poligono' in tl:
        return 'zona'
    if re.search(r'\b(bic|museo|palacio|convento|estacion|club|hospital|iglesia)\b', tl):
        return 'lugar'
    if 'accede' in tl or 'acceso' in tl or 'confluye' in tl or 'comunica' in tl or 'une' in tl or 'desemboca' in tl or 'cruza' in tl:
        return 'acceso'
    return 'otras'


def examenes():
    preguntas = []
    for ex in EXAMENES:
        txt = pdf_texto(descargar(ex['cuestionario'], f"exam/{ex['id']}-cuestionario.pdf"))
        prov = plantilla(pdf_texto(descargar(ex['plantilla_provisional'], f"exam/{ex['id']}-provisional.pdf")))
        defi = plantilla(pdf_texto(descargar(ex['plantilla_definitiva'], f"exam/{ex['id']}-definitiva.pdf")))
        # quitar pies de página y cabeceras
        lineas_ = [l for l in txt.splitlines() if not re.search(r'P[áa]gina \d+ de \d+|^Modelo:', l)]
        bloques = re.split(r'\n\s*(?=\d{1,2}\.\s)', '\n'.join(lineas_))
        for bl in bloques:
            m = re.match(r'\s*(\d{1,2})\.\s+(.*)', bl, re.S)
            if not m:
                continue
            num = int(m.group(1))
            cuerpo = m.group(2)
            partes = re.split(r'\n\s*([abc])\)\s+', '\n' + cuerpo if not cuerpo.startswith('\n') else cuerpo)
            enun = re.sub(r'\s+', ' ', partes[0]).strip()
            opciones = [re.sub(r'\s+', ' ', partes[i + 1]).strip() for i in range(1, len(partes) - 1, 2)]
            if len(opciones) != 3:
                log('pregunta mal leída', num, len(opciones))
                continue
            reserva = None
            mr = re.match(r'RESERVA\s*(\d+)\.\s*', enun)
            if mr:
                reserva = int(mr.group(1))
                enun = enun[mr.end():]
            d = defi.get(num, prov.get(num))
            anulada = d == 'ANULADA'
            letra = prov.get(num) if (d is None or d.startswith('RESERVA') or anulada) else d
            preguntas.append({
                'id': f"{ex['id']}-{num}", 'examen': ex['id'], 'num': num, 'reserva': reserva,
                'enunciado': enun, 'opciones': opciones, 'correcta': 'abc'.index(letra) if letra in 'abc' else None,
                'anulada': anulada, 'tipo': tipo_pregunta(enun + ' ' + ' '.join(opciones)),
            })
    log('preguntas oficiales:', len(preguntas), Counter(p['tipo'] for p in preguntas))
    return {'examenes': [{k: v for k, v in e.items()} for e in EXAMENES], 'preguntas': preguntas}


# ----------------------------------------------------------------------------- salida

def main():
    os.makedirs(FUENTE, exist_ok=True)
    distritos, barrios, termino = zonas()
    cs = calles(barrios, distritos)
    relaciones(cs)
    sentido, peatonal, otras = vias_osm()
    nodos, aristas = red(cs, sentido, peatonal, otras)
    union = unary_union([d['geom'] for d in distritos]).buffer(0)

    # colores: cada barrio, un tono del color de su distrito
    for d in distritos:
        for k, bid in enumerate(d['barrios']):
            barrios[bid]['color'] = matiz(d['color'], [0, 0.32, -0.22, 0.18, -0.36, 0.45, -0.1][k % 7])

    # zonas
    guardar('distritos.geojson', {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'id': d['id'], 'properties': {
            'id': d['id'], 'nombre': d['nombre'], 'color': d['color'], 'barrios': d['barrios'],
            'calles': sum(1 for c in cs if c['distrito'] == d['id'] and not c['zona']),
            'poblacion': d['poblacion'], 'superficie': d['superficie'], 'sede': d['direccion']},
         'geometry': redondear(d['geom'].simplify(0.00002))} for d in distritos]})
    guardar('barrios.geojson', {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'id': b['id'], 'properties': {
            'id': b['id'], 'nombre': b['nombre'], 'distrito': next(d['id'] for d in distritos if d['nombre'] == b['distrito']), 'color': b['color'],
            'calles': sum(1 for c in cs if b['id'] in c['barrios'] and not c['zona'])},
         'geometry': redondear(b['geom'].simplify(0.00002))} for b in barrios]})
    rot = []
    for d in distritos:
        p = d['geom'].representative_point() if not d['geom'].centroid.within(d['geom']) else d['geom'].centroid
        rot.append({'type': 'Feature', 'properties': {'nombre': d['nombre'].upper(), 'nivel': 'distrito', 'color': d['color']},
                    'geometry': redondear(p, 5)})
    for b in barrios:
        p = b['geom'].representative_point() if not b['geom'].centroid.within(b['geom']) else b['geom'].centroid
        rot.append({'type': 'Feature', 'properties': {'nombre': b['nombre'], 'nivel': 'barrio', 'color': matiz(b['color'], -0.35)}, 'geometry': redondear(p, 5)})
    guardar('rotulos.geojson', {'type': 'FeatureCollection', 'features': rot})
    guardar('termino.geojson', {'type': 'Feature', 'properties': {}, 'geometry': redondear(union.simplify(0.00002))})
    # máscara: todo lo que queda fuera de los 11 distritos
    fuera = Polygon([(-7.5, 36.5), (-4.5, 36.5), (-4.5, 38.5), (-7.5, 38.5)]).difference(union.buffer(0.00005))
    guardar('fuera.geojson', {'type': 'Feature', 'properties': {}, 'geometry': redondear(fuera.simplify(0.00002))})

    # calles
    guardar('calles.geojson', {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'id': c['id'], 'properties': {
            'id': c['id'], 'n': c['nombre'], 'e': rotulo(c['nombre']), 'f': ajuste_rotulo(c),
            'c': c['corto'], 'fc': float('%.4g' % (ajuste_rotulo(c) * len(rotulo(c['nombre'])) / max(len(c['corto']), 1))),
            't': c['tc'], 'd': c['distrito'], 'b': c['barrio'],
            'dif': c['dif'], 'p': 1 if c['principal'] else 0, 'z': 1 if c['zona'] else 0},
         'geometry': redondear(linemerge(c['geom']) if c['geom'].geom_type == 'MultiLineString' else c['geom'])} for c in cs]})
    guardar('calles.json', [{
        'id': c['id'], 'n': c['nombre'], 'c': c['corto'], 't': c['tc'], 'ine': c['ine'], 'cdau': c['cdau'],
        'so': c['sobrenombre'], 'd': c['distrito'], 'b': c['barrios'], 'l': c['longitud'], 'dif': c['dif'],
        'p': 1 if c['principal'] else 0, 'z': 1 if c['zona'] else 0, 'pe': c['peatonal'], 'se': c['sentido'],
        'k': normalizar(c['corto']),
        'bb': [round(v, 5) for v in c['geom'].bounds],
        'cr': sorted(c['cruza']), 'ac': sorted(c['acaba']), 'pa': sorted(c['paralelas']), 'pp': sorted(c['perpendiculares']),
    } for c in cs])

    # nombres de las plazas: un punto en el centro de cada plaza (como el original)
    plazas = []
    for c in cs:
        if c['tipo'] not in ('PLAZA', 'PLAZUELA', 'PLAZOLETA') or not c['nombre']:
            continue
        g = c['geom']
        centro = g.convex_hull.centroid if g.convex_hull.area > 0 else g.interpolate(0.5, normalized=True) if g.geom_type == 'LineString' else g.centroid
        plazas.append({'type': 'Feature', 'properties': {'id': c['id'], 'n': c['nombre'], 'e': rotulo(c['nombre'])},
                       'geometry': {'type': 'Point', 'coordinates': [round(centro.x, 6), round(centro.y, 6)]}})
    guardar('plazas.geojson', {'type': 'FeatureCollection', 'features': plazas})

    # sentido y peatonales para el mapa
    # flechas: directamente las vías de sentido único de OpenStreetMap, recortadas a los distritos
    union_utm = transform(A_UTM, union).buffer(10)
    flechas, peat = [], []
    for ln in unir_dirigidas(sentido):
        g = ln.intersection(union_utm)
        for parte in lineas(g):
            if parte.length >= 12:
                flechas.append({'type': 'Feature', 'properties': {}, 'geometry': redondear(transform(A_GEO, parte), 6)})
    for e in aristas:
        if e['p']:
            peat.append({'type': 'Feature', 'properties': {'c': e['c']}, 'geometry': redondear(transform(A_GEO, e['g']))})
    guardar('sentidos.geojson', {'type': 'FeatureCollection', 'features': flechas})
    guardar('peatonales.geojson', {'type': 'FeatureCollection', 'features': peat})

    # grafo de rutas: nodos [lon,lat] y tramos [a, b, metros, calle, sentido, peatonal, geometría intermedia]
    geo_nodos = [[round(v, 6) for v in A_GEO(x, y)] for x, y in nodos]
    guardar('red.json', {'nodos': geo_nodos, 'tramos': [
        [e['a'], e['b'], round(e['l'], 1), e['c'], e['s'], e['p'],
         [[round(v, 5) for v in A_GEO(x, y)] for x, y in list(e['g'].coords)[1:-1]]] for e in aristas]})

    guardar('lugares.geojson', lugares(cs, union))
    vias, entradas = carreteras(union, barrios, cs)
    guardar('carreteras.geojson', vias)
    guardar('entradas.geojson', entradas)
    bic = []
    for f in ide_sevilla('BIC_Sevilla')['features']:
        if f.get('geometry') and f['properties'].get('DENOMINACI'):
            g = shape(f['geometry']).buffer(0).simplify(0.000005)
            if union.buffer(0.0006).contains(g.representative_point()):
                bic.append({'type': 'Feature', 'properties': {'nombre': f['properties']['DENOMINACI'].strip(), 'tipo': (f['properties'].get('TJ_R_E') or '').strip()},
                            'geometry': redondear(g, 6)})
    guardar('bic.geojson', {'type': 'FeatureCollection', 'features': bic})
    guardar('poligonos.geojson', poligonos())
    guardar('colegios.geojson', colegios())
    guardar('manzanas.geojson', manzanas(termino))
    guardar('test-oficiales.json', examenes())
    destino_base = os.path.join(RAIZ, 'public', 'datos', 'base-sevilla.pmtiles')
    shutil.copyfile(mapa_base(), destino_base)
    log('base-sevilla.pmtiles copiado')

    guardar('fuentes.json', {
        'generado': __import__('datetime').date.today().isoformat(),
        'fuentes': [
            {'nombre': 'Callejero Digital de Andalucía Unificado (CDAU)', 'autor': 'Junta de Andalucía', 'licencia': 'CC BY 4.0', 'url': 'https://www.callejerodeandalucia.es/'},
            {'nombre': 'Cartografía de manzanas', 'autor': 'Dirección General del Catastro', 'licencia': 'Licencia de uso de datos del Catastro (con reconocimiento)', 'url': 'https://www.catastro.hacienda.gob.es/'},
            {'nombre': 'Distritos, barrios, término municipal y equipamientos', 'autor': 'Ayuntamiento de Sevilla · ide.SEVILLA (datos abiertos)', 'licencia': 'Datos abiertos', 'url': 'https://sig.urbanismosevilla.org/sevilla.art/datosabiertos/'},
            {'nombre': 'Ortofoto PNOA', 'autor': 'Instituto Geográfico Nacional', 'licencia': 'CC BY 4.0', 'url': 'https://pnoa.ign.es/'},
            {'nombre': 'Mapa base, sentido de circulación y calles peatonales', 'autor': 'Colaboradores de OpenStreetMap · Protomaps', 'licencia': 'ODbL', 'url': 'https://www.openstreetmap.org/copyright'},
            {'nombre': 'Preguntas de examen', 'autor': 'Ayuntamiento de Sevilla · exámenes oficiales publicados', 'licencia': 'Documentos públicos', 'url': 'https://www.sevilla.org/'},
        ],
    })


if __name__ == '__main__':
    main()
