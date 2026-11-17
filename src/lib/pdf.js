// PDF-Export mit jsPDF: Antwortkarten + Auswertungsberichte. Läuft komplett offline.
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { cardMatrix } from './qr.js'
import { formatGid } from './gid.js'
import { splitMath, plainMath } from './math.js'
import { drawMath } from './mathpdf.js'
import qrcode from 'qrcode-generator'
import { planQuizQr, PAGE } from './qrlayout.js'

const PT = 0.3528 // mm pro Punkt
const BRAND = [91, 61, 245]
const BRAND2 = [255, 92, 138]
const INK = [23, 21, 31]
const MUTED = [108, 104, 121]
const LINE = [227, 224, 234]
const OK = [15, 138, 80]
const BAD = [210, 58, 47]
const ANS = { A: [239, 68, 82], B: [59, 108, 240], C: [242, 157, 11], D: [22, 167, 92] }
const L = ['A', 'B', 'C', 'D']

// ============================================================ Antwortkarten
/**
 * QUADRATISCHE Karten (mm, y nach unten) auf A4 – zum Zuschneiden entlang der Linien.
 * 1: 194 mm · 2: 140 mm · 4: 97 mm (älter) · 6: 93 mm. Gitter mittig auf der Seite.
 */
export const CARD_GRIDS = { 1: [1, 1, 194], 2: [1, 2, 140], 4: [2, 2, 97], 6: [2, 3, 93] }
export function cardSlots(perPage) {
  const [cols, rows, side] = CARD_GRIDS[perPage] || CARD_GRIDS[1]
  const x0 = (210 - cols * side) / 2, y0 = (297 - rows * side) / 2
  return Array.from({ length: cols * rows }, (_, i) => ({ x: x0 + (i % cols) * side, y: y0 + Math.floor(i / cols) * side, w: side, h: side }))
}

/** Schnittmarken in den Seitenrand (nur dort, wo keine andere Karte liegt) */
function cropMarks(doc, slots) {
  const inside = (x, y) => slots.some((s) => x > s.x + 0.1 && x < s.x + s.w - 0.1 && y > s.y + 0.1 && y < s.y + s.h - 0.1)
  doc.setDrawColor(0); doc.setLineWidth(0.25)
  const L = 5, g = 1.5
  for (const s of slots) for (const [cx, cy] of [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ex = cx + dx * (g + L), ey = cy + dy * (g + L)
      if (ex < 2 || ex > 208 || ey < 2 || ey > 295) continue
      if (inside(cx + dx * (g + L / 2) + dy * 0.5, cy + dy * (g + L / 2) + dx * 0.5) || inside(cx + dx * (g + L / 2) - dy * 0.5, cy + dy * (g + L / 2) - dx * 0.5)) continue
      doc.line(cx + dx * g, cy + dy * g, ex, ey)
    }
  }
}

/**
 * Feste Geometrie einer Karte. Wird auch für die Bildschirm-Vorschau verwendet,
 * damit Druck und Vorschau identisch sind.
 * Buchstaben: A oben, B rechts, C unten, D links – jeweils lesbar, wenn diese Kante oben ist.
 */
export function cardLayout(slot) {
  const side = Math.min(slot.w, slot.h)
  const qr = side * 0.62
  const cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2
  const letterPt = (side * 0.085) / PT
  const gap = qr / 2 + side * 0.07
  return {
    side, qr, cx, cy, letterPt, gap,
    letters: [
      { L: 'A', angle: 0, x: cx, y: cy - gap },
      { L: 'B', angle: -90, x: cx + gap, y: cy },
      { L: 'C', angle: 180, x: cx, y: cy + gap },
      { L: 'D', angle: 90, x: cx - gap, y: cy },
    ],
  }
}

/** Text mittig auf (x,y) setzen, um angle° gedreht (gegen den Uhrzeigersinn) */
function centeredText(doc, str, x, y, angle, pt) {
  const capH = pt * PT * 0.72
  const a = (angle * Math.PI) / 180
  const w = doc.getTextWidth(str)
  const dir = { x: Math.cos(a), y: -Math.sin(a) } // Schreibrichtung (y nach unten)
  const up = { x: -Math.sin(a), y: -Math.cos(a) }
  doc.text(str, x - (w / 2) * dir.x - (capH / 2) * up.x, y - (w / 2) * dir.y - (capH / 2) * up.y, { angle })
}

/**
 * Rückseite (für Duplexdruck, an der langen Kante gespiegelt).
 * Die Person hinter der Karte sieht: A oben, B LINKS, C unten, D RECHTS –
 * genau die Antwort, die gerade oben steht, ist für sie aufrecht lesbar.
 */
export function backLayout(slot) {
  const inset = Math.min(slot.w, slot.h) * 0.035
  const r = { x: slot.x + inset, y: slot.y + inset, w: slot.w - 2 * inset, h: slot.h - 2 * inset }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const side = Math.min(r.w, r.h)
  const k = 0.62 // Lage der Buchstaben zwischen Mitte und Rand
  return {
    r, cx, cy, side,
    letterPt: (side * 0.2) / PT,
    disc: side * 0.17,
    wedges: [
      { L: 'A', angle: 0, pts: [[r.x, r.y], [r.x + r.w, r.y]], x: cx, y: cy - (r.h / 2) * k },
      { L: 'B', angle: 90, pts: [[r.x, r.y + r.h], [r.x, r.y]], x: cx - (r.w / 2) * k, y: cy },
      { L: 'C', angle: 180, pts: [[r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], x: cx, y: cy + (r.h / 2) * k },
      { L: 'D', angle: -90, pts: [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]], x: cx + (r.w / 2) * k, y: cy },
    ],
  }
}

