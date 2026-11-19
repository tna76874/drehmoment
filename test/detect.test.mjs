// Erkennungstests: rendert Drehmoment-Karten (gedreht, schief, verrauscht, unscharf)
// in synthetische Kamerabilder und prüft Kartennummer + erkannte Antwort.
//   node test/detect.test.mjs
import qrcode from 'qrcode-generator'
import { cardMatrix, cardFace } from '../src/lib/qr.js'
import { detectCards } from '../src/lib/detect.js'
import assert from 'node:assert/strict'

const W = 1280, H = 720
const blank = () => new Uint8ClampedArray(W * H * 4).fill(190)
const EXPECT = { 0: 'A', 90: 'D', 180: 'C', 270: 'B' } // Drehung im Uhrzeigersinn -> Kante oben

function drawMatrix(img, m, cx, cy, mod, deg, squash = 1, quiet = 4) {
  const size = m.length, total = size + 2 * quiet
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  const half = (total * mod) / 2 * 1.5
  for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const dx = (x - cx) / squash, dy = y - cy // squash: leichte Perspektive/Verzerrung
    const u = (dx * cos + dy * sin) / mod + total / 2, v = (-dx * sin + dy * cos) / mod + total / 2
    if (u < 0 || v < 0 || u >= total || v >= total) continue
    const mx = Math.floor(u) - quiet, my = Math.floor(v) - quiet
    const dark = mx >= 0 && my >= 0 && mx < size && my < size && m[my][mx]
    const o = (y * W + x) * 4, c = dark ? 25 : 245
    img[o] = img[o + 1] = img[o + 2] = c; img[o + 3] = 255
  }
}
const draw = (img, n, ...rest) => drawMatrix(img, cardMatrix(n), ...rest)

// Sensorrauschen + leichte Unschärfe wie bei einer echten Kamera
function camera(img, amt = 40) {
  for (let i = 0; i < img.length; i += 4) { const n = (Math.random() - 0.5) * amt; for (let k = 0; k < 3; k++) img[i + k] = Math.max(0, Math.min(255, img[i + k] + n)) }
  const src = img.slice()
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * W + x + dx) * 4]
    const o = (y * W + x) * 4; img[o] = img[o + 1] = img[o + 2] = s / 9
  }
  // Helligkeitsverlauf (Fenster auf einer Seite)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, f = 0.65 + 0.35 * (x / W); for (let k = 0; k < 3; k++) img[o + k] *= f }
}

let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }

console.log('Einzelkarten:')
for (const base of [0, 90, 180, 270]) for (const tilt of [-20, -8, 0, 8, 20]) {
  t(`Drehung ${base}° ${tilt >= 0 ? '+' : ''}${tilt}° -> ${EXPECT[base]}`, () => {
    const img = blank(); draw(img, 7, 640, 360, 10, base + tilt); camera(img)
    const r = detectCards(img, W, H)
    assert.equal(r.length, 1)
    assert.equal(r[0].card, 7)
    assert.equal(r[0].answer, EXPECT[base], `erkannt: ${r[0].answer} (${r[0].angle}°)`)
  })
}

t('alle Kartennummern 1–63 dekodierbar und richtig ausgerichtet', () => {
  for (let n = 1; n <= 63; n++) {
    const base = [0, 90, 180, 270][n % 4]
    const img = blank(); draw(img, n, 640, 360, 8, base); camera(img, 20)
    const r = detectCards(img, W, H)
    assert.equal(r.length, 1, `Karte ${n}`); assert.equal(r[0].card, n); assert.equal(r[0].answer, EXPECT[base])
  }
})

t('diagonal (45°) gehaltene Karte wird nicht gewertet', () => {
  const img = blank(); draw(img, 3, 640, 360, 10, 45); camera(img)
  const r = detectCards(img, W, H)
  assert.ok(r.length === 0 || r[0].answer === null)
})

t('fremder QR-Code wird ignoriert, Karte daneben erkannt', () => {
  const qr = qrcode(2, 'M'); qr.addData('https://example.org'); qr.make()
  const m = Array.from({ length: qr.getModuleCount() }, (_, r) => Array.from({ length: qr.getModuleCount() }, (_, c) => qr.isDark(r, c)))
  const img = blank(); drawMatrix(img, m, 350, 360, 7, 0); draw(img, 12, 900, 360, 8, 180); camera(img)
  const r = detectCards(img, W, H)
  assert.deepEqual(r.map((x) => [x.card, x.answer]), [[12, 'C']])
})

