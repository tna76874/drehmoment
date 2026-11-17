// Entscheidet, welche gelesenen Karten als Antwort zählen (ohne DOM, testbar: test/scanlogic.test.mjs).
//
// Schutz gegen Bilddrehung (v. a. iPad/iOS: Auto-Rotation, Stage Manager, gedrehte Kamerabilder):
//   Dreht sich das Kamerabild um 90°/180°, verschieben sich ALLE gelesenen Buchstaben um denselben Schritt.
//   1. Dreh-Ereignis (Format/Orientierung ändert sich): kurz Pause, dann QUARANTÄNE – nichts wird erfasst,
//      bis schon erfasste Karten zeigen, ob und wie das Bild gedreht ist (oder nach CHECK_MS mit Hinweis).
//   2. Auch ohne Ereignis: zeigen ≥2 schon erfasste Karten in zwei Bildern nacheinander alle denselben
//      Versatz (≠ 0), ist das eine Bilddrehung, kein Antwortwechsel -> Bezug „oben“ nachführen.
//   3. Manuell: „Oben“ dreht den Bezug in 90°-Schritten.
// Schutz gegen versehentliche Wechsel (Kind nimmt die Karte herunter und dreht sie dabei):
//   - nach dem Erfassen ist eine Karte LOCK_MS gesperrt
//   - ein Wechsel braucht CHANGE_READS gleiche Lesungen über mindestens CHANGE_MS
export const LOCK_MS = 2000
export const CHANGE_READS = 3
export const CHANGE_MS = 600
export const PAUSE_MS = 800
export const CHECK_MS = 3000
const L = 'ABCD'
const idx = (l) => L.indexOf(l)

export class AnswerTracker {
  constructor() {
    this.rotOffset = 0 // Korrektur in Buchstaben-Schritten
    this.pauseUntil = 0
    this.checkSince = null // Quarantäne seit (null = keine)
    this.hint = false // Ausrichtung unklar -> Hinweis anzeigen
    this.shiftCandidate = null
    this.pending = new Map() // card -> {letter, n, t0}
    this.lockedUntil = new Map() // card -> Zeitpunkt
    this.seen = new Map() // card -> {letter, t}  (zuletzt gelesen, korrigiert)
  }
  fix(letter) { return letter ? L[(idx(letter) + this.rotOffset) % 4] : letter }
  /** neue Frage */
  reset() { this.pending.clear(); this.lockedUntil.clear(); this.seen.clear(); this.shiftCandidate = null }
  /** Format-/Orientierungswechsel des Kamerabilds */
  /** prior: erwarteter Versatz (z. B. aus dem Bildschirmwinkel) – wird sofort angewandt, an Karten geprüft */
  imageChanged(now, prior = 0) {
    this.rotOffset = (this.rotOffset + prior) % 4
    this.pauseUntil = now + PAUSE_MS
    this.checkSince = now
    this.pending.clear(); this.shiftCandidate = null
  }
  rotateManually() { this.rotOffset = (this.rotOffset + 1) % 4; this.pending.clear(); this.checkSince = null; this.hint = false; this.shiftCandidate = null }

  /**
   * @param {{card:any, answer:string|null}[]} raw  Ergebnis der Erkennung (unkorrigiert)
   * @param {{responses:Object, known:(card)=>boolean, grow?:boolean, optionCount?:number}} ctx
   * @returns {{cards:object[], emit:[any,string][], status:'paused'|'checking'|'ok', corrected:number}}
   *   cards: korrigiert (für die Anzeige) · emit: neue/geänderte Antworten · corrected: angewandter Versatz (0 = keiner)
   */
  process(raw, now, { responses, known, grow = false, optionCount = 4 }) {
    if (now < this.pauseUntil) return { cards: [], emit: [], status: 'paused', corrected: 0 }
    let cards = raw.map((c) => ({ ...c, answer: this.fix(c.answer) }))
    // Versatz gegenüber Referenz: erfasste Antworten dieser Frage, sonst kürzlich gelesene Karte
    const deltas = []
    for (const c of cards) {
      if (!c.answer) continue
      const ref = responses[c.card] || (this.checkSince !== null && this.seen.get(c.card)?.t > now - 15000 ? this.seen.get(c.card).letter : null)
      if (ref) deltas.push((idx(c.answer) - idx(ref) + 4) % 4)
    }
    const same = deltas.length && deltas.every((d) => d === deltas[0]) ? deltas[0] : -1
    let corrected = 0
    if (same > 0 && (deltas.length >= 2 || (this.checkSince !== null && deltas.length === 1))) {
      // Bilddrehung erst beim zweiten Bild in Folge übernehmen (ein Fehlbild soll nichts verstellen)
      if (this.shiftCandidate === same) {
        this.rotOffset = (this.rotOffset - same + 4) % 4
        corrected = same
        this.shiftCandidate = null; this.pending.clear(); this.checkSince = null; this.hint = false
        cards = raw.map((c) => ({ ...c, answer: this.fix(c.answer) }))
      } else {
        this.shiftCandidate = same
        return { cards, emit: [], status: 'checking', corrected: 0 }
      }
    } else this.shiftCandidate = null
    if (this.checkSince !== null) {
      if (same === 0) { this.checkSince = null; this.hint = false } // Referenzkarten unverändert -> alles gut
      else if (now - this.checkSince > CHECK_MS) { this.checkSince = null; this.hint = true } // keine Referenz sichtbar -> weiter, aber Hinweis
      else return { cards, emit: [], status: 'checking', corrected: 0 }
    }
    for (const c of cards) if (c.answer) this.seen.set(c.card, { letter: c.answer, t: now })

    const emit = []
    for (const c of cards) {
      const isKnown = known(c.card)
      if (!c.answer || (!isKnown && !(grow && typeof c.card === 'number'))) continue
      if (idx(c.answer) >= optionCount) continue // z. B. „C“ bei Wahr/Falsch
      const cur = responses[c.card]
      if (cur === c.answer) { this.pending.delete(c.card); continue }
      if ((this.lockedUntil.get(c.card) || 0) > now) continue // gerade erfasst -> Karte wird vermutlich heruntergenommen
      const p = this.pending.get(c.card)
      const need = cur ? CHANGE_READS : isKnown ? 1 : 2 // neue unbekannte Karte: 2 Lesungen (gegen Fehllesungen)
      if (p && p.letter === c.answer) p.n++
      else this.pending.set(c.card, { letter: c.answer, n: 1, t0: now })
      const q = this.pending.get(c.card)
      if (q.n >= need && (!cur || now - q.t0 >= CHANGE_MS)) {
        this.pending.delete(c.card)
        this.lockedUntil.set(c.card, now + LOCK_MS)
        emit.push([c.card, c.answer])
      }
    }
    return { cards, emit, status: 'ok', corrected }
  }
}
