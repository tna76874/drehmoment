// Browser-Test Scanner (seit 0.5) gegen den geprüften Build:
//  - Analyse „Schnell“ (960 px) -> Bildmitte wird zusätzlich in voller Auflösung gelesen: winzige Karten in der Mitte
//  - gedrehte UND alte Karten gemischt, alle mit richtiger Antwort
//  - beim Erfassen KEINE Antwortfarben/-buchstaben (Kamerabild + Kacheln), stattdessen Freude-Animation
//  - „Antworten zeigen“ (Lehrkraft) zeigt sie bewusst
//  - Kartenseite: nur noch 1 Format, keine Rückseite, PDF = 1 Seite pro Karte, Vorschau = Druck
//   node test/e2e-scan.test.mjs   (vorher: npm run build bzw. DM_DIST=<Build>)
import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { cardFace, cardMatrix, cardPath } from '../src/lib/qr.js'
import { serve, cameraFrame, ANSWER_RGB } from './helpers/web.mjs'

const OUT = 'test/out/e2e-scan'
await mkdir(OUT, { recursive: true })
const { base: BASE, close } = await serve()

// ---------------------------------------------------------------- Kamerabild
const ROT = { 0: 'A', 90: 'D', 180: 'C', 270: 'B' }
const truth = {}
const cam = cameraFrame()
let n = 1
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++, n++) {
  const base = [0, 90, 180, 270][(n * 7) % 4]
  truth[n] = ROT[base]
  cam.draw(n <= 2 ? cardMatrix(n) : cardFace(n).m, 170 + col * 310, 130 + row * 230, 6.5, base + ((n % 5) - 2) * 5) // 1, 2 = alte Karten (Druck bis 0.4)
}
// winzig in der Bildmitte: nur in voller Kamera-Auflösung lesbar
const TINY = { 20: 0, 21: 90, 22: 270 }
Object.entries(TINY).forEach(([c, deg], i) => { truth[c] = ROT[deg]; cam.draw(cardFace(+c).m, 640, 130 + i * 230, 1.9, deg) })
const COUNT = Object.keys(truth).length
await cam.save(OUT + '/camera.y4m')

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${OUT}/camera.y4m`] })
let passed = 0
const ok = (msg) => { passed++; console.log('  ✓', msg) }
const errors = []
const near = (r, g, b, [R, G, B], d = 45) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < d

try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, permissions: ['camera'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Beispielquiz laden' }).click()
  await page.getByText('Beispiel: Photosynthese').waitFor()
  const back = page.url()
  await page.goto(BASE + '#/data')
  await page.getByRole('button', { name: 'Schnell' }).click()
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).prefs.resolution), 960)
  ok('Analyse auf „Schnell“ (960 px) gestellt')

  // ---- Kartenseite
  await page.goto(BASE + '#/cards')
  await page.getByText('Antwortkarten', { exact: true }).first().waitFor()
  const body = await page.locator('main').innerText()
  assert.ok(!/Karten pro A4-Seite|Rückseite bedrucken|kompakt/.test(body), 'keine alten Optionen')
  assert.match(body, /Eine große Karte pro A4-Seite/)
  const nums = page.locator('input[type=number]')
  await nums.nth(0).fill('1'); await nums.nth(1).fill('3')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF herunterladen (3 Karten)' }).click()])
  const pdf = (await readFile(await dl.path())).toString('latin1')
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 3, '3 Karten = 3 Seiten')
  // Vorschau zeigt denselben (gedrehten) Code wie der Druck
  const previewPaths = await page.locator('main svg path').evaluateAll((els) => els.map((e) => e.getAttribute('d')))
  for (const c of [1, 2, 3]) assert.ok(previewPaths.includes(cardPath(c).d), `Vorschau Karte ${c} = Druck`)
  await page.screenshot({ path: OUT + '/karten.png', fullPage: true })
  ok('Kartenseite: ein Format, keine Rückseite, PDF 1 Seite/Karte, Vorschau = Druck')

  // ---- Scannen
  await page.goto(back); await page.getByText('Beispiel: Photosynthese').waitFor()
  await page.getByRole('button', { name: /^Starten:/ }).first().click()
  await page.getByRole('button', { name: /Los geht/ }).click()
  await page.waitForURL(/#\/live\//)
  await page.getByRole('button', { name: 'Nächste Frage' }).click() // 4 Optionen
  await page.getByRole('button', { name: 'Scannen' }).click()
  await page.getByText('Erfasst', { exact: true }).waitFor()
  await page.locator('.tile-joy').first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: OUT + '/animation.png' })
  ok('Freude-Animation erscheint beim Erfassen')
  // während des Scannens: Kacheln einheitlich, kein Buchstabe
  const tiles = async () => page.locator('.tile').evaluateAll((els) => els.map((e) => ({ bg: getComputedStyle(e).backgroundColor, text: e.innerText })))
  await page.waitForFunction((c) => (document.querySelector('.text-3xl.font-extrabold')?.textContent || '').replace(/\s/g, '').startsWith(c + '/'), COUNT, { timeout: 45000 })
  await page.waitForTimeout(600) // Übergänge abwarten (Kacheln blenden 300 ms ein)
  const ts = await tiles()
  assert.equal(ts.length, COUNT)
  assert.equal(new Set(ts.map((x) => x.bg)).size, 1, 'alle erfassten Kacheln gleich gefärbt: ' + [...new Set(ts.map((x) => x.bg))])
  for (const x of ts) assert.ok(!/(^|\s)[ABCD](\s|$)/.test(x.text), 'kein Antwortbuchstabe in der Kachel: ' + JSON.stringify(x.text))
  ok(`alle ${COUNT} Karten erfasst (inkl. 3 winziger in der Bildmitte + 2 alter Karten); Kacheln verraten nichts`)

  // Kamerabild groß: Markierungen ohne Antwortfarben
  await page.getByRole('button', { name: 'Kamera groß' }).click()
  let seen = 0
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(250)
    const px = await page.evaluate(() => { const c = document.querySelector('canvas'); return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) })
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue
      for (const [L, rgb] of Object.entries(ANSWER_RGB)) assert.ok(!near(px[i], px[i + 1], px[i + 2], rgb), `Antwortfarbe ${L} im Kamerabild`)
      if (near(px[i], px[i + 1], px[i + 2], [143, 122, 255], 60)) seen++
    }
  }
  assert.ok(seen > 200, 'Markierungen werden gezeichnet (einheitliche Farbe)')
  await page.screenshot({ path: OUT + '/kamera.png' })
  ok('Kamerabild: Karten markiert, aber nie in Antwortfarben')

  // Lehrkraft schaltet bewusst „Antworten zeigen“ ein
  await page.getByRole('button', { name: 'Übersicht' }).click()
  await page.getByLabel('Antworten zeigen').check()
  await page.waitForTimeout(600) // Kacheln blenden die Farbe über 300 ms ein
  const shown = await tiles()
  assert.ok(new Set(shown.map((x) => x.bg)).size >= 3, 'mit „Antworten zeigen“ farbig')
  assert.ok(shown.some((x) => /(^|\s)[ABCD](\s|$)/.test(x.text)))
  await page.getByLabel('Antworten zeigen').uncheck()
  ok('„Antworten zeigen“ zeigt Farben + Buchstaben nur auf Wunsch')

  await page.getByRole('button', { name: 'Fertig' }).click()
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sessions[0])
  assert.deepEqual(sess.responses[sess.questions[1].id], Object.fromEntries(Object.entries(truth).map(([k, v]) => [k, v])), 'gespeicherte Antworten')
  ok('gespeicherte Antworten stimmen exakt')
  assert.deepEqual(errors, [], 'keine JavaScript-Fehler')
  ok('keine JavaScript-Fehler')
} finally {
  await browser.close(); close()
}
console.log(`\n✓ ${passed} Scanner-Browser-Prüfungen bestanden (Bilder: ${OUT})`)
