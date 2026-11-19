// Kern der Kartenerkennung von Drehmoment.
//
// jsQR kann nur EINEN Code pro Bild lesen. Für eine ganze Klasse gehen wir deshalb so vor:
//  1. Bild adaptiv binarisieren
//  2. alle QR-Suchmuster (Finder, Verhältnis 1:1:3:1:1) finden
//  3. Suchmuster zu Dreiecken gruppieren (alle Karten sind QR-Version 1 -> feste Geometrie)
//  4. jeden Code einzeln ausschneiden (Umgebung weiß) und mit jsQR dekodieren
//  5. aus der Lage der Ecken die Drehung -> Antwort A/B/C/D bestimmen
import jsQRModule from 'jsqr'
import { parseCardCode } from './cardcode.js'
import { detectGridCardsIn } from './gridcards.js'
export { GID_PREFIX, GID_RE, normalizeGid } from './gid.js'

// CJS-Interop (Node vs. Vite)
const jsQR = typeof jsQRModule === 'function' ? jsQRModule : jsQRModule.default

export { CARD_PREFIX, CARD_RE, parseCardCode, cardRotation } from './cardcode.js'

export const LETTERS = ['A', 'B', 'C', 'D']

// Drehung des Codes (im Uhrzeigersinn, in 90°-Schritten) -> welche Kartenkante oben ist.
// Gedruckte Karte: A oben, B rechts, C unten, D links.
const ROTATION_TO_LETTER = ['A', 'D', 'C', 'B']

/** Bestimmt Antwortbuchstabe + Winkel aus einer jsQR-Location. */
/** rot = gedruckter Versatz des QR-Codes gegen die Karte (seit 0.5, siehe cardcode.js) */
export function orientation(loc, tolerance = 30, rot = 0) {
  const ux = loc.topLeftCorner.x - loc.bottomLeftCorner.x
  const uy = loc.topLeftCorner.y - loc.bottomLeftCorner.y
  // 0° = Code steht aufrecht, positiv = im Uhrzeigersinn gedreht
  let deg = (Math.atan2(ux, -uy) * 180) / Math.PI
  deg = (deg + 360) % 360
  const idx = Math.round(deg / 90) % 4, k = (idx - rot + 4) % 4
  let dev = Math.abs(deg - idx * 90)
  if (dev > 180) dev = 360 - dev
  return { letter: dev <= tolerance ? ROTATION_TO_LETTER[k] : null, angle: deg, deviation: dev }
}

// ---------------------------------------------------------------------------
// 1. Binarisierung (Mittelwert in lokalem Fenster über ein Integralbild)
// ---------------------------------------------------------------------------
function toGray(data, width, height) {
  const n = width * height
  const gray = new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8
  return gray
}
function binarize(gray, width, height, radius = 0) {
  const n = width * height
  const W1 = width + 1
  const integral = new Uint32Array(W1 * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]
      integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row
    }
  }
  const r = radius || Math.max(6, Math.round(Math.min(width, height) / 24))
  const bin = new Uint8Array(n) // 1 = dunkel
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(height, y + r + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(width, x + r + 1)
      const sum = integral[y1 * W1 + x1] - integral[y0 * W1 + x1] - integral[y1 * W1 + x0] + integral[y0 * W1 + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      bin[y * width + x] = gray[y * width + x] < mean * 0.88 ? 1 : 0
    }
  }
  return bin
}

// ---------------------------------------------------------------------------
// 2. Suchmuster finden
// ---------------------------------------------------------------------------
function ratioOk(c) {
  const total = c[0] + c[1] + c[2] + c[3] + c[4]
  if (total < 7) return false
  const m = total / 7, v = m * 0.6
  return Math.abs(m - c[0]) < v && Math.abs(m - c[1]) < v && Math.abs(3 * m - c[2]) < 3 * v &&
    Math.abs(m - c[3]) < v && Math.abs(m - c[4]) < v
}

