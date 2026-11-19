// Entscheidet, welche gelesenen Karten als Antwort zählen (ohne DOM, testbar: test/scanlogic.test.mjs).
//
// Schutz gegen Bilddrehung (v. a. iPad/iOS: Auto-Rotation, Stage Manager, gedrehte Kamerabilder):
//   Dreht sich das Kamerabild um 90°/180°, verschieben sich ALLE gelesenen Buchstaben um denselben Schritt.
//   1. Dreh-Ereignis (Format/Orientierung ändert sich): kurz Pause, dann QUARANTÄNE – nichts wird erfasst,
//      bis schon erfasste Karten zeigen, ob und wie das Bild gedreht ist (oder nach CHECK_MS mit Hinweis).
//   2. Auch ohne Ereignis: zeigen ≥2 schon erfasste Karten in zwei Bildern nacheinander alle denselben
//      Versatz (≠ 0), ist das eine Bilddrehung, kein Antwortwechsel -> Bezug „oben“ nachführen.
//   3. Manuell: „Oben“ dreht den Bezug in 90°-Schritten.
// Erfasste Antworten sind FEST (seit 0.5): Eine schon erfasste Karte ändert ihre Antwort nicht, auch wenn sie
// wieder ins Bild kommt. Nur nach allowChanges(true) („✏️ Ändern“ im Scanner) darf sich EINE Antwort ändern –
// sobald diese Änderung erfasst ist, wird automatisch wieder gesperrt (relocked im Ergebnis).
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
/** Unbekannte Karte darf die Liste erweitern: Kartennummer (QR „DM:n“ / Rasterkarte) ODER feste Schüler-Karte „DM-XXXXXXX“ */
export const canGrow = (card) => typeof card === 'number' || (typeof card === 'string' && /^DM-[0-9A-HJKMNP-TV-Z]{7}$/.test(card))

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
    this.changesAllowed = false // erfasste Antworten fest; true = genau EINE Änderung erlaubt
  }
  /** „✏️ Ändern“: eine schon erfasste Antwort darf sich (einmal) ändern. false = wieder sperren */
  allowChanges(on = true) { if (this.changesAllowed !== !!on) { this.changesAllowed = !!on; this.pending.clear() } }
  fix(letter) { return letter ? L[(idx(letter) + this.rotOffset) % 4] : letter }
  /** neue Frage */
  reset() { this.pending.clear(); this.lockedUntil.clear(); this.seen.clear(); this.shiftCandidate = null; this.changesAllowed = false }
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
   * @returns {{cards:object[], emit:[any,string][], status:'paused'|'checking'|'ok', corrected:number, relocked:boolean}}
   *   cards: korrigiert (für die Anzeige) · emit: neue/geänderte Antworten · corrected: angewandter Versatz (0 = keiner)
   *   relocked: eine Änderung wurde erfasst -> Änderungen sind wieder gesperrt
   */
  process(raw, now, { responses, known, grow = false, optionCount = 4 }) {
    if (now < this.pauseUntil) return { cards: [], emit: [], status: 'paused', corrected: 0, relocked: false }
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
        return { cards, emit: [], status: 'checking', corrected: 0, relocked: false }
      }
    } else this.shiftCandidate = null
    if (this.checkSince !== null) {
      if (same === 0) { this.checkSince = null; this.hint = false } // Referenzkarten unverändert -> alles gut
      else if (now - this.checkSince > CHECK_MS) { this.checkSince = null; this.hint = true } // keine Referenz sichtbar -> weiter, aber Hinweis
      else return { cards, emit: [], status: 'checking', corrected: 0, relocked: false }
    }
    for (const c of cards) if (c.answer) this.seen.set(c.card, { letter: c.answer, t: now })

    const emit = []
    let relocked = false
    for (const c of cards) {
      const isKnown = known(c.card)
      if (!c.answer || (!isKnown && !(grow && canGrow(c.card)))) continue
      if (idx(c.answer) >= optionCount) continue // z. B. „C“ bei Wahr/Falsch
      const cur = responses[c.card]
      if (cur === c.answer) { this.pending.delete(c.card); continue }
      if (cur && !this.changesAllowed) { this.pending.delete(c.card); continue } // erfasst = fest
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
        if (cur) { this.changesAllowed = false; relocked = true; this.pending.clear() } // genau eine Änderung, dann wieder fest
      }
    }
    return { cards, emit, status: 'ok', corrected, relocked }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bildtakt des Scanners (FRAME_PLAN): Karten aus dem letzten Bild werden an ihrer alten Stelle direkt gelesen
