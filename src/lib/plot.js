// Mathe-Graphen: kleine JSON-Beschreibung -> SVG. Ideal für KI („zeichne f(x) = x² − 2 mit Nullstellen“)
// und für QR-Codes (ein Graph kostet ~50–150 Byte statt mehrerer KB als Bild).
// Reine Funktionen, ohne DOM – läuft in App, Node und Werkzeugkasten. Formeln werden NIE per eval ausgeführt.
//
// Format (alle Felder optional außer mindestens einem Inhalt):
// {
//   "x": [-5, 5], "y": [-3, 6],               Achsenbereich (y ohne Angabe: automatisch)
//   "fn": ["x^2-2", {"f": "sin(x)", "label": "g", "color": "red", "dash": true, "domain": [0, 6], "fill": [0, 3.14]}],
//   "param": [{"x": "2cos(t)", "y": "sin(t)", "t": [0, 6.283]}],     Parameterkurven
//   "points": [[1, -1, "P"], [2, 0]],          Punkte (optional mit Beschriftung)
//   "segments": [[0, 0, 2, 3], [0, 0, 1, 1, "arrow"]],  Strecken / Pfeile (Vektoren)
//   "polygons": [[[0, 0], [3, 0], [3, 2]]],    gefüllte Vielecke (Dreiecke, Flächen)
//   "vlines": [2], "hlines": [1],              senkrechte / waagrechte Hilfslinien (gestrichelt)
//   "texts": [[1, 2, "A"]],                    freie Beschriftungen
//   "bars": {"labels": ["Mo", "Di"], "values": [3, 5]},   Säulendiagramm (statt Koordinatensystem)
//   "grid": "none" | "major" | "minor" (Haupt- + Nebenlinien) oder je Achse {"x": "minor", "y": "major"} (Standard: "major"),
//   "step": [1, 1] (Abstand Hauptlinien + Beschriftung), "minor": [0.5, 0.5] (Abstand Nebenlinien, sonst automatisch),
//   "axes": true, "ticks": true,
//   "xlabel": "t", "xunit": "s", "ylabel": "v", "yunit": "m/s"   Achsen: Größe + Einheit -> „t in s“ (Index/Exponent: v_0, m/s^2)
//   "units": "in" | "[]" | "/"   Schreibweise der Einheit: „t in s“ (Standard), „t [s]“, „t / s“
//   "lines": [[[0, 0], [2, 4], [5, 4]], {"points": [[0, 1], [3, 1]], "color": "red", "dash": true, "label": "B"}]   Streckenzüge (z. B. v-t-Diagramm)
//   "equal": false (gleicher Maßstab für x und y), "w": 400, "h": 300
// }

import { normalizeSpace, renderSpace } from './plot3d.js'

// ------------------------------------------------------------------ Formel-Parser
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10, log2: Math.log2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sgn: Math.sign, cbrt: Math.cbrt,
}
const CONSTS = { pi: Math.PI, e: Math.E }

function tokenize(src) {
  const s = String(src)
    .replace(/[−–]/g, '-').replace(/[·×⋅]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^')
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i))
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }
    const id = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i))
    if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue }
    if ('+-*/^()|,'.includes(c)) { out.push({ t: c }); i++; continue }
    throw new Error(`Unbekanntes Zeichen „${c}“`)
  }
  return out
}

/** Zerlegt Namen wie „xsin“ oder „2pix“ in bekannte Bausteine (implizite Multiplikation) */
function splitIdent(name, vars) {
  if (FUNCS[name] || CONSTS[name] !== undefined || vars.includes(name)) return [name]
  const parts = []
  let rest = name
  const known = [...Object.keys(FUNCS), ...Object.keys(CONSTS), ...vars].sort((a, b) => b.length - a.length)
  while (rest) {
    const k = known.find((n) => rest.startsWith(n))
    if (!k) throw new Error(`Unbekannter Name „${name}“`)
    parts.push(k); rest = rest.slice(k.length)
  }
  return parts
}

/**
 * Kompiliert eine Formel in eine Funktion. Erlaubt: + - * / ^, Klammern, |x|, implizites Mal (2x, 3(x+1), x sin(x)),
 * sin cos tan … sqrt abs exp ln log, pi, e. Präfixe wie „f(x)=“ oder „y=“ werden ignoriert.
 * @returns {(vars: Record<string, number>) => number}
 */
