// Pestaña Explorar: distritos, barrios, ficha de cada calle y lugar, y rutas desde los parques de bomberos

import { D } from './datos.js'
import { mapa, limpiarMarcas, marcarBarrio, encuadrar, encuadrarCalles, marcar, calleEn, activarEncima } from './mapa.js'
import { parques } from './rutas.js'
import { mostrarCalle as fichaCalle, mostrarLugar as fichaLugar, mostrarCarretera, mostrarDestacado, cerrarFicha } from './ficha.js'
import { sesion, abrirAcceso } from './cuentas.js'
import { app } from './app.js'
import { resumen } from './progreso.js'
import { $, esc, metros, plural, numero } from './util.js'

const panel = () => $('#panel-explorar')
let historial = []

export function montarExplorar() {
  inicio()
  panel().addEventListener('click', alHacerClic)
  panel().addEventListener('mouseover', (e) => {
    const c = e.target.closest('[data-calle]')
    if (c && app.pestana === 'explorar') marcar('pista', [+c.dataset.calle])
  })
  panel().addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-calle]')) marcar('pista', [])
  })

  mapa.on('click', (e) => {
    if (app.juego || app.pestana !== 'explorar' || app.anotando) return
    const caja = [
      [e.point.x - 7, e.point.y - 7],
      [e.point.x + 7, e.point.y + 7],
    ]
    const l = mapa.queryRenderedFeatures(caja, { layers: ['lugares'] })[0]
    if (l) return fichaLugar(l.properties.id)
    const dst = mapa.getLayoutProperty('destacados', 'visibility') === 'visible' && mapa.queryRenderedFeatures(caja, { layers: ['destacados'] })[0]
    if (dst) return mostrarDestacado(dst.properties, dst.geometry.coordinates)
    const id = calleEn(e.point, 8)
    if (id != null) return fichaCalle(id, { lngLat: [e.lngLat.lng, e.lngLat.lat], enfocar: false })
    const v = mapa.getLayer('carreteras-acceso') && mapa.queryRenderedFeatures(caja, { layers: ['carreteras-acceso'] })[0]
    if (v) return mostrarCarretera(D.carreteras.findIndex((c) => c.ref === v.properties.ref), [e.lngLat.lng, e.lngLat.lat])
    cerrarFicha()
  })
}

export function alActivar(activa) {
  activarEncima(activa && !app.juego)
}

let vista = null

function ir(v, añadir = true) {
  if (añadir && vista) historial.push(vista)
  vista = v
  const p = panel()
  p.scrollTop = 0
  if (v.tipo === 'inicio') return inicio()
  if (v.tipo === 'distrito') return mostrarDistrito(v.id, false)
  if (v.tipo === 'barrio') return mostrarBarrio(v.id, false)
}

function atras() {
  const v = historial.pop()
  ir(v || { tipo: 'inicio' }, false)
}

function alHacerClic(e) {
  const t = e.target.closest('button, a')
  if (!t) return
  if (t.dataset.distrito != null) return mostrarDistrito(+t.dataset.distrito)
  if (t.dataset.barrio != null) return mostrarBarrio(+t.dataset.barrio)
  if (t.dataset.calle != null) return mostrarCalle(+t.dataset.calle)
  if (t.dataset.lugar != null) return mostrarLugar(+t.dataset.lugar)
  if (t.dataset.accion === 'atras') return atras()
  if (t.dataset.accion === 'inicio') {
    historial = []
    limpiarMarcas()
    return ir({ tipo: 'inicio' }, false)
  }
  if (t.dataset.accion === 'crear') return abrirAcceso('crear')
  if (t.dataset.accion === 'aprender') return app.cambiarPestana('aprender', { barrio: +t.dataset.id })
  if (t.dataset.accion === 'practicar-barrio') return app.cambiarPestana('practicar', { zona: { tipo: 'barrio', id: +t.dataset.id } })
  if (t.dataset.accion === 'practicar-distrito') return app.cambiarPestana('practicar', { zona: { tipo: 'distrito', id: +t.dataset.id } })
}

