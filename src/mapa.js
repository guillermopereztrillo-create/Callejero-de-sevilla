// El plano: MapLibre + PMTiles, capas y utilidades para resaltar calles, zonas y rutas

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { construirEstilo, PALETAS } from './estilo-mapa.js'
import { BASE, D, unirBbox } from './datos.js'
import { guardado, distanciaM } from './util.js'

export { distanciaM }

export let mapa
let termino = null
const CENTRO = [-5.982, 37.388]

export const capas = Object.assign(
  {
    mudo: true,
    nombres: false,
    distritos: false,
    barrios: false,
    peatonales: true,
    sentido: true,
    satelite: false,
    relieve: false,
    poligonos: false,
    carreteras: true,
    pdi: ['bomberos', 'hospital', 'monumento', 'educacion', 'transporte'],
  },
  guardado.leer('capas2', {}),
)

/** Mientras se juega, los nombres no se muestran aunque estén activados. */
let ocultarNombres = false

export function temaActual() {
  return document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'
}

/** Flecha (→) para el sentido de circulación: un trazo con su punta, apuntando a lo largo de la calle. */
function imagenFlecha() {
  const s = 48
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.strokeStyle = '#000'
  g.lineWidth = 5
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(8, 24)
  g.lineTo(30, 24)
  g.stroke()
  g.beginPath()
  g.moveTo(42, 24)
  g.lineTo(26, 13)
  g.lineTo(26, 35)
  g.closePath()
  g.fill()
  return { width: s, height: s, data: new Uint8Array(g.getImageData(0, 0, s, s).data.buffer) }
}

function limites(geo) {
  let b = [180, 90, -180, -90]
  const r = (c) => (typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(r))
  r(geo.geometry.coordinates)
  return b
}

export async function crearMapa(contenedor) {
  const protocolo = new Protocol()
  maplibregl.addProtocol('pmtiles', protocolo.tile)
  termino = await fetch(BASE + 'termino.geojson')
    .then((r) => r.json())
    .catch(() => null)

  // el plano no deja salir de Sevilla (los 11 distritos, con algo de margen)
  const b = termino ? limites(termino) : [-6.04, 37.31, -5.86, 37.45]
  mapa = new maplibregl.Map({
    container: contenedor,
    style: construirEstilo(temaActual(), termino),
    center: CENTRO,
    zoom: 12.2,
    minZoom: 11,
    maxZoom: 19.5,
    maxBounds: [
      [b[0] - 0.07, b[1] - 0.045],
      [b[2] + 0.07, b[3] + 0.045],
    ],
    attributionControl: false,
    dragRotate: true,
    pitchWithRotate: true,
    fadeDuration: 150,
  })
  mapa.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Lugares: Ayuntamiento de Sevilla (datos abiertos)',
    }),
    'bottom-left',
  )
  const escala = new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' })
  mapa.addControl(escala, 'bottom-right')
  document.getElementById('escala').append(escala._container)

  mapa.on('styleimagemissing', (e) => {
    if (e.id === 'flecha' && !mapa.hasImage('flecha')) mapa.addImage('flecha', imagenFlecha(), { sdf: true })
  })
  mapa.on('error', (e) => {
    // la ortofoto o el relieve pueden fallar sin romper el plano
    if (!/pnoa|elevation|glyph/i.test(String(e?.error?.message || e?.sourceId || ''))) console.warn(e.error || e)
  })

  await new Promise((r) => mapa.once('load', r))
  if (import.meta.env.DEV || location.hostname === 'localhost') window.__mapa = mapa
  mapa.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  if (!mapa.hasImage('flecha')) mapa.addImage('flecha', imagenFlecha(), { sdf: true })
  aplicarCapas()
  mandos()
  return mapa
}

function mandos() {
  document.getElementById('zoom-mas').onclick = () => mapa.zoomIn()
  document.getElementById('zoom-menos').onclick = () => mapa.zoomOut()
  const norte = document.getElementById('boton-norte')
  norte.onclick = () => mapa.easeTo({ bearing: 0, pitch: capas.relieve || tresD ? mapa.getPitch() : 0 })
  mapa.on('rotate', () => (norte.querySelector('svg').style.transform = `rotate(${-mapa.getBearing()}deg)`))
  const b3d = document.getElementById('boton-3d')
  b3d.onclick = () => {
    tresD = !tresD
    b3d.setAttribute('aria-pressed', tresD)
    mapa.setLayoutProperty('edificios-3d', 'visibility', tresD ? 'visible' : 'none')
    mapa.easeTo({ pitch: tresD ? 58 : 0, zoom: tresD ? Math.max(mapa.getZoom(), 15.5) : mapa.getZoom(), duration: 900 })
  }
}
let tresD = false

const vis = (id, v) => mapa.getLayer(id) && mapa.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')

