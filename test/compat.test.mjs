// Abwärtskompatibilität: Alles, was je gedruckt, geteilt oder gespeichert wurde, muss lesbar bleiben.
//
// !!! Die FIXTURES unten NIE ändern oder löschen – nur neue hinzufügen. !!!
// Schlägt ein Test fehl, ist der CODE falsch, nicht das Fixture.
import assert from 'node:assert/strict'
import { QrCollector, decodeQuery, importQueryFrom, b45, unb45, qrTexts, b64u, encodePacket } from '../src/lib/share.js'
import { parseImport, fixLatexEscapes, repairLatexText, extractJson } from '../src/lib/format.js'
import { CARD_RE } from '../src/lib/detect.js'
import { cardMatrix } from '../src/lib/qr.js'
import { splitMath, plainMath } from '../src/lib/math.js'

const ok = (m) => console.log('  ✓ ' + m)

// ------------------------------------------------------------------ Fixtures (eingefroren)
const QUIZ_TITLE = 'Brüche $\\frac{1}{2}$'
const FIX = {
  // T1, Drehmoment 0.1: #/import?z=…  (deflate-raw, base64url)
  z: 'VY6xTsMwFEV_xbrKxlOVBNTBCxILSKhiAMHgerCcl9oiTiB2WSL_Wbf-GHJQQYzv3nN13oIvyIaQIHE3n0_Wsaj2-342dmny0uYKhAlSNVRrwiekUggWhDcThY_pP331d9zk6hakcOmv1wj0G7R52a5BA0INTaoY7gf21o0m-IMIxjoeN6VC6n-ckeeL1vLy0D7lagOqy7hgH9MwFNCziN46nkV_PrkhJtEdReetW396ZjeDsPMpccEfzTEUi9aa0EHihWMCIUJiZ5LjYJJ_B-EAiS0IARKvvuNJmDGy4xH5Gw',
  // L2, seit 0.2: #/import?b=…  (Paket Codec 1)
  b: 'AUMOZKeiw3tA6UglBlIiGtYCSzQVoCKsjoalGBTV2giOSa2KPchjMHljsBBQI0zAqLbaDCxgCMQGEH_oKEHKtrzE3Mx0YCIAOidPDyQF8TzQzmJgcoFam5xa7WHkX6uihxRG0HAGJWxoTgem1YwcoIaUUmDyTM4AuwlURgBV-WaWlKSClHsnluaCbIkFmgFOaCGpxSXYEhsoGZhBEwCk1EzMK04FOlKpFgA',
  // Q2, seit 0.2: QR nur Inhalt
  q: 'DMQ:870* 1T8L3WOC98J59/Z00E4L2R$M91X2BH4 0I9*KNS2GPRK:HB.LL 7COCPFFRBM+5ASV9ZELKPRKR5*41MY0T7G0459SP*%N4-R2WEJD4$F7Y:9-O4GMU*HQTJCILEKKBLYJJ0U8*SIVLK3H%.8D7E+W4H8DN/0%:Q%R3R0HSIAISU-1Q1TNJTA+10 NVS1J*ZKVYI905F6TKWD*V0J70H7D KLDZ40D25357BJ4I2V$K+V9GL5XT0BKA7Z2.',
  // Q2m, seit 0.2: mehrteilig
  multi: [
    'DMQ1/3/89:870* 1T8L3WOC98J59/Z00E4L2R$M91X2BH4 0I9*KNS2GPRK:HB.LL 7COCPFFRBM+5ASV9ZELKPRKR5*4160.',
    'DMQ2/3/89:%32WFTCE8P4N-*O5%P+6CD10S/46-1 X0/U744QU8C*FGBUJCMB+GCB4CROKFP2ZFQ/Y0WVD+%944L3WH9DKD3.',
    'DMQ3/3/89:SIAISU-1Q1TNJTA+10 NVS1J*ZKVYI905F6TKWD*V0J70H7D KLDZ40D25357BJ4I2V$K+V9GL5XT0BKA7Z2.',
  ],
  // Antwortkarte 7 (seit 0.1) – QR Version 1-H, Inhalt „DM:7“
  card7: 'DM:7',
}

