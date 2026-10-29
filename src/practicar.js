// Pestaña Practicar: ejercicios sobre el mapa mudo

import { D, CATEGORIAS, estudiable, coincideNombre, normalizarRespuesta, unirBbox } from './datos.js'
import { mapa, marcar, limpiarMarcas, encuadrarCalles, encuadrar, modoJuego, calleEn, ponerMarcador, quitarMarcadores, dibujarRuta, distanciaM, marcarBarrio, activarEncima } from './mapa.js'
import { abrirTarjeta, cerrarTarjeta, resultado, acciones, opcionesHTML, corregirOpciones } from './tarjeta.js'
import { callesDeZona, conArticulo, cercanasSinCruce, preguntaItinerario } from './preguntas.js'
import { parques, calcularRuta } from './rutas.js'
import { registrar, registrarLugar, pendientesHoy, falladas } from './progreso.js'
import { elegirZona, nombreZona, abrirDialogo } from './dialogos.js'
import { duelo } from './duelo.js'
import { app } from './app.js'
import { $, $$, esc, icono, guardado, barajar, elegir, metros, plural, aviso } from './util.js'

const EJ = {
  nombrar: { grupo: 'reconocer', titulo: '¿Qué calle es?', desc: 'Se resalta una calle en el mapa mudo y escribes su nombre.', icono: icono.lapiz, ayuda: 'Verás una calle resaltada en el plano sin nombres. Escribe cómo se llama (con o sin «calle», «avda.»…, sin preocuparte de tildes o mayúsculas; se admiten pequeñas erratas). Si te atascas, la pista te dice en qué calles empieza y acaba.' },
  test: { grupo: 'reconocer', titulo: 'Elige la respuesta', desc: 'Una calle resaltada y cuatro nombres para elegir.', icono: icono.lista, ayuda: 'Se resalta una calle y eliges su nombre entre cuatro. Los nombres falsos son de calles cercanas, así que fíjate bien. Puedes responder con las teclas 1 a 4.' },
  localizar: { grupo: 'reconocer', titulo: '¿Dónde está?', desc: 'Te damos un nombre y tocas la calle en el mapa.', icono: icono.pin, ayuda: 'Te damos el nombre de una calle y la tocas en el plano. Si fallas, verás en rojo la que tocaste y en verde la buena, con la distancia que os separa.' },
  zona: { grupo: 'reconocer', titulo: '¿En qué barrio está?', desc: 'Distrito y barrio de cada calle.', icono: icono.mapa, ayuda: 'Se resalta una calle con su nombre y eliges en qué barrio (o distrito) está, como en las preguntas de examen. Si una calle atraviesa varios barrios, vale cualquiera de ellos.' },
  relaciones: { grupo: 'cruces', titulo: 'Calles vecinas', desc: 'Paralelas, perpendiculares y esquinas.', icono: icono.cruce, ayuda: 'Te damos una calle y eliges cuál es paralela, perpendicular, se cruza con ella o es una de las calles en las que acaba. Al responder, verás todas en el plano.' },
  ciegas: { grupo: 'cruces', titulo: 'Calles a ciegas', desc: 'Te damos las calles en las que acaba y adivinas cuál es.', icono: icono.ojo, ayuda: 'Solo ves (en azul) las calles en las que empieza y termina una calle. ¿Sabes cuál las une? Elige entre cuatro.' },
  ruta: { grupo: 'cruces', titulo: 'Traza la ruta', desc: 'Del parque de bomberos hasta la calle, tocando el recorrido.', icono: icono.ruta, ayuda: 'Sales de un parque de bomberos y tienes que llegar a la calle indicada tocando, una a una, las calles del recorrido. Cada calle tiene que cruzarse con la anterior. Al llegar, comparamos con la ruta más corta respetando el sentido de circulación.' },
  itinerario: { grupo: 'cruces', titulo: 'Itinerario', desc: 'Elige el recorrido más rápido, como en el examen.', icono: icono.brujula, ayuda: 'Como las preguntas de itinerario del examen: tres recorridos desde un parque de bomberos y solo uno es posible. Los falsos tienen una calle que no conecta o salen de otro parque.' },
  lugares: { grupo: 'lugares', titulo: 'Lugares de interés', desc: 'Qué lugar es, dónde está y en qué calle o barrio.', icono: icono.pin, ayuda: 'Hospitales, monumentos (BIC), museos, mercados, parques de bomberos, colegios… con datos abiertos del Ayuntamiento. Elige qué preguntar y qué tipos de lugar.' },
}

const GRUPOS = {
  reconocer: ['Reconocer calles y zonas', 'Nombrar, elegir, tocar en el mapa y barrios'],
  cruces: ['Cruces y recorridos', 'Calles vecinas, a ciegas y rutas'],
  lugares: ['Lugares de interés', 'Hospitales, monumentos, colegios, mercados…'],
}

const REL = { paralela: 'Paralelas', perpendicular: 'Perpendiculares', cruce: 'Se cruzan', acaba: 'Dónde acaba' }
const LUG = { que: '¿Qué lugar es?', donde: '¿Dónde está?', calle: '¿En qué calle?', barrio: '¿En qué barrio?' }

const F = Object.assign(
  { zona: { tipo: 'todo' }, dif: 0, repaso: false, falladas: false, principales: false, zonas: false, rel: Object.keys(REL), lug: Object.keys(LUG), cats: ['hospital', 'monumento', 'museo', 'bomberos', 'mercado', 'policia'], zonaTipo: 'barrio' },
  guardado.leer('practica', {}),
)
let ejercicio = guardado.leer('practica.ejercicio', 'nombrar')
let racha = 0
let contador = 0
let recientes = []
let actual = null

