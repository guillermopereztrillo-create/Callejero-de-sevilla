// Motor de test: examen real, test a tu medida, contrarreloj y retos

import { D } from './datos.js'
import { marcar, limpiarMarcas, encuadrarCalles, dibujarRuta, ponerMarcador, modoJuego } from './mapa.js'
import { registrarPregunta } from './progreso.js'
import { etiquetaExamen, TIPOS_PREGUNTA } from './preguntas.js'
import { confirmar } from './dialogos.js'
import { app } from './app.js'
import { $, esc, icono, guardado, tiempo, numero, barajar } from './util.js'

let T = null
let reloj = null

const PEN = { 0: 'No resta', 0.5: 'Resta ½', 0.3333: 'Resta ⅓', 0.25: 'Resta ¼' }

/**
 * Empieza un test.
 * cfg: { titulo, preguntas, correccion: 'inmediata'|'final', penalizacion, maxFallos, tiempo (s), sinMapa,
 *        reservas, contrarreloj, guardar (bool), alTerminar(resultado) }
 */
export function iniciarTest(cfg, estado = null) {
  cerrarVentana(true)
  T = {
    id: estado?.id || 't' + Date.now().toString(36),
    cfg: { correccion: 'inmediata', penalizacion: 0.3333, reservas: 0, ...cfg },
    respuestas: estado?.respuestas || Array(cfg.preguntas.length).fill(null),
    corregidas: estado?.corregidas || Array(cfg.preguntas.length).fill(false),
    i: estado?.i || 0,
    restante: estado?.restante ?? cfg.tiempo ?? null,
    empezado: estado?.empezado || Date.now(),
    terminado: false,
  }
  if (cfg.mezclarRespuestas && !estado) {
    T.cfg.preguntas = cfg.preguntas.map((p) => {
      const orden = barajar(p.opciones.map((_, i) => i))
      return { ...p, opciones: orden.map((i) => p.opciones[i]), correcta: orden.indexOf(p.correcta) }
    })
  }
  app.juego = { tipo: 'test', alTocar: null }
  modoJuego(true)
  limpiarMarcas()
  const v = $('#test')
  v.hidden = false
  v.classList.toggle('sin-mapa', !!cfg.sinMapa)
  $('#pregunta').hidden = true
  if (T.restante != null) {
    clearInterval(reloj)
    reloj = setInterval(tic, 1000)
  }
  pintar()
}

function tic() {
  if (!T || T.terminado) return clearInterval(reloj)
  if ($('#test').hidden && !T.cfg.contrarreloj) return // pausado mientras se mira el mapa
  T.restante--
  const r = $('#test .test-reloj')
  if (r) {
    r.textContent = tiempo(T.restante)
    r.classList.toggle('urgente', T.restante <= (T.cfg.contrarreloj ? 10 : 300))
  }
  if (T.restante <= 0) terminar(true)
  else if (T.restante % 15 === 0) guardarEstado()
}

function guardarEstado() {
  if (!T?.cfg.guardar || T.terminado) return
  const lista = guardado.leer('tests', []).filter((x) => x.id !== T.id)
  const { alTerminar, ...cfg } = T.cfg
  lista.unshift({ id: T.id, cfg, respuestas: T.respuestas, corregidas: T.corregidas, i: T.i, restante: T.restante, empezado: T.empezado, fecha: Date.now() })
  guardado.escribir('tests', lista.slice(0, 5))
}

function borrarEstado(id) {
  guardado.escribir(
    'tests',
    guardado.leer('tests', []).filter((x) => x.id !== id),
  )
}

export function testsGuardados() {
  return guardado.leer('tests', [])
}

export function reanudar(id, alTerminar) {
  const e = testsGuardados().find((x) => x.id === id)
  if (e) iniciarTest({ ...e.cfg, alTerminar }, e)
}

export function descartar(id) {
  borrarEstado(id)
}

function etiquetas(p, i) {
  const t = []
  if (p.oficial) t.push(`<span class="etiqueta-mini oficial">Oficial · ${esc(etiquetaExamen(p.examen))} · pregunta ${p.num}</span>`)
  else if (p.propia) t.push('<span class="etiqueta-mini">Pregunta propia</span>')
  else t.push('<span class="etiqueta-mini">No oficial · generada con calles reales</span>')
  if (T.cfg.reservas && i >= T.cfg.preguntas.length - T.cfg.reservas) t.push('<span class="etiqueta-mini">Reserva</span>')
  if (p.tipo && TIPOS_PREGUNTA[p.tipo]) t.push(`<span class="etiqueta-mini">${TIPOS_PREGUNTA[p.tipo]}</span>`)
  return t.join('')
}