export function compileExpr(src, vars = ['x']) {
  let clean = String(src).trim().replace(/^\$+|\$+$/g, '').replace(/^[a-zA-Z]\w*\s*\(\s*[a-z]\s*\)\s*=/, '').replace(/^y\s*=/, '')
  // häufige KI-Ausrutscher: LaTeX und Dezimalkomma
  for (let i = 0; i < 4; i++) clean = clean.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))').replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
  clean = clean.replace(/\\(cdot|times)/g, '*').replace(/\\(left|right)/g, '').replace(/\\(pi|sin|cos|tan|ln|log|exp|sqrt)/g, '$1')
    .replace(/[{]/g, '(').replace(/[}]/g, ')').replace(/(\d),(\d)/g, '$1.$2')
  const raw = tokenize(clean)
  const toks = []
  for (const tk of raw) {
    if (tk.t === 'id') splitIdent(tk.v, vars).forEach((v) => toks.push({ t: 'id', v }))
    else toks.push(tk)
  }
  let p = 0
  const peek = () => toks[p], next = () => toks[p++]
  const expect = (t) => { if (peek()?.t !== t) throw new Error(`„${t}“ erwartet`); p++ }
  const startsPrimary = (tk) => tk && (tk.t === 'num' || tk.t === 'id' || tk.t === '(')

  function expr() {
    let a = term()
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t, b = term(), l = a
      a = op === '+' ? (v) => l(v) + b(v) : (v) => l(v) - b(v)
    }
    return a
  }
  function term() {
    let a = unary()
    for (;;) {
      const tk = peek()
      if (tk && (tk.t === '*' || tk.t === '/')) {
        next(); const b = unary(), l = a
        a = tk.t === '*' ? (v) => l(v) * b(v) : (v) => l(v) / b(v)
      } else if (startsPrimary(tk)) { // implizit: 2x, x(x+1), 2 sin(x)
        const b = power(), l = a
        a = (v) => l(v) * b(v)
      } else return a
    }
  }
  function unary() {
    if (peek()?.t === '-') { next(); const a = unary(); return (v) => -a(v) }
    if (peek()?.t === '+') { next(); return unary() }
    return power()
  }
  function power() {
    const base = primary()
    if (peek()?.t === '^') { next(); const ex = unary(); return (v) => Math.pow(base(v), ex(v)) } // rechtsassoziativ, -x^2 = -(x^2)
    return base
  }
  function primary() {
    const tk = next()
    if (!tk) throw new Error('Formel endet unerwartet')
    if (tk.t === 'num') { const c = tk.v; return () => c }
    if (tk.t === '(') { const a = expr(); expect(')'); return a }
    if (tk.t === '|') { const a = expr(); expect('|'); return (v) => Math.abs(a(v)) }
    if (tk.t === 'id') {
      if (FUNCS[tk.v]) {
        const f = FUNCS[tk.v]
        // sin(x), sin x, sin^2(x)
        let pw = null
        if (peek()?.t === '^') { next(); pw = primary() }
        const arg = peek()?.t === '(' ? (next(), (() => { const a = expr(); expect(')'); return a })()) : power()
        return pw ? (v) => Math.pow(f(arg(v)), pw(v)) : (v) => f(arg(v))
      }
      if (CONSTS[tk.v] !== undefined) { const c = CONSTS[tk.v]; return () => c }
      if (vars.includes(tk.v)) { const k = tk.v; return (v) => v[k] }
    }
    throw new Error(`Unerwartet: „${tk.v ?? tk.t}“`)
  }
  const fn = expr()
  if (p < toks.length) throw new Error(`Unerwartet: „${toks[p].v ?? toks[p].t}“`)
  return (v) => { const r = fn(v); return Number.isFinite(r) ? r : NaN }
}

