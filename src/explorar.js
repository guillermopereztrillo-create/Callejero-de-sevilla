// Pestaña Explorar: distritos, barrios, ficha de cada calle y lugar, y rutas desde los parques de bomberos

import { D, CATEGORIAS, estudiable, lugaresDeCalle, unirBbox } from './datos.js'
import { mapa, marcar, limpiarMarcas, marcarBarrio, encuadrar, encuadrarCalles, ponerMarcador, dibujarRuta, calleEn, activarEncima } from './mapa.js'
import { parques, calcularRuta } from './rutas.js'
import { app } from './app.js'
import { resumen } from './progreso.js'
import { $, esc, metros, plural, icono, numero } from './util.js'

const panel = () => $('#panel-explorar')
let historial = []

export function montarExplorar() {
  inicio()
  panel().addEventListener('click', alHacerClic)
  panel().addEventListener('mouseover', (e) => {
    const c = e.target.closest('[data-calle]')
    if (c && app.pestana === 'explorar' && vista?.tipo === 'calle') marcar('pista', [+c.dataset.calle])
  })
  panel().addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-calle]') && vista?.tipo === 'calle') marcar('pista', [])
  })

  mapa.on('click', (e) => {
    if (app.juego || app.pestana !== 'explorar' || app.anotando) return
    const l = mapa.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['lugares'] })[0]
    if (l) return mostrarLugar(l.properties.id)
    const id = calleEn(e.point, 8)
    if (id != null) mostrarCalle(id, { encuadrar: false })
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
  if (v.tipo === 'calle') return mostrarCalle(v.id, { añadir: false })
  if (v.tipo === 'lugar') return mostrarLugar(v.id, false)
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
  if (t.dataset.accion === 'ruta') return rutaDesdeParque(+t.dataset.id, +t.dataset.parque)
  if (t.dataset.accion === 'aprender') return app.cambiarPestana('aprender', { barrio: +t.dataset.id })
  if (t.dataset.accion === 'practicar-barrio') return app.cambiarPestana('practicar', { zona: { tipo: 'barrio', id: +t.dataset.id } })
  if (t.dataset.accion === 'practicar-distrito') return app.cambiarPestana('practicar', { zona: { tipo: 'distrito', id: +t.dataset.id } })
}