const guardarF = () => guardado.escribir('practica', F)

export function montarPracticar() {
  const p = $('#panel-practicar')
  p.innerHTML = `
    <div class="ejercicio-fila">
      <button type="button" class="modo-examen modo-mias" id="duelo-abrir">
        <span class="modo-icono">${icono.duelo(22)}</span>
        <span class="modo-texto"><strong>Duelo en directo</strong><small>Hasta seis jugadores en este dispositivo, mismas preguntas, cuenta atrás y clasificación al final.</small></span>
      </button>
      <button type="button" class="ejercicio-ayuda" id="duelo-ayuda" aria-label="Cómo se juega el duelo" title="Cómo se juega">?</button>
    </div>
    <section class="bloque">
      <h2>Ejercicio</h2>
      <div class="ejercicios">
        ${Object.entries(GRUPOS)
          .map(
            ([g, [t, s]]) => `<details class="grupo-ejercicios" name="grupo-ejercicios" data-grupo="${g}" ${EJ[ejercicio].grupo === g ? 'open' : ''}>
            <summary><span><b>${t}</b><small>${s}</small></span>${icono.flecha(16)}</summary>
            ${Object.entries(EJ)
              .filter(([, e]) => e.grupo === g)
              .map(
                ([k, e]) => `<div class="ejercicio-fila"><button type="button" class="ejercicio ${k === ejercicio ? 'activo' : ''}" data-ejercicio="${k}"><span class="ej-icono">${e.icono(20)}</span><span class="ej-texto"><strong>${e.titulo}</strong><small>${e.desc}</small></span></button><button type="button" class="ejercicio-ayuda" data-ayuda="${k}" aria-label="Cómo se juega: ${e.titulo}" title="Cómo se juega">?</button></div>`,
              )
              .join('')}
          </details>`,
          )
          .join('')}
      </div>
      <div class="practica-tipos" id="tipos-relaciones" hidden><p class="nota">Tipos de pregunta que pueden salir:</p><div class="chips">${Object.entries(REL)
        .map(([k, t]) => `<button type="button" class="chip" data-rel="${k}" aria-pressed="${F.rel.includes(k)}">${t}</button>`)
        .join('')}</div></div>
      <div class="practica-tipos" id="tipos-zona" hidden><p class="nota">Preguntar por:</p><div class="seg-fino" id="zona-tipo"><button data-valor="barrio">Barrio</button><button data-valor="distrito">Distrito</button></div></div>
      <div class="practica-tipos" id="tipos-lugares" hidden>
        <p class="nota">Qué preguntar:</p><div class="chips">${Object.entries(LUG)
          .map(([k, t]) => `<button type="button" class="chip" data-lug="${k}" aria-pressed="${F.lug.includes(k)}">${t}</button>`)
          .join('')}</div>
        <p class="nota">Tipos de lugar:</p><div class="chips">${Object.entries(CATEGORIAS)
          .map(([k, c]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${F.cats.includes(k)}">${c.nombre}</button>`)
          .join('')}</div>
      </div>
    </section>
    <section class="bloque">
      <h2>Filtros <button type="button" class="info-boton" data-info="filtros" aria-label="Más información">i</button></h2>
      <div class="info-texto" id="info-filtros" hidden>Qué calles te pueden salir. <b>Zona</b>: un distrito o un barrio. <b>Dificultad</b>: según lo conocida que es la calle (las largas y las avenidas son fáciles; las cortas, difíciles). En «Más filtros», <b>Repaso de hoy</b> pregunta las calles que tocan repasar para no olvidarlas, y puedes quedarte con las que has fallado o con las avenidas.</div>
      <button type="button" class="tm-fila zona-fila" id="practica-zona"><span>Zona</span><span class="zona-valor">${esc(nombreZona(F.zona))}</span>${icono.flecha(16)}</button>
      <div class="tm-grupo"><span class="tm-etiqueta">Dificultad</span>
        <div class="seg-fino" id="practica-dif">${['Todas', 'Fácil', 'Media', 'Difícil'].map((t, i) => `<button data-valor="${i}" class="${F.dif === i ? 'activo' : ''}">${t}</button>`).join('')}</div>
      </div>
      <details class="tm-detalle" id="practica-mas">
        <summary><span>Más filtros <em class="tm-contador" id="practica-mas-n" hidden></em></span>${icono.abajo(14)}</summary>
        <div class="interruptores">
          <label class="interruptor"><input type="checkbox" data-f="repaso" ${F.repaso ? 'checked' : ''}/><i></i><span>Repaso de hoy <small id="practica-repaso-n"></small></span></label>
          <label class="interruptor"><input type="checkbox" data-f="falladas" ${F.falladas ? 'checked' : ''}/><i></i>Solo calles que he fallado</label>
          <label class="interruptor"><input type="checkbox" data-f="principales" ${F.principales ? 'checked' : ''}/><i></i>Solo avenidas y vías principales</label>
          <label class="interruptor"><input type="checkbox" data-f="zonas" ${F.zonas ? 'checked' : ''}/><i></i>Incluir grupos, polígonos y parques</label>
        </div>
      </details>
      <p class="tm-resumen" id="practica-resumen"></p>
      <button type="button" class="principal grande tm-accion" id="practica-nueva">Nueva pregunta</button>
    </section>`

  p.addEventListener('click', async (e) => {
    const ej = e.target.closest('[data-ejercicio]')
    if (ej) return elegirEjercicio(ej.dataset.ejercicio)
    const ay = e.target.closest('[data-ayuda]')
    if (ay) return ayuda(ay.dataset.ayuda)
    const info = e.target.closest('[data-info]')
    if (info) return ($('#info-filtros').hidden = !$('#info-filtros').hidden)
    for (const [attr, lista] of [
      ['rel', 'rel'],
      ['lug', 'lug'],
      ['cat', 'cats'],
    ]) {
      const ch = e.target.closest(`[data-${attr}]`)
      if (ch) {
        const k = ch.dataset[attr]
        const on = ch.getAttribute('aria-pressed') !== 'true'
        if (!on && F[lista].length === 1) return aviso('Deja al menos una opción marcada')
        F[lista] = on ? [...F[lista], k] : F[lista].filter((x) => x !== k)
        ch.setAttribute('aria-pressed', on)
        guardarF()
        return nueva()
      }
    }
  })
  $('#duelo-abrir').onclick = () => duelo()
  $('#duelo-ayuda').onclick = () =>
    abrirDialogo(
      `<div class="dialogo-cuerpo"><div class="antetitulo">Duelo en directo</div><h2>Cómo se juega</h2><p>Escribid los nombres (de 2 a 6 jugadores). Todos responden las mismas preguntas por turnos en este dispositivo, con 20 segundos por pregunta. Acertar rápido da más puntos. Al final, clasificación.</p></div><div class="dialogo-pie"><div class="derecha"><button class="principal" data-cerrar>Entendido</button></div></div>`,
    )
  $('#practica-zona').onclick = async () => {
    const z = await elegirZona(F.zona)
    if (!z) return
    F.zona = z
    guardarF()
    $('#practica-zona .zona-valor').textContent = nombreZona(z)
    recientes = []
    nueva()
  }
  $('#practica-dif').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    F.dif = +b.dataset.valor
    $$('#practica-dif button').forEach((x) => x.classList.toggle('activo', x === b))
    guardarF()
    nueva()
  }
  $('#zona-tipo').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    F.zonaTipo = b.dataset.valor
    guardarF()
    pintarSubtipos()
    nueva()
  }
  p.addEventListener('change', (e) => {
    const k = e.target.dataset.f
    if (!k) return
    F[k] = e.target.checked
    guardarF()
    pintarSubtipos()
    nueva()
  })
  $('#practica-nueva').onclick = () => nueva()

  mapa.on('click', (e) => {
    if (app.juego?.alTocar && !app.anotando) app.juego.alTocar(e)
  })
  document.addEventListener('keydown', teclas)
  pintarSubtipos()
}

function teclas(e) {
  if (app.pestana !== 'practicar' || !actual || $('#pregunta').hidden || $('#dialogo').open) return
  if (e.target.matches('input, textarea, select')) return
  if (/^[1-4]$/.test(e.key)) {
    $(`#pregunta .opcion[data-op="${+e.key - 1}"]:not(:disabled)`)?.click()
  } else if (e.key === 'Enter' && actual.respondida) {
    e.preventDefault()
    nueva()
  }
}