export function aplicarCapas() {
  if (!mapa) return
  guardado.escribir('capas2', capas)
  const sat = capas.satelite
  vis('satelite', sat)
  for (const id of ['tierra', 'cubierta', 'usos-verde', 'usos-industrial', 'agua', 'agua-lineas']) vis(id, !sat)
  mapa.setPaintProperty('manzanas', 'fill-opacity', sat ? 0 : ['interpolate', ['linear'], ['zoom'], 11, 0.55, 14, 1])
  mapa.setPaintProperty('manzanas-borde', 'line-opacity', sat ? 0.35 : 1)
  for (const id of ['calles', 'principales']) mapa.setPaintProperty(id, 'line-opacity', sat ? 0.55 : 1)
  for (const id of ['calles-borde', 'principales-borde']) mapa.setPaintProperty(id, 'line-opacity', sat ? 0 : 1)

  const nombres = capas.nombres && !ocultarNombres
  vis('nombres-calles', nombres)
  const etiquetasBase = !capas.mudo && !ocultarNombres
  vis('base-lugares', etiquetasBase)
  vis('agua-nombres', etiquetasBase)

  vis('distritos-linea', capas.distritos)
  vis('distritos-relleno', capas.distritos)
  vis('rotulos-distritos', capas.distritos && !ocultarNombres)
  vis('barrios-linea', capas.barrios)
  vis('barrios-relleno', capas.barrios)
  vis('rotulos-barrios', capas.barrios && !ocultarNombres)
  vis('peatonales', capas.peatonales)
  vis('sentidos', capas.sentido)
  vis('poligonos', capas.poligonos)
  for (const id of ['carreteras-acceso-borde', 'carreteras-acceso', 'carreteras-ref']) vis(id, capas.carreteras)
  vis('carreteras-entradas', capas.carreteras && !ocultarNombres)

  vis('sombreado', capas.relieve)
  if (capas.relieve) {
    mapa.setTerrain({ source: 'dem', exaggeration: 4 })
    if (mapa.getPitch() < 30) mapa.easeTo({ pitch: 55, duration: 800 })
  } else if (mapa.getTerrain()) {
    mapa.setTerrain(null)
  }
  const cats = capas.pdi || []
  const filtro = ['in', ['get', 'cat'], ['literal', cats]]
  // los colegios son muchos: aparecen al acercarse
  const filtroZoom = ['all', filtro, ['any', ['!=', ['get', 'cat'], 'educacion'], ['>=', ['zoom'], 14]]]
  mapa.setFilter('lugares', filtroZoom)
  mapa.setFilter('lugares-letra', filtroZoom)
  mapa.setFilter('lugares-nombres', filtro)
  vis('lugares-nombres', !ocultarNombres)
  vis('bic', cats.includes('monumento'))
}

export function modoJuego(activo) {
  ocultarNombres = activo
  aplicarCapas()
}

/** Cambia los colores del plano al tema claro u oscuro sin recargarlo. */
export function aplicarTema() {
  if (!mapa) return
  const estilo = construirEstilo(temaActual(), termino)
  for (const capa of estilo.layers) {
    if (!mapa.getLayer(capa.id) || !capa.paint) continue
    for (const [k, v] of Object.entries(capa.paint)) {
      if (k.endsWith('-opacity') && (capa.id.startsWith('manzanas') || capa.id.startsWith('calles') || capa.id.startsWith('principales'))) continue
      try {
        mapa.setPaintProperty(capa.id, k, v)
      } catch {}
    }
  }
  aplicarCapas()
}

// ---------------------------------------------------------------- resaltados

const marcas = { objetivo: [], pista: [], correcta: [], error: [] }

/** Resalta calles por rol: objetivo (terracota), pista (azul), correcta (verde), error (rojo). */
export function marcar(rol, ids = []) {
  marcas[rol] = ids
  const f = ['in', ['get', 'id'], ['literal', ids]]
  mapa.setFilter('marca-' + rol, f)
  mapa.setFilter('marca-' + rol + '-halo', f)
}

export function limpiarMarcas() {
  for (const r of Object.keys(marcas)) marcar(r, [])
  marcarBarrio(null)
  dibujarRuta(null)
  trazar([])
  quitarMarcadores()
}

export function marcarBarrio(id) {
  const ids = Array.isArray(id) ? id : id == null ? [] : [id]
  const f = ['in', ['get', 'id'], ['literal', ids]]
  mapa.setFilter('barrio-sel-relleno', f)
  mapa.setFilter('barrio-sel-linea', f)
}

