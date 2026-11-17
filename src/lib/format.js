// Datei-Formate: Export/Import, KI-JSON einlesen und Prompt bauen.
// Reine Funktionen (ohne Vue) -> in Node testbar.
import { normalizeGid } from './gid.js'
import { questionMedia } from './media.js'

export const APP_ID = 'drehmoment'
export const FORMAT_VERSION = 1
const LETTERS = ['A', 'B', 'C', 'D']
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ------------------------------------------------------------------ Normalisierung
const TYPE_ALIASES = {
  mc: 'mc', multiplechoice: 'mc', 'multiple-choice': 'mc', multiple: 'mc', single: 'mc', choice: 'mc', quiz: 'mc', auswahl: 'mc',
  tf: 'tf', truefalse: 'tf', 'true-false': 'tf', boolean: 'tf', bool: 'tf', wahrfalsch: 'tf', 'wahr/falsch': 'tf', 'richtig/falsch': 'tf', yesno: 'tf',
  poll: 'poll', survey: 'poll', umfrage: 'poll', opinion: 'poll', meinung: 'poll', meinungsfrage: 'poll', abstimmung: 'poll',
}

function normType(t, hasCorrect) {
  const k = String(t || '').toLowerCase().replace(/[\s_]/g, '')
  return TYPE_ALIASES[k] || TYPE_ALIASES[String(t || '').toLowerCase()] || (hasCorrect === false ? 'poll' : 'mc')
}

/** Wandelt eine beliebige "correct"-Angabe in Indizes um */
function normCorrect(raw, options) {
  if (raw === undefined || raw === null || raw === '') return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out = new Set()
  for (const v of list) {
    if (typeof v === 'boolean') { out.add(v ? 0 : 1); continue }
    if (typeof v === 'number') { if (v >= 0 && v < options.length) out.add(v); continue }
    const s = String(v).trim()
    const letter = /^\(?([A-Da-d])[).:]?$/.exec(s)
    if (letter) { out.add(LETTERS.indexOf(letter[1].toUpperCase())); continue }
    if (/^\d+$/.test(s)) { const n = +s; if (n >= 0 && n < options.length) out.add(n); continue }
    if (/^(wahr|richtig|true|ja|yes)$/i.test(s)) { out.add(0); continue }
    if (/^(falsch|false|nein|no)$/i.test(s)) { out.add(1); continue }
    const idx = options.findIndex((o) => o.trim().toLowerCase() === s.toLowerCase())
    if (idx >= 0) out.add(idx)
  }
  return [...out].filter((i) => i < options.length).sort()
}

export function normalizeQuestion(q, warnings = [], n = 1, keepId = false) {
  if (typeof q === 'string') q = { text: q }
  const text = String(q.text ?? q.question ?? q.frage ?? q.prompt ?? q.title ?? '').trim()
  let options = q.options ?? q.answers ?? q.choices ?? q.antworten ?? q.optionen ?? []
  if (!Array.isArray(options)) options = Object.values(options)
  const rawOptions = options
  const objCorrect = []
  options = options.map((o, i) => {
    if (o && typeof o === 'object') {
      if (o.correct || o.isCorrect || o.richtig) objCorrect.push(i)
      return String(o.text ?? o.answer ?? o.label ?? '')
    }
    return String(o)
  }).map((o) => o.replace(/^\s*\(?[A-Da-d][).:]\s+/, '').trim()) // "A) Text" -> "Text"

  const rawCorrect = q.correct ?? q.answer ?? q.correctAnswer ?? q.solution ?? q.richtig ?? q.loesung ?? q.lösung
  let type = normType(q.type ?? q.typ, rawCorrect !== undefined || objCorrect.length > 0 ? undefined : options.length ? false : undefined)
  if (type === 'tf' && options.length !== 2) options = ['Wahr', 'Falsch']
  if (type === 'mc' && options.length === 0) { type = 'tf'; options = ['Wahr', 'Falsch'] }
  if (options.length > 4) { warnings.push(`Frage ${n}: mehr als 4 Antworten – nur A–D werden übernommen.`); options = options.slice(0, 4) }
  if (options.length < 2) { warnings.push(`Frage ${n}: weniger als 2 Antworten – ergänzt.`); while (options.length < 2) options.push('') }
  let correct = type === 'poll' ? [] : objCorrect.length ? objCorrect.filter((i) => i < 4) : normCorrect(rawCorrect, options)
  if (type !== 'poll' && correct.length === 0) warnings.push(`Frage ${n}: keine richtige Antwort angegeben.`)
  if (!text) warnings.push(`Frage ${n}: Fragetext fehlt.`)
  const { image, optionImages } = questionMedia(q, rawOptions, warnings, n) // seit 0.4
  const optImgs = optionImages && type !== 'tf' ? options.map((_, i) => optionImages[i] || null) : null
  return {
    id: keepId && q.id ? String(q.id) : rid(),
    type, text: repairLatexText(text), options: options.map(repairLatexText), correct,
    explanation: repairLatexText(String(q.explanation ?? q.erklaerung ?? q.erklärung ?? q.feedback ?? '').trim()),
    ...(image ? { image } : {}),
    ...(optImgs?.some(Boolean) ? { optionImages: optImgs } : {}),
  }
}