function pintarSubtipos() {
  $('#tipos-relaciones').hidden = ejercicio !== 'relaciones'
  $('#tipos-zona').hidden = ejercicio !== 'zona'
  $('#tipos-lugares').hidden = ejercicio !== 'lugares'
  $$('#zona-tipo button').forEach((b) => b.classList.toggle('activo', b.dataset.valor === F.zonaTipo))
  const n = ['repaso', 'falladas', 'principales', 'zonas'].filter((k) => F[k]).length
  $('#practica-mas-n').hidden = !n
  $('#practica-mas-n').textContent = n
  const r = pendientesHoy().length
  $('#practica-repaso-n').textContent = r ? `(${r})` : ''
  $('#practica-resumen').textContent = ejercicio === 'lugares' ? '' : `${plural(pool().length, 'calle posible', 'calles posibles')} con estos filtros.`
}

function ayuda(k) {
  const e = EJ[k]
  abrirDialogo(`<div class="dialogo-cuerpo"><div class="antetitulo">Cómo se juega</div><h2>${e.titulo}</h2><p>${e.ayuda}</p></div><div class="dialogo-pie"><div class="derecha"><button class="secundario" data-cerrar>Cerrar</button><button class="principal" id="ayuda-probar">Probar</button></div></div>`)
  $('#ayuda-probar').onclick = () => {
    $('#dialogo').close()
    elegirEjercicio(k)
  }
}

function elegirEjercicio(k) {
  ejercicio = k
  guardado.escribir('practica.ejercicio', k)
  $$('#panel-practicar [data-ejercicio]').forEach((b) => b.classList.toggle('activo', b.dataset.ejercicio === k))
  pintarSubtipos()
  racha = 0
  contador = 0
  nueva()
  app.cerrarMenuMovil()
}

export function alActivar(activo, opciones = {}) {
  if (opciones.zona) {
    F.zona = opciones.zona
    guardarF()
    $('#practica-zona .zona-valor').textContent = nombreZona(F.zona)
    recientes = []
  }
  if (activo) {
    activarEncima(false)
    pintarSubtipos()
    nueva()
  } else terminar()
}

function terminar() {
  if (app.juego?.tipo === 'practicar') app.juego = null
  actual = null
  cerrarTarjeta()
  quitarMarcadores()
  modoJuego(false)
}

// ---------------------------------------------------------------- selección de calles

function pool() {
  const zonaIds = callesDeZona(F.zona)
  let r = zonaIds.filter((c) => (F.zonas ? !/sin nombre/i.test(c.n) && c.l >= 15 : estudiable(c)))
  if (F.dif) r = r.filter((c) => c.dif === F.dif)
  if (F.principales) r = r.filter((c) => c.p)
  if (F.repaso) {
    const s = new Set(pendientesHoy())
    r = r.filter((c) => s.has(c.id))
  }
  if (F.falladas) {
    const s = new Set(falladas())
    r = r.filter((c) => s.has(c.id))
  }
  return r
}

