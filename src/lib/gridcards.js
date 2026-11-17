// Kompatibilität mit den verbreiteten quadratischen Abstimmkarten mit 5×5-Muster („Rasterkarten“, Standardsatz Nr. 1–40,
// frei verfügbare Druckvorlage mit zwei Karten je Seite, Buchstaben A–D am Rand).
//
// Eine Rasterkarte ist ein 5×5-Raster: Ecken + innerer Ring immer schwarz, Mitte immer weiß,
// die übrigen 12 Randfelder kodieren Nummer und Ausrichtung. Gehalten wird sie wie eine Drehmoment-Karte:
// der gewählte Buchstabe zeigt nach OBEN.
//
// Erkennung (unabhängig vom QR-Weg in detect.js):
//  1. binarisiertes Bild in Zusammenhangskomponenten zerlegen (dunkel 8-, hell 4-Nachbarschaft)
//  2. Kandidat = dunkle Fläche mit GENAU EINEM Loch, Loch ≈ 1/25 der Karte und mittig
//  3. vier Ecken bestimmen (Ecken sind immer schwarz) -> Perspektive entzerren -> 5×5 Felder abtasten
//     (Schwelle aus der Karte selbst: Mitte = weiß, innerer Ring = schwarz)
//  4. mit allen 40 Karten in allen 4 Drehungen vergleichen -> Nummer + Buchstabe oben
//
// !!! PATTERNS NIE ÄNDERN – sie stammen aus den gedruckten Original-Karten (siehe test/gridcards.test.mjs) !!!

/** Kanonische Raster (Zeilen von oben, „A“ zeigt nach oben), Index = Kartennummer − 1. 1 = schwarz */
export const GRID_CARD_PATTERNS = [
  '1111111111110111111110101', '1111111111010111111111101', '1111111111010111111110001', '1111101111110111111111101',
  '1111101111110111111110001', '1111101111010111111111001', '1111101111010111111110101', '1101111111110111111111101',
  '1101111111110111111110001', '1101111111010111111111001', '1101111111010111111110101', '1101101111110111111111001',
  '1101101111110111111110101', '1101101111010111111111101', '1101101111010111111110001', '1110111111110111111111101',
  '1110111111110111111110001', '1110111111010111111111001', '1110111111010111111110101', '1110101111110111111111001',
  '1110101111110111111110101', '1110101111010111111111101', '1110101111010111111110001', '1100111111110111111111001',
  '1100111111110111111110101', '1100111111010111111111101', '1100111111010111111110001', '1100101111110111111111101',
  '1100101111110111111110001', '1100101111010111111111001', '1100101111010111111110101', '1111111111110101111111101',
  '1111111111110101111110001', '1111111111010101111111001', '1111111111010101111110101', '1111101111110101111111001',
  '1111101111110101111110101', '1111101111010101111111101', '1111101111010101111110001', '1101111111110101111111001',
]
export const GRID_CARD_MAX = GRID_CARD_PATTERNS.length

/** 5×5-Matrix (true = schwarz) einer Karte, kanonisch (A oben) – z. B. für Tests */
export function gridCardMatrix(n) {
  const p = GRID_CARD_PATTERNS[n - 1]
  if (!p) throw new Error('Rasterkarte ' + n + ' gibt es nicht (1–' + GRID_CARD_MAX + ')')
  return Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => p[r * 5 + c] === '1'))
}

const rotCW = (s) => { // 25-Zeichen-Raster um 90° im Uhrzeigersinn drehen
  let o = ''
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) o += s[(4 - c) * 5 + r]
  return o
}
// Alle 160 Lagen: Bitmaske -> {n, k}  (k = Drehungen im Uhrzeigersinn gegenüber „A oben“)
const VARIANTS = []
GRID_CARD_PATTERNS.forEach((p, i) => { let s = p; for (let k = 0; k < 4; k++) { VARIANTS.push({ n: i + 1, k, bits: parseInt(s, 2) }); s = rotCW(s) } })
const popcount = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24 }

/**
 * Sucht die passende Karte zu einem abgetasteten Raster (25 Bit, Zeile 0 = oben im Bild).
 * Exakt oder genau 1 Feld falsch, wenn eindeutig (Mindestabstand der Karten ist 2 Felder).
 * @returns {null | {n:number, k:number, dist:number}}
 */
export function matchGrid(bits) {
  let best = null, second = 99
  for (const v of VARIANTS) {
    const d = popcount(v.bits ^ bits)
    if (!best || d < best.dist) { if (best) second = best.dist; best = { n: v.n, k: v.k, dist: d } } else if (d < second) second = d
  }
  if (!best || best.dist > 1 || (best.dist === 1 && second <= 1)) return null
  return best
}

// ---------------------------------------------------------------------------
// Komponenten (Union-Find über Pixel)
// ---------------------------------------------------------------------------
function components(bin, w, h) {
  const n = w * h
  const parent = new Int32Array(n)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b } }
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x, v = bin[i]
      parent[i] = i
      if (x > 0 && bin[i - 1] === v) union(i, i - 1)
      if (y > 0) {
        if (bin[i - w] === v) union(i, i - w)
        if (v === 1) { // dunkel: auch diagonal verbunden
          if (x > 0 && bin[i - w - 1] === 1) union(i, i - w - 1)
          if (x < w - 1 && bin[i - w + 1] === 1) union(i, i - w + 1)
        }
      }
    }
  }
  return { parent, find }
}