function inicio() {
  vista = { tipo: 'inicio' }
  const r = resumen()
  panel().innerHTML = `
    <div class="llamada">
      <h3>${r.vistas ? 'Tu estudio' : 'Explora y aprende'}</h3>
      ${
        r.vistas
          ? `<p>Has practicado <b>${plural(r.vistas, 'calle', 'calles')}</b> con un <b>${r.porcentaje}%</b> de aciertos. ${r.repasos ? `Hoy te tocan <b>${plural(r.repasos, 'repaso', 'repasos')}</b>.` : 'Hoy no tienes repasos pendientes.'} ${r.racha > 1 ? `Llevas <b>${r.racha} días</b> seguidos.` : ''}</p>
             <button type="button" class="principal" data-ir="practicar">Seguir practicando</button>`
          : `<p>Toca cualquier calle del plano para ver su ficha, o busca una arriba. Todo funciona sin registrarte:</p>
             <ul><li>Tu racha, tus repasos y tu plan diario hasta el examen</li><li>Anotaciones y medidas sobre el plano</li><li>Tus propias preguntas y retos con amigos</li></ul>
             <p>Se guarda en este navegador; desde <b>Mi cuenta</b> puedes exportarlo.</p>
             <button type="button" class="principal" data-ir="aprender">Empezar a estudiar</button>
             <button type="button" class="secundario" data-ir="practicar">Practicar directamente</button>`
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

const listaCalles = (ids) =>
  ids.length
    ? `<div class="chips">${ids
        .slice(0, 40)
        .map((i) => `<button type="button" class="chip" data-calle="${i}">${esc(D.calles[i].n)}</button>`)
        .join('')}</div>`
    : '<p class="nota">—</p>'

export function mostrarCalle(id, { añadir = true, encuadrar: enc = true } = {}) {
  if (app.pestana !== 'explorar') app.cambiarPestana('explorar')
  if (añadir && vista && !(vista.tipo === 'calle' && vista.id === id)) historial.push(vista)
  vista = { tipo: 'calle', id }
  const c = D.calles[id]
  const d = D.distritos[c.d]
  limpiarMarcas()
  marcar('objetivo', [id])
  if (enc) encuadrarCalles([id])
  const lugares = lugaresDeCalle(id)
  const otrasZonas = c.b.slice(1)
  const pe = ['Sin tramos peatonales', 'Tiene tramos peatonales', 'Peatonal en su totalidad'][c.pe]
  const se = ['Doble sentido', 'Tramos de sentido único', 'Sentido único'][c.se]
  const [lon, lat] = [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2]
  panel().innerHTML = `
    ${miga([`<button type="button" data-distrito="${d.id}">${esc(d.nombre)}</button>`, `<button type="button" data-barrio="${c.b[0]}">${esc(D.barrios[c.b[0]].nombre)}</button>`])}
    <article class="ficha">
      <div class="ficha-cabecera"><div>
        <div class="tipo">${esc(c.t)}${c.p ? ' · vía principal' : ''}</div>
        <h2>${esc(c.n)}</h2>
      </div>
      <button type="button" class="redondo cerrar" data-accion="atras" aria-label="Volver" title="Volver">${icono.cerrar(12)}</button></div>
      ${c.so ? `<p class="nota">También conocida como «${esc(c.so)}».</p>` : ''}
      <dl class="ficha-datos">
        <dt>Barrio</dt><dd>${esc(D.barrios[c.b[0]].nombre)}${otrasZonas.length ? `<br><small class="nota">y ${otrasZonas.map((b) => esc(D.barrios[b].nombre)).join(', ')}</small>` : ''}</dd>
        <dt>Distrito</dt><dd><span class="punto-color" style="display:inline-block;background:${d.color};margin-right:6px"></span>${esc(d.nombre)}</dd>
        <dt>Longitud</dt><dd>${metros(c.l)}</dd>
        <dt>Peatonal</dt><dd>${pe}</dd>
        <dt>Circulación</dt><dd>${se}</dd>
        <dt>Código de vía</dt><dd>${esc(c.ine)} <small class="nota">(INE · CDAU)</small></dd>
      </dl>
      <div class="ficha-seccion"><h4>Calles en las que acaba</h4>${listaCalles(c.ac)}</div>
      <div class="ficha-seccion"><h4>Se cruza o comunica con</h4>${listaCalles(c.cr.filter((x) => !c.ac.includes(x)))}</div>
      ${c.pa.length ? `<div class="ficha-seccion"><h4>Paralelas cercanas</h4>${listaCalles(c.pa)}</div>` : ''}
      ${c.pp.length ? `<div class="ficha-seccion"><h4>Perpendiculares</h4>${listaCalles(c.pp)}</div>` : ''}
      ${
        lugares.length
          ? `<div class="ficha-seccion"><h4>Lugares de interés</h4><div class="chips">${lugares
              .map((l) => `<button type="button" class="chip" data-lugar="${l.id}">${esc(l.nombre)}</button>`)
              .join('')}</div></div>`
          : ''
      }
      <div class="ficha-seccion"><h4>Ruta desde un parque de bomberos</h4>
        <div class="chips">${parques()
          .map((p) => `<button type="button" class="chip" data-accion="ruta" data-id="${id}" data-parque="${p.id}">Parque nº ${p.parque}</button>`)
          .join('')}</div>
        <div class="ruta-resultado"></div>
      </div>
      <div class="ficha-acciones">
        <a class="secundario pequeno" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}" target="_blank" rel="noopener">${icono.ojo(16)} Vista de la calle</a>
        <button type="button" class="secundario pequeno" data-accion="practicar-barrio" data-id="${c.b[0]}">Practicar su barrio</button>
      </div>
    </article>`
}

export function mostrarLugar(id, añadir = true) {
  if (app.pestana !== 'explorar') app.cambiarPestana('explorar')
  if (añadir && vista) historial.push(vista)
  vista = { tipo: 'lugar', id }
  const l = D.lugares[id]
  const c = D.calles[l.calle]
  const cat = CATEGORIAS[l.cat]
  limpiarMarcas()
  marcar('pista', [l.calle])
  ponerMarcador(l.lngLat, l.cat === 'bomberos' ? 'marcador-parque' : 'marcador-lugar', l.cat === 'bomberos' ? l.parque ?? 'B' : '', 'center')
  mapa.flyTo({ center: l.lngLat, zoom: Math.max(mapa.getZoom(), 16.3), duration: 900 })
  panel().innerHTML = `
    ${miga([`<span>${esc(cat?.nombre ?? 'Lugar')}</span>`])}
    <article class="ficha">
      <div class="ficha-cabecera"><div>
        <div class="tipo" style="color:${cat?.color}">${esc(l.tipo || cat?.nombre || '')}</div>
        <h2>${esc(l.nombre)}</h2></div>
        <button type="button" class="redondo cerrar" data-accion="atras" aria-label="Volver">${icono.cerrar(12)}</button>
      </div>
      <dl class="ficha-datos">
        ${l.direccion ? `<dt>Dirección</dt><dd>${esc(l.direccion)}</dd>` : ''}
        <dt>Calle más cercana</dt><dd><button type="button" class="enlace" data-calle="${c.id}">${esc(c.n)}</button></dd>
        <dt>Barrio</dt><dd>${esc(D.barrios[c.b[0]].nombre)}</dd>
        <dt>Distrito</dt><dd>${esc(D.distritos[c.d].nombre)}</dd>
      </dl>
      <p class="nota">Fuente: Ayuntamiento de Sevilla, datos abiertos (ide.SEVILLA).</p>
    </article>`
}

async function rutaDesdeParque(calle, lugarParque) {
  const p = D.lugares[lugarParque]
  const caja = panel().querySelector('.ruta-resultado')
  panel()
    .querySelectorAll('[data-accion="ruta"]')
    .forEach((b) => b.classList.toggle('activo', +b.dataset.parque === lugarParque))
  caja.innerHTML = '<p class="nota">Calculando la ruta…</p>'
  const r = await calcularRuta(p.lngLat, calle)
  if (!r) {
    caja.innerHTML = '<p class="nota">No se encontró un recorrido por la red de calles.</p>'
    return
  }
  dibujarRuta([r.coords])
  ponerMarcador(p.lngLat, 'marcador-parque', p.parque, 'center')
  encuadrar(unirBbox([D.calles[calle].bb, ...r.coords.map((c) => [...c, ...c])]), { maxZoom: 16 })
  caja.innerHTML = `
    <p class="nota">${metros(r.metros)} respetando el sentido de circulación (OpenStreetMap). Salida desde ${esc(p.nombre)}:</p>
    <ol style="margin:6px 0 0;padding-left:20px;font-size:13.5px">${r.calles.map((i) => `<li><button type="button" class="enlace" data-calle="${i}">${esc(D.calles[i].n)}</button></li>`).join('')}</ol>`
}

export function explorarBusqueda(r) {
  app.cambiarPestana('explorar')
  if (r.tipo === 'calle') mostrarCalle(r.id)
  else if (r.tipo === 'barrio') mostrarBarrio(r.id)
  else if (r.tipo === 'distrito') mostrarDistrito(r.id)
  else if (r.tipo === 'lugar') mostrarLugar(r.id)
  else if (r.tipo === 'cruce') {
    mostrarCalle(r.ids[0])
    marcar('pista', [r.ids[1]])
    encuadrarCalles(r.ids, { maxZoom: 17 })
  }
}

export { estudiable }
