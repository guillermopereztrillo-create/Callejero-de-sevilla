// «Mi cuenta»: perfil local, progreso, plan hasta el examen, tema y copia de seguridad

import { D, estudiable } from './datos.js'
import { aplicarTema } from './mapa.js'
import { P, guardar, resumen, plan, exportar, importar, borrarTodo, alCambiar } from './progreso.js'
import { abrirDialogo, cerrarDialogo, confirmar, fuentes } from './dialogos.js'
import { tutorial } from './tutorial.js'
import { sesion, abrirAcceso, cerrarSesion, cambiarCuenta } from './cuentas.js'
import { $, esc, icono, guardado, descargarArchivo, aviso, numero } from './util.js'

export function montarCuenta() {
  $('#boton-cuenta').onclick = () => (sesion() ? abrirCuenta() : abrirAcceso('crear'))
  alCambiar(pintarAvatar)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => guardado.leer('tema', null) === 'auto' && ponerTema('auto'))
}

export function pintarAvatar() {
  const b = $('#boton-cuenta')
  const c = sesion()
  b.innerHTML = c ? esc(c.nombre.trim().charAt(0).toUpperCase()) : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.4 3-5.5 6-5.5 1.3 0 2.5.4 3.4 1M18 13v6M15 16h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  b.title = c ? `Mi cuenta · ${c.nombre}` : 'Crear cuenta o entrar'
  b.setAttribute('aria-label', b.title)
}

function ponerTema(t) {
  try {
    localStorage.setItem('callejero.tema', t)
  } catch {}
  const oscuro = t === 'oscuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (oscuro) document.documentElement.dataset.tema = 'oscuro'
  else delete document.documentElement.dataset.tema
  document.querySelector('meta[name=theme-color]').content = oscuro ? '#1B1714' : '#FAF6EF'
  aplicarTema()
}

