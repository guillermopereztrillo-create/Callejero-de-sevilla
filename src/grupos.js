// Pestaña Grupos: retos con enlace entre amigos y duelos en el mismo dispositivo
// (sin servidor: el reto viaja en el propio enlace y todos reciben las mismas preguntas)

import { activarEncima } from './mapa.js'
import { oficiales, generarPregunta, TIPOS_PREGUNTA } from './preguntas.js'
import { iniciarTest, testActivo } from './test.js'
import { contrarreloj } from './examen.js'
import { duelo } from './duelo.js'
import { P, guardar } from './progreso.js'
import { abrirDialogo, cerrarDialogo, elegirZona, nombreZona } from './dialogos.js'
import { app } from './app.js'
import { $, esc, icono, guardado, barajar, generador, aviso, copiar, numero } from './util.js'

let zonaReto = { tipo: 'todo' }

export function montarGrupos() {
  pintar()
}

export function alActivar(activo) {
  if (activo) {
    activarEncima(false)
    pintar()
  }
}

function pintar() {
  const retos = guardado.leer('retos', [])
  $('#panel-grupos').innerHTML = `
    <section class="bloque">
      <h2>Estudiar en grupo</h2>
      <p class="nota">Reta a tus compañeros de oposición con un enlace: todos reciben exactamente las mismas preguntas y comparáis la nota. No hace falta cuenta.</p>
    </section>
    <div class="modos-examen">
      <button type="button" class="modo-examen modo-real" id="reto-test">
        <span class="modo-icono">${icono.enlace(22)}</span>
        <span class="modo-texto"><strong>Crear un reto</strong><small>Un test con las mismas preguntas para todo tu grupo. Comparte el enlace por WhatsApp o donde quieras.</small></span>
      </button>
      <button type="button" class="modo-examen modo-crono" id="reto-crono">
        <span class="modo-icono">${icono.reloj(22)}</span>
        <span class="modo-texto"><strong>Reto contrarreloj</strong><small>Juega 60 segundos y envía tu marca: tus amigos tendrán las mismas preguntas.</small></span>
      </button>
      <button type="button" class="modo-examen modo-mias" id="reto-duelo">
        <span class="modo-icono">${icono.personas(22)}</span>
        <span class="modo-texto"><strong>Duelo en directo</strong><small>De 2 a 6 jugadores por turnos en este dispositivo, con clasificación al final.</small></span>
      </button>
    </div>
    <section class="bloque">
      <h2>Unirse a un reto</h2>
      <form class="respuesta-fila" id="unirse"><input type="text" id="codigo-reto" placeholder="Pega aquí el enlace del reto" aria-label="Enlace del reto" style="font-size:14px;padding:8px 12px" /><button class="secundario">Jugar</button></form>
    </section>
    <section class="bloque" ${retos.length ? '' : 'hidden'}>
      <h2>Tus retos</h2>
      <table class="tabla-progreso">${retos
        .slice(0, 12)
        .map(
          (r) => `<tr><td>${esc(r.titulo)}<br><small class="nota">${new Date(r.fecha).toLocaleDateString('es-ES')}${r.rival ? ` · ${esc(r.rival)}: ${esc(r.marcaRival)}` : ''}</small></td><td><b>${esc(r.marca)}</b></td></tr>`,
        )
        .join('')}</table>
    </section>`
  $('#reto-test').onclick = crearReto
  $('#reto-crono').onclick = () => {
    pedirNombre(() => contrarreloj())
  }
  $('#reto-duelo').onclick = () => duelo()
  $('#unirse').onsubmit = (e) => {
    e.preventDefault()
    const v = $('#codigo-reto').value.trim()
    const m = v.match(/#reto=([^\s&]+)/) || v.match(/^([A-Za-z0-9%=+/_-]+)$/)
    if (!m) return aviso('No reconozco ese enlace')
    abrirRetoDeEnlace(m[1])
  }
}

function pedirNombre(despues) {
  if (P.nombre) return despues()
  const d = abrirDialogo(`<form class="dialogo-cuerpo" id="f-nombre"><div class="antetitulo">Tu nombre</div><h2>¿Cómo te llamamos?</h2><p>Aparece en los retos que envíes.</p><input type="text" id="nombre-jugador" required maxlength="24" placeholder="Tu nombre" /></form>
    <div class="dialogo-pie"><div class="derecha"><button class="principal" id="ok-nombre">Continuar</button></div></div>`)
  const ok = () => {
    const v = $('#nombre-jugador').value.trim()
    if (!v) return
    P.nombre = v
    guardar()
    cerrarDialogo()
    despues()
  }
  $('#ok-nombre').onclick = ok
  d.querySelector('form').onsubmit = (e) => {
    e.preventDefault()
    ok()
  }
}

function crearReto() {
  pedirNombre(() => {
    const d = abrirDialogo(
      `<div class="dialogo-cuerpo">
        <div class="antetitulo">Nuevo reto</div><h2>Un test para tu grupo</h2>
        <label>Preguntas</label><div class="seg-fino" id="r-num"><button data-v="10" class="activo">10</button><button data-v="20">20</button><button data-v="30">30</button></div>
        <label>Origen</label><div class="seg-fino" id="r-origen"><button data-v="mixto" class="activo">Oficiales y generadas</button><button data-v="generadas">Solo generadas</button></div>
        <label>Zona</label><button type="button" class="tm-fila" id="r-zona"><span>Zona</span><span class="zona-valor">${esc(nombreZona(zonaReto))}</span>${icono.flecha(16)}</button>
        <p class="nota">Corrección al final y cada fallo resta ⅓, como en el examen.</p>
      </div>
      <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Cancelar</button><button class="principal" id="r-crear">Crear y jugar</button></div></div>`,
    )
    const sel = { num: 10, origen: 'mixto' }
    for (const [id, k] of [
      ['#r-num', 'num'],
      ['#r-origen', 'origen'],
    ])
      d.querySelector(id).onclick = (e) => {
        const b = e.target.closest('button')
        if (!b) return
        sel[k] = k === 'num' ? +b.dataset.v : b.dataset.v
        d.querySelectorAll(id + ' button').forEach((x) => x.classList.toggle('activo', x === b))
      }
    $('#r-zona').onclick = async () => {
      const z = await elegirZona(zonaReto)
      if (z) zonaReto = z
      crearReto()
    }
    $('#r-crear').onclick = () => {
      const reto = { t: 'test', s: Math.random().toString(36).slice(2, 10), n: P.nombre, q: sel.num, o: sel.origen, z: zonaReto }
      cerrarDialogo()
      jugarReto(reto, true)
    }
  })
}

function codificar(o) {
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(o)))))
}