function checkQuiz(set, label) {
  assert.equal(set.title, QUIZ_TITLE, label)
  assert.equal(set.questions.length, 3, label)
  assert.deepEqual(set.questions[0].options, ['$\\frac{3}{4}$', '$\\frac{2}{6}$', '1', '0'], label)
  assert.deepEqual(set.questions[0].correct, [0], label)
  assert.deepEqual(set.questions[1].options, ['Wahr', 'Falsch'], label)
  assert.equal(set.questions[2].type, 'poll', label)
  const p = parseImport(set) // kompletter Importweg
  assert.equal(p.sets[0].questions[0].text, 'Was ist $\\frac{1}{2}+\\frac{1}{4}$?', label)
}

// ------------------------------------------------------------------ Quiz-Codes
checkQuiz(decodeQuery({ z: FIX.z }), 'T1 z=')
ok('Format T1 (0.1, #/import?z=) lesbar')
checkQuiz(decodeQuery({ b: FIX.b }), 'L2 b=')
ok('Format L2 (#/import?b=) lesbar')
checkQuiz(new QrCollector().add(FIX.q).set, 'Q2')
checkQuiz(new QrCollector().add(FIX.q.trim() + '\n').set, 'Q2 mit Zeilenende')
ok('Format Q2 (DMQ:…, ohne Adresse) lesbar')
{
  const c = new QrCollector()
  let r
  for (const t of [FIX.multi[2], FIX.multi[0], FIX.multi[0], FIX.multi[1]]) r = c.add(t) // beliebige Reihenfolge, doppelt
  checkQuiz(r.set, 'Q2m')
}
ok('Format Q2m (mehrteilig, beliebige Reihenfolge) lesbar')

// Links von JEDEM Host funktionieren (App umgezogen, anderer Pfad, http/https)
for (const host of ['https://alt.example.org/drehmoment/', 'http://192.168.0.5:8080/', 'https://neu.example.com/x/index.html?foo=1']) {
  checkQuiz(decodeQuery(importQueryFrom(`${host}#/import?z=${FIX.z}&start=1`).query), host)
  checkQuiz(decodeQuery(importQueryFrom(`${host}#/import?b=${FIX.b}`).query), host)
}
ok('Links sind hostunabhängig')

// Neue Codes = Fixture (stabil), Rundreise
{
  const set = decodeQuery({ b: FIX.b })
  assert.equal(b64u(encodePacket(set)), FIX.b, 'Kodierung muss deterministisch bleiben')
  const big = { ...set, questions: Array.from({ length: 40 }, (_, i) => ({ ...set.questions[i % 3], text: `Frage ${i}: ${set.questions[i % 3].text} ${'x'.repeat(i)}` })) }
  const t = qrTexts(big, { maxBytes: 300 })
  assert.ok(t.texts.length > 1)
  const c = new QrCollector(); let r
  for (const x of t.texts.reverse()) r = c.add(x)
  assert.equal(r.set.questions.length, 40)
  assert.ok(t.texts.every((x) => /^[0-9A-Z $%*+\-./:]+$/.test(x)), 'nur QR-alphanumerische Zeichen')
}
ok('Neue Codes deterministisch, mehrteilig, alphanumerisch')

// Neuere, unbekannte Codecs -> verständliche Meldung statt Absturz
assert.throws(() => decodeQuery({ b: b64u(Uint8Array.from([9, 1, 2, 3])) }), /neueren Drehmoment-Version/)
ok('Unbekannter Codec -> Hinweis auf Update')

// Base45 nach RFC 9285
assert.equal(b45(new TextEncoder().encode('AB')), 'BB8')
assert.equal(b45(new TextEncoder().encode('Hello!!')), '%69 VD92EX0')
assert.equal(b45(new TextEncoder().encode('base-45')), 'UJCLQE7W581')
assert.equal(new TextDecoder().decode(unb45('QED8WEX0')), 'ietf!')
ok('Base45 (RFC 9285)')