export function abrirCuenta() {
  const cuenta = sesion()
  const r = resumen()
  const total = D.calles.filter(estudiable).length
  const pl = plan(total)
  const tema = (() => {
    try {
      return localStorage.getItem('callejero.tema') || 'claro'
    } catch {
      return 'claro'
    }
  })()
  const porDistrito = D.distritos.map((d) => {
    const ids = D.calles.filter((c) => c.d === d.id && estudiable(c))
    const dom = ids.filter((c) => (P.calles[c.id]?.caja ?? 0) >= 3).length
    return { d, dom, total: ids.length }
  })
  const dl = abrirDialogo(
    `<div class="dialogo-cuerpo">
      <div class="antetitulo">Mi cuenta</div>
      <h2>${cuenta ? esc(cuenta.nombre) : 'Tu progreso'}</h2>
      ${
        cuenta
          ? `<p>${esc(cuenta.correo)} · ${cuenta.tipo === 'nube' ? 'tu progreso se sincroniza en todos tus dispositivos' : 'cuenta guardada en este dispositivo'}.</p>
             <div class="acciones"><button type="button" class="secundario pequeno" id="c-cambiar">Cambiar de cuenta</button><button type="button" class="secundario pequeno" id="c-salir">Cerrar sesión</button></div>`
          : `<p>Estás sin cuenta: tu progreso solo se guarda en este navegador.</p>
             <div class="acciones"><button type="button" class="principal pequeno" id="c-crear">Crear cuenta gratis</button><button type="button" class="secundario pequeno" id="c-entrar">Ya tengo cuenta</button></div>`
      }
      <div class="cifras" style="margin:14px 0">
        <div><b>${r.racha}</b><small>días seguidos</small></div>
        <div><b>${r.vistas}</b><small>calles practicadas</small></div>
        <div><b>${r.porcentaje}%</b><small>aciertos</small></div>
      </div>
      <label for="c-nombre">Nombre (aparece en tus retos)</label>
      <input type="text" id="c-nombre" value="${esc(P.nombre)}" maxlength="24" placeholder="Tu nombre" />
      <label for="c-examen">Fecha del examen</label>
      <input type="date" id="c-examen" value="${esc(P.examenFecha)}" />
      <p class="nota" id="c-plan">${pl ? (pl.dias > 0 ? `Quedan <b>${pl.dias} días</b>: para dominar todo el callejero necesitas unas <b>${pl.porDia} calles nuevas al día</b>, más tus repasos (${r.repasos} hoy).` : 'La fecha del examen ya ha pasado.') : 'Pon la fecha y te calculamos un plan diario.'}</p>
      <label>Tema</label>
      <div class="seg-fino" id="c-tema">${[
        ['claro', 'Claro'],
        ['oscuro', 'Oscuro'],
        ['auto', 'Automático'],
      ]
        .map(([v, t]) => `<button type="button" data-v="${v}" class="${tema === v ? 'activo' : ''}">${t}</button>`)
        .join('')}</div>
      <h3 class="subtitulo">Calles dominadas por distrito</h3>
      <table class="tabla-progreso">${porDistrito
        .map(
          ({ d, dom, total }) =>
            `<tr><td><span class="punto-color" style="display:inline-block;background:${d.color};margin-right:8px"></span>${esc(d.nombre)}<div class="progreso-mini"><span style="width:${(100 * dom) / Math.max(1, total)}%;background:${d.color}"></span></div></td><td>${numero(dom)} / ${numero(total)}</td></tr>`,
        )
        .join('')}</table>
      <div class="acciones" style="margin-top:16px">
        <button type="button" class="secundario pequeno" id="c-exportar">${icono.descargar(16)} Exportar copia</button>
        <button type="button" class="secundario pequeno" id="c-importar">${icono.subir(16)} Importar copia</button>
        <button type="button" class="secundario pequeno" id="c-tutorial">Ver el tutorial</button>
        <button type="button" class="secundario pequeno" id="c-fuentes">Fuentes de datos</button>
        <button type="button" class="secundario pequeno" id="c-borrar" style="color:var(--error)">${icono.papelera(16)} Borrar todo</button>
      </div>
    </div>
    <div class="dialogo-pie"><div class="derecha"><button class="principal" data-cerrar>Listo</button></div></div>`,
    { ancho: true },
  )
  if ($('#c-salir')) $('#c-salir').onclick = cerrarSesion
  if ($('#c-cambiar')) $('#c-cambiar').onclick = cambiarCuenta
  if ($('#c-crear')) $('#c-crear').onclick = () => abrirAcceso('crear')
  if ($('#c-entrar')) $('#c-entrar').onclick = () => abrirAcceso('entrar')
  $('#c-nombre').onchange = (e) => {
    P.nombre = e.target.value.trim()
    guardar()
  }
  $('#c-examen').onchange = (e) => {
    P.examenFecha = e.target.value
    guardar()
    abrirCuenta()
  }
  $('#c-tema').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    dl.querySelectorAll('#c-tema button').forEach((x) => x.classList.toggle('activo', x === b))
    ponerTema(b.dataset.v)
  }
  $('#c-exportar').onclick = () => descargarArchivo(`callejero-sevilla-${new Date().toISOString().slice(0, 10)}.json`, exportar())
  $('#c-importar').onclick = () => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.json,application/json'
    inp.onchange = async () => {
      try {
        importar(await inp.files[0].text())
        aviso('Copia importada. Recargando…')
        setTimeout(() => location.reload(), 800)
      } catch (err) {
        aviso(err.message || 'No se pudo importar')
      }
    }
    inp.click()
  }
  $('#c-tutorial').onclick = () => {
    cerrarDialogo()
    tutorial()
  }
  $('#c-fuentes').onclick = fuentes
  $('#c-borrar').onclick = async () => {
    if (await confirmar('¿Borrar todo tu progreso?', 'Se borrarán tus aciertos, repasos, zonas aprendidas y récords de este navegador. No se puede deshacer.', 'Borrar', 'Cancelar')) {
      borrarTodo()
      for (const k of ['tests', 'historial', 'retos', 'anotaciones', 'misPreguntas']) guardado.borrar(k)
      aviso('Progreso borrado')
      setTimeout(() => location.reload(), 600)
    }
  }
}
