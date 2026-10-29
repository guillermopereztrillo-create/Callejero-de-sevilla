// Service worker del Callejero de Sevilla: la app funciona sin conexión.
//  · Páginas, código y datos del callejero: se sirven de la caché y se actualizan en segundo plano.
//  · Mapa base (PMTiles, peticiones por rangos) y servicios externos (ortofoto, Street View, cuentas): siempre de la red.

// la lista de archivos de la app y la versión las escribe vite.config.js al construir
const VERSION = '__VERSION__'
const CACHE = 'callejero-' + VERSION
const ESENCIAL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './marca/simbolo.svg', './iconos/icono-192.png', ...__ARCHIVOS__]
const DATOS = [
  'calles.json', 'calles.geojson', 'distritos.geojson', 'barrios.geojson', 'rotulos.geojson', 'termino.geojson', 'fuera.geojson',
  'lugares.geojson', 'bic.geojson', 'carreteras.geojson', 'entradas.geojson', 'peatonales.geojson', 'sentidos.geojson',
  'manzanas.geojson', 'red.json', 'test-oficiales.json', 'fuentes.json',
].map((f) => './datos/' + f)

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ESENCIAL).then(() => c.addAll(DATOS).catch(() => {})))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('callejero-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || r.headers.has('range')) return
  const url = new URL(r.url)
  if (url.origin !== location.origin || url.pathname.endsWith('.pmtiles')) return
  // navegación: la red primero (para tener siempre la última versión), la caché si no hay conexión
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copia))
          return res
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    )
    return
  }
  // resto: caché al momento y actualización en segundo plano
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(r, { ignoreVary: true }).then((guardada) => {
        const red = fetch(r)
          .then((res) => {
            if (res.ok) c.put(r, res.clone())
            return res
          })
          .catch(() => guardada)
        return guardada || red
      }),
    ),
  )
})