// ------------------------------------------------------------------ Antwortkarten
assert.ok(CARD_RE.test(FIX.card7) && CARD_RE.exec('DM:123')[1] === '123')
assert.equal(cardMatrix(7).length, 21, 'Karten bleiben QR-Version 1')
ok('Antwortkarten-Format DM:<n> unverändert')

// ------------------------------------------------------------------ Gespeicherte Daten (localStorage)
{
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
  const { migrate, STATE_VERSION } = await import('../src/lib/store.js')
  const v1 = { // Stand Drehmoment 0.1
    version: 1, sets: [{ id: 's1', title: 'Alt', questions: [{ id: 'q', type: 'mc', text: 'Was ist $\frac{1}{2} \times 2$?', options: ['1', '2'], correct: [0], explanation: '' }], settings: {} }],
    classes: [{ id: 'c', name: '7b', students: [{ card: 1, name: 'Ali' }] }], sessions: [],
    prefs: { resolution: 960, vibrate: false, anonymousCards: 30, cardsPerPage: 4, cardBacks: true },
  }
  const d = migrate(JSON.parse(JSON.stringify(v1)))
  assert.equal(d.version, STATE_VERSION)
  assert.equal(d.prefs.cardBacks, false)
  assert.equal(d.prefs.cardsPerPage, 6)
  assert.equal(d.prefs.resolution, 960, 'Einstellungen bleiben erhalten')
  assert.equal(d.sets[0].questions[0].text, 'Was ist $\\frac{1}{2} \\times 2$?', 'zerschossenes LaTeX repariert')
  assert.equal(d.classes[0].students[0].name, 'Ali')
  const empty = migrate({}) // ohne Versionsnummer, ohne Felder
  assert.ok(Array.isArray(empty.sets) && Array.isArray(empty.sessions))
  const future = migrate({ version: 99, sets: [], neuesFeld: 1 }) // neuere App -> nichts verlieren
  assert.equal(future.neuesFeld, 1)
  assert.equal(future.version, 99)
}
ok('Gespeicherte Daten v1 -> aktuell (Migration), unbekannte Felder bleiben')

// Exportdatei 0.1
{
  const file = JSON.stringify({ app: 'drehmoment', format: 1, exportedAt: '2026-11-01T10:00:00Z', content: 'questions',
    sets: [{ id: 'x', title: 'T', questions: [{ id: 'q1', type: 'tf', text: 'A\nB $\\neq$', options: ['Wahr', 'Falsch'], correct: [1] }] }] })
  const p = parseImport(file)
  assert.equal(p.kind, 'backup')
  assert.equal(p.sets[0].id, 'x')
  assert.equal(p.sets[0].questions[0].text, 'A\nB $\\neq$')
}
ok('Exportdatei Format 1 lesbar')

// ------------------------------------------------------------------ LaTeX
{
  const ai = String.raw`{"questions":[{"question":"$\frac{1}{2} \times 4$, $\alpha \neq \beta$\nZeile \u00e4","options":["$\sqrt{9}$","b"],"correct":"A"}]}`
  assert.equal(extractJson(ai).questions[0].question, '$\\frac{1}{2} \\times 4$, $\\alpha \\neq \\beta$\nZeile ä')
  assert.equal(fixLatexEscapes('"a\\\\frac"'), '"a\\\\frac"', 'korrekte Escapes bleiben')
  assert.equal(repairLatexText('Zeile\nneu'), 'Zeile\nneu', 'normale Zeilenumbrüche bleiben')
  assert.deepEqual(splitMath('Preis 5 $ und $x^2$ und \\$3'), [{ text: 'Preis 5 $ und ' }, { tex: 'x^2', display: false }, { text: ' und $3' }])
  assert.deepEqual(splitMath('$$a$$ \\(b\\) \\[c\\]').filter((p) => p.tex).map((p) => [p.tex, p.display]), [['a', true], ['b', false], ['c', true]])
  assert.equal(splitMath('kostet $5 und $3').length, 1, 'Dollarbeträge sind keine Formel')
  assert.equal(plainMath('Brüche $\\frac{1}{2}$'), 'Brüche 1/2')
}
ok('LaTeX: KI-JSON-Reparatur, Formel-Erkennung')

