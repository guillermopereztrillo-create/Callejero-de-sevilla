// Pestaña Examen: examen real, contrarreloj, mis preguntas y test a tu medida

import { D } from './datos.js'
import { activarEncima } from './mapa.js'
import { oficiales, generarPregunta, TIPOS_PREGUNTA, callesDeZona } from './preguntas.js'
import { iniciarTest, testsGuardados, reanudar, descartar, testActivo } from './test.js'
import { P, guardar } from './progreso.js'
import { elegirZona, nombreZona, abrirDialogo, cerrarDialogo, confirmar } from './dialogos.js'
import { app } from './app.js'
import { $, $$, esc, icono, guardado, barajar, plural, aviso, descargarArchivo, generador } from './util.js'

const TM = Object.assign(
  {
    numero: 20,
    origen: 'mixto',
    zona: { tipo: 'todo' },
    tipos: Object.keys(TIPOS_PREGUNTA),
    correccion: 'inmediata',
    penalizacion: 0.3333,
    maxFallos: '',
    tiempo: '',
    aleatorio: true,
    mezclar: false,
    falladas: false,
    nuevas: false,
  },
  guardado.leer('testMedida', {}),
)
const guardarTM = () => guardado.escribir('testMedida', TM)

export function montarExamen() {
  pintar()
  document.addEventListener('test-cerrado', () => app.pestana === 'examen' && pintarGuardados())
}

export function alActivar(activo) {
  if (activo) {
    activarEncima(false)
    pintarGuardados()
    resumen()
  }
}

