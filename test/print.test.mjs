// Druck-Test: Das ECHTE Karten-PDF wird gerastert (pdftoppm), die Karten werden wie in der Klasse in ein Kamerabild
// gesetzt (gedreht gehalten, schief, vor dunklem Hintergrund, verrauscht) und müssen mit richtiger Antwort erkannt
// werden. Prüft damit Druck-Layout + gedrehten QR-Code + Erkennung zusammen.
//   node test/print.test.mjs   (braucht pdftoppm aus poppler-utils)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { cardsPdf, cardSlots } from '../src/lib/pdf.js'
import { cardRotation } from '../src/lib/cardcode.js'
import { detectCards } from '../src/lib/detect.js'

try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }) } catch {
  console.error('✗ pdftoppm fehlt (poppler-utils installieren) – der Druck-Test ist Pflicht.'); process.exit(1)
}
let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const TOP = ['A', 'D', 'C', 'B'] // Karte k·90° im Uhrzeigersinn gehalten -> diese Kante oben
const DIR = 'test/out/print'
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })

// Karten: alle vier Versätze bei Nummern- und Schüler-Karten, mit und ohne Namen
const CARDS = [{ card: 1 }, { card: 2, name: 'Anna M.' }, { card: 4 }, { card: 5 }, { card: 7 }, { card: 12, name: 'Jörg Müßig' },
  { card: 999 }, { card: 3, gid: '17DWY6F', name: 'Ben K.' }, { card: 9, gid: 'CTQZ5XY' }]
const ids = CARDS.map((c) => c.gid || c.card)
t('Testkarten decken alle vier Dreh-Versätze ab', () => assert.equal(new Set(ids.map(cardRotation)).size, 4))
const pdf = cardsPdf(CARDS)
assert.equal(pdf.getNumberOfPages(), CARDS.length)
writeFileSync(DIR + '/karten.pdf', Buffer.from(pdf.output('arraybuffer')))

/** PGM (P5) lesen */
function pgm(file) {
  const b = readFileSync(file)
  let pos = 0
  const tok = () => { while (/\s/.test(String.fromCharCode(b[pos]))) pos++; let s = ''; while (!/\s/.test(String.fromCharCode(b[pos]))) s += String.fromCharCode(b[pos++]); return s }
  assert.equal(tok(), 'P5')
  const w = +tok(), h = +tok(); tok(); pos++
  return { w, h, px: b.subarray(pos, pos + w * h) }
}
function rasterPages(dpi) {
  const pre = `${DIR}/r${dpi}`
  execFileSync('pdftoppm', ['-gray', '-r', String(dpi), DIR + '/karten.pdf', pre])
  return readdirSync(DIR).filter((f) => f.startsWith(`r${dpi}-`) && f.endsWith('.pgm')).sort().map((f) => pgm(`${DIR}/${f}`))
}
const mmPx = (mm, dpi) => (mm * dpi) / 25.4
const [slot] = cardSlots()

/** Karte (Ausschnitt der Seite innerhalb der Schnittlinie) gedreht um deg° (im Uhrzeigersinn) bei (cx,cy) einsetzen */
function place(frame, W, H, page, dpi, cx, cy, deg, scale = 1) {
  const x0 = mmPx(slot.x, dpi), y0 = mmPx(slot.y, dpi), side = mmPx(slot.w, dpi)
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), half = (side * scale) / 2 * 1.42
  for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const dx = (x - cx) / scale, dy = (y - cy) / scale
    const u = dx * cos + dy * sin + side / 2, v = -dx * sin + dy * cos + side / 2 // zurück ins Kartenbild
    if (u < 1 || v < 1 || u >= side - 1 || v >= side - 1) continue
    const g = page.px[Math.floor(v + y0) * page.w + Math.floor(u + x0)]
    const o = (y * W + x) * 4; frame[o] = frame[o + 1] = frame[o + 2] = g; frame[o + 3] = 255
  }
}
function camera(img, W, H, amt = 30) {
  let s = 1
  for (let i = 0; i < img.length; i += 4) { s = (s * 16807) % 2147483647; const n = ((s / 2147483647) - 0.5) * amt; for (let k = 0; k < 3; k++) img[i + k] = Math.max(0, Math.min(255, img[i + k] + n)) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, f = 0.7 + 0.3 * (x / W); for (let k = 0; k < 3; k++) img[o + k] *= f }
}
const blankFrame = (W, H, g) => { const f = new Uint8ClampedArray(W * H * 4).fill(g); for (let i = 3; i < f.length; i += 4) f[i] = 255; return f }

const pagesNear = rasterPages(40)
t(`PDF gerastert (${pagesNear.length} Seiten, 40 dpi)`, () => assert.equal(pagesNear.length, CARDS.length))

t('jede gedruckte Karte einzeln, nah (formatfüllend), alle vier Haltungen, dunkler Hintergrund', () => {
  const W = 1280, H = 720
  CARDS.forEach((c, i) => {
    for (let k = 0; k < 4; k++) {
      const f = blankFrame(W, H, 35)
      place(f, W, H, pagesNear[i], 40, 640, 360, k * 90 + (k % 2 ? 5 : -4), 2.1)
      camera(f, W, H)
      const r = detectCards(f, W, H)
      assert.equal(r.length, 1, `${ids[i]} k=${k}: ${r.length} Karten`)
      assert.equal(r[0].gid || r[0].card, ids[i])
      assert.equal(r[0].answer, TOP[k], `${ids[i]} (Versatz ${cardRotation(ids[i])}) gehalten mit ${TOP[k]} oben -> ${r[0].answer}`)
    }
  })
})

const pagesFar = rasterPages(12)
t('ganze Klasse: alle 9 gedruckten Karten in einem Bild, zufällige Haltung + Neigung, mehrere Durchläufe', () => {
  const W = 1280, H = 720
  let seed = 3
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  for (let run = 0; run < 6; run++) {
    const f = blankFrame(W, H, 60 + run * 20), truth = {}
    CARDS.forEach((c, i) => {
      const k = Math.floor(rnd() * 4), col = i % 5, row = Math.floor(i / 5)
      truth[ids[i]] = TOP[k]
      place(f, W, H, pagesFar[i], 12, 140 + col * 250, 200 + row * 330, k * 90 + (rnd() - 0.5) * 24, 1.15)
    })
    camera(f, W, H)
    const got = Object.fromEntries(detectCards(f, W, H).map((x) => [x.gid || x.card, x.answer]))
    assert.deepEqual(got, truth, `Durchlauf ${run + 1}`)
  }
})

t('weit weg (kleine Module ≈ 3 px), alle Haltungen', () => {
  const W = 1280, H = 720
  for (let k = 0; k < 4; k++) {
    const f = blankFrame(W, H, 120), truth = {}
    CARDS.forEach((c, i) => { truth[ids[i]] = TOP[(k + i) % 4]; place(f, W, H, pagesFar[i], 12, 120 + (i % 5) * 260, 180 + Math.floor(i / 5) * 330, ((k + i) % 4) * 90 + 3, 0.75) })
    camera(f, W, H, 20)
    const got = Object.fromEntries(detectCards(f, W, H).map((x) => [x.gid || x.card, x.answer]))
    assert.deepEqual(got, truth, `k=${k}`)
  }
})

console.log(`\n✓ ${ok} Druck-Tests bestanden (Bilder: ${DIR})`)
