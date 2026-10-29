// Utilidades comunes

export const $ = (s, r = document) => r.querySelector(s)
export const $$ = (s, r = document) => [...r.querySelectorAll(s)]

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Crea un elemento a partir de HTML. */
export function h(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

// Guardado local (todo el progreso vive en este navegador)
const PREFIJO = 'callejero.'
export const guardado = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem(PREFIJO + clave)
      return v == null ? defecto : JSON.parse(v)
    } catch {
      return defecto
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor))
    } catch {}
  },
  borrar(clave) {
    try {
      localStorage.removeItem(PREFIJO + clave)
    } catch {}
  },
  todo() {
    const r = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k.startsWith(PREFIJO)) r[k.slice(PREFIJO.length)] = localStorage.getItem(k)
      }
    } catch {}
    return r
  },
}

/** Generador pseudoaleatorio con semilla (mulberry32), para retos reproducibles. */
export function generador(semilla = Date.now()) {
  let a = typeof semilla === 'string' ? [...semilla].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 7) : semilla >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function barajar(arr, rnd = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const elegir = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)]

export function metros(m) {
  if (m >= 1000) return (m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' km'
  return Math.round(m).toLocaleString('es-ES') + ' m'
}

export function numero(n, dec = 0) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: dec })
}

export function plural(n, uno, varios) {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`
}

export function tiempo(seg) {
  seg = Math.max(0, Math.round(seg))
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

let temporizadorAviso
export function aviso(texto, ms = 2600) {
  const el = document.getElementById('aviso')
  el.textContent = texto
  el.hidden = false
  clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => (el.hidden = true), ms)
}

export function debounce(fn, ms = 120) {
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

export function hoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sumarDias(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diasEntre(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    aviso('Copiado al portapapeles')
  } catch {
    prompt('Copia este texto:', texto)
  }
}

export function descargarArchivo(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Iconos SVG reutilizados
const trazo = (d, t = 20) =>
  `<svg viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const icono = {
  lapiz: (t) => trazo('M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4', t),
  lista: (t) => trazo('M4 5h3v3H4zM4 11h3v3H4zM4 17h3v3H4zM10 6.5h10M10 12.5h10M10 18.5h10', t),
  pin: (t) => trazo('M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', t),
  mapa: (t) => trazo('M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15', t),
  cruce: (t) => trazo('M5 4v16M11 4v16M3 14h18', t),
  ojo: (t) => trazo('M2 12s4-7 10-7c1.6 0 3 .5 4.3 1.2M22 12s-4 7-10 7c-1.6 0-3-.5-4.3-1.2M4 20 20 4M9.5 14.5a3 3 0 0 1 5-5', t),
  ruta: (t) => trazo('M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h7M18 9v6a3 3 0 0 1-3 3H8', t),
  brujula: (t) => trazo('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z', t),
  flecha: (t) => trazo('M9 6l6 6-6 6', t),
  abajo: (t) => trazo('M7 10l5 5 5-5', t),
  cerrar: (t = 14) => trazo('M6 6l12 12M18 6 6 18', t),
  menos: (t = 14) => trazo('M6 12h12', t),
  doc: (t) => trazo('M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14.5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19.5V5A1.5 1.5 0 0 1 7 3.5ZM9 8h6M9 12h6M9 16h3', t),
  reloj: (t) => trazo('M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 2M10 2.5h4M19 6l1.5-1.5', t),
  mas: (t) => trazo('M12 5v14M5 12h14', t),
  duelo: (t) => trazo('M14.5 5.5 18 9l-8 8H6.5V13.5l8-8ZM13 7l4 4M4 20h7', t),
  personas: (t) => trazo('M12 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c.5-2.8 2.4-4.5 5-4.5s4.5 1.7 5 4.5M5.5 10.5a2.3 2.3 0 1 0 0-4.6M2.5 17c.3-2 1.4-3.2 3-3.6M18.5 10.5a2.3 2.3 0 1 1 0-4.6M21.5 17c-.3-2-1.4-3.2-3-3.6', t),
  enlace: (t) => trazo('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', t),
  calle: (t) => trazo('M7 3 5 21M17 3l2 18M12 4v3M12 10.5v3M12 17v3', t),
  edificio: (t) => trazo('M3 21h18M5 21V10l5-3v14M10 21V4l6 3v14M16 21v-9l3 1.5V21', t),
  barrio: (t) => trazo('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', t),
  descargar: (t) => trazo('M12 4v11M7 10l5 5 5-5M5 20h14', t),
  subir: (t) => trazo('M12 20V9M7 14l5-5 5 5M5 4h14', t),
  papelera: (t) => trazo('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', t),
  regla: (t) => trazo('M3 17 17 3l4 4L7 21l-4-4ZM7 13l2 2M10 10l2 2M13 7l2 2', t),
  texto: (t) => trazo('M5 6V4h14v2M12 4v16M9 20h6', t),
  mano: (t) => trazo('M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10V5.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 14a1.6 1.6 0 0 1 2.6-1.8L8 14', t),
  luna: (t) => trazo('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z', t),
}

/** Distancia en metros entre dos [lon, lat]. */
export function distanciaM(a, b) {
  const R = 6371000
  const f1 = (a[1] * Math.PI) / 180
  const f2 = (b[1] * Math.PI) / 180
  const df = f2 - f1
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
