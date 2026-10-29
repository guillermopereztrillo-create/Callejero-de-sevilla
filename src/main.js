import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import './estilos.css'

import { cargarDatos, D } from './datos.js'
import { crearMapa, mapa, limpiarMarcas, modoJuego } from './mapa.js'
import { montarCapas } from './capas.js'
import { montarBuscador } from './buscador.js'
import { montarExplorar, alActivar as explorarActivo, explorarBusqueda, mostrarBarrio } from './explorar.js'
import { montarAprender, alActivar as aprenderActivo } from './aprender.js'
import { montarPracticar, alActivar as practicarActivo } from './practicar.js'
import { montarExamen, alActivar as examenActivo } from './examen.js'
import { montarGrupos, alActivar as gruposActivo, abrirRetoDeEnlace } from './grupos.js'
import { montarAnotaciones } from './anotaciones.js'
import { montarDialogos } from './dialogos.js'
import { montarCuenta, pintarAvatar } from './cuenta.js'
import { tutorial } from './tutorial.js'
import { montarVista, cerrarVista } from './vista.js'
import { montarInstalar } from './instalar.js'
import { cerrarFicha } from './ficha.js'
import { iniciarCuentas, abrirAcceso, sesion } from './cuentas.js'
import { app } from './app.js'
import { $, $$, guardado } from './util.js'

const MODULOS = {
  explorar: explorarActivo,
  aprender: aprenderActivo,
  practicar: practicarActivo,
  examen: examenActivo,
  grupos: gruposActivo,
}

// ---------------------------------------------------------------- datos curiosos de la portada

function datosCuriosos() {
  const cs = D.calles
  const santos = cs.filter((c) => /\b(San|Santa|Santo|Santísimo)\b/.test(c.n)).length
  const virgen = cs.filter((c) => /\bVirgen\b/.test(c.n)).length
  const plazas = cs.filter((c) => c.t === 'Plaza').length
  const peat = cs.filter((c) => c.pe === 2).length
  const larga = cs.filter((c) => !c.z && c.t !== 'Autovía' && c.t !== 'Carretera').sort((a, b) => b.l - a.l)[0]
  const corta = cs.filter((c) => !c.z && c.t === 'Calle' && c.l > 5).sort((a, b) => a.l - b.l)[0]
  const masBarrios = [...D.barrios].sort((a, b) => b.calles - a.calles)[0]
  const glorietas = cs.filter((c) => c.t === 'Glorieta').length
  const flores = cs.filter((c) => /\bFlor\b/.test(c.n)).length
  return [
    `Hay ${santos} vías dedicadas a un santo o una santa, y ${virgen} a la Virgen.`,
    `Sevilla tiene ${plazas} plazas y ${glorietas} glorietas en su callejero oficial.`,
    `${peat} calles son peatonales de punta a punta.`,
    `La vía urbana más larga es ${larga.n}: ${(larga.l / 1000).toFixed(1).replace('.', ',')} km.`,
    `${corta.n} mide apenas ${corta.l} metros.`,
    `El barrio con más calles es ${masBarrios.nombre}, con ${masBarrios.calles}.`,
    `${flores} calles llevan el nombre de una flor.`,
    `El callejero tiene ${cs.length.toLocaleString('es-ES')} vías repartidas en ${D.barrios.length} barrios y ${D.distritos.length} distritos.`,
  ].map((t) => '¿Sabías que…? ' + t)
}

function rotarDatos() {
  const lista = datosCuriosos()
  const el = $('#inicio-dato')
  let i = Math.floor(Math.random() * lista.length)
  const poner = () => {
    el.style.opacity = 0
    setTimeout(() => {
      el.textContent = lista[i++ % lista.length]
      el.style.opacity = 1
    }, 300)
  }
  poner()
  return setInterval(poner, 7000)
}

// ---------------------------------------------------------------- portada

function paddingPortada() {
  const ini = $('#inicio')
  if (ini.hidden || innerWidth <= 820) return mapa.setPadding({ left: 0, right: 0, top: 0, bottom: 0 })
  const lat = $('#lateral').offsetWidth
  mapa.setPadding({ left: Math.max(0, $('.inicio-panel').offsetWidth - lat), right: 0, top: 0, bottom: 0 })
}

function entrar(conTutorial = true) {
  const ini = $('#inicio')
  ini.classList.add('saliendo')
  document.body.classList.remove('en-portada')
  mapa.easeTo({ padding: { left: 0, right: 0, top: 0, bottom: 0 }, zoom: 13, duration: 900 })
  setTimeout(() => {
    ini.hidden = true
    if (conTutorial && !guardado.leer('tutorialVisto', false)) tutorial()
  }, 520)
  guardado.escribir('entrado', true)
}

// ---------------------------------------------------------------- pestañas y panel

function montarPestanas() {
  $$('.pestanas [role=tab]').forEach((b) => (b.onclick = () => cambiarPestana(b.dataset.pestana)))
  $('.pestanas').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const tabs = $$('.pestanas [role=tab]')
    const i = tabs.findIndex((t) => t.dataset.pestana === app.pestana)
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    cambiarPestana(n.dataset.pestana)
    n.focus()
  })
}