// ------------------------------------------------------------------ Normalisieren
const PALETTE = { blue: '#2f5bea', red: '#e0393e', green: '#12925a', orange: '#e8890c', purple: '#7b3fe4', black: '#17151f', gray: '#7a7686', grey: '#7a7686',
  blau: '#2f5bea', rot: '#e0393e', 'grün': '#12925a', gruen: '#12925a', violett: '#7b3fe4', lila: '#7b3fe4', schwarz: '#17151f', grau: '#7a7686' }
const AUTO = ['#2f5bea', '#e0393e', '#12925a', '#e8890c', '#7b3fe4']
const color = (c, i) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(c) ? c : PALETTE[String(c || '').toLowerCase()] || AUTO[i % AUTO.length])
const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d)
const range = (r, d) => (Array.isArray(r) && r.length === 2 && Number.isFinite(+r[0]) && Number.isFinite(+r[1]) && +r[1] > +r[0] ? [+r[0], +r[1]] : d)
const str = (s, max = 40) => String(s ?? '').slice(0, max)
const arr = (a) => (Array.isArray(a) ? a : a == null ? [] : [a])

/** Prüft/vereinheitlicht eine Graph-Beschreibung. Wirft bei unbrauchbarer Formel einen verständlichen Fehler. */
export function normalizePlot(spec) {
  if (typeof spec === 'string') spec = JSON.parse(spec)
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Graph: Objekt erwartet')
  const out = {}
  const space = spec.space ?? spec['3d'] ?? spec.raum
  if (space) { // 3D (Vektoren, Geraden, Ebenen) – siehe plot3d.js
    out.space = normalizeSpace(space)
    if (spec.w) out.w = Math.max(120, Math.min(800, num(spec.w, 400)))
    if (spec.h) out.h = Math.max(100, Math.min(800, num(spec.h, 320)))
    return out
  }
  if (spec.x) out.x = range(spec.x, [-5, 5])
  if (spec.y) out.y = range(spec.y, undefined)
  const fns = arr(spec.fn ?? spec.functions ?? spec.f ?? spec.funktionen)
  if (fns.length) out.fn = fns.slice(0, 8).map((f, i) => {
    const o = typeof f === 'string' ? { f } : { ...f, f: f.f ?? f.expr ?? f.term ?? f.y }
    try { compileExpr(o.f) } catch (e) { throw new Error(`Graph, Funktion ${i + 1} („${str(o.f)}“): ${e.message}`) }
    const r = { f: str(o.f, 200) }
    if (o.label) r.label = str(o.label, 20)
    if (o.color) r.color = str(o.color, 10)
    if (o.dash) r.dash = 1
    if (o.domain) r.domain = range(o.domain)
    if (o.fill) r.fill = range(o.fill)
    return r
  })
  const params = arr(spec.param ?? spec.parametric)
  if (params.length) out.param = params.slice(0, 4).map((pp, i) => {
    try { compileExpr(pp.x, ['t']); compileExpr(pp.y, ['t']) } catch (e) { throw new Error(`Graph, Parameterkurve ${i + 1}: ${e.message}`) }
    return { x: str(pp.x, 200), y: str(pp.y, 200), t: range(pp.t, [0, 2 * Math.PI]), ...(pp.color ? { color: str(pp.color, 10) } : {}), ...(pp.dash ? { dash: 1 } : {}) }
  })
  const pts = arr(spec.points ?? spec.punkte).filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]))
  if (pts.length) out.points = pts.slice(0, 30).map((p) => (p[2] != null ? [+p[0], +p[1], str(p[2], 20)] : [+p[0], +p[1]]))
  const lines = arr(spec.lines ?? spec.polylines ?? spec.linien).map((l) => (Array.isArray(l) ? { points: l } : l))
    .filter((l) => l && Array.isArray(l.points) && l.points.length >= 2 && l.points.every((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])))
  if (lines.length) out.lines = lines.slice(0, 10).map((l) => ({ points: l.points.slice(0, 200).map((p) => [+p[0], +p[1]]), ...(l.color ? { color: str(l.color, 10) } : {}), ...(l.dash ? { dash: 1 } : {}), ...(l.label ? { label: str(l.label, 20) } : {}) }))
  const segs = arr(spec.segments ?? spec.strecken).filter((s) => Array.isArray(s) && s.slice(0, 4).every((v) => Number.isFinite(+v)))
  if (segs.length) out.segments = segs.slice(0, 30).map((s) => [+s[0], +s[1], +s[2], +s[3], ...(s[4] ? [str(s[4], 10)] : [])])
  const polys = arr(spec.polygons ?? spec.polygone).filter((pg) => Array.isArray(pg) && pg.length >= 3 && pg.every((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])))
  if (polys.length) out.polygons = polys.slice(0, 10).map((pg) => pg.slice(0, 40).map((p) => [+p[0], +p[1]]))
  for (const k of ['vlines', 'hlines']) { const v = arr(spec[k]).filter((x) => Number.isFinite(+x)).map(Number); if (v.length) out[k] = v.slice(0, 10) }
  const texts = arr(spec.texts ?? spec.labels).filter((t) => Array.isArray(t) && Number.isFinite(+t[0]) && Number.isFinite(+t[1]))
  if (texts.length) out.texts = texts.slice(0, 20).map((t) => [+t[0], +t[1], str(t[2], 30)])
  if (spec.bars && Array.isArray(spec.bars.values)) out.bars = { labels: arr(spec.bars.labels).map((l) => str(l, 16)).slice(0, 16), values: spec.bars.values.slice(0, 16).map((v) => num(v, 0)), ...(spec.bars.color ? { color: str(spec.bars.color, 10) } : {}) }
  for (const k of ['axes', 'ticks', 'equal']) if (spec[k] !== undefined) out[k] = spec[k] ? 1 : 0
  if (spec.grid !== undefined || spec.minor) {
    const g = spec.grid ?? 'minor' // „minor“-Abstände angegeben -> Nebenlinien gewünscht
    const gx = g && typeof g === 'object' && !Array.isArray(g) ? gridLevel(g.x ?? 'major') : gridLevel(g)
    const gy = g && typeof g === 'object' && !Array.isArray(g) ? gridLevel(g.y ?? 'major') : gridLevel(g)
    out.grid = gx === gy ? GRID_NAMES[gx] : { x: GRID_NAMES[gx], y: GRID_NAMES[gy] }
  }
  if (spec.minor) out.minor = Array.isArray(spec.minor) ? [num(spec.minor[0], 0), num(spec.minor[1], 0)] : [num(spec.minor, 0), num(spec.minor, 0)]
  if (spec.step) out.step = Array.isArray(spec.step) ? [num(spec.step[0], 0), num(spec.step[1], 0)] : [num(spec.step, 0), num(spec.step, 0)]
  if (spec.xlabel) out.xlabel = str(spec.xlabel, 30)
  if (spec.ylabel) out.ylabel = str(spec.ylabel, 30)
  if (spec.xunit) out.xunit = str(spec.xunit, 16)
  if (spec.yunit) out.yunit = str(spec.yunit, 16)
  if (['[]', '/', 'in'].includes(spec.units)) out.units = spec.units
  if (spec.w) out.w = Math.max(120, Math.min(800, num(spec.w, 400)))
  if (spec.h) out.h = Math.max(100, Math.min(800, num(spec.h, 300)))
  if (!out.fn && !out.param && !out.points && !out.segments && !out.polygons && !out.bars && !out.texts && !out.lines) throw new Error('Graph ist leer (fn, points, lines, segments, polygons, bars …)')
  return out
}

