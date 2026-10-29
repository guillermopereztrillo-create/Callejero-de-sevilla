// Diálogos: genérico, selector de zona, fuentes, privacidad y ayuda de ejercicios

import { D } from './datos.js'
import { $, esc, icono } from './util.js'

let alCerrarActual = null

export function abrirDialogo(html, { ancho = false, alCerrar = null } = {}) {
  const d = $('#dialogo')
  if (d.open) d.close()
  d.className = 'dialogo' + (ancho ? ' ancho' : '')
  d.innerHTML = html
  alCerrarActual = alCerrar
  d.showModal()
  d.querySelectorAll('[data-cerrar]').forEach((b) => (b.onclick = () => cerrarDialogo()))
  return d
}

export function cerrarDialogo(valor) {
  const d = $('#dialogo')
  if (d.open) d.close()
  const cb = alCerrarActual
  alCerrarActual = null
  cb?.(valor)
}

export function montarDialogos() {
  const d = $('#dialogo')
  d.addEventListener('click', (e) => {
    if (e.target === d) cerrarDialogo()
  })
  d.addEventListener('cancel', (e) => {
    e.preventDefault()
    cerrarDialogo()
  })
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]')
    if (!b) return
    if (b.dataset.abrir === 'fuentes') fuentes()
    if (b.dataset.abrir === 'privacidad') privacidad()
  })
}

export function confirmar(titulo, texto, si = 'Aceptar', no = 'Cancelar') {
  return new Promise((ok) => {
    abrirDialogo(
      `<div class="dialogo-cuerpo"><h2>${esc(titulo)}</h2><p>${texto}</p></div>
       <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-r="0">${esc(no)}</button><button class="principal" data-r="1">${esc(si)}</button></div></div>`,
      { alCerrar: (v) => ok(!!v) },
    ).querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => cerrarDialogo(b.dataset.r === '1')))
  })
}

/** Selector de zona: Toda Sevilla, un distrito o un barrio. Devuelve {tipo, id} o null.
 *  Con `varias`, se pueden marcar varios distritos y barrios: devuelve {tipo: 'varias', distritos, barrios}. */
export function elegirZona(actual, { varias = false } = {}) {
  const marcada = (t, id) =>
    actual?.tipo === t ? actual.id === id : actual?.tipo === 'varias' && (t === 'distrito' ? actual.distritos : actual.barrios).includes(id)
  const abierto = (di) => actual?.tipo === 'barrio' ? D.barrios[actual.id].distrito === di.id : varias && di.barrios.some((b) => marcada('barrio', b))
  return new Promise((ok) => {
    const d = abrirDialogo(
      `<div class="dialogo-cuerpo">
        <div class="antetitulo">Zona</div>
        <h2>¿Qué parte de Sevilla?</h2>
        ${varias ? '<p class="nota">Puedes marcar varios distritos y barrios.</p>' : ''}
        <button type="button" class="fila-zona" data-zona="todo"><span class="punto-color" style="background:var(--acento)"></span><b>Toda Sevilla</b><span class="cuenta">${D.calles.length.toLocaleString('es-ES')} vías</span></button>
        ${D.distritos
          .map(
            (di) => `<details class="acordeon-zona" ${abierto(di) ? 'open' : ''}>
            <summary><span class="punto-color" style="background:${di.color}"></span>${esc(di.nombre)}<span class="cuenta">${di.barrios.length} barrios</span>${icono.abajo(14)}</summary>
            <button type="button" class="fila-zona" data-zona="distrito" data-id="${di.id}" ${varias ? `aria-pressed="${marcada('distrito', di.id)}"` : ''}><b>Todo el distrito</b><span class="cuenta">${di.calles} calles</span></button>
            ${di.barrios.map((b) => `<button type="button" class="fila-zona" data-zona="barrio" data-id="${b}" ${varias ? `aria-pressed="${marcada('barrio', b)}"` : ''}>${esc(D.barrios[b].nombre)}<span class="cuenta">${D.barrios[b].calles} calles</span></button>`).join('')}
          </details>`,
          )
          .join('')}
      </div>
      <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Cancelar</button>${varias ? '<button class="principal" id="zona-aplicar">Aplicar</button>' : ''}</div></div>`,
      { alCerrar: (v) => ok(v ?? null) },
    )
    d.querySelectorAll('[data-zona]').forEach(
      (b) =>
        (b.onclick = () => {
          const t = b.dataset.zona
          if (t === 'todo') return cerrarDialogo({ tipo: 'todo' })
          if (!varias) return cerrarDialogo({ tipo: t, id: +b.dataset.id })
          b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true')
          contar()
        }),
    )
    const aplicar = d.querySelector('#zona-aplicar')
    function seleccion() {
      const ids = (t) => [...d.querySelectorAll(`[data-zona=${t}][aria-pressed=true]`)].map((b) => +b.dataset.id)
      return { distritos: ids('distrito'), barrios: ids('barrio') }
    }
    function contar() {
      const s = seleccion()
      const n = s.distritos.length + s.barrios.length
      aplicar.textContent = n ? `Aplicar (${n})` : 'Aplicar'
      aplicar.disabled = !n
    }
    if (aplicar) {
      contar()
      aplicar.onclick = () => {
        const s = seleccion()
        // una sola zona se guarda como siempre; varias, juntas
        if (s.distritos.length + s.barrios.length === 1) cerrarDialogo(s.distritos.length ? { tipo: 'distrito', id: s.distritos[0] } : { tipo: 'barrio', id: s.barrios[0] })
        else cerrarDialogo({ tipo: 'varias', ...s })
      }
    }
  })
}

