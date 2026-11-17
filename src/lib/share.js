// Quiz als QR-Code / Link teilen.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │ KOMPATIBILITÄT: Jeder je erzeugte Code muss für immer lesbar bleiben.          │
// │ Formate und Codecs werden NUR ERGÄNZT, nie geändert oder entfernt.             │
// │ Golden-Fixtures in test/compat.test.mjs sichern das ab.                       │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Text-Formate (QR-Inhalt):
//   T1  …#/import?z=<base64url(deflate-raw(JSON))>      Link, seit 0.1 (beliebiger Host)
//   L2  …#/import?b=<base64url(PAKET)>                    Link, seit 0.2 (beliebiger Host)
//   Q2  DMQ:<base45(PAKET)>.                              nur Inhalt, ohne Adresse (QR alphanumerisch)
//   Q2m DMQ<i>/<n>/<gruppe>:<base45(TEIL)>.               mehrteilig; Teile 1..n aneinander = PAKET
//   Der Punkt am Ende schützt Leerzeichen am Ende des Base45-Texts vor „trim“.
//
// PAKET = [Codec-Byte][Nutzdaten]
//   Codec 1: deflate-raw, Level 9, Wörterbuch DICT1 (dict1.js), Inhalt = UTF-8-JSON „compact v1“
//
// JSON „compact v1“ (Quiz):   { v:1, t, d?, s?, g?, m?, o:[showCorrect, shuffle], q:[[type, text, options|0, correctIdx[], explanation?, bilder?]] }
//   bilder (seit 0.4) optional: { i: Bild zur Frage, o: [Bild je Antwort | 0] } – Aufbau siehe media.js; explanation ist dann ggf. ""
// JSON „compact v1“ (Klassen, seit 0.2): { v:1, k:[[klassenname, [name, …], kartennummern?, schuelerIds?]] }
//   kartennummern optional; ohne sie bekommen die Namen der Reihe nach die Karten 1, 2, 3 …
//   schuelerIds (seit 0.3) optional: feste Schüler-IDs (gid, siehe gid.js), 0 = keine; kartennummern sind dann immer dabei.
//   options 0 = ["Wahr","Falsch"]. a:1 = direkt starten (seit 0.2). Unbekannte Felder werden beim Lesen ignoriert.
import { deflateSync, inflateSync } from 'fflate'
import { DICT1 } from './dict1.js'
import { normalizeGid } from './gid.js'
import { packQuestionMedia, unpackQuestionMedia } from './media.js'

const utf8 = new TextEncoder()
const DICTS = { 1: utf8.encode(DICT1) }
export const CODEC = 1 // Codec für NEUE Codes
export const QR_PREFIX = 'DMQ'

// ------------------------------------------------------------------ Base64url
export const b64u = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const unb64u = (s) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  return Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), (c) => c.charCodeAt(0))
}

// ------------------------------------------------------------------ Base45 (RFC 9285)
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
export function b45(bytes) {
  let out = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1]
    out += B45[n % 45] + B45[((n / 45) | 0) % 45] + B45[(n / 2025) | 0]
  }
  if (bytes.length % 2) { const n = bytes[bytes.length - 1]; out += B45[n % 45] + B45[(n / 45) | 0] }
  return out
}
export function unb45(s) {
  const v = [...s].map((c) => { const i = B45.indexOf(c); if (i < 0) throw new Error('Ungültiges Zeichen im Code'); return i })
  if (v.length % 3 === 1) throw new Error('Code unvollständig')
  const out = []
  for (let i = 0; i < v.length; i += 3) {
    if (i + 2 < v.length) { const n = v[i] + v[i + 1] * 45 + v[i + 2] * 2025; out.push(n >> 8, n & 255) }
    else out.push(v[i] + v[i + 1] * 45)
  }
  return Uint8Array.from(out)
}

// ------------------------------------------------------------------ compact v1
export function compact(set, { explanations = true, material = true, autostart = false, media = true } = {}) {
  const c = {
    v: 1, t: set.title,
    o: [set.settings?.showCorrect !== false ? 1 : 0, set.settings?.shuffle ? 1 : 0],
    q: set.questions.filter((q) => q.text.trim()).map((q) => {
      const row = [q.type, q.text, q.type === 'tf' ? 0 : q.options, q.correct]
      if (explanations && q.explanation) row.push(q.explanation)
      const md = media && packQuestionMedia(q)
      if (md) { while (row.length < 5) row.push(''); row.push(md) } // seit 0.4: Bilder an Stelle 5
      return row
    }),
  }
  if (set.description) c.d = set.description
  if (set.subject) c.s = set.subject
  if (set.grade) c.g = set.grade
  if (material && set.material) c.m = set.material
  if (autostart) c.a = 1 // seit 0.2: nach dem Scannen direkt starten (ältere Leser ignorieren das Feld)
  return c
}

