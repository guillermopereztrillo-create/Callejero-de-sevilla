// Duelo en directo: de 2 a 6 jugadores por turnos en el mismo dispositivo

import { oficiales, generarPregunta } from './preguntas.js'
import { abrirDialogo, cerrarDialogo, elegirZona, nombreZona } from './dialogos.js'
import { P } from './progreso.js'
import { $, esc, barajar, icono, aviso } from './util.js'

const SEGUNDOS = 20
let reloj = null

export function duelo() {
  const nombres = [P.nombre || '', '', '', '', '', '']
  let num = 8
  let zona = { tipo: 'todo' }
  const pintar = () => {
    const d = abrirDialogo(
      `<form class="dialogo-cuerpo" id="duelo-form">
        <div class="antetitulo">Duelo en directo</div>
        <h2>¿Quién juega?</h2>
        <p>Mismas preguntas para todos, por turnos. ${SEGUNDOS} segundos por pregunta; acertar rápido da más puntos.</p>
        ${nombres.map((n, i) => `<input type="text" data-j="${i}" value="${esc(n)}" placeholder="Jugador ${i + 1}${i < 2 ? '' : ' (opcional)'}" maxlength="18" style="margin-top:8px" />`).join('')}
        <label>Preguntas por jugador</label>
        <div class="seg-fino" id="duelo-num">${[5, 8, 12].map((n) => `<button type="button" data-v="${n}" class="${n === num ? 'activo' : ''}">${n}</button>`).join('')}</div>
        <button type="button" class="tm-fila" id="duelo-zona"><span>Zona</span><span class="zona-valor">${esc(nombreZona(zona))}</span>${icono.flecha(16)}</button>
      </form>
      <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Cancelar</button><button class="principal" id="duelo-empezar">Empezar</button></div></div>`,
      { ancho: true },
    )
    const leer = () => d.querySelectorAll('[data-j]').forEach((i) => (nombres[+i.dataset.j] = i.value.trim()))
    $('#duelo-num').onclick = (e) => {
      const b = e.target.closest('button')
      if (!b) return
      num = +b.dataset.v
      d.querySelectorAll('#duelo-num button').forEach((x) => x.classList.toggle('activo', x === b))
    }
    $('#duelo-zona').onclick = async () => {
      leer()
      const z = await elegirZona(zona)
      if (z) zona = z
      pintar()
    }
    $('#duelo-empezar').onclick = async () => {
      leer()
      const jugadores = nombres.filter(Boolean)
      if (jugadores.length < 2) return aviso('Hacen falta al menos dos jugadores')
      $('#duelo-empezar').disabled = true
      $('#duelo-empezar').textContent = 'Preparando…'
      const ps = await preparar(num, zona)
      jugar(jugadores, ps)
    }
  }
  pintar()
}

async function preparar(n, zona) {
  const ps = zona.tipo === 'todo' ? barajar(oficiales()).slice(0, Math.floor(n / 2)) : []
  const tipos = barajar(['acceso', 'relacion', 'zona', 'lugar', 'peatonal'])
  let i = 0
  let fallos = 0
  while (ps.length < n && fallos < 40) {
    const p = await generarPregunta(tipos[i++ % tipos.length], { zona })
    if (p) ps.push(p)
    else fallos++
  }
  return barajar(ps)
}