// ------------------------------------------------------------------ Klassen per Link / QR (seit 0.2)
{
  const { resolveImport } = await import('../src/lib/share.js')
  const { mergeClasses } = await import('../src/lib/format.js')
  const FIX_CLASS_B = 'AYMFcjbYNeZJIKc45uUlKvjqAWWdgFHlDWIcbgfG5uFpekpgzRaJIGU-qYkQyRBggnYESulEm-hYxsbG1gIA'
  const FIX_CLASS_Q = 'DMQ:R80:U00.6S 60B9D6LO8TJV42LV.700-J+FA6V1XQ3A:0K8T2FD5I9W-P4FH/ZCLJLM527328MGIO01MT.VJ1AB 5PL2R00.'
  const expectCls = (classes) => {
    assert.deepEqual(classes.map((c) => c.name), ['7b', '8a'])
    assert.deepEqual(classes[0].students, [{ name: 'Anna M.', card: 1 }, { name: 'Ben K.', card: 2 }, { name: 'Çem Ö.', card: 3 }])
    assert.deepEqual(classes[1].students.map((s) => s.card), [4, 9])
  }
  const r = await resolveImport({ b: FIX_CLASS_B }, parseImport)
  assert.equal(r.parsed.kind, 'classes'); expectCls(r.parsed.classes)
  const q = new QrCollector().add(FIX_CLASS_Q)
  assert.equal(q.kind, 'classes'); expectCls(q.classes)
  assert.equal(decodeQuery({ b: FIX_CLASS_B }), null, 'Klassen-Paket ist kein Quiz')
  // einfaches JSON (für Agenten): Namen als Strings
  const j = parseImport('{"classes":[{"name":"5c","students":["Lea K.","Tom A."]}]}')
  assert.equal(j.kind, 'classes'); assert.deepEqual(j.classes[0].students.map((s) => s.name), ['Lea K.', 'Tom A.'])
  // übernehmen: bestehende Karten bleiben, gewünschte Nummern wenn frei
  const st = { classes: [{ id: 'x', name: '8A', students: [{ card: 4, name: 'Mia B.' }] }] }
  mergeClasses(st, r.parsed.classes)
  assert.deepEqual(st.classes[0].students.map((s) => [s.card, s.name]), [[1, 'Lea K.'], [4, 'Mia B.'], [9, 'Tom A.']])
  assert.equal(st.classes[1].students.length, 3)
}
ok('Klassen per Link (b=), QR (DMQ) und JSON; Zusammenführen ohne Kartenwechsel')

