// Estilo del plano: mapa base de Protomaps (OpenStreetMap) + callejero CDAU + manzanas del Catastro
// + zonas del Ayuntamiento + ortofoto PNOA del IGN.

import { BASE, CATEGORIAS } from './datos.js'

export const PALETAS = {
  claro: {
    fondo: '#F1E8DA',
    tierra: '#F6EFE3',
    verde: '#B7D39A',
    verdeSuave: '#DFEACB',
    agua: '#9DC1E3',
    aguaBorde: '#7EAAD3',
    industrial: '#ECE4D6',
    manzana: '#E8CFA8',
    manzanaBorde: '#CDAA7F',
    edificio: '#E4D0AF',
    calle: '#FFFAF1',
    calleBorde: '#D9BD9C',
    principal: '#F2C14E',
    principalBorde: '#D39C2F',
    autovia: '#EF8F45',
    autoviaBorde: '#BD652D',
    exterior: '#F7F2EA',
    tren: '#9B8F84',
    texto: '#5A4A3C',
    textoSuave: '#8A7A6B',
    halo: '#FAF6EF',
    peatonal: '#EF86B5',
    flecha: '#7A3B22',
    fuera: '#F1E8DA',
    limite: '#A4532F',
    objetivo: '#C0502B',
    pista: '#3D7CC9',
    correcta: '#2E9B57',
    error: '#D23B2A',
    ruta: '#C0392B',
  },
  oscuro: {
    fondo: '#1C1815',
    tierra: '#211C18',
    verde: '#28331F',
    verdeSuave: '#252B1E',
    agua: '#2D4A62',
    aguaBorde: '#365872',
    industrial: '#26211C',
    manzana: '#2D2620',
    manzanaBorde: '#3A3129',
    edificio: '#352C25',
    calle: '#5C4F44',
    calleBorde: '#1C1815',
    principal: '#B88B36',
    principalBorde: '#7A5C25',
    autovia: '#B06A31',
    autoviaBorde: '#6E4220',
    exterior: '#3B332C',
    tren: '#6D635A',
    texto: '#D9CABA',
    textoSuave: '#A89887',
    halo: '#1C1815',
    peatonal: '#F27AB4',
    flecha: '#F3EAE0',
    fuera: '#161311',
    limite: '#D97D4F',
    objetivo: '#F07A4A',
    pista: '#6AA6F0',
    correcta: '#5CCB84',
    error: '#FF6B57',
    ruta: '#FF6B57',
  },
}

const FUENTE = ['Noto Sans Regular']
const FUENTE_M = ['Noto Sans Medium']
const FUENTE_I = ['Noto Sans Italic']

/** Lugares del mapa base que se muestran con la capa «Iglesias, capillas y lugares destacados». */
export const DESTACADOS = ['place_of_worship', 'monastery', 'attraction', 'museum', 'townhall', 'castle', 'monument', 'memorial', 'archaeological_site', 'artwork', 'stadium', 'theatre', 'marketplace', 'park', 'garden', 'zoo', 'theme_park']

const TIPOS_PLAZA = ['Plaza', 'Plazuela', 'Plazoleta']
/** Nombre abreviado («C/ Feria») hasta el zoom 16 y completo («Calle Feria») desde ahí, como el original. */
const NOMBRE_SEGUN_ZOOM = ['step', ['zoom'], ['coalesce', ['get', 'e'], ['get', 'n']], 16, ['get', 'n']]

/** Zooms con capa propia de nombres de calle, cada medio nivel (la última sigue hasta el máximo). */
const ZOOMS_NOMBRES = Array.from({ length: 14 }, (_, i) => 13 + i / 2)
/** Tamaño normal de la letra según el zoom y mínimo al que se reduce para caber en calles cortas. */
const TAMANO = (zm) => (zm <= 16 ? 11 + (zm - 13) * 0.8 : Math.min(18, 13.4 + (zm - 16) * 1.4))
const TAMANO_MINIMO = 7
/** Por debajo de este tamaño, en vez de reducir más el nombre abreviado se quita el tipo de vía. */
const TAMANO_ABREVIADO = 9.5