function jugar(jugadores, preguntas) {
  const puntos = Object.fromEntries(jugadores.map((j) => [j, 0]))
  const aciertos = Object.fromEntries(jugadores.map((j) => [j, 0]))
  let q = 0
  let t = 0
  const turno = () => {
    if (q >= preguntas.length) return final()
    const j = jugadores[t]
    abrirDialogo(
      `<div class="dialogo-cuerpo" style="text-align:center;padding:36px 22px">
        <div class="antetitulo">Pregunta ${q + 1} de ${preguntas.length}</div>
        <h2 style="font-size:32px">Turno de ${esc(j)}</h2>
        <p>Pasa el dispositivo. ${esc(j)} lleva ${puntos[j]} puntos.</p>
      </div>
      <div class="dialogo-pie"><div class="derecha" style="margin:0 auto"><button class="principal grande" id="duelo-listo">Estoy listo</button></div></div>`,
      { alCerrar: (v) => v !== 'sigue' && clearInterval(reloj) },
    )
    $('#duelo-listo').onclick = () => preguntar(j)
  }
  const preguntar = (j) => {
    const p = preguntas[q]
    let quedan = SEGUNDOS
    abrirDialogo(
      `<div class="dialogo-cuerpo">
        <div class="test-num"><b>${esc(j)}</b><span class="etiqueta-mini ${p.oficial ? 'oficial' : ''}">${p.oficial ? 'Oficial' : 'No oficial'}</span><span class="test-reloj" id="duelo-reloj">${quedan}</span></div>
        <p class="enunciado">${esc(p.enunciado)}</p>
        <div class="opciones una-columna">${p.opciones.map((o, k) => `<button type="button" class="opcion" data-op="${k}"><span class="letra">${'abc'[k]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div class="practica-resultado" id="duelo-res"></div>
      </div>
      <div class="dialogo-pie"><div class="derecha"><button class="principal" id="duelo-sig" hidden>Continuar</button></div></div>`,
      { ancho: true, alCerrar: (v) => v !== 'sigue' && clearInterval(reloj) },
    )
    const responder = (k) => {
      clearInterval(reloj)
      document.querySelectorAll('#dialogo .opcion').forEach((b) => {
        b.disabled = true
        const i = +b.dataset.op
        if (i === p.correcta) b.classList.add('correcta')
        else if (i === k) b.classList.add('incorrecta')
      })
      const ok = k === p.correcta
      const gana = ok ? 100 + quedan * 5 : 0
      puntos[j] += gana
      if (ok) aciertos[j]++
      $('#duelo-res').innerHTML = `<div class="resultado ${ok ? 'bien' : 'mal'}">${k == null ? '⏱ Se acabó el tiempo.' : ok ? `✓ +${gana} puntos` : '✗ Fallo'}</div>`
      $('#duelo-sig').hidden = false
      $('#duelo-sig').focus()
    }
    clearInterval(reloj)
    reloj = setInterval(() => {
      quedan--
      const r = $('#duelo-reloj')
      if (r) {
        r.textContent = quedan
        r.classList.toggle('urgente', quedan <= 5)
      }
      if (quedan <= 0) responder(null)
    }, 1000)
    $('#dialogo .opciones').onclick = (e) => {
      const b = e.target.closest('.opcion')
      if (b && !b.disabled) responder(+b.dataset.op)
    }
    $('#duelo-sig').onclick = () => {
      t++
      if (t >= jugadores.length) {
        t = 0
        q++
      }
      turno()
    }
  }
  const final = () => {
    const orden = [...jugadores].sort((a, b) => puntos[b] - puntos[a])
    const medallas = ['🥇', '🥈', '🥉']
    abrirDialogo(
      `<div class="dialogo-portada"><img src="${import.meta.env.BASE_URL}marca/logo.webp" alt="" width="84" height="84" /></div>
      <div class="dialogo-cuerpo"><div class="antetitulo">Clasificación</div><h2>¡Gana ${esc(orden[0])}!</h2>
        <table class="tabla-progreso">${orden.map((j, i) => `<tr><td>${medallas[i] || i + 1 + '.'} ${esc(j)}<br><small class="nota">${aciertos[j]} de ${preguntas.length} aciertos</small></td><td><b>${puntos[j]}</b> puntos</td></tr>`).join('')}</table>
      </div>
      <div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Cerrar</button><button class="principal" id="duelo-otra">Revancha</button></div></div>`,
    )
    $('#duelo-otra').onclick = () => {
      cerrarDialogo()
      duelo()
    }
  }
  turno()
}
