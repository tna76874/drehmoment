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
t('zwei große Karten nah an der Kamera gleichzeitig (verkleinerter Suchlauf)', () => {
  for (const base of [0, 90, 180, 270]) {
    const img = new Uint8ClampedArray(W * H * 4).fill(50)
    drawMatrix(img, cardFace(3).m, 330, 360, 22, base + 4, 1, 2); drawMatrix(img, cardFace('17DWY6F').m, 950, 360, 21, base - 5, 1, 2); camera(img, 20)
    const r = detectCards(img, W, H)
    const got = Object.fromEntries(r.map((x) => [x.gid || x.card, x.answer]))
    assert.deepEqual(got, { 3: EXPECT[base], '17DWY6F': EXPECT[base] }, `${base}°`)
  }
})
t('Hinweise aus dem letzten Bild: schnelles Zwischenbild liest Karten an der alten Stelle (auch leicht verschoben)', () => {
  const img = blank(); draw(img, 7, 400, 300, 9, 90); draw(img, 8, 900, 400, 9, 180); camera(img, 20)
  const full = detectCards(img, W, H)
  assert.equal(full.length, 2)
  const moved = blank(); draw(moved, 7, 420, 288, 9, 96); draw(moved, 8, 885, 410, 9, 176); camera(moved, 20)
  const fast = detectCards(moved, W, H, { hints: full.map((c) => c.quad), hintsOnly: true })
  assert.deepEqual(Object.fromEntries(fast.map((c) => [c.card, c.answer])), { 7: 'D', 8: 'C' })
  assert.deepEqual(detectCards(blank(), W, H, { hints: full.map((c) => c.quad), hintsOnly: true }), [], 'Karte weg -> nichts')
  const both = detectCards(moved, W, H, { hints: [full[0].quad] })
  assert.equal(both.length, 2, 'mit Hinweisen + Suche: alle Karten')
})
t('kaputte/unsinnige Hinweise stören nicht (außerhalb des Bilds, leer, entartet, NaN)', () => {
  const img = blank(); draw(img, 9, 640, 360, 9, 270); camera(img, 20)
  const junk = [[], null, [{ x: -500, y: -500 }, { x: -400, y: -500 }, { x: -400, y: -400 }, { x: -500, y: -400 }],
    [{ x: 5000, y: 5000 }, { x: 6000, y: 5000 }, { x: 6000, y: 6000 }, { x: 5000, y: 6000 }],
    [{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 }],
    [{ x: NaN, y: 1 }, { x: 2, y: NaN }, { x: 3, y: 3 }, { x: 1, y: 3 }], [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]]
  const r = detectCards(img, W, H, { hints: junk })
  assert.deepEqual(r.map((c) => [c.card, c.answer]), [[9, 'B']])
  const fast = detectCards(img, W, H, { hints: junk.slice(0, 6), hintsOnly: true })
  assert.deepEqual(fast, [], 'nur Unsinn als Hinweis -> nichts')
})
t('keine Phantomkarten in Bildern ohne Karten (Rauschen, Streifen, Schachbrett, Text-ähnliche Blöcke, fremde QR-Codes)', () => {
  let seed = 11
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const imgs = []
  { const f = blank(); for (let i = 0; i < f.length; i += 4) f[i] = f[i + 1] = f[i + 2] = rnd() * 255; imgs.push(f) }
  { const f = blank(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; f[o] = f[o + 1] = f[o + 2] = (x >> 3) % 2 ? 20 : 235 } imgs.push(f) }
  { const f = blank(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; f[o] = f[o + 1] = f[o + 2] = ((x >> 4) + (y >> 4)) % 2 ? 20 : 235 } imgs.push(f) }
  for (let k = 0; k < 4; k++) {
    const f = blank()
    for (let i = 0; i < 400; i++) { const x0 = rnd() * W, y0 = rnd() * H, w = 3 + rnd() * 40, h = 3 + rnd() * 25, g = rnd() < 0.5 ? 20 : 240
      for (let y = y0; y < Math.min(H, y0 + h); y++) for (let x = x0; x < Math.min(W, x0 + w); x++) { const o = (Math.floor(y) * W + Math.floor(x)) * 4; f[o] = f[o + 1] = f[o + 2] = g } }
    camera(f, 20); imgs.push(f)
  }
  for (const data of ['DMQ:R80:U00.6S', 'DM:1000', 'DM*7', 'DM-17DWY6U', 'hallo']) {
    const qr = qrcode(0, 'M'); qr.addData(data); qr.make()
    const m = Array.from({ length: qr.getModuleCount() }, (_, r) => Array.from({ length: qr.getModuleCount() }, (_, c) => qr.isDark(r, c)))
    const f = blank(); drawMatrix(f, m, 640, 360, 9, 0); camera(f, 20); imgs.push(f)
  }
  imgs.forEach((f, i) => assert.deepEqual(detectCards(f, W, H), [], `Bild ${i}`))
})
t('Zeitbudget + Zwischenbilder: ganze Klasse < 1,5 s; Zwischenbild liest (fast) alle Karten und ist schneller (6 Durchläufe)', () => {
  let missed = 0, total = 0, tFull = 0, tFast = 0
  for (let run = 0; run < 6; run++) {
    const img = blank()
    for (let n = 1; n <= 32; n++) drawMatrix(img, cardFace(n).m, 80 + ((n - 1) % 8) * 160, 90 + Math.floor((n - 1) / 8) * 180, 4 + (run % 3) * 0.6, 7 - run * 3)
    camera(img)
    let t0 = performance.now(); const full = detectCards(img, W, H); const dFull = performance.now() - t0
    t0 = performance.now(); const fast = detectCards(img, W, H, { hints: full.map((c) => c.quad), hintsOnly: true }); const dFast = performance.now() - t0
    assert.ok(full.length >= 30, `Vollbild ${full.length}/32`)
    assert.ok(dFull < 1500, `Vollbild ${dFull} ms`)
    for (const c of fast) assert.equal(c.answer, full.find((f) => f.card === c.card)?.answer, `Karte ${c.card}: Zwischenbild = Vollbild`)
    missed += full.length - fast.length; total += full.length; tFull += dFull; tFast += dFast
  }
  assert.ok(missed <= 1, `Zwischenbilder verpassen ${missed} von ${total} Karten`)
  assert.ok(tFast < tFull * 0.8, `Zwischenbild ${Math.round(tFast / 6)} ms vs. Vollbild ${Math.round(tFull / 6)} ms`)
  console.log(`      Ø Vollbild ${Math.round(tFull / 6)} ms · Ø Zwischenbild ${Math.round(tFast / 6)} ms · verpasst ${missed}/${total}`)
})

console.log('Ganze Klasse (32 Karten, kleine Module, zufällige Antworten), 6 Durchläufe (abwechselnd alte/gedrehte Karten):')
let worst = 99, maxMs = 0
for (let run = 0; run < 6; run++) {
  const img = blank(), truth = {}
  let n = 1
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++, n++) {
    const base = [0, 90, 180, 270][Math.floor(Math.random() * 4)]
    truth[n] = EXPECT[base]
    drawMatrix(img, run % 2 ? cardFace(n).m : cardMatrix(n), 80 + col * 160, 90 + row * 180, 3.6 + Math.random() * 1.2, base + (Math.random() - 0.5) * 30) // abwechselnd alte und gedrehte Karten
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
