// Tarjeta de pregunta sobre el plano (Practicar y Aprender)

import { $, esc, icono } from './util.js'

let alCerrar = null

export function abrirTarjeta({ etiqueta, meta = '', enunciado, cuerpo = '', acciones = '', cerrar = null }) {
  const el = $('#pregunta')
  alCerrar = cerrar
  el.classList.remove('minimizada')
  el.innerHTML = `
    <div class="pregunta-cabecera">
      <img src="${import.meta.env.BASE_URL}marca/simbolo.svg" alt="" width="22" height="22" />
      <span class="etiqueta">${esc(etiqueta)}</span>
      <span class="meta">${meta}</span>
      <button type="button" class="redondo" data-t="min" aria-label="Minimizar" title="Minimizar">${icono.menos(12)}</button>
      <button type="button" class="redondo" data-t="cerrar" aria-label="Cerrar" title="Cerrar">${icono.cerrar(12)}</button>
    </div>
    <p class="enunciado">${enunciado}</p>
    <div class="cuerpo">${cuerpo}</div>
    <div class="practica-resultado" aria-live="polite"></div>
    <div class="acciones">${acciones}</div>`
  el.hidden = false
  el.querySelector('[data-t=min]').onclick = () => el.classList.toggle('minimizada')
  el.querySelector('[data-t=cerrar]').onclick = () => {
    cerrarTarjeta()
    alCerrar?.()
  }
  return el
}

export function cerrarTarjeta() {
  $('#pregunta').hidden = true
  $('#pregunta').innerHTML = ''
}

export function resultado(html, clase = 'info') {
  const r = $('#pregunta .practica-resultado')
  if (!r) return
  r.innerHTML = html ? `<div class="resultado ${clase}">${html}</div>` : ''
}

export function acciones(html) {
  const a = $('#pregunta .acciones')
  if (a) a.innerHTML = html
  return a
}

export function opcionesHTML(textos, una = false) {
  return `<div class="opciones ${una ? 'una-columna' : ''}">${textos
    .map((t, i) => `<button type="button" class="opcion" data-op="${i}"><span class="letra">${'abcd'[i]}</span><span>${esc(t)}</span></button>`)
    .join('')}</div>`
}

/** Marca la opción elegida y la correcta; devuelve si se acertó. */
export function corregirOpciones(contenedor, elegida, correcta) {
  contenedor.querySelectorAll('.opcion').forEach((b) => {
    const i = +b.dataset.op
    b.disabled = true
    if (i === correcta) b.classList.add('correcta')
    else if (i === elegida) b.classList.add('incorrecta')
  })
  return elegida === correcta
}
