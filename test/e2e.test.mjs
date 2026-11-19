// End-to-End-Test im echten Browser (Playwright/Chromium) gegen den Produktions-Build (dist/).
// - simulierte Kamera filmt 12 Antwortkarten -> Antworten müssen korrekt in der Sitzung landen
// - Quiz-QR-Link mit start=1 öffnet direkt eine Live-Sitzung
// - nach dem ersten Laden funktioniert die App offline (Service Worker)
// - Screenshots aller Ansichten nach test/out/screens/
//   node test/e2e.test.mjs   (vorher: npm run build)
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import assert from 'node:assert/strict'
import { cardFace } from '../src/lib/qr.js'
import { encodeSet } from '../src/lib/share.js'
import { SAMPLE } from '../src/lib/sample.js'
import { normalizeSet } from '../src/lib/format.js'

const OUT = 'test/out', SHOTS = OUT + '/screens'
await mkdir(SHOTS, { recursive: true })

// ---------------------------------------------------------------- statischer Server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  try {
    const body = await readFile(join('dist', p))
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body)
  } catch { res.writeHead(404); res.end('nf') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://localhost:${server.address().port}/`

// ---------------------------------------------------------------- Kamerabild (Y4M) mit 12 Karten
const W = 1280, H = 720
const ROT = { 0: 'A', 90: 'D', 180: 'C', 270: 'B' } // im Uhrzeigersinn gedreht -> Kante oben
const truth = {}
const Y = new Uint8Array(W * H).fill(170)
function draw(n, cx, cy, mod, deg) {
  const m = cardFace(n).m, size = m.length, quiet = 4, total = size + 2 * quiet
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), half = (total * mod) / 2 * 1.5
  for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
    const dx = x - cx, dy = y - cy
    const u = (dx * cos + dy * sin) / mod + total / 2, v = (-dx * sin + dy * cos) / mod + total / 2
    if (u < 0 || v < 0 || u >= total || v >= total) continue
    const mx = Math.floor(u) - quiet, my = Math.floor(v) - quiet
    Y[y * W + x] = mx >= 0 && my >= 0 && mx < size && my < size && m[my][mx] ? 20 : 240
  }
}
// Karten 1–10 = Nummernkarten, dazu 2 feste Schüler-Karten (anonyme Sitzung muss auch diese aufnehmen)
const GIDS = { 11: 'K7Q2M9X', 12: 'A1B2C3D' }
let n = 1
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++, n++) {
  const base = [0, 90, 180, 270][(n * 7) % 4]
  truth[GIDS[n] ? 'DM-' + GIDS[n] : n] = ROT[base]
  draw(GIDS[n] || n, 170 + col * 310, 130 + row * 230, 6.5, base + ((n % 5) - 2) * 5)
}
for (let i = 0; i < Y.length; i++) Y[i] = Math.max(0, Math.min(255, Y[i] + ((i * 2654435761) % 17) - 8)) // etwas Rauschen
const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(Y), Buffer.alloc((W * H) / 2, 128)])
const y4m = OUT + '/camera.y4m'
await writeFile(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]))

// ---------------------------------------------------------------- Browser
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
})
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'] }
let passed = 0
const ok = (msg) => { passed++; console.log('  ✓', msg) }
const errors = []

