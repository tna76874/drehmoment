// Rasterkarten: Muster eingefroren + Erkennung in synthetischen Kamerabildern.
//   node test/gridcards.test.mjs
import assert from 'node:assert/strict'
import { GRID_CARD_PATTERNS, gridCardMatrix, matchGrid } from '../src/lib/gridcards.js'
import { detectCards } from '../src/lib/detect.js'
import { cardMatrix } from '../src/lib/qr.js'

const W = 1280, H = 720
const blank = (v = 190) => new Uint8ClampedArray(W * H * 4).fill(v)
const EXPECT = { 0: 'A', 90: 'D', 180: 'C', 270: 'B' } // im Uhrzeigersinn gedreht -> Buchstabe oben
let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }

/** Karte zeichnen: 5×5-Raster auf weißem Papier (Rand `paper` Felder), gedreht, optional gestaucht (Perspektive) */
function drawGrid(img, m, cx, cy, cell, deg, { paper = 1.3, squash = 1, ink = 25 } = {}) {
  const size = m.length, total = size + 2 * paper
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  const half = (total * cell) / 2 * 1.5
  for (let y = Math.floor(cy - half); y < cy + half; y++) for (let x = Math.floor(cx - half); x < cx + half; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const dx = (x - cx) / squash, dy = y - cy
    const u = (dx * cos + dy * sin) / cell + total / 2, v = (-dx * sin + dy * cos) / cell + total / 2
    if (u < 0 || v < 0 || u >= total || v >= total) continue
    const mx = Math.floor(u - paper), my = Math.floor(v - paper)
    const dark = u - paper >= 0 && v - paper >= 0 && mx < size && my < size && m[my][mx]
    const o = (y * W + x) * 4, c = dark ? ink : 240
    img[o] = img[o + 1] = img[o + 2] = c; img[o + 3] = 255
  }
}
const drawP = (img, n, ...rest) => drawGrid(img, gridCardMatrix(n), ...rest)

function camera(img, amt = 40) {
  for (let i = 0; i < img.length; i += 4) { const n = (Math.random() - 0.5) * amt; for (let k = 0; k < 3; k++) img[i + k] = Math.max(0, Math.min(255, img[i + k] + n)) }
  const src = img.slice()
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * W + x + dx) * 4]
    const o = (y * W + x) * 4; img[o] = img[o + 1] = img[o + 2] = s / 9
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, f = 0.65 + 0.35 * (x / W); for (let k = 0; k < 3; k++) img[o + k] *= f }
}

console.log('Muster:')
t('40 Karten, Raster eingefroren (Stichproben aus dem Original-PDF, „A“ oben)', () => {
  assert.equal(GRID_CARD_PATTERNS.length, 40)
  // Karte 1 im PDF: A links -> um 90° im Uhrzeigersinn gedreht = kanonisch
  assert.equal(GRID_CARD_PATTERNS[0], '1111111111110111111110101')
  assert.equal(GRID_CARD_PATTERNS[39], '1101111111110101111111001')
  // Prüfsumme über alle Muster (bei Änderung schlägt das hier fehl)
  let h = 0
  for (const p of GRID_CARD_PATTERNS) for (const ch of p) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  assert.equal(h >>> 0, 3049212586)
})
t('Struktur: Ecken + innerer Ring schwarz, Mitte weiß; alle 160 Lagen verschieden (Abstand ≥ 2)', () => {
  for (const p of GRID_CARD_PATTERNS) {
    for (const i of [0, 4, 20, 24, 6, 7, 8, 11, 13, 16, 17, 18]) assert.equal(p[i], '1')
    assert.equal(p[12], '0')
  }
  for (let n = 1; n <= 40; n++) assert.deepEqual(matchGrid(parseInt(GRID_CARD_PATTERNS[n - 1], 2)), { n, k: 0, dist: 0 })
})
t('1 Feld falsch -> nur angenommen, wenn eindeutig', () => {
  let accepted = 0, rejected = 0
  for (let n = 1; n <= 40; n++) for (let b = 0; b < 25; b++) {
    const r = matchGrid(parseInt(GRID_CARD_PATTERNS[n - 1], 2) ^ (1 << b))
    if (r) { assert.equal(r.n, n, 'nie eine falsche Karte'); accepted++ } else rejected++
  }
  console.log(`      ${accepted} korrigiert, ${rejected} verworfen (mehrdeutig)`)
})