function siguienteCalle(lista) {
  const cand = lista.filter((c) => !recientes.includes(c.id))
  const c = elegir(cand.length ? cand : lista)
  recientes = [c.id, ...recientes].slice(0, Math.min(25, Math.floor(lista.length / 2)))
  return c
}

const DIF = ['', 'fácil', 'media', 'difícil']
const meta = (c) => (c ? `${esc(D.distritos[c.d].nombre)} · dificultad ${DIF[c.dif]}` : esc(nombreZona(F.zona)))

function etiqueta() {
  return `${EJ[ejercicio].titulo} · ${++contador}`
}

function botonesBase(extra = '') {
  return `${extra}<button type="button" class="secundario pequeno" data-a="saltar">Saltar</button><span class="racha derecha">${racha > 1 ? `🔥 ${racha} seguidas` : ''}</span>`
}

function enlazarAcciones(mapaAcciones) {
  $('#pregunta .acciones').onclick = (e) => {
    const b = e.target.closest('[data-a]')
    if (b && mapaAcciones[b.dataset.a]) mapaAcciones[b.dataset.a]()
  }
}

function sinCalles() {
  abrirTarjeta({
    etiqueta: EJ[ejercicio].titulo,
    meta: esc(nombreZona(F.zona)),
    enunciado: 'No hay calles con estos filtros',
    cuerpo: '<p class="nota">Cambia la zona, la dificultad o desactiva algún filtro de «Más filtros».</p>',
    cerrar: terminar,
  })
}

function contarRespuesta(acierto, idCalle) {
  if (idCalle != null) registrar(idCalle, acierto)
  racha = acierto ? racha + 1 : 0
  actual.respondida = true
  const r = $('#pregunta .racha')
  if (r) r.textContent = racha > 1 ? `🔥 ${racha} seguidas` : ''
  pintarSubtipos()
}

function botonSiguiente() {
  acciones(`<button type="button" class="principal pequeno" data-a="siguiente">Siguiente</button><span class="racha derecha">${racha > 1 ? `🔥 ${racha} seguidas` : ''}</span>`)
  enlazarAcciones({ siguiente: nueva })
  $('#pregunta [data-a=siguiente]')?.focus({ preventScroll: true })
}

export async function nueva() {
  if (app.pestana !== 'practicar') return
  limpiarMarcas()
  quitarMarcadores()
  modoJuego(true)
  actual = { tipo: ejercicio }
  app.juego = { tipo: 'practicar', alTocar: null }
  const fn = { nombrar, test, localizar, zona: zonaEj, relaciones, ciegas, ruta, itinerario, lugares }[ejercicio]
  await fn()
}

// ---------------------------------------------------------------- ejercicios

function nombrar() {
  const lista = pool()
  if (!lista.length) return sinCalles()
  const c = siguienteCalle(lista)
  actual.calle = c.id
  marcar('objetivo', [c.id])
  encuadrarCalles([c.id], { maxZoom: 16.6 })
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: meta(c),
    enunciado: '¿Cómo se llama la calle resaltada?',
    cuerpo: `<form class="respuesta-fila" autocomplete="off"><input type="text" id="respuesta" placeholder="Escribe el nombre (con o sin «calle», «avda.»…, sin preocuparte de tildes)" aria-label="Nombre de la calle" autocapitalize="off" spellcheck="false" /><button class="principal">Comprobar</button></form>`,
    acciones: botonesBase(`<button type="button" class="secundario pequeno" data-a="pista">Pista</button>`),
    cerrar: terminar,
  })
  const input = $('#respuesta')
  setTimeout(() => input.focus({ preventScroll: true }), 50)
  let intentos = 0
  $('#pregunta form').onsubmit = (e) => {
    e.preventDefault()
    if (actual.respondida) return nueva()
    const v = input.value.trim()
    if (!v) return
    if (coincideNombre(v, c)) {
      contarRespuesta(true, c.id)
      marcar('correcta', [c.id])
      marcar('objetivo', [])
      resultado(`✓ <span>¡Correcto! Es <b>${esc(c.n)}</b>.</span>`, 'bien')
      input.disabled = true
      botonSiguiente()
      return
    }
    intentos++
    const otras = (D.porClave.get(normalizarRespuesta(v)) || []).filter((i) => i !== c.id)
    if (intentos < 2 && !otras.length) {
      resultado('No es esa. Inténtalo otra vez o pide una pista.', 'mal')
      input.select()
      return
    }
    contarRespuesta(false, c.id)
    input.disabled = true
    if (otras.length) {
      marcar('error', otras.slice(0, 3))
      encuadrarCalles([c.id, ...otras.slice(0, 3)], { maxZoom: 16 })
    }
    resultado(`✗ <span>Era <b>${esc(c.n)}</b>.${otras.length ? ` La que escribiste está en rojo, en ${esc(D.barrios[D.calles[otras[0]].b[0]].nombre)}.` : ''}</span>`, 'mal')
    botonSiguiente()
  }
  enlazarAcciones({
    pista: () => {
      const ac = c.ac.length ? c.ac : c.cr
      if (!ac.length) return resultado('Esta calle no toca ninguna otra en el callejero.', 'info')
      marcar('pista', ac)
      resultado(`Empieza o acaba en: <b>${ac.slice(0, 6).map((i) => esc(D.calles[i].n)).join('</b>, <b>')}</b>.`, 'info')
      input.focus({ preventScroll: true })
    },
    saltar: () => {
      resultado(`Era <b>${esc(c.n)}</b>.`, 'info')
      actual.respondida = true
      racha = 0
      botonSiguiente()
    },
  })
}

