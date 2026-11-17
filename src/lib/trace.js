// Bild -> Vektorgrafik (für Zeichnungen, Tafelbilder, Skizzen, Diagramme, Scans).
// Schwarz/Weiß-Schwelle -> Umrisse entlang der Pixelkanten verfolgen -> vereinfachen (Douglas-Peucker)
// -> ein einziger SVG-Pfad (evenodd, Löcher bleiben Löcher). Für Fotos ungeeignet – dafür gibt es die Foto-Stufen.
// Reine Funktionen (ohne DOM), in Node testbar.

/** Otsu-Schwelle (beste Trennung hell/dunkel) */
export function otsu(gray) {
  const hist = new Uint32Array(256)
  for (const v of gray) hist[v]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue
    const wF = total - wB; if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; thr = t + 1 } // „dunkel“ = Wert < thr
  }
  return thr
}

/** RGBA -> Graustufen */
export function rgbaToGray(data, w, h) {
  const g = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = data[j + 3] / 255 // Transparenz = weiß
    g[i] = Math.round(((data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8) * a + 255 * (1 - a))
  }
  return g
}

/**
 * Umrisse aller dunklen Flächen. Ecken liegen auf dem Pixelgitter (0..w, 0..h).
 * @returns {number[][]}  je Umriss [x0,y0,x1,y1,…] (geschlossen)
 */
export function traceContours(bin, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? bin[y * w + x] : 0)
  // gerichtete Kanten im Uhrzeigersinn um dunkle Flächen (dunkel liegt rechts, Bild: y nach unten), gespeichert am Startpunkt
  const W1 = w + 1
  const out = new Map() // vertex -> [dir, …]   dir: 0 rechts, 1 runter, 2 links, 3 hoch
  const add = (x, y, d) => { const k = y * W1 + x; const l = out.get(k); if (l) l.push(d); else out.set(k, [d]) }
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    // waagrechte Kante zwischen (x,y)-(x+1,y): oben Pixel (x,y-1), unten (x,y)
    if (x < w) { const up = at(x, y - 1), dn = at(x, y); if (dn && !up) add(x, y, 0); else if (up && !dn) add(x + 1, y, 2) }
    // senkrechte Kante zwischen (x,y)-(x,y+1): links (x-1,y), rechts (x,y)
    if (y < h) { const lf = at(x - 1, y), rt = at(x, y); if (lf && !rt) add(x, y, 1); else if (rt && !lf) add(x, y + 1, 3) }
  }
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]
  const loops = []
  for (const [start, dirs] of out) {
    while (dirs.length) {
      const pts = []
      let k = start, d = dirs.pop(), guard = 0
      const sx = k % W1, sy = (k - sx) / W1
      let x = sx, y = sy
      pts.push(x, y)
      for (;;) {
        x += DX[d]; y += DY[d]
        if (x === sx && y === sy) break
        const l = out.get(y * W1 + x)
        if (!l || !l.length || ++guard > 4 * (w + 1) * (h + 1)) break
        // an Kreuzungen (Schachbrett) bevorzugt rechts (zur dunklen Seite) abbiegen -> dunkle Diagonalen bleiben verbunden
        let pick = -1
        for (const nd of [(d + 1) % 4, d, (d + 3) % 4]) { const i = l.indexOf(nd); if (i >= 0) { pick = i; break } }
        if (pick < 0) pick = 0
        const nd = l.splice(pick, 1)[0]
        if (nd !== d) pts.push(x, y) // nur Ecken merken
        d = nd
      }
      if (pts.length >= 6) loops.push(pts)
    }
  }
  return loops
}

const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1] } return a / 2 }

