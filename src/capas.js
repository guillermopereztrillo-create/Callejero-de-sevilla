// Ventana «Capas»

import { capas, aplicarCapas, encuadrar, marcarBarrio } from './mapa.js'
import { D, CATEGORIAS } from './datos.js'
import { $, esc, icono } from './util.js'

const ico = (d) =>
  `<svg class="ico-capa" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const FILAS = [
  ['mudo', 'Mapa mudo', 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6'],
  ['nombres', 'Nombres de calles', 'M5 6V4h14v2M12 4v16M9 20h6'],
  ['distritos', 'Distritos', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15', true],
  ['barrios', 'Barrios', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', true],
  ['peatonales', 'Calles peatonales', 'M13 4.5a1.5 1.5 0 1 0 0-.01M9 21l2.5-6.5L14 17v4M10.5 9.5l2-1.5 2.5 2 2.5 1M12.5 8l-1 6.5M10.5 9.5 8 12'],
  ['sentido', 'Sentido de circulación', 'M4 12h15M13 6l6 6-6 6'],
  ['satelite', 'Satélite (PNOA)', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3.5 3.2 3.5 14.8 0 18M12 3c-3.5 3.2-3.5 14.8 0 18'],
  ['relieve', 'Relieve 3D', 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM12 12l8-4.5M12 12v9M12 12 4 7.5'],
]

export function montarCapas() {
  const el = $('#capas')
  el.innerHTML = `
    <div class="ventana-cabecera"><h3>Capas</h3><button type="button" class="minimizar" id="capas-minimizar" aria-label="Minimizar capas" title="Minimizar">${icono.menos()}</button></div>
    <p class="capas-grupo">${ico('M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5').replace('width="18" height="18"', 'width="14" height="14"')}Mapa</p>
    ${FILAS.map(
      ([k, t, d, mas]) => `
      <div class="capa-fila">
        <label class="interruptor"><input type="checkbox" data-capa="${k}" ${capas[k] ? 'checked' : ''}/><i></i>${ico(d)}${t}</label>
        ${mas ? `<button type="button" class="capa-mas" data-leyenda="${k}" aria-expanded="false" title="Ver la lista">+</button>` : ''}
      </div>
      ${mas ? `<div class="capa-leyenda" id="leyenda-${k}" hidden></div>` : ''}`,
    ).join('')}
    <details class="capas-detalle">
      <summary class="capas-grupo">${ico('M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z').replace('width="18" height="18"', 'width="14" height="14"')}<span>Puntos de interés</span></summary>
      <label class="interruptor"><input type="checkbox" data-capa="poligonos" ${capas.poligonos ? 'checked' : ''}/><i></i>${ico('M3 21V9l6 4V9l6 4V5h6v16H3Z')}Polígonos industriales</label>
      ${Object.entries(CATEGORIAS)
        .map(
          ([k, c]) => `<label class="interruptor"><input type="checkbox" data-pdi="${k}" ${capas.pdi.includes(k) ? 'checked' : ''}/><i></i><span class="pdi-punto" style="background:${c.color}">${esc(c.letra)}</span>${c.nombre}</label>`,
        )
        .join('')}
    </details>`

  el.addEventListener('change', (e) => {
    const k = e.target.dataset.capa
    if (k) capas[k] = e.target.checked
    const p = e.target.dataset.pdi
    if (p) capas.pdi = e.target.checked ? [...new Set([...capas.pdi, p])] : capas.pdi.filter((x) => x !== p)
    aplicarCapas()
  })

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-leyenda]')
    if (b) {
      const k = b.dataset.leyenda
      const ley = $('#leyenda-' + k)
      const abrir = ley.hidden
      ley.hidden = !abrir
      b.textContent = abrir ? '−' : '+'
      b.setAttribute('aria-expanded', abrir)
      if (abrir && !ley.childElementCount) {
        ley.innerHTML = (k === 'distritos' ? D.distritos : D.distritos)
          .map((d) => `<button type="button" data-distrito="${d.id}"><span class="punto-color" style="background:${d.color}"></span>${esc(d.nombre)}</button>`)
          .join('')
      }
      return
    }
    const d = e.target.closest('[data-distrito]')
    if (d) {
      const dist = D.distritos[+d.dataset.distrito]
      if (e.target.closest('#leyenda-barrios')) {
        // en Barrios, el distrito despliega sus barrios
        const sig = d.nextElementSibling
        if (sig?.classList.contains('sub')) {
          sig.remove()
          return
        }
        const sub = document.createElement('div')
        sub.className = 'capa-leyenda sub'
        sub.style.margin = '0 0 4px 18px'
        sub.innerHTML = dist.barrios.map((b) => `<button type="button" data-barrio="${b}">${esc(D.barrios[b].nombre)}</button>`).join('')
        d.after(sub)
        return
      }
      encuadrar(dist.bbox, { maxZoom: 15 })
      return
    }
    const bb = e.target.closest('[data-barrio]')
    if (bb) {
      const b = D.barrios[+bb.dataset.barrio]
      marcarBarrio(b.id)
      encuadrar(b.bbox, { maxZoom: 16 })
    }
  })

  $('#capas-minimizar').onclick = () => minimizarCapas(true)
  $('#chip-capas').onclick = () => minimizarCapas(false)
  if (matchMedia('(max-width: 820px)').matches) minimizarCapas(true)
}

export function minimizarCapas(si) {
  $('#capas').hidden = si
  $('#chip-capas').hidden = !si
}

export function sincronizarCapas() {
  document.querySelectorAll('#capas [data-capa]').forEach((i) => (i.checked = !!capas[i.dataset.capa]))
}