/** Läuft von (cx,cy) aus in Richtung (dx,dy) und prüft das 1:1:3:1:1-Muster. Liefert {center, total} */
function crossCheck(bin, width, height, cx, cy, dx, dy, maxCount) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? bin[y * width + x] : -1)
  const c = [0, 0, 0, 0, 0]
  let x = cx, y = cy
  // rückwärts: Zentrum (dunkel), hell, dunkel
  while (at(x, y) === 1) { c[2]++; x -= dx; y -= dy }
  if (at(x, y) === -1) return null
  while (at(x, y) === 0 && c[1] <= maxCount) { c[1]++; x -= dx; y -= dy }
  if (at(x, y) === -1 || c[1] > maxCount) return null
  while (at(x, y) === 1 && c[0] <= maxCount) { c[0]++; x -= dx; y -= dy }
  if (c[0] > maxCount) return null
  x = cx + dx; y = cy + dy
  while (at(x, y) === 1) { c[2]++; x += dx; y += dy }
  if (at(x, y) === -1) return null
  const startBack = c[2]
  void startBack
  while (at(x, y) === 0 && c[3] <= maxCount) { c[3]++; x += dx; y += dy }
  if (at(x, y) === -1 || c[3] > maxCount) return null
  while (at(x, y) === 1 && c[4] <= maxCount) { c[4]++; x += dx; y += dy }
  if (c[4] > maxCount) return null
  if (!ratioOk(c)) return null
  const total = c[0] + c[1] + c[2] + c[3] + c[4]
  // Endpunkt minus äußere Läufe -> Mitte des Zentrums
  const steps = c[3] + c[4] + c[2] / 2 // vom Ende zurück bis Mitte
  return { cx: x - dx * steps, cy: y - dy * steps, total }
}

export function findFinderPatterns(bin, width, height) {
  const cands = []
  for (let y = 0; y < height; y += 1) {
    const c = [0, 0, 0, 0, 0]
    let state = 0
    const row = y * width
    for (let x = 0; x <= width; x++) {
      const dark = x < width ? bin[row + x] === 1 : false
      if (dark) {
        if (state === 1 || state === 3) state++
        c[state]++
      } else {
        if (state === 0 || state === 2 || state === 4) {
          if (state === 4) {
            if (ratioOk(c)) {
              const total = c[0] + c[1] + c[2] + c[3] + c[4]
              const cx = Math.round(x - c[4] - c[3] - c[2] / 2)
              tryCandidate(bin, width, height, cx, y, total, cands)
            }
            // Fenster verschieben: die letzten zwei Läufe werden die ersten
            c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0; state = 3
            continue
          }
          if (c[state] > 0) state++
          if (state > 0) c[state]++
        } else c[state]++
      }
    }
  }
  return mergeCandidates(cands)
}

function tryCandidate(bin, width, height, cx, cy, hTotal, cands) {
  const max = Math.ceil(hTotal)
  const v = crossCheck(bin, width, height, cx, cy, 0, 1, max)
  if (!v) return
  if (Math.abs(v.total - hTotal) > 0.6 * hTotal) return
  const vy = Math.round(v.cy)
  const h = crossCheck(bin, width, height, cx, vy, 1, 0, max)
  if (!h) return
  // diagonal prüfen (filtert Textzeilen u. ä.)
  const d = crossCheck(bin, width, height, Math.round(h.cx), vy, 1, 1, max)
  if (!d) return
  cands.push({ x: h.cx, y: v.cy, module: (h.total + v.total) / 14, count: 1 })
}

function mergeCandidates(cands) {
  const out = []
  for (const c of cands) {
    const hit = out.find((o) => Math.hypot(o.x - c.x, o.y - c.y) < Math.max(o.module, c.module) * 2.5 &&
      Math.abs(o.module - c.module) < Math.max(o.module, c.module) * 0.6)
    if (hit) {
      const n = hit.count
      hit.x = (hit.x * n + c.x) / (n + 1)
      hit.y = (hit.y * n + c.y) / (n + 1)
      hit.module = (hit.module * n + c.module) / (n + 1)
      hit.count++
    } else out.push({ ...c })
  }
  return out.filter((c) => c.count >= 2)
}