const tint = (c, t) => c.map((v) => Math.round(255 - (255 - v) * t))

function drawBack(doc, n, name, slot, gid) {
  const lay = backLayout(slot)
  for (const w of lay.wedges) {
    const [[x1, y1], [x2, y2]] = w.pts
    doc.setFillColor(...tint(ANS[w.L], 0.2))
    doc.triangle(x1, y1, x2, y2, lay.cx, lay.cy, 'F')
  }
  // feine weiße Diagonalen trennen die Felder
  doc.setDrawColor(255); doc.setLineWidth(lay.side * 0.012)
  doc.line(lay.r.x, lay.r.y, lay.r.x + lay.r.w, lay.r.y + lay.r.h)
  doc.line(lay.r.x + lay.r.w, lay.r.y, lay.r.x, lay.r.y + lay.r.h)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(lay.letterPt)
  for (const w of lay.wedges) { doc.setTextColor(...ANS[w.L]); centeredText(doc, w.L, w.x, w.y, w.angle, lay.letterPt) }
  // Mitte: Kartennummer
  doc.setFillColor(255, 255, 255); doc.circle(lay.cx, lay.cy, lay.disc, 'F')
  const numPt = (lay.disc * (gid ? 0.36 : 0.95)) / PT
  doc.setTextColor(...INK); doc.setFontSize(numPt)
  centeredText(doc, gid ? formatGid(gid) : String(n), lay.cx, lay.cy - (name ? lay.disc * 0.18 : 0), 0, numPt)
  const small = (lay.side * 0.028) / PT
  if (name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(small); doc.setTextColor(...MUTED)
    centeredText(doc, doc.splitTextToSize(name, lay.disc * 1.7)[0], lay.cx, lay.cy + lay.disc * 0.55, 0, small)
  }
  // Hinweis unter der Mitte
  doc.setFont('helvetica', 'normal'); doc.setFontSize(small * 0.75); doc.setTextColor(...MUTED)
  centeredText(doc, 'Deine Antwort steht oben', lay.cx, lay.cy + lay.disc + lay.side * 0.04, 0, small * 0.75)
}

/** n = Kartennummer; gid = feste Schüler-ID (dann steht die ID im QR-Code und oben links) */
function drawCard(doc, n, name, slot, gid) {
  const lay = cardLayout(slot)
  // Schnittlinie (quadratisch)
  doc.setDrawColor(170); doc.setLineWidth(0.2); doc.setLineDashPattern([1.5, 1.5], 0)
  doc.rect(slot.x, slot.y, slot.w, slot.h)
  doc.setLineDashPattern([], 0)
  // QR-Code (horizontale Läufe zusammengefasst)
  const m = cardMatrix(gid || n), size = m.length, mod = lay.qr / size
  const x0 = lay.cx - lay.qr / 2, y0 = lay.cy - lay.qr / 2
  doc.setFillColor(0, 0, 0)
  for (let r = 0; r < size; r++) {
    let c = 0
    while (c < size) {
      if (!m[r][c]) { c++; continue }
      let e = c
      while (e < size && m[r][e]) e++
      doc.rect(x0 + c * mod, y0 + r * mod, (e - c) * mod + 0.02, mod + 0.02, 'F')
      c = e
    }
  }
  // Buchstaben – zentriert auf ihren Punkt, gedreht
  doc.setFont('helvetica', 'bold'); doc.setFontSize(lay.letterPt); doc.setTextColor(120)
  for (const t of lay.letters) centeredText(doc, t.L, t.x, t.y, t.angle, lay.letterPt)
  // Nummer + Name + Marke
  const small = lay.side * 0.032 / PT
  doc.setFontSize(small); doc.setTextColor(40)
  doc.text(gid ? formatGid(gid) : String(n), slot.x + 4, slot.y + 4 + small * PT)
  if (name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(small * 0.8)
    doc.text(name.slice(0, 40), slot.x + 4, slot.y + slot.h - 4)
  }
  const ls = Math.max(3, lay.side * 0.03) // nur das Logo, dezent
  drawLogo(doc, slot.x + slot.w - 4 - ls, slot.y + slot.h - 4 - ls * 0.9, ls, { opacity: 0.55 })
}

/** @param {{card:number,name?:string,gid?:string}[]} cards  gid gesetzt -> feste Schüler-Karte */
export function cardsPdf(cards, perPage = 1, { backs = false } = {}) { // Rückseite standardmäßig aus
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: 'Drehmoment – Antwortkarten', creator: 'Drehmoment' })
  const slots = cardSlots(perPage)
  for (let p = 0; p < cards.length; p += slots.length) {
    const page = cards.slice(p, p + slots.length)
    if (p > 0) doc.addPage()
    page.forEach((c, i) => drawCard(doc, c.card, c.name, slots[i], c.gid))
    cropMarks(doc, slots.slice(0, page.length))
    const bottom = Math.max(...slots.map((s) => s.y + s.h))
    if (297 - bottom > 14) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150)
      doc.text(backs ? 'Quadratisch zuschneiden · beidseitig drucken (lange Kante)' : 'Quadratisch zuschneiden · festes Papier/Karton (ab 160 g/m²), damit nichts durchscheint',
        105, bottom + 9, { align: 'center' })
    }
    if (backs) {
      // Rückseite: an der langen Kante gespiegelt -> Spalten tauschen
      doc.addPage()
      page.forEach((c, i) => { const s = slots[i]; drawBack(doc, c.card, c.name, { ...s, x: 210 - s.x - s.w }, c.gid) })
    }
  }
  return doc
}