function inicio() {
  vista = { tipo: 'inicio' }
  const r = resumen()
  panel().innerHTML = `
    <div class="llamada">
      <h3>${r.vistas ? 'Tu estudio' : sesion() ? 'Explora y aprende' : 'Explora y, si te gusta, guárdalo'}</h3>
      ${
        r.vistas
          ? `<p>Has practicado <b>${plural(r.vistas, 'calle', 'calles')}</b> con un <b>${r.porcentaje}%</b> de aciertos. ${r.repasos ? `Hoy te tocan <b>${plural(r.repasos, 'repaso', 'repasos')}</b>.` : 'Hoy no tienes repasos pendientes.'} ${r.racha > 1 ? `Llevas <b>${r.racha} días</b> seguidos.` : ''}</p>
             <button type="button" class="principal" data-ir="practicar">Seguir practicando</button>`
          : sesion()
            ? `<p>Hola, <b>${esc(sesion().nombre)}</b>. Toca cualquier calle del plano para ver su ficha, o empieza por un barrio.</p>
             <button type="button" class="principal" data-ir="aprender">Empezar a estudiar</button>`
            : `<p>Estás sin cuenta: puedes mirar el plano, practicar y hacer tests, pero <b>no se guarda tu progreso</b> en una cuenta. Con una cuenta gratis tendrás:</p>
             <ul><li>Tu racha, tus repasos y tu plan diario hasta el examen</li><li>Anotaciones y medidas sobre el plano</li><li>Tus propias preguntas y retos con amigos</li></ul>
             <button type="button" class="principal" data-accion="crear">Crear cuenta gratis</button>
             <button type="button" class="secundario" data-ir="aprender">Empezar a estudiar sin cuenta</button>`
      }
    </div>
    <section class="bloque">
      <h2>Explorar por distritos</h2>
      <ul class="lista-zonas">
        ${D.distritos
          .map(
            (d) => `<li><button type="button" data-distrito="${d.id}"><span class="punto-color" style="background:${d.color}"></span>${esc(d.nombre)}<span class="cuenta">${plural(d.calles, 'calle', 'calles')}</span></button></li>`,
          )
          .join('')}
      </ul>
    </section>
    <section class="bloque">
      <h2>Parques de bomberos</h2>
      <ul class="lista-zonas">
        ${parques()
          .map((p) => `<li><button type="button" data-lugar="${p.id}"><span class="punto-color" style="background:#C0392B"></span>Parque nº ${p.parque}<span class="cuenta">${esc(p.calleNombre ?? '')}</span></button></li>`)
          .join('')}
      </ul>
    </section>`
  panel().querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => app.cambiarPestana(b.dataset.ir)))
}

function miga(partes) {
  return `<div class="miga"><button type="button" data-accion="inicio">Sevilla</button>${partes.map((p) => `<span>›</span>${p}`).join('')}</div>`
}

export function mostrarDistrito(id, añadir = true) {
  if (añadir) historial.push(vista)
  vista = { tipo: 'distrito', id }
  const d = D.distritos[id]
  limpiarMarcas()
  marcarBarrio(d.barrios)
  encuadrar(d.bbox, { maxZoom: 15 })
  panel().innerHTML = `
    ${miga([`<span>${esc(d.nombre)}</span>`])}
    <div class="ficha">
      <div class="tipo" style="color:${d.color}">Distrito</div>
      <h2>${esc(d.nombre)}</h2>
      <dl class="ficha-datos">
        <dt>Barrios</dt><dd>${d.barrios.length}</dd>
        <dt>Calles</dt><dd>${numero(d.calles)}</dd>
        ${d.superficie ? `<dt>Superficie</dt><dd>${esc(d.superficie)}</dd>` : ''}
        ${d.poblacion ? `<dt>Población</dt><dd>${numero(d.poblacion)} hab. (2016)</dd>` : ''}
        ${d.sede ? `<dt>Junta municipal</dt><dd>${esc(d.sede)}</dd>` : ''}
      </dl>
      <div class="ficha-acciones"><button type="button" class="secundario pequeno" data-accion="practicar-distrito" data-id="${id}">Practicar este distrito</button></div>
    </div>
    <section class="bloque"><h2>Barrios</h2>
      <ul class="lista-zonas">${d.barrios
        .map((b) => D.barrios[b])
        .map((b) => `<li><button type="button" data-barrio="${b.id}">${esc(b.nombre)}<span class="cuenta">${plural(b.calles, 'calle', 'calles')}</span></button></li>`)
        .join('')}</ul>
    </section>`
}

