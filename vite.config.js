import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
const version = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`

/**
 * Erzeugt beim Build einen Service Worker, der ALLE Dateien des Builds
 * (inkl. Worker, jsPDF-Chunks, public/) vorab cacht -> nach dem ersten Laden komplett offline.
 */
function serviceWorker() {
  return {
    name: 'drehmoment-sw',
    apply: 'build',
    // erst NACH dem Schreiben: nur Dateien vorab cachen, die es wirklich gibt
    // (sonst scheitert die Installation, z. B. an CSS-only-Chunks, die Vite wieder entfernt)
    writeBundle(options, bundle) {
      const out = options.dir
      const files = new Set(['./', ...Object.keys(bundle).filter((f) => existsSync(join(out, f)))])
      for (const f of readdirSync(new URL('./public', import.meta.url))) files.add(f)
      files.delete('sw.js')
      const src = readFileSync(new URL('./src/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify([...files].sort()))
      writeFileSync(join(out, 'sw.js'), src)
    },
  }
}

/**
 * Lizenzen (GPLv3 §0 „Appropriate Legal Notices“, Fremdlizenzen der mitgelieferten Bibliotheken):
 *  - LICENSE.txt               = LICENSE dieses Projekts
 *  - third-party-licenses.txt  = Lizenztexte aller Pakete, die im Build stecken (automatisch ermittelt)
 * Beide werden im Build erzeugt (und offline gecacht) und vom Dev-Server ausgeliefert.
 */
function licenses() {
  const root = new URL('./', import.meta.url)
  const seen = new Set(Object.keys(pkg.dependencies || {}).filter((d) => !d.startsWith('@tailwindcss/')))
  const pkgOf = (id) => /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replace(/\\/g, '/'))?.[1]
  function thirdParty() {
    const out = ['Drehmoment enthält die folgenden Bibliotheken. Ihre Lizenzen gelten für den jeweiligen Teil.', '']
    for (const name of [...seen].sort()) {
      const dir = new URL(`./node_modules/${name}/`, root)
      let meta = {}
      try { meta = JSON.parse(readFileSync(new URL('package.json', dir))) } catch { continue }
      const lic = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f))
      out.push('='.repeat(78), `${name} ${meta.version || ''} – ${typeof meta.license === 'string' ? meta.license : meta.license?.type || 'siehe Text'}`, meta.homepage || '', '='.repeat(78))
      out.push(lic ? readFileSync(new URL(lic, dir), 'utf8').trim() : '(kein Lizenztext im Paket enthalten)', '')
    }
    return out.join('\n')
  }
  const own = () => readFileSync(new URL('./LICENSE', root), 'utf8')
  return {
    name: 'drehmoment-licenses',
    moduleParsed(info) { const p = pkgOf(info.id); if (p) seen.add(p) },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: own() })
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: thirdParty() })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = (req.url || '').split('?')[0]
        if (!u.endsWith('/LICENSE.txt') && !u.endsWith('/third-party-licenses.txt')) return next()
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end(u.endsWith('LICENSE.txt') ? own() : thirdParty())
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), licenses(), serviceWorker()],
  // relative Pfade -> der statische Build läuft unter jedem Unterpfad (z. B. GitHub Pages)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Rechtliches (Hilfe → „Über Drehmoment & Lizenz“): Urheber und Quellcode-Adresse aus package.json ("author", "repository")
    __APP_AUTHOR__: JSON.stringify(typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '') : pkg.author?.name || ''),
    __APP_SOURCE__: JSON.stringify(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url?.replace(/^git\+/, '') || ''),
  },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1400 /* MathJax (nur für PDF-Formeln, lazy) */ },
  server: { host: true, allowedHosts: true },
})