// ---------------------------------------------------------------------------
// 3. Gruppieren zu Codes (Version 1: Abstand der Suchmuster = 14 Module)
// ---------------------------------------------------------------------------
export function groupPatterns(pats) {
  const triples = []
  for (let i = 0; i < pats.length; i++) {
    const p = pats[i]
    for (let j = 0; j < pats.length; j++) {
      if (j === i) continue
      const q = pats[j]
      if (!similar(p.module, q.module)) continue
      const dq = Math.hypot(q.x - p.x, q.y - p.y)
      const rq = dq / ((p.module + q.module) / 2)
      if (rq < 7 || rq > 22) continue
      for (let k = j + 1; k < pats.length; k++) {
        if (k === i) continue
        const r = pats[k]
        if (!similar(p.module, r.module)) continue
        const dr = Math.hypot(r.x - p.x, r.y - p.y)
        const lenRatio = dq / dr
        if (lenRatio < 0.75 || lenRatio > 1.33) continue
        const cos = ((q.x - p.x) * (r.x - p.x) + (q.y - p.y) * (r.y - p.y)) / (dq * dr)
        if (Math.abs(cos) > 0.35) continue
        triples.push({ i, j, k, score: Math.abs(1 - lenRatio) + Math.abs(cos) })
      }
    }
  }
  triples.sort((a, b) => a.score - b.score)
  const used = new Set(), out = []
  for (const t of triples) {
    if (used.has(t.i) || used.has(t.j) || used.has(t.k)) continue
    used.add(t.i); used.add(t.j); used.add(t.k)
    out.push([pats[t.i], pats[t.j], pats[t.k]])
  }
  return out
}
const similar = (a, b) => Math.max(a, b) / Math.min(a, b) < 1.6

// ---------------------------------------------------------------------------
// 4. Ausschneiden + Dekodieren
// ---------------------------------------------------------------------------
/** Viereck (in Modulkoordinaten -m..21+m) für ein Suchmuster-Dreieck */
function tripleQuad([p, q, r], margin) {
  const e1 = { x: (q.x - p.x) / 14, y: (q.y - p.y) / 14 }
  const e2 = { x: (r.x - p.x) / 14, y: (r.y - p.y) / 14 }
  const pt = (a, b) => ({ x: p.x + (a - 3.5) * e1.x + (b - 3.5) * e2.x, y: p.y + (a - 3.5) * e1.y + (b - 3.5) * e2.y })
  const lo = -margin, hi = 21 + margin
  return [pt(lo, lo), pt(hi, lo), pt(hi, hi), pt(lo, hi)]
}

function insideQuad(q, x, y, sign) {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4]
    if (sign * ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) < 0) return false
  }
  return true
}
function quadSign(q) {
  let area = 0
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; area += a.x * b.y - b.x * a.y }
  return area >= 0 ? 1 : -1
}

function decodeCrop(data, width, height, quad) {
  const minX = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...quad.map((p) => p.x))))
  const minY = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...quad.map((p) => p.y))))
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  if (cw < 21 || ch < 21) return null
  const crop = new Uint8ClampedArray(cw * ch * 4).fill(255)
  const sign = quadSign(quad)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!insideQuad(quad, x + minX, y + minY, sign)) continue
      const s = ((y + minY) * width + x + minX) * 4, d = (y * cw + x) * 4
      crop[d] = data[s]; crop[d + 1] = data[s + 1]; crop[d + 2] = data[s + 2]
    }
  }
  const r = jsQR(crop, cw, ch, { inversionAttempts: 'dontInvert' })
  if (!r) return null
  const off = (p) => ({ x: p.x + minX, y: p.y + minY })
  const l = r.location
  return {
    data: r.data,
    location: {
      topLeftCorner: off(l.topLeftCorner), topRightCorner: off(l.topRightCorner),
      bottomRightCorner: off(l.bottomRightCorner), bottomLeftCorner: off(l.bottomLeftCorner),
    },
  }
}