function decodificar(s) {
  return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s)))))
}

const enlace = (reto) => `${location.origin}${location.pathname}#reto=${codificar(reto)}`

async function preguntasReto(reto) {
  const rnd = generador(reto.s)
  let ps = []
  if (reto.o !== 'generadas') ps = barajar(oficiales(), rnd).slice(0, Math.ceil(reto.q / 2))
  const tipos = ['acceso', 'relacion', 'zona', 'lugar', 'itinerario']
  let i = 0
  let fallos = 0
  while (ps.length < reto.q && fallos < 60) {
    const p = await generarPregunta(tipos[i++ % tipos.length], { rnd, zona: reto.z })
    if (p) ps.push(p)
    else fallos++
  }
  return barajar(ps, rnd)
}

async function jugarReto(reto, propio = false) {
  if (testActivo()) return aviso('Termina antes el test abierto')
  if (reto.t === 'cr') return contrarreloj(reto.s, reto.n)
  aviso('Preparando las preguntas del reto…')
  const ps = await preguntasReto(reto)
  app.cerrarMenuMovil()
  iniciarTest({
    titulo: propio ? 'Tu reto' : `Reto de ${reto.n}`,
    preguntas: ps,
    correccion: 'final',
    penalizacion: 0.3333,
    alTerminar: (r) => {
      const marca = numero(r.nota, 2)
      const lista = guardado.leer('retos', [])
      lista.unshift({ fecha: Date.now(), titulo: propio ? `Reto propio · ${reto.q} preguntas` : `Reto de ${reto.n}`, marca, rival: propio ? null : reto.n, marcaRival: reto.p ?? null })
      guardado.escribir('retos', lista.slice(0, 30))
      if (app.pestana === 'grupos') pintar()
    },
    compartir: (r) => {
      const nuevo = { ...reto, n: P.nombre || reto.n, p: numero(r.nota, 2) }
      const texto = `${propio ? 'Te reto' : 'Acepto el reto y subo la apuesta'}: he sacado un ${numero(r.nota, 2)} en ${reto.q} preguntas del callejero de Sevilla. Mismas preguntas para ti: ${enlace(nuevo)}`
      if (navigator.share) navigator.share({ text: texto }).catch(() => copiar(texto))
      else copiar(texto)
    },
  })
}

export function abrirRetoDeEnlace(codigo) {
  let reto
  try {
    reto = decodificar(codigo)
  } catch {
    try {
      reto = JSON.parse(atob(decodeURIComponent(codigo)))
    } catch {
      return aviso('El enlace del reto no es válido')
    }
  }
  history.replaceState(null, '', location.pathname)
  const que = reto.t === 'cr' ? 'un contrarreloj de 60 segundos' : `un test de ${reto.q} preguntas (${nombreZona(reto.z)})`
  abrirDialogo(
    `<div class="dialogo-portada"><img src="${import.meta.env.BASE_URL}marca/simbolo.svg" alt="" width="84" height="84" /></div>
    <div class="dialogo-cuerpo"><div class="antetitulo">Reto</div><h2>${esc(reto.n)} te reta</h2>
      <p>Te propone ${que}${reto.p != null ? `; su marca: <b>${esc(reto.p)}</b>` : ''}. Tendrás exactamente las mismas preguntas.</p></div>
    <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Ahora no</button><button class="principal" id="aceptar-reto">Aceptar el reto</button></div></div>`,
  )
  $('#aceptar-reto').onclick = () => {
    cerrarDialogo()
    jugarReto(reto)
  }
}

export { TIPOS_PREGUNTA }
