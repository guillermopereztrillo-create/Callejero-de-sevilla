import { defineConfig } from 'vite'

// base relativa: la web funciona igual en GitHub Pages, en una subcarpeta o en local
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: true },
})