function pintar() {
  const v = $('#test')
  const n = T.cfg.preguntas.length
  const p = T.cfg.preguntas[T.i]
  const resp = T.respuestas[T.i]
  const corregida = T.corregidas[T.i]
  const contestadas = T.respuestas.filter((r) => r != null).length
  const cr = T.cfg.contrarreloj
  v.innerHTML = `
    <div class="ventana-barra">
      <span class="ventana-titulo">${esc(T.cfg.titulo)}</span>
      ${T.restante != null ? `<span class="test-reloj">${tiempo(T.restante)}</span>` : `<span style="margin-left:auto"></span>`}
      ${cr ? `<span class="etiqueta-mini oficial">${aciertos()} aciertos</span>` : ''}
      <button type="button" class="redondo" data-t="cerrar" aria-label="Salir del test" title="Salir">${icono.cerrar(12)}</button>
    </div>
    <div class="test-progreso"><span style="width:${(100 * (cr ? T.i : contestadas)) / n}%"></span></div>
    <div class="test-cuerpo">
      <div class="test-num"><b>${cr ? `Pregunta ${T.i + 1}` : `Pregunta ${T.i + 1} de ${n}`}</b>${etiquetas(p, T.i)}</div>
      <p class="enunciado">${esc(p.enunciado)}</p>
      <div class="opciones una-columna">${p.opciones
        .map((o, k) => {
          let c = ''
          if (corregida) c = k === p.correcta ? 'correcta' : k === resp ? 'incorrecta' : ''
          else if (k === resp) c = 'elegida'
          return `<button type="button" class="opcion ${c}" data-op="${k}" ${corregida ? 'disabled' : ''}><span class="letra">${'abc'[k]}</span><span>${esc(o)}</span></button>`
        })
        .join('')}</div>
      ${corregida && p.nota ? `<p class="nota">${esc(p.nota)}</p>` : ''}
      ${!T.cfg.sinMapa && (p.calles?.length || p.ruta) && (corregida || T.cfg.correccion === 'final') && !cr ? `<button type="button" class="secundario pequeno" data-t="mapa" style="margin-top:12px">${icono.mapa(16)} Ver en el mapa</button>` : ''}
      ${!cr ? `<details style="margin-top:16px"><summary class="nota" style="cursor:pointer">Todas las preguntas</summary><div class="mapa-preguntas">${T.cfg.preguntas
        .map((_, k) => {
          let c = T.respuestas[k] != null ? 'respondida' : ''
          if (T.corregidas[k]) c = T.respuestas[k] === T.cfg.preguntas[k].correcta ? 'bien' : 'mal'
          return `<button type="button" class="${c} ${k === T.i ? 'actual' : ''}" data-ir="${k}">${k + 1}</button>`
        })
        .join('')}</div></details>` : ''}
    </div>
    <div class="test-pie">
      ${!cr ? `<button type="button" class="secundario pequeno" data-t="ant" ${T.i === 0 ? 'disabled' : ''}>Anterior</button>` : ''}
      ${!cr && resp != null && !corregida ? `<button type="button" class="secundario pequeno" data-t="borrar">Dejar en blanco</button>` : ''}
      <div class="derecha">
        ${!cr && T.i < n - 1 ? `<button type="button" class="${corregida || resp != null ? 'principal' : 'secundario'} pequeno" data-t="sig">${resp == null && !corregida ? 'Saltar' : 'Siguiente'}</button>` : ''}
        ${!cr && (T.i === n - 1 || T.cfg.correccion === 'final') ? `<button type="button" class="${T.i === n - 1 ? 'principal' : 'secundario'} pequeno" data-t="fin">Terminar</button>` : ''}
      </div>
    </div>`
  v.onclick = alClic
}

function aciertos() {
  return T.respuestas.filter((r, i) => r != null && T.corregidas[i] && r === T.cfg.preguntas[i].correcta).length
}

function fallos() {
  return T.respuestas.filter((r, i) => r != null && T.corregidas[i] && r !== T.cfg.preguntas[i].correcta).length
}