/** Cuatro calles cercanas con nombres distintos para usar de opciones. */
function distractores(c, n = 3) {
  const r = cercanasSinCruce(c, n)
  if (r.length < n) {
    const mas = barajar(D.calles.filter((o) => o.d === c.d && estudiable(o) && o.k !== c.k && !r.includes(o.id))).slice(0, n - r.length)
    r.push(...mas.map((o) => o.id))
  }
  return r
}

function test() {
  const lista = pool()
  if (!lista.length) return sinCalles()
  const c = siguienteCalle(lista)
  actual.calle = c.id
  marcar('objetivo', [c.id])
  encuadrarCalles([c.id], { maxZoom: 16.6 })
  const ops = barajar([c.id, ...distractores(c)])
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: meta(c),
    enunciado: '¿Cómo se llama la calle resaltada?',
    cuerpo: opcionesHTML(ops.map((i) => D.calles[i].n)),
    acciones: botonesBase(),
    cerrar: terminar,
  })
  $('#pregunta .opciones').onclick = (e) => {
    const b = e.target.closest('.opcion')
    if (!b || actual.respondida) return
    const i = +b.dataset.op
    const ok = corregirOpciones($('#pregunta .opciones'), i, ops.indexOf(c.id))
    contarRespuesta(ok, c.id)
    if (ok) {
      marcar('objetivo', [])
      marcar('correcta', [c.id])
      resultado(`✓ ¡Correcto!`, 'bien')
    } else {
      marcar('error', [ops[i]])
      encuadrarCalles([c.id, ops[i]], { maxZoom: 16.4 })
      resultado(`✗ <span>Es <b>${esc(c.n)}</b>. En rojo, ${esc(D.calles[ops[i]].n)}.</span>`, 'mal')
    }
    botonSiguiente()
  }
  enlazarAcciones({ saltar: nueva })
}

function localizar() {
  const lista = pool()
  if (!lista.length) return sinCalles()
  const c = siguienteCalle(lista)
  actual.calle = c.id
  // encuadre de la zona (no de la calle, que sería regalarla)
  const zonaBbox = F.zona.tipo === 'barrio' ? D.barrios[F.zona.id].bbox : F.zona.tipo === 'distrito' ? D.distritos[F.zona.id].bbox : D.barrios[c.b[0]].bbox
  encuadrar(zonaBbox, { maxZoom: 16 })
  if (F.zona.tipo === 'todo') marcarBarrio(c.b[0])
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: F.zona.tipo === 'todo' ? `Barrio ${esc(D.barrios[c.b[0]].nombre)}` : meta(c),
    enunciado: `¿Dónde está <em>${esc(c.n)}</em>?`,
    cuerpo: '<p class="nota">Toca la calle en el plano.</p>',
    acciones: botonesBase(`<button type="button" class="secundario pequeno" data-a="pista">Pista</button>`),
    cerrar: terminar,
  })
  app.juego.alTocar = (e) => {
    if (actual.respondida) return
    const id = calleEn(e.point, 12)
    if (id == null) return aviso('Toca justo encima de una calle')
    const ok = id === c.id || D.calles[id].k === c.k
    contarRespuesta(ok, c.id)
    if (ok) {
      marcar('correcta', [id === c.id ? c.id : id, c.id])
      resultado(`✓ <span>¡Bien! Esa es <b>${esc(c.n)}</b>.</span>`, 'bien')
    } else {
      marcar('error', [id])
      marcar('correcta', [c.id])
      const d = distanciaM(centro(D.calles[id]), centro(c))
      encuadrarCalles([c.id, id], { maxZoom: 16.4 })
      resultado(`✗ <span>Tocaste <b>${esc(D.calles[id].n)}</b>. ${esc(c.n)} (en verde) está a unos ${metros(d)}.</span>`, 'mal')
    }
    botonSiguiente()
  }
  enlazarAcciones({
    pista: () => {
      marcar('pista', c.ac.length ? c.ac : c.cr)
      resultado(`Acaba en ${c.ac.slice(0, 4).map((i) => '<b>' + esc(D.calles[i].n) + '</b>').join(', ') || 'otras calles'} (en azul).`, 'info')
    },
    saltar: () => {
      marcar('correcta', [c.id])
      encuadrarCalles([c.id])
      actual.respondida = true
      racha = 0
      botonSiguiente()
    },
  })
}

const centro = (c) => [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2]

