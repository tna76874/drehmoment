// Drehmoment-Werkzeugkasten für KI-Agenten und Skripte (eine Datei, läuft mit Node ≥ 18, ohne Installation).
//
//   curl -O <BASE>kit/drehmoment-kit.mjs
//   node drehmoment-kit.mjs quiz quiz.json            -> quiz.pdf  (A4-Blatt mit Quiz-QR-Code(s))
//   node drehmoment-kit.mjs cards 1-30 karten.pdf     -> Antwortkarten
//   node drehmoment-kit.mjs cards klasse.csv          -> Karten mit Namen (Spalten Klasse/Nachname/Vorname)
//   node drehmoment-kit.mjs link quiz.json --base <BASE>   -> Druck- und Import-Links
//   node drehmoment-kit.mjs qr quiz.json              -> Inhalt der QR-Codes (DMQ:…)
//   node drehmoment-kit.mjs classlink klasse.csv --base <BASE>  -> Link, der die Klassen in der App anlegt
//
// Alle erzeugten Codes bleiben dauerhaft lesbar – unabhängig davon, wo Drehmoment gehostet ist.
import { quizQrPdf, cardsPdf, reportPdf, drawLogo, posterPdf } from './lib/pdf.js'
import { parseImport, normalizeSet, parseClassCsv, displayNames, buildPrompt, extractJson } from './lib/format.js'
import { qrTexts, setLink, encodePacket, b64u, QrCollector, decodeQuery, encodeClasses, classLink, classQrTexts } from './lib/share.js'
import { loadMathRenderer } from './lib/mathpdf.js'
import { hasMath } from './lib/math.js'

export { quizQrPdf, cardsPdf, reportPdf, drawLogo, posterPdf, parseImport, normalizeSet, parseClassCsv, displayNames, buildPrompt, extractJson,
  qrTexts, setLink, encodePacket, b64u, QrCollector, decodeQuery, encodeClasses, classLink, classQrTexts, loadMathRenderer }
export const KIT_VERSION = __APP_VERSION__

/** Quiz (JSON-Text oder Objekt in beliebigem unterstütztem Format) -> erstes Quiz, normalisiert */
export function readQuiz(input) {
  const p = parseImport(input)
  if (!p.sets.length) throw new Error('Kein Quiz gefunden.')
  return { set: p.sets[0], warnings: p.warnings }
}

/** A4-PDF mit Quiz-QR-Code(s) als Uint8Array. Optionen wie quizQrPdf (mode, start, maxBytes, base) */
export async function quizPdfBytes(input, opts = {}) {
  const { set } = readQuiz(input)
  const needs = [set.title, set.description, ...set.questions.map((q) => q.text)].some(hasMath)
  const math = needs ? await loadMathRenderer().catch(() => null) : null
  return new Uint8Array(quizQrPdf(set, { ...opts, math }).output('arraybuffer'))
}

/** Links für die Lehrkraft: Druckseite (fertiges Blatt) und Direkt-Import */
export function quizLinks(input, base, { start = true } = {}) {
  const { set } = readQuiz(input)
  const b = b64u(encodePacket(set))
  const root = base.replace(/#.*$/, '')
  return {
    print: `${root}#/print?b=${b}${start ? '' : '&start=0'}`,
    import: `${root}#/import?b=${b}${start ? '&start=1' : ''}`,
  }
}

// ------------------------------------------------------------------ Kommandozeile
async function cli(argv) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const [cmd, src, ...rest] = argv
  const flag = (n) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] ?? true : undefined }
  const out = rest.find((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && rest[i - 1] !== '--backs' && rest[i - 1] !== '--link' && rest[i - 1] !== '--full-name'))
  const read = (f) => fs.readFileSync(f === '-' ? 0 : f, 'utf8')
  const write = (file, bytes) => { fs.writeFileSync(file, bytes); console.log('✓ ' + path.resolve(file)) }
  if (cmd === 'quiz' && src) {
    const file = out || src.replace(/\.[^.]+$/, '') + '.pdf'
    write(file, await quizPdfBytes(read(src), { mode: flag('link') ? 'link' : 'content', maxBytes: +(flag('size') || 500), start: !flag('no-start'), base: flag('base') }))
  } else if (cmd === 'cards' && src) {
    let cards
    if (/^\d+-\d+$/.test(src)) { const [a, b] = src.split('-').map(Number); cards = Array.from({ length: b - a + 1 }, (_, i) => ({ card: a + i, name: '' })) }
    else {
      const c = parseClassCsv(read(src)).classes, only = flag('class')
      const list = only ? c.filter((x) => x.name === only) : c
      cards = list.flatMap((cl) => displayNames(cl.students, !!flag('full-name')).map((name, i) => ({ card: i + 1, name: `${name} (${cl.name})` })))
    }
    write(out || 'karten.pdf', new Uint8Array(cardsPdf(cards, +(flag('per-page') || 1), { backs: !!flag('backs') }).output('arraybuffer')))
  } else if (cmd === 'link' && src) {
    const base = flag('base')
    if (!base || base === true) throw new Error('--base <Adresse der Drehmoment-App> fehlt')
    const l = quizLinks(read(src), base, { start: !flag('no-start') })
    console.log(`Druckseite: ${l.print}\nImport:     ${l.import}`)
  } else if (cmd === 'classlink' && src) {
    const base = flag('base')
    if (!base || base === true) throw new Error('--base <Adresse der Drehmoment-App> fehlt')
    const text = read(src)
    const classes = /^\s*[{[]/.test(text)
      ? parseImport(text).classes
      : parseClassCsv(text).classes.map((c) => ({ name: c.name, students: displayNames(c.students, !!flag('full-name')).map((name) => ({ name })) }))
    console.log(classLink(classes, { base: base.replace(/#.*$/, '') }))
  } else if (cmd === 'qr' && src) {
    console.log(qrTexts(readQuiz(read(src)).set, { maxBytes: +(flag('size') || 500) }).texts.join('\n'))
  } else if (cmd === 'prompt') {
    console.log(buildPrompt({ topic: src || '', subject: '', grade: '', count: 8, types: { mc: true, tf: true, poll: false }, optionCount: 4, difficulty: 'gemischt', language: 'Deutsch', explanations: true, material: true, shuffle: false, showCorrect: true, source: '', extra: '' }))
  } else {
    console.log(`Drehmoment-Werkzeugkasten ${KIT_VERSION}

  quiz  <quiz.json> [out.pdf] [--size 300|500|2000] [--no-start] [--link --base <URL>]
        A4-Blatt mit Quiz-QR-Code(s); Standard: nur Inhalt (ohne Web-Adresse, dauerhaft gültig)
  cards <von-bis | klasse.csv> [out.pdf] [--per-page 1|2|6] [--backs] [--class 7b] [--full-name]
        Antwortkarten (quadratisch zuschneiden)
  link  <quiz.json> --base <URL> [--no-start]
        Links zur Druckseite und zum Direkt-Import
  classlink <klasse.csv | klassen.json> --base <URL> [--full-name]
        Link, der Klassen anlegt (Standard „Vorname N.“)
  qr    <quiz.json> [--size …]     Inhalt der QR-Codes
  prompt [Thema]                    KI-Prompt für das Quiz-Format
  Quiz-Format: siehe <BASE>llms.txt`)
  }
}

if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  cli(process.argv.slice(2)).catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
}
