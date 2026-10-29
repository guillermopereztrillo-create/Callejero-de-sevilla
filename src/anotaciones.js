// Anotaciones sobre el plano: dibujar a mano, medir distancias, escribir y marcar

import { mapa, distanciaM } from './mapa.js'
import { app } from './app.js'
import { $, icono, guardado, metros, aviso } from './util.js'

const COLORES = ['#C0502B', '#2F7C9A', '#3B8A57', '#7A5BA0', '#2A211B']
let herramienta = null
let color = COLORES[0]
let features = guardado.leer('anotaciones', [])
let enCurso = null

function guardarYPintar() {
  guardado.escribir('anotaciones', features)
  pintar()
}

function pintar() {
  const fc = { type: 'FeatureCollection', features: enCurso ? [...features, enCurso] : features }
  mapa.getSource('anotaciones')?.setData(fc)
}

export function montarAnotaciones() {
  const barra = $('#anotar')
  barra.innerHTML = `
    <button type="button" data-h="dibujar">${icono.lapiz(18)} Dibujar</button>
    <button type="button" data-h="medir">${icono.regla(18)} Medir</button>
    <button type="button" data-h="texto">${icono.texto(18)} Escribir</button>
    <button type="button" data-h="marca">${icono.pin(18)} Marcar</button>
    <div class="colores">${COLORES.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-label="Color" class="${c === color ? 'activo' : ''}"></button>`).join('')}</div>
    <hr />
    <button type="button" data-h="deshacer">↶ Deshacer</button>
    <button type="button" data-h="borrar">${icono.papelera(18)} Borrar todo</button>`
  const boton = $('#boton-anotar')
  boton.onclick = () => {
    const abrir = barra.hidden
    barra.hidden = !abrir
    boton.setAttribute('aria-expanded', abrir)
    if (!abrir) elegir(null)
  }
  barra.onclick = (e) => {
    const c = e.target.closest('[data-color]')
    if (c) {
      color = c.dataset.color
      barra.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('activo', b === c))
      return
    }
    const h = e.target.closest('[data-h]')?.dataset.h
    if (!h) return
    if (h === 'deshacer') {
      features.pop()
      return guardarYPintar()
    }
    if (h === 'borrar') {
      if (features.length && confirm('¿Borrar todas las anotaciones?')) {
        features = []
        guardarYPintar()
      }
      return
    }
    elegir(herramienta === h ? null : h)
  }
  mapa.on('load', pintar)
  pintar()

  mapa.on('click', alClic)
  mapa.on('dblclick', (e) => {
    if (herramienta === 'medir' && enCurso) {
      e.preventDefault()
      terminarMedida()
    }
  })
  mapa.on('mousemove', (e) => {
    if (herramienta === 'medir' && enCurso) {
      const coords = [...enCurso.properties._fijos, [e.lngLat.lng, e.lngLat.lat]]
      enCurso.geometry.coordinates = coords
      pintar()
      aviso(`Distancia: ${metros(longitud(coords))} · doble clic para terminar`, 4000)
    }
  })
  // dibujo a mano alzada (ratón y dedo)
  const empezar = (e) => {
    if (herramienta !== 'dibujar') return
    e.preventDefault()
    mapa.dragPan.disable()
    enCurso = { type: 'Feature', properties: { tipo: 'trazo', color }, geometry: { type: 'LineString', coordinates: [[e.lngLat.lng, e.lngLat.lat]] } }
  }
  const mover = (e) => {
    if (herramienta !== 'dibujar' || !enCurso) return
    enCurso.geometry.coordinates.push([e.lngLat.lng, e.lngLat.lat])
    pintar()
  }
  const acabar = () => {
    if (herramienta !== 'dibujar' || !enCurso) return
    if (enCurso.geometry.coordinates.length > 1) features.push(enCurso)
    enCurso = null
    guardarYPintar()
  }
  mapa.on('mousedown', empezar)
  mapa.on('touchstart', (e) => e.points?.length === 1 && empezar(e))
  mapa.on('mousemove', mover)
  mapa.on('touchmove', mover)
  mapa.on('mouseup', acabar)
  mapa.on('touchend', acabar)
}

function elegir(h) {
  if (enCurso && herramienta === 'medir') terminarMedida()
  herramienta = h
  app.anotando = !!h
  $('#anotar')
    .querySelectorAll('[data-h]')
    .forEach((b) => b.classList.toggle('activo', b.dataset.h === h))
  mapa.getCanvas().style.cursor = h ? 'crosshair' : ''
  if (h === 'dibujar') mapa.dragPan.disable()
  else mapa.dragPan.enable()
  if (h === 'dibujar') aviso('Arrastra sobre el plano para dibujar')
  if (h === 'medir') aviso('Toca puntos del recorrido; doble clic para terminar')
  if (h) mapa.doubleClickZoom.disable()
  else mapa.doubleClickZoom.enable()
}

function longitud(coords) {
  let m = 0
  for (let i = 1; i < coords.length; i++) m += distanciaM(coords[i - 1], coords[i])
  return m
}

function terminarMedida() {
  const c = enCurso.properties._fijos
  enCurso = null
  if (c.length > 1) {
    features.push({ type: 'Feature', properties: { tipo: 'medida', color }, geometry: { type: 'LineString', coordinates: c } })
    features.push({ type: 'Feature', properties: { tipo: 'texto', color, texto: metros(longitud(c)) }, geometry: { type: 'Point', coordinates: c[c.length - 1] } })
    aviso(`Distancia medida: ${metros(longitud(c))}`)
  }
  guardarYPintar()
}

function alClic(e) {
  if (!herramienta) return
  const p = [e.lngLat.lng, e.lngLat.lat]
  if (herramienta === 'medir') {
    if (!enCurso) enCurso = { type: 'Feature', properties: { tipo: 'medida', color, _fijos: [p] }, geometry: { type: 'LineString', coordinates: [p] } }
    else enCurso.properties._fijos.push(p)
    pintar()
  } else if (herramienta === 'texto') {
    const t = prompt('Texto de la anotación:')
    if (t) {
      features.push({ type: 'Feature', properties: { tipo: 'texto', color, texto: t.slice(0, 60) }, geometry: { type: 'Point', coordinates: p } })
      guardarYPintar()
    }
  } else if (herramienta === 'marca') {
    const t = prompt('Nombre de la marca (opcional):') ?? ''
    features.push({ type: 'Feature', properties: { tipo: 'marca', color, texto: t.slice(0, 40) }, geometry: { type: 'Point', coordinates: p } })
    guardarYPintar()
  }
}