function zonaEj() {
  const lista = pool()
  if (!lista.length) return sinCalles()
  const c = siguienteCalle(lista)
  actual.calle = c.id
  marcar('objetivo', [c.id])
  encuadrarCalles([c.id], { maxZoom: 15.5 })
  let ops
  let correctas
  if (F.zonaTipo === 'distrito') {
    ops = barajar([c.d, ...barajar(D.distritos.filter((d) => d.id !== c.d)).slice(0, 3).map((d) => d.id)])
    correctas = [c.d]
  } else {
    const b = D.barrios[c.b[0]]
    const mismos = barajar(D.barrios.filter((x) => x.distrito === b.distrito && !c.b.includes(x.id)))
    const otros = barajar(D.barrios.filter((x) => x.distrito !== b.distrito))
    ops = barajar([b.id, ...[...mismos, ...otros].slice(0, 3).map((x) => x.id)])
    correctas = c.b
  }
  const nombres = ops.map((i) => (F.zonaTipo === 'distrito' ? D.distritos[i].nombre : D.barrios[i].nombre))
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: `dificultad ${DIF[c.dif]}`,
    enunciado: `¿En qué ${F.zonaTipo} está <em>${esc(c.n)}</em>?`,
    cuerpo: opcionesHTML(nombres),
    acciones: botonesBase(),
    cerrar: terminar,
  })
  $('#pregunta .opciones').onclick = (e) => {
    const b = e.target.closest('.opcion')
    if (!b || actual.respondida) return
    const i = +b.dataset.op
    const buena = ops.findIndex((x) => correctas.includes(x))
    const ok = correctas.includes(ops[i])
    corregirOpciones($('#pregunta .opciones'), ok ? i : i, ok ? i : buena)
    contarRespuesta(ok, c.id)
    if (F.zonaTipo === 'barrio') marcarBarrio(c.b[0])
    const txt = F.zonaTipo === 'distrito' ? D.distritos[c.d].nombre : c.b.map((x) => D.barrios[x].nombre).join(', ')
    resultado(ok ? `✓ ¡Correcto! <span>${esc(txt)}</span>` : `✗ <span>Está en <b>${esc(txt)}</b>.</span>`, ok ? 'bien' : 'mal')
    botonSiguiente()
  }
  enlazarAcciones({ saltar: nueva })
}

function relaciones() {
  const lista = pool().filter((c) => c.cr.length)
  if (!lista.length) return sinCalles()
  for (let intento = 0; intento < 40; intento++) {
    const c = siguienteCalle(lista)
    const tipo = elegir(F.rel)
    const unicos = (ids) => [...new Map(ids.filter((i) => estudiable(D.calles[i]) && D.calles[i].k !== c.k).map((i) => [D.calles[i].k, i])).values()]
    const buenas = unicos(tipo === 'paralela' ? c.pa : tipo === 'perpendicular' ? c.pp : tipo === 'cruce' ? c.cr.filter((x) => !c.ac.includes(x)) : c.ac)
    if (!buenas.length) continue
    const ok = elegir(buenas)
    const malas = tipo === 'paralela' ? [...unicos(c.pp), ...cercanasSinCruce(c, 3, Math.random, c.pa)] : cercanasSinCruce(c, 3, Math.random, [...c.pa, ...c.pp])
    const falsas = [...new Map(malas.filter((i) => !buenas.includes(i) && D.calles[i].k !== D.calles[ok].k).map((i) => [D.calles[i].k, i])).values()].slice(0, 3)
    if (falsas.length < 3) continue
    actual.calle = c.id
    const ops = barajar([ok, ...falsas])
    const pregunta = {
      paralela: `¿Qué calle es paralela a ${conArticulo(c)}?`,
      perpendicular: `¿Qué calle es perpendicular a ${conArticulo(c)}?`,
      cruce: `¿Qué calle se cruza con ${conArticulo(c)}?`,
      acaba: `¿En qué calle empieza o acaba ${conArticulo(c)}?`,
    }[tipo]
    marcar('objetivo', [c.id])
    encuadrarCalles([c.id], { maxZoom: 16.2 })
    abrirTarjeta({
      etiqueta: etiqueta(),
      meta: `${REL[tipo]} · ${meta(c)}`,
      enunciado: pregunta.replace(conArticulo(c), `<em>${esc(conArticulo(c))}</em>`),
      cuerpo: opcionesHTML(ops.map((i) => D.calles[i].n)),
      acciones: botonesBase(),
      cerrar: terminar,
    })
    $('#pregunta .opciones').onclick = (e) => {
      const b = e.target.closest('.opcion')
      if (!b || actual.respondida) return
      const i = +b.dataset.op
      const acierto = buenas.includes(ops[i])
      corregirOpciones($('#pregunta .opciones'), i, acierto ? i : ops.indexOf(ok))
      contarRespuesta(acierto, c.id)
      marcar('correcta', acierto ? [ops[i]] : [ok])
      if (!acierto) marcar('error', [ops[i]])
      encuadrarCalles([c.id, ok, ops[i]], { maxZoom: 16.2 })
      resultado(acierto ? '✓ ¡Correcto! Mira en el plano cómo se relacionan.' : `✗ <span>La buena es <b>${esc(D.calles[ok].n)}</b> (en verde).</span>`, acierto ? 'bien' : 'mal')
      botonSiguiente()
    }
    enlazarAcciones({ saltar: nueva })
    return
  }
  sinCalles()
}

function ciegas() {
  const lista = pool().filter((c) => c.ac.filter((i) => D.calles[i].k !== c.k).length >= 2)
  if (!lista.length) return sinCalles()
  const c = siguienteCalle(lista)
  actual.calle = c.id
  const ac = [...new Set(c.ac.filter((i) => D.calles[i].k !== c.k))]
  marcar('pista', ac)
  encuadrarCalles([c.id, ...ac], { maxZoom: 16.3 })
  const ops = barajar([c.id, ...distractores(c)])
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: meta(c),
    enunciado: `Empieza o acaba en ${ac
      .slice(0, 5)
      .map((i) => `<em>${esc(D.calles[i].n)}</em>`)
      .join(', ')
      .replace(/, ([^,]*)$/, ' y $1')}. ¿Qué calle es?`,
    cuerpo: opcionesHTML(ops.map((i) => D.calles[i].n)),
    acciones: botonesBase(),
    cerrar: terminar,
  })
  $('#pregunta .opciones').onclick = (e) => {
    const b = e.target.closest('.opcion')
    if (!b || actual.respondida) return
    const i = +b.dataset.op
    const ok = corregirOpciones($('#pregunta .opciones'), i, ops.indexOf(c.id))
    contarRespuesta(ok, c.id)
    marcar('correcta', [c.id])
    if (!ok) marcar('error', [ops[i]])
    resultado(ok ? '✓ ¡Correcto!' : `✗ <span>Era <b>${esc(c.n)}</b> (en verde).</span>`, ok ? 'bien' : 'mal')
    botonSiguiente()
  }
  enlazarAcciones({ saltar: nueva })
}

