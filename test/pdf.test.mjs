// PDF-Tests: Karten + Bericht lassen sich erzeugen; Karten sind deterministisch.
import assert from 'node:assert/strict'
import { cardsPdf, reportPdf, cardLayout, cardSlots } from '../src/lib/pdf.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const strip = (s) => s.replace(/\/CreationDate \([^)]*\)/g, '').replace(/\/ID \[[^\]]*\]/g, '')
const a = cardsPdf([{ card: 1 }, { card: 2, name: 'Jörg Müßig' }], 2).output()
const b = cardsPdf([{ card: 1 }, { card: 2, name: 'Jörg Müßig' }], 2).output()
assert.equal(strip(a), strip(b), 'Kartensatz muss bei jedem Export identisch sein')
assert.ok(a.startsWith('%PDF-'))
console.log('  ✓ Kartensatz deterministisch')

// Geometrie: A oben, B rechts, C unten, D links
for (const per of [1, 2, 4, 6]) for (const slot of cardSlots(per)) {
  assert.equal(slot.w, slot.h, 'Karten sind quadratisch')
  assert.ok(slot.x >= 5 && slot.y >= 5 && slot.x + slot.w <= 205 && slot.y + slot.h <= 292, 'innerhalb des Druckbereichs')
  const l = cardLayout(slot), get = (x) => l.letters.find((t) => t.L === x)
  assert.ok(get('A').y < l.cy && get('C').y > l.cy && get('B').x > l.cx && get('D').x < l.cx)
  assert.ok(l.gap > l.qr / 2, 'Buchstaben liegen außerhalb des QR-Codes')
}
console.log('  ✓ Quadratische Karten, Buchstaben-Anordnung A↑ B→ C↓ D←')
assert.equal(cardsPdf([{ card: 1 }, { card: 2 }], 6).getNumberOfPages(), 1, 'ohne Rückseite: nur Vorderseiten (Standard)')
console.log('  ✓ Standard ohne Rückseite')

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
writeFileSync('test/out/karten.pdf', Buffer.from(cardsPdf(Array.from({ length: 8 }, (_, i) => ({ card: i + 1, name: i ? '' : 'Max Mustermann' })), 6).output('arraybuffer')))
writeFileSync('test/out/karten-1.pdf', Buffer.from(cardsPdf([{ card: 7, name: 'Bea' }], 1).output('arraybuffer')))
writeFileSync('test/out/karten-schueler.pdf', Buffer.from(cardsPdf([{ card: 3, name: 'Anna M.', gid: '17DWY6F' }, { card: 4, name: 'Ben K.' }], 6, { backs: true }).output('arraybuffer')))
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

// Rückseiten: Duplex, je Vorderseite eine gespiegelte Rückseite
{
  const d = cardsPdf([1, 2, 3, 4, 5].map((card) => ({ card, name: card === 2 ? 'Bea' : '' })), 4, { backs: true })
  assert.equal(d.getNumberOfPages(), 4, '2 Vorder- + 2 Rückseiten')
  writeFileSync('test/out/karten-duplex.pdf', Buffer.from(d.output('arraybuffer')))
  const { backLayout } = await import('../src/lib/pdf.js')
  const b = backLayout({ x: 0, y: 0, w: 100, h: 100 }), at = (L) => b.wedges.find((w) => w.L === L)
  assert.ok(at('A').y < b.cy && at('C').y > b.cy && at('B').x < b.cx && at('D').x > b.cx, 'Rückseite: A↑ B← C↓ D→')
  console.log('  ✓ Rückseiten (Duplex, gespiegelt: A↑ B← C↓ D→)')
}

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
