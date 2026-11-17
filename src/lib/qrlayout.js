// Planung der Quiz-QR-Blätter (A4): wie viele Codes, wie groß, wie viele Seiten?
// Schnell (ohne die Codes wirklich zu erzeugen) – damit lässt sich beim Verkleinern von Bildern
// oft prüfen, ob das Quiz noch auf zwei Blätter passt.
import { qrTexts, setLink } from './share.js'

// Kapazität je QR-Version 1–40 bei Fehlerkorrektur L (ISO 18004)
export const QR_ALNUM_L = [25, 47, 77, 114, 154, 195, 224, 279, 335, 395, 468, 535, 619, 667, 758, 854, 938, 1046, 1153, 1249,
  1352, 1460, 1588, 1704, 1853, 1990, 2132, 2223, 2369, 2520, 2677, 2840, 3009, 3183, 3351, 3537, 3729, 3927, 4087, 4296]
export const QR_BYTE_L = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953]

/** Modulzahl (Kantenlänge) des kleinsten passenden QR-Codes, 0 = zu lang */
export function qrModuleCount(text, alnum) {
  const len = alnum ? text.length : new TextEncoder().encode(text).length
  const v = (alnum ? QR_ALNUM_L : QR_BYTE_L).findIndex((c) => c >= len) + 1
  return v ? 17 + 4 * v : 0
}

export const PAGE = { W: 210, H: 297, M: 14, gap: 8, label: 7, top2: 30, bottom: 281 }
export const MIN_MOD = 0.45 // mm je Modul – darunter wird es für Handykameras knapp
export const HARD_MIN_MOD = 0.4 // noch kleiner wird nicht gedruckt (lieber mehr Seiten)

/**
 * Bestes Raster für gegebene Codes.
 * Bis maxPages ≤ 2 wie bisher (größte Module, eine Seite bevorzugt); bei mehr Seiten: möglichst wenige Seiten
 * mit gut lesbaren Modulen.
 */
export function layoutCodes(mods, firstTop, { maxPages = 2, labels = mods.length > 1, minMod = 0 } = {}) {
  const { W, M, gap, top2, bottom } = PAGE
  const lab = labels ? PAGE.label : 0
  const maxMods = Math.max(...mods)
  let best = null, bestMulti = null
  for (let cols = 1; cols <= 4; cols++) {
    const cell = Math.min(105, (W - 2 * M - (cols - 1) * gap) / cols)
    const rowH = cell + lab + gap
    const r1 = Math.max(0, Math.floor((bottom - firstTop + gap) / rowH))
    const r2 = Math.floor((bottom - top2 + gap) / rowH)
    if (!r2) continue
    const n = mods.length
    const pages = n <= cols * r1 ? 1 : 1 + Math.ceil((n - cols * r1) / (cols * r2))
    const mod = cell / (maxMods + 8)
    const lay = { cols, cell, r1, r2, pages, mod, lab }
    if (mod < minMod) continue
    if (pages <= 2) {
      lay.score = mod * (pages === 1 ? 1.3 : r1 === 0 ? 0.8 : 1) // eine Seite bevorzugen, leere Vorderseite vermeiden
      if (!best || lay.score > best.score) best = lay
    } else if (mod >= 0.55 && (!bestMulti || pages < bestMulti.pages || (pages === bestMulti.pages && mod > bestMulti.mod))) bestMulti = lay
  }
  if (best && (maxPages <= 2 || best.mod >= MIN_MOD)) return best.pages <= maxPages ? best : null
  return bestMulti && bestMulti.pages <= maxPages ? bestMulti : best && best.pages <= maxPages ? best : null
}

// bis 2 Seiten: Punktzahl wie bisher; darüber: weniger Seiten, dann größere Module
const better = (a, b) => (a.pages <= 2 && b.pages <= 2 ? a.score > b.score : a.pages !== b.pages ? a.pages < b.pages : a.mod > b.mod)

/** Ungefähre Oberkante der Codes auf Seite 1 (unter Kopf + Inhaltsübersicht), wie in quizQrPdf */
export function estimateFirstTop(set) {
  const n = set.questions.filter((q) => q.text.trim()).length
  const items = (set.description ? 1 : 0) + (n > 14 ? 12 : n) + (set.material ? 1 : 0)
  return 50 + 15 + items * 6.5 + 7 + 1 + 6
}

/**
 * Plant das Quiz-QR-Blatt.
 * @returns {{texts:string[], alnum:boolean, lay:object|null, pages:number, mod:number, bytes:number}}
 *   lay = null -> passt nicht in maxPages
 */
export function planQuizQr(set, { mode = 'content', start = true, maxBytes = 500, base, maxPages = 2, firstTop = estimateFirstTop(set), minMod = HARD_MIN_MOD } = {}) {
  if (maxPages > 2) { // zuerst: passt es gut lesbar auf 2 Seiten? (sonst gewänne ein frühes Mehrseiten-Layout)
    const two = planQuizQr(set, { mode, start, maxBytes, base, maxPages: 2, firstTop, minMod: Math.max(minMod, MIN_MOD) })
    if (two.lay) return two
  }
  const candidates = mode === 'link' ? [null] : [...new Set([maxBytes, 500, 700, 1000, 1500, 2300])].filter((b) => b >= maxBytes)
  let best = null
  for (const mb of candidates) {
    const r = mode === 'link' ? { texts: [setLink(set, { start, ...(base ? { base } : {}) }).url], bytes: 0 } : qrTexts(set, { maxBytes: mb, autostart: start })
    const mods = r.texts.map((t) => qrModuleCount(t, mode !== 'link'))
    if (mods.some((m) => !m)) continue
    const lay = layoutCodes(mods, firstTop, { maxPages, minMod })
    if (lay && (!best || better(lay, best.lay))) best = { texts: r.texts, bytes: r.bytes, lay }
    if (best && best.lay.mod >= 0.55) break // gut lesbar -> kleinste Aufteilung behalten
  }
  if (!best) {
    // Wie viele Seiten bräuchte es? (für die Warnung)
    const r = mode === 'link' ? null : qrTexts(set, { maxBytes: 700, autostart: start })
    const need = r ? layoutCodes(r.texts.map((t) => qrModuleCount(t, true)), firstTop, { maxPages: 999, minMod }) : null
    return { texts: r?.texts || [], alnum: mode !== 'link', lay: null, pages: need?.pages || 0, mod: 0, bytes: r?.bytes || 0 }
  }
  return { texts: best.texts, alnum: mode !== 'link', lay: best.lay, pages: best.lay.pages, mod: best.lay.mod, bytes: best.bytes }
}