function pintar() {
  const p = $('#panel-examen')
  p.innerHTML = `
    <section class="bloque">
      <h2>Examen</h2>
      <div class="modos-examen">
        <button type="button" class="modo-examen modo-real" id="examen-real">
          <span class="modo-icono">${icono.doc(22)}</span>
          <span class="modo-texto"><strong>Examen real</strong><small>60 preguntas (10 de reserva), sin mapa ni pistas, 60 minutos y corrección al final; cada fallo resta ⅓. Como el día del examen.</small></span>
        </button>
        <button type="button" class="modo-examen modo-crono" id="contrarreloj">
          <span class="modo-icono">${icono.reloj(22)}</span>
          <span class="modo-texto"><strong>Contrarreloj 60 s</strong><small id="contrarreloj-record">${P.contrarreloj ? `Tu récord: ${P.contrarreloj} aciertos. ` : ''}60 segundos para acertar todas las que puedas. Reta a tus amigos.</small></span>
        </button>
        <button type="button" class="modo-examen modo-mias" id="mis-preguntas">
          <span class="modo-icono">${icono.mas(22)}</span>
          <span class="modo-texto"><strong>Mis preguntas</strong><small>Crea tus propias preguntas de test y compártelas con un archivo.</small></span>
        </button>
      </div>
    </section>
    <section class="bloque" id="test-guardados" hidden></section>
    <section class="bloque">
      <h2>Test a tu medida <button type="button" class="info-boton" data-info="tm" aria-label="Más información">i</button></h2>
      <div class="info-texto" id="info-tm" hidden>Un test con tus reglas: cuántas preguntas, de qué zona y de qué tipos. <b>Oficiales</b>: solo preguntas de exámenes reales del Ayuntamiento de Sevilla (${oficiales().length} disponibles). <b>Con generadas</b>: si no hay bastantes oficiales, se completa con preguntas creadas con calles reales y el mismo formato (marcadas «no oficial»). <b>Solo generadas</b>: todas nuevas.</div>
      <div class="tm-grupo"><span class="tm-etiqueta">Preguntas</span>
        <div class="seg-fino" id="tm-numero">${[10, 20, 30, 50, 'todas'].map((n) => `<button data-valor="${n}" class="${TM.numero == n ? 'activo' : ''}">${n === 'todas' ? 'Todas' : n}</button>`).join('')}</div></div>
      <div class="tm-grupo"><span class="tm-etiqueta">Origen</span>
        <div class="seg-fino" id="tm-origen">${[
          ['oficiales', 'Oficiales'],
          ['mixto', 'Con generadas'],
          ['generadas', 'Solo generadas'],
        ]
          .map(([v, t]) => `<button data-valor="${v}" class="${TM.origen === v ? 'activo' : ''}">${t}</button>`)
          .join('')}</div></div>
      <button type="button" class="tm-fila zona-fila" id="tm-zona"><span>Zona</span><span class="zona-valor">${esc(nombreZona(TM.zona))}</span>${icono.flecha(16)}</button>
      <details class="tm-detalle"><summary><span>Tipos de pregunta</span>${icono.abajo(14)}</summary>
        <div class="chips" id="tm-tipos">${Object.entries(TIPOS_PREGUNTA)
          .map(([k, t]) => `<button type="button" class="chip" data-tipo="${k}" aria-pressed="${TM.tipos.includes(k)}">${t}</button>`)
          .join('')}</div>
      </details>
      <details class="tm-detalle"><summary><span>Ajustes del test</span>${icono.abajo(14)}</summary>
        <div class="tm-grupo"><span class="tm-etiqueta">Corrección</span>
          <div class="seg-fino" id="tm-correccion"><button data-valor="inmediata" class="${TM.correccion === 'inmediata' ? 'activo' : ''}">Al momento</button><button data-valor="final" class="${TM.correccion === 'final' ? 'activo' : ''}">Al final</button></div></div>
        <label class="tm-fila"><span>Cada fallo</span><span class="tm-select"><select id="tm-penalizacion">${[
          ['0', 'No resta'],
          ['0.5', 'Resta ½'],
          ['0.3333', 'Resta ⅓'],
          ['0.25', 'Resta ¼'],
        ]
          .map(([v, t]) => `<option value="${v}" ${+v === +TM.penalizacion ? 'selected' : ''}>${t}</option>`)
          .join('')}</select></span></label>
        <label class="tm-fila"><span>Fallos máximos</span><input class="tm-numero" type="number" inputmode="numeric" id="tm-max-fallos" min="1" max="60" placeholder="Sin límite" value="${TM.maxFallos}" /></label>
        <label class="tm-fila"><span>Tiempo (min)</span><input class="tm-numero" type="number" inputmode="numeric" id="tm-tiempo" min="1" max="180" placeholder="Sin límite" value="${TM.tiempo}" /></label>
        <div class="interruptores" style="margin-top:8px">
          <label class="interruptor"><input type="checkbox" data-tm="aleatorio" ${TM.aleatorio ? 'checked' : ''}/><i></i>Orden aleatorio de preguntas</label>
          <label class="interruptor"><input type="checkbox" data-tm="mezclar" ${TM.mezclar ? 'checked' : ''}/><i></i>Mezclar el orden de las respuestas</label>
          <label class="interruptor"><input type="checkbox" data-tm="falladas" ${TM.falladas ? 'checked' : ''}/><i></i>Solo preguntas que he fallado</label>
          <label class="interruptor"><input type="checkbox" data-tm="nuevas" ${TM.nuevas ? 'checked' : ''}/><i></i>Solo preguntas que no he hecho</label>
        </div>
      </details>
      <p class="tm-resumen" id="tm-resumen"></p>
    </section>
    <section class="bloque" id="historial-tests"></section>
    <div class="botones-test"><button class="principal grande" id="test-empezar">Empezar test</button></div>`

  const seg = (id, k, num = false) =>
    ($(id).onclick = (e) => {
      const b = e.target.closest('button')
      if (!b) return
      TM[k] = num && b.dataset.valor !== 'todas' ? +b.dataset.valor : b.dataset.valor
      $$(id + ' button').forEach((x) => x.classList.toggle('activo', x === b))
      guardarTM()
      resumen()
    })
  seg('#tm-numero', 'numero', true)
  seg('#tm-origen', 'origen')
  seg('#tm-correccion', 'correccion')
  $('#tm-tipos').onclick = (e) => {
    const b = e.target.closest('[data-tipo]')
    if (!b) return
    const on = b.getAttribute('aria-pressed') !== 'true'
    if (!on && TM.tipos.length === 1) return aviso('Deja al menos un tipo marcado')
    TM.tipos = on ? [...TM.tipos, b.dataset.tipo] : TM.tipos.filter((x) => x !== b.dataset.tipo)
    b.setAttribute('aria-pressed', on)
    guardarTM()
    resumen()
  }
  $('#tm-zona').onclick = async () => {
    const z = await elegirZona(TM.zona)
    if (!z) return
    TM.zona = z
    $('#tm-zona .zona-valor').textContent = nombreZona(z)
    guardarTM()
    resumen()
  }
  $('#tm-penalizacion').onchange = (e) => {
    TM.penalizacion = +e.target.value
    guardarTM()
  }
  $('#tm-max-fallos').onchange = (e) => {
    TM.maxFallos = e.target.value
    guardarTM()
  }
  $('#tm-tiempo').onchange = (e) => {
    TM.tiempo = e.target.value
    guardarTM()
  }
  p.addEventListener('change', (e) => {
    const k = e.target.dataset.tm
    if (k) {
      TM[k] = e.target.checked
      guardarTM()
      resumen()
    }
  })
  p.addEventListener('click', (e) => {
    if (e.target.closest('[data-info]')) $('#info-tm').hidden = !$('#info-tm').hidden
  })
  $('#test-empezar').onclick = empezarMedida
  $('#examen-real').onclick = examenReal
  $('#contrarreloj').onclick = () => contrarreloj()
  $('#mis-preguntas').onclick = misPreguntas
  resumen()
  pintarGuardados()
}

