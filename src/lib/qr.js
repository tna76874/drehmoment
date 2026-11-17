import qrcode from 'qrcode-generator'
import { CARD_PREFIX } from './detect.js'
import { GID_PREFIX } from './gid.js'

/**
 * Modul-Matrix (true = schwarz). Version 1, Fehlerkorrektur H -> große, robuste Module.
 * @param {number|string} n  Kartennummer („DM:n“, Byte-Modus – NIE ändern) oder Schüler-ID („DM-XXXXXXX“, alphanumerisch)
 */
export function cardMatrix(n) {
  const qr = qrcode(1, 'H')
  if (typeof n === 'string') qr.addData(GID_PREFIX + n, 'Alphanumeric')
  else qr.addData(CARD_PREFIX + n)
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

/** SVG-Pfad (viewBox = size x size) */
export function cardPath(n) {
  const m = cardMatrix(n)
  let d = ''
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z` }))
  return { d, size: m.length }
}
