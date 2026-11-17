// Klassen per CSV: Spalten Klasse / Nachname / Vorname
import assert from 'node:assert/strict'
import { parseClassCsv, applyClassCsv, decodeCsvBytes, displayNames } from '../src/lib/format.js'

const excel = 'Klasse;Nachname;Vorname\r\n7b;Müller;Anna\r\n7a;Öztürk;Çem\r\n7b;Abel;"Ben, jr."\r\n;;\r\n7a;Zander;Zoe\r\n'
const p = parseClassCsv(excel)
assert.deepEqual(p.classes.map((c) => c.name), ['7a', '7b'])
assert.deepEqual(p.classes[1].students.map((s) => s.name), ['Ben, jr. Abel', 'Anna Müller'], 'alphabetisch nach Nachname')
console.log('  ✓ Excel-CSV (Semikolon, CRLF, Anführungszeichen)')

// Windows-1252 (Excel „CSV (Trennzeichen-getrennt)“)
const cp = Uint8Array.from([...'Vorname,Nachname,Klasse\nJ'].map((c) => c.charCodeAt(0)).concat([0xf6], [...'rg,Gr'].map((c) => c.charCodeAt(0)), [0xfc], [...'n,5c\n'].map((c) => c.charCodeAt(0))))
const p2 = parseClassCsv(decodeCsvBytes(cp))
assert.equal(p2.classes[0].name, '5c'); assert.equal(p2.classes[0].students[0].name, 'Jörg Grün')
console.log('  ✓ Windows-1252, Komma, andere Spaltenreihenfolge')

// Tab, Kleinschreibung, Kopfzeile nicht in Zeile 1, ohne Klasse
const p3 = parseClassCsv('Export vom 1.9.\nvorname\tnachname\nLea\tKern\n', 'Kurs X')
assert.equal(p3.classes[0].name, 'Kurs X'); assert.equal(p3.warnings.length, 1)
console.log('  ✓ Tabulator, Kopfzeile später, fehlende Klasse')

// Übernahme: vorhandene Kartennummern bleiben, Duplikate werden übersprungen
const state = { classes: [{ id: 'k', name: '7B', students: [{ card: 1, name: 'Anna Müller' }, { card: 3, name: 'Tom Alt' }] }] }
const r = applyClassCsv(state, p, { fullName: true })
assert.deepEqual(r, { created: 1, added: 3, linked: 0 })
assert.deepEqual(state.classes[0].students.map((s) => [s.card, s.name]), [[1, 'Anna Müller'], [2, 'Ben, jr. Abel'], [3, 'Tom Alt']])
assert.deepEqual(state.classes[1].students.map((s) => s.card), [1, 2])
console.log('  ✓ Zusammenführen: Karten bleiben, keine Doppelten')

// Standard: „Vorname N.“, bei Gleichheit längeres Kürzel
{
  const st = [{ first: 'Anna', last: 'Müller' }, { first: 'Anna', last: 'Maier' }, { first: 'Ben', last: 'Kurz' }, { first: '', last: 'Nurnachname' }, { first: 'Cem', last: '' }]
  assert.deepEqual(displayNames(st), ['Anna Mü.', 'Anna Ma.', 'Ben K.', 'Nurnachname', 'Cem'])
  const s2 = { classes: [] }
  applyClassCsv(s2, parseClassCsv('Klasse;Nachname;Vorname\n5a;Kern;Lea\n'))
  assert.equal(s2.classes[0].students[0].name, 'Lea K.')
  console.log('  ✓ Standard „Vorname N.“, eindeutig bei Gleichheit')
}