function oficialesFiltradas() {
  let ps = oficiales().filter((p) => TM.tipos.includes(p.tipo))
  if (TM.zona.tipo !== 'todo') {
    const ids = new Set(callesDeZona(TM.zona).map((c) => c.id))
    ps = ps.filter((p) => p.calles.some((i) => ids.has(i)))
  }
  if (TM.falladas) ps = ps.filter((p) => P.preguntas[p.id] && !P.preguntas[p.id].ok)
  if (TM.nuevas) ps = ps.filter((p) => !P.preguntas[p.id])
  return ps
}

function resumen() {
  const n = oficialesFiltradas().length
  const pedidas = TM.numero === 'todas' ? (TM.origen === 'generadas' ? 60 : n) : TM.numero
  let t
  if (TM.origen === 'oficiales') t = `${plural(n, 'pregunta oficial', 'preguntas oficiales')} con estos filtros${n < pedidas ? ' · el test tendrá solo esas' : ''}.`
  else if (TM.origen === 'mixto') t = `${plural(n, 'pregunta oficial', 'preguntas oficiales')} · ${n >= pedidas ? 'no hará falta generar ninguna' : `el test se completa con ${pedidas - n} generadas`}.`
  else t = `${pedidas} preguntas generadas con calles reales de ${nombreZona(TM.zona)}.`
  const el = $('#tm-resumen')
  if (el) el.textContent = t
  pintarHistorial()
}

async function generar(n, tipos, zona, rnd = Math.random) {
  const r = []
  const usar = tipos.filter((t) => t !== 'otras')
  if (!usar.length) return r
  let fallos = 0
  while (r.length < n && fallos < n * 3) {
    const tipo = usar[r.length % usar.length]
    const p = await generarPregunta(tipo, { rnd, zona })
    if (p && !r.some((x) => x.enunciado === p.enunciado && x.opciones.join() === p.opciones.join())) r.push(p)
    else fallos++
  }
  return barajar(r, rnd)
}