// Gitter: 0 = keins, 1 = Hauptlinien, 2 = Haupt- + Nebenlinien
export const GRID_NAMES = ['none', 'major', 'minor']
const GRID_WORDS = { none: 0, no: 0, off: 0, aus: 0, keins: 0, kein: 0, false: 0, major: 1, haupt: 1, true: 1, on: 1, an: 1, minor: 2, fein: 2, neben: 2, fine: 2, both: 2 }
function gridLevel(v) {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return Math.max(0, Math.min(2, Math.round(v)))
  return GRID_WORDS[String(v).toLowerCase()] ?? 1
}
/** Gitterstufe je Achse aus einer (normalisierten) Beschreibung */
export function gridOf(s) {
  const g = s.grid
  if (g === undefined) return { x: 1, y: 1 }
  if (g && typeof g === 'object') return { x: gridLevel(g.x ?? 1), y: gridLevel(g.y ?? 1) }
  return { x: gridLevel(g), y: gridLevel(g) }
}
const minorOf = (major) => { const lead = Math.round(major / 10 ** Math.floor(Math.log10(major))); return major / (lead === 2 ? 4 : 5) }

// ------------------------------------------------------------------ Zeichnen
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const r1 = (v) => Math.round(v * 10) / 10

/** Beschriftungstext mit Index/Exponent: v_0, v_{max}, m/s^2, 10^{-3} -> SVG-tspans (sicher escaped) */
export function richLabel(text) {
  const parts = String(text).split(/([_^](?:\{[^}]*\}|[^\s{}/·*]))/)
  let o = '', shifted = false
  for (const p of parts) {
    if (!p) continue
    const m = /^([_^])\{?([^}]*)\}?$/.exec(p)
    if (m && p.length > 1) { o += `<tspan dy="${m[1] === '_' ? 4 : -6}" font-size="75%">${esc(m[2])}</tspan>`; shifted = true; continue }
    o += shifted ? `<tspan dy="${o.lastIndexOf('dy="4"') > o.lastIndexOf('dy="-6"') ? -4 : 6}">${esc(p)}</tspan>` : esc(p)
    shifted = false
  }
  return o
}
/** Achsenbeschriftung: Größe kursiv, Einheit aufrecht – „t in s“, „t [s]“ oder „t / s“ */
function axisLabel(name, unit, style = 'in') {
  const n = name ? `<tspan font-style="italic">${richLabel(name)}</tspan>` : ''
  if (!unit) return n
  const u = richLabel(unit)
  return style === '[]' ? `${n} [${u}]` : style === '/' ? `${n} / ${u}` : `${n} in ${u}`
}