export function normalizeSet(obj, warnings = [], keepId = false) {
  const qs = obj.questions ?? obj.fragen ?? obj.items ?? []
  if (!Array.isArray(qs) || qs.length === 0) throw new Error('Keine Fragen gefunden ("questions" fehlt oder ist leer).')
  const s = obj.settings ?? {}
  return {
    id: keepId && obj.id ? String(obj.id) : rid(),
    title: String(obj.title ?? obj.titel ?? obj.name ?? obj.topic ?? 'Importiertes Quiz').trim(),
    description: String(obj.description ?? obj.beschreibung ?? '').trim(),
    subject: String(obj.subject ?? obj.fach ?? '').trim(),
    grade: String(obj.grade ?? obj.klassenstufe ?? obj.level ?? '').trim(),
    material: materialText(obj.material ?? obj.preparation ?? obj.vorbereitung ?? ''),
    settings: {
      showCorrect: s.showCorrect ?? s.revealAnswers ?? true,
      shuffle: s.shuffle ?? s.shuffleQuestions ?? false,
    },
    questions: qs.map((q, i) => normalizeQuestion(q, warnings, i + 1, keepId)),
    created: obj.created ?? Date.now(),
    updated: Date.now(),
  }
}

function materialText(m) {
  if (!m) return ''
  if (typeof m === 'string') return m.trim()
  if (Array.isArray(m)) return m.map(materialText).filter(Boolean).join('\n')
  if (typeof m === 'object') {
    const parts = []
    if (m.summary || m.zusammenfassung) parts.push(m.summary || m.zusammenfassung)
    if (m.tasks || m.aufgaben) parts.push(materialText(m.tasks || m.aufgaben))
    if (m.links) parts.push(materialText(m.links))
    if (m.title && m.url) parts.push(`${m.title}: ${m.url}`)
    else if (m.url) parts.push(m.url)
    if (m.text) parts.push(m.text)
    return parts.join('\n\n').trim()
  }
  return String(m)
}

// ------------------------------------------------------------------ Einlesen
// LaTeX-Befehle, deren Anfangsbuchstabe zugleich ein JSON-Escape ist (\f, \n, \t, \r, \b, \u).
// Eine KI schreibt oft "\frac" statt "\\frac" – JSON.parse machte daraus Seitenvorschub + "rac".
const LATEX_ESC = new Set(('frac,forall,flat,fbox,footnotesize,neq,ne,nu,nabla,not,ni,notin,neg,newline,nleq,ngeq,nmid,nexists,' +
  'times,theta,Theta,tau,text,textbf,textit,textrm,tfrac,tan,tanh,to,top,tilde,triangle,therefore,tag,' +
  'rho,right,rightarrow,Rightarrow,rangle,rceil,rfloor,rm,rvert,' +
  'beta,bar,binom,begin,bmod,backslash,bot,bullet,boldsymbol,big,Big,bigg,Bigg,bf,because,' +
  'underline,uparrow,Uparrow,upsilon,Upsilon,cup,unit').split(','))

const CTRL = { '\f': 'f', '\b': 'b', '\t': 't', '\r': 'r', '\n': 'n' }
/**
 * Repariert bereits „zerschossene“ Texte: aus "\frac" wurde beim Einlesen Seitenvorschub + "rac" usw.
 * \f und \b kommen in echten Texten nie vor; \t \r \n nur, wenn ein LaTeX-Befehl folgt UND der Text Formeln enthält.
 */
