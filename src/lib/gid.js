// Feste Schüler-Karte (seit 0.3): QR-Inhalt „DM-“ + 7 Zeichen Crockford-Base32, z. B. „DM-K7Q2M9X“.
// Gleiche Person = gleiche Karte – egal welche Lehrkraft sie wann (oder für welchen Teil der Klasse) druckt.
// 10 Zeichen alphanumerisch passen genau in QR-Version 1 / Fehlerkorrektur H – gleiche Geometrie
// und Erkennung wie die Nummernkarten „DM:n“.
//
// Die ID kommt von außen (z. B. aus der Schulverwaltung). Empfohlene Ableitung aus einer stabilen Kennung:
//   gid = Crockford32( SHA-256("drehmoment|" + kennung) )[0..7]   (die ersten 35 Bit, MSB zuerst)
// FORMAT FÜR IMMER FEST – gedruckte Karten müssen dauerhaft lesbar bleiben.
export const GID_PREFIX = 'DM-'
export const GID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const GID_LEN = 7
export const GID_RE = /^DM-([0-9A-HJKMNP-TV-Z]{7})$/

/** Schüler-ID säubern (Groß-/Kleinschreibung, O->0, I/L->1, Leer-/Bindestriche, „DM-“) – ungültig -> null */
export function normalizeGid(v) {
  const s = String(v ?? '').toUpperCase().trim().replace(/^DM-/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return s.length === GID_LEN && [...s].every((c) => GID_ALPHABET.includes(c)) ? s : null
}

/** Anzeige auf der Karte, z. B. „K7Q-2M9X“ (leichter abzulesen) */
export const formatGid = (g) => (g ? g.slice(0, 3) + '-' + g.slice(3) : '')

/** Empfohlene Ableitung (async, WebCrypto/Node 24) – für Tools und Tests */
export async function gidFrom(id) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('drehmoment|' + id)))
  let bits = 0n
  for (let i = 0; i < 5; i++) bits = (bits << 8n) | BigInt(h[i]) // 40 Bit
  bits >>= 5n // die ersten 35 Bit
  let out = ''
  for (let i = GID_LEN - 1; i >= 0; i--) out = GID_ALPHABET[Number((bits >> BigInt(5 * (GID_LEN - 1 - i))) & 31n)] + out
  return out
}