/** Tamaño (px) con el que el texto `prop` cabe en la calle en el zoom `zm`: `f` (calculado con el abreviado `e`) · 2^zoom. */
const cabe = (zm, prop) => ['*', ['get', 'f'], 2 ** zm, ['/', ['length', ['get', 'e']], ['max', 1, ['length', ['coalesce', ['get', prop], ['get', 'n']]]]]]

function capaNombresCalles(zm, i) {
  const ultima = i === ZOOMS_NOMBRES.length - 1
  const t = +TAMANO(zm).toFixed(2)
  // «Calle Feria» (desde el zoom 16) → «C/ Feria» → «Feria»: el más largo que quepa sin reducirlo mucho
  const texto = ['case', zm >= 16 ? ['>=', cabe(zm, 'n'), t * 0.85] : false, 'n', ['>=', cabe(zm, 'e'), Math.min(t, TAMANO_ABREVIADO)], 'e', 'c']
  const elegido = (p) => ['case', ['==', texto, 'n'], p('n'), ['==', texto, 'e'], p('e'), p('c')]
  return {
    id: 'nombres-calles-' + zm,
    type: 'symbol',
    source: 'calles',
    minzoom: zm,
    ...(ultima ? {} : { maxzoom: zm + 0.5 }),
    filter: ['all', ['==', ['get', 'z'], 0], ['==', ['get', 'p'], 0], ['!', ['in', ['get', 't'], ['literal', TIPOS_PLAZA]]], ['>=', cabe(zm, 'c'), TAMANO_MINIMO]],
    layout: {
      visibility: 'none',
      'text-field': elegido((p) => ['coalesce', ['get', p], ['get', 'n']]),
      'text-font': FUENTE,
      'text-size': ['max', TAMANO_MINIMO, ['min', t, elegido((p) => cabe(zm, p))]],
      'symbol-placement': 'line',
      'text-max-angle': 40,
      'symbol-spacing': zm < 16 ? 120 : zm < 18 ? 220 : 320,
      'text-padding': 1,
      // primero las calles en las que el nombre cabe más holgado
      'symbol-sort-key': ['-', 0, ['get', 'f']],
    },
    paint: { 'text-color': '#3b2f27', 'text-halo-color': '#fffaf1', 'text-halo-width': t < 9 ? 1.1 : 1.5 },
  }
}
const CAPAS_CALLES = ZOOMS_NOMBRES.map(capaNombresCalles)

/** Capas de nombres de calles y plazas. */
export const CAPAS_NOMBRES = [...CAPAS_CALLES.map((c) => c.id), 'nombres-principales', 'nombres-plazas']

const z = (pares) => ['interpolate', ['exponential', 1.6], ['zoom'], ...pares]

export function anchoCalle(principal) {
  return principal ? z([10, 1.05, 12, 2.1, 13, 3, 14, 4.2, 16, 8.25, 18, 25.5, 20, 82.5]) : z([10, 0.56, 11, 0.84, 12, 1.26, 13, 1.96, 14, 2.94, 15, 3.92, 16, 5.32, 18, 15.4, 20, 56])
}

const anchoBorde = (principal) =>
  principal ? z([10, 1.85, 12, 3.1, 13, 4.2, 14, 5.6, 16, 10.75, 18, 29.5, 20, 88.5]) : z([10, 1.16, 11, 1.64, 12, 2.26, 13, 3.16, 14, 4.34, 15, 5.52, 16, 7.12, 18, 18.4, 20, 60])

