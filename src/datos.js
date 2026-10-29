// Carga de datos: callejero (CDAU), zonas (Ayuntamiento), lugares, red de tramos y preguntas oficiales

export const D = {
  calles: [],
  distritos: [],
  barrios: [],
  lugares: [],
  carreteras: [],
  oficiales: { examenes: [], preguntas: [] },
  fuentes: null,
  porClave: new Map(),
  red: null,
}

export const BASE = (import.meta.env?.BASE_URL ?? '/') + 'datos/'

const NEXOS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al'])
const TIPOS = /^(calle|c|cl|c\/|avenida|avda|av|plaza|pza|pl|plazuela|plazoleta|glorieta|paseo|pso|callejon|pasaje|psje|ronda|carretera|ctra|camino|puente|via|barriada|bda|grupo|poligono|urbanizacion|costanilla|barreduela|rotonda|jardines|jardin|parque|autovia)\b\.?\s*/

/** Forma de comparación: sin tildes ni signos ni artículos (igual que en preparar_datos.py). */
export function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !NEXOS.has(p))
    .join(' ')
}

/** Normaliza lo que escribe la persona: además quita el tipo de vía del principio. */
export function normalizarRespuesta(s) {
  let t = String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  t = t.replace(TIPOS, '')
  return normalizar(t)
}

export function distancia(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m || !n) return m || n
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

/** ¿La respuesta escrita corresponde a la calle? Admite pequeñas erratas. */
export function coincideNombre(respuesta, calle) {
  const r = normalizarRespuesta(respuesta)
  if (!r) return false
  const objetivos = [calle.k, normalizar(calle.n), calle.so ? normalizar(calle.so) : null].filter(Boolean)
  return objetivos.some((k) => {
    if (r === k) return true
    const tol = k.length > 14 ? 3 : k.length > 7 ? 2 : k.length > 4 ? 1 : 0
    return distancia(r, k) <= tol
  })
}

export const estudiable = (c) => !c.z && !/sin nombre/i.test(c.n) && c.l >= 15

export function nombreCompleto(id) {
  return D.calles[id]?.n ?? ''
}

export function colorDistrito(id) {
  return D.distritos[id]?.color ?? '#8a6d4b'
}

function bbox(geom) {
  let b = [Infinity, Infinity, -Infinity, -Infinity]
  const recorrer = (c) => {
    if (typeof c[0] === 'number') {
      b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]
    } else c.forEach(recorrer)
  }
  recorrer(geom.coordinates)
  return b
}

export function unirBbox(lista) {
  return lista.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity])
}

export async function cargarDatos(progreso = () => {}) {
  const archivos = ['calles.json', 'distritos.geojson', 'barrios.geojson', 'lugares.geojson', 'test-oficiales.json', 'fuentes.json', 'carreteras.geojson']
  let hechos = 0
  const res = await Promise.all(
    archivos.map((a) =>
      fetch(BASE + a)
        .then((r) => {
          if (!r.ok) throw new Error(`No se pudo cargar ${a}`)
          return r.json()
        })
        .then((j) => {
          progreso(++hechos / archivos.length)
          return j
        }),
    ),
  )
  const [calles, distritos, barrios, lugares, oficiales, fuentes, carreteras] = res
  D.calles = calles
  D.distritos = distritos.features.map((f) => ({ ...f.properties, bbox: bbox(f.geometry) }))
  D.barrios = barrios.features.map((f) => ({ ...f.properties, bbox: bbox(f.geometry), geom: f.geometry }))
  D.lugares = lugares.features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }))
  D.oficiales = oficiales
  D.fuentes = fuentes
  // primero las del Estado y la Junta, que son las que suelen salir en el examen
  const orden = { estado: 0, junta: 1, diputacion: 2 }
  D.carreteras = carreteras.features
    .map((f, i) => ({ ...f.properties, i, bbox: bbox(f.geometry) }))
    .sort((a, b) => orden[a.red] - orden[b.red] || a.ref.localeCompare(b.ref, 'es', { numeric: true }))
  for (const c of D.calles) {
    if (!D.porClave.has(c.k)) D.porClave.set(c.k, [])
    D.porClave.get(c.k).push(c.id)
  }
  for (const b of D.barrios) {
    b.estudio = D.calles.filter((c) => c.b[0] === b.id && estudiable(c)).sort((x, y) => x.dif - y.dif || y.l - x.l).map((c) => c.id)
  }
  return D
}

/** Red de tramos para las rutas (se carga solo cuando hace falta). */
export async function cargarRed() {
  if (D.red) return D.red
  const r = await fetch(BASE + 'red.json').then((r) => r.json())
  const ady = Array.from({ length: r.nodos.length }, () => [])
  r.tramos.forEach((t, i) => {
    const [a, b, , , sentido] = t
    if (sentido >= 0) ady[a].push(i)
    if (sentido <= 0) ady[b].push(i)
  })
  D.red = { ...r, ady }
  return D.red
}

/** Busca calles por nombre aproximado (para enlazar las calles citadas en las preguntas oficiales). */
export function buscarCallePorTexto(texto) {
  const k = normalizarRespuesta(texto)
  if (D.porClave.has(k)) return D.porClave.get(k)
  const r = []
  for (const c of D.calles) if (c.k === k || normalizar(c.n) === k) r.push(c.id)
  return r
}

export function lugaresDeCalle(id) {
  return D.lugares.filter((l) => l.calle === id)
}

export const CATEGORIAS = {
  bomberos: { nombre: 'Parques de bomberos', color: '#C0392B', letra: 'B' },
  hospital: { nombre: 'Hospitales', color: '#D2453B', letra: 'H' },
  salud: { nombre: 'Centros de salud', color: '#E07A5F', letra: '+' },
  policia: { nombre: 'Policía Local', color: '#3D5A80', letra: 'P' },
  monumento: { nombre: 'Monumentos (BIC)', color: '#8E5B3A', letra: 'M' },
  museo: { nombre: 'Museos', color: '#7A5BA0', letra: 'm' },
  educacion: { nombre: 'Colegios e institutos', color: '#B9822F', letra: 'E' },
  universidad: { nombre: 'Universidades', color: '#5C6BC0', letra: 'U' },
  transporte: { nombre: 'Metro, tren y autobuses', color: '#1E88A8', letra: 'T' },
  mercado: { nombre: 'Mercados', color: '#4D8B4A', letra: '€' },
  biblioteca: { nombre: 'Bibliotecas', color: '#2F7C9A', letra: 'L' },
  civico: { nombre: 'Centros cívicos', color: '#3F8E86', letra: 'C' },
  cultura: { nombre: 'Espacios culturales', color: '#9C4F96', letra: 'A' },
  social: { nombre: 'Servicios sociales', color: '#6D8B3A', letra: 'S' },
  distrito: { nombre: 'Juntas de distrito', color: '#6B5B4B', letra: 'D' },
  deporte: { nombre: 'Estadios', color: '#2E7D32', letra: 'e' },
}

let geometrias = null
/** Geometría de cada calle (para situar la ficha y recorrer la calle en la vista de calle). */
export async function geometriaCalle(id) {
  if (!geometrias) {
    geometrias = fetch(BASE + 'calles.geojson')
      .then((r) => r.json())
      .then((j) => {
        const m = new Map()
        for (const f of j.features) m.set(f.properties.id, f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
        return m
      })
  }
  return (await geometrias).get(id) || []
}
