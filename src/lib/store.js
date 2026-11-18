// Zentrale Datenhaltung – alles liegt im localStorage des Geräts.
import { reactive, watch } from 'vue'
import { repairSetLatex } from './format.js'
import { canGrow } from './scanlogic.js'

// Schlüssel NIE ändern – sonst findet eine neue Version die alten Daten nicht mehr.
// Struktur-Änderungen laufen über state.version + MIGRATIONS (unten).
const KEY = 'drehmoment:v1'
export const STATE_VERSION = 2

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

function defaults() {
  return {
    version: STATE_VERSION,
    sets: [],
    classes: [],
    sessions: [],
    prefs: {
      resolution: 1280, // Kantenlänge der Analyse in px
      gridCards: true, // Rasterkarten (5×5-Muster, Nr. 1–40) mit erkennen
      vibrate: true,
      anonymousCards: 40, // Anzahl Karten ohne Klasse
      cardsPerPage: 1,
      cardBacks: false, // Rückseite mit Antwortfeldern (Duplex) – standardmäßig aus
      qrMode: 'content', // Quiz-QR: 'content' (ohne Adresse) | 'link'
      qrSize: 500, // max. Byte je Quiz-QR-Code
      ai: null, // letzte Formularwerte im KI-Modus
    },
  }
}

/**
 * Migrationen: MIGRATIONS[n] hebt einen Stand von Version n auf n+1.
 * Nur ergänzen, nie ändern/entfernen – so lässt sich jeder je gespeicherte Stand laden.
 */
export const MIGRATIONS = {
  // 1 -> 2: Karten ohne Rückseite als Standard; quadratische Karten (4/Seite -> 6/Seite);
  //         beim KI-Import zerschossene LaTeX-Befehle (\frac -> Seitenvorschub+"rac") reparieren
  1: (d) => {
    d.prefs = { ...(d.prefs || {}), cardBacks: false }
    if (d.prefs.cardsPerPage === 4) d.prefs.cardsPerPage = 6
    for (const s of d.sets || []) repairSetLatex(s)
    for (const s of d.sessions || []) repairSetLatex(s)
  },
}

/** Bringt beliebig alte (oder unvollständige) Daten auf den aktuellen Stand */
export function migrate(data) {
  const d = defaults()
  if (!data || typeof data !== 'object') return d
  let v = Number.isInteger(data.version) ? data.version : 1
  while (v < STATE_VERSION) { MIGRATIONS[v]?.(data); v++ }
  // Neuere Version (z. B. nach Downgrade): unbekannte Felder bleiben erhalten
  const out = { ...d, ...data, version: Math.max(v, STATE_VERSION), prefs: { ...d.prefs, ...(data.prefs || {}) } }
  for (const k of ['sets', 'classes', 'sessions']) if (!Array.isArray(out[k])) out[k] = []
  return out
}

function load() {
  let raw
  try { raw = localStorage.getItem(KEY) } catch { return null }
  if (!raw) return null
  try {
    return migrate(JSON.parse(raw))
  } catch {
    // Beschädigte Daten nie stillschweigend überschreiben: Kopie sichern
    try { localStorage.setItem(KEY + ':defekt:' + Date.now(), raw) } catch {}
    return null
  }
}

const initial = load()
export const state = reactive(initial || defaults())
export const firstRun = !initial

export const saveError = reactive({ message: '' })
let timer = null
function persist() {
  clearTimeout(timer)
  timer = null
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    saveError.message = ''
  } catch (e) {
    saveError.message = 'Speichern fehlgeschlagen – Speicher voll? Exportiere alte Ergebnisse und lösche sie. (' + e.name + ')'
  }
}
let syncing = false
watch(state, () => {
  if (syncing) return
  clearTimeout(timer); timer = setTimeout(persist, 250)
}, { deep: true, flush: 'sync' })

// Mehrere Tabs (z. B. Beamer-Fenster) bleiben synchron
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      const data = JSON.parse(e.newValue)
      syncing = true
      for (const k of Object.keys(data)) state[k] = data[k]
    } catch {} finally { syncing = false }
  })
}

