// Instalar como app (PWA): service worker, botón «Instalar como app» y ayuda para iPhone/iPad

import { abrirDialogo, cerrarDialogo } from './dialogos.js'
import { $, aviso, copiar } from './util.js'

let aviso_instalar = null
let registro = null

// ---------------------------------------------------------------- actualizaciones
// En iPhone/iPad la app instalada se recupera de memoria y no vuelve a pedir la página:
// al abrirla o volver a ella se comprueba si hay una versión publicada más nueva.

/** Versión que se está usando: los nombres de los archivos de código y estilos cambian con cada versión. */
const huella = (doc) =>
  [...doc.querySelectorAll('script[type=module][src*="assets/"], link[rel=stylesheet][href*="assets/"]')]
    .map((e) => e.getAttribute('src') || e.getAttribute('href'))
    .sort()
    .join('|')
const versionActual = () => huella(document)

async function hayVersionNueva() {
  const actual = versionActual()
  if (!actual || !navigator.onLine) return false
  try {
    const html = await fetch(import.meta.env.BASE_URL + 'index.html?comprobar=' + Date.now(), { cache: 'no-store' }).then((r) => r.text())
    const nueva = huella(new DOMParser().parseFromString(html, 'text/html'))
    return !!nueva && nueva !== actual
  } catch {
    return false
  }
}

let comprobando = false
async function comprobar() {
  if (comprobando || document.hidden) return
  comprobando = true
  registro?.update().catch(() => {})
  if (await hayVersionNueva()) avisarVersionNueva()
  comprobando = false
}

function actualizarYa() {
  // se recarga sin pasar por la caché del navegador
  location.replace(location.pathname + '?v=' + Date.now() + location.hash)
}

function avisarVersionNueva() {
  // en la portada se actualiza directamente; si se está estudiando, se pregunta
  if (!document.querySelector('#inicio')?.hidden) return actualizarYa()
  if (document.querySelector('#aviso-version')) return
  const el = document.createElement('div')
  el.id = 'aviso-version'
  el.className = 'aviso-version'
  el.innerHTML = '<span>Hay una versión nueva de la app.</span><button type="button" class="principal pequeno">Actualizar</button>'
  el.querySelector('button').onclick = actualizarYa
  document.body.append(el)
}

function vigilarActualizaciones() {
  // limpia el «?v=» que deja la recarga
  if (/[?&]v=\d+/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash)
  comprobar()
  document.addEventListener('visibilitychange', () => !document.hidden && comprobar())
  addEventListener('focus', comprobar)
  addEventListener('pageshow', (e) => e.persisted && comprobar())
  setInterval(comprobar, 20 * 60 * 1000)
}

const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function montarInstalar() {
  if ('serviceWorker' in navigator && isSecureContext) {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' })
      .then((reg) => (registro = reg))
      .catch(() => {})
  }
  vigilarActualizaciones()
  const boton = $('#inicio-instalar')
  if (instalada()) return
  // Android, Chrome y Edge avisan de que la app se puede instalar
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    aviso_instalar = e
    boton.hidden = false
  })
  addEventListener('appinstalled', () => {
    boton.hidden = true
    aviso('¡Listo! Ya tienes el Callejero entre tus aplicaciones')
  })
  // en iPhone/iPad no hay aviso: se explica cómo añadirla a la pantalla de inicio
  if (esIOS()) boton.hidden = false
  boton.onclick = instalar
}

export async function instalar() {
  if (aviso_instalar) {
    aviso_instalar.prompt()
    await aviso_instalar.userChoice.catch(() => {})
    aviso_instalar = null
    return
  }
  ayuda()
}

/** Cómo instalarla en cada dispositivo (y enlace para compartirla con los compañeros). */
export function ayuda() {
  const ios = esIOS()
  const d = abrirDialogo(
    `<div class="dialogo-portada"><img src="${import.meta.env.BASE_URL}marca/logo.webp" alt="" width="84" height="84" /></div>
    <div class="dialogo-cuerpo">
      <div class="antetitulo">Instalar como app</div>
      <h2>Tenla en tu pantalla de inicio</h2>
      ${
        ios
          ? `<ol class="pasos-instalar">
              <li>Abre esta página en <b>Safari</b>.</li>
              <li>Pulsa el botón <b>Compartir</b> <span class="icono-compartir" aria-hidden="true">⬆︎</span> (arriba en el iPad, abajo en el iPhone).</li>
              <li>Elige <b>«Añadir a pantalla de inicio»</b> y pulsa <b>Añadir</b>.</li>
            </ol>`
          : `<ol class="pasos-instalar">
              <li><b>Android</b>: en Chrome, menú <b>⋮</b> → <b>«Instalar aplicación»</b> o «Añadir a pantalla de inicio».</li>
              <li><b>Ordenador</b>: en Chrome o Edge, el icono de instalar en la barra de direcciones, o menú → «Instalar Callejero de Sevilla».</li>
              <li><b>iPhone o iPad</b>: en Safari, <b>Compartir</b> → «Añadir a pantalla de inicio».</li>
            </ol>`
      }
      <p>Se abre a pantalla completa, como cualquier aplicación, y funciona aunque no tengas conexión (salvo el satélite y la vista de la calle).</p>
      <p>Para compartirla con tus compañeros, mándales este enlace:</p>
      <div class="respuesta-fila"><input type="text" readonly value="${location.origin}${location.pathname}" aria-label="Enlace de la app" /><button class="secundario" id="copiar-enlace">Copiar</button></div>
    </div>
    <div class="dialogo-pie"><div class="derecha">${navigator.share ? '<button class="secundario" id="compartir-app">Compartir</button>' : ''}<button class="principal" data-cerrar>Entendido</button></div></div>`,
  )
  const url = location.origin + location.pathname
  d.querySelector('#copiar-enlace').onclick = () => copiar(url)
  const c = d.querySelector('#compartir-app')
  if (c)
    c.onclick = () =>
      navigator
        .share({ title: 'Callejero de Sevilla', text: 'Estudia el callejero de Sevilla para la oposición de bombero, sobre el plano:', url })
        .then(cerrarDialogo)
        .catch(() => {})
}
