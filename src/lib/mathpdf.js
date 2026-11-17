// LaTeX-Formeln als echte Vektorgrafik im PDF: MathJax (TeX -> SVG, ohne Schriften) -> jsPDF-Pfade.
// Wird nur geladen, wenn ein Bericht Formeln enthält. Läuft auch in Node (Tests).

let renderer = null

/** Lädt MathJax einmalig. @returns {(tex:string, display:boolean) => Box|null} */
export async function loadMathRenderer() {
  if (renderer) return renderer
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
  ])
  await Promise.all([
    import('mathjax-full/js/input/tex/base/BaseConfiguration.js'),
    import('mathjax-full/js/input/tex/ams/AmsConfiguration.js'),
    import('mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js'),
  ])
  const adaptor = liteAdaptor()
  RegisterHTMLHandler(adaptor)
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: ['base', 'ams', 'mhchem'] }),
    OutputJax: new SVG({ fontCache: 'none' }),
  })
  const cache = new Map()
  renderer = (tex, display = false) => {
    const key = (display ? 'D' : 'I') + tex
    if (!cache.has(key)) {
      // \displaystyle: Brüche in voller Größe (wie in der App)
      try { cache.set(key, parseSvg(adaptor.outerHTML(doc.convert(display ? tex : '\\displaystyle ' + tex, { display })))) } catch { cache.set(key, null) }
    }
    return cache.get(key)
  }
  return renderer
}

// ------------------------------------------------------------------ SVG -> Formen
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const attr = (s, name) => { const r = new RegExp(`\\s${name}="([^"]*)"`).exec(s); return r ? r[1] : null }

function parseTransform(t) {
  let m = [1, 0, 0, 1, 0, 0]
  if (!t) return m
  for (const [, fn, args] of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number)
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, a[0], a[1] || 0])
    else if (fn === 'scale') m = mul(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0])
    else if (fn === 'matrix') m = mul(m, a)
    else if (fn === 'rotate') { const r = (a[0] * Math.PI) / 180; m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]) }
  }
  return m
}

/** SVG-Pfad (M L H V Q T C S Z, absolut/relativ) -> Liste von Unterpfaden mit kubischen Segmenten */
function pathOps(d, m) {
  const tok = d.match(/[MLHVQTCSZmlhvqtcsz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || []
  const ops = []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, qx = 0, qy = 0, cx2 = 0, cy2 = 0, prev = ''
  const num = () => +tok[i++]
  const P = (px, py) => ap(m, px, py)
  const cubic = (x1, y1, x2, y2, ex, ey) => { ops.push({ op: 'c', c: [...P(x1, y1), ...P(x2, y2), ...P(ex, ey)] }) }
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++]
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z', C = cmd.toUpperCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    if (C === 'Z') { ops.push({ op: 'h', c: [] }); x = sx; y = sy; prev = 'Z'; continue }
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; ops.push({ op: 'm', c: P(x, y) }); cmd = rel ? 'l' : 'L'; prev = 'M'; continue }
    if (C === 'L') { x = ox + num(); y = oy + num(); ops.push({ op: 'l', c: P(x, y) }) }
    else if (C === 'H') { x = ox + num(); ops.push({ op: 'l', c: P(x, y) }) }
    else if (C === 'V') { y = oy + num(); ops.push({ op: 'l', c: P(x, y) }) }
    else if (C === 'Q' || C === 'T') {
      let px, py
      if (C === 'Q') { px = ox + num(); py = oy + num() } else if (prev === 'Q' || prev === 'T') { px = 2 * x - qx; py = 2 * y - qy } else { px = x; py = y }
      const ex = ox + num(), ey = oy + num()
      cubic(x + (2 / 3) * (px - x), y + (2 / 3) * (py - y), ex + (2 / 3) * (px - ex), ey + (2 / 3) * (py - ey), ex, ey)
      qx = px; qy = py; x = ex; y = ey
    } else if (C === 'C' || C === 'S') {
      let x1, y1
      if (C === 'C') { x1 = ox + num(); y1 = oy + num() } else if (prev === 'C' || prev === 'S') { x1 = 2 * x - cx2; y1 = 2 * y - cy2 } else { x1 = x; y1 = y }
      const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num()
      cubic(x1, y1, x2, y2, ex, ey); cx2 = x2; cy2 = y2; x = ex; y = ey
    } else { i++; continue } // unbekannt -> überspringen
    prev = C
  }
  return ops
}

/**
 * @typedef {{w:number, asc:number, desc:number, shapes:object[], minX:number}} Box  (Maße in em)
 */
export function parseSvg(svg) {
  const vb = (attr(svg, 'viewBox') || '0 0 0 0').split(/[\s,]+/).map(Number)
  const [minX, minY, W, H] = vb
  const shapes = []
  const stack = [[1, 0, 0, 1, 0, 0]]
  const re = /<(\/?)(svg|g|path|rect|text)\b([^>]*?)(\/?)>([^<]*)/g
  for (const [, close, tag, attrs, selfClose, after] of svg.matchAll(re)) {
    const top = stack[stack.length - 1]
    if (close) { if (tag === 'g' || tag === 'svg' || tag === 'text') stack.pop(); continue }
    const m = mul(top, parseTransform(attr(attrs, 'transform')))
    if (tag === 'path') { const d = attr(attrs, 'd'); if (d) shapes.push({ ops: pathOps(d, m) }) }
    else if (tag === 'rect') {
      const x = +attr(attrs, 'x') || 0, y = +attr(attrs, 'y') || 0, w = +attr(attrs, 'width') || 0, h = +attr(attrs, 'height') || 0
      shapes.push({ ops: [{ op: 'm', c: ap(m, x, y) }, { op: 'l', c: ap(m, x + w, y) }, { op: 'l', c: ap(m, x + w, y + h) }, { op: 'l', c: ap(m, x, y + h) }, { op: 'h', c: [] }] })
    } else if (tag === 'text' && after.trim()) {
      const size = parseFloat(attr(attrs, 'font-size')) || 1000
      shapes.push({ text: after.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), at: ap(m, 0, 0), size: size * Math.hypot(m[2], m[3]) })
    }
    if ((tag === 'g' || tag === 'svg' || tag === 'text') && !selfClose) stack.push(m)
  }
  return { w: W / 1000, asc: -minY / 1000, desc: (H + minY) / 1000, minX, shapes }
}

/** Zeichnet eine Formel; (x, baseline) in mm, em = Schriftgröße in mm */
export function drawMath(doc, box, x, baseline, em) {
  const k = em / 1000
  const color = doc.getTextColor()
  doc.setFillColor(color)
  for (const s of box.shapes) {
    if (s.text) {
      doc.setFontSize((s.size * k) / 0.3528)
      doc.text(s.text, x + (s.at[0] - box.minX) * k, baseline + s.at[1] * k)
      continue
    }
    if (!s.ops.length) continue
    doc.path(s.ops.map((o) => ({ op: o.op, c: o.c.map((v, j) => (j % 2 ? baseline + v * k : x + (v - box.minX) * k)) })))
    doc.fill()
  }
}