function toResult(r, tolerance) {
  const p = parseCardCode(r.data)
  if (!p) return null
  const loc = r.location
  const o = orientation(loc, tolerance, p.rot)
  return {
    card: p.card,
    gid: p.gid,
    answer: o.letter,
    angle: Math.round(o.angle),
    quad: [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner].map((p) => ({ x: p.x, y: p.y })),
  }
}

/** Grauwerte auf 1/f verkleinern (Mittelwert) */
function shrink(gray, w, h, f) {
  const sw = Math.floor(w / f), sh = Math.floor(h / f), out = new Uint8Array(sw * sh), ff = f * f
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let s = 0
    for (let dy = 0; dy < f; dy++) { const row = (y * f + dy) * w + x * f; for (let dx = 0; dx < f; dx++) s += gray[row + dx] }
    out[y * sw + x] = s / ff
  }
  return { g: out, w: sw, h: sh }
}

/**
 * Rasterkarten (5×5, Nr. 1–40): volle Auflösung (viele kleine Karten) + verkleinert (große Karte nah an der Kamera –
 * dort zerfällt die schwarze Fläche bei lokaler Binarisierung sonst in Stücke).
 */
export function detectGridCards(gray, bin, width, height, tolerance = 30) {
  const found = new Map()
  for (const p of detectGridCardsIn(gray, bin, width, height, { tolerance })) if (!found.has(p.card) || p.dist < found.get(p.card).dist) found.set(p.card, p)
  const f = Math.max(2, Math.round(Math.min(width, height) / 240))
  const s = shrink(gray, width, height, f)
  for (const p of detectGridCardsIn(s.g, binarize(s.g, s.w, s.h, Math.round(Math.min(s.w, s.h) / 5)), s.w, s.h, { tolerance, scale: f })) if (!found.has(p.card)) found.set(p.card, p)
  return [...found.values()]
}

/**
 * Findet alle Drehmoment-Karten (und Rasterkarten 1–40) in einem RGBA-Bild.
 * @returns {{card:number|null, gid:string|null, answer:'A'|'B'|'C'|'D'|null, angle:number, quad:{x,y}[], gridCard?:true}[]}
 *   card = Nummernkarte „DM:n“ bzw. Rasterkarte n · gid = feste Schüler-Karte „DM-XXXXXXX“ (dann card = null)
 *   opts.gridCards = false schaltet die Rasterkarten-Erkennung ab
 */
export function detectCards(data, width, height, opts = {}) {
  const { tolerance = 30, gridCards = true } = opts
  const gray = toGray(data, width, height)
  const bin = binarize(gray, width, height)
  const pats = findFinderPatterns(bin, width, height)
  const groups = groupPatterns(pats)
  const found = new Map()
  for (const g of groups) {
    let r = decodeCrop(data, width, height, tripleQuad(g, 3))
    if (!r) r = decodeCrop(data, width, height, tripleQuad(g, 5))
    const res = r && toResult(r, tolerance)
    if (res && !found.has(res.gid || res.card)) found.set(res.gid || res.card, res)
  }
  if (gridCards) for (const p of detectGridCards(gray, bin, width, height, tolerance)) if (!found.has(p.card)) found.set(p.card, p)
  // Fallback: einzelne große Karte direkt vor der Kamera
  if (found.size === 0) {
    const r = jsQR(data, width, height, { inversionAttempts: 'dontInvert' })
    const res = r && toResult(r, tolerance)
    if (res) found.set(res.gid || res.card, res)
  }
  return [...found.values()]
}
