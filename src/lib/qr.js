import qrcode from 'qrcode-generator'
import { cardCode, cardRotation } from './cardcode.js'

/**
 * Modul-Matrix des QR-Codes (true = schwarz), so wie er GELESEN wird. Version 1, Fehlerkorrektur H.
 * @param {number|string} n  Kartennummer oder Schüler-ID (7 Zeichen)
 * @param {number} rot  Dreh-Versatz im QR-Inhalt (0 = alte Formate „DM:n“/„DM-ID“, NIE ändern)
 */
export function cardMatrix(n, rot = 0) {
  const { text, mode } = cardCode(n, rot)
  const qr = qrcode(1, 'H')
  qr.addData(text, mode)
  qr.make()
  const size = qr.getModuleCount()
  const m = []
  for (let r = 0; r < size; r++) {
    const row = []
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c))
    m.push(row)
  }
  return m
}

/** Matrix um k·90° im Uhrzeigersinn drehen */
export function rotateCW(m, k = 1) {
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) { const n = m.length; m = m.map((_, r) => m.map((__, c) => m[n - 1 - c][r])) }
  return m
}

/** Matrix, wie sie auf der Karte GEDRUCKT wird (A oben): QR um rot·90° im Uhrzeigersinn gedreht */
export function cardFace(n, rot = cardRotation(n)) {
  return { m: rotateCW(cardMatrix(n, rot), rot), rot }
}

/** SVG-Pfad der gedruckten Karte (viewBox = size x size) */
export function cardPath(n, rot) {
  const { m } = cardFace(n, rot)
  let d = ''
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z` }))
  return { d, size: m.length }
}
