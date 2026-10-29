// Vista de la calle: Street View de Google Maps en una ventana pequeña sobre el plano

import { D, geometriaCalle } from './datos.js'
import { mapa, ponerMarcador, distanciaM } from './mapa.js'
import { $, icono } from './util.js'

const PASO = 25 // metros que se avanza o retrocede por la calle
let v = null
let marcador = null

/** Recorrido de la calle como una sola lista de puntos con su distancia acumulada. */
function recorrido(lineas, cerca) {
  // la parte de la calle más cercana al punto pedido
  let linea = lineas[0] || []
  if (cerca) {
    let md = Infinity
    for (const l of lineas)
      for (const c of l) {
        const d = distanciaM(c, cerca)
        if (d < md) {
          md = d
          linea = l
        }
      }
  }
  const pts = [{ c: linea[0], m: 0 }]
  for (let i = 1; i < linea.length; i++) pts.push({ c: linea[i], m: pts[i - 1].m + distanciaM(linea[i - 1], linea[i]) })
  return pts
}

function puntoEn(pts, m) {
  m = Math.max(0, Math.min(pts[pts.length - 1].m, m))
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].m >= m) {
      const a = pts[i - 1]
      const b = pts[i]
      const t = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m)
      return { c: [a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t], rumbo: rumbo(a.c, b.c) }
    }
  }
  const n = pts.length
  return { c: pts[n - 1].c, rumbo: n > 1 ? rumbo(pts[n - 2].c, pts[n - 1].c) : 0 }
}

function rumbo(a, b) {
  const f1 = (a[1] * Math.PI) / 180
  const f2 = (b[1] * Math.PI) / 180
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function mostrar() {
  const p = puntoEn(v.pts, v.m)
  v.c = p.c
  if (!v.giroManual) v.rumbo = p.rumbo
  const [lng, lat] = p.c
  const h = Math.round(v.rumbo)
  $('#vista-iframe').src = `https://www.google.com/maps?layer=c&cbll=${lat.toFixed(6)},${lng.toFixed(6)}&cbp=12,${h},0,0,0&hl=es&output=svembed`
  $('#vista [data-google]').href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}&heading=${h}`
  marcador?.remove()
  marcador = ponerMarcador(p.c, 'marcador-vista', '', 'center')
  marcador.setRotation?.(h)
  if (!mapa.getBounds().contains(p.c)) mapa.easeTo({ center: p.c })
}

/** Abre la vista de la calle en el punto más cercano a `cerca` (o en el centro de la calle). */
export async function verCalle(id, cerca = null, titulo = null) {
  const c = D.calles[id]
  const lineas = await geometriaCalle(id)
  if (!lineas.length) return
  const pts = recorrido(lineas, cerca)
  let m = pts[pts.length - 1].m / 2
  if (cerca) {
    let md = Infinity
    for (const p of pts) {
      const d = distanciaM(p.c, cerca)
      if (d < md) {
        md = d
        m = p.m
      }
    }
  }
  v = { id, pts, m, rumbo: 0, giroManual: false }
  const el = $('#vista')
  el.hidden = false
  el.classList.remove('minimizada')
  $('#vista-titulo').textContent = titulo || c.n
  mostrar()
}

export function cerrarVista() {
  $('#vista').hidden = true
  $('#vista-iframe').src = 'about:blank'
  marcador?.remove()
  marcador = null
  v = null
}

export function montarVista() {
  const el = $('#vista')
  el.innerHTML = `
    <div class="ventana-barra">
      <span class="ventana-titulo" id="vista-titulo">Vista de la calle</span>
      <span style="margin-left:auto"></span>
      <button type="button" class="redondo" data-v="grande" aria-label="Ampliar" title="Ampliar">⤢</button>
      <button type="button" class="redondo" data-v="min" aria-label="Minimizar" title="Minimizar">${icono.menos(12)}</button>
      <button type="button" class="redondo" data-v="cerrar" aria-label="Cerrar" title="Cerrar">${icono.cerrar(12)}</button>
    </div>
    <div class="vista-cuerpo"><iframe id="vista-iframe" title="Street View de la calle" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="vista-mandos">
      <button type="button" class="secundario pequeno" data-v="atras" title="Retroceder por la calle">◀ Atrás</button>
      <button type="button" class="secundario pequeno" data-v="adelante" title="Avanzar por la calle">Adelante ▶</button>
      <button type="button" class="secundario pequeno" data-v="izq" aria-label="Mirar a la izquierda" title="Mirar a la izquierda">⟲</button>
      <button type="button" class="secundario pequeno" data-v="der" aria-label="Mirar a la derecha" title="Mirar a la derecha">⟳</button>
      <a class="enlace" data-google href="https://www.google.com/maps" target="_blank" rel="noopener">Abrir en Google Maps</a>
    </div>`
  el.onclick = (e) => {
    const a = e.target.closest('[data-v]')?.dataset.v
    if (!a || (!v && a !== 'cerrar')) return
    if (a === 'cerrar') return cerrarVista()
    if (a === 'min') return el.classList.toggle('minimizada')
    if (a === 'grande') return el.classList.toggle('grande')
    if (a === 'adelante' || a === 'atras') {
      // hacia donde se mira: si se mira al revés de la calle, «adelante» es retroceder en la geometría
      const p = puntoEn(v.pts, v.m)
      const alReves = Math.abs(((v.rumbo - p.rumbo + 540) % 360) - 180) > 90
      const signo = (a === 'adelante' ? 1 : -1) * (alReves ? -1 : 1)
      v.m = Math.max(0, Math.min(v.pts[v.pts.length - 1].m, v.m + signo * PASO))
      return mostrar()
    }
    if (a === 'izq' || a === 'der') {
      v.giroManual = true
      v.rumbo = (v.rumbo + (a === 'der' ? 45 : -45) + 360) % 360
      return mostrar()
    }
  }
}

