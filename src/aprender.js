// Pestaña Aprender: barrios por niveles (ver → buscar → repasar)

import { D } from './datos.js'
import { marcar, limpiarMarcas, marcarBarrio, encuadrar, encuadrarCalles, modoJuego, calleEn, activarEncima } from './mapa.js'
import { abrirTarjeta, cerrarTarjeta, resultado, acciones } from './tarjeta.js'
import { zona, resumenAprender, registrar, guardar, alCambiar, dominadas } from './progreso.js'
import { app } from './app.js'
import { $, esc, icono, barajar, plural, aviso } from './util.js'

const POR_NIVEL = 5
const ACIERTOS = 3

let sesion = null

export function montarAprender() {
  pintar()
  alCambiar(() => app.pestana === 'aprender' && !sesion && pintar())
  $('#panel-aprender').addEventListener('click', (e) => {
    const b = e.target.closest('[data-barrio]')
    if (b) empezar(+b.dataset.barrio)
    if (e.target.closest('[data-info]')) $('#info-aprender').hidden = !$('#info-aprender').hidden
  })
}

const niveles = (b) => Math.ceil(D.barrios[b].estudio.length / POR_NIVEL)

function pintar() {
  const r = resumenAprender()
  const total = D.barrios.reduce((s, b) => s + b.estudio.length, 0)
  $('#panel-aprender').innerHTML = `
    <section class="bloque">
      <h2>Aprender por zonas <button type="button" class="info-boton" data-info="aprender" aria-label="Más información">i</button></h2>
      <div class="info-texto" id="info-aprender" hidden>Elige un barrio y apréndelo por niveles: cada nivel trae hasta ${POR_NIVEL} calles nuevas. Primero las ves en el mapa y después las buscas tú; cada una necesita ${ACIERTOS} aciertos. Los repasos de niveles anteriores entran solos y, al final, un repaso de todo el barrio te da una marca que superar.</div>
      <div class="cifras">
        <div><b>${r.enCurso}</b><small>en curso</small></div>
        <div><b>${r.repasos}</b><small>repasos</small></div>
        <div><b>${dominadas()}</b><small>dominadas</small></div>
      </div>
      <div class="progreso-mini" title="Calles dominadas de todo el callejero"><span style="width:${Math.min(100, (100 * dominadas()) / total).toFixed(1)}%"></span></div>
      <p class="nota" style="text-align:center">${dominadas().toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} calles</p>
    </section>
    <h3 class="subtitulo">Empezar una zona</h3>
    ${D.distritos
      .map((d) => {
        const hechos = d.barrios.filter((b) => zona(b).terminado).length
        return `<details class="acordeon-zona">
        <summary><span class="punto-color" style="background:${d.color}"></span>${esc(d.nombre)}<span class="cuenta">${hechos ? `${hechos}/` : ''}${plural(d.barrios.length, 'barrio', 'barrios')}</span>${icono.abajo(14)}</summary>
        ${d.barrios
          .map((bid) => {
            const b = D.barrios[bid]
            const z = zona(bid)
            const n = niveles(bid)
            const pct = z.terminado ? 100 : (100 * z.nivel) / Math.max(1, n)
            const estado = z.terminado ? `✓ marca ${z.marca}%` : z.nivel ? `nivel ${z.nivel + 1} de ${n}` : `${plural(b.estudio.length, 'calle', 'calles')}`
            return `<button type="button" class="barrio-fila" data-barrio="${bid}"><span>${esc(b.nombre)}</span><small>${estado}</small>${z.nivel || z.terminado ? `<div class="progreso-mini"><span style="width:${pct}%"></span></div>` : ''}</button>`
          })
          .join('')}
      </details>`
      })
      .join('')}`
}

export function alActivar(activo, opciones = {}) {
  if (activo) {
    activarEncima(false)
    if (opciones.barrio != null) empezar(opciones.barrio)
    else if (!sesion) pintar()
  } else salir()
}

function salir() {
  if (sesion) {
    sesion = null
    if (app.juego?.tipo === 'aprender') app.juego = null
    cerrarTarjeta()
    modoJuego(false)
    limpiarMarcas()
    pintar()
  }
}

function empezar(barrio) {
  const b = D.barrios[barrio]
  if (!b.estudio.length) return aviso('Este barrio no tiene calles para estudiar')
  app.cerrarMenuMovil()
  const z = zona(barrio)
  if (z.terminado) z.nivel = niveles(barrio) // repaso final otra vez
  sesion = { barrio, z }
  app.juego = { tipo: 'aprender', alTocar: null }
  modoJuego(true)
  limpiarMarcas()
  marcarBarrio(barrio)
  encuadrar(b.bbox, { maxZoom: 16.5 })
  if (z.nivel >= niveles(barrio)) return repasoFinal()
  nivel()
}