// ============================================================ Auswertung
function stats(session) {
  const perQ = session.questions.map((q) => {
    const resp = session.responses[q.id] || {}
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    let answered = 0, right = 0
    for (const s of session.roster) {
      const a = resp[s.card]
      if (!a) continue
      answered++; counts[a]++
      if (q.type !== 'poll' && q.correct.includes(L.indexOf(a))) right++
    }
    const graded = q.type !== 'poll' && q.correct.length > 0
    return { q, counts, answered, right, graded, pct: graded && answered ? right / answered : null }
  })
  const students = session.roster.map((s) => {
    let right = 0, graded = 0, answered = 0
    const answers = session.questions.map((q) => {
      const a = session.responses[q.id]?.[s.card] || ''
      if (a) answered++
      if (q.type !== 'poll' && q.correct.length) { graded++; if (a && q.correct.includes(L.indexOf(a))) right++ }
      return a
    })
    return { ...s, answers, right, graded, answered }
  })
  const active = students.filter((s) => s.answered > 0)
  const gradedQs = perQ.filter((p) => p.graded && p.answered)
  return {
    perQ, students,
    participants: active.length,
    avg: gradedQs.length ? gradedQs.reduce((a, p) => a + p.pct, 0) / gradedQs.length : null,
    participation: session.roster.length && session.questions.length
      ? students.reduce((a, s) => a + s.answered, 0) / (session.roster.length * session.questions.length) : 0,
  }
}
export { stats as sessionStats }

// ------------------------------------------------------------ Text mit Formeln
/**
 * Bricht Text mit LaTeX-Formeln um. math = Renderer aus mathpdf.js (oder null -> Formel als Quelltext).
 * @returns {{lines:{items:object[], asc:number, desc:number}[], pt:number}}
 */
function layoutRich(doc, text, maxW, pt, math) {
  const em = pt * PT, tAsc = em * 0.75, tDesc = em * 0.25
  const lines = []
  let line = { items: [], w: 0, asc: tAsc, desc: tDesc }
  const flush = () => { while (line.items.length && line.items.at(-1).sp) line.w -= line.items.pop().w; lines.push(line); line = { items: [], w: 0, asc: tAsc, desc: tDesc } }
  const add = (it) => {
    if (it.sp && !line.items.length) return
    if (!it.sp && line.items.length && line.w + it.w > maxW) flush()
    line.items.push(it); line.w += it.w
    if (it.box) { line.asc = Math.max(line.asc, it.box.asc * em); line.desc = Math.max(line.desc, it.box.desc * em) }
  }
  doc.setFontSize(pt)
  for (const part of splitMath(text)) {
    if (part.tex !== undefined) {
      const box = math ? math(part.tex, false) : null
      if (box) { add({ box, w: box.w * em }); continue }
      part.text = part.tex // Fallback: Quelltext
    }
    for (const tok of part.text.split(/(\n|[ \t]+)/)) {
      if (!tok) continue
      if (tok === '\n') { flush(); continue }
      if (/^[ \t]+$/.test(tok)) { add({ s: ' ', w: doc.getTextWidth(' '), sp: true }); continue }
      let word = tok
      while (doc.getTextWidth(word) > maxW && word.length > 1) { // überlanges Wort hart trennen
        let n = word.length - 1
        while (n > 1 && doc.getTextWidth(word.slice(0, n)) > maxW) n--
        add({ s: word.slice(0, n), w: doc.getTextWidth(word.slice(0, n)) }); flush(); word = word.slice(n)
      }
      add({ s: word, w: doc.getTextWidth(word) })
    }
  }
  if (line.items.length || !lines.length) flush()
  return { lines, pt }
}

/** Höhe ab erster Grundlinie bis unter die letzte Zeile */
function richHeight(lay, lineH) {
  let h = 0
  lay.lines.forEach((l, i) => { if (i) h += Math.max(lineH, lay.lines[i - 1].desc + l.asc + 0.6) })
  return h + Math.max(lineH, lay.lines.at(-1).desc + 1.2)
}

/** Zeichnet; y = Grundlinie der ersten Zeile. Gibt die verbrauchte Höhe zurück (wie lines*lineH). */
function drawRich(doc, lay, x, y, lineH, { align = 'left', maxW = 0 } = {}) {
  let base = y
  doc.setFontSize(lay.pt)
  lay.lines.forEach((l, i) => {
    if (i) base += Math.max(lineH, lay.lines[i - 1].desc + l.asc + 0.6)
    let cx = align === 'right' ? x + maxW - l.w : x
    let run = '', runX = cx // zusammenhängenden Text in einem Stück setzen (natürliche Wortabstände)
    const flushRun = () => { if (run.trim()) doc.text(run, runX, base); run = '' }
    for (const it of l.items) {
      if (it.box) { flushRun(); drawMath(doc, it.box, cx, base, lay.pt * PT); doc.setFontSize(lay.pt) } else { if (!run) runX = cx; run += it.s }
      cx += it.w
    }
    flushRun()
  })
  return base - y + Math.max(lineH, lay.lines.at(-1).desc + 1.2)
}