export function repairLatexText(str) {
  if (typeof str !== 'string' || !/[\f\b\t\r\n]/.test(str)) return str
  const math = /\$|\\\(|\\\[/.test(str)
  return str.replace(/[\f\b\t\r\n]([a-zA-Z]*)/g, (m, word) => {
    const ch = m[0], letter = CTRL[ch]
    if (ch === '\f' || ch === '\b') return '\\' + letter + word
    return math && LATEX_ESC.has(letter + word) ? '\\' + letter + word : m
  })
}

/** Alle Texte eines Quiz reparieren (in place) */
export function repairSetLatex(set) {
  if (!set || !Array.isArray(set.questions)) return set
  for (const k of ['title', 'description', 'material']) set[k] = repairLatexText(set[k])
  for (const q of set.questions) {
    if (!q) continue
    q.text = repairLatexText(q.text); q.explanation = repairLatexText(q.explanation)
    if (Array.isArray(q.options)) q.options = q.options.map(repairLatexText)
  }
  return set
}

/**
 * Verdoppelt Backslashes in JSON-Strings, die offensichtlich zu LaTeX gehören:
 *  - bekannte LaTeX-Befehle hinter \f \n \t \r \b \u  (z. B. \frac, \neq, \times)
 *  - jeder andere ungültige Escape (z. B. \alpha, \sqrt, \cdot, \(, \[)
 * Gültige Escapes (\n vor normalem Text, \", \\, \uXXXX) bleiben unverändert.
 */
export function fixLatexEscapes(json) {
  let out = '', inStr = false
  for (let i = 0; i < json.length; i++) {
    const c = json[i]
    if (!inStr) { if (c === '"') inStr = true; out += c; continue }
    if (c === '"') { inStr = false; out += c; continue }
    if (c !== '\\') { out += c; continue }
    const n = json[i + 1]
    if (n === '\\' || n === '"' || n === '/') { out += c + n; i++; continue }
    const word = /^[a-zA-Z]+/.exec(json.slice(i + 1, i + 30))?.[0] || ''
    if ('bfnrt'.includes(n)) { out += LATEX_ESC.has(word) ? '\\\\' : '\\'; continue }
    if (n === 'u') { out += /^u[0-9a-fA-F]{4}/.test(json.slice(i + 1, i + 6)) && !LATEX_ESC.has(word) ? '\\' : '\\\\'; continue }
    out += '\\\\' // ungültiger Escape -> wörtlicher Backslash (LaTeX)
  }
  return out
}

/** Holt JSON aus beliebigem Text (Codeblock, Fließtext davor/danach) */
export function extractJson(text) {
  const t = String(text).trim()
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(t)
  const candidates = []
  if (fence) candidates.push(fence[1])
  candidates.push(t)
  const fo = t.indexOf('{'), lo = t.lastIndexOf('}')
  if (fo >= 0 && lo > fo) candidates.push(t.slice(fo, lo + 1))
  const fa = t.indexOf('['), la = t.lastIndexOf(']')
  if (fa >= 0 && la > fa) candidates.push(t.slice(fa, la + 1))
  let lastErr
  for (const c of candidates) {
    // Eigene Exportdateien sind korrekt kodiert -> unverändert lesen
    try { const d = JSON.parse(c); if (d && d.app === APP_ID && d.exportedAt) return d } catch {}
    for (const v of [fixLatexEscapes(c), fixLatexEscapes(repairJson(c)), c]) {
      try { return JSON.parse(v) } catch (e) { lastErr = e }
    }
  }
  throw new Error('Kein gültiges JSON gefunden: ' + (lastErr?.message || ''))
}

/** Repariert typische KI-Fehler: typografische Anführungszeichen, Kommentare, Kommas am Ende */
function repairJson(s) {
  return s
    .replace(/[“”„]/g, '"')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
}

/**
 * Erkennt, was eingelesen wurde.
 * @returns {{kind:'backup'|'set', sets, classes, sessions, warnings, content}}
 */
export function parseImport(input) {
  const data = typeof input === 'string' ? extractJson(input) : input
  const warnings = []
  if (data && data.app === APP_ID && Array.isArray(data.sets)) {
    return {
      kind: 'backup',
      content: data.content || 'full',
      sets: data.sets.map((s) => normalizeSet(s, warnings, true)),
      classes: Array.isArray(data.classes) ? data.classes.map(normalizeClass) : [],
      sessions: Array.isArray(data.sessions) ? data.sessions.filter((s) => s && s.id && Array.isArray(s.questions)) : [],
      warnings,
    }
  }
  if (data && Array.isArray(data.classes) && !data.sets && !data.questions) {
    return { kind: 'classes', sets: [], classes: data.classes.map(normalizeClass), sessions: [], warnings }
  }
  if (Array.isArray(data)) return { kind: 'set', sets: [normalizeSet({ questions: data }, warnings)], classes: [], sessions: [], warnings }
  if (data && Array.isArray(data.sets)) return { kind: 'set', sets: data.sets.map((s) => normalizeSet(s, warnings)), classes: [], sessions: [], warnings }
  if (data && typeof data === 'object') {
    const inner = data.quiz ?? data.set ?? data
    return { kind: 'set', sets: [normalizeSet(inner, warnings)], classes: [], sessions: [], warnings }
  }
  throw new Error('Unbekanntes Format.')
}

function normalizeClass(c) {
  return {
    id: String(c.id || rid()),
    name: String(c.name || 'Klasse'),
    students: (c.students || c.schueler || c.names || []).map((s, i) => {
      if (typeof s === 'string') return { card: i + 1, name: s }
      const gid = normalizeGid(s.gid) // feste Schüler-ID (seit 0.3), optional
      return { card: +s.card || i + 1, name: String(s.name || [s.vorname ?? s.firstName, s.nachname ?? s.lastName].filter(Boolean).join(' ')), ...(gid ? { gid } : {}) }
    }),
  }
}

/** Baut eine Exportdatei */
export function buildExport(state, { sets = true, classes = false, sessions = false, setIds = null } = {}) {
  const pick = setIds ? state.sets.filter((s) => setIds.includes(s.id)) : state.sets
  const content = sessions ? 'full' : classes ? 'questions+classes' : 'questions'
  return {
    app: APP_ID, format: FORMAT_VERSION, exportedAt: new Date().toISOString(), content,
    sets: sets ? pick : [],
    ...(classes ? { classes: state.classes } : {}),
    ...(sessions ? { sessions: setIds ? state.sessions.filter((s) => setIds.includes(s.setId)) : state.sessions } : {}),
  }
}

/** Übernimmt Importdaten in den Zustand (merge: gleiche ID überschreiben, sonst hinzufügen) */
export function applyImport(state, parsed, mode = 'merge') {
  if (mode === 'replace') {
    state.sets = parsed.sets
    state.classes = parsed.classes
    state.sessions = parsed.sessions
    return { sets: parsed.sets.length, classes: parsed.classes.length, sessions: parsed.sessions.length }
  }
  const merge = (list, items) => {
    for (const it of items) {
      const i = list.findIndex((x) => x.id === it.id)
      if (i >= 0) list[i] = it
      else list.unshift(it)
    }
    return items.length
  }
  return { sets: merge(state.sets, parsed.sets), classes: merge(state.classes, parsed.classes), sessions: merge(state.sessions, parsed.sessions) }
}

// ------------------------------------------------------------------ CSV
export function sessionCsv(session) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Karte', 'Name', ...session.questions.map((q, i) => `F${i + 1}`), 'Richtig', 'Bewertet']
  const rows = session.roster.map((s) => {
    let right = 0, graded = 0
    const cells = session.questions.map((q) => {
      const a = session.responses[q.id]?.[s.card] || ''
      if (q.type !== 'poll' && q.correct.length) { graded++; if (a && q.correct.includes('ABCD'.indexOf(a))) right++ }
      return a
    })
    return [s.card, s.name, ...cells, right, graded]
  })
  const legend = session.questions.map((q, i) => [`F${i + 1}`, q.text, q.type === 'poll' ? 'Umfrage' : 'Lösung: ' + q.correct.map((c) => LETTERS[c]).join('/')])
  return [head, ...rows, [], ...legend].map((r) => r.map(esc).join(';')).join('\r\n')
}

// ------------------------------------------------------------------ KI-Prompt
export const AI_DEFAULTS = {
  topic: '', subject: '', grade: '', count: 8, types: { mc: true, tf: true, poll: false },
  optionCount: 4, difficulty: 'gemischt', language: 'Deutsch', explanations: true,
  material: true, shuffle: false, showCorrect: true, source: '', extra: '', images: false, // images: false | 'some' | 'many' (true = 'some')
}

/** Thema/Fach, bei dem Abbildungen fast immer helfen (Hinweis im KI-Formular) */
export const suggestsImages = (o) => /funktion|graph|parabel|gerade|steigung|ableitung|integral|nullstell|scheitel|koordinat|diagramm|statistik|geometri|dreieck|vektor|kurve|exponential|logarithm|trigonometr|sinus|kosinus|proportional|mathe|physik|bewegung|geschwindigkeit/i.test(`${o.topic} ${o.subject}`)

/** Anleitung für Graphen (KI-Prompt des Quiz-Generators und Bild-Prompts im Editor) */
export const GRAPH_HELP = `GRAPH-FORMAT – "graph" ist ein JSON-Objekt, die App zeichnet daraus das Koordinatensystem:
  "x": [xmin, xmax]          sichtbarer x-Bereich (immer angeben)
  "y": [ymin, ymax]          sichtbarer y-Bereich (weglassen = automatisch)
  "fn": ["x^2-2", {"f": "sin(x)", "label": "g", "dash": true, "color": "red", "domain": [0, 3], "fill": [1, 2]}]
                             Funktionen y = f(x). label = Name am Graphen, dash = gestrichelt, color = blue/red/green/orange/purple/black,
                             domain = nur in diesem x-Bereich zeichnen, fill = Fläche zwischen Graph und x-Achse von a bis b
  "points": [[x, y, "P"]]    markierte Punkte (Beschriftung optional)
  "segments": [[x1, y1, x2, y2], [0, 0, 2, 1, "arrow"]]   Strecken, "arrow" = Pfeil (Vektor)
  "polygons": [[[0, 0], [4, 0], [0, 3]]]   gefüllte Vielecke (Dreiecke, Flächen)
  "vlines": [2], "hlines": [1]   gestrichelte Hilfslinien x = 2 bzw. y = 1
  "texts": [[x, y, "Text"]]  freie Beschriftungen
  "param": [{"x": "2cos(t)", "y": "sin(t)", "t": [0, 6.283]}]   Parameterkurven (Kreis, Ellipse)
  "bars": {"labels": ["Mo", "Di"], "values": [3, 5]}   Säulendiagramm (statt Koordinatensystem)
  "grid": "major"            Gitter: "none" (keins), "major" (Hauptlinien, Standard), "minor" (Haupt- + feine Nebenlinien wie Kästchenpapier),
                             je Achse getrennt: {"x": "minor", "y": "major"}
  "step": [1, 1]             Abstand der Hauptlinien und Zahlen auf x- bzw. y-Achse (sonst automatisch)
  "minor": [0.5, 0.5]        Abstand der Nebenlinien (sonst automatisch: 1/5 bzw. 1/4 der Hauptlinien)
  "equal": true              gleicher Maßstab auf beiden Achsen (Geometrie, Kreise, Vektoren)
  "lines": [[[0, 0], [2, 4], [6, 4]], {"points": [[0, 1], [6, 1]], "color": "red", "dash": true, "label": "B"}]
                             Streckenzüge durch Punkte (v-t-Diagramme in Phasen, Messkurven, Treppen)
ACHSEN (Physik, Sachaufgaben):
  "xlabel": "t", "xunit": "s", "ylabel": "v", "yunit": "m/s"   -> „t in s“ / „v in m/s“ (Größe kursiv, Einheit aufrecht)
  "units": "in" | "[]" | "/"   Schreibweise: „t in s“ (Standard), „t [s]“ oder „t / s“
  Index/Exponent in Namen und Einheiten: "v_0", "v_{max}", "m/s^2", "10^{-3}"
  Bereich und "step" je Achse passend zur Größenordnung wählen (z. B. "x": [0, 10], "y": [0, 200], "step": [1, 50]).

3D (analytische Geometrie) – statt x/fn ein Objekt "space":
  "graph": {"space": {
    "vectors": [{"v": [2, 3, 1], "label": "a"}, {"from": [2, 3, 1], "v": [0, 2, 3], "label": "b", "dash": true}],   Pfeile (ohne from: ab Ursprung)
    "points": [[2, 5, 4, "P"]],
    "segments": [[0, 0, 0, 2, 5, 4]]                          Strecken (7. Wert "dash" = gestrichelt)
    "lines": [{"p": [1, 1, 0], "d": [1, 1, 2], "label": "g"}]   Gerade x = p + t·d (auf den Bereich zugeschnitten)
    "planes": [{"n": [2, 1, 2], "d": 6, "label": "E"}]         Ebene n·x = d; auch {"p": […], "u": […], "v": […]} oder {"points": [A, B, C]};
                                                              "trace": true = als Spurdreieck (Schnitt mit den Achsen)
    "polygons": [[[0, 0, 0], [2, 0, 0], [1, 1, 2]]]           Flächen (Körper aus mehreren Flächen)
    "range": [-1, 5] oder je Achse "x"/"y"/"z": [min, max]     sichtbarer Bereich (sonst automatisch)
    "guides": true                                            gestrichelter Koordinatenweg zu Punkten/Vektorspitzen (eindeutig ablesbar)
    "box": true, "view": [30, 20] (Azimut, Höhe; ohne = Schrägbild wie im Heft), "names": ["x", "y", "z"] (Standard x₁ x₂ x₃)
  }}

FORMELN in "f", "x", "y" – KEIN LaTeX, keine Wörter:
  Variable x (in param: t). Rechenzeichen + - * / ^ und runde Klammern. Malpunkt darf fehlen: 2x, 3(x+1), 0.5x^2.
  Funktionen: sqrt abs exp ln log (=log10) sin cos tan asin acos atan, Betrag |x|. Konstanten pi und e. Winkel im Bogenmaß.
  Dezimalpunkt: 0.5 (nicht 0,5).
  richtig: "0.5x^2-2x+1"  "(x-1)^2+2"  "2^x"  "e^(-x)"  "sqrt(x+4)"  "1/(x-2)"  "sin(2x)"  "-|x|+3"
  falsch:  "\\frac{1}{2}x^2"  "x²"  "y = 2x für x > 0" (stattdessen "domain": [0, 5])  "f(x) = …" mit Text

GUTE GRAPHEN:
  - Achsenbereich so wählen, dass alles Entscheidende sichtbar ist (Nullstellen, Scheitel, Schnittpunkte, Asymptoten), mit etwas Rand.
  - Soll etwas abgelesen werden: ganzzahlige, gut ablesbare Werte (Scheitel (1|2), nicht (1,37|2,81)).
  - Gitter passend zur Aufgabe: genaues Ablesen (Werte, Steigungsdreieck, halbe Einheiten) -> "grid": "minor" mit passendem "step"/"minor";
    Überblick, Kurvenform erkennen, Antwortbilder -> "major"; Skizze/Geometrie ohne Koordinaten -> "none".
    Unterschiedliche Größenordnungen (z. B. Zeit 0–10 s, Weg 0–200 m) -> eigene "step" je Achse, z. B. [2, 50].
  - Die Lösung darf nicht im Bild stehen (keine verratende Beschriftung, keine Funktionsterme als label bei Antwortbildern).
  - Antwortbilder: bei allen Optionen GLEICHER Achsenbereich, klar unterscheidbar, typische Fehler als Distraktoren
    (Vorzeichen vertauscht, Verschiebung in die falsche Richtung, Steigung und y-Achsenabschnitt verwechselt).
  - 3D: Punkte/Vektoren mit "guides": true, wenn Koordinaten abgelesen werden sollen; Ebenen mit "trace": true, wenn die Spurpunkte zählen.
  - Fragemuster: Wert/Nullstelle/Scheitel/Steigung ablesen · „Welcher Graph gehört zu f(x) = …?“ (Antwortbilder)
    · „Welcher Term gehört zum Graphen?“ (Bild zur Frage, Terme als Antworten) · Fläche unter dem Graphen (fill)
    · Säulendiagramm auswerten (bars) · Dreieck/Vektor (polygons, segments, equal)
    · Physik: Diagramm mit Größen/Einheiten deuten (lines, fn, xunit/yunit) · 3D: Vektor/Gerade/Ebene/Lagebeziehung (space).
  - Vor der Ausgabe jede Formel prüfen: nur erlaubte Zeichen, Klammern vollständig – und passt der Graph wirklich zur richtigen Antwort?`

/** Regeln für SVG-Zeichnungen einer KI */
export const SVG_HELP = `svg: eine einfache, eigenständige Zeichnung "<svg viewBox='0 0 200 150'>…</svg>" – höchstens ~1500 Zeichen,
  nur Linien/Formen/kurze Beschriftungen, einfache Anführungszeichen ' in Attributen (dann muss im JSON nichts escaped werden),
  keine eingebetteten Bilder, Schriften, Skripte oder Links. Schwarz auf transparent/weiß, kräftige Linien (stroke-width ≥ 2).`

const imageMode = (o) => (o.images === true ? 'some' : o.images || false)

export function buildPrompt(o) {
  const types = []
  if (o.types.mc) types.push(`"mc" (Multiple Choice mit genau ${o.optionCount} Antwortmöglichkeiten, genau eine richtig)`)
  if (o.types.tf) types.push('"tf" (Wahr/Falsch – options ist immer ["Wahr","Falsch"], correct "A" = wahr, "B" = falsch)')
  if (o.types.poll) types.push('"poll" (Umfrage/Meinungsfrage ohne richtige Antwort, 2–4 Optionen, correct weglassen)')
  if (!types.length) types.push('"mc" (Multiple Choice)')

  const ctx = [
    o.subject && `Fach: ${o.subject}`,
    o.grade && `Klassenstufe/Niveau: ${o.grade}`,
    `Schwierigkeit: ${o.difficulty}`,
    `Sprache der Fragen: ${o.language}`,
  ].filter(Boolean).join('\n')

  const example = {
    app: 'drehmoment',
    title: 'Kurzer, prägnanter Titel',
    description: 'Ein Satz, worum es geht',
    subject: o.subject || 'Fach',
    grade: o.grade || 'Klassenstufe',
    ...(o.material ? { material: 'Vorbereitung für zu Hause (Flipped Classroom): kurze Zusammenfassung der wichtigsten Inhalte (5–10 Sätze) + 2–3 Leitfragen + Suchbegriffe für passende Erklärvideos' } : {}),
    settings: { showCorrect: o.showCorrect, shuffle: o.shuffle },
    questions: [
      { type: 'mc', question: 'Fragetext?', options: ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D'].slice(0, o.optionCount), correct: 'B', ...(o.explanations ? { explanation: 'Kurze Begründung, warum B richtig ist.' } : {}) },
      ...(o.images ? [
        { type: 'mc', question: 'Wo liegt der Scheitelpunkt der abgebildeten Parabel? (Bild zur Frage)', graph: { x: [-2, 4], y: [-1, 7], fn: ['(x-1)^2+2'] }, options: ['$(1|2)$', '$(2|1)$', '$(-1|2)$', '$(1|-2)$'].slice(0, o.optionCount), correct: 'A' },
        { type: 'mc', question: 'Welcher Graph gehört zu $f(x) = 2x - 1$? (Bilder als Antworten)', options: [{ graph: { x: [-3, 3], y: [-4, 4], fn: ['-2x+1'] } }, { graph: { x: [-3, 3], y: [-4, 4], fn: ['2x-1'] } }, { graph: { x: [-3, 3], y: [-4, 4], fn: ['2x+1'] } }, { graph: { x: [-3, 3], y: [-4, 4], fn: ['x-2'] } }].slice(0, o.optionCount), correct: 'B' },
        { type: 'mc', question: 'Frage zu einer Skizze', svg: "<svg viewBox='0 0 200 120'><circle cx='100' cy='60' r='50' fill='none' stroke='black' stroke-width='2'/><line x1='50' y1='60' x2='150' y2='60' stroke='red' stroke-width='3'/></svg>", options: ['Antwort A', 'Antwort B'], correct: 'B' },
      ] : []),
      ...(o.types.tf ? [{ type: 'tf', question: 'Aussage, die wahr oder falsch ist.', options: ['Wahr', 'Falsch'], correct: 'A', ...(o.explanations ? { explanation: '…' } : {}) }] : []),
      ...(o.types.poll ? [{ type: 'poll', question: 'Wie sicher fühlst du dich beim Thema?', options: ['Sehr sicher', 'Eher sicher', 'Eher unsicher', 'Gar nicht'] }] : []),
    ],
  }

  return `Du bist eine erfahrene Lehrkraft und erstellst ein Quiz für die Unterrichts-App „Drehmoment“ (Abstimmung mit gedruckten Antwortkarten A–D im Flipped Classroom).

THEMA: ${o.topic || '(bitte Thema einsetzen)'}
${ctx}
Anzahl Fragen: ${o.count}
Erlaubte Fragetypen: ${types.join('; ')}
${o.extra ? `\nZusätzliche Wünsche: ${o.extra}\n` : ''}${o.source ? `\nGrundlage ist ausschließlich folgendes Material (z. B. Text, Videotranskript, Hausaufgabe):\n"""\n${o.source.trim()}\n"""\n` : ''}
REGELN:
- Maximal 4 Antwortoptionen pro Frage (die Karten haben nur A, B, C, D).
- Fragen und Antworten kurz und eindeutig – sie werden vorgelesen oder an die Wand projiziert.
- Falsche Antworten (Distraktoren) sollen plausibel sein und typische Fehlvorstellungen abbilden.
- Die richtige Antwort zufällig auf A–D verteilen.
- "correct" ist immer der Buchstabe der richtigen Option ("A"–"D").
- Formeln in LaTeX zwischen $…$ (z. B. $\\frac{3}{4}$, $x^2$, $\\sqrt{2}$, Chemie $\\ce{H2O}$). Im JSON jeden Backslash verdoppeln ("$\\\\frac{1}{2}$"). Ohne Formel normalen Text schreiben.
${o.explanations ? '- Zu jeder Frage eine kurze Erklärung ("explanation") für die Besprechung.\n' : ''}${o.material ? '- Fülle "material" mit Vorbereitungsmaterial für zu Hause.\n' : ''}${imageMode(o) ? `
ABBILDUNGEN – ${imageMode(o) === 'many'
    ? `GRAPHEN-QUIZ: Mindestens ${Math.max(1, Math.ceil(o.count * 0.6))} der ${o.count} Fragen bekommen einen Graphen oder ein Diagramm – teils als Bild zur Frage, teils als Bilder in den Antworten (gut mischen).`
    : 'überall dort, wo sie dem Verständnis helfen (Funktionen, Geometrie, Diagramme, Skizzen) – etwa jede dritte Frage.'}
WO DAS BILD HINGEHÖRT:
  - Bild zur Frage: Feld "graph" direkt in der Frage (neben "question").
  - Bilder als Antworten: "options" als Liste von Objekten [{"graph": {…}}, {"graph": {…}}, …], optional mit "text" als kurzer Beschriftung. "correct" bleibt der Buchstabe.
  - Skizzen ohne Koordinatensystem (geometrische Figuren, Versuchsaufbauten): Feld "svg" statt "graph".
${GRAPH_HELP}
${SVG_HELP}
` : ''}
AUSGABE: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Codeblock in genau diesem Format (keine Kommentare, kein Text davor oder danach):

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\``
}

// ------------------------------------------------------------------ Klassen aus CSV
/** Bytes -> Text: UTF-8 (mit/ohne BOM), sonst Windows-1252 (typischer Excel-Export) */
export function decodeCsvBytes(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '') } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** CSV mit automatisch erkanntem Trennzeichen (; , Tab), Anführungszeichen nach RFC 4180 */
export function parseCsv(text) {
  const t = String(text).replace(/^﻿/, '')
  const head = t.split(/\r?\n/).slice(0, 10).join('\n') // Titelzeilen davor sollen nicht stören
  const delim = [';', '\t', ','].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some(Boolean))
}

