// 3D-Darstellungen für analytische Geometrie: Vektoren, Punkte, Strecken, Geraden, Ebenen, Flächen.
// Teil des Graph-Formats: { "space": { … } } (siehe GRAPH_HELP in format.js). Reine Funktionen, ohne DOM.
//
// Projektion Standard „Schrägbild“ wie im Schulheft: x₁ nach vorne-links (45°, Einheit ½√2), x₂ nach rechts, x₃ nach oben.
// Alternativ "view": [Azimut, Höhe] in Grad -> senkrechte Parallelprojektion (z. B. [30, 20]).

const num = (v, d) => (v !== null && v !== '' && Number.isFinite(+v) ? +v : d)
const str = (s, max = 20) => String(s ?? '').slice(0, max)
const arr = (a) => (Array.isArray(a) ? a : a == null ? [] : [a])
const vec3 = (v) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => Number.isFinite(+x)) ? [+v[0], +v[1], +v[2]] : null)
const range = (r) => (Array.isArray(r) && r.length === 2 && Number.isFinite(+r[0]) && Number.isFinite(+r[1]) && +r[1] > +r[0] ? [+r[0], +r[1]] : null)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const r1 = (v) => Math.round(v * 10) / 10

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Prüft/vereinheitlicht die 3D-Beschreibung */
export function normalizeSpace(sp) {
  if (!sp || typeof sp !== 'object') throw new Error('3D: Objekt erwartet')
  const o = {}
  const all = range(sp.range)
  for (const k of ['x', 'y', 'z']) { const r = range(sp[k]) || all; if (r) o[k] = r }
  if (Array.isArray(sp.view) && sp.view.length === 2 && sp.view.every((v) => Number.isFinite(+v))) o.view = [+sp.view[0], +sp.view[1]]
  const pts = arr(sp.points).filter((p) => vec3(p))
  if (pts.length) o.points = pts.slice(0, 30).map((p) => [...vec3(p), ...(p[3] != null ? [str(p[3])] : [])])
  const vs = arr(sp.vectors).map((v) => (Array.isArray(v) ? { v: v.slice(0, 3), label: v[3] } : v)).filter((v) => v && (vec3(v.v) || (vec3(v.to) && true)))
  if (vs.length) o.vectors = vs.slice(0, 20).map((v) => {
    const from = vec3(v.from) || [0, 0, 0]
    const d = vec3(v.v) || sub(vec3(v.to), from)
    return { ...(vec3(v.from) ? { from } : {}), v: d, ...(v.label ? { label: str(v.label) } : {}), ...(v.color ? { color: str(v.color, 10) } : {}), ...(v.dash ? { dash: 1 } : {}) }
  })
  const segs = arr(sp.segments).filter((s) => Array.isArray(s) && s.slice(0, 6).every((x) => Number.isFinite(+x)))
  if (segs.length) o.segments = segs.slice(0, 40).map((s) => [...s.slice(0, 6).map(Number), ...(s[6] ? [str(s[6], 10)] : [])])
  const lines = arr(sp.lines).filter((l) => l && vec3(l.p) && vec3(l.d) && dot(vec3(l.d), vec3(l.d)) > 0)
  if (lines.length) o.lines = lines.slice(0, 10).map((l) => ({ p: vec3(l.p), d: vec3(l.d), ...(l.label ? { label: str(l.label) } : {}), ...(l.color ? { color: str(l.color, 10) } : {}), ...(l.dash ? { dash: 1 } : {}) }))
  const planes = arr(sp.planes).map(planeOf).filter(Boolean)
  if (planes.length) o.planes = planes.slice(0, 6)
  const polys = arr(sp.polygons).filter((pg) => Array.isArray(pg) && pg.length >= 3 && pg.every(vec3))
  if (polys.length) o.polygons = polys.slice(0, 20).map((pg) => pg.slice(0, 30).map(vec3))
  if (sp.axes !== undefined) o.axes = sp.axes ? 1 : 0
  if (sp.ticks !== undefined) o.ticks = sp.ticks ? 1 : 0
  if (sp.box) o.box = 1
  if (sp.guides) o.guides = 1
  if (Array.isArray(sp.names) && sp.names.length === 3) o.names = sp.names.map((n) => str(n, 6))
  if (!o.points && !o.vectors && !o.segments && !o.lines && !o.planes && !o.polygons) throw new Error('3D-Bild ist leer (vectors, points, lines, planes …)')
  return o
}