function niceStep(span, target = 8) {
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p
}
const fmtNum = (v) => { const s = String(Math.round(v * 1000) / 1000); return s.replace('.', ',').replace('-', '−') }

/** Graph-Beschreibung -> SVG-Text (eigenständig, mit weißem Hintergrund) */
export function renderPlot(input) {
  const s = normalizePlot(input)
  if (s.bars) return renderBars(s)
  if (s.space) return renderSpace(s, { w: s.w || 400, h: s.h || 320 })
  const W = s.w || 400, H = s.h || 300
  const fns = (s.fn || []).map((f) => ({ ...f, fx: compileExpr(f.f) }))
  let [x0, x1] = s.x || [-5, 5]
  // y-Bereich automatisch: aus Funktionswerten (Ausreißer abgeschnitten) und Punkten
  let y0, y1
  if (s.y) [y0, y1] = s.y
  else {
    const ys = [], fixed = []
    for (const f of fns) for (let i = 0; i <= 200; i++) { const x = x0 + ((x1 - x0) * i) / 200; const y = f.fx({ x }); if (Number.isFinite(y)) ys.push(y) }
    // Punkte, Strecken, Vielecke, Parameterkurven immer ganz sichtbar; Funktionen ohne Ausreißer (Polstellen)
    for (const p of [...(s.points || []), ...(s.polygons || []).flat(), ...(s.texts || [])]) fixed.push(p[1])
    for (const g of s.segments || []) fixed.push(g[1], g[3])
    for (const l of s.lines || []) for (const p of l.points) fixed.push(p[1])
    for (const pc of s.param || []) { const fy = compileExpr(pc.y, ['t']); for (let i = 0; i <= 100; i++) { const y = fy({ t: pc.t[0] + ((pc.t[1] - pc.t[0]) * i) / 100 }); if (Number.isFinite(y)) fixed.push(y) } }
    ys.sort((a, b) => a - b)
    const q = (p) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(p * (ys.length - 1))))]
    y0 = Math.min(ys.length ? q(0.03) : 0, ...fixed, 0); y1 = Math.max(ys.length ? q(0.97) : 0, ...fixed, 0)
    if (!ys.length && !fixed.length) { y0 = -5; y1 = 5 }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1 }
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad
  }
  // Achse am Rand (0 nicht im Bereich) -> Platz für die Beschriftung außerhalb
  const m = { l: x0 >= 0 && s.axes !== 0 && s.ticks !== 0 ? 36 : 14, r: 14, t: 14, b: y0 >= 0 && s.axes !== 0 && s.ticks !== 0 ? 24 : 14 }
  let pw = W - m.l - m.r, ph = H - m.t - m.b
  if (s.equal) { // gleicher Maßstab: Bereich erweitern
    const k = Math.min(pw / (x1 - x0), ph / (y1 - y0))
    const ex = (pw / k - (x1 - x0)) / 2, ey = (ph / k - (y1 - y0)) / 2
    x0 -= ex; x1 += ex; y0 -= ey; y1 += ey
  }
  const X = (x) => m.l + ((x - x0) / (x1 - x0)) * pw, Y = (y) => m.t + ((y1 - y) / (y1 - y0)) * ph
  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif" font-size="13">`)
  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`)
  out.push(`<defs><clipPath id="c"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#17151f"/></marker></defs>`)
  const sx = s.step?.[0] || niceStep(x1 - x0), sy = s.step?.[1] || niceStep(y1 - y0, 6)
  const ticksX = [], ticksY = []
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) ticksX.push(Math.round(v / sx) * sx)
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) ticksY.push(Math.round(v / sy) * sy)
  const gl = gridOf(s)
  { // Nebenlinien (fein, hell) – nur wo keine Hauptlinie liegt
    let d = ''
    const lines = (lo, hi, major, minor, draw) => {
      if (!(minor > 0) || (hi - lo) / minor > 240) return
      for (let v = Math.ceil(lo / minor) * minor; v <= hi + 1e-9; v += minor) {
        const k = Math.round(v / minor) * minor
        if (Math.abs(k / major - Math.round(k / major)) > 1e-6) draw(k)
      }
    }
    if (gl.x === 2) lines(x0, x1, sx, s.minor?.[0] || minorOf(sx), (v) => { d += `M${r1(X(v))} ${m.t}V${m.t + ph}` })
    if (gl.y === 2) lines(y0, y1, sy, s.minor?.[1] || minorOf(sy), (v) => { d += `M${m.l} ${r1(Y(v))}H${m.l + pw}` })
    if (d) out.push(`<path d="${d}" stroke="#eceaf2" stroke-width="0.8"/>`)
  }
  if (gl.x || gl.y) {
    let d = ''
    if (gl.x) for (const v of ticksX) d += `M${r1(X(v))} ${m.t}V${m.t + ph}`
    if (gl.y) for (const v of ticksY) d += `M${m.l} ${r1(Y(v))}H${m.l + pw}`
    out.push(`<path d="${d}" stroke="${gl.x === 2 || gl.y === 2 ? '#cfcbdc' : '#dcd9e6'}" stroke-width="1"/>`)
  }
  // Achsen (am Rand, falls 0 nicht im Bereich)
  const ax = Math.min(Math.max(0, y0), y1), ay = Math.min(Math.max(0, x0), x1)
  if (s.axes !== 0) {
    // zwei Pfade: Pfeil an x- UND y-Achse (marker-end sitzt nur am Pfadende)
    out.push(`<g stroke="#17151f" stroke-width="1.4" marker-end="url(#a)"><path d="M${m.l} ${r1(Y(ax))}H${m.l + pw}"/><path d="M${r1(X(ay))} ${m.t + ph}V${m.t}"/></g>`)
    if (s.ticks !== 0) {
      const lab = []
      for (const v of ticksX) if (Math.abs(v - ay) > sx / 2 && X(v) < m.l + pw - 12) lab.push(`<text x="${r1(X(v))}" y="${r1(Y(ax) + 15)}" text-anchor="middle">${fmtNum(v)}</text>`)
      for (const v of ticksY) if (Math.abs(v - ax) > sy / 2 && Y(v) > m.t + 10) lab.push(`<text x="${r1(X(ay) - 5)}" y="${r1(Y(v) + 4)}" text-anchor="end">${fmtNum(v)}</text>`)
      if (Math.abs(ay) < 1e-9 && Math.abs(ax) < 1e-9) lab.push(`<text x="${r1(X(0) - 5)}" y="${r1(Y(0) + 15)}" text-anchor="end">0</text>`)
      out.push(`<g fill="#55515f" font-size="11" stroke="#fff" stroke-width="3" paint-order="stroke">${lab.join('')}</g>`)
    }
    out.push(`<g font-size="14" stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"><text x="${m.l + pw - 2}" y="${r1(Y(ax) - 7)}" text-anchor="end">${axisLabel(s.xlabel || 'x', s.xunit, s.units)}</text><text x="${r1(X(ay) + 8)}" y="${m.t + 11}">${axisLabel(s.ylabel || 'y', s.yunit, s.units)}</text></g>`)
  }
  const body = []
  for (const k of s.vlines || []) body.push(`<path d="M${r1(X(k))} ${m.t}V${m.t + ph}" stroke="#7a7686" stroke-width="1.2" stroke-dasharray="5 4"/>`)
  for (const k of s.hlines || []) body.push(`<path d="M${m.l} ${r1(Y(k))}H${m.l + pw}" stroke="#7a7686" stroke-width="1.2" stroke-dasharray="5 4"/>`)
  ;(s.polygons || []).forEach((pg, i) => body.push(`<path d="M${pg.map((p) => r1(X(p[0])) + ' ' + r1(Y(p[1]))).join('L')}z" fill="${AUTO[(i + 1) % AUTO.length]}" fill-opacity="0.18" stroke="${AUTO[(i + 1) % AUTO.length]}" stroke-width="1.6"/>`))
  // Funktionen: Abtasten, an Sprüngen/Polstellen unterbrechen
  const N = 480
  const labels = []
  fns.forEach((f, i) => {
    const col = color(f.color, i)
    const [a, b] = f.domain || [x0, x1]
    if (f.fill) {
      const [fa, fb] = [Math.max(f.fill[0], x0), Math.min(f.fill[1], x1)]
      let d = `M${r1(X(fa))} ${r1(Y(ax))}`
      for (let k = 0; k <= 120; k++) { const x = fa + ((fb - fa) * k) / 120; const y = f.fx({ x }); if (Number.isFinite(y)) d += `L${r1(X(x))} ${r1(Y(Math.max(y0 - 1, Math.min(y1 + 1, y))))}` }
      body.push(`<path d="${d}L${r1(X(fb))} ${r1(Y(ax))}z" fill="${col}" fill-opacity="0.2"/>`)
    }
    let d = '', pen = false, prev = null
    const lo = Math.max(a, x0), hi = Math.min(b, x1)
    const span = y1 - y0
    for (let k = 0; k <= N; k++) {
      const x = lo + ((hi - lo) * k) / N, y = f.fx({ x })
      const okY = Number.isFinite(y) && y > y0 - span * 3 && y < y1 + span * 3
      if (!okY || (prev !== null && Math.abs(y - prev) > span * 1.5)) { pen = false; prev = okY ? y : null; if (!okY) continue }
      d += (pen ? 'L' : 'M') + r1(X(x)) + ' ' + r1(Y(y)); pen = true; prev = y
    }
    body.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"${f.dash ? ' stroke-dasharray="7 5"' : ''}/>`)
    if (f.label) {
      // Beschriftung an einer Stelle, wo die Kurve sichtbar ist (rechtes Drittel bevorzugt)
      for (const t of [0.85, 0.7, 0.55, 0.4, 0.25]) {
        const x = lo + (hi - lo) * t, y = f.fx({ x })
        if (Number.isFinite(y) && y > y0 + span * 0.08 && y < y1 - span * 0.08) { labels.push(`<text x="${r1(X(x) + 6)}" y="${r1(Y(y) - 7)}" fill="${col}" font-weight="bold" font-style="italic">${esc(f.label)}</text>`); break }
      }
    }
  })
  ;(s.param || []).forEach((pc, i) => {
    const fx = compileExpr(pc.x, ['t']), fy = compileExpr(pc.y, ['t'])
    let d = '', pen = false
    for (let k = 0; k <= N; k++) {
      const t = pc.t[0] + ((pc.t[1] - pc.t[0]) * k) / N, x = fx({ t }), y = fy({ t })
      if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue }
      d += (pen ? 'L' : 'M') + r1(X(x)) + ' ' + r1(Y(y)); pen = true
    }
    body.push(`<path d="${d}" fill="none" stroke="${color(pc.color, fns.length + i)}" stroke-width="2.4"${pc.dash ? ' stroke-dasharray="7 5"' : ''}/>`)
  })
  ;(s.lines || []).forEach((l, i) => {
    const col = color(l.color, fns.length + i)
    body.push(`<path d="M${l.points.map((p) => r1(X(p[0])) + ' ' + r1(Y(p[1]))).join('L')}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"${l.dash ? ' stroke-dasharray="7 5"' : ''}/>`)
    if (l.label) { const p = l.points[Math.floor(l.points.length / 2)]; labels.push(`<text x="${r1(X(p[0]) + 6)}" y="${r1(Y(p[1]) - 7)}" fill="${col}" font-weight="bold" font-style="italic">${esc(l.label)}</text>`) }
  })
  for (const g of s.segments || []) body.push(`<path d="M${r1(X(g[0]))} ${r1(Y(g[1]))}L${r1(X(g[2]))} ${r1(Y(g[3]))}" stroke="#17151f" stroke-width="2"${g[4] === 'arrow' ? ' marker-end="url(#a)"' : ''}/>`)
  out.push(`<g clip-path="url(#c)">${body.join('')}</g>`)
  const top = []
  for (const p of s.points || []) {
    top.push(`<circle cx="${r1(X(p[0]))}" cy="${r1(Y(p[1]))}" r="4" fill="#17151f" stroke="#fff" stroke-width="1.5"/>`)
    if (p[2]) top.push(`<text x="${r1(X(p[0]) + 7)}" y="${r1(Y(p[1]) - 7)}" font-weight="bold">${esc(p[2])}</text>`)
  }
  for (const t of s.texts || []) top.push(`<text x="${r1(X(t[0]))}" y="${r1(Y(t[1]))}" text-anchor="middle" font-weight="bold">${esc(t[2])}</text>`)
  out.push(`<g stroke-linejoin="round" paint-order="stroke">${labels.join('')}${top.join('')}</g>`)
  out.push('</svg>')
  return out.join('')
}