// ------------------------------------------------------------------ Feste Schüler-Karten (seit 0.3)
{
  const { resolveImport, encodeClasses, expandClasses, unpackJson } = await import('../src/lib/share.js')
  const { mergeClasses } = await import('../src/lib/format.js')
  const { GID_RE, normalizeGid, gidFrom } = await import('../src/lib/gid.js')
  // Ableitung aus einer stabilen Kennung (z. B. short_id der Schulverwaltung) – EINGEFROREN
  assert.equal(await gidFrom('x3k9mpq2'), '17DWY6F')
  assert.equal(await gidFrom('x3k9mpq3'), 'CTQZ5XY')
  // QR-Inhalt der Karte
  assert.ok(GID_RE.test('DM-17DWY6F')); assert.ok(!CARD_RE.test('DM-17DWY6F')); assert.ok(!GID_RE.test('DM:7'))
  assert.equal(cardMatrix('17DWY6F').length, 21, 'Version 1 wie die Nummernkarten')
  assert.equal(normalizeGid(' dm-17dwy6f '), '17DWY6F'); assert.equal(normalizeGid('17DWY6O'), '17DWY60'); assert.equal(normalizeGid('ABCDEFU'), null)
  // Klassen-Paket mit IDs (b=) – EINGEFROREN
  const FIX_GID_B = 'AYMFcjbYNeZJIKc45uUlKvjqAWWdgFHlDWIcbgfG5uFpemDjdYx0TEFmGJq7hEeauYFcpOQcEhhlGhGpFBsbWwsA'
  const FIX_GID_Q = 'DMQ:R80:U00.6S 60B9D6LO8TJV42LV.700-J+FA6V1XQ3A:0K8T2FD8BCW%ERVE2C8/43YVNF29EKN1WBV$S.C27ZCLA2HO2SK3QH1.'
  const expectGid = (c) => assert.deepEqual(c[0].students, [
    { name: 'Anna M.', card: 1, gid: '17DWY6F' }, { name: 'Ben K.', card: 2 }, { name: 'Çem Ö.', card: 5, gid: 'CTQZ5XY' }])
  expectGid((await resolveImport({ b: FIX_GID_B }, parseImport)).parsed.classes)
  expectGid(new QrCollector().add(FIX_GID_Q).classes)
  // ältere Leser (0.2) sehen nur [name, names, cards] -> Namen + Karten bleiben korrekt
  const raw = unpackJson(Uint8Array.from(atob(FIX_GID_B.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - FIX_GID_B.length % 4) % 4)), (c) => c.charCodeAt(0)))
  const old = raw.k.map(([name, names, cards]) => ({ name, students: names.map((n, i) => ({ name: n, card: cards?.[i] ?? i + 1 })) }))
  assert.deepEqual(old[0].students.map((s) => s.card), [1, 2, 5])
  assert.deepEqual(expandClasses(unpackJson(encodeClasses(expandClasses(raw)))), expandClasses(raw), 'Rundreise')
  // JSON (?d=) aus der Schulverwaltung
  const j = parseImport('{"classes":[{"name":"7b","students":[{"name":"Anna M.","gid":"17dwy6f"},{"name":"Ben K."}]}]}')
  assert.equal(j.classes[0].students[0].gid, '17DWY6F'); assert.equal(j.classes[0].students[1].gid, undefined)

  // Mehrere Lehrkräfte, verschiedene Zeitpunkte, Teile der Klasse:
  // Lehrkraft B hatte „Anna M.“ schon mit Nummernkarte 3 -> bekommt die ID dazu (Nummer bleibt);
  // später kommt ein Teil der Klasse erneut (anderer Anzeigename) -> nichts doppelt.
  const st = { classes: [{ id: 'x', name: '7B', students: [{ card: 3, name: 'Anna M.' }, { card: 1, name: 'Lea S.' }] }] }
  const r1 = mergeClasses(st, j.classes)
  assert.deepEqual(r1, { created: 0, added: 1, linked: 1 })
  const r2 = mergeClasses(st, [{ name: '7b', students: [{ name: 'Anna Müller', gid: '17DWY6F' }, { name: 'Çem Ö.', gid: 'CTQZ5XY' }] }])
  assert.deepEqual(r2, { created: 0, added: 1, linked: 0 })
  const cls = st.classes[0].students
  assert.deepEqual(cls.map((s) => [s.card, s.name, s.gid || '']), [[1, 'Lea S.', ''], [2, 'Ben K.', ''], [3, 'Anna M.', '17DWY6F'], [4, 'Çem Ö.', 'CTQZ5XY']])
}
ok('Feste Schüler-Karten: ID-Ableitung, Karten-QR, Klassen-Paket, mehrere Lehrkräfte')