/** Nur erste Zeile (mit … wenn gekürzt) */
function firstLine(lay, doc) {
  if (lay.lines.length <= 1) return lay
  const l = lay.lines[0]
  const dots = { s: '…', w: doc.getTextWidth('…') }
  l.items.push(dots); l.w += dots.w
  return { ...lay, lines: [l] }
}

const pct = (v) => (v == null ? '–' : Math.round(v * 100) + ' %')

/** @param math optional: Formel-Renderer aus mathpdf.js (loadMathRenderer) – sonst Formeln als Quelltext */
export function reportPdf(session, { math = null } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210, M = 16
  const st = stats(session)
  doc.setProperties({ title: `Auswertung – ${plainMath(session.title)}`, creator: 'Drehmoment' })

  // --- Kopf mit Verlauf
  const steps = 40
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    doc.setFillColor(...BRAND.map((c, k) => Math.round(c + (BRAND2[k] - c) * t)))
    doc.rect((W / steps) * i, 0, W / steps + 0.3, 46, 'F')
  }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('DREHMOMENT · AUSWERTUNG', M, 13)
  doc.setFontSize(20)
  doc.text(doc.splitTextToSize(plainMath(session.title), W - 2 * M).slice(0, 2), M, 24)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  const date = new Date(session.startedAt).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })
  doc.text(`${session.className}  ·  ${date}`, M, 40)

  // --- Kennzahlen
  let y = 56
  const kpis = [
    ['Teilnehmende', `${st.participants} / ${session.roster.length}`],
    ['Ø richtig', pct(st.avg)],
    ['Fragen', String(session.questions.length)],
    ['Beteiligung', pct(st.participation)],
  ]
  const kw = (W - 2 * M - 3 * 4) / 4
  kpis.forEach(([label, val], i) => {
    const x = M + i * (kw + 4)
    doc.setFillColor(245, 244, 248); doc.roundedRect(x, y, kw, 22, 3, 3, 'F')
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(label.toUpperCase(), x + 4, y + 7)
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
    doc.text(val, x + 4, y + 17)
  })
  y += 32

  // --- Fragen
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK)
  doc.text('Fragen im Detail', M, y); y += 7
  for (const [i, p] of st.perQ.entries()) {
    const q = p.q
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
    const qLay = layoutRich(doc, q.text, W - 2 * M - 40, 10.5, math)
    doc.setFont('helvetica', 'normal')
    const optLays = q.options.map((opt) => firstLine(layoutRich(doc, opt || '–', 40, 9, math), doc))
    const optH = optLays.map((l) => Math.max(7.5, l.lines[0].asc + l.lines[0].desc + 3))
    doc.setFont('helvetica', 'bold')
    const blockH = richHeight(qLay, 4.8) + optH.reduce((a, b) => a + b, 0) + 12
    if (y + blockH > 280) { doc.addPage(); y = M }
    // Nummer-Badge
    doc.setFillColor(...BRAND); doc.roundedRect(M, y - 4.2, 9, 6, 1.5, 1.5, 'F')
    doc.setTextColor(255); doc.setFontSize(8.5); doc.text(`F${i + 1}`, M + 4.5, y, { align: 'center' })
    doc.setTextColor(...INK); doc.setFontSize(10.5)
    const qH = drawRich(doc, qLay, M + 12, y, 4.8)
    // Ergebnis rechts
    doc.setFontSize(10)
    if (p.graded) {
      const c = p.pct == null ? MUTED : p.pct >= 0.7 ? OK : p.pct >= 0.4 ? [190, 120, 0] : BAD
      doc.setTextColor(...c); doc.text(`${pct(p.pct)} richtig`, W - M, y, { align: 'right' })
    } else { doc.setTextColor(...MUTED); doc.text('Umfrage', W - M, y, { align: 'right' }) }
    y += qH + 2
    // Balken
    const barX = M + 62, barW = W - 2 * M - 62 - 22
    q.options.forEach((opt, k) => {
      const letter = L[k], n = p.counts[letter], share = p.answered ? n / p.answered : 0
      const isRight = q.correct.includes(k) && q.type !== 'poll'
      const ol = optLays[k].lines[0]
      y += Math.max(0, ol.asc - 3.6) // hohe Formeln (Brüche) brauchen Platz nach oben
      doc.setFillColor(...ANS[letter]); doc.roundedRect(M + 12, y - 3.6, 5, 5, 1, 1, 'F')
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(letter, M + 14.5, y - 0.2, { align: 'center' })
      doc.setTextColor(...(isRight ? OK : INK)); doc.setFont('helvetica', isRight ? 'bold' : 'normal'); doc.setFontSize(9)
      const used = drawRich(doc, optLays[k], M + 19, y, 4)
      if (isRight) doc.text('(richtig)', Math.min(M + 19 + ol.w + 2, barX - 14), y)
      void used
      doc.setFillColor(...LINE); doc.roundedRect(barX, y - 3.2, barW, 4.2, 1.2, 1.2, 'F')
      if (share > 0) { doc.setFillColor(...(isRight ? OK : ANS[letter])); doc.roundedRect(barX, y - 3.2, Math.max(2.4, barW * share), 4.2, 1.2, 1.2, 'F') }
      doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.text(`${n}  (${Math.round(share * 100)} %)`, W - M, y, { align: 'right' })
      y += Math.max(7.5, ol.desc + 5.5)
    })
    if (q.explanation) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
      const ex = layoutRich(doc, 'Erklärung: ' + q.explanation, W - 2 * M - 12, 8.5, math)
      if (y + richHeight(ex, 4) > 285) { doc.addPage(); y = M }
      y += drawRich(doc, ex, M + 12, y, 4)
    }
    y += 6
  }

  // --- Ergebnisse je Person
  doc.addPage()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK)
  doc.text('Ergebnisse je Person', M, M + 2)
  const head = [['#', 'Name', ...session.questions.map((_, i) => `F${i + 1}`), 'Richtig']]
  const body = st.students.map((s) => [
    s.card, s.name || `Karte ${s.card}`, ...s.answers,
    s.graded ? `${s.right}/${s.graded}` : '–',
  ])
  autoTable(doc, {
    startY: M + 7, head, body, margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: session.questions.length > 14 ? 7 : 8.5, cellPadding: 1.8, halign: 'center', lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'left', cellWidth: 'auto' } },
    alternateRowStyles: { fillColor: [250, 249, 252] },
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const qi = d.column.index - 2
      if (qi < 0 || qi >= session.questions.length) return
      const q = session.questions[qi], a = d.cell.raw
      if (!a) { d.cell.text = ['·']; d.cell.styles.textColor = [190, 190, 200]; return }
      if (q.type === 'poll' || !q.correct.length) { d.cell.styles.textColor = MUTED; return }
      const ok = q.correct.includes(L.indexOf(a))
      d.cell.styles.fillColor = ok ? [218, 243, 230] : [253, 228, 225]
      d.cell.styles.textColor = ok ? OK : BAD
      d.cell.styles.fontStyle = 'bold'
    },
  })

  // --- Fußzeile
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    const bw = brandMark(doc, M, 290, 7.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`·  ${plainMath(session.title)} · ${session.className}`, M + bw + 2, 290)
    doc.text(`Seite ${i} / ${pages}`, W - M, 290, { align: 'right' })
  }
  return doc
}