/** Kandidaten: dunkle Fläche mit genau einem passenden Loch */
function candidates(bin, w, h, minHole) {
  const { parent, find } = components(bin, w, h)
  const n = w * h
  // Statistik je Wurzel
  const stat = new Map()
  for (let i = 0; i < n; i++) {
    const r = parent[i] === i ? i : find(i)
    parent[i] = r
    let s = stat.get(r)
    if (!s) { s = { dark: bin[i] === 1, area: 0, sx: 0, sy: 0, border: false, encl: -1, holes: [] }; stat.set(r, s) }
    const x = i % w, y = (i - x) / w
    s.area++; s.sx += x; s.sy += y
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) s.border = true
    else if (!s.dark && s.encl < 0) s.encl = parent[i - w] // Pixel über dem ersten Pixel des Lochs gehört zur umschließenden Fläche
  }
  for (const [r, s] of stat) {
    if (s.dark || s.border || s.encl < 0 || s.area < 2) continue
    const d = stat.get(find(s.encl))
    if (d && d.dark) d.holes.push({ r, ...s })
  }
  const out = []
  for (const [r, s] of stat) {
    if (!s.dark || s.area < 60 || !s.holes.length) continue
    const big = Math.max(...s.holes.map((x) => x.area))
    const holes = s.holes.filter((x) => x.area >= Math.max(2, big * 0.25))
    if (holes.length !== 1) continue
    const hole = holes[0]
    if (hole.area < minHole) continue
    const ratio = hole.area / s.area // ideal ~1/20 (24 dunkle Felder minus Kerben)
    if (ratio < 1 / 45 || ratio > 1 / 7) continue
    const hx = hole.sx / hole.area, hy = hole.sy / hole.area
    const cx = s.sx / s.area, cy = s.sy / s.area
    if (Math.hypot(hx - cx, hy - cy) > 0.45 * Math.sqrt(s.area)) continue
    out.push({ root: r, hx, hy, holeArea: hole.area, area: s.area })
  }
  return { out, parent }
}