/** Douglas-Peucker für einen geschlossenen Umriss */
export function simplify(p, eps) {
  const n = p.length / 2
  if (n <= 4) return p
  // an zwei weit entfernten Punkten aufteilen
  let far = 0, fd = -1
  for (let i = 1; i < n; i++) { const d = (p[2 * i] - p[0]) ** 2 + (p[2 * i + 1] - p[1]) ** 2; if (d > fd) { fd = d; far = i } }
  const keep = new Uint8Array(n + 1); keep[0] = keep[far] = keep[n] = 1
  const P = (i) => [p[2 * (i % n)], p[2 * (i % n) + 1]]
  const stack = [[0, far], [far, n]]
  while (stack.length) {
    const [a, b] = stack.pop()
    if (b - a < 2) continue
    const [ax, ay] = P(a), [bx, by] = P(b)
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    let md = -1, mi = -1
    for (let i = a + 1; i < b; i++) { const [x, y] = P(i); const d = Math.abs(dy * (x - ax) - dx * (y - ay)) / len; if (d > md) { md = d; mi = i } }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]) }
  }
  const o = []
  for (let i = 0; i < n; i++) if (keep[i]) o.push(p[2 * i], p[2 * i + 1])
  return o
}

/** Umrisse -> kompakter SVG-Pfad (relative Schritte) */
function loopsToPath(loops) {
  let d = ''
  for (const l of loops) {
    if (l.length < 6) continue
    let px = l[0], py = l[1]
    d += `M${px} ${py}`
    for (let i = 2; i < l.length; i += 2) {
      const x = l[i], y = l[i + 1]
      if (y === py) d += `h${x - px}`
      else if (x === px) d += `v${y - py}`
      else d += `l${x - px} ${y - py}`.replace(' -', '-')
      px = x; py = y
    }
    d += 'z'
  }
  return d
}

// ------------------------------------------------------------------ Mehrere Farben
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

// Farbraum für die Zuordnung: Helligkeit + Farbton (YCbCr), Farbton doppelt gewichtet (×√2 je Achse).
// So landen graue Kantenpixel (Weichzeichnung zwischen Schwarz und Papier) nie in einer bunten Farbe.
const K2 = Math.SQRT2
const toY = ([r, g, b]) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, (b - y) * 0.564 * K2, (r - y) * 0.713 * K2] }
const toRgb = ([y, cb, cr]) => { const r = y + (cr / K2) / 0.713, b = y + (cb / K2) / 0.564; return [r, (y - 0.299 * r - 0.114 * b) / 0.587, b].map((v) => Math.max(0, Math.min(255, v))) }

/**
 * Farben reduzieren (k-Means, deterministisch: Start mit „am weitesten entfernten“ Farben).
 * @returns {{labels:Uint8Array, palette:number[][]}}  labels je Pixel, palette = RGB-Mittelwerte
 */
export function quantize(rgba, w, h, k) {
  const n = w * h
  const px = (i) => { const a = rgba[i * 4 + 3] / 255; return toY([0, 1, 2].map((c) => rgba[i * 4 + c] * a + 255 * (1 - a))) }
  const step = Math.max(1, Math.floor(n / 30000))
  const sample = []
  for (let i = 0; i < n; i += step) sample.push(px(i))
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  // Start: hellste Farbe (meist Papier), dann jeweils die am weitesten entfernte
  const centers = [sample.reduce((best, c) => (c[0] + c[1] + c[2] > best[0] + best[1] + best[2] ? c : best), sample[0]).slice()]
  const minD = sample.map((c) => d2(c, centers[0]))
  while (centers.length < k) {
    let bi = 0
    for (let i = 1; i < sample.length; i++) if (minD[i] > minD[bi]) bi = i
    if (minD[bi] < 400) break // keine weitere deutlich andere Farbe
    centers.push(sample[bi].slice())
    for (let i = 0; i < sample.length; i++) minD[i] = Math.min(minD[i], d2(sample[i], centers[centers.length - 1]))
  }
  const nearest = (c) => { let b = 0, bd = Infinity; for (let j = 0; j < centers.length; j++) { const d = d2(c, centers[j]); if (d < bd) { bd = d; b = j } } return b }
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (const c of sample) { const j = nearest(c); sum[j][0] += c[0]; sum[j][1] += c[1]; sum[j][2] += c[2]; sum[j][3]++ }
    sum.forEach((s, j) => { if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  const labels = new Uint8Array(n)
  for (let i = 0; i < n; i++) labels[i] = nearest(px(i))
  return { labels, palette: centers.map(toRgb) }
}

/** 3×3-Mehrheitsfilter: entfernt 1-Pixel-Säume (Kantenglättung) zwischen Farbflächen */
export function majority(labels, w, h, k) {
  const out = new Uint8Array(labels.length), cnt = new Uint8Array(k)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    cnt.fill(0)
    for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) cnt[labels[yy * w + Math.min(w - 1, Math.max(0, x + dx))]]++ }
    const own = labels[y * w + x]
    let best = own
    for (let j = 0; j < k; j++) if (cnt[j] > cnt[best]) best = j
    out[y * w + x] = cnt[own] >= 3 ? own : best // eigene Farbe bleibt, wenn sie nicht nur ein Saum ist
  }
  return out
}