console.log('Erkennung:')
for (const base of [0, 90, 180, 270]) for (const tilt of [-20, 0, 15]) {
  t(`Karte 17, Drehung ${base}° ${tilt >= 0 ? '+' : ''}${tilt}° -> ${EXPECT[base]}`, () => {
    const img = blank(); drawP(img, 17, 640, 360, 16, base + tilt); camera(img)
    const r = detectCards(img, W, H)
    assert.equal(r.length, 1, JSON.stringify(r))
    assert.equal(r[0].card, 17); assert.ok(r[0].gridCard)
    assert.equal(r[0].answer, EXPECT[base], `erkannt: ${r[0].answer} (${r[0].angle}°)`)
  })
}
t('alle 40 Karten in allen Lagen (je ein Bild)', () => {
  for (let n = 1; n <= 40; n++) {
    const base = [0, 90, 180, 270][n % 4]
    const img = blank(); drawP(img, n, 640, 360, 12, base + ((n % 7) - 3) * 3); camera(img, 20)
    const r = detectCards(img, W, H)
    assert.deepEqual(r.map((x) => [x.card, x.answer]), [[n, EXPECT[base]]], `Karte ${n}`)
  }
})
t('große Karte direkt vor der Kamera', () => {
  const img = blank(); drawP(img, 23, 640, 360, 95, 90 + 4); camera(img)
  const r = detectCards(img, W, H)
  assert.deepEqual(r.map((x) => [x.card, x.answer]), [[23, 'D']])
})
t('diagonal (45°) gehaltene Karte wird nicht gewertet', () => {
  const img = blank(); drawP(img, 5, 640, 360, 14, 45); camera(img)
  const r = detectCards(img, W, H)
  assert.ok(r.length === 0 || r[0].answer === null)
})
t('Perspektive (gestaucht/gestreckt)', () => {
  const img = blank(); drawP(img, 4, 400, 360, 14, 90, { squash: 0.75 }); drawP(img, 5, 900, 360, 14, 270, { squash: 1.2 }); camera(img)
  assert.deepEqual(Object.fromEntries(detectCards(img, W, H).map((x) => [x.card, x.answer])), { 4: 'D', 5: 'B' })
})
t('gemischt: Drehmoment-Karten (QR) und Rasterkarten im selben Bild', () => {
  const img = blank()
  const m = cardMatrix(3)
  // QR-Karte 3 (Ruhezone 4 Module) bei 0° -> A
  drawGrid(img, m, 300, 360, 8, 0, { paper: 4 })
  drawP(img, 12, 700, 360, 14, 180)
  drawP(img, 31, 1050, 360, 14, 270)
  camera(img)
  const r = detectCards(img, W, H)
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.card, x.answer])), { 3: 'A', 12: 'C', 31: 'B' })
  assert.ok(!r.find((x) => x.card === 3).gridCard)
})
t('keine Phantomkarten aus QR-Codes, dunklen Flächen mit Loch oder Text', () => {
  const img = blank()
  for (let i = 0; i < 6; i++) drawGrid(img, cardMatrix(i + 1), 120 + i * 200, 160, 6, i * 13, { paper: 4 })
  // schwarzes Quadrat mit Loch (falsche Größe) und volle schwarze Fläche
  const ring = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => !(r >= 1 && r <= 3 && c >= 1 && c <= 3)))
  drawGrid(img, ring, 300, 520, 18, 10)
  drawGrid(img, Array.from({ length: 5 }, () => Array(5).fill(true)), 700, 520, 18, 0)
  camera(img)
  const r = detectCards(img, W, H)
  assert.ok(!r.some((x) => x.gridCard), JSON.stringify(r.filter((x) => x.gridCard)))
  assert.equal(detectCards(img, W, H, { gridCards: false }).length, 6)
})

t('Stresstest: 96 Bilder mit Drehmoment-QR-Karten (verschiedene Größen/Lagen) -> nie eine Rasterkarte', () => {
  let phantoms = 0
  for (const n of [1, 3, 12, 33, 63, 99]) for (const deg of [0, 20, 45, 90]) for (const mod of [4, 10, 16, 24]) {
    const img = blank(); drawGrid(img, cardMatrix(n), 640, 360, mod, deg, { paper: 4 }); camera(img)
    phantoms += detectCards(img, W, H).filter((x) => x.gridCard).length
  }
  assert.equal(phantoms, 0)
})

console.log('Ganze Klasse (32 Rasterkarten, klein, zufällige Antworten), 5 Durchläufe:')
let worst = 99, maxMs = 0
for (let run = 0; run < 5; run++) {
  const img = blank(), truth = {}
  let n = 1
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++, n++) {
    const base = [0, 90, 180, 270][Math.floor(Math.random() * 4)]
    truth[n] = EXPECT[base]
    drawP(img, n, 80 + col * 160, 90 + row * 180, 7 + Math.random() * 4, base + (Math.random() - 0.5) * 30)
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

console.log(`\n✓ ${ok} Rasterkarten-Tests bestanden (schlechtester Klassen-Lauf ${worst}/32, max. ${maxMs} ms pro Bild)`)
