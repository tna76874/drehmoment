// Build des Agenten-Werkzeugkastens: eine einzige ES-Modul-Datei für Node (dist/kit/drehmoment-kit.mjs).
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
const version = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`

export default defineConfig({
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/kit.js',
    outDir: (process.env.DM_OUT || 'dist') + '/kit',
    emptyOutDir: false,
    target: 'node18',
    minify: true,
    rollupOptions: { output: { entryFileNames: 'drehmoment-kit.mjs', inlineDynamicImports: true, format: 'es' } },
  },
})