const COL_ALIASES = {
  klasse: ['klasse', 'class', 'lerngruppe', 'kurs', 'gruppe', 'klassenbezeichnung'],
  nachname: ['nachname', 'familienname', 'name', 'lastname', 'last name', 'surname'],
  vorname: ['vorname', 'rufname', 'firstname', 'first name', 'givenname'],
}
const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß ]/g, '').trim()

/**
 * Liest Klassenlisten aus einer CSV mit den Spalten „Klasse“, „Nachname“, „Vorname“ (Reihenfolge egal,
 * Groß-/Kleinschreibung egal, gängige Alternativen werden erkannt).
 * @returns {{classes:{name:string, students:{name:string, last:string, first:string}[]}[], warnings:string[]}}
 */
export function parseClassCsv(text, fallbackClass = 'Importierte Klasse') {
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('Die Datei ist leer.')
  // Kopfzeile: erste Zeile, die mindestens Nachname oder Vorname enthält
  let hi = rows.findIndex((r) => r.some((c) => COL_ALIASES.nachname.includes(norm(c)) || COL_ALIASES.vorname.includes(norm(c))))
  if (hi < 0) throw new Error('Keine Kopfzeile mit „Nachname“ / „Vorname“ gefunden.')
  const head = rows[hi].map(norm)
  const col = (k) => { for (const a of COL_ALIASES[k]) { const i = head.indexOf(a); if (i >= 0) return i } return -1 }
  const ci = col('klasse'), vi = col('vorname')
  let ni = col('nachname')
  if (ni === vi) ni = -1
  const warnings = []
  if (ci < 0) warnings.push(`Keine Spalte „Klasse“ – alle Namen kommen in „${fallbackClass}“.`)
  const map = new Map()
  let skipped = 0
  for (const r of rows.slice(hi + 1)) {
    const last = ni >= 0 ? r[ni] || '' : '', first = vi >= 0 ? r[vi] || '' : ''
    const name = [first, last].filter(Boolean).join(' ')
    if (!name) { skipped++; continue }
    const cls = (ci >= 0 ? r[ci] : '') || fallbackClass
    if (!map.has(cls)) map.set(cls, [])
    map.get(cls).push({ name, last, first })
  }
  if (skipped) warnings.push(`${skipped} Zeile(n) ohne Namen übersprungen.`)
  const coll = (a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })
  const classes = [...map].map(([name, students]) => ({
    name, students: students.sort((a, b) => coll(a.last, b.last) || coll(a.first, b.first)),
  })).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  if (!classes.length) throw new Error('Keine Namen gefunden.')
  return { classes, warnings }
}