// ============================================================ Quiz als QR-Code (PDF)
/**
 * Schönes A4-Blatt zum Ausdrucken: Kopf mit Titel, gerahmte Inhaltsübersicht, QR-Raster.
 * Standard höchstens 2 Seiten (Vorder-/Rückseite), mit maxPages auch mehr. Passen die Codes nicht, werden weniger, größere Codes gebaut.
 * @param {object} set Quiz
 * @param {{mode?:'content'|'link', start?:boolean, maxBytes?:number, math?:Function, base?:string, maxPages?:number}} o  (base nur für mode 'link')
 */
export function quizQrPdf(set, { mode = 'content', start = true, maxBytes = 500, math = null, base, maxPages = 2 } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210, H = 297, M = 14
  const title = plainMath(set.title || 'Quiz')
  doc.setProperties({ title: `Quiz-Code – ${title}`, creator: 'Drehmoment' })

  // --- Kopf
  const head = (sub) => {
    const steps = 40
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      doc.setFillColor(...BRAND.map((c, k) => Math.round(c + (BRAND2[k] - c) * t)))
      doc.rect((W / steps) * i, 0, W / steps + 0.3, sub ? 22 : 40, 'F')
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('DREHMOMENT · QUIZ-CODE' + (sub ? ' · RÜCKSEITE' : ''), M, 11)
    doc.setFontSize(sub ? 13 : 20)
    doc.text(doc.splitTextToSize(title, W - 2 * M).slice(0, sub ? 1 : 2), M, sub ? 18 : 22)
    if (!sub) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      const n = set.questions.filter((q) => q.text.trim()).length
      doc.text([set.subject, set.grade && (/^\d/.test(set.grade) ? 'Klasse ' + set.grade : set.grade), `${n} Fragen`].filter(Boolean).join('  ·  '), M, 34)
    }
  }
  head(false)

  // --- Inhalt (Rahmen)
  let y = 50
  const qs = set.questions.filter((q) => q.text.trim())
  const boxX = M, boxW = W - 2 * M, inner = boxW - 12
  const items = []
  doc.setFont('helvetica', 'normal')
  doc.setFont('helvetica', 'italic')
  if (set.description) items.push({ lay: firstLine(layoutRich(doc, set.description, inner, 9.5, math), doc), italic: true })
  doc.setFont('helvetica', 'normal')
  const maxQ = qs.length > 14 ? 11 : qs.length
  qs.slice(0, maxQ).forEach((q, i) => items.push({ lay: firstLine(layoutRich(doc, `${i + 1}. ${q.text}`, inner, 9.5, math), doc) }))
  if (qs.length > maxQ) items.push({ lay: layoutRich(doc, `… und ${qs.length - maxQ} weitere Fragen`, inner, 9.5, null), muted: true })
  if (set.material) items.push({ lay: layoutRich(doc, 'Mit Vorbereitungsmaterial für zu Hause', inner, 9, null), muted: true })
  const itemH = items.map((it) => Math.max(5.2, it.lay.lines[0].asc + it.lay.lines[0].desc + 1.4))
  const boxH = 12 + itemH.reduce((a, b) => a + b, 0) + 3
  doc.setFillColor(248, 247, 252); doc.setDrawColor(...BRAND); doc.setLineWidth(0.5)
  doc.roundedRect(boxX, y, boxW, boxH, 3, 3, 'FD')
  doc.setFillColor(255, 255, 255); doc.rect(boxX + 5, y - 2.5, 20, 5, 'F')
  doc.setTextColor(...BRAND); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('INHALT', boxX + 7, y + 1.2)
  let iy = y + 9
  items.forEach((it, k) => {
    iy += Math.max(0, it.lay.lines[0].asc - 3.2)
    doc.setFont('helvetica', it.italic ? 'italic' : 'normal'); doc.setTextColor(...(it.muted || it.italic ? MUTED : INK))
    drawRich(doc, it.lay, boxX + 6, iy, 4.6)
    iy += itemH[k] - Math.max(0, it.lay.lines[0].asc - 3.2)
  })
  y += boxH + 7

  // --- Anleitung
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  y += 1

  // --- Codes passend machen: größtmögliche Module, höchstens maxPages Seiten (Standard 2)
  const area1 = { top: y + 6, bottom: PAGE.bottom }, area2 = { top: PAGE.top2, bottom: PAGE.bottom }
  const gap = PAGE.gap
  const plan = planQuizQr(set, { mode, start, maxBytes, base, maxPages, firstTop: area1.top })
  if (!plan.lay) {
    throw new Error(plan.pages
      ? `Quiz zu groß für ${maxPages === 1 ? 'eine Seite' : maxPages + ' Seiten'} – es bräuchte ${plan.pages} Seiten. Bilder verkleinern/weglassen oder mehr Seiten erlauben.`
      : 'Quiz zu groß für QR-Codes – bitte als Datei teilen.')
  }
  const best = { ...plan.lay, texts: plan.texts, mats: plan.texts.map((t) => qrModules(t, plan.alnum)) }

  doc.text(best.texts.length > 1
    ? `So geht's: Drehmoment öffnen » „QR scannen“ » alle ${best.texts.length} Codes nacheinander scannen (Reihenfolge egal).`
    : mode === 'link' ? 'So geht\'s: Mit der Handykamera oder in Drehmoment über „QR scannen“ scannen.' : 'So geht\'s: Drehmoment öffnen » „QR scannen“ » Code scannen.', M, y)

  // --- Raster zeichnen (gleichmäßig verteilt)
  const drawGrid = (list, startIdx, area) => {
    const rows = Math.ceil(list.length / best.cols)
    const rowH = best.cell + best.lab
    const free = area.bottom - area.top - rows * rowH
    const vgap = rows > 1 ? Math.min(free / (rows - 1), 30) : 0
    const top = area.top + Math.max(0, (free - vgap * (rows - 1)) / 2)
    list.forEach((m, i) => {
      const r = Math.floor(i / best.cols), inRow = Math.min(best.cols, list.length - r * best.cols)
      const rowW = inRow * best.cell + (inRow - 1) * gap
      const x = (W - rowW) / 2 + (i % best.cols) * (best.cell + gap), yy = top + r * (rowH + vgap)
      drawModules(doc, m, x, yy, best.cell)
      if (best.lab) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BRAND)
        doc.text(`Teil ${startIdx + i + 1} / ${best.texts.length}`, x + best.cell / 2, yy + best.cell + 4.5, { align: 'center' })
      }
    })
  }
  const first = best.mats.slice(0, best.cols * best.r1)
  drawGrid(first, 0, area1)
  for (let i = first.length; i < best.mats.length; i += best.cols * best.r2) {
    doc.addPage(); head(true)
    drawGrid(best.mats.slice(i, i + best.cols * best.r2), i, area2)
  }

  // --- Fußzeile
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const bw = brandMark(doc, M, H - 8, 7.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(mode === 'link' ? '·  Quiz-Link' : '·  Quiz steckt komplett im Code – funktioniert ohne Internet und unabhängig von der Web-Adresse', M + bw + 2, H - 8)
    if (pages > 1) doc.text(`Seite ${i} / ${pages}`, W - M, H - 8, { align: 'right' })
  }
  return doc
}

