// Ficha flotante sobre el plano: al tocar una calle, un lugar o una carretera aparece su información junto a ella

import maplibregl from 'maplibre-gl'
import { D, CATEGORIAS, geometriaCalle, unirBbox } from './datos.js'
import { mapa, marcar, limpiarMarcas, encuadrar, encuadrarCalles, ponerMarcador, dibujarRuta, distanciaM } from './mapa.js'
import { parques, calcularRuta } from './rutas.js'
import { verCalle } from './vista.js'
import { app } from './app.js'
import { esc, metros, icono } from './util.js'

let globo = null
let carreteraSel = null

export function cerrarFicha() {
  globo?.remove()
  globo = null
  if (carreteraSel != null) mapa.setFeatureState({ source: 'carreteras', id: carreteraSel }, { sel: false })
  carreteraSel = null
}

function abrir(lngLat, html, clase = '') {
  cerrarFicha()
  globo = new maplibregl.Popup({
    className: ('ficha-globo ' + clase).trim(),
    maxWidth: 'min(360px, calc(100vw - 24px))',
    closeOnClick: false,
    focusAfterOpen: false,
    offset: 14,
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(mapa)
  const el = globo.getElement()
  el.addEventListener('click', alHacerClic)
  globo.on('close', () => {
    if (globo?.getElement() === el) globo = null
  })
  return el
}

/** Punto de la calle más cercano a `cerca` (o el centro de su tramo más largo). */
async function puntoDeCalle(id, cerca) {
  const lineas = await geometriaCalle(id)
  let mejor = null
  let md = Infinity
  if (cerca) {
    for (const l of lineas)
      for (const c of l) {
        const d = distanciaM(c, cerca)
        if (d < md) {
          md = d
          mejor = c
        }
      }
    if (mejor) return mejor
  }
  const larga = lineas.reduce((a, b) => (b.length > a.length ? b : a), [])
  if (larga.length) return larga[Math.floor(larga.length / 2)]
  const c = D.calles[id]
  return [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2]
}

const chips = (ids) =>
  ids.length
    ? `<div class="chips">${ids
        .slice(0, 30)
        .map((i) => `<button type="button" class="chip" data-calle="${i}">${esc(D.calles[i].n)}</button>`)
        .join('')}</div>`
    : '<p class="nota">—</p>'

function cercanos(punto, max = 8, radio = 700) {
  return D.lugares
    .map((l) => [distanciaM(l.lngLat, punto), l])
    .filter(([d]) => d <= radio)
    .sort((a, b) => a[0] - b[0])
    .slice(0, max)
}

/** Ficha de una calle. `lngLat`: dónde se tocó; si no se da, se usa el centro de la calle. */
export async function mostrarCalle(id, { lngLat = null, enfocar = true } = {}) {
  const c = D.calles[id]
  if (!c) return
  const punto = await puntoDeCalle(id, lngLat)
  limpiarMarcas()
  marcar('objetivo', [id])
  if (enfocar) encuadrarCalles([id], { maxZoom: 17 })
  const d = D.distritos[c.d]
  const pe = ['Sin tramos peatonales', 'Con tramos peatonales', 'Peatonal en su totalidad'][c.pe]
  const se = ['Doble sentido', 'Con tramos de sentido único', 'Sentido único'][c.se]
  const lugares = cercanos(punto)
  const el = abrir(
    punto,
    `<div class="ficha">
      <div class="tipo">${esc(c.t)}${c.p ? ' · vía principal' : ''}</div>
      <h3>${esc(c.n)}</h3>
      ${c.so ? `<p class="nota">También «${esc(c.so)}»</p>` : ''}
      <dl class="ficha-datos">
        <dt>Barrio</dt><dd>${c.b.map((b) => esc(D.barrios[b].nombre)).join(', ')}</dd>
        <dt>Distrito</dt><dd><span class="punto-color" style="display:inline-block;background:${d.color};margin-right:6px"></span>${esc(d.nombre)}</dd>
        <dt>Longitud</dt><dd>${metros(c.l)}</dd>
        <dt>Peatonal</dt><dd>${pe}</dd>
        <dt>Circulación</dt><dd>${se}</dd>
      </dl>
      <div class="ficha-acciones">
        <button type="button" class="secundario pequeno" data-accion="vista" data-id="${id}">${icono.ojo(15)} Ver la calle</button>
        <button type="button" class="secundario pequeno" data-accion="ruta" data-id="${id}">${icono.ruta(15)} Ruta desde el parque más cercano</button>
      </div>
      <div class="ruta-resultado"></div>
      <details class="ficha-mas">
        <summary>Más información</summary>
        <div class="ficha-seccion"><h4>Empieza o acaba en</h4>${chips(c.ac)}</div>
        <div class="ficha-seccion"><h4>Se cruza con</h4>${chips(c.cr.filter((x) => !c.ac.includes(x)))}</div>
        ${c.pa.length ? `<div class="ficha-seccion"><h4>Paralelas cercanas</h4>${chips(c.pa)}</div>` : ''}
        ${c.pp.length ? `<div class="ficha-seccion"><h4>Perpendiculares</h4>${chips(c.pp)}</div>` : ''}
        ${
          lugares.length
            ? `<div class="ficha-seccion"><h4>Puntos de interés cercanos</h4><ul class="ficha-pdi">${lugares
                .map(
                  ([m, l]) =>
                    `<li><button type="button" data-lugar="${l.id}"><span class="pdi-punto" style="background:${CATEGORIAS[l.cat]?.color}">${esc(CATEGORIAS[l.cat]?.letra ?? '')}</span><span>${esc(l.nombre)}</span><b>${metros(m)}</b></button></li>`,
                )
                .join('')}</ul></div>`
            : ''
        }
        <p class="nota">Código de vía ${esc(c.ine)} (INE · CDAU)</p>
      </details>
    </div>`,
  )
  el.dataset.calle = id
  el.dataset.punto = JSON.stringify(punto)
  app.fichaAbierta?.(c)
}

const TIPO_DESTACADO = {
  place_of_worship: 'Iglesia o capilla',
  monastery: 'Convento o monasterio',
  attraction: 'Lugar destacado',
  museum: 'Museo',
  townhall: 'Edificio municipal',
  castle: 'Castillo o palacio',
  monument: 'Monumento',
  memorial: 'Monumento conmemorativo',
  archaeological_site: 'Yacimiento arqueológico',
  artwork: 'Obra de arte',
  stadium: 'Estadio',
  theatre: 'Teatro',
  marketplace: 'Mercado',
  park: 'Parque',
  garden: 'Jardín',
  zoo: 'Zoológico',
  theme_park: 'Parque temático',
}

/** Ficha de una iglesia, capilla o lugar destacado del mapa base (OpenStreetMap). */
export function mostrarDestacado(props, lngLat) {
  const nombre = props['name:es'] || props.name
  if (!nombre) return
  // la calle del callejero más cercana
  let calle = null
  let md = Infinity
  for (const c of D.calles) {
    const d = distanciaM([(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2], lngLat)
    if (d < md && c.l < 2500) {
      md = d
      calle = c
    }
  }
  limpiarMarcas()
  if (calle) marcar('pista', [calle.id])
  const el = abrir(
    lngLat,
    `<div class="ficha">
      <div class="tipo" style="color:${props.kind === 'place_of_worship' || props.kind === 'monastery' ? '#8E4A9E' : '#C2701E'}">${esc(TIPO_DESTACADO[props.kind] || 'Lugar destacado')}</div>
      <h3>${esc(nombre)}</h3>
      ${calle ? `<dl class="ficha-datos"><dt>Cerca de</dt><dd><button type="button" class="enlace" data-calle="${calle.id}">${esc(calle.n)}</button></dd><dt>Barrio</dt><dd>${esc(D.barrios[calle.b[0]].nombre)}</dd><dt>Distrito</dt><dd>${esc(D.distritos[calle.d].nombre)}</dd></dl>` : ''}
      ${calle ? `<div class="ficha-acciones"><button type="button" class="secundario pequeno" data-accion="vista-destacado">${icono.ojo(15)} Ver el lugar</button></div>` : ''}
      <p class="nota">Fuente: OpenStreetMap.</p>
    </div>`,
  )
  const v = el.querySelector('[data-accion=vista-destacado]')
  if (v) v.onclick = (e) => {
    e.stopPropagation()
    verCalle(calle.id, lngLat, nombre)
  }
}

export function mostrarLugar(id) {
  const l = D.lugares[id]
  if (!l) return
  const c = D.calles[l.calle]
  const cat = CATEGORIAS[l.cat]
  limpiarMarcas()
  marcar('pista', [l.calle])
  mapa.flyTo({ center: l.lngLat, zoom: Math.max(mapa.getZoom(), 16.3), duration: 800 })
  abrir(
    l.lngLat,
    `<div class="ficha">
      <div class="tipo" style="color:${cat?.color}">${esc(l.tipo || cat?.nombre || '')}</div>
      <h3>${esc(l.nombre)}</h3>
      <dl class="ficha-datos">
        ${l.direccion ? `<dt>Dirección</dt><dd>${esc(l.direccion)}</dd>` : ''}
        <dt>Calle</dt><dd><button type="button" class="enlace" data-calle="${c.id}">${esc(c.n)}</button></dd>
        <dt>Barrio</dt><dd>${esc(D.barrios[c.b[0]].nombre)}</dd>
        <dt>Distrito</dt><dd>${esc(D.distritos[c.d].nombre)}</dd>
      </dl>
      <div class="ficha-acciones">
        <button type="button" class="secundario pequeno" data-accion="vista-lugar" data-id="${id}">${icono.ojo(15)} Ver el lugar</button>
      </div>
      <p class="nota">Fuente: ${l.fuente === 'OpenStreetMap' ? 'OpenStreetMap' : 'Ayuntamiento de Sevilla (datos abiertos)'}.</p>
    </div>`,
  )
}

export function mostrarCarretera(k, lngLat = null) {
  const v = D.carreteras[k]
  if (!v) return
  limpiarMarcas()
  const centro = lngLat || [(v.bbox[0] + v.bbox[2]) / 2, (v.bbox[1] + v.bbox[3]) / 2]
  if (!lngLat) encuadrar(v.bbox, { maxZoom: 14 })
  abrir(
    centro,
    `<div class="ficha">
      <div class="tipo" style="color:${v.red === 'estado' ? '#D23B2A' : v.red === 'junta' ? '#2E8B57' : '#B07E10'}">${esc(v.tipo)} · ${esc(v.ref)}${v.europea ? ` · ${esc(v.europea)}` : ''}</div>
      <h3>${esc(v.nombre)}</h3>
      <dl class="ficha-datos">
        ${v.itinerario ? `<dt>Itinerario</dt><dd>${esc(v.itinerario)}</dd>` : ''}
        <dt>Titular</dt><dd>${esc(v.titular)}</dd>
        ${v.oficial?.length ? `<dt>En el callejero</dt><dd>${v.oficial.map(esc).join('<br>')}</dd>` : ''}
        <dt>En Sevilla</dt><dd>${v.km_sevilla ? `${String(v.km_sevilla).replace('.', ',')} km dentro de los distritos` : 'Llega hasta el límite de la ciudad'}</dd>
        ${v.entradas?.length ? `<dt>Entra por</dt><dd>${v.entradas.map(esc).join(', ')}</dd>` : ''}
      </dl>
      <p class="nota">Trazado de OpenStreetMap; nombres oficiales del CDAU.</p>
    </div>`,
  )
  carreteraSel = v.i
  mapa.setFeatureState({ source: 'carreteras', id: v.i }, { sel: true })
}

async function alHacerClic(e) {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.calle != null) return mostrarCalle(+b.dataset.calle)
  if (b.dataset.lugar != null) return mostrarLugar(+b.dataset.lugar)
  if (b.dataset.accion === 'vista') {
    const punto = JSON.parse(globo.getElement().dataset.punto || 'null')
    return verCalle(+b.dataset.id, punto)
  }
  if (b.dataset.accion === 'vista-lugar') {
    const l = D.lugares[+b.dataset.id]
    return verCalle(l.calle, l.lngLat, l.nombre)
  }
  if (b.dataset.accion === 'ruta') return ruta(+b.dataset.id, b.dataset.parque ? +b.dataset.parque : null)
}

async function ruta(id, parqueId) {
  const el = globo?.getElement()
  if (!el) return
  const caja = el.querySelector('.ruta-resultado')
  const c = D.calles[id]
  const centro = [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2]
  const ps = parques()
  const p = parqueId != null ? D.lugares[parqueId] : ps.map((x) => [distanciaM(x.lngLat, centro), x]).sort((a, b) => a[0] - b[0])[0][1]
  caja.innerHTML = '<p class="nota">Calculando la ruta…</p>'
  const r = await calcularRuta(p.lngLat, id)
  if (!r) {
    caja.innerHTML = '<p class="nota">No se encontró un recorrido por la red de calles.</p>'
    return
  }
  dibujarRuta([r.coords])
  ponerMarcador(p.lngLat, 'marcador-parque', p.parque, 'center')
  encuadrar(unirBbox([c.bb, ...r.coords.map((x) => [...x, ...x])]), { maxZoom: 16 })
  caja.innerHTML = `
    <p class="nota"><b>Parque nº ${p.parque}</b> · ${metros(r.metros)} respetando el sentido de circulación:</p>
    <ol class="ruta-pasos">${r.calles.map((i) => `<li>${esc(D.calles[i].n)}</li>`).join('')}</ol>
    <div class="chips">${ps
      .filter((x) => x.id !== p.id)
      .map((x) => `<button type="button" class="chip" data-accion="ruta" data-id="${id}" data-parque="${x.id}">Desde el parque nº ${x.parque}</button>`)
      .join('')}</div>`
}
