// Antwort-Logik des Scanners: Bilddrehung (iPad), Sperre nach dem Erfassen, Wechsel, neue Karten.
//   node test/scanlogic.test.mjs
import assert from 'node:assert/strict'
import { AnswerTracker, canGrow, LOCK_MS, CHECK_MS, PAUSE_MS } from '../src/lib/scanlogic.js'

let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const ROT = (l, d) => 'ABCD'[('ABCD'.indexOf(l) + d) % 4] // Bild um d Schritte gedreht

/** Simulation: Klasse mit Karten 1..n, Bilder alle 100 ms */
function sim({ n = 6, grow = false } = {}) {
  const tr = new AnswerTracker(), responses = {}
  let now = 0
  const frame = (cards, ms = 100) => {
    now += ms
    const r = tr.process(cards.map(([card, answer]) => ({ card, answer })), now, { responses, known: (c) => c >= 1 && c <= n, grow })
    for (const [c, l] of r.emit) responses[c] = l
    return r
  }
  return { tr, responses, frame, wait: (ms) => { now += ms }, rotate: () => tr.imageChanged(now), get now() { return now } }
}

t('Antworten werden sofort erfasst', () => {
  const s = sim()
  s.frame([[1, 'A'], [2, 'C'], [3, 'D']])
  assert.deepEqual(s.responses, { 1: 'A', 2: 'C', 3: 'D' })
})

t('Sperre: Karte wird beim Herunternehmen gedreht -> innerhalb von 2 s keine andere Antwort', () => {
  const s = sim()
  s.frame([[1, 'B']])
  for (const l of ['C', 'D', 'A', 'C', 'C', 'C', 'C']) s.frame([[1, l]], 150) // 1,05 s: Karte kippt beim Absenken
  assert.equal(s.responses[1], 'B')
  s.wait(LOCK_MS)
  s.frame([[1, 'C']]); s.frame([[1, 'C']])
  assert.equal(s.responses[1], 'B', 'Wechsel braucht 3 Lesungen über ≥ 0,6 s')
  for (let i = 0; i < 6; i++) s.frame([[1, 'C']])
  assert.equal(s.responses[1], 'C', 'bewusster Wechsel nach der Sperre klappt')
})

t('iPad dreht das Kamerabild (Format wechselt), 2 erfasste Karten im Bild -> automatisch korrigiert', () => {
  const s = sim()
  s.frame([[1, 'A'], [2, 'B'], [3, 'C']])
  s.rotate()
  const r1 = s.frame([[1, ROT('A', 1)], [2, ROT('B', 1)], [4, ROT('D', 1)]], PAUSE_MS + 50)
  assert.equal(r1.status, 'checking'); assert.equal(s.responses[4], undefined, 'neue Karte wird in der Quarantäne NICHT falsch erfasst')
  const r2 = s.frame([[1, ROT('A', 1)], [2, ROT('B', 1)], [4, ROT('D', 1)]])
  assert.equal(r2.corrected, 1)
  assert.deepEqual(s.responses, { 1: 'A', 2: 'B', 3: 'C', 4: 'D' })
  // danach bleibt die Korrektur
  s.frame([[5, ROT('C', 1)]])
  assert.equal(s.responses[5], 'C')
})

t('Drehung OHNE System-Ereignis (nur Bild gedreht), 180°', () => {
  const s = sim()
  s.frame([[1, 'A'], [2, 'D'], [3, 'B']])
  s.wait(LOCK_MS)
  s.frame([[1, ROT('A', 2)], [2, ROT('D', 2)], [3, ROT('B', 2)]])
  s.frame([[1, ROT('A', 2)], [2, ROT('D', 2)], [3, ROT('B', 2)]])
  assert.deepEqual(s.responses, { 1: 'A', 2: 'D', 3: 'B' }, 'keine falschen Wechsel')
  assert.equal(s.tr.rotOffset, 2)
})