function qrModules(text, alnum) {
  const qr = qrcode(0, 'L')
  qr.addData(text, alnum ? 'Alphanumeric' : 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** QR inkl. Ruhezone (4 Module) in ein Quadrat der Kante `side` zeichnen */
function drawModules(doc, m, x, y, side) {
  const n = m.length, mod = side / (n + 8), x0 = x + 4 * mod, y0 = y + 4 * mod
  doc.setFillColor(0, 0, 0)
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!m[r][c]) { c++; continue }
      let e = c
      while (e < n && m[r][e]) e++
      doc.rect(x0 + c * mod, y0 + r * mod, (e - c) * mod + 0.01, mod + 0.01, 'F')
      c = e
    }
  }
}

// ============================================================ Logo (Vektor, nach public/icon.svg)
/** Drehmoment-Logo als Vektorgrafik. (x, y) = linke obere Ecke, s = Kantenlänge in mm */
export function drawLogo(doc, x, y, s, { opacity = 1 } = {}) {
  const k = s / 512
  const P = (px, py) => [x + px * k, y + py * k]
  const poly = (pts) => { doc.path([{ op: 'm', c: pts[0] }, ...pts.slice(1).map((c) => ({ op: 'l', c })), { op: 'h', c: [] }]) }
  const rounded = (rx, ry, w, h, r, rot) => { // abgerundetes Rechteck als Polygon, optional gedreht
    const pts = []
    for (const [cx, cy, a0] of [[rx + w - r, ry + r, -90], [rx + w - r, ry + h - r, 0], [rx + r, ry + h - r, 90], [rx + r, ry + r, 180]]) {
      for (let i = 0; i <= 6; i++) { const a = ((a0 + i * 15) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
    }
    return pts.map(([px, py]) => P(...(rot ? rot(px, py) : [px, py])))
  }
  const gs = (o) => doc.setGState(new doc.GState({ opacity: o, 'stroke-opacity': o }))
  const mix = (rgb) => rgb.map((v) => Math.round(v * opacity + 255 * (1 - opacity))) // Deckkraft ohne Überlappungs-Streifen
  doc.saveGraphicsState()
  // Hintergrund mit diagonalem Verlauf (Streifen, auf das abgerundete Quadrat beschnitten)
  doc.saveGraphicsState()
  poly(rounded(0, 0, 512, 512, 112)); doc.clip(); doc.discardPath()
  const N = 24
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), c0 = (1024 * i) / N, c1 = (1024 * (i + 1)) / N + 3 // leicht überlappend, deckend
    doc.setFillColor(...mix(BRAND.map((c, j) => Math.round(c + (BRAND2[j] - c) * t))))
    poly([P(c0 + 600, -600), P(c1 + 600, -600), P(-600, c1 + 600), P(-600, c0 + 600)]); doc.fill()
  }
  doc.restoreGraphicsState()
  // Drehpfeil
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(30 * k); doc.setLineCap('round'); doc.setLineJoin('round')
  gs(0.45 * opacity)
  const arc = []
  for (let a = -90; a <= 204.1; a += 6) arc.push(P(256 + 164 * Math.cos((a * Math.PI) / 180), 256 + 164 * Math.sin((a * Math.PI) / 180)))
  doc.path([{ op: 'm', c: arc[0] }, ...arc.slice(1).map((c) => ({ op: 'l', c }))]); doc.stroke()
  doc.path([{ op: 'm', c: P(74, 160) }, { op: 'l', c: P(108, 196) }, { op: 'l', c: P(148, 166) }]); doc.stroke()
  gs(1)
  // Gedrehte Karte mit QR-Andeutung
  const th = (-14 * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th)
  const rot = (px, py) => [256 + (px - 256) * cs - (py - 262) * sn, 262 + (px - 256) * sn + (py - 262) * cs]
  const fill = (rgb, pts) => { doc.setFillColor(...mix(rgb)); poly(pts); doc.fill() }
  fill([255, 255, 255], rounded(156, 162, 200, 200, 28, rot))
  for (const [fx, fy] of [[186, 192], [270, 192], [186, 276]]) {
    fill(INK, rounded(fx, fy, 56, 56, 8, rot)); fill([255, 255, 255], rounded(fx + 17, fy + 17, 22, 22, 3, rot))
  }
  for (const [qx, qy, q] of [[276, 282, 20], [306, 306, 20], [306, 276, 14]]) fill(INK, rounded(qx, qy, q, q, 0.01, rot))
  doc.restoreGraphicsState()
  doc.setLineCap('butt'); doc.setLineJoin('miter')
}