async function alClic(e) {
  const b = e.target.closest('button')
  if (!b) return
  const n = T.cfg.preguntas.length
  if (b.dataset.op != null && !T.corregidas[T.i]) {
    const k = +b.dataset.op
    T.respuestas[T.i] = k
    const p = T.cfg.preguntas[T.i]
    if (T.cfg.correccion === 'inmediata') {
      T.corregidas[T.i] = true
      registrarPregunta(p.id, k === p.correcta)
      if (T.cfg.alResponder) T.cfg.alResponder(k === p.correcta, p)
      if (T.cfg.contrarreloj) {
        T.i++
        if (T.i >= n) return terminar()
        return pintar()
      }
      if (T.cfg.maxFallos && fallos() >= T.cfg.maxFallos) {
        pintar()
        setTimeout(() => terminar(false, 'Has llegado al máximo de fallos.'), 900)
        return
      }
    }
    guardarEstado()
    pintar()
    return
  }
  const t = b.dataset.t
  if (b.dataset.ir != null) {
    T.i = +b.dataset.ir
    return pintar()
  }
  if (t === 'sig') T.i = Math.min(n - 1, T.i + 1)
  if (t === 'ant') T.i = Math.max(0, T.i - 1)
  if (t === 'borrar') T.respuestas[T.i] = null
  if (t === 'mapa') return verEnMapa(T.cfg.preguntas[T.i])
  if (t === 'fin') {
    const blanco = T.respuestas.filter((r) => r == null).length
    if (blanco && !(await confirmar('¿Terminar el test?', `Te quedan ${blanco} preguntas sin responder. Las preguntas en blanco no restan.`, 'Terminar', 'Seguir'))) return
    return terminar()
  }
  if (t === 'cerrar') {
    if (T.terminado) return cerrarVentana()
    const guardar = T.cfg.guardar && T.respuestas.some((r) => r != null)
    if (await confirmar('¿Salir del test?', guardar ? 'Lo guardamos tal como está para que lo termines cuando quieras (en Examen → tests a medias).' : 'Perderás las respuestas de este test.', 'Salir', 'Seguir')) {
      guardarEstado()
      cerrarVentana()
    }
    return
  }
  guardarEstado()
  pintar()
}

function verEnMapa(p) {
  $('#test').hidden = true
  $('#test-volver').hidden = false
  limpiarMarcas()
  if (p.calles?.length) {
    marcar('objetivo', p.calles.slice(0, 1))
    marcar('pista', p.calles.slice(1))
    encuadrarCalles(p.calles, { maxZoom: 16.5 })
  }
  if (p.ruta) {
    dibujarRuta([p.ruta.coords])
    const pq = D.lugares[p.ruta.parque]
    ponerMarcador(pq.lngLat, 'marcador-parque', pq.parque, 'center')
  }
  modoJuego(false)
  $('#test-volver').onclick = () => {
    $('#test').hidden = false
    $('#test-volver').hidden = true
    limpiarMarcas()
    modoJuego(true)
  }
}

function terminar(porTiempo = false, motivo = '') {
  if (!T || T.terminado) return
  clearInterval(reloj)
  T.terminado = true
  borrarEstado(T.id)
  const ps = T.cfg.preguntas
  // corrección final
  ps.forEach((p, i) => {
    if (!T.corregidas[i] && T.respuestas[i] != null) {
      T.corregidas[i] = true
      registrarPregunta(p.id, T.respuestas[i] === p.correcta)
    }
    if (T.respuestas[i] == null) T.corregidas[i] = true
  })
  const cuentan = T.cfg.reservas ? ps.length - T.cfg.reservas : ps.length
  const idx = [...Array(cuentan).keys()]
  const bien = idx.filter((i) => T.respuestas[i] === ps[i].correcta).length
  const mal = idx.filter((i) => T.respuestas[i] != null && T.respuestas[i] !== ps[i].correcta).length
  const blanco = cuentan - bien - mal
  const neta = Math.max(0, bien - mal * (T.cfg.penalizacion || 0))
  const nota = (10 * neta) / Math.max(1, cuentan)
  const res = { bien, mal, blanco, nota, total: cuentan, segundos: Math.round((Date.now() - T.empezado) / 1000), titulo: T.cfg.titulo }
  const hist = guardado.leer('historial', [])
  if (!T.cfg.contrarreloj) {
    hist.unshift({ fecha: Date.now(), titulo: T.cfg.titulo, nota: +nota.toFixed(2), bien, mal, blanco, total: cuentan })
    guardado.escribir('historial', hist.slice(0, 50))
  }
  T.cfg.alTerminar?.(res)
  pintarResultado(res, porTiempo, motivo)
}