/**
 * Farbbild -> mehrfarbiges SVG (eine Fläche je Farbe, Hintergrund weggelassen).
 * @param {{colors?:number, eps?:number, minArea?:number}} o  colors = Anzahl Farben inkl. Hintergrund (2–8)
 * @returns {{svg:string, palette:string[], paths:number}}
 */
export function traceColorToSvg(rgba, w, h, { colors = 4, eps = 0.9, minArea = 8 } = {}) {
  const k = Math.max(2, Math.min(8, colors))
  const q = quantize(rgba, w, h, k)
  const labels = majority(q.labels, w, h, q.palette.length)
  // Hintergrund = Farbe, die den Bildrand am meisten berührt
  const border = new Uint32Array(q.palette.length)
  for (let x = 0; x < w; x++) { border[labels[x]]++; border[labels[(h - 1) * w + x]]++ }
  for (let y = 0; y < h; y++) { border[labels[y * w]]++; border[labels[y * w + w - 1]]++ }
  const bg = border.indexOf(Math.max(...border))
  const layers = []
  for (let j = 0; j < q.palette.length; j++) {
    if (j === bg) continue
    const bin = new Uint8Array(w * h)
    let area = 0
    for (let i = 0; i < bin.length; i++) if (labels[i] === j) { bin[i] = 1; area++ }
    const loops = traceContours(bin, w, h).filter((l) => Math.abs(polyArea(l)) >= minArea).map((l) => simplify(l, eps))
    const d = loopsToPath(loops)
    if (d) layers.push({ area, d, color: hex(q.palette[j]) })
  }
  layers.sort((a, b) => b.area - a.area) // große Flächen zuerst, Details oben drauf
  const paper = q.palette[bg].every((v) => v > 215) ? '#fff' : hex(q.palette[bg]) // fast weiß -> weiß
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${paper}"/>${layers.map((l) => `<path d="${l.d}" fill="${l.color}" fill-rule="evenodd"/>`).join('')}</svg>`
  return { svg, palette: [hex(q.palette[bg]), ...layers.map((l) => l.color)], paths: layers.length }
}

/**
 * Graustufenbild -> SVG.
 * @param {{threshold?:number, eps?:number, minArea?:number, color?:string, invert?:boolean}} o
 *   threshold: dunkler als das = Linie (Standard: Otsu) · eps: Vereinfachung in Pixeln · minArea: Krümel (px²) entfernen
 * @returns {{svg:string, threshold:number, paths:number}}
 */
export function traceToSvg(gray, w, h, { threshold, eps = 0.9, minArea = 6, color = '#17151f', invert = false } = {}) {
  const thr = threshold ?? otsu(gray)
  const bin = new Uint8Array(w * h)
  for (let i = 0; i < bin.length; i++) bin[i] = (gray[i] < thr) !== invert ? 1 : 0
  const loops = traceContours(bin, w, h).filter((l) => Math.abs(polyArea(l)) >= minArea).map((l) => simplify(l, eps))
  const d = loopsToPath(loops)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="${color}" fill-rule="evenodd"/></svg>`
  return { svg, threshold: thr, paths: loops.length }
}