async function ruta() {
  const lista = pool().filter((c) => c.l > 40)
  if (!lista.length) return sinCalles()
  const ps = parques()
  const c = siguienteCalle(lista)
  // el parque más cercano a la calle
  const p = ps.map((x) => [distanciaM(x.lngLat, centro(c)), x]).sort((a, b) => a[0] - b[0])[0][1]
  const salida = D.calles[p.calle]
  actual.calle = c.id
  const trazado = []
  marcar('objetivo', [c.id])
  ponerMarcador(p.lngLat, 'marcador-parque', p.parque, 'center')
  encuadrar(unirBbox([c.bb, [...p.lngLat, ...p.lngLat]]), { maxZoom: 16 })
  abrirTarjeta({
    etiqueta: etiqueta(),
    meta: meta(c),
    enunciado: `Del Parque nº ${p.parque} a <em>${esc(c.n)}</em>`,
    cuerpo: `<p class="nota">Sales por <b>${esc(salida.n)}</b>. Toca las calles del recorrido, una a una.</p><p class="nota" id="ruta-pasos"></p>`,
    acciones: `<button type="button" class="secundario pequeno" data-a="deshacer">Deshacer</button><button type="button" class="secundario pequeno" data-a="ver">Ver la ruta</button>${botonesBase()}`,
    cerrar: terminar,
  })
  const pintar = () => {
    marcar('pista', trazado)
    $('#ruta-pasos').innerHTML = trazado.length ? '<b>Tu recorrido:</b> ' + trazado.map((i) => esc(D.calles[i].n)).join(' → ') : ''
  }
  const mostrarOptima = async (miLongitud) => {
    const r = await calcularRuta(p.lngLat, c.id)
    if (!r) return resultado('No se pudo calcular la ruta óptima.', 'info')
    dibujarRuta([r.coords])
    actual.respondida = true
    const texto = r.calles.map((i) => esc(D.calles[i].n)).join(' → ')
    if (miLongitud != null) {
      const ok = miLongitud <= r.calles.length + 1
      contarRespuesta(ok, c.id)
      resultado(`${ok ? '✓ ¡Has llegado!' : '✓ Has llegado, aunque hay un camino más directo.'} <span>Ruta más corta (${metros(r.metros)}): ${texto}</span>`, ok ? 'bien' : 'info')
    } else resultado(`<span>Ruta más corta (${metros(r.metros)}): ${texto}</span>`, 'info')
    botonSiguiente()
  }
  app.juego.alTocar = (e) => {
    if (actual.respondida) return
    const id = calleEn(e.point, 12)
    if (id == null) return
    const ult = trazado.length ? D.calles[trazado[trazado.length - 1]] : salida
    const conecta = id === ult.id || ult.cr.includes(id) || (!trazado.length && (id === salida.id || salida.cr.includes(id)))
    if (!conecta) return aviso(`${D.calles[id].n} no se cruza con ${ult.n}`)
    if (trazado[trazado.length - 1] === id) return
    if (!trazado.length && id !== salida.id) trazado.push(salida.id)
    trazado.push(id)
    pintar()
    if (id === c.id || D.calles[id].k === c.k) mostrarOptima(trazado.length)
    else if (c.cr.includes(id)) {
      trazado.push(c.id)
      pintar()
      mostrarOptima(trazado.length)
    }
  }
  enlazarAcciones({
    deshacer: () => {
      trazado.pop()
      pintar()
    },
    ver: () => mostrarOptima(null),
    saltar: nueva,
  })
}

async function itinerario() {
  abrirTarjeta({ etiqueta: etiqueta(), meta: esc(nombreZona(F.zona)), enunciado: 'Preparando el itinerario…', cerrar: terminar })
  const lista = pool()
  if (!lista.length) return sinCalles()
  const q = await preguntaItinerario(Math.random, lista)
  if (!q) return sinCalles()
  if (app.pestana !== 'practicar' || actual?.tipo !== 'itinerario') return
  const destino = D.calles[q.calles[0]]
  const p = D.lugares[q.ruta.parque]
  actual.calle = destino.id
  marcar('objetivo', [destino.id])
  ponerMarcador(p.lngLat, 'marcador-parque', p.parque, 'center')
  encuadrar(unirBbox([destino.bb, [...p.lngLat, ...p.lngLat]]), { maxZoom: 15.5 })
  abrirTarjeta({
    etiqueta: `${EJ.itinerario.titulo} · ${contador}`,
    meta: meta(destino),
    enunciado: q.enunciado,
    cuerpo: opcionesHTML(q.opciones, true),
    acciones: botonesBase(),
    cerrar: terminar,
  })
  $('#pregunta .enunciado').style.fontSize = '18px'
  $('#pregunta .opciones').onclick = (e) => {
    const b = e.target.closest('.opcion')
    if (!b || actual.respondida) return
    const ok = corregirOpciones($('#pregunta .opciones'), +b.dataset.op, q.correcta)
    contarRespuesta(ok, destino.id)
    dibujarRuta([q.ruta.coords])
    resultado(ok ? '✓ ¡Correcto! Es el recorrido trazado en el plano.' : '✗ El recorrido correcto está trazado en el plano.', ok ? 'bien' : 'mal')
    botonSiguiente()
  }
  enlazarAcciones({ saltar: nueva })
}