function pintarResultado(res, porTiempo, motivo) {
  const v = $('#test')
  const ps = T.cfg.preguntas
  const cr = T.cfg.contrarreloj
  const falladas = ps.map((p, i) => [p, i]).filter(([p, i]) => T.respuestas[i] !== p.correcta)
  v.innerHTML = `
    <div class="ventana-barra"><span class="ventana-titulo">${esc(T.cfg.titulo)}</span><span style="margin-left:auto"></span>
      <button type="button" class="redondo" data-t="cerrar" aria-label="Cerrar">${icono.cerrar(12)}</button></div>
    <div class="test-cuerpo">
      <div class="nota-final">
        ${cr ? `<b>${res.bien}</b><small>aciertos en 60 segundos${T.cfg.record != null && res.bien > T.cfg.record ? ' · ¡nuevo récord!' : T.cfg.record ? ` · tu récord: ${T.cfg.record}` : ''}</small>` : `<b>${numero(res.nota, 2)}</b><small>sobre 10 · ${res.bien} bien, ${res.mal} mal, ${res.blanco} en blanco${T.cfg.penalizacion ? ` · cada fallo ${PEN[T.cfg.penalizacion]?.toLowerCase() ?? 'resta'}` : ''}</small>`}
        ${porTiempo ? '<p class="nota">Se acabó el tiempo.</p>' : ''}${motivo ? `<p class="nota">${esc(motivo)}</p>` : ''}
        ${T.cfg.reservas ? `<p class="nota">Las ${T.cfg.reservas} preguntas de reserva no cuentan (solo sustituyen a las anuladas).</p>` : ''}
      </div>
      <div class="acciones" style="justify-content:center">
        ${falladas.length && !cr ? '<button type="button" class="principal pequeno" data-t="repetir">Repetir las falladas</button>' : ''}
        ${T.cfg.compartir ? '<button type="button" class="secundario pequeno" data-t="compartir">Compartir resultado</button>' : ''}
        <button type="button" class="secundario pequeno" data-t="cerrar">Cerrar</button>
      </div>
      ${
        cr
          ? ''
          : `<h3 class="subtitulo">Revisión</h3>
      <label class="interruptor"><input type="checkbox" id="solo-falladas" checked /><i></i>Solo falladas y en blanco</label>
      <div id="revision">${ps
        .map((p, i) => {
          const r = T.respuestas[i]
          const ok = r === p.correcta
          return `<div class="revision" data-ok="${ok}" ${ok ? 'hidden' : ''}>
          <div class="test-num"><b>${i + 1}.</b>${etiquetas(p, i)}</div>
          <p style="margin:6px 0;font-weight:500">${esc(p.enunciado)}</p>
          ${p.opciones.map((o, k) => `<div class="opcion ${k === p.correcta ? 'correcta' : k === r ? 'incorrecta' : ''}"><span class="letra">${'abc'[k]}</span><span>${esc(o)}</span></div>`).join('')}
          ${r == null ? '<p class="nota">En blanco.</p>' : ''}
          ${!T.cfg.sinMapa || true ? (p.calles?.length || p.ruta ? `<button type="button" class="secundario pequeno" data-mapa="${i}" style="margin-top:8px">${icono.mapa(16)} Ver en el mapa</button>` : '') : ''}
        </div>`
        })
        .join('')}</div>`
      }
    </div>`
  v.classList.remove('sin-mapa')
  v.onclick = async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.mapa != null) return verEnMapa(ps[+b.dataset.mapa])
    if (b.dataset.t === 'cerrar') return cerrarVentana()
    if (b.dataset.t === 'compartir') return T.cfg.compartir(res)
    if (b.dataset.t === 'repetir') {
      iniciarTest({ ...T.cfg, titulo: 'Repaso de falladas', preguntas: falladas.map(([p]) => p), tiempo: null, reservas: 0, guardar: false, sinMapa: false })
    }
  }
  const sf = $('#solo-falladas')
  if (sf) sf.onchange = () => v.querySelectorAll('.revision').forEach((r) => (r.hidden = sf.checked && r.dataset.ok === 'true'))
}

export function cerrarVentana(silencioso = false) {
  clearInterval(reloj)
  if (T && !T.terminado && !silencioso) guardarEstado()
  T = null
  $('#test').hidden = true
  $('#test').innerHTML = ''
  $('#test-volver').hidden = true
  if (app.juego?.tipo === 'test') app.juego = null
  if (!silencioso) {
    limpiarMarcas()
    modoJuego(false)
    document.dispatchEvent(new CustomEvent('test-cerrado'))
  }
}

export const testActivo = () => !!T && !T.terminado
