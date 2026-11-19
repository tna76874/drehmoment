// Browser-Test „Antworten fest“ (seit 0.5): Die simulierte Kamera zeigt Karte 5 abwechselnd mit A oben und mit B oben
// (wie ein Kind, das umentscheidet). Erwartet:
//  - die erste erfasste Antwort bleibt fest, auch über mehrere Wechsel hinweg
//  - „Ändern erlauben“ übernimmt genau EINE Änderung, danach ist automatisch wieder alles fest
//  - „Abbrechen“ sperrt sofort wieder
//   node test/e2e-lock.test.mjs   (vorher: npm run build bzw. DM_DIST=<Build>)
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { cardFace } from '../src/lib/qr.js'
import { serve } from './helpers/web.mjs'

const OUT = 'test/out/e2e-lock'
await mkdir(OUT, { recursive: true })
const { base: BASE, close } = await serve()

// ---- Video: 5 Bilder/s, je 3 s „A oben“ (0°) und „B oben“ (270°), läuft in Schleife
const W = 640, H = 360, FPS = 5, PHASE = 3 * FPS
function frameFor(deg) {
  const Y = new Uint8Array(W * H).fill(170), m = cardFace(5).m, size = m.length, quiet = 4, total = size + 2 * quiet, mod = 7
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), cx = W / 2, cy = H / 2
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy, u = (dx * cos + dy * sin) / mod + total / 2, v = (-dx * sin + dy * cos) / mod + total / 2
    if (u < 0 || v < 0 || u >= total || v >= total) continue
    const mx = Math.floor(u) - quiet, my = Math.floor(v) - quiet
    Y[y * W + x] = mx >= 0 && my >= 0 && mx < size && my < size && m[my][mx] ? 20 : 240
  }
  return Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(Y), Buffer.alloc((W * H) / 2, 128)])
}
const fA = frameFor(0), fB = frameFor(270)
await writeFile(OUT + '/camera.y4m', Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`), ...Array(PHASE).fill(fA), ...Array(PHASE).fill(fB)]))

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${OUT}/camera.y4m`] })
let passed = 0
const ok = (msg) => { passed++; console.log('  ✓', msg) }
const errors = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, permissions: ['camera'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Beispielquiz laden' }).click()
  await page.getByRole('button', { name: /^Starten:/ }).first().click()
  await page.getByRole('button', { name: /Los geht/ }).click()
  await page.waitForURL(/#\/live\//)
  await page.getByRole('button', { name: 'Nächste Frage' }).click()
  await page.getByRole('button', { name: 'Scannen' }).click()
  await page.getByText('Erfasst', { exact: true }).waitFor()
  await page.getByLabel('Antworten zeigen').check() // nur für den Test: Antwort an der Kachel ablesen
  const answer = () => page.locator('.tile span.absolute').first().innerText().catch(() => '')
  const toggle = page.locator('[data-test=change-toggle]')
  await page.waitForFunction(() => /^[AB]$/.test(document.querySelector('.tile span.absolute')?.textContent?.trim() || ''), null, { timeout: 30000 })
  const first = (await answer()).trim()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  await page.waitForTimeout(13000) // > 2 volle Wechsel A/B
  assert.equal((await answer()).trim(), first, 'erste Antwort bleibt fest')
  ok(`erfasste Antwort (${first}) bleibt fest, obwohl die Karte 13 s lang abwechselnd A/B zeigt`)

  // Hintergrund als RGB (Tailwind liefert oklch/oklab) – über ein Canvas umrechnen
  const rgbOf = (e) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 1, 1); c.fillStyle = getComputedStyle(e).backgroundColor; c.fillRect(0, 0, 1, 1); return Array.from(c.getImageData(0, 0, 1, 1).data.slice(0, 3)) }
  const bgOff = await toggle.evaluate(rgbOf)
  await toggle.click()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await page.waitForTimeout(400) // Farbübergang
  const bgOn = await toggle.evaluate(rgbOf), [r, g, b] = bgOn
  assert.ok(r > 200 && g > 160 && b < 120 && bgOff[0] < 100, `„Ändern“ ist deutlich gelb hervorgehoben: ${bgOff} -> ${bgOn}`)
  await page.screenshot({ path: OUT + '/aendern-an.png' })
  const other = first === 'A' ? 'B' : 'A'
  await page.waitForFunction((o) => document.querySelector('.tile span.absolute')?.textContent?.trim() === o, other, { timeout: 15000 })
  await page.waitForFunction(() => document.querySelector('[data-test=change-toggle]').getAttribute('aria-pressed') === 'false', null, { timeout: 3000 })
  await page.getByText('wieder fest', { exact: false }).first().waitFor({ timeout: 3000 })
  ok(`„Ändern erlauben“: Änderung ${first} → ${other} übernommen, danach automatisch wieder fest`)
  await page.waitForTimeout(13000)
  assert.equal((await answer()).trim(), other, 'nach der Änderung wieder fest')
  ok('danach keine weitere Änderung (13 s abwechselnd A/B)')

  await toggle.click(); assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  await page.waitForTimeout(13000)
  assert.equal((await answer()).trim(), other, 'Abbrechen sperrt sofort')
  ok('„Abbrechen“ sperrt sofort wieder')
  await page.screenshot({ path: OUT + '/fest.png' })
  assert.deepEqual(errors, [])
  ok('keine JavaScript-Fehler')
} finally { await browser.close(); close() }
console.log(`\n✓ ${passed} Prüfungen „Antworten fest“ bestanden`)
