// Bilder in Fragen: Graphen (plot.js), SVG, Fotos im QR-Paket, Seitenplanung, Verkleinerungs-Leiter.
//   node test/media.test.mjs
import assert from 'node:assert/strict'
import qrcode from 'qrcode-generator'
import { compileExpr, normalizePlot, renderPlot } from '../src/lib/plot.js'
import { cleanSvg, minifySvg, normalizeMedia, packMedia, unpackMedia, fitRasters, RASTER_LEVELS, mediaBytes, withoutRasters, setHasRaster } from '../src/lib/media.js'
import { parseImport, buildPrompt, AI_DEFAULTS, suggestsImages } from '../src/lib/format.js'
import { compact, expand, encodePacket, unpackJson, qrTexts, QrCollector, setLink } from '../src/lib/share.js'
import { qrModuleCount, QR_ALNUM_L, QR_BYTE_L, planQuizQr, layoutCodes } from '../src/lib/qrlayout.js'
import { quizQrPdf } from '../src/lib/pdf.js'
import { buildDrawing, parseDrawing, penPath, arrowPath, simplifyOpen, sanitizeShape } from '../src/lib/draw.js'
import { traceContours, traceToSvg, otsu, simplify, traceColorToSvg, quantize } from '../src/lib/trace.js'