try {
  // ---- 1) Startseite, Beispiel, Live-Sitzung mit Kamera
  const ctx = await browser.newContext(mobile)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(BASE)
  await page.getByText('Karte drehen.').waitFor()
  await page.screenshot({ path: SHOTS + '/01-start.png' })
  await page.getByRole('button', { name: 'Beispielquiz laden' }).click()
  await page.getByText('Beispiel: Photosynthese').waitFor()
  await page.screenshot({ path: SHOTS + '/02-quizze.png' })
  ok('Startseite + Beispielquiz')

  await page.getByRole('button', { name: /^Starten:/ }).first().click()
  await page.getByRole('button', { name: /Los geht/ }).click()
  await page.waitForURL(/#\/live\//)
  await page.getByRole('button', { name: 'Nächste Frage' }).click() // F2: Multiple Choice mit 4 Optionen
  await page.getByRole('button', { name: 'Scannen' }).click()
  await page.getByText('Erfasst', { exact: true }).waitFor()
  await page.waitForFunction(() => (document.querySelector('.text-3xl.font-extrabold')?.textContent || '').replace(/\s/g, '').startsWith('12/'), null, { timeout: 30000 })
  // Scanner startet in der Übersicht: Frage bleibt sichtbar, Kacheln darunter, Kamera klein
  await page.locator('h2.math-text').first().waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: SHOTS + '/03b-scanner-uebersicht.png' })
  const vp = page.viewportSize()
  await page.setViewportSize({ width: 1180, height: 820 }) // iPad quer
  await page.waitForTimeout(300)
  await page.screenshot({ path: SHOTS + '/03c-scanner-uebersicht-ipad.png' })
  await page.setViewportSize(vp)
  await page.getByRole('button', { name: 'Kamera groß' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: SHOTS + '/03-scanner.png' })
  await page.getByRole('button', { name: 'Fertig' }).click()
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sessions[0])
  const got = sess.responses[sess.questions[1].id]
  assert.deepEqual(got, Object.fromEntries(Object.entries(truth)), 'Antworten aus dem Kamerabild')
  assert.deepEqual(sess.roster.filter((s) => s.gid).map((s) => s.card).sort(), ['DM-A1B2C3D', 'DM-K7Q2M9X'], 'feste Schüler-Karten in der Liste')
  ok(`Kamera-Scan (anonym): alle 12 Karten inkl. 2 fester Schüler-Karten mit richtiger Antwort erfasst (${Object.values(truth).join('')})`)

  await page.getByRole('button', { name: 'Lösung zeigen' }).click()
  await page.screenshot({ path: SHOTS + '/04-live-aufgedeckt.png', fullPage: true })
  await page.getByRole('button', { name: 'Beenden' }).click()
  await page.getByRole('button', { name: /Beenden & auswerten/ }).click()
  await page.waitForURL(/#\/session\//)
  await page.getByText('Ø richtig').waitFor()
  await page.screenshot({ path: SHOTS + '/05-auswertung.png', fullPage: true })
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  assert.match(dl.suggestedFilename(), /\.csv$/)
  ok('Auswertung + CSV-Export')

  for (const [hash, name] of [['/cards', '06-karten'], ['/ai', '07-ki'], ['/classes', '08-klassen'], ['/data', '09-mehr'], ['/help', '10-hilfe'], ['/help?t=agent', '11-agenten']]) {
    await page.goto(BASE + '#' + hash)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
  }
  const setId = await page.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')).sets[0].id)
  await page.goto(BASE + '#/set/' + setId)
  await page.getByRole('button', { name: 'Als QR-Code teilen' }).click()
  await page.getByRole('img', { name: 'QR-Code' }).waitFor()
  await page.screenshot({ path: SHOTS + '/12-qr-teilen.png' })
  ok('alle Ansichten rendern (Screenshots in test/out/screens)')

  // Beamer (Desktop)
  const sid = sess.id
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const bp = await desk.newPage()
  await bp.goto(BASE)
  await bp.evaluate((s) => localStorage.setItem('drehmoment:v1', s), await page.evaluate(() => localStorage.getItem('drehmoment:v1')))
  await bp.evaluate((sid) => { const d = JSON.parse(localStorage.getItem('drehmoment:v1')); d.sessions[0].endedAt = null; localStorage.setItem('drehmoment:v1', JSON.stringify(d)) }, sid)
  await bp.goto(BASE + '#/beamer/' + sid); await bp.reload()
  await bp.getByText('Doppelklick: Vollbild').waitFor()
  await bp.screenshot({ path: SHOTS + '/13-beamer.png' })
  await desk.close()
  ok('Beamer-Ansicht')

  // ---- 2) Offline nach erstem Laden
  await page.goto(BASE)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForTimeout(500)
  await ctx.setOffline(true)
  await page.reload()
  await page.getByText('Karte drehen.').waitFor({ timeout: 5000 })
  await page.goto(BASE + '#/cards'); await page.getByText('Antwortkarten').first().waitFor()
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PDF herunterladen/ }).click()])
  assert.match(pdf.suggestedFilename(), /\.pdf$/)
  await ctx.setOffline(false)
  ok('offline: App lädt neu und erzeugt Karten-PDF ohne Netz')
  await ctx.close()

  // ---- 3) QR-Konfiguration startet direkt eine Sitzung
  const z = await encodeSet(normalizeSet(SAMPLE))
  const ctx2 = await browser.newContext(mobile)
  const p2 = await ctx2.newPage()
  p2.on('pageerror', (e) => errors.push(e.message))
  await p2.goto(`${BASE}#/import?z=${z}&start=1`)
  await p2.waitForURL(/#\/live\//)
  await p2.getByText('Hast du das Video').waitFor()
  await p2.goto(`${BASE}#/import?z=${z}&start=1`) // zweites Scannen: kein doppeltes Quiz
  await p2.waitForURL(/#\/live\//)
  await p2.waitForTimeout(600)
  const st2 = await p2.evaluate(() => JSON.parse(localStorage.getItem('drehmoment:v1')))
  assert.equal(st2.sets.length, 1); assert.equal(st2.sessions.length, 2)
  await p2.screenshot({ path: SHOTS + '/14-qr-direktstart.png' })
  ok(`QR-Link (${z.length} Zeichen) startet Sitzung direkt, ohne Duplikate`)

  // ---- 4) Import per ?d= und Agenten-Spezifikation erreichbar
  const d = Buffer.from(JSON.stringify({ title: 'Agent-Quiz', questions: [{ question: '2+2?', options: ['3', '4'], correct: 'B' }] })).toString('base64url')
  await p2.goto(`${BASE}#/import?d=${d}`)
  await p2.getByText('Agent-Quiz').waitFor()
  for (const f of ['llms.txt', 'drehmoment.schema.json', 'example.json', 'manifest.webmanifest', 'sw.js', 'kit/drehmoment-kit.mjs', 'LICENSE.txt', 'third-party-licenses.txt']) {
    const r = await p2.request.get(BASE + f); assert.equal(r.status(), 200, f)
  }
  ok('Agenten-Import per Link + llms.txt/Schema/Manifest/Werkzeugkasten ausgeliefert')

  // ---- 5) Druckseite für Agenten: fertiges Quiz-Blatt aus einem Link
  await p2.goto(`${BASE}#/print?d=${d}`)
  await p2.locator('iframe[title="PDF-Vorschau"]').waitFor({ timeout: 15000 })
  await p2.screenshot({ path: SHOTS + '/15-druckseite.png', fullPage: true })
  ok('Druckseite #/print erzeugt das Quiz-Blatt')
  await ctx2.close()

  assert.deepEqual(errors.filter((e) => !/favicon|404/.test(e)), [], 'keine JS-Fehler')
  ok('keine JavaScript-Fehler in der Konsole')
} finally {
  await browser.close()
  server.close()
}
console.log(`\n✓ ${passed} E2E-Prüfungen bestanden`)
