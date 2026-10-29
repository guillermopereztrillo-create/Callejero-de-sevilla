// Preguntas: las oficiales (exámenes publicados) y las generadas con calles reales en el mismo formato

import { D, estudiable, buscarCallePorTexto, unirBbox } from './datos.js'
import { parques, calcularRuta } from './rutas.js'
import { barajar, elegir } from './util.js'

export const TIPOS_PREGUNTA = {
  acceso: 'Accesos y cruces',
  relacion: 'Paralelas y perpendiculares',
  zona: 'Barrios y polígonos',
  lugar: 'Edificios y lugares',
  peatonal: 'Calles peatonales',
  sentido: 'Sentido de circulación',
  itinerario: 'Itinerarios',
  otras: 'Otras',
}

const MASCULINOS = new Set(['Paseo', 'Callejón', 'Pasaje', 'Camino', 'Puente', 'Grupo', 'Polígono', 'Parque', 'Jardín', 'Jardines', 'Rincón', 'Acceso', 'Enlace', 'Lugar'])

/** «la calle Feria», «el paseo de Colón»… dentro de una frase. */
export function conArticulo(c, prep = '') {
  const masc = MASCULINOS.has(c.t)
  const nombre = c.n.charAt(0).toLowerCase() + c.n.slice(1)
  if (prep === 'a') return (masc ? 'al ' : 'a la ') + nombre
  if (prep === 'de') return (masc ? 'del ' : 'de la ') + nombre
  return (masc ? 'el ' : 'la ') + nombre
}

const nombre = (id) => D.calles[id].n

/** ¿Está la calle `c` en la zona? Zona: toda Sevilla, un distrito, un barrio o varios ({tipo: 'varias', distritos, barrios}). */
export function enZona(zona, c) {
  if (!zona || zona.tipo === 'todo') return true
  if (zona.tipo === 'distrito') return c.d === zona.id
  if (zona.tipo === 'barrio') return c.b.includes(zona.id)
  return zona.distritos.includes(c.d) || c.b.some((b) => zona.barrios.includes(b))
}

/** Calles en la zona indicada. */
export function callesDeZona(zona) {
  if (!zona || zona.tipo === 'todo') return D.calles
  return D.calles.filter((c) => enZona(zona, c))
}

/** Recuadro de la zona (null para toda Sevilla). */
export function bboxZona(zona) {
  if (!zona || zona.tipo === 'todo') return null
  if (zona.tipo === 'distrito') return D.distritos[zona.id].bbox
  if (zona.tipo === 'barrio') return D.barrios[zona.id].bbox
  return unirBbox([...zona.distritos.map((i) => D.distritos[i].bbox), ...zona.barrios.map((i) => D.barrios[i].bbox)])
}

function centro(c) {
  return [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2]
}

/** Calles cercanas que NO se cruzan con `c` (distractores verosímiles). */
export function cercanasSinCruce(c, n = 3, rnd = Math.random, excluir = []) {
  const [x, y] = centro(c)
  const fuera = new Set([c.id, ...c.cr, ...excluir])
  const cand = []
  for (const o of D.calles) {
    if (fuera.has(o.id) || !estudiable(o) || o.k === c.k) continue
    const [ox, oy] = centro(o)
    const d = Math.hypot((ox - x) * 0.8, oy - y)
    if (d < 0.012) cand.push([d + rnd() * 0.002, o.id])
  }
  cand.sort((a, b) => a[0] - b[0])
  const nombres = new Set([c.k])
  const r = []
  for (const [, id] of cand) {
    if (nombres.has(D.calles[id].k)) continue
    nombres.add(D.calles[id].k)
    r.push(id)
    if (r.length >= n * 3) break
  }
  return barajar(r, rnd).slice(0, n)
}