/** Schnelles Speichern (z. B. Live-Sitzung -> Beamer soll sofort folgen) */
export const flush = () => persist()
// beim Verlassen/Wechseln sofort sichern (wichtig auf Mobilgeräten)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => timer && persist())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && timer && persist())
}

// ------------------------------------------------------------------ Helfer
export const getSet = (id) => state.sets.find((s) => s.id === id)
export const getClass = (id) => state.classes.find((c) => c.id === id)
export const getSession = (id) => state.sessions.find((s) => s.id === id)

export function newQuestion(type = 'mc') {
  return {
    id: uid(),
    type,
    text: '',
    options: type === 'tf' ? ['Wahr', 'Falsch'] : type === 'poll' ? ['', '', ''] : ['', '', '', ''],
    correct: type === 'poll' ? [] : [0],
    explanation: '',
  }
}

export function newSet(title = 'Neues Quiz') {
  const s = {
    id: uid(), title, description: '', subject: '', grade: '', material: '',
    settings: { showCorrect: true, shuffle: false },
    questions: [newQuestion()], created: Date.now(), updated: Date.now(),
  }
  state.sets.unshift(s)
  return s
}

/**
 * Liste der Karten (Nummer + Name, ggf. feste Schüler-ID) für eine Klasse.
 * Ohne Klasse (anonym) beginnt sie leer und wächst mit jeder erkannten Karte (seit 0.4, siehe addToRoster).
 */
export function rosterFor(classId) {
  const c = classId && getClass(classId)
  if (c) return c.students.filter((s) => s.name.trim()).map((s) => ({ card: s.card, name: s.name, ...(s.gid ? { gid: s.gid } : {}) }))
  return []
}

/** Unbekannte Karte in die Sitzung aufnehmen (anonym: einfach Karte n; mit Klasse: Gast) */
export function addToRoster(session, card) {
  if (!canGrow(card) || session.roster.some((s) => s.card === card)) return false
  const gid = typeof card === 'string' ? card.slice(3) : null // feste Schüler-Karte „DM-XXXXXXX“
  session.roster.push({ card, name: '', ...(gid ? { gid } : {}), ...(session.classId ? { guest: true } : {}) })
  session.roster.sort(byCard)
  return true
}
/** Sortierung: Kartennummern aufsteigend, danach feste Schüler-Karten (Text) */
export const byCard = (a, b) => (typeof a.card === 'number' ? (typeof b.card === 'number' ? a.card - b.card : -1) : typeof b.card === 'number' ? 1 : String(a.card).localeCompare(String(b.card)))

/** @param {{hideNames?:boolean}} o  hideNames: während der Stunde nur Kartennummern zeigen (Beamer, Scanner) */
export function startSession(setId, classId, { hideNames = false } = {}) {
  const set = getSet(setId)
  const cls = classId ? getClass(classId) : null
  let questions = JSON.parse(JSON.stringify(set.questions.filter((q) => q.text.trim())))
  if (set.settings?.shuffle) questions = questions.map((q) => [Math.random(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
  const session = {
    id: uid(), setId, classId: cls?.id || null,
    title: set.title, className: cls?.name || 'Ohne Klasse',
    showCorrect: set.settings?.showCorrect !== false,
    startedAt: Date.now(), endedAt: null,
    questions, roster: rosterFor(classId),
    current: 0, responses: {}, revealed: {},
    hideNames: !!(cls && hideNames),
  }
  state.sessions.unshift(session)
  return session
}

/** Auswertung einer Frage */
export function questionStats(session, q) {
  const resp = session.responses[q.id] || {}
  const counts = { A: 0, B: 0, C: 0, D: 0 }
  let answered = 0, correct = 0
  for (const s of session.roster) {
    const a = resp[s.card]
    if (!a) continue
    answered++
    counts[a] = (counts[a] || 0) + 1
    if (isCorrect(q, a)) correct++
  }
  return { counts, answered, correct, total: session.roster.length, graded: q.type !== 'poll' && q.correct.length > 0 }
}

export const letterIndex = (l) => 'ABCD'.indexOf(l)
export const isCorrect = (q, letter) => q.type !== 'poll' && q.correct.includes(letterIndex(letter))
