// Kartencodes vollständig prüfen: JEDE Nummernkarte 1–999 in JEDEM Dreh-Versatz, dazu viele Schüler-IDs.
// Gedruckte Karte (cardFace) wird gerendert, mit jsQR gelesen, zurückübersetzt und muss bei jeder Kante oben
// genau den Buchstaben dieser Kante liefern.
//   node test/cardcode.test.mjs
import assert from 'node:assert/strict'
import jsQRModule from 'jsqr'
import { cardMatrix, cardFace, rotateCW } from '../src/lib/qr.js'
import { cardCode, parseCardCode, cardRotation, ROT_SEP } from '../src/lib/cardcode.js'
import { orientation } from '../src/lib/detect.js'
import { GID_ALPHABET } from '../src/lib/gid.js'

const jsQR = typeof jsQRModule === 'function' ? jsQRModule : jsQRModule.default
let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const TOP = ['A', 'D', 'C', 'B'] // Karte k·90° im Uhrzeigersinn gedreht -> diese Kante ist oben

/** Matrix sauber rendern (4 px/Modul, 4 Module Rand) */
function render(m, px = 4, quiet = 4) {
  const n = m.length, S = (n + 2 * quiet) * px, img = new Uint8ClampedArray(S * S * 4).fill(255)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
    const o = (((y + quiet) * px + dy) * S + (x + quiet) * px + dx) * 4; img[o] = img[o + 1] = img[o + 2] = 0
  }
  return { img, S }
}
/** gedruckte Karte lesen, wenn die Karte um k·90° im Uhrzeigersinn gedreht gehalten wird */
function read(id, rot, k) {
  const { img, S } = render(rotateCW(cardFace(id, rot).m, k))
  const r = jsQR(img, S, S, { inversionAttempts: 'dontInvert' })
  assert.ok(r, `${id} r=${rot} k=${k} nicht lesbar`)
  const p = parseCardCode(r.data)
  assert.ok(p, `${id}: unbekannter Inhalt ${r.data}`)
  return { p, text: r.data, letter: orientation(r.location, 30, p.rot).letter }
}

t('rotateCW: 4× = unverändert, 1× dreht die linke obere Ecke nach rechts oben', () => {
  const m = cardMatrix(5)
  assert.deepEqual(rotateCW(m, 4), m)
  assert.deepEqual(rotateCW(rotateCW(m, 1), 3), m)
  const r1 = rotateCW([[1, 0], [0, 0]], 1)
  assert.deepEqual(r1, [[0, 1], [0, 0]])
})

t('ALLE Nummernkarten 1–999 × 4 Versätze: Inhalt, QR-Version 1, Rücklesen', () => {
  for (let n = 1; n <= 999; n++) for (let rot = 0; rot < 4; rot++) {
    const c = cardCode(n, rot)
    assert.equal(c.text, rot ? 'DM' + ROT_SEP[rot] + n : 'DM:' + n)
    assert.deepEqual(parseCardCode(c.text), { card: n, gid: null, rot })
    assert.equal(cardMatrix(n, rot).length, 21, `${n} r=${rot} muss Version 1 bleiben`)
  }
})

t('ALLE Nummernkarten 1–999 mit festem Versatz: gedruckt gelesen, A oben -> A', () => {
  for (let n = 1; n <= 999; n++) {
    const { p, letter } = read(n, cardRotation(n), 0)
    assert.equal(p.card, n); assert.equal(p.rot, cardRotation(n)); assert.equal(letter, 'A', `Karte ${n}`)
  }
})

t('Nummernkarten in jedem Versatz und jeder Haltung: oben liegende Kante = Antwort', () => {
  for (let n = 1; n <= 120; n++) for (let rot = 0; rot < 4; rot++) for (let k = 0; k < 4; k++) {
    const { p, letter } = read(n, rot, k)
    assert.equal(p.card, n); assert.equal(letter, TOP[k], `Karte ${n} r=${rot} k=${k}`)
  }
})

t('300 zufällige Schüler-IDs × 4 Versätze × 4 Haltungen', () => {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  for (let i = 0; i < 300; i++) {
    const g = Array.from({ length: 7 }, () => GID_ALPHABET[Math.floor(rnd() * 32)]).join('')
    for (let rot = 0; rot < 4; rot++) {
      assert.deepEqual(parseCardCode(cardCode(g, rot).text), { card: null, gid: g, rot })
      const k = (i + rot) % 4, { p, letter } = read(g, rot, k)
      assert.equal(p.gid, g); assert.equal(letter, TOP[k], `${g} r=${rot} k=${k}`)
    }
  }
})

t('Versatz 0 druckt die Karte exakt wie früher (alte Inhalte, gleiche Matrix)', () => {
  for (let n = 1; n <= 999; n++) if (cardRotation(n) === 0) assert.deepEqual(cardFace(n).m, cardMatrix(n))
  assert.equal(cardCode(7, 0).text, 'DM:7'); assert.equal(cardCode('17DWY6F', 0).text, 'DM-17DWY6F')
})

t('Versätze gleichmäßig verteilt (1–999: jeder Versatz 20–30 %) und fest', () => {
  const c = [0, 0, 0, 0]
  for (let n = 1; n <= 999; n++) c[cardRotation(n)]++
  for (const x of c) assert.ok(x > 200 && x < 300, `Verteilung ${c}`)
  for (let n = 1; n <= 50; n++) assert.equal(cardRotation(n), cardRotation(n))
  assert.ok(new Set(Array.from({ length: 12 }, (_, i) => cardRotation(i + 1))).size === 4, 'schon wenige Nachbarn haben verschiedene Versätze')
})

t('Ungültige Inhalte werden abgelehnt', () => {
  for (const bad of ['', 'DM', 'DM:', 'DM:1234', 'dm:7', 'DM: 7', ' DM:7', 'DM:7 ', 'DM-17DWY6', 'DM-17DWY6FF', 'DM-17DWY6U', 'DM-17DWY6I',
    'DM+', 'DM+1234', 'DM*12', 'DM,12', 'DM+17DWY6U', 'DMQ:R80', 'DMQ:1', 'https://example.org', 'DM.12A', 'XM:7'])
    assert.equal(parseCardCode(bad), null, JSON.stringify(bad))
})

console.log(`\n✓ ${ok} Kartencode-Tests bestanden`)