export function nombreZona(z) {
  if (!z || z.tipo === 'todo') return 'Toda Sevilla'
  if (z.tipo === 'varias') {
    const n = [...z.distritos.map((i) => D.distritos[i].nombre), ...z.barrios.map((i) => D.barrios[i].nombre)]
    return n.length <= 2 ? n.join(' y ') : `${n.slice(0, 2).join(', ')} y ${n.length - 2} más`
  }
  return z.tipo === 'distrito' ? D.distritos[z.id].nombre : D.barrios[z.id].nombre
}

export function fuentes() {
  const f = D.fuentes?.fuentes || []
  abrirDialogo(
    `<div class="dialogo-cuerpo">
      <div class="antetitulo">Fuentes de datos</div>
      <h2>De dónde sale el plano</h2>
      <p>Todo el callejero se construye con datos oficiales y abiertos. Datos preparados el ${esc(D.fuentes?.generado ?? '')} con <code>scripts/preparar_datos.py</code>.</p>
      <ul class="lista-fuentes">${f
        .map((x) => `<li><b>${esc(x.nombre)}</b><small>${esc(x.autor)} · ${esc(x.licencia)} · <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(new URL(x.url).hostname)}</a></small></li>`)
        .join('')}</ul>
      <p class="nota">El sentido de circulación y las calles peatonales proceden de OpenStreetMap y pueden no coincidir con la ordenación vial vigente. Las preguntas generadas llevan la marca «no oficial».</p>
    </div>
    <div class="dialogo-pie"><div class="derecha"><button class="principal" data-cerrar>Cerrar</button></div></div>`,
    { ancho: true },
  )
}

export function privacidad() {
  abrirDialogo(
    `<div class="dialogo-cuerpo">
      <div class="antetitulo">Privacidad</div>
      <h2>Tus datos se quedan aquí</h2>
      <p>Esta web no tiene cuentas ni servidor propio: tu progreso, tus anotaciones, tus preguntas y tus ajustes se guardan solo en el almacenamiento local de este navegador. No hay cookies de seguimiento ni analítica.</p>
      <p>Para ver el plano se piden teselas a servicios públicos: la ortofoto al Instituto Geográfico Nacional, el relieve a Amazon (Terrain Tiles) y las tipografías del plano a Protomaps. Desde <b>Mi cuenta</b> puedes exportar o borrar todo lo guardado.</p>
    </div>
    <div class="dialogo-pie"><div class="derecha"><button class="principal" data-cerrar>Entendido</button></div></div>`,
  )
}