function cambiarPestana(nombre, opciones = {}) {
  const anterior = app.pestana
  app.pestana = nombre
  $$('.pestanas [role=tab]').forEach((b, i) => {
    const sel = b.dataset.pestana === nombre
    b.setAttribute('aria-selected', sel)
    b.tabIndex = sel ? 0 : -1
    if (sel) $('.pestanas-indicador').style.transform = `translateX(${i * 100}%)`
  })
  $$('.panel-lateral').forEach((p) => (p.hidden = p.dataset.panel !== nombre))
  if (anterior !== nombre) {
    cerrarFicha()
    cerrarVista()
    MODULOS[anterior]?.(false)
    if (!app.juego) {
      limpiarMarcas()
      modoJuego(false)
    }
  }
  MODULOS[nombre]?.(true, opciones)
  guardado.escribir('pestana', nombre)
  if (opciones.cerrarMenu !== false && innerWidth <= 820 && (opciones.zona || opciones.barrio)) cerrarMenuMovil()
}

function cerrarMenuMovil() {
  $('#app').classList.remove('menu-abierto')
  $('#boton-menu').setAttribute('aria-expanded', 'false')
}

function montarLateral() {
  $('#boton-menu').onclick = () => {
    const abierto = $('#app').classList.toggle('menu-abierto')
    $('#boton-menu').setAttribute('aria-expanded', abierto)
  }
  $('#velo').onclick = cerrarMenuMovil
  $('#lateral-minimizar').onclick = () => {
    $('#app').classList.add('lateral-oculto')
    $('#chip-lateral').hidden = false
    setTimeout(() => mapa.resize(), 320)
  }
  $('#chip-lateral').onclick = () => {
    $('#app').classList.remove('lateral-oculto')
    $('#chip-lateral').hidden = true
    setTimeout(() => mapa.resize(), 320)
  }
}

// ---------------------------------------------------------------- arranque

async function arrancar() {
  app.cambiarPestana = cambiarPestana
  app.cerrarMenuMovil = cerrarMenuMovil
  montarDialogos()
  const progreso = $('#inicio-progreso')
  let pDatos = 0
  let pMapa = 0
  const pintar = () => (progreso.style.width = `${Math.round(((pDatos + pMapa) / 2) * 100)}%`)

  const promDatos = cargarDatos((p) => {
    pDatos = p
    pintar()
  })
  const promMapa = crearMapa('mapa').then((m) => {
    pMapa = 1
    pintar()
    return m
  })
  try {
    await Promise.all([promDatos, promMapa])
  } catch (e) {
    console.error(e)
    $('#inicio-entrar-texto').textContent = 'No se pudo cargar el plano. Recarga la página.'
    return
  }
  paddingPortada()
  addEventListener('resize', paddingPortada)
  const intervalo = rotarDatos()

  montarLateral()
  montarPestanas()
  montarCapas()
  montarBuscador(explorarBusqueda)
  montarExplorar()
  montarAprender()
  montarPracticar()
  montarExamen()
  montarGrupos()
  montarAnotaciones()
  montarCuenta()
  pintarAvatar()
  montarVista()
  montarInstalar()
  iniciarCuentas().catch((e) => console.warn(e))

  const boton = $('#inicio-entrar')
  boton.disabled = false
  $('#inicio-entrar-texto').textContent = 'Acceder al plano'
  $('.inicio-carga').classList.add('listo')
  boton.onclick = () => {
    clearInterval(intervalo)
    entrar()
  }
  // con sesión iniciada la portada saluda; sin ella, ofrece crear cuenta o entrar
  const c = sesion()
  if (c) {
    $('.inicio-nota').innerHTML = `Hola, <b>${c.nombre.replace(/[<&>]/g, '')}</b>. Tu progreso te espera.`
    $('.inicio-cuenta').hidden = true
  }
  $('#inicio-crear').onclick = () => {
    clearInterval(intervalo)
    entrar(false)
    abrirAcceso('crear')
  }
  $('#inicio-entrar-cuenta').onclick = () => {
    clearInterval(intervalo)
    entrar(false)
    abrirAcceso('entrar')
  }

  const inicial = guardado.leer('pestana', 'explorar')
  cambiarPestana(MODULOS[inicial] ? inicial : 'explorar')

  // enlaces directos: #reto=…, #calle=123, #barrio=4, #plano
  const hash = location.hash.slice(1)
  if (hash) {
    clearInterval(intervalo)
    $('#inicio').hidden = true
    document.body.classList.remove('en-portada')
    mapa.setPadding({ left: 0, right: 0, top: 0, bottom: 0 })
    const [k, v] = hash.split('=')
    if (k === 'reto') abrirRetoDeEnlace(v)
    else if (k === 'barrio' && D.barrios[+v]) mostrarBarrio(+v)
    else if (k === 'calle' && D.calles[+v]) explorarBusqueda({ tipo: 'calle', id: +v })
  }
}

arrancar()