export function mostrarBarrio(id, añadir = true) {
  if (añadir) historial.push(vista)
  vista = { tipo: 'barrio', id }
  const b = D.barrios[id]
  const d = D.distritos[b.distrito]
  limpiarMarcas()
  marcarBarrio(id)
  encuadrar(b.bbox, { maxZoom: 16.5 })
  const calles = D.calles.filter((c) => c.b.includes(id)).sort((x, y) => x.c.localeCompare(y.c, 'es'))
  panel().innerHTML = `
    ${miga([`<button type="button" data-distrito="${d.id}">${esc(d.nombre)}</button>`, `<span>${esc(b.nombre)}</span>`])}
    <div class="ficha">
      <div class="tipo" style="color:${d.color}">Barrio · ${esc(d.nombre)}</div>
      <h2>${esc(b.nombre)}</h2>
      <p class="nota">${plural(calles.length, 'vía', 'vías')} con algún tramo en el barrio.</p>
      <div class="ficha-acciones">
        <button type="button" class="principal pequeno" data-accion="aprender" data-id="${id}">Aprender este barrio</button>
        <button type="button" class="secundario pequeno" data-accion="practicar-barrio" data-id="${id}">Practicar</button>
      </div>
    </div>
    <section class="bloque"><h2>Calles</h2>
      <input type="search" class="filtro-calles" placeholder="Filtrar…" aria-label="Filtrar calles" style="width:100%;border:1px solid var(--borde);border-radius:10px;padding:7px 10px;background:var(--superficie);margin-bottom:6px" />
      <ul class="lista-zonas lista-calles">${calles
        .map((c) => `<li data-k="${esc(c.k)}"><button type="button" data-calle="${c.id}">${esc(c.n)}<span class="cuenta">${metros(c.l)}</span></button></li>`)
        .join('')}</ul>
    </section>`
  const filtro = panel().querySelector('.filtro-calles')
  filtro.oninput = () => {
    const q = filtro.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    panel()
      .querySelectorAll('.lista-calles li')
      .forEach((li) => (li.hidden = q && !li.dataset.k.includes(q)))
  }
}

/** Las fichas de calles y lugares se abren sobre el plano (ficha.js). */
export function mostrarCalle(id, opciones = {}) {
  if (app.pestana !== 'explorar') app.cambiarPestana('explorar')
  app.cerrarMenuMovil()
  return fichaCalle(id, opciones)
}

export function mostrarLugar(id) {
  if (app.pestana !== 'explorar') app.cambiarPestana('explorar')
  app.cerrarMenuMovil()
  return fichaLugar(id)
}

export function explorarBusqueda(r) {
  app.cambiarPestana('explorar')
  if (r.tipo === 'calle') mostrarCalle(r.id)
  else if (r.tipo === 'barrio') mostrarBarrio(r.id)
  else if (r.tipo === 'distrito') mostrarDistrito(r.id)
  else if (r.tipo === 'lugar') mostrarLugar(r.id)
  else if (r.tipo === 'carretera') mostrarCarretera(r.id)
  else if (r.tipo === 'cruce') {
    mostrarCalle(r.ids[0], { enfocar: false }).then(() => {
      marcar('pista', [r.ids[1]])
      encuadrarCalles(r.ids, { maxZoom: 17 })
    })
  }
}