async function empezarMedida() {
  if (testActivo()) return aviso('Ya tienes un test abierto')
  const boton = $('#test-empezar')
  boton.disabled = true
  boton.textContent = 'Preparando…'
  try {
    let of = oficialesFiltradas()
    const pedidas = TM.numero === 'todas' ? (TM.origen === 'generadas' ? 60 : of.length) : TM.numero
    if (TM.aleatorio) of = barajar(of)
    let preguntas = []
    if (TM.origen !== 'generadas') preguntas = of.slice(0, pedidas)
    if (TM.origen !== 'oficiales' && preguntas.length < pedidas) preguntas.push(...(await generar(pedidas - preguntas.length, TM.tipos, TM.zona)))
    if (TM.aleatorio) preguntas = barajar(preguntas)
    if (!preguntas.length) return aviso('No hay preguntas con estos filtros')
    iniciarTest({
      titulo: 'Test a tu medida',
      preguntas,
      correccion: TM.correccion,
      penalizacion: +TM.penalizacion,
      maxFallos: +TM.maxFallos || null,
      tiempo: +TM.tiempo ? +TM.tiempo * 60 : null,
      mezclarRespuestas: TM.mezclar,
      guardar: true,
    })
    app.cerrarMenuMovil()
  } finally {
    boton.disabled = false
    boton.textContent = 'Empezar test'
  }
}

async function examenReal() {
  if (testActivo()) return aviso('Ya tienes un test abierto')
  if (
    !(await confirmar(
      'Examen real',
      '60 preguntas con tres opciones: 50 puntuables y 10 de reserva. 60 minutos, sin mapa ni pistas, corrección al final y cada fallo resta un tercio. Las preguntas oficiales salen primero; si faltan, se completa con generadas (marcadas «no oficial»).',
      'Empezar',
      'Ahora no',
    ))
  )
    return
  let ps = barajar(oficiales())
  if (ps.length < 60) ps.push(...(await generar(60 - ps.length, ['acceso', 'relacion', 'zona', 'lugar', 'itinerario'], { tipo: 'todo' })))
  ps = ps.slice(0, 60)
  // las de reserva al final, como en el cuadernillo
  const reservas = ps.filter((p) => p.reserva).slice(0, 10)
  const normales = ps.filter((p) => !reservas.includes(p))
  const extra = normales.slice(50, 50 + 10 - reservas.length)
  ps = [...normales.slice(0, 50), ...reservas, ...extra].slice(0, 60)
  iniciarTest({ titulo: 'Examen real', preguntas: ps, correccion: 'final', penalizacion: 0.3333, tiempo: 60 * 60, sinMapa: true, reservas: 10, guardar: true })
  app.cerrarMenuMovil()
}

export async function contrarreloj(semilla = null, reto = null) {
  if (testActivo()) return aviso('Ya tienes un test abierto')
  const rnd = semilla ? generador(semilla) : Math.random
  const ps = [...barajar(oficiales(), rnd).slice(0, 25), ...(await generar(35, ['acceso', 'relacion', 'zona', 'lugar', 'peatonal'], { tipo: 'todo' }, rnd))]
  const seed = semilla || Math.random().toString(36).slice(2, 10)
  iniciarTest({
    titulo: reto ? `Reto de ${reto}` : 'Contrarreloj 60 s',
    preguntas: barajar(ps, rnd),
    correccion: 'inmediata',
    contrarreloj: true,
    tiempo: 60,
    penalizacion: 0,
    record: P.contrarreloj,
    alTerminar: (r) => {
      if (r.bien > (P.contrarreloj || 0)) {
        P.contrarreloj = r.bien
        guardar()
        const el = $('#contrarreloj-record')
        if (el) el.textContent = `Tu récord: ${r.bien} aciertos. 60 segundos para acertar todas las que puedas. Reta a tus amigos.`
      }
    },
    compartir: (r) => {
      const nombre = P.nombre || 'un amigo'
      const url = `${location.origin}${location.pathname}#reto=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ t: 'cr', s: seed, n: nombre, p: r.bien })))))}`
      const texto = `He acertado ${r.bien} calles de Sevilla en 60 segundos. ¿Me superas? ${url}`
      if (navigator.share) navigator.share({ text: texto }).catch(() => {})
      else navigator.clipboard?.writeText(texto).then(() => aviso('Enlace del reto copiado'))
    },
  })
  app.cerrarMenuMovil()
}