/** Dezente Marke: Logo + „Drehmoment“ (y = Grundlinie) */
function brandMark(doc, x, y, pt = 7.5, { align = 'left', opacity = 0.85 } = {}) {
  const s = pt * PT * 1.25
  doc.setFont('helvetica', 'bold'); doc.setFontSize(pt); doc.setTextColor(...MUTED)
  const tw = doc.getTextWidth('Drehmoment'), w = s + 1.2 + tw
  const x0 = align === 'right' ? x - w : x
  drawLogo(doc, x0, y - s * 0.86, s, { opacity })
  doc.setTextColor(...MUTED); doc.text('Drehmoment', x0 + s + 1.2, y)
  return w
}

// ============================================================ Poster (A4) für Lehrkräfte
/** Modernes Info-Poster: was Drehmoment kann + QR-Code zur App. base = Adresse der App */
export function posterPdf(base) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210, H = 297, M = 16
  doc.setProperties({ title: 'Drehmoment – Poster', creator: 'Drehmoment' })
  const mixW = (rgb, t) => rgb.map((v) => Math.round(255 - (255 - v) * t))

  // --- Hintergrund: zarte Punkte in den Antwortfarben
  const dots = [[18, 112, 2.2, 'A'], [194, 104, 3, 'B'], [186, 168, 1.6, 'C'], [10, 150, 2.6, 'D'], [100, 98, 1.4, 'C'], [196, 236, 2, 'A'], [12, 240, 1.8, 'B']]
  for (const [x, y, r, L] of dots) { doc.setFillColor(...mixW(ANS[L], 0.35)); doc.circle(x, y, r, 'F') }

  // --- Kopf mit Verlauf
  const steps = 60
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    doc.setFillColor(...BRAND.map((c, k) => Math.round(c + (BRAND2[k] - c) * t)))
    doc.rect((W / steps) * i, 0, W / steps + 0.3, 86, 'F')
  }
  doc.setFillColor(255, 255, 255); doc.ellipse(W / 2, 92, 140, 12, 'F') // weiche Welle
  drawLogo(doc, M, 16, 22)
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(34)
  doc.text('Drehmoment', M + 28, 33)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text('Abstimmen mit Papierkarten – für jede Klasse', M + 28, 40.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(23)
  doc.text(['Die ganze Klasse antwortet.', 'In Sekunden ausgewertet.'], M, 58)

  // --- Illustration: drei gedrehte Antwortkarten
  const cardAt = (cx, cy, side, deg, n, L) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const R = (x, y) => [cx + x * c - y * s, cy + x * s + y * c]
    const poly = (pts) => { doc.path([{ op: 'm', c: pts[0] }, ...pts.slice(1).map((p) => ({ op: 'l', c: p })), { op: 'h', c: [] }]); doc.fill() }
    doc.setFillColor(225, 222, 235); poly([R(-side / 2 + 1.2, -side / 2 + 1.8), R(side / 2 + 1.2, -side / 2 + 1.8), R(side / 2 + 1.2, side / 2 + 1.8), R(-side / 2 + 1.2, side / 2 + 1.8)])
    const face = [R(-side / 2, -side / 2), R(side / 2, -side / 2), R(side / 2, side / 2), R(-side / 2, side / 2)]
    doc.setFillColor(255, 255, 255); poly(face)
    doc.setDrawColor(200, 196, 214); doc.setLineWidth(0.35)
    doc.path([{ op: 'm', c: face[0] }, ...face.slice(1).map((p) => ({ op: 'l', c: p })), { op: 'h', c: [] }]); doc.stroke()
    const m = cardMatrix(n), q = side * 0.62, mod = q / m.length
    doc.setFillColor(...INK)
    for (let r = 0; r < m.length; r++) for (let k = 0; k < m.length; k++) {
      if (!m[r][k]) continue
      const x = -q / 2 + k * mod, y = -q / 2 + r * mod
      poly([R(x, y), R(x + mod + 0.02, y), R(x + mod + 0.02, y + mod + 0.02), R(x, y + mod + 0.02)])
    }
    // Buchstabe oben (die gewählte Antwort) farbig, die anderen grau
    const gap = q / 2 + side * 0.08
    const letters = [['A', 0, -gap, 0], ['B', gap, 0, -90], ['C', 0, gap, 180], ['D', -gap, 0, 90]]
    const pt = (side * 0.11) / PT
    doc.setFont('helvetica', 'bold'); doc.setFontSize(pt)
    for (const [l, x, y, ang] of letters) {
      doc.setTextColor(...(l === L ? ANS[l] : [170, 170, 180]))
      const [px, py] = R(x, y)
      centeredText(doc, l, px, py, ang - deg, pt)
    }
  }
  // drei Karten, drei Antworten: gedreht -> anderer Buchstabe oben
  cardAt(52, 128, 44, -82, 7, 'B')
  cardAt(105, 122, 50, 4, 12, 'A')
  cardAt(158, 130, 44, 96, 3, 'D')
  // Hinweis: oben steht die Antwort
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BRAND)
  doc.text('Was oben steht, ist die Antwort.', W / 2, 162, { align: 'center' })

  // --- Das Wichtigste in vier Kacheln
  const feats = [
    ['A', 'Kostenlos', 'Kein Konto, keine Werbung, keine Schüler-Handys.'],
    ['B', 'Als App installieren', 'Im Browser öffnen und „Zum Startbildschirm“ wählen.'],
    ['C', 'Funktioniert offline', 'Alles bleibt auf deinem Gerät – auch ohne WLAN.'],
    ['D', 'Klassen aus dem Schülerverzeichnis', 'Gruppe wählen, exportieren – feste Karte für jede Person.'],
  ]
  const tw = (W - 2 * M - 6) / 2, th = 27
  feats.forEach(([L, t, d], i) => {
    const x = M + (i % 2) * (tw + 6), yy = 173 + Math.floor(i / 2) * (th + 5)
    doc.setFillColor(...mixW(ANS[L], 0.12)); doc.roundedRect(x, yy, tw, th, 4, 4, 'F')
    doc.setFillColor(...ANS[L]); doc.roundedRect(x, yy, 3, th, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    const title = doc.setFontSize(13).splitTextToSize(t, tw - 12)
    doc.text(title, x + 8, yy + 9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(d, tw - 12).slice(0, 2), x + 8, yy + 9 + title.length * 5.4 + 0.6)
  })

  // --- QR-Code zur App
  const qrS = 40, qx = M, qy = 238
  drawModules(doc, qrModules(base, false), qx, qy, qrS)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...BRAND)
  doc.text('Scannen & loslegen', qx + qrS + 8, qy + 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK)
  doc.text(['Karten drucken, Klasse anlegen, Quiz starten.', 'Läuft in jedem aktuellen Browser.'], qx + qrS + 8, qy + 21)
  doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  doc.text(doc.splitTextToSize(base.replace(/^https?:\/\//, ''), W - M - (qx + qrS + 8)).slice(0, 2), qx + qrS + 8, qy + 35)

  // --- Fuß
  doc.setFillColor(...BRAND); doc.rect(0, H - 14, W, 14, 'F')
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Karten einmal drucken – in jedem Fach immer wieder nutzen.', W / 2, H - 5.5, { align: 'center' })
  return doc
}
