// Mini-Zeicheneditor: Datenmodell, SVG erzeugen und wieder einlesen (ohne DOM, in Node testbar).
//
// Zeichnung = { shapes: [{tag, a: {attribute}, text?}], bg: SVG-Text | '', grid: 0 | 1 }
// Erzeugtes SVG (bleibt beim Wiedereinlesen editierbar – auch nach dem Weg durch einen QR-Code):
//   <svg xmlns viewBox="0 0 400 300" data-dm-draw="1">
//     <rect …weiß/>  [<path data-grid="1" …/> Kästchen]  [<g data-bg="1"><svg …>Hintergrund</svg></g>]
//     <g data-s="1" stroke-linecap="round" stroke-linejoin="round" font-family="…">Formen</g>
//   </svg>
// Beim Einlesen werden nur bekannte Elemente/Attribute übernommen (Schutz vor eingeschleustem Code).
import { cleanSvg } from './media.js'

export const W = 400, H = 300, GRID = 20
export const COLORS = ['#17151f', '#2f5bea', '#e0393e', '#12925a', '#e8890c', '#7b3fe4']
export const WIDTHS = [2, 3.5, 6]

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|none|transparent)$/
const NUM_RE = /^-?\d+(\.\d+)?$/
const PATH_RE = /^[MmLlHhVvZzCcQqSsTtAa0-9 .,eE+-]+$/
const COMMON = { stroke: COLOR_RE, fill: COLOR_RE, 'stroke-width': NUM_RE, 'fill-opacity': NUM_RE, 'stroke-dasharray': /^[\d. ]+$/ }
const ALLOWED = {
  path: { d: PATH_RE },
  line: { x1: NUM_RE, y1: NUM_RE, x2: NUM_RE, y2: NUM_RE },
  rect: { x: NUM_RE, y: NUM_RE, width: NUM_RE, height: NUM_RE, rx: NUM_RE },
  ellipse: { cx: NUM_RE, cy: NUM_RE, rx: NUM_RE, ry: NUM_RE },
  text: { x: NUM_RE, y: NUM_RE, 'font-size': NUM_RE, 'font-weight': /^(bold|normal|\d{3})$/, 'text-anchor': /^(start|middle|end)$/ },
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k])
const r = (v) => Math.round(v * 10) / 10

/** Nur erlaubte Elemente/Attribute – sonst null */
export function sanitizeShape(tag, attrs, text) {
  const allow = ALLOWED[tag]
  if (!allow) return null
  const a = {}
  for (const [k, v] of Object.entries(attrs || {})) {
    const re = allow[k] || COMMON[k]
    if (re && re.test(String(v).trim())) a[k] = String(v).trim()
  }
  if (tag === 'text') { const t = String(text ?? '').slice(0, 80); if (!t.trim()) return null; return { tag, a, text: t } }
  if (tag === 'path' && !a.d) return null
  return { tag, a }
}

/** Douglas-Peucker für offene Linienzüge [[x,y],…] */
export function simplifyOpen(pts, eps = 0.8) {
  if (pts.length <= 2) return pts.slice()
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
    let md = -1, mi = -1
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]
      const d = len ? Math.abs(dy * (x - ax) - dx * (y - ay)) / len : Math.hypot(x - ax, y - ay)
      if (d > md) { md = d; mi = i }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Freihandlinie -> kompakter Pfad (erst absolut, dann relative Schritte) */
export function penPath(pts, eps = 0.8) {
  const p = simplifyOpen(pts, eps).map(([x, y]) => [Math.round(x), Math.round(y)])
  if (p.length === 1) p.push([p[0][0] + 0.1, p[0][1]]) // Punkt
  let d = `M${p[0][0]} ${p[0][1]}`
  for (let i = 1; i < p.length; i++) d += `l${r(p[i][0] - p[i - 1][0])} ${r(p[i][1] - p[i - 1][1])}`.replace(' -', '-')
  return d
}

