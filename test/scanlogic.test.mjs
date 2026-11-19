// Antwort-Logik des Scanners: Bilddrehung (iPad), Sperre nach dem Erfassen, Wechsel, neue Karten.
//   node test/scanlogic.test.mjs
import assert from 'node:assert/strict'
import { AnswerTracker, canGrow, LOCK_MS, CHECK_MS, PAUSE_MS, framePlan, cropRegion, mapQuad, LiveCards, LIVE_MS, cardMark, SEEN, joy, JOY, CROP_BELOW } from '../src/lib/scanlogic.js'

let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const ROT = (l, d) => 'ABCD'[('ABCD'.indexOf(l) + d) % 4] // Bild um d Schritte gedreht

/** Simulation: Klasse mit Karten 1..n, Bilder alle 100 ms. changes: Lehrkraft hält „Ändern erlauben“ dauerhaft an
 *  (so prüfen die älteren Tests die Wechsel-Regeln; ohne = Standard, erfasste Antworten fest) */
function sim({ n = 6, grow = false, changes = true } = {}) {
  const tr = new AnswerTracker(), responses = {}
  let now = 0
  const frame = (cards, ms = 100) => {
    now += ms
    if (changes) tr.allowChanges(true)
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
  for (let i = 0; i < 16; i++) s.frame([[1, 'B'], [2, 'B'], [3, 'C']])
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

// ------------------------------------------------------------------ Bildtakt, Ausschnitt, Anzeige (seit 0.5)
t('Bildtakt: ganz · Zwischenbild · Mitte · Zwischenbild; ohne bekannte Karten nie Zwischenbilder', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => framePlan(i, 3, 0.5)), ['full', 'hints', 'crop', 'hints', 'full', 'hints', 'crop', 'hints'])
  assert.deepEqual([0, 1, 2, 3].map((i) => framePlan(i, 0, 0.5)), ['full', 'full', 'crop', 'full'])
  assert.deepEqual([0, 1, 2, 3].map((i) => framePlan(i, 2, 1)), ['full', 'hints', 'full', 'hints'], 'keine Verkleinerung -> kein Ausschnitt')
  assert.equal(framePlan(2, 0, CROP_BELOW), 'full'); assert.equal(framePlan(2, 0, CROP_BELOW - 0.01), 'crop')
  // in jeden 4 Bildern mindestens 1 Suche im ganzen Bild (neue Karten)
  for (const h of [0, 1, 9]) for (const sc of [0.4, 0.75, 1]) for (let st = 0; st < 40; st += 4)
    assert.ok([0, 1, 2, 3].some((i) => framePlan(st + i, h, sc) === 'full'))
})
t('Ausschnitt in voller Auflösung: Koordinaten landen exakt im normalen Analysebild', () => {
  for (const [vw, vh, res] of [[1920, 1080, 1280], [1920, 1080, 960], [1280, 720, 960], [1080, 1920, 960], [3840, 2160, 1280]]) {
    const s = Math.min(1, res / Math.max(vw, vh)), w = Math.round(vw * s), h = Math.round(vh * s)
    const { sx, sy, map } = cropRegion(vw, vh, w, h, s)
    assert.ok(sx >= 0 && sy >= 0 && sx + w <= vw && sy + h <= vh, 'Ausschnitt liegt im Kamerabild')
    // Punkt im Ausschnitt (x,y) = Kamerapixel (sx+x, sy+y) = Analysepixel ((sx+x)·s, (sy+y)·s)
    for (const [x, y] of [[0, 0], [w - 1, h - 1], [w / 2, h / 2], [17, 301]]) {
      const [q] = mapQuad([{ x, y }], map)
      assert.ok(Math.abs(q.x - (sx + x) * s) < 1e-9 && Math.abs(q.y - (sy + y) * s) < 1e-9)
    }
    const [c] = mapQuad([{ x: w / 2, y: h / 2 }], map)
    assert.ok(Math.abs(c.x - w / 2) < 1 && Math.abs(c.y - h / 2) < 1, 'Mitte bleibt Mitte')
  }
  assert.deepEqual(mapQuad([{ x: 3, y: 4 }], { ox: 0, oy: 0, k: 1 }), [{ x: 3, y: 4 }])
})
t('Zuletzt gesehene Karten: verfallen nach LIVE_MS, Rasterkarten nicht als Hinweis, leeren', () => {
  const L = new LiveCards(), q = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  L.update([{ card: 1, quad: q }, { card: 2, quad: q, gridCard: true }, { card: 3 }], 1000)
  assert.equal(L.list(1000).length, 3); assert.equal(L.hints(1000).length, 1)
  L.update([{ card: 1, quad: q, answer: 'B' }], 1000 + LIVE_MS - 1)
  assert.equal(L.list(1000 + LIVE_MS - 1).find((c) => c.card === 1).answer, 'B', 'neueste Lesung gilt')
  L.update([], 1000 + LIVE_MS + 1)
  assert.deepEqual(L.list(1000 + LIVE_MS + 1).map((c) => c.card), [1])
  assert.equal(L.list(1000 + 2 * LIVE_MS + 10).length, 0)
  L.update([{ card: 5, quad: q }], 0); L.clear(); assert.equal(L.list(0).length, 0)
})
t('Markierung verrät nie die Antwort: A–D gleiche Farbe, gleiche Füllung, gleicher Text, kein Buchstabe', () => {
  const entries = [undefined, { name: 'Anna' }, { label: '12' }, { name: 'A' }, { name: 'Ben', label: '' }]
  for (const optionCount of [2, 3, 4]) for (const entry of entries) for (const card of [7, 'DM-17DWY6F']) {
    const marks = 'ABCD'.slice(0, optionCount).split('').map((answer) => cardMark({ card, answer }, { known: true, entry, optionCount }))
    for (const m of marks) { assert.ok(m.valid); assert.equal(m.color, SEEN); assert.ok(m.label.startsWith('✓')) }
    assert.equal(new Set(marks.map((m) => JSON.stringify(m))).size, 1, 'alle gültigen Antworten sehen identisch aus')
    if (!entry || !/^[A-D]$/.test(entry.name || '')) for (const m of marks) assert.ok(!/(^|[^A-Za-z])[A-D]([^A-Za-z]|$)/.test(m.label), 'kein Antwortbuchstabe: ' + m.label)
  }
  const bad = cardMark({ card: 7, answer: 'D' }, { known: true, optionCount: 2 })
  assert.ok(!bad.valid); assert.notEqual(bad.color, SEEN)
  assert.ok(!cardMark({ card: 7, answer: null }, { known: true, optionCount: 4 }).valid, 'schräg gehalten = nicht gewertet')
  assert.equal(cardMark({ card: 77, answer: 'A' }, { known: false, optionCount: 4 }).label, '#77 ?')
  assert.equal(cardMark({ card: 7, answer: 'A' }, { known: true, entry: { label: '12' }, optionCount: 4 }).label, '✓', 'Namen verdeckt')
})
t('Freude-Animation: Symbol zufällig, unabhängig von der Antwort', () => {
  assert.ok(joy.length <= 1, 'joy() bekommt keine Antwort übergeben')
  for (const r of [0, 0.5, 0.999999, 1]) assert.ok(JOY.includes(joy(() => r)))
  const seen = new Set(Array.from({ length: 2000 }, () => joy()))
  assert.ok(seen.size >= JOY.length - 1, 'alle Symbole kommen vor')
  assert.ok(!JOY.some((e) => /[A-D]/.test(e)))
})
t('Zwischenbilder (nur Teil der Karten) ändern die erfassten Antworten nicht gegenüber reinen Vollbildern', () => {
  const plan = (useHints) => {
    const tr = new AnswerTracker(), responses = {}
    let now = 0
    const truth = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'C' }
    for (let i = 0; i < 60; i++) {
      now += 80
      if (i === 30) { truth[2] = 'D'; tr.allowChanges(true) } // ein Kind entscheidet um, Lehrkraft erlaubt die Änderung
      const mode = useHints ? framePlan(i, 6, 0.5) : 'full'
      const visible = Object.keys(truth).map(Number).filter((c) => mode === 'full' || (mode === 'hints' ? true : c % 2 === 0))
      const r = tr.process(visible.map((card) => ({ card, answer: truth[card] })), now, { responses, known: (c) => c >= 1 && c <= 6 })
      for (const [c, l] of r.emit) responses[c] = l
    }
    return responses
  }
  assert.deepEqual(plan(true), plan(false))
  assert.deepEqual(plan(true), { 1: 'A', 2: 'D', 3: 'C', 4: 'D', 5: 'A', 6: 'C' })
})