t('Dreh-Ereignis, nur EINE bekannte Karte im Bild -> reicht zum Korrigieren (2 Bilder)', () => {
  const s = sim()
  s.frame([[1, 'B']])
  s.rotate()
  s.frame([[1, ROT('B', 3)], [2, ROT('A', 3)]], PAUSE_MS + 50)
  s.frame([[1, ROT('B', 3)], [2, ROT('A', 3)]])
  assert.deepEqual(s.responses, { 1: 'B', 2: 'A' })
})

t('Dreh-Ereignis ohne Bilddrehung -> nach Bestätigung normal weiter', () => {
  const s = sim()
  s.frame([[1, 'B'], [2, 'C']])
  s.rotate()
  s.frame([[1, 'B'], [2, 'C'], [3, 'D']], PAUSE_MS + 50)
  assert.equal(s.responses[3], 'D')
  assert.equal(s.tr.rotOffset, 0)
})

t('Dreh-Ereignis, keine Referenzkarte sichtbar -> nach 3 s weiter mit Hinweis', () => {
  const s = sim()
  s.frame([[1, 'B']])
  s.rotate()
  const r = s.frame([[5, 'A']], PAUSE_MS + 50)
  assert.equal(r.status, 'checking'); assert.equal(s.responses[5], undefined)
  s.wait(CHECK_MS)
  s.frame([[5, 'A']])
  assert.equal(s.responses[5], 'A'); assert.equal(s.tr.hint, true)
  s.tr.rotateManually(); assert.equal(s.tr.hint, false)
})

t('zwei Kinder wechseln gleichzeitig ihre Antwort -> kein Fehlalarm, wenn andere Karten gleich bleiben', () => {
  const s = sim()
  s.frame([[1, 'A'], [2, 'A'], [3, 'C']])
  s.wait(LOCK_MS)
  for (let i = 0; i < 8; i++) s.frame([[1, 'B'], [2, 'B'], [3, 'C']])
  assert.deepEqual(s.responses, { 1: 'B', 2: 'B', 3: 'C' })
  assert.equal(s.tr.rotOffset, 0)
})

t('Liste wächst (anonym): JEDE Karte – Nummer, Rasterkarte, feste Schüler-Karte – nach 2 Lesungen; Unsinn nie', () => {
  const s = sim({ n: 0, grow: true })
  const frame = [[27, 'C'], ['DM-K7Q2M9X', 'A'], ['DM-ABC', 'B'], ['xyz', 'D']]
  s.frame(frame)
  assert.deepEqual(s.responses, {})
  s.frame(frame)
  assert.deepEqual(s.responses, { 27: 'C', 'DM-K7Q2M9X': 'A' })
})

t('canGrow: Kartennummern und gültige feste IDs, sonst nichts', () => {
  assert.equal(canGrow(5), true)
  assert.equal(canGrow('DM-K7Q2M9X'), true)
  for (const x of ['DM-ABC', 'DM-K7Q2M9I', '5', null, undefined]) assert.equal(canGrow(x), false, String(x))
})

t('Antworten jenseits der Optionen (C bei Wahr/Falsch) werden ignoriert', () => {
  const tr = new AnswerTracker()
  const r = tr.process([{ card: 1, answer: 'C' }, { card: 2, answer: 'B' }], 1000, { responses: {}, known: () => true, optionCount: 2 })
  assert.deepEqual(r.emit, [[2, 'B']])
})

t('Bildschirmwinkel liefert den Versatz vorab -> sofort richtig; falsches Vorzeichen wird an Karten korrigiert', () => {
  for (const [prior, real] of [[3, 1], [1, 1], [2, 2]]) { // prior = -real (richtig) bzw. falsch geraten
    const s = sim()
    s.frame([[1, 'A'], [2, 'C']])
    s.tr.imageChanged(s.now, prior)
    for (let i = 0; i < 3; i++) s.frame([[1, ROT('A', real)], [2, ROT('C', real)], [3, ROT('B', real)]], i ? 100 : PAUSE_MS + 50)
    assert.deepEqual(s.responses, { 1: 'A', 2: 'C', 3: 'B' }, `prior ${prior}, Drehung ${real}`)
  }
})

console.log(`\n✓ ${ok} Scanner-Logik-Tests bestanden`)
