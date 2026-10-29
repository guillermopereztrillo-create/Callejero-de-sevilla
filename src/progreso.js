// Progreso guardado en este navegador: aciertos por calle, repaso espaciado, racha y aprendizaje por zonas

import { guardado, hoy, sumarDias, diasEntre } from './util.js'

// días hasta el siguiente repaso según la «caja» de cada calle
const INTERVALOS = [0, 1, 3, 7, 16, 35]

const VACIO = () => ({ calles: {}, dias: {}, aprender: {}, lugares: {}, preguntas: {}, contrarreloj: 0, examenFecha: '', nombre: '', creado: hoy() })

export let P = Object.assign(VACIO(), guardado.leer('progreso', {}))

const escuchas = new Set()
export function alCambiar(fn) {
  escuchas.add(fn)
}

export function guardar() {
  guardado.escribir('progreso', P)
  escuchas.forEach((fn) => fn())
}

function sumarDia() {
  const d = hoy()
  P.dias[d] = (P.dias[d] || 0) + 1
}

/** Anota una respuesta sobre una calle. */
export function registrar(id, acierto) {
  const e = (P.calles[id] ||= { a: 0, f: 0, caja: 0, prox: hoy(), ult: '' })
  if (acierto) {
    e.a++
    e.caja = Math.min(5, e.caja + 1)
  } else {
    e.f++
    e.caja = 0
  }
  e.ult = hoy()
  e.ok = acierto ? 1 : 0
  e.prox = sumarDias(hoy(), INTERVALOS[e.caja])
  sumarDia()
  guardar()
}

/** Anota una respuesta de test (preguntas oficiales o generadas). */
export function registrarPregunta(id, acierto) {
  const e = (P.preguntas[id] ||= { a: 0, f: 0 })
  acierto ? e.a++ : e.f++
  e.ok = acierto ? 1 : 0
  sumarDia()
  guardar()
}

export function registrarLugar(id, acierto) {
  const e = (P.lugares[id] ||= { a: 0, f: 0 })
  acierto ? e.a++ : e.f++
  sumarDia()
  guardar()
}

export const estado = (id) => P.calles[id]

export function pendientesHoy() {
  const d = hoy()
  return Object.entries(P.calles)
    .filter(([, e]) => e.prox <= d)
    .map(([id]) => +id)
}

export function falladas() {
  return Object.entries(P.calles)
    .filter(([, e]) => e.f > 0 && !e.ok)
    .map(([id]) => +id)
}

export function dominadas() {
  return Object.values(P.calles).filter((e) => e.caja >= 3).length
}

export function racha() {
  let n = 0
  let d = hoy()
  if (!P.dias[d]) d = sumarDias(d, -1)
  while (P.dias[d]) {
    n++
    d = sumarDias(d, -1)
  }
  return n
}

export function resumen() {
  const es = Object.values(P.calles)
  const a = es.reduce((s, e) => s + e.a, 0)
  const f = es.reduce((s, e) => s + e.f, 0)
  return {
    vistas: es.length,
    aciertos: a,
    fallos: f,
    porcentaje: a + f ? Math.round((100 * a) / (a + f)) : 0,
    dominadas: dominadas(),
    repasos: pendientesHoy().length,
    racha: racha(),
  }
}

/** Plan diario hasta la fecha del examen. */
export function plan(totalCalles) {
  if (!P.examenFecha) return null
  const dias = diasEntre(hoy(), P.examenFecha)
  if (dias <= 0) return { dias, porDia: 0 }
  const faltan = Math.max(0, totalCalles - dominadas())
  return { dias, porDia: Math.ceil(faltan / dias) }
}

// ---------------------------------------------------------------- aprender por zonas

export function zona(barrio) {
  return (P.aprender[barrio] ||= { nivel: 0, aciertos: {}, marca: null, terminado: false })
}

export function resumenAprender() {
  const zs = Object.values(P.aprender)
  const enCurso = zs.filter((z) => z.nivel > 0 && !z.terminado).length
  const terminadas = zs.filter((z) => z.terminado).length
  return { enCurso, terminadas, repasos: pendientesHoy().length }
}

// ---------------------------------------------------------------- copia de seguridad

export function exportar() {
  return JSON.stringify({ app: 'callejero-sevilla', version: 1, fecha: new Date().toISOString(), datos: guardado.todo() }, null, 1)
}

export function importar(texto) {
  const j = JSON.parse(texto)
  if (j.app !== 'callejero-sevilla' || !j.datos) throw new Error('El archivo no es una copia del Callejero de Sevilla')
  for (const [k, v] of Object.entries(j.datos)) {
    try {
      localStorage.setItem('callejero.' + k, v)
    } catch {}
  }
}

export function borrarTodo() {
  P = VACIO()
  guardar()
}
