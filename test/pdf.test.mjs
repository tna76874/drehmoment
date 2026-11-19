// PDF-Tests: Karten + Bericht lassen sich erzeugen; Karten sind deterministisch.
import assert from 'node:assert/strict'
import { cardsPdf, reportPdf, cardLayout, cardSlots } from '../src/lib/pdf.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const strip = (s) => s.replace(/\/CreationDate \([^)]*\)/g, '').replace(/\/ID \[[^\]]*\]/g, '')
const a = cardsPdf([{ card: 1 }, { card: 2, name: 'Jörg Müßig' }]).output()
const b = cardsPdf([{ card: 1 }, { card: 2, name: 'Jörg Müßig' }]).output()
assert.equal(strip(a), strip(b), 'Kartensatz muss bei jedem Export identisch sein')
assert.ok(a.startsWith('%PDF-'))
console.log('  ✓ Kartensatz deterministisch')

// Geometrie: eine große Karte pro Seite, QR fast über die ganze Breite, A oben, B rechts, C unten, D links
{
  const slots = cardSlots()
  assert.equal(slots.length, 1)
  const [slot] = slots
  assert.equal(slot.w, slot.h, 'Karten sind quadratisch')
  assert.ok(slot.x >= 5 && slot.y >= 5 && slot.x + slot.w <= 205 && slot.y + slot.h <= 292, 'innerhalb des Druckbereichs')
  const l = cardLayout(slot), get = (x) => l.letters.find((t) => t.L === x)
  assert.ok(l.qr >= 160, 'QR-Code mindestens 16 cm')
  assert.ok(get('A').y < l.cy && get('C').y > l.cy && get('B').x > l.cx && get('D').x < l.cx)
  assert.ok(l.gap > l.qr / 2 && l.gap < l.side / 2, 'Buchstaben im Rand zwischen QR und Schnittkante')
  assert.ok(l.letterPt * 0.3528 < 5, 'Buchstaben klein (< 5 mm)')
  assert.equal(cardsPdf([{ card: 1 }, { card: 2 }, { card: 3 }], 6, { backs: true }).getNumberOfPages(), 3, 'eine Karte pro Seite, keine Rückseiten (alte Optionen werden ignoriert)')
}
console.log('  ✓ 1 Karte/Seite, QR ≥ 16 cm, kleine Buchstaben A↑ B→ C↓ D←, keine Rückseite')

const session = {
  title: 'Photosynthese – Grundlagen', className: '7b', startedAt: Date.now(),
  roster: [{ card: 1, name: 'Ali' }, { card: 2, name: 'Bea' }, { card: 3, name: 'Çem Öztürk' }],
  questions: [
    { id: 'q1', type: 'mc', text: 'Wo findet die Photosynthese statt?', options: ['Mitochondrien', 'Chloroplasten', 'Zellkern', 'Ribosomen'], correct: [1], explanation: 'In den Chloroplasten.' },
    { id: 'q2', type: 'tf', text: 'Pflanzen geben Sauerstoff ab.', options: ['Wahr', 'Falsch'], correct: [0] },
    { id: 'q3', type: 'poll', text: 'Wie sicher fühlst du dich?', options: ['Sehr', 'Mittel', 'Kaum'], correct: [] },
  ],
  responses: { q1: { 1: 'B', 2: 'A', 3: 'B' }, q2: { 1: 'A', 2: 'A' }, q3: { 1: 'A', 3: 'C' } },
}
const rep = reportPdf(session)
assert.ok(rep.getNumberOfPages() >= 2)
mkdirSync('test/out', { recursive: true })
writeFileSync('test/out/bericht.pdf', Buffer.from(rep.output('arraybuffer')))
writeFileSync('test/out/karten.pdf', Buffer.from(cardsPdf(Array.from({ length: 4 }, (_, i) => ({ card: i + 1, name: i ? '' : 'Max Mustermann' }))).output('arraybuffer')))
writeFileSync('test/out/karten-schueler.pdf', Buffer.from(cardsPdf([{ card: 3, name: 'Anna M.', gid: '17DWY6F' }, { card: 4, name: 'Ben K.' }]).output('arraybuffer')))
console.log('  ✓ Feste Schüler-Karten (test/out/karten-schueler.pdf)')
{
  const { loadMathRenderer } = await import('../src/lib/mathpdf.js')
  const math = await loadMathRenderer()
  const box = math('\\frac{1}{2}', false)
  assert.ok(box && box.shapes.length >= 3 && box.asc > 0.5, 'Bruch als Vektorgrafik')
  const s2 = { ...session, questions: [{ ...session.questions[0], text: 'Was ist $\\frac{1}{2}+\\sqrt{x}$?', options: ['$\\frac{3}{4}$', 'b'] }] }
  writeFileSync('test/out/bericht-latex.pdf', Buffer.from(reportPdf(s2, { math }).output('arraybuffer')))
  console.log('  ✓ LaTeX im Bericht als Vektorgrafik (test/out/bericht-latex.pdf)')
}
console.log('  ✓ Bericht erzeugt (test/out/bericht.pdf), Karten (test/out/karten.pdf)')

// Quiz-QR als PDF: höchstens Vorder- + Rückseite, auch bei großen Quizzen
{
  const { quizQrPdf } = await import('../src/lib/pdf.js')
  const base = { title: 'Test $\\frac{1}{2}$', description: 'Kurz', subject: 'Mathe', grade: '7', material: '', settings: {}, questions: session.questions }
  const small = quizQrPdf(base)
  assert.equal(small.getNumberOfPages(), 1)
  const big = { ...base, material: 'Lesetext '.repeat(300), questions: Array.from({ length: 60 }, (_, i) => ({ ...session.questions[i % 3], text: `Frage ${i}: ${'Inhalt ' + (i * 7919) % 1000} – eine lange Frage zum Thema ${i * 31}`, explanation: 'Erklärung ' + i * 17 })) }
  const d = quizQrPdf(big)
  assert.ok(d.getNumberOfPages() <= 2, 'max. 2 Seiten')
  writeFileSync('test/out/quiz-qr.pdf', Buffer.from(small.output('arraybuffer')))
  writeFileSync('test/out/quiz-qr-gross.pdf', Buffer.from(d.output('arraybuffer')))
  console.log(`  ✓ Quiz-QR-PDF (klein 1 Seite, groß ${d.getNumberOfPages()} Seiten)`)
}

// Poster
{
  const { posterPdf } = await import('../src/lib/pdf.js')
  const d = posterPdf('https://example.org/drehmoment/')
  assert.equal(d.getNumberOfPages(), 1)
  writeFileSync('test/out/poster.pdf', Buffer.from(d.output('arraybuffer')))
  console.log('  ✓ Poster (test/out/poster.pdf)')
}