function aprendidas() {
  const b = D.barrios[sesion.barrio]
  return b.estudio.slice(0, sesion.z.nivel * POR_NIVEL)
}

function cabecera() {
  const b = D.barrios[sesion.barrio]
  return { etiqueta: 'Aprender', meta: `${esc(b.nombre)} · nivel ${Math.min(sesion.z.nivel + 1, niveles(sesion.barrio))} de ${niveles(sesion.barrio)}`, cerrar: salir }
}

function nivel() {
  const b = D.barrios[sesion.barrio]
  const nuevas = b.estudio.slice(sesion.z.nivel * POR_NIVEL, (sesion.z.nivel + 1) * POR_NIVEL)
  sesion.nuevas = nuevas
  sesion.cuenta = Object.fromEntries(nuevas.map((i) => [i, 0]))
  verCalle(0)
}

// Fase 1: ver cada calle nueva
function verCalle(i) {
  const nuevas = sesion.nuevas
  if (i >= nuevas.length) return buscar()
  const c = D.calles[nuevas[i]]
  limpiarMarcas()
  marcarBarrio(sesion.barrio)
  marcar('correcta', aprendidas())
  marcar('objetivo', [c.id])
  encuadrarCalles([c.id, ...aprendidas().slice(-6)], { maxZoom: 16.6 })
  const ac = [...new Set(c.ac.filter((x) => D.calles[x].k !== c.k))]
  abrirTarjeta({
    ...cabecera(),
    enunciado: `Esta es <em>${esc(c.n)}</em>`,
    cuerpo: `<p class="nota">Calle nueva ${i + 1} de ${nuevas.length}.${ac.length ? ` Empieza o acaba en ${ac.slice(0, 4).map((x) => '<b>' + esc(D.calles[x].n) + '</b>').join(', ')}.` : ''} En verde, las que ya has aprendido.</p>`,
    acciones: `${i > 0 ? '<button type="button" class="secundario pequeno" data-a="ant">Anterior</button>' : ''}<button type="button" class="principal pequeno" data-a="sig">${i + 1 < nuevas.length ? 'Siguiente' : 'Ahora búscalas tú'}</button>`,
  })
  if (ac.length) marcar('pista', ac.slice(0, 4))
  $('#pregunta .acciones').onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a
    if (a === 'sig') verCalle(i + 1)
    if (a === 'ant') verCalle(i - 1)
  }
  $('#pregunta [data-a=sig]').focus({ preventScroll: true })
}

// Fase 2: buscarlas en el plano (cada nueva necesita ACIERTOS aciertos; entran repasos)
function buscar() {
  const previas = barajar(aprendidas()).slice(0, 3)
  sesion.repasos = new Set(previas)
  sesion.cola = barajar([...sesion.nuevas, ...previas])
  sesion.fallosNivel = 0
  siguienteBusqueda()
}

function siguienteBusqueda() {
  const pendientes = sesion.nuevas.filter((i) => sesion.cuenta[i] < ACIERTOS)
  if (!pendientes.length && !sesion.cola.some((i) => sesion.repasos.has(i))) return finNivel()
  if (!sesion.cola.length) sesion.cola = barajar(pendientes)
  let id = sesion.cola.shift()
  if (!sesion.repasos.has(id) && sesion.cuenta[id] >= ACIERTOS) return siguienteBusqueda()
  if (id === sesion.ultima && sesion.cola.length) {
    sesion.cola.push(id)
    id = sesion.cola.shift()
  }
  sesion.ultima = id
  preguntar(id)
}

function progresoNivel() {
  const total = sesion.nuevas.length * ACIERTOS
  const hechos = sesion.nuevas.reduce((s, i) => s + Math.min(ACIERTOS, sesion.cuenta[i]), 0)
  return `<div class="progreso-mini" style="margin-top:10px"><span style="width:${(100 * hechos) / total}%"></span></div>`
}

