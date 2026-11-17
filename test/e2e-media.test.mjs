// End-to-End (Playwright/Chromium, Produktions-Build): Rasterkarten per Kamera + Bilder in Fragen.
//   node test/e2e-media.test.mjs   (vorher: npm run build)
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import assert from 'node:assert/strict'
import { gridCardMatrix } from '../src/lib/gridcards.js'

const OUT = 'test/out', SHOTS = OUT + '/screens'
await mkdir(SHOTS, { recursive: true })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  try { const body = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('nf') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://localhost:${server.address().port}/`

// ---------------------------------------------------------------- Kamerabild: 14 Rasterkarten (Nummern bis 40)
const W = 1280, H = 720
const ROT = { 0: 'A', 90: 'D', 180: 'C', 270: 'B' }
const Y = new Uint8Array(W * H).fill(165)
function drawP(n, cx, cy, cell, deg) {
  const m = gridCardMatrix(n), paper = 1.3, total = 5 + 2 * paper
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), half = (total * cell) / 2 * 1.5
  for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
    const dx = x - cx, dy = y - cy
    const u = (dx * cos + dy * sin) / cell + total / 2, v = (-dx * sin + dy * cos) / cell + total / 2
    if (u < 0 || v < 0 || u >= total || v >= total) continue
    const mx = Math.floor(u - paper), my = Math.floor(v - paper)
    Y[y * W + x] = u - paper >= 0 && v - paper >= 0 && mx < 5 && my < 5 && m[my][mx] ? 22 : 238
  }
}
const CARDS = [3, 7, 12, 15, 19, 21, 22, 25, 28, 31, 33, 36, 38, 40], truth = {}
CARDS.forEach((n, i) => {
  const base = [0, 90, 180, 270][(i * 3) % 4]
  truth[n] = ROT[base]
  drawP(n, 120 + (i % 7) * 175, 200 + Math.floor(i / 7) * 300, 14, base + ((i % 5) - 2) * 4)
})
for (let i = 0; i < Y.length; i++) Y[i] = Math.max(0, Math.min(255, Y[i] + ((i * 2654435761) % 13) - 6))
const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(Y), Buffer.alloc((W * H) / 2, 128)])
const y4m = OUT + '/camera-rasterkarten.y4m'
await writeFile(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]))

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] })
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera', 'clipboard-read', 'clipboard-write'] }
let passed = 0
const ok = (msg) => { passed++; console.log('  ✓', msg) }
const errors = []