/** Ebene in jeder Schreibweise -> {n, d, …}: Normalenform n·x = d, Parameterform p + r·u + s·v, drei Punkte */
function planeOf(e) {
  if (!e || typeof e !== 'object') return null
  let n = vec3(e.n), d = num(e.d, null)
  if (n && d === null && vec3(e.p)) d = dot(n, vec3(e.p))
  if (!n && vec3(e.p) && vec3(e.u) && vec3(e.v)) { n = cross(vec3(e.u), vec3(e.v)); d = dot(n, vec3(e.p)) }
  if (!n && Array.isArray(e.points) && e.points.length >= 3 && e.points.every(vec3)) {
    const [a, b, c] = e.points.map(vec3); n = cross(sub(b, a), sub(c, a)); d = dot(n, a)
  }
  if (!n || d === null || dot(n, n) < 1e-12) return null
  return { n, d, ...(e.label ? { label: str(e.label) } : {}), ...(e.color ? { color: str(e.color, 10) } : {}), ...(e.trace ? { trace: 1 } : {}) }
}

// ------------------------------------------------------------------ Zeichnen
const PALETTE = { blue: '#2f5bea', red: '#e0393e', green: '#12925a', orange: '#e8890c', purple: '#7b3fe4', black: '#17151f', gray: '#7a7686',
  blau: '#2f5bea', rot: '#e0393e', 'grün': '#12925a', gruen: '#12925a', violett: '#7b3fe4', lila: '#7b3fe4', schwarz: '#17151f', grau: '#7a7686' }
const AUTO = ['#2f5bea', '#e0393e', '#12925a', '#e8890c', '#7b3fe4']
const color = (c, i) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(c) ? c : PALETTE[String(c || '').toLowerCase()] || AUTO[i % AUTO.length])
const subDigits = (s) => String(s).replace(/_?([0-9])/g, (m, d) => '₀₁₂₃₄₅₆₇₈₉'[d])

/** Schnittpolygon einer Ebene mit dem Quader [x]×[y]×[z] (konvex, sortiert) */
function clipPlane(pl, box) {
  const [X, Y, Z] = box
  const corners = []
  for (const x of X) for (const y of Y) for (const z of Z) corners.push([x, y, z])
  const edges = []
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const a = corners[i], b = corners[j]; if ((a[0] !== b[0]) + (a[1] !== b[1]) + (a[2] !== b[2]) === 1) edges.push([a, b]) }
  const pts = []
  for (const [a, b] of edges) {
    const fa = dot(pl.n, a) - pl.d, fb = dot(pl.n, b) - pl.d
    if (Math.abs(fa) < 1e-9) pts.push(a)
    if (fa * fb < 0) pts.push(add(a, mul(sub(b, a), fa / (fa - fb))))
  }
  const uniq = pts.filter((p, i) => pts.findIndex((q) => Math.hypot(...sub(p, q)) < 1e-7) === i)
  if (uniq.length < 3) return null
  const c = mul(uniq.reduce(add, [0, 0, 0]), 1 / uniq.length)
  const e1 = sub(uniq[0], c), e2 = cross(pl.n, e1)
  return uniq.sort((p, q) => Math.atan2(dot(sub(p, c), e2), dot(sub(p, c), e1)) - Math.atan2(dot(sub(q, c), e2), dot(sub(q, c), e1)))
}

/** Spurdreieck/-vieleck: Schnittpunkte mit den Achsen (nur wenn sinnvoll) */
function tracePoly(pl) {
  const s = [0, 1, 2].map((i) => (Math.abs(pl.n[i]) > 1e-12 ? pl.d / pl.n[i] : null))
  if (s.every((v) => v !== null && Math.abs(v) > 1e-12)) return [[s[0], 0, 0], [0, s[1], 0], [0, 0, s[2]]]
  return null
}

/** Gerade p + t·d auf den Quader zuschneiden -> [A, B] oder null */
function clipLine(l, box) {
  let t0 = -Infinity, t1 = Infinity
  for (let i = 0; i < 3; i++) {
    const [lo, hi] = box[i]
    if (Math.abs(l.d[i]) < 1e-12) { if (l.p[i] < lo || l.p[i] > hi) return null; continue }
    let a = (lo - l.p[i]) / l.d[i], b = (hi - l.p[i]) / l.d[i]
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, b)
  }
  return t0 < t1 ? [add(l.p, mul(l.d, t0)), add(l.p, mul(l.d, t1))] : null
}