// (schnell, robust gegen Wackeln). Takt aus 4 Bildern:
//   0 ganzes Bild · 1 Zwischenbild (nur alte Stellen) · 2 Bildmitte 1:1 in voller Kamera-Auflösung · 3 Zwischenbild
// Ohne bekannte Karten wird statt eines Zwischenbilds das ganze Bild gesucht; den Ausschnitt gibt es nur, wenn die
// Analyse sonst deutlich verkleinert (scale < CROP_BELOW), sonst bringt er nichts.
export const LIVE_MS = 600
export const CROP_BELOW = 0.8
/** @returns {'full'|'hints'|'crop'} */
export function framePlan(step, hintCount, scale) {
  const k = ((step % 4) + 4) % 4
  if (k % 2 === 1) return hintCount > 0 ? 'hints' : 'full'
  if (k === 2 && scale < CROP_BELOW) return 'crop'
  return 'full'
}
/**
 * Ausschnitt der Bildmitte in voller Auflösung: gleiche Pixelzahl (w×h) wie das verkleinerte Analysebild.
 * map rechnet Koordinaten im Ausschnitt in Koordinaten des normalen Analysebilds um.
 */
export function cropRegion(vw, vh, w, h, s) {
  const sx = Math.round((vw - w) / 2), sy = Math.round((vh - h) / 2)
  return { sx, sy, map: { ox: sx * s, oy: sy * s, k: s } }
}
export const mapQuad = (quad, map) => quad.map((p) => ({ x: map.ox + p.x * map.k, y: map.oy + p.y * map.k }))

/** Zuletzt gesehene Karten: liefern die Hinweise für Zwischenbilder und eine flackerfreie Anzeige */
export class LiveCards {
  constructor(ms = LIVE_MS) { this.ms = ms; this.map = new Map() }
  clear() { this.map.clear() }
  update(cards, now) {
    for (const c of cards) this.map.set(c.card, { c, t: now })
    for (const [k, e] of this.map) if (now - e.t > this.ms) this.map.delete(k)
  }
  list(now) { return [...this.map.values()].filter((e) => now - e.t <= this.ms).map((e) => e.c) }
  /** Vierecke der QR-Karten (Rasterkarten liest die Suche, nicht jsQR) */
  hints(now) { return this.list(now).filter((c) => !c.gridCard && c.quad?.length === 4).map((c) => c.quad) }
}

// ---------------------------------------------------------------------------------------------------------------
// Markierung im Kamerabild: verrät NIE die Antwort. Alle gültigen Antworten sehen gleich aus (eine Farbe, kein
// Buchstabe); nur „ungültig/unbekannt“ unterscheidet sich.
export const SEEN = '#8f7aff'
/**
 * @param {{card:any, gid?:string, answer:string|null}} c  @param {{known:boolean, entry?:{name?,label?}, optionCount:number}} o
 * @returns {{valid:boolean, color:string, fill:string, label:string}}
 */
export function cardMark(c, { known, entry, optionCount }) {
  const valid = !!(known && c.answer && 'ABCD'.indexOf(c.answer) < optionCount)
  const who = entry ? (entry.label ? '' : entry.name || '#' + c.card) : known ? '#' + c.card : (c.gid ? c.card : '#' + c.card) + ' ?' // verdeckt: keine Kartennummer
  return {
    valid,
    color: valid ? SEEN : 'rgba(255,255,255,0.8)',
    fill: valid ? SEEN + '55' : 'rgba(255,255,255,0.15)',
    label: valid ? (who ? `✓ ${who}` : '✓') : who,
  }
}

/** Freude-Animation beim Erfassen: zufälliges Symbol – bekommt die Antwort absichtlich NICHT übergeben */
export const JOY = ['⭐', '🌟', '🎉', '🦄', '🚀', '🐱', '🐶', '🦊', '🐼', '🐸', '🌈', '🍀', '🦋', '🐢', '🎈', '🐳', '🦉', '🐝']
export const joy = (rand = Math.random) => JOY[Math.min(JOY.length - 1, Math.floor(rand() * JOY.length))]
