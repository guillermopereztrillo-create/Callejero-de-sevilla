// Rutas sobre la red de tramos del CDAU, con el sentido de circulación de OpenStreetMap

import { D, cargarRed } from './datos.js'
import { distanciaM } from './util.js'

export function parques() {
  return D.lugares
    .filter((l) => l.cat === 'bomberos' && l.parque)
    .sort((a, b) => a.parque - b.parque)
    .map((l) => ({ ...l, calleNombre: D.calles[l.calle]?.n }))
}

class Monticulo {
  constructor() {
    this.a = []
  }
  push(p, v) {
    const a = this.a
    a.push([p, v])
    let i = a.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (a[j][0] <= a[i][0]) break
      ;[a[i], a[j]] = [a[j], a[i]]
      i = j
    }
  }
  pop() {
    const a = this.a
    const top = a[0]
    const ult = a.pop()
    if (a.length) {
      a[0] = ult
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }
  get size() {
    return this.a.length
  }
}

function nodoCercano(red, lngLat) {
  let mejor = -1
  let md = Infinity
  red.tramos.forEach((t) => {
    if (t[5]) return
    for (const n of [t[0], t[1]]) {
      const d = distanciaM(red.nodos[n], lngLat)
      if (d < md) {
        md = d
        mejor = n
      }
    }
  })
  return mejor
}

/**
 * Ruta más corta (respetando sentidos) desde un punto hasta cualquier tramo de la calle destino.
 * `penalizar` es un conjunto de tramos a evitar (para buscar alternativas).
 */
export async function calcularRuta(desde, calleDestino, penalizar = null) {
  const red = await cargarRed()
  const origen = Array.isArray(desde) ? nodoCercano(red, desde) : desde
  const destinos = new Set()
  red.tramos.forEach((t) => {
    if (t[3] === calleDestino) {
      destinos.add(t[0])
      destinos.add(t[1])
    }
  })
  if (!destinos.size || origen < 0) return null
  const dist = new Float64Array(red.nodos.length).fill(Infinity)
  const previo = new Int32Array(red.nodos.length).fill(-1)
  dist[origen] = 0
  const h = new Monticulo()
  h.push(0, origen)
  let llegada = -1
  while (h.size) {
    const [d, n] = h.pop()
    if (d > dist[n]) continue
    if (destinos.has(n)) {
      llegada = n
      break
    }
    for (const ti of red.ady[n]) {
      const t = red.tramos[ti]
      const otro = t[0] === n ? t[1] : t[0]
      let coste = t[2] * (t[5] ? 3 : 1) * (t[3] < 0 ? 1.15 : 1)
      if (penalizar?.has(ti)) coste *= 6
      const nd = d + coste
      if (nd < dist[otro]) {
        dist[otro] = nd
        previo[otro] = ti
        h.push(nd, otro)
      }
    }
  }
  if (llegada < 0) return null
  const tramos = []
  let n = llegada
  while (n !== origen) {
    const ti = previo[n]
    tramos.unshift(ti)
    const t = red.tramos[ti]
    n = t[0] === n ? t[1] : t[0]
  }
  return construir(red, origen, tramos, calleDestino)
}

function construir(red, origen, tramos, calleDestino) {
  const coords = [red.nodos[origen]]
  let n = origen
  let metros = 0
  const pasos = []
  for (const ti of tramos) {
    const t = red.tramos[ti]
    const adelante = t[0] === n
    const intermedios = adelante ? t[6] : [...t[6]].reverse()
    n = adelante ? t[1] : t[0]
    coords.push(...intermedios, red.nodos[n])
    metros += t[2]
    const ult = pasos[pasos.length - 1]
    if (t[3] < 0) {
      if (ult) ult.m += t[2]
      continue
    }
    if (ult && ult.calle === t[3]) ult.m += t[2]
    else pasos.push({ calle: t[3], m: t[2] })
  }
  // las calles en las que solo se cruza un instante (menos de 20 m entre dos tramos de la misma) no cuentan
  const limpio = []
  for (const p of pasos) {
    const ult = limpio[limpio.length - 1]
    if (ult && ult.calle === p.calle) {
      ult.m += p.m
      continue
    }
    limpio.push({ ...p })
  }
  const filtrado = limpio.filter((p, i) => p.m >= 20 || i === 0 || i === limpio.length - 1)
  const secuencia = []
  for (const p of filtrado) if (secuencia[secuencia.length - 1] !== p.calle) secuencia.push(p.calle)
  if (secuencia[secuencia.length - 1] !== calleDestino) secuencia.push(calleDestino)
  return { coords, metros, tramos, calles: secuencia }
}

/** ¿Es posible recorrer esta secuencia de calles (cada una cruza con la siguiente)? */
export function secuenciaPosible(ids) {
  for (let i = 1; i < ids.length; i++) if (!D.calles[ids[i - 1]].cr.includes(ids[i])) return false
  return true
}