/** Construye el estilo completo. `termino` es la geometría del término municipal (para no duplicar calles). */
export function construirEstilo(tema = 'claro', termino = null) {
  const P = PALETAS[tema] || PALETAS.claro
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'vector',
        url: 'pmtiles://' + new URL(BASE + 'base-sevilla.pmtiles', location.href).href,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">colaboradores de OpenStreetMap</a> (ODbL) · <a href="https://protomaps.com" target="_blank">Protomaps</a>',
      },
      pnoa: {
        type: 'raster',
        tiles: ['https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}'],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'Ortofoto <a href="https://pnoa.ign.es/" target="_blank">PNOA</a> © Instituto Geográfico Nacional (CC BY 4.0)',
      },
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14,
      },
      manzanas: {
        type: 'geojson',
        data: BASE + 'manzanas.geojson',
        attribution: 'Manzanas: <a href="https://www.catastro.hacienda.gob.es/" target="_blank">Dirección General del Catastro</a>',
      },
      calles: {
        type: 'geojson',
        data: BASE + 'calles.geojson',
        promoteId: 'id',
        // teselas grandes (z14, unos 2,4 km) para que pocas calles queden partidas entre teselas:
        // en una calle partida el nombre solo se coloca si el trozo de cada tesela es lo bastante largo
        maxzoom: 14,
        tolerance: 0.15,
        buffer: 256,
        attribution: 'Callejero: <a href="https://www.callejerodeandalucia.es/" target="_blank">CDAU</a>, Junta de Andalucía (CC BY 4.0)',
      },
      distritos: {
        type: 'geojson',
        data: BASE + 'distritos.geojson',
        promoteId: 'id',
        attribution: 'Distritos y barrios: <a href="https://sig.urbanismosevilla.org/sevilla.art/datosabiertos/" target="_blank">Ayuntamiento de Sevilla</a>',
      },
      barrios: { type: 'geojson', data: BASE + 'barrios.geojson', promoteId: 'id' },
      rotulos: { type: 'geojson', data: BASE + 'rotulos.geojson' },
      plazas: { type: 'geojson', data: BASE + 'plazas.geojson' },
      peatonales: { type: 'geojson', data: BASE + 'peatonales.geojson' },
      sentidos: { type: 'geojson', data: BASE + 'sentidos.geojson' },
      lugares: { type: 'geojson', data: BASE + 'lugares.geojson', promoteId: 'id' },
      bic: { type: 'geojson', data: BASE + 'bic.geojson' },
      fuera: { type: 'geojson', data: BASE + 'fuera.geojson' },
      limite: { type: 'geojson', data: BASE + 'termino.geojson' },
      carreteras: {
        type: 'geojson',
        data: BASE + 'carreteras.geojson',
        generateId: true,
        attribution: 'Carreteras: OpenStreetMap y CDAU',
      },
      entradas: { type: 'geojson', data: BASE + 'entradas.geojson' },
      ruta: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      trazado: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      anotaciones: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': P.fondo } },
      { id: 'tierra', type: 'fill', source: 'base', 'source-layer': 'earth', paint: { 'fill-color': P.tierra } },
      {
        id: 'cubierta',
        type: 'fill',
        source: 'base',
        'source-layer': 'landcover',
        paint: { 'fill-color': P.verdeSuave, 'fill-opacity': 0.6 },
      },
      {
        id: 'usos-verde',
        type: 'fill',
        source: 'base',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden', 'grass', 'cemetery', 'golf_course', 'pitch', 'playground', 'nature_reserve', 'forest', 'wood', 'meadow', 'recreation_ground', 'village_green', 'allotments', 'farmland', 'orchard']]],
        paint: { 'fill-color': P.verde },
      },
      {
        id: 'usos-industrial',
        type: 'fill',
        source: 'base',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['industrial', 'railway', 'aerodrome', 'runway', 'taxiway']]],
        paint: { 'fill-color': P.industrial },
      },
      {
        id: 'poligonos',
        type: 'fill',
        source: 'base',
        'source-layer': 'landuse',
        filter: ['==', ['get', 'kind'], 'industrial'],
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#9B7AB8', 'fill-opacity': 0.28, 'fill-outline-color': '#7A5BA0' },
      },
      { id: 'agua', type: 'fill', source: 'base', 'source-layer': 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': P.agua } },
      {
        id: 'agua-lineas',
        type: 'line',
        source: 'base',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': P.agua, 'line-width': z([10, 0.6, 15, 2.5, 18, 6]) },
      },
      { id: 'satelite', type: 'raster', source: 'pnoa', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } },
      { id: 'sombreado', type: 'hillshade', source: 'dem', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#5a4636' } },
      {
        id: 'manzanas',
        type: 'fill',
        source: 'manzanas',
        paint: { 'fill-color': P.manzana, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.75, 12, 0.95, 13, 1] },
      },
      {
        id: 'manzanas-borde',
        type: 'line',
        source: 'manzanas',
        minzoom: 13,
        paint: {
          'line-color': P.manzanaBorde,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.2, 15, 0.6, 18, 1.6],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 15, 0.9],
        },
      },
      {
        id: 'edificios-3d',
        type: 'fill-extrusion',
        source: 'base',
        'source-layer': 'buildings',
        minzoom: 14,
        filter: ['==', ['get', 'kind'], 'building'],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': P.edificio,
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 9],
          'fill-extrusion-opacity': 0.85,
        },
      },
      { id: 'distritos-relleno', type: 'fill', source: 'distritos', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } },
      { id: 'barrios-relleno', type: 'fill', source: 'barrios', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } },
      {
        id: 'bic',
        type: 'fill',
        source: 'bic',
        minzoom: 14,
        layout: { visibility: 'none' },
        paint: { 'fill-color': CATEGORIAS.monumento.color, 'fill-opacity': 0.28, 'fill-outline-color': CATEGORIAS.monumento.color },
      },
      {
        id: 'barrio-sel-relleno',
        type: 'fill',
        source: 'barrios',
        filter: ['==', ['get', 'id'], -1],
        paint: { 'fill-color': P.objetivo, 'fill-opacity': 0.08 },
      },
      {
        id: 'tren',
        type: 'line',
        source: 'base',
        'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'rail'],
        paint: { 'line-color': P.tren, 'line-width': z([10, 0.6, 16, 2]), 'line-dasharray': [3, 2] },
      },
      // todo lo que queda fuera de los 11 distritos se tapa
      { id: 'fuera', type: 'fill', source: 'fuera', paint: { 'fill-color': P.fuera, 'fill-opacity': 1 } },
      {
        id: 'limite',
        type: 'line',
        source: 'limite',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': P.limite, 'line-width': z([10, 1.2, 16, 3]), 'line-opacity': 0.55, 'line-dasharray': [4, 2] },
      },
      // todas las calles de OpenStreetMap dentro de los distritos, debajo del callejero oficial:
      // así se ven también las que no están en el CDAU (como hace el original)
      {
        id: 'osm-calles-borde',
        type: 'line',
        source: 'base',
        'source-layer': 'roads',
        minzoom: 14,
        filter: ['all', ['in', ['get', 'kind'], ['literal', ['minor_road', 'medium_road', 'major_road', 'other']]], ['!', ['in', ['get', 'kind_detail'], ['literal', ['footway', 'cycleway', 'steps', 'track', 'path', 'bridleway', 'platform', 'corridor']]]], termino ? ['within', termino] : true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.calleBorde, 'line-width': anchoBorde(false) },
      },
      {
        id: 'osm-calles',
        type: 'line',
        source: 'base',
        'source-layer': 'roads',
        filter: ['all', ['in', ['get', 'kind'], ['literal', ['minor_road', 'medium_road', 'major_road', 'other']]], ['!', ['in', ['get', 'kind_detail'], ['literal', ['footway', 'cycleway', 'steps', 'track', 'path', 'bridleway', 'platform', 'corridor']]]], termino ? ['within', termino] : true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.calle, 'line-width': anchoCalle(false) },
      },
      // callejero oficial (CDAU)
      {
        id: 'calles-borde',
        type: 'line',
        source: 'calles',
        minzoom: 14,
        filter: ['==', ['get', 'p'], 0],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.calleBorde, 'line-width': anchoBorde(false) },
      },
      {
        id: 'calles',
        type: 'line',
        source: 'calles',
        filter: ['==', ['get', 'p'], 0],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'encima'], false], P.pista, P.calle],
          'line-width': anchoCalle(false),
        },
      },
      {
        id: 'principales-borde',
        type: 'line',
        source: 'calles',
        filter: ['==', ['get', 'p'], 1],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 't'], ['Autovía', 'Enlace'], P.autoviaBorde, P.principalBorde], 'line-width': anchoBorde(true) },
      },
      {
        id: 'principales',
        type: 'line',
        source: 'calles',
        filter: ['==', ['get', 'p'], 1],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'encima'], false], P.pista, ['match', ['get', 't'], ['Autovía', 'Enlace'], P.autovia, P.principal]],
          'line-width': anchoCalle(true),
        },
      },
      {
        id: 'peatonales',
        type: 'line',
        source: 'peatonales',
        minzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.peatonal, 'line-opacity': 0.85, 'line-width': z([12, 0.5, 14, 1.3, 16, 3.5, 18, 8, 20, 22]) },
      },
      {
        id: 'sentidos',
        type: 'symbol',
        source: 'sentidos',
        minzoom: 14,
        layout: {
          visibility: 'none',
          'symbol-placement': 'line',
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 14, 45, 16, 60, 18, 90],
          'icon-image': 'flecha',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 16, 0.42, 18, 0.62],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-color': P.flecha, 'icon-opacity': 0.95 },
      },
      // resaltados (filtros que cambia la aplicación)
      ...['pista', 'error', 'correcta', 'objetivo'].map((rol) => ({
        id: 'marca-' + rol + '-halo',
        type: 'line',
        source: 'calles',
        filter: ['in', ['get', 'id'], ['literal', []]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P[rol], 'line-opacity': 0.25, 'line-width': z([10, 8, 14, 14, 16, 24, 18, 50]), 'line-blur': 2 },
      })),
      ...['pista', 'error', 'correcta', 'objetivo'].map((rol) => ({
        id: 'marca-' + rol,
        type: 'line',
        source: 'calles',
        filter: ['in', ['get', 'id'], ['literal', []]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P[rol], 'line-width': z([10, 2.5, 14, 4, 16, 9, 18, 26]), ...(rol === 'error' ? { 'line-dasharray': [1.2, 0.8] } : {}) },
      })),
      {
        id: 'trazado',
        type: 'line',
        source: 'trazado',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['coalesce', ['get', 'color'], P.pista], 'line-width': z([12, 3, 16, 9, 18, 20]), 'line-opacity': 0.9 },
      },
      {
        id: 'ruta-borde',
        type: 'line',
        source: 'ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': z([10, 4, 14, 8, 16, 14, 18, 30]) },
      },
      {
        id: 'ruta',
        type: 'line',
        source: 'ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['coalesce', ['get', 'color'], P.ruta], 'line-width': z([10, 2.5, 14, 5, 16, 9, 18, 22]) },
      },
      {
        id: 'ruta-flechas',
        type: 'symbol',
        source: 'ruta',
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 80, 'icon-image': 'flecha', 'icon-size': 0.7, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true },
        paint: { 'icon-color': '#ffffff' },
      },
      // límites bien marcados: línea del color de cada zona con un filo blanco a cada lado para que destaque sobre el plano
      ...[
        ['distritos', [10, 2.4, 13, 3.4, 16, 5.5], 3],
        ['barrios', [11, 1.4, 13, 2, 16, 3.2], 2],
      ].flatMap(([fuente, ancho, filo]) => [
        { id: fuente + '-linea-fondo', type: 'line', source: fuente, layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': z(ancho.map((v, i) => (i % 2 ? v + filo : v))), 'line-opacity': 0.85 } },
        { id: fuente + '-linea', type: 'line', source: fuente, layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': z(ancho), 'line-opacity': 1 } },
      ]),
      {
        id: 'barrio-sel-linea',
        type: 'line',
        source: 'barrios',
        filter: ['==', ['get', 'id'], -1],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': P.objetivo, 'line-width': z([11, 1.5, 16, 3.5]), 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'lugares',
        type: 'circle',
        source: 'lugares',
        minzoom: 11,
        filter: ['in', ['get', 'cat'], ['literal', []]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 14, 7, 17, 11],
          'circle-color': ['match', ['get', 'cat'], ...Object.entries(CATEGORIAS).flatMap(([k, c]) => [k, c.color]), '#777'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      },
      {
        id: 'lugares-letra',
        type: 'symbol',
        source: 'lugares',
        minzoom: 13,
        filter: ['in', ['get', 'cat'], ['literal', []]],
        layout: {
          'text-field': ['match', ['get', 'cat'], ...Object.entries(CATEGORIAS).flatMap(([k, c]) => [k, c.letra]), ''],
          'text-font': FUENTE_M,
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 8, 17, 12],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      // carreteras de acceso: por encima de la máscara para ver por dónde llegan
      {
        id: 'carreteras-acceso-borde',
        type: 'line',
        source: 'carreteras',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': z([10, 4, 13, 6, 16, 14]) },
      },
      {
        id: 'carreteras-acceso',
        type: 'line',
        source: 'carreteras',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'red'], 'estado', '#D23B2A', 'junta', '#2E8B57', '#E0A21B'],
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 9, ['==', ['get', 'tipo'], 'Autovía'], 4.5, 3],
        },
      },
      {
        id: 'carreteras-ref',
        type: 'symbol',
        source: 'carreteras',
        layout: {
          visibility: 'none',
          'symbol-placement': 'line',
          'symbol-spacing': 320,
          'text-field': ['get', 'ref'],
          'text-font': FUENTE_M,
          'text-size': 11.5,
          'text-letter-spacing': 0.04,
          'text-rotation-alignment': 'viewport',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': ['match', ['get', 'red'], 'estado', '#B3261E', 'junta', '#1F6B42', '#B07E10'],
          'text-halo-width': 3.5,
        },
      },
      {
        id: 'carreteras-entradas',
        type: 'symbol',
        source: 'entradas',
        layout: {
          visibility: 'none',
          'text-field': ['concat', ['get', 'ref'], ['case', ['!=', ['get', 'destino'], ''], ['concat', ' · ', ['get', 'destino']], '']],
          'text-font': FUENTE_M,
          'text-size': 11,
          'text-anchor': 'center',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#2A4F7A', 'text-halo-width': 4 },
      },
      // rótulos
      {
        id: 'agua-nombres',
        type: 'symbol',
        source: 'base',
        'source-layer': 'water',
        filter: termino ? ['all', ['has', 'name'], ['within', termino]] : ['has', 'name'],
        layout: { 'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']], 'text-font': FUENTE_I, 'text-size': 12, 'symbol-placement': 'point' },
        paint: { 'text-color': '#4E7FA8', 'text-halo-color': P.halo, 'text-halo-width': 1.2 },
      },
      // Nombres de calle con el estilo del original (callejerosevilla.es): a lo largo de la calle y dentro de
      // ella. Una capa por zoom para que el tamaño no cambie dentro de cada nivel (MapLibre comprueba si cabe
      // con el tamaño del zoom siguiente): la letra se reduce lo necesario para que quepa en la calle
      ...CAPAS_CALLES,
      {
        id: 'nombres-principales',
        type: 'symbol',
        source: 'calles',
        minzoom: 12.5,
        filter: ['all', ['==', ['get', 'z'], 0], ['==', ['get', 'p'], 1]],
        layout: {
          visibility: 'none',
          'text-field': NOMBRE_SEGUN_ZOOM,
          'text-font': FUENTE_M,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 12, 15, 14.5, 18, 18],
          'symbol-placement': 'line',
          'text-max-angle': 40,
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 13, 140, 16, 300, 18, 450],
          'text-padding': 2,
        },
        paint: { 'text-color': '#2b231e', 'text-halo-color': '#fff6dc', 'text-halo-width': 1.8 },
      },
      {
        id: 'nombres-plazas',
        type: 'symbol',
        source: 'plazas',
        minzoom: 15,
        layout: {
          visibility: 'none',
          'text-field': NOMBRE_SEGUN_ZOOM,
          'text-font': FUENTE_M,
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11.5, 18, 15.5],
          'text-max-width': 7,
          'text-padding': 3,
        },
        paint: { 'text-color': '#7a3a1f', 'text-halo-color': '#fffaf1', 'text-halo-width': 1.6 },
      },
      {
        id: 'destacados',
        type: 'circle',
        source: 'base',
        'source-layer': 'pois',
        minzoom: 13,
        filter: ['all', ['in', ['get', 'kind'], ['literal', DESTACADOS]], ['has', 'name'], termino ? ['within', termino] : true],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 5.5, 18, 7],
          'circle-color': ['match', ['get', 'kind'], 'place_of_worship', '#8E4A9E', 'monastery', '#8E4A9E', '#C2701E'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.4,
        },
      },
      {
        id: 'base-lugares',
        type: 'symbol',
        source: 'base',
        'source-layer': 'pois',
        minzoom: 14,
        filter: ['all', ['in', ['get', 'kind'], ['literal', DESTACADOS]], termino ? ['within', termino] : true],
        layout: {
          visibility: 'none',
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': FUENTE,
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10.5, 17, 12.5],
          'text-max-width': 8,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': ['match', ['get', 'kind'], 'place_of_worship', '#6E3A7C', 'monastery', '#6E3A7C', '#8A4F12'],
          'text-halo-color': P.halo,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'rotulos-barrios',
        type: 'symbol',
        source: 'rotulos',
        minzoom: 13,
        filter: ['==', ['get', 'nivel'], 'barrio'],
        layout: { visibility: 'none', 'text-field': ['get', 'nombre'], 'text-font': FUENTE_M, 'text-size': 12, 'text-max-width': 7, 'text-letter-spacing': 0.04 },
        paint: { 'text-color': ['coalesce', ['get', 'color'], '#6B5A8A'], 'text-halo-color': P.halo, 'text-halo-width': 1.8 },
      },
      {
        id: 'rotulos-distritos',
        type: 'symbol',
        source: 'rotulos',
        maxzoom: 15,
        filter: ['==', ['get', 'nivel'], 'distrito'],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'nombre'],
          'text-font': FUENTE_M,
          'text-size': z([10, 11, 14, 17]),
          'text-max-width': 8,
          'text-letter-spacing': 0.12,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': P.halo, 'text-halo-width': 2 },
      },
      {
        id: 'lugares-nombres',
        type: 'symbol',
        source: 'lugares',
        minzoom: 15,
        filter: ['in', ['get', 'cat'], ['literal', []]],
        layout: { 'text-field': ['get', 'nombre'], 'text-font': FUENTE, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
        paint: { 'text-color': P.texto, 'text-halo-color': P.halo, 'text-halo-width': 1.3 },
      },
      // zona sensible para tocar calles
      {
        id: 'calles-toque',
        type: 'line',
        source: 'calles',
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': z([11, 8, 13, 10, 16, 18, 18, 34]) },
      },
      // anotaciones
      {
        id: 'anot-relleno',
        type: 'fill',
        source: 'anotaciones',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 },
      },
      {
        id: 'anot-lineas',
        type: 'line',
        source: 'anotaciones',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': ['case', ['==', ['get', 'tipo'], 'medida'], ['literal', [2, 1.5]], ['literal', [1, 0]]] },
      },
      {
        id: 'anot-puntos',
        type: 'circle',
        source: 'anotaciones',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'tipo'], 'marca']],
        paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      },
      {
        id: 'anot-textos',
        type: 'symbol',
        source: 'anotaciones',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['in', ['get', 'tipo'], ['literal', ['texto', 'marca']]]],
        layout: {
          'text-field': ['get', 'texto'],
          'text-font': FUENTE_M,
          'text-size': 14,
          'text-offset': ['case', ['==', ['get', 'tipo'], 'marca'], ['literal', [0, 1.2]], ['literal', [0, 0]]],
          'text-anchor': ['case', ['==', ['get', 'tipo'], 'marca'], 'top', 'center'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': P.halo, 'text-halo-width': 2 },
      },
    ],
  }
}