function lugares() {
  const enZona = (l) => {
    const c = D.calles[l.calle]
    return F.zona.tipo === 'todo' || (F.zona.tipo === 'distrito' ? c.d === F.zona.id : c.b.includes(F.zona.id))
  }
  const lista = D.lugares.filter((l) => F.cats.includes(l.cat) && enZona(l))
  if (!lista.length) return sinCalles()
  const cand = lista.filter((l) => !recientes.includes('l' + l.id))
  const l = elegir(cand.length ? cand : lista)
  recientes = ['l' + l.id, ...recientes].slice(0, 20)
  const tipo = elegir(F.lug)
  const c = D.calles[l.calle]
  const cat = CATEGORIAS[l.cat]
  const marcador = () => ponerMarcador(l.lngLat, l.cat === 'bomberos' ? 'marcador-parque' : 'marcador-lugar', l.cat === 'bomberos' ? l.parque ?? 'B' : '', 'center')
  const base = { etiqueta: etiqueta(), meta: esc(cat.nombre), acciones: botonesBase(), cerrar: terminar }
  const tras = (ok, txt) => {
    registrarLugar(l.id, ok)
    racha = ok ? racha + 1 : 0
    actual.respondida = true
    resultado(txt, ok ? 'bien' : 'mal')
    botonSiguiente()
  }
  if (tipo === 'que') {
    marcador()
    mapa.flyTo({ center: l.lngLat, zoom: 16.5, duration: 800 })
    const otros = barajar(D.lugares.filter((x) => x.cat === l.cat && x.nombre !== l.nombre)).slice(0, 3)
    const ops = barajar([l, ...otros])
    abrirTarjeta({ ...base, enunciado: `¿Qué ${cat.nombre.toLowerCase().replace(/s( |$)/, '$1').replace(/es$/, '')} es el marcado?`, cuerpo: opcionesHTML(ops.map((x) => x.nombre), true) })
    $('#pregunta .enunciado').textContent = '¿Qué lugar está marcado en el plano?'
    $('#pregunta .opciones').onclick = (e) => {
      const b = e.target.closest('.opcion')
      if (!b || actual.respondida) return
      const ok = corregirOpciones($('#pregunta .opciones'), +b.dataset.op, ops.indexOf(l))
      tras(ok, ok ? '✓ ¡Correcto!' : `✗ <span>Es <b>${esc(l.nombre)}</b>.</span>`)
    }
  } else if (tipo === 'donde') {
    const bb = D.barrios[c.b[0]].bbox
    encuadrar(F.zona.tipo === 'todo' ? D.distritos[c.d].bbox : F.zona.tipo === 'distrito' ? D.distritos[F.zona.id].bbox : bb, { maxZoom: 15.5 })
    abrirTarjeta({ ...base, enunciado: `¿Dónde está <em>${esc(l.nombre)}</em>?`, cuerpo: `<p class="nota">Toca su ubicación en el plano (vale a menos de 150 m). Distrito ${esc(D.distritos[c.d].nombre)}.</p>` })
    app.juego.alTocar = (e) => {
      if (actual.respondida) return
      const d = distanciaM([e.lngLat.lng, e.lngLat.lat], l.lngLat)
      marcador()
      ponerMarcador([e.lngLat.lng, e.lngLat.lat], 'marcador-lugar', '', 'center').getElement().style.background = '#888'
      mapa.flyTo({ center: l.lngLat, zoom: Math.max(mapa.getZoom(), 15.5) })
      tras(d < 150, d < 150 ? `✓ ¡Bien! A ${metros(d)}.` : `✗ Estaba a ${metros(d)} de donde tocaste.`)
    }
  } else if (tipo === 'calle') {
    const ops = barajar([c.id, ...distractores(c)])
    abrirTarjeta({ ...base, enunciado: `¿En qué calle está <em>${esc(l.nombre)}</em>?`, cuerpo: opcionesHTML(ops.map((i) => D.calles[i].n)) })
    $('#pregunta .opciones').onclick = (e) => {
      const b = e.target.closest('.opcion')
      if (!b || actual.respondida) return
      const ok = corregirOpciones($('#pregunta .opciones'), +b.dataset.op, ops.indexOf(c.id))
      marcador()
      marcar('correcta', [c.id])
      mapa.flyTo({ center: l.lngLat, zoom: 16.3 })
      tras(ok, ok ? '✓ ¡Correcto!' : `✗ <span>Está en <b>${esc(c.n)}</b>.</span>`)
    }
  } else {
    const b0 = D.barrios[c.b[0]]
    const ops = barajar([b0.id, ...barajar(D.barrios.filter((x) => x.distrito === b0.distrito && x.id !== b0.id)).slice(0, 3).map((x) => x.id)])
    while (ops.length < 4) ops.push(elegir(D.barrios.filter((x) => !ops.includes(x.id))).id)
    abrirTarjeta({ ...base, enunciado: `¿En qué barrio está <em>${esc(l.nombre)}</em>?`, cuerpo: opcionesHTML(ops.map((i) => D.barrios[i].nombre)) })
    $('#pregunta .opciones').onclick = (e) => {
      const bt = e.target.closest('.opcion')
      if (!bt || actual.respondida) return
      const ok = corregirOpciones($('#pregunta .opciones'), +bt.dataset.op, ops.indexOf(b0.id))
      marcador()
      marcarBarrio(b0.id)
      mapa.flyTo({ center: l.lngLat, zoom: 15 })
      tras(ok, ok ? '✓ ¡Correcto!' : `✗ <span>Está en <b>${esc(b0.nombre)}</b>.</span>`)
    }
  }
  enlazarAcciones({ saltar: nueva })
}