function pintarGuardados() {
  const el = $('#test-guardados')
  if (!el) return
  const ts = testsGuardados()
  el.hidden = !ts.length
  el.innerHTML = `<h2>Tests a medias</h2>${ts
    .map(
      (t) => `<div class="fila-zona" style="padding:8px 0"><span><b>${esc(t.cfg.titulo)}</b><br><small class="nota">${t.respuestas.filter((r) => r != null).length} de ${t.cfg.preguntas.length} respondidas · ${new Date(t.fecha).toLocaleDateString('es-ES')}</small></span>
      <span class="cuenta" style="display:flex;gap:6px"><button type="button" class="secundario pequeno" data-reanudar="${t.id}">Seguir</button><button type="button" class="redondo" data-descartar="${t.id}" aria-label="Descartar">${icono.cerrar(12)}</button></span></div>`,
    )
    .join('')}`
  el.onclick = (e) => {
    const r = e.target.closest('[data-reanudar]')
    if (r) {
      reanudar(r.dataset.reanudar)
      app.cerrarMenuMovil()
    }
    const d = e.target.closest('[data-descartar]')
    if (d) {
      descartar(d.dataset.descartar)
      pintarGuardados()
    }
  }
}

function pintarHistorial() {
  const el = $('#historial-tests')
  if (!el) return
  const h = guardado.leer('historial', [])
  el.hidden = !h.length
  el.innerHTML = `<h2>Tus últimos tests</h2><table class="tabla-progreso">${h
    .slice(0, 6)
    .map((x) => `<tr><td>${esc(x.titulo)}<br><small class="nota">${new Date(x.fecha).toLocaleDateString('es-ES')} · ${x.bien}/${x.total} bien</small></td><td><b>${x.nota.toLocaleString('es-ES')}</b></td></tr>`)
    .join('')}</table>`
}

// ---------------------------------------------------------------- mis preguntas

function propias() {
  return guardado.leer('misPreguntas', [])
}