/**
 * Anzeigenamen einer Klasse: Standard „Vorname N.“ (datensparsam, steht auf gedruckten Karten),
 * bei Gleichheit wird das Nachnamen-Kürzel verlängert („Anna Ma.“ / „Anna Mü.“). fullName -> „Vorname Nachname“.
 */
export function displayNames(students, fullName = false) {
  if (fullName) return students.map((s) => s.name)
  const short = (s, n) => (s.first ? s.first + (s.last ? ' ' + s.last.slice(0, n) + (n < s.last.length ? '.' : '') : '') : s.last)
  const len = students.map(() => 1)
  for (let round = 0; round < 30; round++) {
    const names = students.map((s, i) => short(s, len[i]).toLowerCase())
    let changed = false
    names.forEach((n, i) => {
      if (names.indexOf(n) !== names.lastIndexOf(n) && len[i] < (students[i].last || '').length) { len[i]++; changed = true }
    })
    if (!changed) break
  }
  return students.map((s, i) => short(s, len[i]))
}

/**
 * Übernimmt CSV-Klassen: gleiche Klasse (Name) -> neue Namen ergänzen (vorhandene Kartennummern bleiben!),
 * sonst neue Klasse mit Karten 1, 2, 3 … in alphabetischer Reihenfolge.
 * @param {{fullName?:boolean}} o  Standard: „Vorname N.“
 */
