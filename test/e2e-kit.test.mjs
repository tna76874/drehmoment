// Build-Test: der fertige Werkzeugkasten (DM_DIST/kit/drehmoment-kit.mjs) und die ausgelieferten Dateien.
//   node test/e2e-kit.test.mjs   (vorher: npm run build bzw. DM_DIST=<Build>)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { detectCards } from '../src/lib/detect.js'
import { cardRotation } from '../src/lib/cardcode.js'
import { DIST } from './helpers/web.mjs'

let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const OUT = 'test/out/kit'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const KIT = join(DIST, 'kit/drehmoment-kit.mjs')
const kit = (...a) => execFileSync(process.execPath, [KIT, ...a], { encoding: 'utf8' })
const pages = (f) => (readFileSync(f, 'latin1').match(/\/Type \/Page\b/g) || []).length

t('Werkzeugkasten vorhanden und startet', () => { assert.ok(existsSync(KIT)); assert.match(kit(), /Drehmoment-Werkzeugkasten/) })
t('cards 1-3 -> 3 Seiten', () => { kit('cards', '1-3', OUT + '/a.pdf'); assert.equal(pages(OUT + '/a.pdf'), 3) })
t('alte Aufrufe mit --per-page/--backs funktionieren weiter (werden ignoriert)', () => {
  kit('cards', '4-5', '--per-page', '6', '--backs', OUT + '/b.pdf'); assert.equal(pages(OUT + '/b.pdf'), 2)
  kit('cards', '6-6', '--backs', OUT + '/c.pdf'); assert.equal(pages(OUT + '/c.pdf'), 1)
})
t('vom Werkzeugkasten gedruckte Karten werden erkannt (A oben -> A)', () => {
  execFileSync('pdftoppm', ['-r', '30', '-gray', OUT + '/a.pdf', OUT + '/a'])
  const files = readdirSync(OUT).filter((f) => f.startsWith('a-') && f.endsWith('.pgm')).sort()
  assert.equal(files.length, 3)
  files.forEach((f, i) => {
    const b = readFileSync(join(OUT, f)), head = b.toString('latin1', 0, 40).split(/\s+/), w = +head[1], h = +head[2]
    const off = b.length - w * h, rgba = new Uint8ClampedArray(w * h * 4)
    for (let k = 0; k < w * h; k++) { rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = b[off + k]; rgba[k * 4 + 3] = 255 }
    const r = detectCards(rgba, w, h)
    assert.equal(r.length, 1); assert.equal(r[0].card, i + 1); assert.equal(r[0].answer, 'A', `Karte ${i + 1} (Versatz ${cardRotation(i + 1)})`)
  })
})
t('ausgelieferte Dateien: llms.txt aktuell, Service Worker kennt nur vorhandene Dateien, kein Markenname', () => {
  assert.equal(readFileSync(join(DIST, 'llms.txt'), 'utf8'), readFileSync('public/llms.txt', 'utf8'))
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8'), list = JSON.parse(sw.match(/\[[^\]]*\]/)[0])
  for (const f of list) if (f !== './') assert.ok(existsSync(join(DIST, f)), 'sw.js: ' + f)
  const BRAND = new RegExp(['pli', 'ckers?'].join(''), 'i')
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  const hits = walk(DIST).filter((f) => BRAND.test(f) || (!/\.(png|ico)$/.test(f) && BRAND.test(readFileSync(f, 'latin1'))))
  assert.deepEqual(hits, [])
})
console.log(`\n✓ ${ok} Build-/Werkzeugkasten-Tests bestanden`)