t('leicht verzerrte Karten (Perspektive)', () => {
  const img = blank(); draw(img, 4, 400, 360, 9, 90, 0.8); draw(img, 5, 900, 360, 9, 270, 1.15); camera(img)
  const r = Object.fromEntries(detectCards(img, W, H).map((x) => [x.card, x.answer]))
  assert.deepEqual(r, { 4: 'D', 5: 'B' })
})

t('feste Schüler-Karten (DM-XXXXXXX) in allen Lagen, gemischt mit Nummernkarten', () => {
  const ids = ['17DWY6F', 'CTQZ5XY', 'ZZZZZZZ', '0000000']
  for (const base of [0, 90, 180, 270]) {
    const img = blank()
    ids.forEach((g, i) => draw(img, g, 180 + i * 260, 250, 7, base + (i - 1.5) * 6))
    draw(img, 12, 640, 560, 7, base)
    camera(img)
    const r = detectCards(img, W, H)
    const got = Object.fromEntries(r.map((x) => [x.gid || x.card, x.answer]))
    assert.deepEqual(got, { ...Object.fromEntries(ids.map((g) => [g, EXPECT[base]])), 12: EXPECT[base] }, `Drehung ${base}°`)
    assert.ok(r.filter((x) => x.gid).every((x) => x.card === null))
  }
})


console.log('Gedrehte Karten (seit 0.5, QR fest pro Karte gegen die Buchstaben gedreht, 2 Module Rand, dunkler Hintergrund):')
t('alle vier Versätze, alle vier Kanten oben, Nummern- und Schüler-Karten', () => {
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 40, 123, '17DWY6F', 'CTQZ5XY']) for (const rot of [0, 1, 2, 3]) for (const base of [0, 90, 180, 270]) {
    const img = new Uint8ClampedArray(W * H * 4).fill(40) // dunkler Pulli hinter der Karte
    drawMatrix(img, cardFace(id, rot).m, 640, 360, 12, base + 6, 1, 2); camera(img, 20)
    const r = detectCards(img, W, H)
    assert.equal(r.length, 1, `${id} r=${rot} ${base}°`)
    assert.equal(typeof id === 'string' ? r[0].gid : r[0].card, id)
    assert.equal(r[0].answer, EXPECT[base], `${id} r=${rot} ${base}°: ${r[0].answer}`)
  }
})
t('Karte formatfüllend vor der Kamera (QR fast über das ganze Bild)', () => {
  for (const base of [0, 90, 180, 270]) {
    const img = new Uint8ClampedArray(W * H * 4).fill(60)
    drawMatrix(img, cardFace(11).m, 640, 360, 27, base + 3, 1, 2); camera(img, 20)
    const r = detectCards(img, W, H)
    assert.equal(r.length, 1); assert.equal(r[0].card, 11); assert.equal(r[0].answer, EXPECT[base])
  }
})

console.log('Ganze Klasse (32 Karten, kleine Module, zufällige Antworten), 5 Durchläufe:')
let worst = 99, maxMs = 0
for (let run = 0; run < 5; run++) {
  const img = blank(), truth = {}
  let n = 1
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++, n++) {
    const base = [0, 90, 180, 270][Math.floor(Math.random() * 4)]
    truth[n] = EXPECT[base]
    draw(img, n, 80 + col * 160, 90 + row * 180, 3.6 + Math.random() * 1.2, base + (Math.random() - 0.5) * 30)
  }
  camera(img)
  const t0 = Date.now(); const r = detectCards(img, W, H); const ms = Date.now() - t0
  const got = Object.fromEntries(r.map((x) => [x.card, x.answer]))
  const correct = Object.keys(truth).filter((k) => got[k] === truth[k]).length
  const wrong = Object.keys(got).filter((k) => got[k] && got[k] !== truth[k])
  console.log(`  Lauf ${run + 1}: ${correct}/32 erkannt, ${wrong.length} falsch, ${ms} ms`)
  assert.equal(wrong.length, 0, 'keine falsche Antwort'); assert.ok(!Object.keys(got).some((k) => !truth[k]), 'keine Phantomkarten')
  worst = Math.min(worst, correct); maxMs = Math.max(maxMs, ms)
}
assert.ok(worst >= 30, `mindestens 30/32 pro Bild (schlechtester Lauf: ${worst})`); ok++

console.log(`\n✓ ${ok} Tests bestanden (schlechtester Klassen-Lauf ${worst}/32, max. ${maxMs} ms pro Bild)`)