export function applyClassCsv(state, parsed, { fullName = false } = {}) {
  return mergeClasses(state, parsed.classes.map((c) => {
    const shown = displayNames(c.students, fullName)
    return { name: c.name, students: c.students.map((s, i) => ({ name: shown[i] })) }
  }))
}

/**
 * Klassen übernehmen (CSV, Link, QR): gleiche Klasse (Name) -> fehlende Namen ergänzen, vorhandene Karten bleiben.
 * Mitgelieferte Kartennummern werden genutzt, wenn sie frei sind, sonst die nächste freie Nummer.
 * Feste Schüler-ID (gid): gleiche ID = gleiche Person (auch bei anderem Namen) -> nichts doppelt;
 * vorhandene Person gleichen Namens ohne ID bekommt die ID (linked) – ihre Kartennummer bleibt.
 * @param {{name:string, students:{name:string, card?:number, gid?:string}[]}[]} classes
 */
export function mergeClasses(state, classes) {
  let created = 0, added = 0, linked = 0
  for (const c of classes) {
    let cls = state.classes.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase())
    if (!cls) { cls = { id: rid(), name: c.name, students: [] }; state.classes.push(cls); created++ }
    const key = (s) => String(s.name || '').trim().toLowerCase()
    const have = new Set(cls.students.map(key))
    const used = new Set(cls.students.map((s) => s.card))
    let n = 1
    for (const s of c.students) {
      const name = String(s.name || '').trim()
      if (!name) continue
      const gid = normalizeGid(s.gid)
      if (gid) {
        if (cls.students.some((x) => x.gid === gid)) continue
        const same = cls.students.find((x) => !x.gid && key(x) === name.toLowerCase())
        if (same) { same.gid = gid; linked++; continue }
      } else if (have.has(name.toLowerCase())) continue
      let card = +s.card
      if (!(card >= 1 && card <= 999) || used.has(card)) { while (used.has(n)) n++; card = n }
      cls.students.push({ card, name, ...(gid ? { gid } : {}) }); used.add(card); have.add(name.toLowerCase()); added++
    }
    cls.students.sort((a, b) => a.card - b.card)
  }
  return { created, added, linked }
}