function preguntar(id, final = null) {
  const c = D.calles[id]
  limpiarMarcas()
  marcarBarrio(sesion.barrio)
  encuadrar(D.barrios[sesion.barrio].bbox, { maxZoom: 16.5 })
  const esRepaso = sesion.repasos?.has(id)
  const paso = (sesion.paso = (sesion.paso || 0) + 1)
  abrirTarjeta({
    ...cabecera(),
    enunciado: `¿Dónde está <em>${esc(c.n)}</em>?`,
    cuerpo: `<p class="nota">${final ? `Repaso de todo el barrio · ${final.i + 1} de ${final.total}` : esRepaso ? 'Repaso de un nivel anterior.' : `Aciertos: ${'●'.repeat(sesion.cuenta[id])}${'○'.repeat(ACIERTOS - sesion.cuenta[id])}`} Toca la calle en el plano.</p>${final ? '' : progresoNivel()}`,
    acciones: `<button type="button" class="secundario pequeno" data-a="no">No me acuerdo</button>`,
  })
  let respondida = false
  const responder = (ok, tocada) => {
    respondida = true
    registrar(id, ok)
    if (final) {
      if (ok) final.aciertos++
    } else if (sesion.repasos.has(id)) {
      sesion.repasos.delete(id)
      if (!ok) sesion.cola.push(id)
      if (!ok) sesion.repasos.add(id)
    } else if (ok) sesion.cuenta[id]++
    else {
      sesion.cuenta[id] = Math.max(0, sesion.cuenta[id] - 1)
      sesion.cola.splice(Math.min(2, sesion.cola.length), 0, id)
    }
    marcar('correcta', [id])
    if (tocada != null && !ok) marcar('error', [tocada])
    resultado(ok ? `✓ ¡Bien! <span>${esc(c.n)}</span>` : `✗ <span>${tocada != null ? `Esa es ${esc(D.calles[tocada].n)}. ` : ''}${esc(c.n)} está en verde.</span>`, ok ? 'bien' : 'mal')
    acciones(`<button type="button" class="principal pequeno" data-a="sig">Continuar</button>`)
    $('#pregunta .acciones').onclick = () => (final ? final.siguiente() : siguienteBusqueda())
    $('#pregunta [data-a=sig]').focus({ preventScroll: true })
    if (ok) setTimeout(() => sesion?.paso === paso && (final ? final.siguiente() : siguienteBusqueda()), 1100)
  }
  app.juego.alTocar = (e) => {
    if (respondida) return
    const t = calleEn(e.point, 12)
    if (t == null) return aviso('Toca justo encima de una calle')
    responder(t === id || D.calles[t].k === c.k, t)
  }
  $('#pregunta .acciones').onclick = (e) => {
    if (e.target.closest('[data-a=no]') && !respondida) responder(false, null)
  }
}

function finNivel() {
  sesion.z.nivel++
  guardar()
  const n = niveles(sesion.barrio)
  limpiarMarcas()
  marcarBarrio(sesion.barrio)
  marcar('correcta', aprendidas())
  const ultimo = sesion.z.nivel >= n
  abrirTarjeta({
    ...cabecera(),
    enunciado: ultimo ? '¡Has visto todas las calles del barrio!' : `Nivel ${sesion.z.nivel} superado`,
    cuerpo: `<p class="nota">${ultimo ? 'Ahora, un repaso de todo el barrio para fijar tu marca.' : `Llevas ${plural(aprendidas().length, 'calle', 'calles')} de ${D.barrios[sesion.barrio].estudio.length}. En verde, todas las que ya conoces.`}</p>`,
    acciones: `<button type="button" class="principal pequeno" data-a="sig">${ultimo ? 'Empezar el repaso' : 'Siguiente nivel'}</button><button type="button" class="secundario pequeno" data-a="salir">Dejarlo aquí</button>`,
  })
  $('#pregunta .acciones').onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a
    if (a === 'sig') ultimo ? repasoFinal() : nivel()
    if (a === 'salir') salir()
  }
}

function repasoFinal() {
  const ids = barajar(D.barrios[sesion.barrio].estudio)
  const final = { i: 0, total: ids.length, aciertos: 0 }
  sesion.repasos = new Set()
  final.siguiente = () => {
    final.i++
    if (final.i >= ids.length) return terminar(final)
    preguntar(ids[final.i], final)
  }
  preguntar(ids[0], final)
}

function terminar(final) {
  const pct = Math.round((100 * final.aciertos) / final.total)
  const anterior = sesion.z.marca
  sesion.z.marca = Math.max(anterior ?? 0, pct)
  sesion.z.terminado = true
  guardar()
  limpiarMarcas()
  marcarBarrio(sesion.barrio)
  marcar('correcta', D.barrios[sesion.barrio].estudio)
  abrirTarjeta({
    ...cabecera(),
    enunciado: `${pct}% en el repaso de ${esc(D.barrios[sesion.barrio].nombre)}`,
    cuerpo: `<p class="nota">${anterior != null && pct > anterior ? `¡Nueva marca! Antes tenías un ${anterior}%.` : anterior != null ? `Tu marca sigue en ${sesion.z.marca}%.` : 'Es tu primera marca en este barrio.'} Las calles entran ahora en tus repasos diarios.</p>`,
    acciones: `<button type="button" class="principal pequeno" data-a="otra">Repetir el repaso</button><button type="button" class="secundario pequeno" data-a="salir">Elegir otra zona</button>`,
  })
  $('#pregunta .acciones').onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a
    if (a === 'otra') repasoFinal()
    if (a === 'salir') salir()
  }
}
