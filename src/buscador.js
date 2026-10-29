// Buscador de calles, barrios, distritos, lugares y cruces

import { D, normalizar, normalizarRespuesta } from './datos.js'
import { $, esc, debounce, icono } from './util.js'

let alElegir = () => {}
let resultados = []
let sel = -1

export function montarBuscador(cb) {
  alElegir = cb
  const input = $('#buscador-texto')
  const lista = $('#buscador-lista')
  const borrar = $('#buscador-borrar')

  const buscarYMostrar = debounce(() => {
    resultados = buscar(input.value)
    sel = resultados.length ? 0 : -1
    pintar()
  }, 80)

  input.addEventListener('input', () => {
    borrar.hidden = !input.value
    buscarYMostrar()
  })
  input.addEventListener('focus', () => input.value && buscarYMostrar())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!resultados.length) return
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length
      pintar()
    } else if (e.key === 'Enter') {
      if (sel >= 0) elegir(resultados[sel])
    } else if (e.key === 'Escape') {
      cerrar()
      input.blur()
    }
  })
  borrar.onclick = () => {
    input.value = ''
    borrar.hidden = true
    cerrar()
    input.focus()
  }
  lista.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li')
    if (li) {
      e.preventDefault()
      elegir(resultados[+li.dataset.i])
    }
  })
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#buscador')) cerrar()
  })
}

function cerrar() {
  $('#buscador-lista').hidden = true
  $('#buscador-texto').setAttribute('aria-expanded', 'false')
}

function elegir(r) {
  cerrar()
  $('#buscador-texto').value = r.titulo
  $('#buscador-borrar').hidden = false
  alElegir(r)
}

function resaltar(texto, q) {
  if (!q) return esc(texto)
  const plano = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const i = plano.indexOf(q.split(' ')[0])
  if (i < 0) return esc(texto)
  const l = q.split(' ')[0].length
  return esc(texto.slice(0, i)) + '<mark>' + esc(texto.slice(i, i + l)) + '</mark>' + esc(texto.slice(i + l))
}

function pintar() {
  const lista = $('#buscador-lista')
  const q = $('#buscador-texto').value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (!resultados.length) {
    lista.innerHTML = q ? '<li aria-disabled="true"><span class="res-texto"><small>Sin resultados. Prueba sin el tipo de vía o con otra palabra.</small></span></li>' : ''
    lista.hidden = !q
    return
  }
  const ico = { calle: icono.calle(16), barrio: icono.barrio(16), distrito: icono.mapa(16), lugar: icono.pin(16), cruce: icono.cruce(16), carretera: icono.ruta(16) }
  lista.innerHTML = resultados
    .map(
      (r, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">
        <span class="icono-res">${ico[r.tipo]}</span>
        <span class="res-texto"><span>${resaltar(r.titulo, q)}</span><small>${esc(r.detalle)}</small></span></li>`,
    )
    .join('')
  lista.hidden = false
  $('#buscador-texto').setAttribute('aria-expanded', 'true')
  lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function puntuar(k, q) {
  if (k === q) return 100
  if (k.startsWith(q)) return 80 - k.length / 20
  if (k.includes(' ' + q)) return 60 - k.length / 20
  if (k.includes(q)) return 40 - k.length / 20
  const ps = q.split(' ')
  if (ps.length > 1 && ps.every((p) => k.includes(p))) return 30 - k.length / 20
  return 0
}

export function buscar(texto) {
  const t = texto.trim()
  if (t.length < 2) return []
  // cruce: «Sierpes y Campana», «Feria con Relator», «Sierpes esquina Rioja»
  const m = t.match(/^(.+?)\s+(?:y|con|esquina(?: con| a)?|&|\/)\s+(.+)$/i)
  if (m) {
    const a = buscarCalles(m[1], 6)
    const b = buscarCalles(m[2], 12)
    const cruces = []
    for (const x of a) for (const y of b) if (D.calles[x].cr.includes(y)) cruces.push([x, y])
    if (cruces.length)
      return cruces.slice(0, 8).map(([x, y]) => ({
        tipo: 'cruce',
        ids: [x, y],
        titulo: `${D.calles[x].n} con ${D.calles[y].n}`,
        detalle: 'Cruce · ' + D.barrios[D.calles[x].b[0]].nombre,
      }))
  }
  const q = normalizar(t)
  const qr = normalizarRespuesta(t)
  const r = []
  for (const c of D.calles) {
    const s = Math.max(puntuar(c.k, qr), puntuar(normalizar(c.n), q) - 5) + (c.p ? 3 : 0)
    if (s > 0) r.push({ s, tipo: 'calle', id: c.id, titulo: c.n, detalle: `${D.barrios[c.b[0]].nombre} · ${D.distritos[c.d].nombre}` })
  }
  for (const b of D.barrios) {
    const s = puntuar(normalizar(b.nombre), q)
    if (s > 0) r.push({ s: s + 5, tipo: 'barrio', id: b.id, titulo: b.nombre, detalle: 'Barrio · ' + D.distritos[b.distrito].nombre })
  }
  for (const d of D.distritos) {
    const s = puntuar(normalizar(d.nombre), q)
    if (s > 0) r.push({ s: s + 8, tipo: 'distrito', id: d.id, titulo: d.nombre, detalle: `Distrito · ${d.barrios.length} barrios` })
  }
  D.carreteras.forEach((v, i) => {
    const s = Math.max(puntuar(normalizar(v.ref), q) + 10, puntuar(normalizar(v.nombre), q))
    if (s > 0) r.push({ s, tipo: 'carretera', id: i, titulo: `${v.ref} · ${v.nombre}`, detalle: `${v.tipo} · ${v.titular}` })
  })
  for (const l of D.lugares) {
    const s = puntuar(normalizar(l.nombre), q)
    if (s > 0) r.push({ s: s - 2, tipo: 'lugar', id: l.id, titulo: l.nombre, detalle: `${l.tipo || l.cat} · ${D.calles[l.calle]?.n ?? ''}` })
  }
  return r.sort((a, b) => b.s - a.s).slice(0, 12)
}

export function buscarCalles(texto, max = 8) {
  const q = normalizarRespuesta(texto)
  if (!q) return []
  return D.calles
    .map((c) => ({ id: c.id, s: puntuar(c.k, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.id)
}