/** Pfeil als ein Pfad: Linie + offene Spitze */
export function arrowPath(x1, y1, x2, y2, w = 2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len
  const hl = Math.min(len * 0.45, 9 + 2.2 * w), hw = hl * 0.55
  const bx = x2 - ux * hl, by = y2 - uy * hl
  return `M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}M${r(bx - uy * hw)} ${r(by + ux * hw)}L${r(x2)} ${r(y2)}L${r(bx + uy * hw)} ${r(by - ux * hw)}`
}

export const shapeToSvg = (s) => {
  const attrs = Object.entries(s.a).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')
  return s.tag === 'text' ? `<text${attrs}>${esc(s.text)}</text>` : `<${s.tag}${attrs}/>`
}

/** Kästchen-Raster als Pfad */
export function gridPath(step = GRID) {
  let d = ''
  for (let x = step; x < W; x += step) d += `M${x} 0V${H}`
  for (let y = step; y < H; y += step) d += `M0 ${y}H${W}`
  return d
}

/** Hintergrund-SVG -> als verschachteltes <svg>, das die Zeichenfläche ausfüllt */
function nestBg(bg) {
  const c = cleanSvg(bg)
  const open = /^<svg\b[^>]*>/i.exec(c)[0]
  const vb = /\sviewBox\s*=\s*"([^"]*)"/i.exec(open)?.[1] || `0 0 ${W} ${H}`
  const inner = c.slice(open.length, c.toLowerCase().lastIndexOf('</svg>'))
  return `<svg x="0" y="0" width="${W}" height="${H}" viewBox="${esc(vb)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`
}

/** Zeichnung -> SVG-Text */
export function buildDrawing({ shapes = [], bg = '', grid = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" data-dm-draw="1">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    (grid ? `<path data-grid="1" d="${gridPath()}" stroke="#d9d6e3" stroke-width="0.7"/>` : '') +
    (bg ? `<g data-bg="1">${nestBg(bg)}</g>` : '') +
    `<g data-s="1" stroke-linecap="round" stroke-linejoin="round" font-family="Helvetica,Arial,sans-serif">${shapes.map(shapeToSvg).join('')}</g></svg>`
}

const attrsOf = (s) => { const a = {}; for (const m of String(s).matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*"([^"]*)"/g)) a[m[1]] = unesc(m[2]); return a }

/**
 * SVG -> Zeichnung. Eigene Zeichnungen werden wieder in Formen zerlegt; jedes andere SVG wird zum Hintergrund.
 * @returns {{shapes:object[], bg:string, grid:0|1}}
 */
export function parseDrawing(svg) {
  if (!svg || !String(svg).trim()) return { shapes: [], bg: '', grid: 0 }
  const s = cleanSvg(svg)
  if (!/^<svg\b[^>]*data-dm-draw="1"/i.test(s)) return { shapes: [], bg: s, grid: 0 }
  const grid = /data-grid="1"/.test(s) ? 1 : 0
  let bg = ''
  const b0 = s.indexOf('<g data-bg="1">'), b1 = s.indexOf('</g><g data-s="1"')
  if (b0 >= 0 && b1 > b0) bg = s.slice(b0 + '<g data-bg="1">'.length, b1).replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  const s0 = s.indexOf('<g data-s="1"'), shapes = []
  if (s0 >= 0) {
    const body = s.slice(s.indexOf('>', s0) + 1, s.toLowerCase().lastIndexOf('</g>'))
    for (const m of body.matchAll(/<(path|line|rect|ellipse|text)\b([^>]*?)(?:\/>|>([^<]*)<\/text>)/g)) {
      const sh = sanitizeShape(m[1], attrsOf(m[2]), m[3] != null ? unesc(m[3]) : undefined)
      if (sh) shapes.push(sh)
    }
  }
  return { shapes, bg, grid }
}

/** Hintergrund für die Anzeige im Editor (als Bild – darin läuft nie Code) */
export const bgImageUrl = (bg) => (bg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bg) : '')