let ok = 0
const t = async (name, fn) => { await fn(); ok++; console.log('  ✓', name) }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`)

console.log('Formeln:')
await t('Rechenregeln, implizites Mal, Funktionen, Konstanten', () => {
  const cases = [['x^2-2', 3, 7], ['2x+1', 2, 5], ['-x^2', 3, -9], ['2^3^2', 0, 512], ['sin(x)^2+cos(x)^2', 1.3, 1], ['f(x)=3(x-1)(x+2)', 0, -6],
    ['|x-3|', 1, 2], ['e^(-x)', 0, 1], ['2pi x', 1, 2 * Math.PI], ['x sin x', Math.PI / 2, Math.PI / 2], ['ln(e^2)', 0, 2], ['y = 0.5x³', 2, 4],
    ['2·x−1', 3, 5], ['sinx', Math.PI / 2, 1], ['log(100)', 0, 2], ['√(x)', 9, 3], ['1/2x', 4, 2], ['(x+1)(x-1)', 3, 8], ['x/2/2', 8, 2]]
  for (const [e, x, want] of cases) near(compileExpr(e)({ x }), want, e)
  assert.ok(Number.isNaN(compileExpr('sqrt(x)')({ x: -1 })))
  assert.ok(Number.isNaN(compileExpr('1/x')({ x: 0 })))
  near(compileExpr('2cos(t)', ['t'])({ t: 0 }), 2, 'param')
})
await t('kein eval: Fremdes wird abgelehnt', () => {
  for (const bad of ['x+', 'foo(x)', 'x@2', '(x', 'alert(1)', 'constructor', 'x;1', 'this', '[]']) assert.throws(() => compileExpr(bad), undefined, bad)
})

console.log('Graphen:')
await t('Graph -> gültiges SVG ohne NaN, Polstellen werden unterbrochen', () => {
  const svg = renderPlot({ x: [-3, 3], fn: ['x^2-2', { f: 'tan(x)', dash: true, label: 'g' }, { f: '1/x', color: 'grün' }], points: [[1.414, 0, 'N']] })
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 300"/)
  assert.ok(svg.endsWith('</svg>'))
  assert.ok(!/NaN|Infinity|undefined/.test(svg))
  const tanPath = /<path d="([^"]+)" fill="none" stroke="#e0393e"/.exec(svg)[1]
  assert.ok(tanPath.split('M').length - 1 >= 2, 'tan in mehreren Stücken')
  assert.match(svg, /stroke="#12925a"/, 'Farbname „grün“')
  assert.match(svg, />N</)
  assert.equal(svg.match(/marker-end="url\(#a\)"><path[^>]*\/><path/g)?.length, 1, 'Pfeil an beiden Achsen')
})
await t('Säulendiagramm, Parameterkurve, Vielecke, Hilfslinien, Fläche', () => {
  assert.match(renderPlot({ bars: { labels: ['Mo', 'Di'], values: [3, 5] } }), /<rect x=/)
  const s = renderPlot({ param: [{ x: 'cos(t)', y: 'sin(t)' }], polygons: [[[0, 0], [1, 0], [0, 1]]], vlines: [0.5], hlines: [-0.5], fn: [{ f: 'x', fill: [0, 1] }], equal: true, x: [-2, 2], y: [-2, 2] })
  assert.ok(!/NaN/.test(s))
  assert.match(s, /stroke-dasharray="5 4"/)
})
await t('Graph-Beschreibung wird geprüft (verständliche Fehler, Grenzen)', () => {
  assert.throws(() => normalizePlot({ fn: ['x^'] }), /Funktion 1/)
  assert.throws(() => normalizePlot({}), /leer/)
  const n = normalizePlot({ fn: Array(20).fill('x'), x: [5, 1], w: 99999, extra: 'weg' })
  assert.equal(n.fn.length, 8); assert.equal(n.x, undefined === n.x ? undefined : n.x); assert.equal(n.w, 800); assert.equal(n.extra, undefined)
  assert.deepEqual(normalizePlot({ fn: 'x^2', x: [-2, 2] }), { x: [-2, 2], fn: [{ f: 'x^2' }] })
})

await t('Gitter je Achse: none/major/minor, eigene Abstände; alte Angaben (true/false/1/0) gelten weiter', () => {
  assert.deepEqual(normalizePlot({ fn: ['x'], grid: { x: 'fein', y: 'haupt' } }).grid, { x: 'minor', y: 'major' })
  assert.equal(normalizePlot({ fn: ['x'], grid: false }).grid, 'none')
  assert.equal(normalizePlot({ fn: ['x'], grid: 1 }).grid, 'major')
  assert.equal(normalizePlot({ fn: ['x'], minor: 0.5 }).grid, 'minor', 'Nebenlinien-Abstand angegeben -> Nebenlinien an')
  const lines = (svg, col) => (svg.match(new RegExp('<path d="([^"]*)" stroke="' + col + '"')) || [, ''])[1].split('M').length - 1
  const fine = renderPlot({ x: [0, 4], y: [0, 4], fn: ['x'], grid: { x: 'minor', y: 'major' }, step: [1, 1], minor: [0.5, 0.5] })
  assert.equal(lines(fine, '#eceaf2'), 4, 'x: Nebenlinien bei 0.5, 1.5, 2.5, 3.5')
  assert.ok(!/stroke="#eceaf2"/.test(renderPlot({ fn: ['x'] })), 'Standard: nur Hauptlinien')
  assert.ok(!/stroke="#dcd9e6"|stroke="#cfcbdc"/.test(renderPlot({ fn: ['x'], grid: 'none' })), 'kein Gitter')
})
await t('Achsen mit Größe + Einheit (in / [] / /), Index und Exponent; Streckenzüge', () => {
  const svg = renderPlot({ x: [0, 10], y: [0, 6], lines: [[[0, 0], [2, 4], [6, 4]], { points: [[0, 1], [6, 1]], dash: true, label: 'B' }], xlabel: 't', xunit: 's', ylabel: 'a', yunit: 'm/s^2' })
  assert.match(svg, /<tspan font-style="italic">t<\/tspan> in s/)
  assert.match(svg, /in m\/s<tspan dy="-6" font-size="75%">2<\/tspan>/)
  assert.match(svg, /stroke-dasharray="7 5"/)
  assert.match(renderPlot({ fn: ['x'], xlabel: 'v_0', xunit: 'km/h', units: '[]' }), /v<tspan dy="4" font-size="75%">0<\/tspan><\/tspan> \[km\/h\]/)
  assert.match(renderPlot({ fn: ['x'], ylabel: 'F', yunit: 'N', units: '/' }), /F<\/tspan> \/ N/)
  assert.ok(!/<script/.test(renderPlot({ fn: ['x'], xlabel: '<script>' })), 'Beschriftungen escaped')
})
await t('3D: Vektoren, Punkte, Geraden, Ebenen (3 Schreibweisen), Spurdreieck, Hilfslinien, Blickwinkel', () => {
  const sp = normalizePlot({ space: { vectors: [{ v: [2, 3, 1], label: 'a' }, { from: [1, 0, 0], to: [1, 2, 0] }, [1, 1, 1, 'c']], points: [[2, 5, 4, 'P']], guides: true,
    planes: [{ n: [2, 1, 2], d: 6, trace: true }, { p: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { points: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, { n: [0, 0, 0], d: 1 }],
    lines: [{ p: [0, 0, 0], d: [1, 1, 1], label: 'g' }] } }).space
  assert.deepEqual(sp.vectors[1], { from: [1, 0, 0], v: [0, 2, 0] }); assert.deepEqual(sp.vectors[2].v, [1, 1, 1])
  assert.equal(sp.planes.length, 3, 'Normalenvektor 0 verworfen')
  assert.deepEqual(sp.planes[1].n, [0, 0, 1]); assert.equal(sp.planes[1].d, 1)
  assert.deepEqual(sp.planes[2].n, [1, 1, 1]); assert.equal(sp.planes[2].d, 1)
  const svg = renderPlot({ space: sp })
  assert.ok(!/NaN|Infinity|undefined/.test(svg))
  assert.match(svg, /x₁/); assert.match(svg, />P</); assert.match(svg, />g</); assert.match(svg, /stroke-dasharray="4 3"/, 'Hilfslinien')
  // Schrägbild: (0|1|0) liegt eine Einheit rechts vom Ursprung, (1|0|0) halb nach links unten
  assert.ok(!/NaN/.test(renderPlot({ space: { points: [[1, 1, 1]], view: [30, 20], names: ['x', 'y', 'z'] } })))
  assert.throws(() => normalizePlot({ space: {} }), /leer/)
  assert.equal(normalizeMedia({ graph: { '3d': { vectors: [{ v: [1, 2, 3] }] } } }).plot.space.vectors[0].v[2], 3, 'Alias "3d"')
})
await t('Agenten-Doku synchron: llms.txt enthält die Graph-Anleitung des KI-Prompts wörtlich; Schema kennt alle Felder', async () => {
  const { readFile } = await import('node:fs/promises')
  const { GRAPH_HELP } = await import('../src/lib/format.js')
  const llms = await readFile('public/llms.txt', 'utf8')
  assert.ok(llms.includes(GRAPH_HELP), 'llms.txt: GRAPH_HELP aus format.js wörtlich übernehmen')
  const sch = JSON.parse(await readFile('public/drehmoment.schema.json', 'utf8')).$defs.graph.properties
  for (const k of ['x', 'y', 'fn', 'points', 'lines', 'segments', 'polygons', 'vlines', 'hlines', 'texts', 'param', 'bars', 'grid', 'step', 'minor', 'equal', 'xlabel', 'ylabel', 'xunit', 'yunit', 'units', 'space']) assert.ok(sch[k], 'Schema: ' + k)
  for (const k of ['vectors', 'points', 'segments', 'lines', 'planes', 'polygons', 'range', 'guides', 'box', 'view', 'names']) assert.ok(sch.space.properties[k], 'Schema space: ' + k)
})

console.log('SVG:')
await t('SVG säubern: Skripte, Ereignisse, externe Links raus; xmlns + viewBox rein', () => {
  const dirty = `Hier ist dein SVG:\n\`\`\`svg\n<?xml version="1.0"?><!-- Kommentar --><svg width="100" height="50" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="10" height="10"/></a><image href="https://evil.example/x.png"/><foreignObject><div>x</div></foreignObject><circle cx="5" cy="5" r="2" onclick="x()"/></svg>\n\`\`\``
  const c = cleanSvg(dirty)
  assert.ok(!/script|onload|onclick|javascript|evil|foreignObject|<\?xml|Kommentar/i.test(c), c)
  assert.match(c, /^<svg viewBox="0 0 100 50" xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.throws(() => cleanSvg('kein svg'), /Kein SVG/)
  assert.throws(() => cleanSvg('<svg>' + 'x'.repeat(70000) + '</svg>'), /zu groß/)
})
await t('SVG verkleinern: Nachkommastellen, Leerraum; Text bleibt', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <path d="M 10.12345 20.6789 L 30.111 -40.999 Z" stroke-width="1.25"/>\n  <text x="1.234" y="5">π = 3.14159</text>\n</svg>`
  const m = minifySvg(svg)
  assert.equal(m, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10.1 20.7L30.1-41Z" stroke-width="1.3"/><text x="1.2" y="5">π = 3.14159</text></svg>')
})

console.log('Bilder einlesen (KI-JSON):')
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
await t('Graph/SVG/Foto an Frage und Antworten, in allen üblichen Schreibweisen', () => {
  const p = parseImport({
    title: 'Bilder',
    questions: [
      { question: 'Welche Nullstellen hat f?', graph: { fn: ['x^2-4'], x: [-3, 3] }, options: ['±2', '±4'], correct: 'A' },
      { question: 'Welches Dreieck ist rechtwinklig?', options: [{ svg: '<svg viewBox="0 0 10 10"><path d="M0 0L10 0L0 10z"/></svg>' }, { text: 'B', image: { graph: { polygons: [[[0, 0], [2, 0], [1, 1]]] } } }, { text: 'keins' }], correct: 'A' },
      { question: 'Foto', image: PNG, options: ['a', 'b'], correct: 0 },
      { question: 'Bild', bild: { type: 'svg', svg: '<svg width="4" height="4"/>' }, options: ['a', 'b'], correct: 0 },
      { question: 'Link', image: 'https://example.org/x.png', options: ['a', 'b'], correct: 0 },
      { question: 'kaputt', graph: { fn: ['x^'] }, options: ['a', 'b'], correct: 0 },
    ],
  })
  const [q1, q2, q3, q4, q5, q6] = p.sets[0].questions
  assert.equal(q1.image.type, 'plot'); assert.deepEqual(q1.image.plot.fn, [{ f: 'x^2-4' }])
  assert.equal(q2.optionImages.length, 3); assert.equal(q2.optionImages[0].type, 'svg'); assert.equal(q2.optionImages[1].type, 'plot'); assert.equal(q2.optionImages[2], null)
  assert.deepEqual(q2.options, ['', 'B', 'keins'])
  assert.equal(q3.image.type, 'raster')
  assert.equal(q4.image.type, 'svg'); assert.match(q4.image.svg, /viewBox="0 0 4 4"/)
  assert.equal(q5.image, undefined); assert.equal(q6.image, undefined)
  assert.ok(p.warnings.some((w) => /Bild-Links/.test(w)) && p.warnings.some((w) => /Frage 6/.test(w)))
})

console.log('QR-Paket mit Bildern (seit 0.4):')
const SET = parseImport({
  title: 'Graphen', questions: [
    { question: 'Welcher Graph gehört zu $f(x)=x^2$?', options: [{ graph: { fn: ['x^2'], x: [-2, 2] } }, { graph: { fn: ['-x^2'], x: [-2, 2] } }, { graph: { fn: ['x^3'], x: [-2, 2] } }], correct: 'A' },
    { question: 'Wo liegt der Scheitel?', graph: { fn: ['(x-1)^2+2'], x: [-1, 3], points: [[1, 2, 'S']] }, options: ['(1|2)', '(2|1)'], correct: 'A', explanation: '' },
    { question: 'Dreieck', svg: '<svg viewBox="0 0 100 80"><path d="M10.123 70.456 L 90 70 L 50 10.5 Z" fill="none" stroke="#000"/></svg>', options: ['spitz', 'stumpf'], correct: 'A' },
    { question: 'Foto', image: PNG, options: ['ja', 'nein'], correct: 'A' },
  ],
}).sets[0]
await t('Rundreise compact -> expand -> Import, alle Bildarten', () => {
  const back = parseImport(expand(unpackJson(encodePacket(SET)))).sets[0]
  assert.deepEqual(back.questions[0].optionImages.map((m) => m.plot.fn[0].f), ['x^2', '-x^2', 'x^3'])
  assert.deepEqual(back.questions[1].image, SET.questions[1].image)
  assert.equal(back.questions[2].image.type, 'svg'); assert.match(back.questions[2].image.svg, /d="M10\.1 70\.5L90 70L50 10\.5Z"/)
  assert.equal(back.questions[3].image.src, PNG)
  const raw = compact(SET)
  assert.equal(raw.q[1].length, 6); assert.equal(raw.q[1][4], '', 'Platzhalter für fehlende Erklärung')
  assert.ok(!JSON.stringify(raw).includes('w3.org'), 'xmlns wird im Paket weggelassen')
})
await t('ältere Leser (bis 0.3) lesen dieselben Codes – Bilder werden einfach ignoriert', () => {
  const raw = unpackJson(encodePacket(SET))
  const old = raw.q.map(([type, text, options, correct, explanation]) => ({ type, text, options: options === 0 ? ['Wahr', 'Falsch'] : options, correct, explanation: explanation || '' }))
  assert.equal(old.length, 4); assert.equal(old[1].text, 'Wo liegt der Scheitel?'); assert.deepEqual(old[0].options, ['', '', ''])
  // ohne Bilder bleibt das Paket bytegleich zur alten Kodierung
  const plain = { ...SET, questions: SET.questions.map(({ image, optionImages, ...q }) => q) }
  assert.deepEqual(encodePacket(plain), encodePacket(SET, { media: false }))
})
await t('mehrteilig über QR-Codes, unbekannte Bildarten -> null statt Absturz', () => {
  const { texts } = qrTexts(SET, { maxBytes: 120 })
  assert.ok(texts.length > 1)
  const c = new QrCollector(); let r
  for (const x of texts) r = c.add(x)
  assert.equal(r.set.questions[0].optionImages.length, 3)
  assert.equal(unpackMedia('z:abc'), null); assert.equal(unpackMedia([1, 2]), null); assert.equal(unpackMedia({ fn: ['x^'] }), null)
  assert.equal(packMedia(null), 0)
})
await t('Graphen sind winzig: 3 Antwort-Graphen + Scheitel-Graph < 200 Byte im Paket', () => {
  const only = { ...SET, questions: SET.questions.slice(0, 2) }
  const noImg = { ...only, questions: only.questions.map(({ image, optionImages, ...q }) => q) }
  const extra = encodePacket(only).length - encodePacket(noImg).length
  console.log(`      Graphen kosten ${extra} Byte`)
  assert.ok(extra < 200)
})
await t('Link-Modus: Bilder werden als Letztes weggelassen, wenn der Link zu lang wird', () => {
  const big = { ...SET, questions: [...SET.questions, { ...SET.questions[3], image: { type: 'raster', src: 'data:image/webp;base64,' + Buffer.from(Array.from({ length: 4500 }, (_, i) => (i * 2654435761) >>> 24)).toString('base64') } }] }
  const l = setLink(big, { base: 'https://x.example/' })
  assert.equal(l.trimmed, 'media')
  assert.ok(l.url.length < 2300)
})

console.log('Seitenplanung:')
await t('QR-Kapazitätstabelle stimmt mit dem Generator überein (alle 40 Versionen, alphanumerisch + Byte)', () => {
  for (const [alnum, table] of [[true, QR_ALNUM_L], [false, QR_BYTE_L]]) {
    for (let v = 1; v <= 40; v += v < 10 ? 1 : 3) {
      for (const len of [table[v - 1], table[v - 1] + 1]) {
        if (len > table[39]) continue
        const text = (alnum ? 'A' : 'a').repeat(len)
        const qr = qrcode(0, 'L'); qr.addData(text, alnum ? 'Alphanumeric' : 'Byte'); qr.make()
        assert.equal(qrModuleCount(text, alnum), qr.getModuleCount(), `v${v} len ${len}`)
      }
    }
  }
})
await t('Kapazität zweier A4-Seiten (gut lesbar ≥ 0,45 mm/Modul) und Seitenbedarf darüber', () => {
  // Zufallsdaten = unkomprimierbar -> Obergrenze für Fotos
  // Base64-Zeichen aus einem Pseudozufallsgenerator (wie ein Foto in base64: ~6 Bit je Zeichen)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const rnd = (n) => { let x = 123456789, s = ''; for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s += B64[(x >>> 0) % 64] } return s }
  let lo = 1000, hi = 60000
  const fits = (n) => planQuizQr({ title: 'T', questions: [{ type: 'mc', text: 'Foto', options: ['a', 'b'], correct: [0], image: { type: 'raster', src: 'data:image/webp;base64,' + rnd(n) } }] }).lay?.mod >= 0.45
  while (hi - lo > 200) { const m = (lo + hi) >> 1; if (fits(m)) lo = m; else hi = m }
  console.log(`      2 Seiten fassen ≈ ${(lo / 1000).toFixed(1)} kB Base64 ≈ ${((lo * 0.75) / 1000).toFixed(1)} kB Foto-Daten`)
  assert.ok(lo > 6000 && lo < 30000, String(lo))
  const huge = { title: 'T', questions: [{ type: 'mc', text: 'Foto', options: ['a', 'b'], correct: [0], image: { type: 'raster', src: 'data:image/webp;base64,' + rnd(lo * 2) } }] }
  const p = planQuizQr(huge)
  assert.equal(p.lay, null); assert.ok(p.pages >= 3, 'Seitenbedarf wird gemeldet: ' + p.pages)
  const p4 = planQuizQr(huge, { maxPages: p.pages })
  assert.ok(p4.lay && p4.mod >= 0.55, 'mit genug Seiten gut lesbar')
  const doc = quizQrPdf(huge, { maxPages: p.pages })
  assert.equal(doc.getNumberOfPages(), p4.pages)
  assert.throws(() => quizQrPdf(huge), /bräuchte \d+ Seiten/)
  assert.equal(layoutCodes([500], 100, { maxPages: 2, minMod: 0.4 }), null, 'zu großer Code: zu kleine Module')
})

console.log('Fotos stufenweise verkleinern:')
// Ersatz-Kodierer: Größe ~ Fläche × Qualität (wie bei echten Fotos grob proportional)
let seed = 1
const noise = (n) => { let x = seed++ * 2654435761 >>> 0 || 1, o = ''; for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; o += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[(x >>> 0) % 64] } return o }
const fakeEncode = async (src, { maxDim, quality }) => 'data:image/webp;base64,' + noise(Math.round((maxDim * maxDim * quality) / 40))
const photoSet = (n) => ({ title: 'Fotos', questions: Array.from({ length: n }, (_, i) => ({ type: 'mc', text: 'Was zeigt Bild ' + i, options: ['a', 'b'], correct: [0], image: { type: 'raster', src: PNG } })) })
await t('Leiter: beste Stufe, die passt (binäre Suche, wenige Versuche)', async () => {
  let calls = 0
  const budget = 12000
  const r = await fitRasters(photoSet(3), { encode: fakeEncode, fits: (s) => { calls++; return JSON.stringify(s).length < budget } })
  assert.ok(r.fits)
  const sizeAt = (L) => 3 * Math.round((RASTER_LEVELS[L].big ** 2 * RASTER_LEVELS[L].q) / 40)
  assert.ok(sizeAt(r.level) < budget && (r.level === 0 || sizeAt(r.level - 1) > budget - 2000), `Stufe ${r.level}`)
  assert.ok(calls <= 6, `${calls} Versuche`)
  console.log(`      3 Fotos -> Stufe ${r.level + 1}/${r.levels} (${RASTER_LEVELS[r.level].big} px, Qualität ${RASTER_LEVELS[r.level].q}), ${calls} Prüfungen`)
})
await t('passt nicht einmal auf kleinster Stufe -> fits=false; ohne Fotos geht es', async () => {
  const r = await fitRasters(photoSet(40), { encode: fakeEncode, fits: (s) => JSON.stringify(s).length < 5000 })
  assert.equal(r.fits, false); assert.equal(r.level, RASTER_LEVELS.length - 1)
  const without = withoutRasters(photoSet(40))
  assert.ok(!setHasRaster(without) && without.questions.every((q) => q.image === null))
})
await t('ohne Fotos: nichts zu tun', async () => {
  const r = await fitRasters(SET.questions.slice(0, 2).length ? { ...SET, questions: SET.questions.slice(0, 3) } : SET, { encode: fakeEncode, fits: () => true })
  assert.equal(r.level, -1)
  assert.equal(mediaBytes(SET.questions[3].image), 72) // 1×1-PNG
})
await t('echte Planung: Fotos werden so klein, dass das Quiz auf 2 Seiten passt', async () => {
  const set = photoSet(6)
  const r = await fitRasters(set, { encode: fakeEncode, fits: (s) => !!planQuizQr(s).lay && planQuizQr(s).mod >= 0.45 })
  assert.ok(r.fits); assert.ok(planQuizQr(r.set).pages <= 2)
  assert.ok(planQuizQr(r.set, { maxPages: 99 }).pages <= 2, 'Seitenbedarf (beliebig viele Seiten erlaubt) stimmt mit der Anpassung überein')
  console.log(`      6 Fotos -> Stufe ${r.level + 1}, ${planQuizQr(r.set).texts.length} Codes auf ${planQuizQr(r.set).pages} Seite(n)`)
})

console.log('Vektorisieren:')
await t('Umrisse exakt: Fläche aller Umrisse = Anzahl dunkler Pixel (Ringe, Löcher, Schachbrett, Rand)', () => {
  const w = 40, h = 30, bin = new Uint8Array(w * h)
  let n = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - 12, y - 15)
    const d = (r < 10 && r > 5) || (x > 28 && x < 36 && y > 4 && y < 12) || (x === 39 && y === 29) || ((x + y) % 2 === 0 && x > 30 && y > 20 && x < 34 && y < 24) || (x === 0 && y < 5)
    if (d) { bin[y * w + x] = 1; n++ }
  }
  let a = 0
  for (const p of traceContours(bin, w, h)) { let s2 = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; s2 += p[i] * p[j + 1] - p[j] * p[i + 1] } a += s2 / 2 }
  assert.equal(a, n)
})
await t('Skizze -> kleines SVG; Krümel (Papierrauschen) verschwinden; Otsu-Schwelle', () => {
  const w = 200, h = 120, g = new Uint8Array(w * h).fill(235)
  for (let x = 20; x < 180; x++) for (let k = 0; k < 3; k++) g[(100 + k) * w + x] = 30 // Linie
  for (let y = 20; y < 103; y++) for (let k = 0; k < 3; k++) g[y * w + 20 + k] = 30
  for (let i = 0; i < 300; i++) g[(i * 7919) % (w * h)] = 40 // Rauschen (Einzelpixel)
  assert.ok(otsu(g) > 40 && otsu(g) < 235)
  const r = traceToSvg(g, w, h)
  assert.equal(r.paths, 1, 'nur der Winkel, kein Rauschen')
  assert.ok(r.svg.length < 400, r.svg.length + ' Zeichen')
  assert.equal(normalizeMedia(r.svg).type, 'svg')
  assert.deepEqual(simplify([0, 0, 5, 0, 10, 0, 10, 5, 10, 10, 5, 10, 0, 10, 0, 5], 0.5), [0, 0, 10, 0, 10, 10, 0, 10])
})

await t('mehrfarbig: Farben werden erkannt, je Farbe eine Fläche, Säume entfernt, Hintergrund weggelassen', () => {
  const w = 160, h = 100, img = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [250, 248, 240] // Papier
    if (Math.hypot(x - 40, y - 50) < 25) c = [220, 40, 40] // rote Scheibe
    if (x > 80 && x < 140 && y > 20 && y < 60) c = [40, 80, 220] // blaues Rechteck
    if (y >= 78 && y < 82 && x > 70 && x < 150) c = [20, 20, 20] // schwarze Linie
    img.set([...c, 255], (y * w + x) * 4)
  }
  // weichzeichnen (Kantenglättung wie bei Fotos/Scans) + Rauschen
  const src = img.slice()
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) for (let k = 0; k < 3; k++) {
    let sum = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[((y + dy) * w + x + dx) * 4 + k]
    img[(y * w + x) * 4 + k] = sum / 9 + ((x * 7 + y * 13) % 9) - 4
  }
  const r = traceColorToSvg(img, w, h, { colors: 4 })
  assert.equal(r.paths, 3, 'rot, blau, schwarz – keine Säume als eigene Flächen')
  const near = (hexc, rgb) => { const v = [1, 3, 5].map((i) => parseInt(hexc.slice(i, i + 2), 16)); return v.every((x, i) => Math.abs(x - rgb[i]) < 45) }
  for (const want of [[220, 40, 40], [40, 80, 220], [20, 20, 20]]) assert.ok(r.palette.some((p) => near(p, want)), 'Farbe ' + want + ' in ' + r.palette)
  assert.match(r.svg, /<rect width="160" height="100" fill="#fff"\/>/, 'fast weißes Papier -> weiß')
  // keine Farbsäume: graue Kantenpixel der schwarzen Linie dürfen nicht „rot“ oder „blau“ werden
  for (const col of r.palette.slice(1)) {
    const d = new RegExp('<path d="([^"]*)" fill="' + col + '"').exec(r.svg)[1]
    assert.equal(d.split('M').length - 1, 1, 'Farbe ' + col + ' ist genau eine Fläche')
  }
  assert.ok(r.svg.length < 2500, r.svg.length + ' Zeichen')
  assert.equal(normalizeMedia(r.svg).type, 'svg')
  // 2 Farben = Schwarz/Weiß-ähnlich: nur eine Fläche
  assert.equal(traceColorToSvg(img, w, h, { colors: 2 }).paths, 1)
  // einfarbiges Bild: keine zweite Farbe erfunden
  assert.equal(quantize(new Uint8ClampedArray(40 * 4).fill(200), 40, 1, 4).palette.length, 1)
})

console.log('Zeicheneditor:')
await t('Zeichnung -> SVG -> Zeichnung (auch durch das QR-Paket), Formen bleiben einzeln bearbeitbar', () => {
  const shapes = [
    { tag: 'path', a: { d: penPath([[10, 10], [11, 10.2], [12, 10.1], [40, 30], [41, 31]]), stroke: '#2f5bea', 'stroke-width': '3.5', fill: 'none' } },
    { tag: 'path', a: { d: arrowPath(50, 250, 200, 250, 2), stroke: '#e0393e', 'stroke-width': '2', fill: 'none' } },
    { tag: 'line', a: { x1: '20', y1: '200', x2: '120', y2: '140', stroke: '#17151f', 'stroke-width': '2' } },
    { tag: 'rect', a: { x: '200', y: '40', width: '80', height: '60', stroke: '#12925a', 'stroke-width': '2', fill: '#12925a', 'fill-opacity': '0.25' } },
    { tag: 'ellipse', a: { cx: '320', cy: '200', rx: '40', ry: '30', stroke: '#7b3fe4', 'stroke-width': '2', fill: 'none' } },
    { tag: 'text', a: { x: '100', y: '100', 'font-size': '20', fill: '#17151f', stroke: 'none' }, text: 'a² < b & "c"' },
  ]
  const svg = buildDrawing({ shapes, grid: 1 })
  assert.equal(normalizeMedia(svg).type, 'svg')
  const back = parseDrawing(svg)
  assert.deepEqual(back.shapes, shapes); assert.equal(back.grid, 1); assert.equal(back.bg, '')
  // durch das QR-Paket (minifiziert, ohne xmlns) und zurück
  const viaQr = parseDrawing(unpackMedia(packMedia({ type: 'svg', svg })).svg)
  assert.equal(viaQr.shapes.length, 6); assert.equal(viaQr.shapes[5].text, 'a² < b & "c"'); assert.equal(viaQr.grid, 1)
  assert.ok(packMedia({ type: 'svg', svg }).length < 1500)
})
await t('fremdes SVG wird Hintergrund (übermalen), eigene Zeichnung mit Hintergrund bleibt zerlegbar', () => {
  const plotSvg = renderPlot({ fn: ['x^2'], x: [-2, 2] })
  const p = parseDrawing(plotSvg)
  assert.deepEqual(p.shapes, []); assert.match(p.bg, /^<svg/)
  const svg = buildDrawing({ shapes: [{ tag: 'line', a: { x1: '0', y1: '0', x2: '10', y2: '10', stroke: '#e0393e' } }], bg: p.bg })
  const q = parseDrawing(svg)
  assert.equal(q.shapes.length, 1); assert.match(q.bg, /viewBox="0 0 400 300"/)
  assert.equal(parseDrawing(buildDrawing(q)).shapes.length, 1, 'erneut speichern -> stabil')
})
await t('Einlesen nimmt nur Erlaubtes: kein Skript, keine Ereignisse, keine fremden Elemente', () => {
  const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" data-dm-draw="1"><rect width="400" height="300" fill="#fff"/><g data-s="1"><path d="M0 0L9 9" onclick="alert(1)" stroke="red;background:url(x)"/><image href="x.png"/><path d="javascript:alert(1)"/><text x="1" y="2" style="x">ok</text><foreignObject><b>x</b></foreignObject></g></svg>'
  const d = parseDrawing(evil)
  assert.deepEqual(d.shapes, [{ tag: 'path', a: { d: 'M0 0L9 9' } }, { tag: 'text', a: { x: '1', y: '2' }, text: 'ok' }])
  assert.equal(sanitizeShape('script', {}), null)
  assert.deepEqual(simplifyOpen([[0, 0], [1, 0.1], [2, 0], [3, 0.1], [10, 0]], 0.5), [[0, 0], [10, 0]])
  assert.match(arrowPath(0, 0, 100, 0, 2), /^M0 0L100 0M/)
})

console.log('KI-Prompt:')
await t('Graphen-Quiz in einem Rutsch: Prompt enthält Anleitung, Mindestzahl, Formelregeln; Beispiel importierbar', () => {
  const p = buildPrompt({ ...AI_DEFAULTS, topic: 'Lineare Funktionen', count: 10, images: 'many' })
  assert.match(p, /GRAPHEN-QUIZ: Mindestens 6 der 10 Fragen/)
  for (const must of [/WO DAS BILD HINGEHÖRT/, /GRAPH-FORMAT/, /KEIN LaTeX/, /richtig: "0\.5x\^2-2x\+1"/, /GLEICHER Achsenbereich/, /Vor der Ausgabe jede Formel prüfen/]) assert.match(p, must)
  const set = parseImport(/```json\n([\s\S]*?)```/.exec(p)[1]).sets[0]
  assert.equal(set.questions.filter((q) => q.image || q.optionImages).length, 3)
  assert.match(buildPrompt({ ...AI_DEFAULTS, topic: 'X', images: true }), /etwa jede dritte Frage/, 'alte Einstellung (true) = „wo sinnvoll“')
  assert.ok(suggestsImages({ topic: 'Quadratische Funktionen', subject: '' }) && !suggestsImages({ topic: 'Französische Revolution', subject: 'Geschichte' }))
})
await t('typische KI-Antwort mit Graphen (inkl. Ausrutschern) wird vollständig übernommen', () => {
  const ai = String.raw`Hier ist dein Quiz:
\`\`\`json
{"title":"Parabeln","questions":[
 {"type":"mc","question":"Welche Nullstellen hat $f$?","graph":{"x":[-4,4],"fn":["x^{2}-4"]},"options":["$\\pm 2$","$\\pm 4$","$2$","keine"],"correct":"A"},
 {"type":"mc","question":"Welcher Graph gehört zu $f(x)=\\frac{1}{2}x^2$?","options":[{"graph":{"x":[-3,3],"y":[-1,5],"fn":["\\frac{1}{2}x^2"]}},{"graph":{"x":[-3,3],"y":[-1,5],"fn":["2x^2"]}},{"graph":{"x":[-3,3],"y":[-1,5],"fn":["0,5x^2+1"]}}],"correct":"A"},
 {"type":"mc","question":"Fläche?","graph":{"x":[-1,3],"fn":[{"f":"x^2","fill":[0,2]}]},"options":["8/3","4"],"correct":"A"}
]}
\`\`\``
  const p = parseImport(ai)
  const qs = p.sets[0].questions
  assert.deepEqual(p.warnings, [])
  assert.equal(qs[0].image.type, 'plot'); assert.equal(qs[1].optionImages.length, 3); assert.equal(qs[2].image.plot.fn[0].fill[1], 2)
  for (const q of qs) for (const m of [q.image, ...(q.optionImages || [])].filter(Boolean)) assert.ok(!/NaN|Fehler/.test(renderPlot(m.plot)))
})
await t('Prompt erklärt Graphen + SVG nur, wenn Abbildungen gewünscht', () => {
  assert.ok(!/"graph"/.test(buildPrompt({ ...AI_DEFAULTS, topic: 'X' })))
  const p = buildPrompt({ ...AI_DEFAULTS, topic: 'Parabeln', images: true })
  assert.match(p, /"graph"/); assert.match(p, /svg/i)
  // Beispiel im Prompt ist selbst gültig und importierbar
  const json = /```json\n([\s\S]*?)```/.exec(p)[1]
  const set = parseImport(json).sets[0]
  assert.ok(set.questions.some((q) => q.image?.type === 'plot'))
  assert.ok(set.questions.some((q) => q.optionImages?.some(Boolean)))
})

console.log(`\n✓ ${ok} Bild-Tests bestanden`)