export function renderSpace(s, { w = 400, h = 320 } = {}) {
  const sp = s.space
  // Bereich: angegeben oder aus dem Inhalt (mit Rand), Achsen immer ab 0
  const pts = []
  for (const p of sp.points || []) pts.push(p.slice(0, 3))
  for (const v of sp.vectors || []) { const f = v.from || [0, 0, 0]; pts.push(f, add(f, v.v)) }
  for (const g of sp.segments || []) pts.push(g.slice(0, 3), g.slice(3, 6))
  for (const pg of sp.polygons || []) pts.push(...pg)
  for (const l of sp.lines || []) pts.push(l.p, add(l.p, l.d))
  for (const pl of sp.planes || []) { const t = tracePoly(pl); if (t) pts.push(...t.filter((p) => p.every((x) => Math.abs(x) < 50))) }
  const box = [0, 1, 2].map((i) => {
    const k = 'xyz'[i]
    if (sp[k]) return sp[k]
    const vals = pts.map((p) => p[i]).concat([0, 3])
    return [Math.floor(Math.min(...vals, 0)), Math.ceil(Math.max(...vals) + 1)]
  })
  // Projektion
  let P
  if (sp.view) {
    const az = (sp.view[0] * Math.PI) / 180, el = (sp.view[1] * Math.PI) / 180
    P = ([x, y, z]) => { const u = -x * Math.sin(az) + y * Math.cos(az); const d = x * Math.cos(az) + y * Math.sin(az); return [u, z * Math.cos(el) - d * Math.sin(el)] }
  } else P = ([x, y, z]) => [y - 0.5 * x, z - 0.5 * x] // Schrägbild (Kavalierperspektive, x₁-Einheit ½√2 unter 45°)
  const corners = []
  for (const x of box[0]) for (const y of box[1]) for (const z of box[2]) corners.push(P([x, y, z]))
  for (let i = 0; i < 3; i++) { const e = [0, 0, 0]; e[i] = box[i][1] + 1; corners.push(P(e)) } // Achsenspitzen + Beschriftung
  const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0]))
  const minY = Math.min(...corners.map((c) => c[1])), maxY = Math.max(...corners.map((c) => c[1]))
  const pad = 32, k = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad) / (maxY - minY))
  const ox = (w - (maxX - minX) * k) / 2 - minX * k, oy = (h + (maxY - minY) * k) / 2 + minY * k
  const S = (p) => { const [u, v] = P(p); return [r1(ox + u * k), r1(oy - v * k)] }
  const L = (a, b) => `M${S(a).join(' ')}L${S(b).join(' ')}`
  const names = (sp.names || ['x_1', 'x_2', 'x_3']).map(subDigits)

  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="Helvetica,Arial,sans-serif" font-size="13">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<defs><marker id="k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#17151f"/></marker></defs>`]
  if (sp.box) {
    let d = ''
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const a = [box[0][i >> 2 & 1], box[1][i >> 1 & 1], box[2][i & 1]], b = [box[0][j >> 2 & 1], box[1][j >> 1 & 1], box[2][j & 1]]
      if ((a[0] !== b[0]) + (a[1] !== b[1]) + (a[2] !== b[2]) === 1) d += L(a, b)
    }
    out.push(`<path d="${d}" stroke="#dcd9e6" stroke-width="1" fill="none"/>`)
  }
  // Ebenen (hinten, transparent)
  ;(sp.planes || []).forEach((pl, i) => {
    const poly = pl.trace ? tracePoly(pl) || clipPlane(pl, box) : clipPlane(pl, box)
    if (!poly) return
    const col = color(pl.color, i + 1)
    out.push(`<path d="M${poly.map((p) => S(p).join(' ')).join('L')}z" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1.4"/>`)
    if (pl.label) { const c = S(mul(poly.reduce(add, [0, 0, 0]), 1 / poly.length)); out.push(`<text x="${c[0]}" y="${c[1]}" fill="${col}" font-weight="bold" font-style="italic" text-anchor="middle">${esc(pl.label)}</text>`) }
  })
  ;(sp.polygons || []).forEach((pg, i) => {
    const col = AUTO[(i + 2) % AUTO.length]
    out.push(`<path d="M${pg.map((p) => S(p).join(' ')).join('L')}z" fill="${col}" fill-opacity="0.15" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`)
  })
  // Achsen mit Einheitsstrichen
  if (sp.axes !== 0) {
    let d = '', ticks = '', lab = ''
    for (let i = 0; i < 3; i++) {
      const lo = Math.min(box[i][0], 0), hi = box[i][1]
      const a = [0, 0, 0], b = [0, 0, 0]; a[i] = lo; b[i] = hi + 0.6
      d += `<path d="${L(a, b)}" marker-end="url(#k)"/>`
      if (sp.ticks !== 0) for (let t = Math.ceil(lo); t <= hi; t++) {
        if (t === 0) continue
        const p = [0, 0, 0]; p[i] = t
        const [x, y] = S(p)
        ticks += i === 2 ? `M${x - 3} ${y}h6` : `M${x} ${y - 3}v6`
        if (t % (hi - lo > 12 ? 2 : 1) === 0) lab += `<text x="${i === 2 ? x - 6 : x}" y="${i === 2 ? y + 4 : y + 15}" text-anchor="${i === 2 ? 'end' : 'middle'}">${t < 0 ? '−' + -t : t}</text>`
      }
      const e = S(b)
      lab += `<text x="${e[0] + (i === 0 ? -14 : i === 2 ? 8 : 6)}" y="${e[1] + (i === 2 ? 6 : 14)}" font-style="italic" font-size="14" fill="#17151f">${esc(names[i])}</text>`
    }
    out.push(`<g stroke="#17151f" stroke-width="1.3" fill="none">${d}<path d="${ticks}"/></g><g fill="#55515f" font-size="10" stroke="#fff" stroke-width="3" paint-order="stroke">${lab}</g>`)
  }
  // Hilfslinien: Koordinatenweg x₁ -> x₂ -> x₃ zu jedem Punkt (macht die Lage im Schrägbild eindeutig)
  if (sp.guides) {
    let d = ''
    const tips = [...(sp.points || []).map((p) => p.slice(0, 3)), ...(sp.vectors || []).filter((v) => !v.from).map((v) => v.v)]
    for (const [x, y, z] of tips) d += L([x, 0, 0], [x, y, 0]) + L([0, y, 0], [x, y, 0]) + L([x, y, 0], [x, y, z])
    out.push(`<path d="${d}" stroke="#7a7686" stroke-width="1" stroke-dasharray="4 3" fill="none"/>`)
  }
  const labels = []
  ;(sp.lines || []).forEach((l, i) => {
    const seg = clipLine(l, box)
    if (!seg) return
    const col = color(l.color, i + 1)
    out.push(`<path d="${L(seg[0], seg[1])}" stroke="${col}" stroke-width="2.2"${l.dash ? ' stroke-dasharray="7 5"' : ''}/>`)
    if (l.label) { const p = S(add(seg[0], mul(sub(seg[1], seg[0]), 0.85))); labels.push(`<text x="${p[0] + 6}" y="${p[1] - 6}" fill="${col}" font-weight="bold" font-style="italic">${esc(l.label)}</text>`) }
  })
  for (const g of sp.segments || []) out.push(`<path d="${L(g.slice(0, 3), g.slice(3, 6))}" stroke="#17151f" stroke-width="2"${g[6] === 'dash' ? ' stroke-dasharray="6 4"' : ''}/>`)
  ;(sp.vectors || []).forEach((v, i) => {
    const f = v.from || [0, 0, 0], t = add(f, v.v), col = color(v.color, i)
    const a2 = S(f), b2 = S(t), len = Math.hypot(b2[0] - a2[0], b2[1] - a2[1])
    if (len < 1) return
    const ux = (b2[0] - a2[0]) / len, uy = (b2[1] - a2[1]) / len, hl = Math.min(11, len * 0.4), hw = hl * 0.45
    const bx = b2[0] - ux * hl, by = b2[1] - uy * hl // Pfeilspitze als Dreieck (überall gleich dargestellt)
    out.push(`<path d="M${a2.join(' ')}L${r1(bx)} ${r1(by)}" stroke="${col}" stroke-width="2.6"${v.dash ? ' stroke-dasharray="7 5"' : ''}/><path d="M${b2.join(' ')}L${r1(bx - uy * hw)} ${r1(by + ux * hw)}L${r1(bx + uy * hw)} ${r1(by - ux * hw)}z" fill="${col}"/>`)
    if (v.label) {
      const m = S(add(f, mul(v.v, 0.55))), a = S(f), b = S(t), nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1
      labels.push(`<text x="${r1(m[0] + (nx / nl) * 11)}" y="${r1(m[1] + (ny / nl) * 11 + 4)}" fill="${col}" font-weight="bold" font-style="italic" text-anchor="middle">${esc(v.label)}</text>`)
    }
  })
  for (const p of sp.points || []) {
    const [x, y] = S(p)
    labels.push(`<circle cx="${x}" cy="${y}" r="3.8" fill="#17151f" stroke="#fff" stroke-width="1.5"/>`)
    if (p[3]) labels.push(`<text x="${x + 7}" y="${y - 7}" font-weight="bold">${esc(p[3])}</text>`)
  }
  out.push(`<g stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${labels.join('')}</g>`)
  out.push('</svg>')
  return out.join('')
}