/** Liest compact v1 – tolerant gegenüber fehlenden/zusätzlichen Feldern (auch künftige Versionen) */
export function expand(c) {
  if (!c || !Array.isArray(c.q)) throw new Error('Keine Fragen im Code.')
  return {
    app: 'drehmoment', title: c.t || 'Quiz', description: c.d || '', subject: c.s || '', grade: c.g || '', material: c.m || '',
    settings: { showCorrect: c.o?.[0] !== 0, shuffle: !!c.o?.[1] },
    autostart: !!c.a,
    questions: c.q.map(([type, text, options, correct, explanation, media]) => ({
      type, text, options: options === 0 || options == null ? ['Wahr', 'Falsch'] : options,
      correct: Array.isArray(correct) ? correct : correct == null ? [] : [correct], explanation: explanation || '',
      ...unpackQuestionMedia(media),
    })),
  }
}

// ------------------------------------------------------------------ Paket
export function encodePacket(set, opts) { return packJson(compact(set, opts)) }

function packJson(obj) {
  const json = utf8.encode(JSON.stringify(obj))
  const body = deflateSync(json, { level: 9, mem: 12, dictionary: DICTS[CODEC] })
  const out = new Uint8Array(body.length + 1)
  out[0] = CODEC; out.set(body, 1)
  return out
}

/** Paket -> rohes JSON (Quiz oder Klassen) */
export function unpackJson(bytes) {
  const codec = bytes[0]
  let json
  if (codec === 1) json = inflateSync(bytes.subarray(1), { dictionary: DICTS[1] })
  else throw new Error(`Dieser Code stammt aus einer neueren Drehmoment-Version (Codec ${codec}). Bitte App aktualisieren.`)
  return JSON.parse(new TextDecoder().decode(json))
}
export const decodePacket = (bytes) => expand(unpackJson(bytes))

// ------------------------------------------------------------------ Klassen
/** @param {{name:string, students:{name:string, card?:number}[]}[]} classes */
export function encodeClasses(classes) {
  return packJson({
    v: 1,
    k: classes.map((c) => {
      const st = c.students.filter((s) => String(s.name || '').trim())
      const cards = st.map((s, i) => s.card ?? i + 1)
      const row = [c.name, st.map((s) => String(s.name).trim())]
      const gids = st.map((s) => normalizeGid(s.gid) || 0)
      if (cards.some((n, i) => n !== i + 1) || gids.some(Boolean)) row.push(cards)
      if (gids.some(Boolean)) row.push(gids)
      return row
    }),
  })
}
export function expandClasses(c) {
  return c.k.map(([name, names, cards, gids]) => ({
    name: String(name || 'Klasse'),
    students: (names || []).map((n, i) => {
      const gid = Array.isArray(gids) ? normalizeGid(gids[i]) : null
      return { name: String(n), card: (Array.isArray(cards) && cards[i]) || i + 1, ...(gid ? { gid } : {}) }
    }),
  }))
}
/** Paket -> {kind:'set', set} | {kind:'classes', classes} */
export function decodeAnyPacket(bytes) {
  const raw = unpackJson(bytes)
  return Array.isArray(raw.k) ? { kind: 'classes', classes: expandClasses(raw) } : { kind: 'set', set: expand(raw) }
}

/** Format T1 (seit 0.1): deflate-raw ohne Wörterbuch, base64url – bleibt für externe Tools/Agenten erzeugbar */
export async function encodeSet(set, opts) { return b64u(deflateSync(utf8.encode(JSON.stringify(compact(set, opts))), { level: 9 })) }
export async function decodeSet(z) { return decodeLegacyZ(z) }
export const decodeLegacyZ = (z) => expand(JSON.parse(new TextDecoder().decode(inflateSync(unb64u(z)))))

// ------------------------------------------------------------------ QR-Texte (ohne Adresse)
const groupId = (bytes) => {
  let h = 2166136261
  for (const b of bytes) h = Math.imul(h ^ b, 16777619)
  return B45[(h >>> 0) % 36] + B45[((h >>> 8) >>> 0) % 36] // nur 0-9A-Z
}

/**
 * Ein oder mehrere QR-Texte. Ab `maxBytes` je Code wird aufgeteilt – so bleibt jeder Code
 * klein und gut lesbar, egal wie groß das Quiz ist.
 */
export function qrTexts(set, { maxBytes = 700, ...opts } = {}) { return splitPacket(encodePacket(set, opts), maxBytes) }

function splitPacket(p, maxBytes) {
  if (p.length <= maxBytes) return { texts: [`${QR_PREFIX}:${b45(p)}.`], bytes: p.length }
  const n = Math.ceil(p.length / maxBytes), size = Math.ceil(p.length / n), g = groupId(p)
  const texts = Array.from({ length: n }, (_, i) => `${QR_PREFIX}${i + 1}/${n}/${g}:${b45(p.subarray(i * size, (i + 1) * size))}.`)
  return { texts, bytes: p.length }
}

const Q_RE = /^DMQ(?:(\d+)\/(\d+)\/([0-9A-Z]+))?:([0-9A-Z $%*+\-./:]*)$/