function sinRepetirNombre(ids) {
  const vistos = new Set()
  return ids.filter((i) => {
    const k = D.calles[i].k
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

function montar(enunciado, correcta, falsas, extra = {}, rnd = Math.random) {
  const opciones = barajar([correcta, ...falsas.slice(0, 2)], rnd)
  if (new Set(opciones).size < 3) return null
  return { enunciado, opciones, correcta: opciones.indexOf(correcta), oficial: false, ...extra }
}

const GENERADORES = {
  acceso(c, rnd) {
    const vec = sinRepetirNombre(c.cr.filter((i) => estudiable(D.calles[i]) && D.calles[i].k !== c.k))
    if (!vec.length) return null
    const ok = elegir(vec, rnd)
    const falsas = cercanasSinCruce(c, 2, rnd)
    if (falsas.length < 2) return null
    const enun = rnd() < 0.5 ? `${capital(conArticulo(c, 'a'))} se accede desde:` : `${capital(conArticulo(c))} confluye con:`
    return montar(enun, nombre(ok) + '.', falsas.map((f) => nombre(f) + '.'), { calles: [c.id, ok], tipo: 'acceso' }, rnd)
  },
  relacion(c, rnd) {
    const usarParalela = c.pa.length && (rnd() < 0.6 || !c.pp.length)
    if (usarParalela) {
      const ok = elegir(sinRepetirNombre(c.pa.filter((i) => estudiable(D.calles[i]))), rnd)
      if (ok == null) return null
      const falsas = [...sinRepetirNombre(c.pp.filter((i) => estudiable(D.calles[i]) && D.calles[i].k !== D.calles[ok].k)), ...cercanasSinCruce(c, 2, rnd, c.pa)]
      return montar(`${capital(conArticulo(c))} es paralela a:`, nombre(ok) + '.', sinRepetirNombre(falsas).slice(0, 2).map((f) => nombre(f) + '.'), { calles: [c.id, ok], tipo: 'relacion' }, rnd)
    }
    if (!c.pp.length) return null
    const ok = elegir(c.pp.filter((i) => estudiable(D.calles[i])), rnd)
    if (ok == null) return null
    const falsas = [...sinRepetirNombre(c.pa.filter((i) => estudiable(D.calles[i]))), ...cercanasSinCruce(c, 2, rnd)]
    return montar(`${capital(conArticulo(c))} es perpendicular a:`, nombre(ok) + '.', sinRepetirNombre(falsas).slice(0, 2).map((f) => nombre(f) + '.'), { calles: [c.id, ok], tipo: 'relacion' }, rnd)
  },
  zona(c, rnd) {
    const b = D.barrios[c.b[0]]
    const otros = barajar(
      D.barrios.filter((x) => !c.b.includes(x.id) && x.distrito === b.distrito),
      rnd,
    )
    const resto = barajar(D.barrios.filter((x) => !c.b.includes(x.id) && x.distrito !== b.distrito), rnd)
    const falsas = [...otros, ...resto].slice(0, 2).map((x) => x.nombre + '.')
    return montar(`${capital(conArticulo(c))} está en el barrio:`, b.nombre + '.', falsas, { calles: [c.id], tipo: 'zona' }, rnd)
  },
  peatonal(c, rnd) {
    const ops = ['No tiene ningún tramo peatonal.', 'Tiene algún tramo peatonal.', 'Es peatonal en su totalidad.']
    return { enunciado: `${capital(conArticulo(c))}:`, opciones: ops, correcta: c.pe, oficial: false, calles: [c.id], tipo: 'peatonal', nota: 'Según las calles peatonales de OpenStreetMap.' }
  },
  sentido(c, rnd) {
    const ops = ['Es de doble sentido de circulación en su totalidad.', 'Tiene tramos de doble sentido y tramos de sentido único.', 'Es de un solo sentido de circulación en su totalidad.']
    return { enunciado: `${capital(conArticulo(c))}:`, opciones: ops, correcta: c.se, oficial: false, calles: [c.id], tipo: 'sentido', nota: 'Según el sentido de circulación de OpenStreetMap.' }
  },
  comunica(c, rnd) {
    const ac = sinRepetirNombre(c.ac.filter((i) => estudiable(D.calles[i]) && D.calles[i].k !== c.k))
    if (ac.length < 2) return null
    const [a, b] = barajar(ac, rnd)
    const falsas = cercanasSinCruce(c, 3, rnd)
    if (falsas.length < 3) return null
    const ok = `${nombre(a)} y ${nombre(b)}.`
    const f1 = `${nombre(a)} y ${nombre(falsas[0])}.`
    const f2 = `${nombre(falsas[1])} y ${nombre(falsas[2])}.`
    return montar(`${capital(conArticulo(c))} comunica las calles:`, ok, [f1, f2], { calles: [c.id, a, b], tipo: 'acceso' }, rnd)
  },
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const LUGARES_PREGUNTA = ['monumento', 'museo', 'hospital', 'mercado', 'bomberos', 'policia', 'biblioteca', 'civico', 'salud']

function preguntaLugar(rnd, zona) {
  const ls = D.lugares.filter((l) => LUGARES_PREGUNTA.includes(l.cat) && enZona(zona, D.calles[l.calle]))
  if (!ls.length) return null
  const l = elegir(ls, rnd)
  const c = D.calles[l.calle]
  const falsas = cercanasSinCruce(c, 2, rnd)
  if (falsas.length < 2) return null
  return montar(`${capital(l.nombre)} está en:`, c.n + '.', falsas.map((f) => nombre(f) + '.'), { calles: [c.id], lugar: l.id, tipo: 'lugar', nota: 'Calle más cercana según los datos abiertos del Ayuntamiento.' }, rnd)
}

/** Pregunta generada de un tipo dado (o al azar). Devuelve null si no se puede con esos filtros. */
export async function generarPregunta(tipo, { rnd = Math.random, zona = null, pool = null } = {}) {
  const lista = (pool || callesDeZona(zona)).filter((c) => estudiable(c) && !c.z)
  if (!lista.length) return null
  if (tipo === 'lugar') return conId(preguntaLugar(rnd, zona), tipo)
  if (tipo === 'itinerario') return conId(await preguntaItinerario(rnd, lista), tipo)
  for (let intento = 0; intento < 25; intento++) {
    let c = elegir(lista, rnd)
    if (tipo === 'peatonal' && rnd() < 0.6) {
      const pe = lista.filter((x) => x.pe > 0)
      if (pe.length) c = elegir(pe, rnd)
    }
    if (tipo === 'sentido' && rnd() < 0.5) {
      const se = lista.filter((x) => x.se > 0)
      if (se.length) c = elegir(se, rnd)
    }
    const gen = tipo === 'acceso' ? (rnd() < 0.7 ? GENERADORES.acceso : GENERADORES.comunica) : GENERADORES[tipo]
    const p = gen?.(c, rnd)
    if (p) return conId(p, tipo)
  }
  return null
}

let contador = 0
function conId(p, tipo) {
  if (!p) return null
  return { id: `gen-${tipo}-${Date.now().toString(36)}-${contador++}`, tipo: p.tipo || tipo, ...p }
}

/** «Para dirigirse a … con salida desde el Parque nº X, el itinerario correcto es:» */
export async function preguntaItinerario(rnd = Math.random, lista = null) {
  const ps = parques()
  const cand = (lista || D.calles).filter((c) => estudiable(c) && c.l > 60)
  if (!cand.length) return null
  const texto = (s) => s.map((id, j) => (j === 0 ? D.calles[id].n : D.calles[id].n.charAt(0).toLowerCase() + D.calles[id].n.slice(1))).join(', ') + '.'
  for (let intento = 0; intento < 20; intento++) {
    const destino = elegir(cand, rnd)
    const p = elegir(ps, rnd)
    const r = await calcularRuta(p.lngLat, destino.id)
    if (!r || r.calles.length < 3 || r.calles.length > 10 || r.calles.some((i) => /sin nombre/i.test(D.calles[i].n))) continue
    const ok = r.calles
    // falsas: el mismo recorrido con una calle cambiada por otra cercana que no conecta (imposible),
    // o la ruta que saldría de otro parque si tiene una longitud parecida
    const falsas = []
    const indices = barajar([...Array(ok.length - 2).keys()].map((i) => i + 1), rnd)
    for (const i of indices) {
      if (falsas.length >= 2) break
      const vecinas = new Set([...D.calles[ok[i - 1]].cr, ...D.calles[ok[i + 1]].cr])
      const susti = cercanasSinCruce(D.calles[ok[i]], 6, rnd, ok).find((s) => !vecinas.has(s) && !/sin nombre/i.test(D.calles[s].n))
      if (susti != null) falsas.push([...ok.slice(0, i), susti, ...ok.slice(i + 1)])
    }
    const otro = elegir(
      ps.filter((x) => x.id !== p.id),
      rnd,
    )
    const r2 = otro ? await calcularRuta(otro.lngLat, destino.id) : null
    if (r2 && r2.calles[0] !== ok[0] && r2.calles.length <= ok.length + 2 && rnd() < 0.6) falsas[0] = r2.calles
    if (falsas.length < 2) continue
    const textos = [ok, ...falsas.slice(0, 2)].map(texto)
    if (new Set(textos).size < 3) continue
    const enun = `Para dirigirse a ${conArticulo(destino)}, con salida desde el Parque de Bomberos nº ${p.parque}, sito en ${conArticulo(D.calles[p.calle])}, el itinerario correcto es:`
    return montar(enun, textos[0], [textos[1], textos[2]], { calles: [destino.id], ruta: { parque: p.id, coords: r.coords, calles: ok }, tipo: 'itinerario' }, rnd)
  }
  return null
}

// ---------------------------------------------------------------- oficiales

export function oficiales({ incluirAnuladas = false } = {}) {
  return D.oficiales.preguntas
    .filter((p) => (incluirAnuladas || !p.anulada) && p.correcta != null)
    .map((p) => ({ ...p, oficial: true, calles: callesCitadas(p) }))
}

/** Calles mencionadas en el enunciado de una pregunta oficial (para «Ver en el mapa»). */
function callesCitadas(p) {
  const r = new Set()
  const textos = [p.enunciado, p.opciones[p.correcta]]
  for (const t of textos) {
    for (const m of t.matchAll(/\b(?:calles?|avenida|plaza|glorieta|paseo|carretera|camino|ronda)\s+((?:[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñü.'-]*|de|del|la|las|los|y|el)(?:\s+(?:[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñü.'-]*|de|del|la|las|los|el))*)/g)) {
      const ids = buscarCallePorTexto(m[1].replace(/\s+(y|de|del|la|las|los|el)$/i, ''))
      ids.slice(0, 2).forEach((i) => r.add(i))
    }
  }
  return [...r]
}

export function etiquetaExamen(id) {
  const e = D.oficiales.examenes.find((x) => x.id === id)
  return e ? e.titulo : 'Examen oficial'
}