export function encuadrar(bbox, opciones = {}) {
  if (!bbox || !isFinite(bbox[0])) return
  const ancho = Math.max(bbox[2] - bbox[0], 0.0015)
  const alto = Math.max(bbox[3] - bbox[1], 0.0012)
  const cx = (bbox[0] + bbox[2]) / 2
  const cy = (bbox[1] + bbox[3]) / 2
  const b = [
    [cx - ancho / 2, cy - alto / 2],
    [cx + ancho / 2, cy + alto / 2],
  ]
  // se espera un instante para que la tarjeta de pregunta ya esté pintada y su alto cuente en el margen
  setTimeout(() => mapa.fitBounds(b, { padding: relleno(), maxZoom: opciones.maxZoom ?? 17.2, duration: opciones.duracion ?? 900 }), 0)
}

export function encuadrarCalles(ids, opciones) {
  encuadrar(unirBbox(ids.map((i) => D.calles[i].bb)), opciones)
}

/** Margen para que lo encuadrado no quede bajo la tarjeta de pregunta ni los paneles. */
export function relleno() {
  const ancho = mapa.getContainer().clientWidth
  const movil = ancho < 700
  const pregunta = document.getElementById('pregunta')
  const test = document.getElementById('test')
  const abajo = !pregunta.hidden ? pregunta.offsetHeight + 40 : 60
  const izquierda = !test.hidden && !test.classList.contains('sin-mapa') ? test.offsetWidth + 40 : 60
  return movil ? { top: 70, bottom: abajo, left: 30, right: 30 } : { top: 80, bottom: abajo, left: izquierda, right: document.getElementById('capas').hidden ? 80 : 290 }
}

// ---------------------------------------------------------------- rutas y trazados

export function dibujarRuta(lineas, color) {
  const fuente = mapa.getSource('ruta')
  if (!fuente) return
  const features = (lineas || []).map((coords) => ({ type: 'Feature', properties: color ? { color } : {}, geometry: { type: 'LineString', coordinates: coords } }))
  fuente.setData({ type: 'FeatureCollection', features })
}

export function trazar(lineas) {
  mapa.getSource('trazado')?.setData({
    type: 'FeatureCollection',
    features: lineas.map((l) => ({ type: 'Feature', properties: l.color ? { color: l.color } : {}, geometry: { type: 'LineString', coordinates: l.coords } })),
  })
}

const marcadores = []
export function ponerMarcador(lngLat, clase = 'marcador-lugar', texto = '', anclaje = 'bottom') {
  const el = document.createElement('div')
  el.className = clase
  if (texto) el.textContent = texto
  const m = new maplibregl.Marker({ element: el, anchor: clase === 'marcador-lugar' ? 'bottom-left' : anclaje }).setLngLat(lngLat).addTo(mapa)
  marcadores.push(m)
  return m
}

export function quitarMarcadores() {
  while (marcadores.length) marcadores.pop().remove()
}

export function globo(lngLat, html) {
  return new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'globo' }).setLngLat(lngLat).setHTML(html).addTo(mapa)
}

/** Calle bajo el punto tocado (con margen generoso para el dedo). */
export function calleEn(punto, margen = 10) {
  const caja = [
    [punto.x - margen, punto.y - margen],
    [punto.x + margen, punto.y + margen],
  ]
  const fs = mapa.queryRenderedFeatures(caja, { layers: ['calles-toque'] })
  if (!fs.length) return null
  // la más cercana al punto
  let mejor = null
  let md = Infinity
  for (const f of fs) {
    const d = distanciaPixeles(punto, f.geometry)
    if (d < md) {
      md = d
      mejor = f
    }
  }
  return mejor ? mejor.properties.id : null
}

function distanciaPixeles(p, geom) {
  const lineas = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates
  let md = Infinity
  for (const l of lineas) {
    for (let i = 1; i < l.length; i++) {
      const a = mapa.project(l[i - 1])
      const b = mapa.project(l[i])
      md = Math.min(md, distSeg(p, a, b))
    }
  }
  return md
}

function distSeg(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = dx * dx + dy * dy
  let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

let encima = null
/** Resalta la calle bajo el ratón (solo en Explorar). */
export function activarEncima(activo, alMover) {
  mapa.off('mousemove', manejarEncima)
  mapa.off('mouseout', salirEncima)
  salirEncima()
  if (activo) {
    mapa.on('mousemove', manejarEncima)
    mapa.on('mouseout', salirEncima)
    manejarEncima.cb = alMover
  }
}
function manejarEncima(e) {
  const id = calleEn(e.point, 6)
  if (id === encima) return
  salirEncima()
  if (id != null) {
    encima = id
    mapa.setFeatureState({ source: 'calles', id }, { encima: true })
    mapa.getCanvas().style.cursor = 'pointer'
  }
  manejarEncima.cb?.(id, e)
}
function salirEncima() {
  if (encima != null) mapa.setFeatureState({ source: 'calles', id: encima }, { encima: false })
  encima = null
  if (mapa) mapa.getCanvas().style.cursor = ''
  manejarEncima.cb?.(null)
}

export function colorPaleta(k) {
  return PALETAS[temaActual()][k]
}