/** Sammelt (ggf. mehrteilige) QR-Codes, bis ein Quiz vollständig ist. */
export class QrCollector {
  constructor() { this.group = null; this.parts = [] }
  /** @returns {null | {set?:object, have:number, total:number}} – null = kein Drehmoment-Quizcode */
  add(raw) {
    const m = Q_RE.exec(String(raw).replace(/^\s+/, '').replace(/[\r\n]+$/, ''))
    if (!m) return null
    const payload = m[4].endsWith('.') ? m[4].slice(0, -1) : m[4]
    if (!m[1]) { const packet = unb45(payload); return { ...decodeAnyPacket(packet), packet, have: 1, total: 1 } }
    const i = +m[1], n = +m[2], g = m[3] + '/' + n
    if (this.group !== g) { this.group = g; this.parts = new Array(n).fill(null) }
    this.parts[i - 1] = unb45(payload)
    const have = this.parts.filter(Boolean).length
    if (have < n) return { have, total: n }
    const all = new Uint8Array(this.parts.reduce((a, p) => a + p.length, 0))
    let o = 0
    for (const p of this.parts) { all.set(p, o); o += p.length }
    return { ...decodeAnyPacket(all), packet: all, have, total: n }
  }
}

// ------------------------------------------------------------------ Links (mit Adresse)
export const appBase = () => (typeof location !== 'undefined' ? location.href.split('#')[0].split('?')[0] : '')

/** Link (Format L2). Handykamera öffnet direkt die App – hängt aber an der Adresse dieser Seite. */
export function setLink(set, { start = true, max = 2300, base = appBase() } = {}) {
  const tail = start ? '&start=1' : ''
  const steps = [[{}, null], [{ material: false }, 'material'], [{ material: false, explanations: false }, 'both'], [{ material: false, explanations: false, media: false }, 'media']]
  for (const [opts, trimmed] of steps) {
    const url = `${base}#/import?b=${b64u(encodePacket(set, opts))}${tail}`
    if (url.length <= max || trimmed === 'media') return { url, trimmed, tooLong: url.length > max }
  }
}

/**
 * Erkennt jeden Drehmoment-Text (QR-Inhalt, eingefügter Link …) unabhängig vom Host.
 * @returns {null | {query:object}} – Parameter für #/import
 */
export function importQueryFrom(text) {
  const t = String(text).trim()
  const i = t.indexOf('#/import?')
  if (i >= 0) return { query: Object.fromEntries(new URLSearchParams(t.slice(i + 9))) }
  if (/^https?:\/\/\S+\.json(\?|$)/i.test(t)) return { query: { url: t } }
  return null
}

/** Klassen-QR / -Link (Q2 bzw. b=) */
export function classQrTexts(classes, { maxBytes = 700 } = {}) { return splitPacket(encodeClasses(classes), maxBytes) }

/** Quiz aus den Import-Parametern (b, z, q) – sonst null (Klassen-Pakete: siehe resolveImport) */
export function decodeQuery(query) {
  if (query.b) { const r = decodeAnyPacket(unb64u(query.b)); return r.kind === 'set' ? r.set : null }
  if (query.z) return decodeLegacyZ(query.z)
  if (query.q) { const r = new QrCollector().add(query.q); if (r?.set) return r.set }
  return null
}

/**
 * Liest ein Quiz aus Import-/Druck-Parametern: b, z, q (QR) · d (base64url-JSON) · json · url.
 * @returns {Promise<{parsed: object, source: string, set?: object}>}
 */
export async function resolveImport(query, parseImport) {
  if (query.b) {
    const r = decodeAnyPacket(unb64u(query.b))
    if (r.kind === 'classes') return { parsed: { kind: 'classes', sets: [], classes: r.classes, sessions: [], warnings: [] }, source: 'Link' }
  }
  const set = decodeQuery(query)
  if (set) return { parsed: parseImport(set), source: 'QR-Code', set }
  let text
  if (query.d) text = new TextDecoder().decode(unb64u(query.d))
  else if (query.json) text = query.json
  else if (query.url) {
    const r = await fetch(query.url, { cache: 'no-store' })
    if (!r.ok) throw new Error(`Laden fehlgeschlagen (HTTP ${r.status})`)
    text = await r.text()
  } else throw new Error('Der Link enthält keine Daten (?d=, ?json=, ?url=, ?b= oder ?z=).')
  return { parsed: parseImport(text), source: query.url || 'Link' }
}

/** Link, der Klassen anlegt: <base>#/import?b=… */
export function classLink(classes, { base = appBase() } = {}) {
  return `${base}#/import?b=${b64u(encodeClasses(classes))}`
}

/** Stabiler Fingerabdruck – damit erneutes Scannen kein Duplikat anlegt */
export function fingerprint(set) {
  const s = JSON.stringify([set.title, set.questions.map((q) => [q.type, q.text, q.options, q.correct])])
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return 'qr' + (h >>> 0).toString(36)
}