function renderBars(s) {
  const W = s.w || 400, H = s.h || 300
  const v = s.bars.values, n = v.length
  const max = Math.max(...v, 0), min = Math.min(...v, 0)
  const top = s.y ? s.y[1] : max + (max - min) * 0.1 || 1, bot = s.y ? s.y[0] : min
  const m = { l: 40, r: 10, t: 14, b: 30 }, pw = W - m.l - m.r, ph = H - m.t - m.b
  const Y = (y) => m.t + ((top - y) / (top - bot)) * ph
  const step = s.step?.[1] || niceStep(top - bot, 5)
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif" font-size="12">`, `<rect width="${W}" height="${H}" fill="#fff"/>`]
  let grid = '', lab = ''
  for (let y = Math.ceil(bot / step) * step; y <= top + 1e-9; y += step) { grid += `M${m.l} ${r1(Y(y))}H${m.l + pw}`; lab += `<text x="${m.l - 5}" y="${r1(Y(y) + 4)}" text-anchor="end">${fmtNum(y)}</text>` }
  out.push(`<path d="${grid}" stroke="#dcd9e6"/><g fill="#55515f" font-size="11">${lab}</g>`)
  const bw = pw / n, col = color(s.bars.color, 0)
  v.forEach((val, i) => {
    const x = m.l + i * bw + bw * 0.15, y = Y(Math.max(val, 0)), h = Math.abs(Y(val) - Y(0))
    out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(bw * 0.7)}" height="${r1(h)}" fill="${col}" rx="2"/>`)
    if (s.bars.labels[i]) out.push(`<text x="${r1(x + bw * 0.35)}" y="${H - 10}" text-anchor="middle">${esc(s.bars.labels[i])}</text>`)
  })
  out.push(`<path d="M${m.l} ${r1(Y(0))}H${m.l + pw}" stroke="#17151f" stroke-width="1.4"/>`)
  if (s.ylabel || s.yunit) out.push(`<text x="${m.l}" y="11">${axisLabel(s.ylabel || '', s.yunit, s.units)}</text>`)
  out.push('</svg>')
  return out.join('')
}
