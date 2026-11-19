// QR-Inhalt der Antwortkarten – alle Formate, die je gedruckt wurden, bleiben FÜR IMMER lesbar.
//
//   DM:<n>          Nummernkarte, QR aufrecht (bis 0.4, Byte-Modus)            – EINGEFROREN
//   DM-<ID>         feste Schüler-Karte, QR aufrecht (seit 0.3, alphanumerisch) – EINGEFROREN
//   DM<s><n|ID>     seit 0.5: QR um r·90° IM UHRZEIGERSINN gegen die Karte gedreht gedruckt
//                   s = '+' (r=1) · '.' (r=2) · '/' (r=3); r=0 schreibt weiter das alte Format.
//
// Warum gedreht? Bei aufrechtem QR verrät die Lage der drei Suchmuster jedem, der das Muster kennt,
// welche Antwort oben ist. Mit gedrucktem Versatz r hat jede Karte ihre eigene Zuordnung – abschauen
// bringt nichts. Die Buchstaben bleiben fest an ihrer Kante (A oben, B rechts, C unten, D links).
// r ist pseudozufällig, aber fest pro Karte (Nachdruck = gleiche Karte, Vorschau = Druck).
// Alle Varianten passen in QR-Version 1 / Fehlerkorrektur H (≤ 10 Zeichen alphanumerisch).
import { GID_PREFIX } from './gid.js'

export const CARD_PREFIX = 'DM:'
export const CARD_RE = /^DM:(\d{1,3})$/
export const ROT_SEP = ['', '+', '.', '/'] // Index = r
export const ROT_RE = /^DM([+./])(\d{1,3}|[0-9A-HJKMNP-TV-Z]{7})$/

/** Fester Dreh-Versatz (0–3) einer Karte: FNV-1a über die Kennung – EINGEFROREN (test/compat.test.mjs) */
export function cardRotation(id) {
  const s = 'drehmoment-rot|' + (typeof id === 'string' ? id : 'n' + id)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return (h >>> 7) & 3
}

/**
 * QR-Text einer Karte. id = Kartennummer oder Schüler-ID (7 Zeichen). rot = Versatz (Standard: fest pro Karte).
 * @returns {{text:string, mode:'Byte'|'Alphanumeric', rot:number}}
 */
export function cardCode(id, rot = cardRotation(id)) {
  rot = ((rot % 4) + 4) % 4
  if (rot === 0) return typeof id === 'string' ? { text: GID_PREFIX + id, mode: 'Alphanumeric', rot } : { text: CARD_PREFIX + id, mode: 'Byte', rot }
  return { text: 'DM' + ROT_SEP[rot] + id, mode: 'Alphanumeric', rot }
}

/** QR-Text -> {card, gid, rot} oder null */
export function parseCardCode(text) {
  let m = CARD_RE.exec(text)
  if (m) return { card: +m[1], gid: null, rot: 0 }
  m = /^DM-([0-9A-HJKMNP-TV-Z]{7})$/.exec(text)
  if (m) return { card: null, gid: m[1], rot: 0 }
  m = ROT_RE.exec(text)
  if (m) {
    const rot = ROT_SEP.indexOf(m[1])
    return m[2].length === 7 ? { card: null, gid: m[2], rot } : { card: +m[2], gid: null, rot }
  }
  return null
}