try {
  const ctx = await browser.newContext(mobile)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // ---- Testbilder im Browser erzeugen: „Foto“ (Verläufe + Rauschen) und Tafelskizze
  await page.goto(BASE)
  const { photo, sketch } = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 600
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, 900, 600); g.addColorStop(0, '#3b6cf0'); g.addColorStop(0.5, '#9fd18b'); g.addColorStop(1, '#2d5a27'); x.fillStyle = g; x.fillRect(0, 0, 900, 600)
    for (let i = 0; i < 1600; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + (i % 50)}%)`; x.beginPath(); x.arc((i * 211) % 900, (i * 97) % 600, 4 + (i % 13), 0, 7); x.fill() }
    const photo = c.toDataURL('image/jpeg', 0.92)
    x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 900, 600); x.strokeStyle = '#222'; x.lineWidth = 7
    x.beginPath(); x.moveTo(120, 500); x.lineTo(780, 500); x.lineTo(120, 100); x.closePath(); x.stroke()
    x.font = 'bold 56px serif'; x.fillStyle = '#222'; x.fillText('a', 430, 570); x.fillText('b', 60, 320); x.fillText('c', 470, 280)
    x.fillStyle = '#d62f2f'; x.beginPath(); x.arc(700, 160, 70, 0, 7); x.fill() // rote Scheibe
    x.fillStyle = '#2f5bea'; x.fillRect(130, 420, 70, 70) // blauer rechter Winkel
    return { photo, sketch: c.toDataURL('image/png') }
  })
  await writeFile(OUT + '/skizze.png', Buffer.from(sketch.split(',')[1], 'base64'))

  // ---- 1) Rasterkarten: anonyme Sitzung, Nummern bis 40, Liste wächst automatisch
  await page.getByRole('button', { name: 'Beispielquiz laden' }).click()
  await page.getByRole('button', { name: /^Starten:/ }).first().click()
  await page.getByText(/Rasterkarten/).first().waitFor()
  await page.screenshot({ path: SHOTS + '/20-start-rasterkarten.png' })
  await page.getByRole('button', { name: /Los geht/ }).click()
  await page.waitForURL(/#\/live\//)
  await page.getByRole('button', { name: 'Nächste Frage' }).click()
  await page.getByRole('button', { name: 'Scannen' }).click()
  await page.getByText('Erfasst', { exact: true }).waitFor()
  await page.waitForFunction((n) => (document.querySelector('.text-3xl.font-extrabold')?.textContent || '').replace(/\s/g, '').startsWith(n + '/'), CARDS.length, { timeout: 30000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: SHOTS + '/21-scanner-rasterkarten.png' })
  await page.getByRole('button', { name: 'Fertig' }).click()
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sessions[0])
  const got = Object.fromEntries(Object.entries(sess.responses[sess.questions[1].id]).map(([k, v]) => [+k, v]))
  assert.deepEqual(got, truth)
  assert.deepEqual(sess.roster.map((s) => s.card), CARDS, 'Liste ist automatisch auf die erkannten Karten gewachsen')
  ok(`Rasterkarten per Kamera: ${CARDS.length} Karten (bis Nr. 40) ohne Einrichtung erkannt, Liste wächst automatisch`)

  // ---- 2) Quiz mit Bildern (Graph, Antwort-Graphen, SVG, Foto)
  const quiz = {
    id: 'bilder', title: 'Funktionen mit Bildern', subject: 'Mathematik', settings: { showCorrect: true, shuffle: false }, created: 1, updated: 1,
    questions: [
      { id: 'q1', type: 'mc', text: 'Wo liegt der Scheitel der Parabel?', options: ['$(1|2)$', '$(2|1)$', '$(-1|2)$'], correct: [0], explanation: '',
        image: { type: 'plot', plot: { x: [-2, 4], fn: [{ f: '(x-1)^2+2' }], points: [[1, 2, 'S']] } } },
      { id: 'q2', type: 'mc', text: 'Welcher Graph gehört zu $f(x)=2x-1$?', options: ['', '', '', ''], correct: [2], explanation: '',
        optionImages: ['-2x+1', 'x-2', '2x-1', '0.5x+1'].map((f) => ({ type: 'plot', plot: { x: [-3, 3], y: [-4, 4], fn: [f] } })) },
      { id: 'q3', type: 'mc', text: 'Wie heißt die rote Strecke?', options: ['Radius', 'Durchmesser', 'Sehne'], correct: [1], explanation: '',
        image: { type: 'svg', svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><circle cx='100' cy='60' r='50' fill='none' stroke='black' stroke-width='3'/><line x1='50' y1='60' x2='150' y2='60' stroke='red' stroke-width='4'/></svg>" } },
      { id: 'q4', type: 'tf', text: 'Auf dem Foto ist ein Wald zu sehen.', options: ['Wahr', 'Falsch'], correct: [1], explanation: '', image: { type: 'raster', src: photo } },
    ],
  }
  await page.evaluate((q) => { const d = JSON.parse(localStorage.getItem('drehmoment:v1')); d.sets.unshift(q); localStorage.setItem('drehmoment:v1', JSON.stringify(d)) }, quiz)
  await page.goto(BASE + '#/set/bilder'); await page.reload()
  await page.getByText('Wo liegt der Scheitel').first().click()
  await page.locator('img.qmedia').first().waitFor()
  await page.screenshot({ path: SHOTS + '/22-editor-bild.png', fullPage: true })
  // Bild-Dialog: Graph-Vorlage wählen
  await page.getByRole('button', { name: 'Bild bearbeiten' }).click()
  await page.getByRole('button', { name: 'sin/cos', exact: true }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: SHOTS + '/23-bild-dialog-graph.png' })
  await page.getByRole('button', { name: 'Parabel', exact: true }).click()
  await page.getByRole('button', { name: 'KI-Prompt' }).click()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  assert.match(prompt, /Wo liegt der Scheitel/); assert.match(prompt, /GRAPH-FORMAT/)
  // Foto-Reiter: Skizze hochladen und vektorisieren
  await page.getByRole('button', { name: '📷 Foto' }).click()
  await page.locator('input[type=file]').setInputFiles(OUT + '/skizze.png')
  await page.getByRole('button', { name: /Vektorisieren/ }).click()
  await page.getByText(/^Vektor · /).waitFor()
  const sizes = await page.locator('figcaption').allTextContents()
  await page.screenshot({ path: SHOTS + '/24-bild-dialog-vektor.png' })
  // mehrfarbig
  await page.getByRole('button', { name: '4', exact: true }).click()
  await page.getByText('Erkannt:').waitFor()
  await page.waitForTimeout(300)
  const swatches = await page.locator('span.size-4.rounded').count()
  assert.ok(swatches >= 3, 'mindestens Papier + 2 Farben: ' + swatches)
  const sizesColor = await page.locator('figcaption').allTextContents()
  await page.screenshot({ path: SHOTS + '/24b-bild-dialog-vektor-farbig.png' })
  await page.getByRole('button', { name: 'Vektor übernehmen' }).click()
  // Zeicheneditor: Vektorbild beschriften
  await page.getByRole('button', { name: /Zeichnen \/ beschriften/ }).click()
  const box = await page.getByRole('img', { name: 'Zeichenfläche' }).boundingBox()
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
  const drag = async (a, b, steps = 8) => { await page.mouse.move(...at(...a)); await page.mouse.down(); await page.mouse.move(...at(...b), { steps }); await page.mouse.up() }
  await page.getByRole('button', { name: 'Pfeil' }).click(); await page.getByRole('button', { name: 'Farbe #e0393e' }).click()
  await drag([0.1, 0.1], [0.4, 0.35])
  await page.getByRole('button', { name: 'Stift' }).click(); await page.getByRole('button', { name: 'dick' }).click()
  await drag([0.6, 0.8], [0.9, 0.85], 15)
  await page.getByRole('button', { name: 'Ellipse' }).click()
  await drag([0.7, 0.1], [0.95, 0.3])
  await page.getByRole('button', { name: /Rückgängig/ }).click() // Ellipse wieder weg
  page.once('dialog', (d) => d.accept('Hypotenuse'))
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(...at(0.45, 0.45))
  await page.waitForTimeout(200)
  await page.screenshot({ path: SHOTS + '/24c-zeicheneditor.png' })
  await page.getByRole('button', { name: /Zeichnung übernehmen/ }).click()
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  await page.waitForTimeout(500) // Speichern ist entprellt
  const img1 = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sets.find((s) => s.id === 'bilder').questions[0].image)
  assert.equal(img1.type, 'svg')
  assert.match(img1.svg, /data-dm-draw="1"/); assert.match(img1.svg, /data-bg="1"/, 'Vektorbild als Hintergrund')
  const shapesSaved = img1.svg.slice(img1.svg.indexOf('data-s="1"')).match(/<(path|line|rect|ellipse|text)\b/g) || []
  assert.equal(shapesSaved.length, 3, 'Pfeil, Freihandlinie, Text (Ellipse rückgängig): ' + shapesSaved)
  assert.match(img1.svg, />Hypotenuse<\/text>/)
  ok(`Bild-Dialog: Graph-Vorlagen, KI-Prompt mit Fragekontext, Skizze vektorisiert (S/W ${sizes.join(' → ')}; 4 Farben ${sizesColor[1]}), im Zeicheneditor beschriftet`)

  // ---- 3) QR-Teilen: Foto wird automatisch verkleinert, Seitenbedarf angezeigt
  await page.getByRole('button', { name: 'Als QR-Code teilen' }).click()
  await page.getByText(/Fotos für die QR-Codes verkleinert auf/).waitFor({ timeout: 30000 })
  const info = await page.getByText(/Benötigt/).textContent()
  assert.match(info, /Benötigt [12] A4-Seite/)
  await page.screenshot({ path: SHOTS + '/25-qr-mit-foto.png', fullPage: true })
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PDF zum Ausdrucken/ }).click()])
  assert.match(pdf.suggestedFilename(), /\.pdf$/)
  ok(`QR mit Foto: ${info.trim()} – PDF erzeugt`)
  await page.getByRole('button', { name: 'Schließen' }).click()

  // ---- 4) Live + Beamer mit Bildern
  await page.goto(BASE + '#/set/bilder')
  await page.getByRole('button', { name: 'Quiz starten' }).click()
  await page.getByRole('button', { name: /Los geht/ }).click()
  await page.waitForURL(/#\/live\//)
  await page.locator('img.qmedia').first().waitFor()
  await page.getByRole('button', { name: 'Nächste Frage' }).click()
  await page.screenshot({ path: SHOTS + '/26-live-antwortbilder.png', fullPage: true })
  const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sessions[0].id)
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const bp = await desk.newPage()
  bp.on('pageerror', (e) => errors.push(e.message))
  await bp.goto(BASE)
  await bp.evaluate((s) => localStorage.setItem('drehmoment:v1', s), await page.evaluate(() => localStorage.getItem('drehmoment:v1')))
  await bp.goto(BASE + '#/beamer/' + sid); await bp.reload()
  await bp.locator('img.qmedia').nth(3).waitFor()
  assert.equal(await bp.locator('img.qmedia').count(), 4, 'vier Antwortbilder am Beamer')
  await bp.screenshot({ path: SHOTS + '/27-beamer-antwortbilder.png' })
  await bp.evaluate(() => { const d = JSON.parse(localStorage.getItem('drehmoment:v1')); d.sessions[0].current = 0; localStorage.setItem('drehmoment:v1', JSON.stringify(d)) }); await bp.reload()
  await bp.locator('img.qmedia').first().waitFor()
  await bp.screenshot({ path: SHOTS + '/28-beamer-bild.png' })
  await desk.close()
  ok('Live-Ansicht und Beamer zeigen Frage- und Antwortbilder')
  await ctx.close()

  assert.deepEqual(errors.filter((e) => !/favicon|404/.test(e)), [], 'keine JS-Fehler')
  ok('keine JavaScript-Fehler in der Konsole')
} finally {
  await browser.close()
  server.close()
}
console.log(`\n✓ ${passed} E2E-Prüfungen (Rasterkarten + Bilder) bestanden`)