function misPreguntas() {
  const ps = propias()
  const d = abrirDialogo(
    `<div class="dialogo-cuerpo">
      <div class="antetitulo">Mis preguntas</div>
      <h2>${ps.length ? plural(ps.length, 'pregunta propia', 'preguntas propias') : 'Crea tus preguntas'}</h2>
      <p>Escribe preguntas con el formato del examen (tres opciones, una correcta). Se guardan en este navegador; para compartirlas, expórtalas a un archivo y que tus compañeros lo importen.</p>
      <div id="lista-propias">${ps
        .map(
          (p, i) => `<div class="revision"><div class="test-num"><b>${i + 1}.</b><span class="etiqueta-mini">${esc(TIPOS_PREGUNTA[p.tipo] || 'Otras')}</span></div><p style="margin:4px 0">${esc(p.enunciado)}</p><small class="nota">Correcta: ${esc(p.opciones[p.correcta])}</small>
          <div class="acciones"><button type="button" class="secundario pequeno" data-editar="${i}">Editar</button><button type="button" class="secundario pequeno" data-borrar="${i}">Borrar</button></div></div>`,
        )
        .join('')}</div>
    </div>
    <div class="dialogo-pie" style="flex-wrap:wrap">
      <button class="secundario pequeno" id="mp-importar">${icono.subir(16)} Importar</button>
      ${ps.length ? `<button class="secundario pequeno" id="mp-exportar">${icono.descargar(16)} Exportar</button>` : ''}
      <div class="derecha">
        ${ps.length ? '<button class="secundario" id="mp-test">Hacer test</button>' : ''}
        <button class="principal" id="mp-nueva">Nueva pregunta</button>
      </div>
    </div>`,
    { ancho: true },
  )
  $('#mp-nueva').onclick = () => editarPregunta()
  d.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => editarPregunta(+b.dataset.editar)))
  d.querySelectorAll('[data-borrar]').forEach(
    (b) =>
      (b.onclick = () => {
        const l = propias()
        l.splice(+b.dataset.borrar, 1)
        guardado.escribir('misPreguntas', l)
        misPreguntas()
      }),
  )
  if ($('#mp-exportar')) $('#mp-exportar').onclick = () => descargarArchivo('mis-preguntas-callejero.json', JSON.stringify({ app: 'callejero-sevilla', preguntas: propias() }, null, 1))
  $('#mp-importar').onclick = () => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.json,application/json'
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text())
        const nuevas = (j.preguntas || []).filter((p) => p.enunciado && p.opciones?.length === 3 && p.correcta >= 0)
        guardado.escribir('misPreguntas', [...propias(), ...nuevas])
        aviso(`${plural(nuevas.length, 'pregunta importada', 'preguntas importadas')}`)
        misPreguntas()
      } catch {
        aviso('No se pudo leer el archivo')
      }
    }
    inp.click()
  }
  if ($('#mp-test'))
    $('#mp-test').onclick = () => {
      cerrarDialogo()
      iniciarTest({
        titulo: 'Mis preguntas',
        preguntas: barajar(propias()).map((p, i) => ({ ...p, id: p.id || 'propia-' + i, propia: true, oficial: false })),
        correccion: 'inmediata',
        penalizacion: 0.3333,
      })
    }
}

function editarPregunta(i = null) {
  const p = i != null ? propias()[i] : { enunciado: '', opciones: ['', '', ''], correcta: 0, tipo: 'acceso' }
  const d = abrirDialogo(
    `<form class="dialogo-cuerpo" id="form-pregunta">
      <div class="antetitulo">${i != null ? 'Editar' : 'Nueva'} pregunta</div>
      <label for="mp-enun">Enunciado</label><textarea id="mp-enun" required placeholder="A la calle … se accede desde:">${esc(p.enunciado)}</textarea>
      ${[0, 1, 2]
        .map(
          (k) => `<label for="mp-op${k}">Opción ${'abc'[k]} <input type="radio" name="mp-ok" value="${k}" ${p.correcta === k ? 'checked' : ''} aria-label="Correcta"/> correcta</label><input type="text" id="mp-op${k}" required value="${esc(p.opciones[k])}" />`,
        )
        .join('')}
      <label for="mp-tipo">Tipo</label><select id="mp-tipo">${Object.entries(TIPOS_PREGUNTA)
        .map(([k, t]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${t}</option>`)
        .join('')}</select>
    </form>
    <div class="dialogo-pie"><div class="derecha"><button class="secundario" id="mp-volver">Volver</button><button class="principal" id="mp-guardar">Guardar</button></div></div>`,
    { ancho: true },
  )
  $('#mp-volver').onclick = misPreguntas
  $('#mp-guardar').onclick = () => {
    const f = $('#form-pregunta')
    if (!f.reportValidity()) return
    const nueva = {
      id: p.id || 'propia-' + Date.now().toString(36),
      enunciado: $('#mp-enun').value.trim(),
      opciones: [0, 1, 2].map((k) => $('#mp-op' + k).value.trim()),
      correcta: +(d.querySelector('input[name=mp-ok]:checked')?.value ?? 0),
      tipo: $('#mp-tipo').value,
    }
    const l = propias()
    if (i != null) l[i] = nueva
    else l.push(nueva)
    guardado.escribir('misPreguntas', l)
    misPreguntas()
  }
}