// ------------------------------------------------------------------ Erfasste Antworten fest, „Ändern erlauben“ (seit 0.5)
t('Standard: erfasste Antwort bleibt fest, egal wie lange/oft die Karte anders hochgehalten wird', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A'], [2, 'B']])
  assert.deepEqual(s.responses, { 1: 'A', 2: 'B' })
  for (let i = 0; i < 100; i++) s.frame([[1, 'C'], [2, 'D']], 100) // 10 s lang anders gehalten
  assert.deepEqual(s.responses, { 1: 'A', 2: 'B' })
  assert.equal(s.tr.changesAllowed, false)
})
t('neue Karten werden auch im festen Zustand erfasst', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A']]); s.frame([[1, 'B'], [3, 'C']], 2500)
  assert.deepEqual(s.responses, { 1: 'A', 3: 'C' })
})
t('„Ändern erlauben“: genau EINE Änderung, danach automatisch wieder fest', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A'], [2, 'B']]); s.wait(LOCK_MS)
  s.tr.allowChanges(true)
  let relocked = false
  for (let i = 0; i < 10 && !relocked; i++) relocked = s.frame([[1, 'C']], 150).relocked
  assert.ok(relocked, 'Ergebnis meldet „wieder fest“')
  assert.equal(s.responses[1], 'C'); assert.equal(s.tr.changesAllowed, false)
  s.wait(LOCK_MS)
  for (let i = 0; i < 30; i++) s.frame([[1, 'D'], [2, 'A']], 150)
  assert.deepEqual(s.responses, { 1: 'C', 2: 'B' }, 'zweite Änderung / andere Karte: gesperrt')
})
t('„Ändern erlauben“: Wechsel-Schutz gilt weiter (3 Lesungen über ≥ 0,6 s, Sperre direkt nach dem Erfassen)', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A']]); s.tr.allowChanges(true)
  for (let i = 0; i < 5; i++) s.frame([[1, 'B']], 100) // innerhalb der 2-s-Sperre
  assert.equal(s.responses[1], 'A'); assert.equal(s.tr.changesAllowed, true, 'noch nichts geändert -> bleibt offen')
  s.wait(LOCK_MS)
  s.frame([[1, 'B']], 100); s.frame([[1, 'B']], 100)
  assert.equal(s.responses[1], 'A', 'erst 2 Lesungen')
  s.frame([[1, 'B']], 500)
  assert.equal(s.responses[1], 'B')
})
t('„Ändern erlauben“: gleiche Antwort erneut gezeigt zählt nicht als Änderung (bleibt offen)', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A'], [2, 'B']]); s.wait(LOCK_MS); s.tr.allowChanges(true)
  for (let i = 0; i < 10; i++) assert.ok(!s.frame([[1, 'A'], [2, 'B']], 150).relocked)
  assert.equal(s.tr.changesAllowed, true)
  for (let i = 0; i < 6; i++) s.frame([[2, 'D']], 150)
  assert.deepEqual(s.responses, { 1: 'A', 2: 'D' }); assert.equal(s.tr.changesAllowed, false)
})
t('„Ändern erlauben“ von Hand wieder aus: nichts ändert sich', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A']]); s.wait(LOCK_MS); s.tr.allowChanges(true)
  s.frame([[1, 'B']], 100); s.frame([[1, 'B']], 100)
  s.tr.allowChanges(false)
  for (let i = 0; i < 20; i++) s.frame([[1, 'B']], 150)
  assert.equal(s.responses[1], 'A')
})
t('zwei Karten wechseln gleichzeitig: nur EINE Änderung wird übernommen', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A'], [2, 'A']]); s.wait(LOCK_MS); s.tr.allowChanges(true)
  for (let i = 0; i < 10; i++) s.frame([[1, 'B'], [2, 'C']], 150)
  const changed = [s.responses[1] !== 'A', s.responses[2] !== 'A'].filter(Boolean).length
  assert.equal(changed, 1)
})
t('neue Frage: wieder fest', () => {
  const tr = new AnswerTracker(); tr.allowChanges(true); tr.reset(); assert.equal(tr.changesAllowed, false)
})
t('Bilddrehung wird auch im festen Zustand an erfassten Karten erkannt (nicht als Antwortwechsel)', () => {
  const s = sim({ changes: false })
  s.frame([[1, 'A'], [2, 'B'], [3, 'C']]); s.wait(LOCK_MS)
  s.frame([[1, 'B'], [2, 'C'], [3, 'D']]); const r = s.frame([[1, 'B'], [2, 'C'], [3, 'D']])
  assert.equal(r.corrected, 1); assert.deepEqual(s.responses, { 1: 'A', 2: 'B', 3: 'C' })
})

console.log(`\n✓ ${ok} Scanner-Logik-Tests bestanden`)
