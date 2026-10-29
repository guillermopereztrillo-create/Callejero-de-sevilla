import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** Genera sw.js con la lista de archivos de la app, para que funcione sin conexión. */
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      // código, estilos y las tipografías del alfabeto latino (las de otros alfabetos no hacen falta)
      const archivos = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f) || /latin-(ext-)?wght.*\.woff2$/.test(f))
        .map((f) => './' + f)
        .sort()
      const version = createHash('sha256').update(archivos.join()).digest('hex').slice(0, 10)
      const codigo = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('...__ARCHIVOS__', archivos.map((a) => JSON.stringify(a)).join(', '))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo })
    },
  }
}

// base relativa: la web funciona igual en GitHub Pages, en una subcarpeta o en local
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: true },
})