// ------------------------------------------------------------------ Bilder in Fragen (seit 0.4)
{
  // Paket mit Graph, Antwort-Graph, SVG und Foto – EINGEFROREN
  const FIX_MEDIA_B = 'AW2VQWuDQBCF_8qyl1XaNOuQXoJakNIUSilE6KVYsLixS0OV1TaC8b_3jUmwhNyWt8z7ZsZx9n-TE7vlj6FvFri4mGiKubKt2d5xxl6wJx-iR_vAP6TBlr20ctnLDlEzul5A23zj3MsNEF43C_x3uiI54KKusFPR6DeQCO4yywboR9hpnFcurz9HIsRxEbgTLW2NLXnJEHM5ZWAmGoEG0IAyJtu0dViAZjRc54X9aSDe8wjjXWgO3sFUiQyb35J_kl1SdZHSQgvSItAqDmuMoSgi9azF7SNpJZrWVV8mUs4Uah6Hc0TGXOiR_IAXgKk5zh9nDZP10r4mL-udflqVVYSobPgD'
  const set = parseImport(decodeQuery({ b: FIX_MEDIA_B })).sets[0]
  const [q1, q2, q3, q4] = set.questions
  assert.equal(set.title, 'Bilder 0.4')
  assert.deepEqual(q1.image, { type: 'plot', plot: { x: [-2, 4], fn: [{ f: '(x-1)^2+2' }], points: [[1, 2, 'S']] } })
  assert.equal(q2.optionImages[0].type, 'plot'); assert.equal(q2.optionImages[1], null); assert.equal(q2.explanation, 'Steigung 2')
  assert.equal(q3.image.type, 'svg'); assert.match(q3.image.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.equal(q4.image.src, 'data:image/png;base64,iVBORw0KGgo=')
  // Leser bis 0.3 (nur 5 Felder) sehen ein normales Quiz
  const { unpackJson } = await import('../src/lib/share.js')
  const raw = unpackJson(Uint8Array.from(atob(FIX_MEDIA_B.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - FIX_MEDIA_B.length % 4) % 4)), (c) => c.charCodeAt(0)))
  assert.deepEqual(raw.q.map((r) => r[1]), ['Scheitel?', 'Welcher Graph?', 'Strecke?', 'Foto'])
  assert.equal(b64u(encodePacket(set)), FIX_MEDIA_B, 'Kodierung mit Bildern deterministisch')
}
ok('Bilder in Fragen (Graph, SVG, Foto) im QR-Paket – auch für ältere Leser lesbar')

// ------------------------------------------------------------------ Rasterkarten (seit 0.4)
{
  const { GRID_CARD_PATTERNS } = await import('../src/lib/gridcards.js')
  assert.equal(GRID_CARD_PATTERNS.length, 40)
  assert.equal(GRID_CARD_PATTERNS[16], '1110111111110111111110001', 'Karte 17 (eingefroren, aus dem Original-PDF)')
}
ok('Rasterkarten-Muster 1–40 unverändert')

// Anonyme Sitzung: jede erkannte Karte wächst in die Liste – auch feste Schüler-Karten „DM-XXXXXXX“
{
  const { addToRoster, byCard } = await import('../src/lib/store.js')
  const anon = { classId: null, roster: [] }
  assert.equal(addToRoster(anon, 'DM-K7Q2M9X'), true)
  assert.equal(addToRoster(anon, 12), true)
  assert.equal(addToRoster(anon, 3), true)
  assert.equal(addToRoster(anon, 'DM-K7Q2M9X'), false, 'doppelt')
  assert.equal(addToRoster(anon, 'DM-ABC'), false, 'ungültig')
  assert.deepEqual(anon.roster, [{ card: 3, name: '' }, { card: 12, name: '' }, { card: 'DM-K7Q2M9X', name: '', gid: 'K7Q2M9X' }])
  const cls = { classId: 'c', roster: [{ card: 1, name: 'Ali' }] }
  assert.equal(addToRoster(cls, 'DM-K7Q2M9X'), true)
  assert.deepEqual(cls.roster[1], { card: 'DM-K7Q2M9X', name: '', gid: 'K7Q2M9X', guest: true })
  assert.deepEqual([{ card: 'DM-B' }, { card: 9 }, { card: 'DM-A' }, { card: 2 }].sort(byCard).map((s) => s.card), [2, 9, 'DM-A', 'DM-B'])
}
ok('Anonyme Sitzung nimmt auch feste Schüler-Karten auf')