/** Vier Ecken (im Uhrzeigersinn, beginnend oben links im Bild) */
function corners(parent, w, h, c) {
  const s = Math.sqrt(c.holeArea) // Feldgröße
  const R = 4.6 * s, R2 = R * R
  const x0 = Math.max(0, Math.floor(c.hx - R)), x1 = Math.min(w - 1, Math.ceil(c.hx + R))
  const y0 = Math.max(0, Math.floor(c.hy - R)), y1 = Math.min(h - 1, Math.ceil(c.hy + R))
  const pts = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (parent[y * w + x] !== c.root) continue
    const dx = x - c.hx, dy = y - c.hy
    if (dx * dx + dy * dy <= R2) pts.push(x, y)
  }
  if (pts.length < 40) return null
  const far = (fx, fy) => { let b = -1, bi = 0; for (let i = 0; i < pts.length; i += 2) { const d = (pts[i] - fx) ** 2 + (pts[i + 1] - fy) ** 2; if (d > b) { b = d; bi = i } } return [pts[bi], pts[bi + 1]] }
  const p1 = far(c.hx, c.hy)
  const p3 = far(p1[0], p1[1])
  // p2/p4: größter Abstand von der Diagonale p1–p3 auf beiden Seiten
  const ex = p3[0] - p1[0], ey = p3[1] - p1[1]
  let bp = 0, bn = 0, p2 = null, p4 = null
  for (let i = 0; i < pts.length; i += 2) {
    const cr = ex * (pts[i + 1] - p1[1]) - ey * (pts[i] - p1[0])
    if (cr > bp) { bp = cr; p2 = [pts[i], pts[i + 1]] }
    if (cr < bn) { bn = cr; p4 = [pts[i], pts[i + 1]] }
  }
  if (!p2 || !p4) return null
  // Pixel-Ecke -> Außenkante (Pixelmitte liegt eine halbe Einheit innen)
  const quad = [p1, p2, p3, p4].map(([x, y]) => { const dx = x - c.hx, dy = y - c.hy, l = Math.hypot(dx, dy) || 1; return { x: x + 0.5 + (dx / l) * 0.7, y: y + 0.5 + (dy / l) * 0.7 } })
  // Plausibel? Seiten ähnlich lang, Diagonalen ähnlich, Kantenlänge ≈ 5 Felder
  const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const sides = [0, 1, 2, 3].map((i) => len(quad[i], quad[(i + 1) % 4]))
  const mn = Math.min(...sides), mx = Math.max(...sides)
  if (mx / mn > 1.6) return null
  const avg = sides.reduce((a, b) => a + b, 0) / 4
  if (avg / s < 3.4 || avg / s > 7.5) return null
  // im Uhrzeigersinn ordnen (Bild: y nach unten), Start = Ecke links oben
  const mxp = quad.reduce((a, p) => a + p.x, 0) / 4, myp = quad.reduce((a, p) => a + p.y, 0) / 4
  quad.sort((a, b) => Math.atan2(a.y - myp, a.x - mxp) - Math.atan2(b.y - myp, b.x - mxp))
  // atan2 aufsteigend = im Uhrzeigersinn (y unten). Start: Ecke mit Winkel am nächsten an -135°
  let start = 0, bestD = 9
  quad.forEach((p, i) => { const a = Math.atan2(p.y - myp, p.x - mxp); const d = Math.abs(((a + (3 * Math.PI) / 4 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (d < bestD) { bestD = d; start = i } })
  return [0, 1, 2, 3].map((i) => quad[(start + i) % 4])
}

/** Projektive Abbildung Einheitsquadrat -> Viereck (Heckbert) */
function squareToQuad([p0, p1, p2, p3]) {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y
  let g = 0, hh = 0
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y
  return (u, v) => { const z = g * u + hh * v + 1; return [(a * u + b * v + c) / z, (d * u + e * v + f) / z] }
}

/** 5×5 Felder abtasten -> 25-Bit-Maske (Zeile 0 = Bildkante p0–p1) oder null */
function sampleGrid(gray, w, h, quad, c) {
  const map = squareToQuad(quad)
  // Loch muss genau in der Mitte liegen und etwa ein Feld groß sein
  const [mx, my] = map(0.5, 0.5)
  const area = Math.abs(quad.reduce((a, p, i) => { const q = quad[(i + 1) % 4]; return a + p.x * q.y - q.x * p.y }, 0)) / 2
  const cell = Math.sqrt(area) / 5
  if (Math.hypot(mx - c.hx, my - c.hy) > 0.45 * cell) return null
  const hr = c.holeArea / (cell * cell)
  if (hr < 0.35 || hr > 1.8) return null
  const vals = new Float32Array(25)
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    let sum = 0, cnt = 0
    for (const fy of [0.3, 0.5, 0.7]) for (const fx of [0.3, 0.5, 0.7]) {
      const [x, y] = map((c + fx) / 5, (r + fy) / 5)
      const xi = Math.round(x), yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null
      sum += gray[yi * w + xi]; cnt++
    }
    vals[r * 5 + c] = sum / cnt
  }
  const white = vals[12]
  const ring = [6, 7, 8, 11, 13, 16, 17, 18].map((i) => vals[i])
  const black = ring.reduce((a, b) => a + b, 0) / 8
  if (white - black < 25 || Math.max(...ring) > white - 15) return null
  const thr = (white + black) / 2
  // Papierrand: rund um das Raster muss es überwiegend hell sein (filtert Ausschnitte aus QR-Codes u. ä.)
  let light = 0, total = 0
  for (let i = 0; i < 5; i++) for (const [u, v] of [[(i + 0.5) / 5, -0.07], [(i + 0.5) / 5, 1.07], [-0.07, (i + 0.5) / 5], [1.07, (i + 0.5) / 5]]) {
    const [x, y] = map(u, v)
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue
    total++
    if (gray[yi * w + xi] > thr) light++
  }
  if (total < 12 || light < total * 0.7) return null
  let bits = 0
  for (let i = 0; i < 25; i++) bits = bits * 2 + (vals[i] < thr ? 1 : 0)
  return bits >>> 0
}

const LETTER_FOR_K = ['A', 'D', 'C', 'B'] // Karte k-mal im Uhrzeigersinn gedreht -> Buchstabe oben

/**
 * Findet Rasterkarten. bin: 1 = dunkel (gleiche Binarisierung wie für QR), gray: Graustufen.
 * @returns {{card:number, gridCard:true, answer:string|null, angle:number, quad:{x,y}[], dist:number}[]}
 */
export function detectGridCardsIn(gray, bin, w, h, { tolerance = 30, scale = 1 } = {}) {
  const { out, parent } = candidates(bin, w, h, 4)
  const res = []
  for (const c of out) {
    const q = corners(parent, w, h, c)
    if (!q) continue
    const bits = sampleGrid(gray, w, h, q, c)
    if (bits == null) continue
    const m = matchGrid(bits)
    if (!m) continue
    // Ecke, an der bei „A oben“ die linke obere bzw. linke untere Ecke liegt
    const tl = q[m.k % 4], bl = q[(m.k + 3) % 4]
    let deg = (Math.atan2(tl.x - bl.x, -(tl.y - bl.y)) * 180) / Math.PI
    deg = (deg + 360) % 360
    const idx = Math.round(deg / 90) % 4
    let dev = Math.abs(deg - idx * 90)
    if (dev > 180) dev = 360 - dev
    res.push({
      card: m.n, gid: null, gridCard: true, dist: m.dist,
      answer: dev <= tolerance ? LETTER_FOR_K[idx] : null,
      angle: Math.round(deg),
      quad: q.map((p) => ({ x: p.x * scale, y: p.y * scale })),
    })
  }
  return res
}
