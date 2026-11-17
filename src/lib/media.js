// Bilder zu Fragen: ein großes Bild zur Frage (q.image) und/oder kleine Bilder als Antworten (q.optionImages).
//
// Medien-Objekt (Speicher, Export-JSON):
//   { type: 'plot',   plot: {…} }                    Mathe-Graph (plot.js) – winzig, ideal für KI und QR-Codes
//   { type: 'svg',    svg: '<svg …>…</svg>' }         Vektorgrafik (z. B. von einer KI gezeichnet)
//   { type: 'raster', src: 'data:image/webp;base64,…' } Foto/Bild (wird beim Einfügen verkleinert)
//
// Kompakt im QR-Paket (compact v1, Frage-Zeile Index 5, seit 0.4 – ältere Versionen ignorieren das Feld):
//   { i: M, o: [M | 0, …] }   M = Objekt (Graph) | "<svg…" (ohne xmlns) | "w:<base64>" webp | "j:" jpeg | "p:" png | "g:" gif
//
// Angezeigt wird immer über <img src="data:…"> – Skripte in SVGs laufen dort nicht, externe Inhalte werden nicht geladen.
// Reine Funktionen (ohne DOM) – das Verkleinern von Fotos (Canvas) steckt in imageenc.js.
import { normalizePlot, renderPlot } from './plot.js'

const RASTER_RE = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/
const SHORT = { webp: 'w', jpeg: 'j', jpg: 'j', png: 'p', gif: 'g', avif: 'a' }
const LONG = { w: 'webp', j: 'jpeg', p: 'png', g: 'gif', a: 'avif' }
export const MAX_SVG = 60000 // Zeichen

// ------------------------------------------------------------------ SVG
/** Entfernt Gefährliches/Überflüssiges, ergänzt xmlns + viewBox. Wirft bei ungültigem SVG. */
export function cleanSvg(input) {
  let s = String(input || '').trim()
  if (/^data:image\/svg\+xml/i.test(s)) {
    const i = s.indexOf(',')
    s = /;base64/i.test(s.slice(0, i)) ? new TextDecoder().decode(Uint8Array.from(atob(s.slice(i + 1)), (c) => c.charCodeAt(0))) : decodeURIComponent(s.slice(i + 1))
  }
  s = s.replace(/^```(?:svg|xml|html)?\s*/i, '').replace(/```\s*$/, '').trim() // KI-Codeblock
  s = s.replace(/<svg\b([^>]*?)\s*\/>/i, (m, attrs) => (/<\/svg>/i.test(s) ? m : `<svg${attrs}></svg>`)) // <svg …/> (leer)
  const a = s.search(/<svg[\s>]/i), b = s.toLowerCase().lastIndexOf('</svg>')
  if (a < 0 || b < a) throw new Error('Kein SVG gefunden (<svg …>…</svg>).')
  s = s.slice(a, b + 6)
  s = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video)\b[^>]*\/>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?:javascript|https?|ftp|file):[^"']*\1/gi, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    .replace(/<(sodipodi|inkscape):[^>]*?(\/>|>[\s\S]*?<\/\1:[^>]*>)/gi, '')
    .replace(/\s(?:sodipodi|inkscape):[a-z-]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\sxmlns:(?:sodipodi|inkscape|rdf|cc|dc)\s*=\s*("[^"]*"|'[^']*')/gi, '')
  const open = /^<svg\b[^>]*>/i.exec(s)[0]
  let tag = open
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (/xlink:href/.test(s) && !/\sxmlns:xlink\s*=/.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  if (!/\sviewBox\s*=/i.test(tag)) {
    const w = /\swidth\s*=\s*["']?([\d.]+)/i.exec(tag)?.[1], h = /\sheight\s*=\s*["']?([\d.]+)/i.exec(tag)?.[1]
    if (w && h) tag = tag.replace(/^<svg/i, `<svg viewBox="0 0 ${w} ${h}"`)
  }
  s = tag + s.slice(open.length)
  if (s.length > MAX_SVG) throw new Error(`SVG ist zu groß (${Math.round(s.length / 1000)} kB, max. ${MAX_SVG / 1000} kB) – bitte einfacher zeichnen lassen.`)
  return s
}

const NUM_ATTR_SKIP = /^(id|class|href|xlink:href|font-family|style|transform-origin|xmlns.*)$/i
/**
 * Verkleinert ein SVG (Leerraum, Nachkommastellen). precision = Nachkommastellen für Koordinaten.
 * Text zwischen Tags bleibt unverändert.
 */
export function minifySvg(svg, { precision = 1 } = {}) {
  const f = 10 ** precision
  const round = (m) => { const v = Math.round(parseFloat(m) * f) / f; return (Object.is(v, -0) ? 0 : v).toString().replace(/^(-?)0\./, '$1.') }
  return cleanSvg(svg)
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*"([^"]*)"/g, (all, name, val) => {
      if (NUM_ATTR_SKIP.test(name)) return ` ${name}="${val.trim()}"`
      let v = val.replace(/-?\d*\.\d+(?:e-?\d+)?|-?\d+\.(?!\d)/gi, round).replace(/\s+/g, ' ').trim()
      if (/^(d|points)$/i.test(name)) v = v.replace(/\s*,\s*/g, ',').replace(/ (-)/g, '$1').replace(/([a-zA-Z]) /g, '$1').replace(/ ([a-zA-Z])/g, '$1') // "M 1 -2 L 3 4" -> "M1-2L3 4"
      return ` ${name}="${v}"`
    })
    .replace(/\s*\/>/g, '/>')
}

// ------------------------------------------------------------------ Normalisieren
/**
 * Beliebige Bildangabe (eigenes Format, KI-JSON, Daten-URL, SVG-Text, Graph-Objekt) -> Medien-Objekt | null.
 * Unbrauchbares wird mit Warnung verworfen.
 */
export function normalizeMedia(x, warnings = [], where = 'Bild') {
  if (x == null || x === '' || x === false || x === 0) return null
  try {
    if (typeof x === 'string') {
      const s = x.trim()
      if (!s) return null
      if (/^data:image\/svg\+xml/i.test(s) || /^(```\w*\s*)?(<\?xml|<svg|<!--)/i.test(s)) return { type: 'svg', svg: cleanSvg(s) }
      const r = RASTER_RE.exec(s)
      if (r) return { type: 'raster', src: `data:image/${r[1] === 'jpg' ? 'jpeg' : r[1]};base64,${r[2].replace(/\s/g, '')}` }
      if (/^[{[]/.test(s)) return normalizeMedia(JSON.parse(s), warnings, where)
      if (/^https?:\/\//i.test(s)) { warnings.push(`${where}: Bild-Links (${s.slice(0, 40)}…) gehen offline nicht – bitte Bild einfügen.`); return null }
      warnings.push(`${where}: unbekanntes Bildformat – ignoriert.`)
      return null
    }
    if (typeof x !== 'object' || Array.isArray(x)) return null
    if (x.type === 'plot' || x.type === 'graph') return { type: 'plot', plot: normalizePlot(x.plot ?? x.graph ?? x) }
    if (x.type === 'svg') return { type: 'svg', svg: cleanSvg(x.svg ?? x.src) }
    if (x.type === 'raster' || x.type === 'image') return normalizeMedia(String(x.src ?? x.data ?? ''), warnings, where)
    if (x.graph || x.plot) return { type: 'plot', plot: normalizePlot(x.graph ?? x.plot) }
    if (x.svg) return { type: 'svg', svg: cleanSvg(x.svg) }
    if (x.src || x.data || x.url) return normalizeMedia(String(x.src ?? x.data ?? x.url), warnings, where)
    if (x.fn || x.functions || x.points || x.bars || x.segments || x.polygons || x.param) return { type: 'plot', plot: normalizePlot(x) }
  } catch (e) {
    warnings.push(`${where}: ${e.message}`)
    return null
  }
  return null
}

/** Bilder einer Frage aus KI-/Fremd-JSON einsammeln (Frage-Objekt + Antwort-Objekte) */
export function questionMedia(q, rawOptions, warnings, n) {
  const where = `Frage ${n}`
  const image = normalizeMedia(q.image ?? q.bild ?? q.img ?? q.picture ?? (q.graph || q.plot ? { graph: q.graph ?? q.plot } : null) ?? (q.svg ? { svg: q.svg } : null), warnings, where)
  let optionImages = null
  const given = Array.isArray(q.optionImages) ? q.optionImages : Array.isArray(q.optionimages) ? q.optionimages : null
  const fromObj = (Array.isArray(rawOptions) ? rawOptions : []).map((o, i) => (o && typeof o === 'object'
    ? normalizeMedia(o.image ?? o.bild ?? o.img ?? (o.graph || o.plot ? { graph: o.graph ?? o.plot } : null) ?? (o.svg ? { svg: o.svg } : null), warnings, `${where}, Antwort ${'ABCD'[i] || i + 1}`)
    : null))
  const list = given ? given.map((m, i) => normalizeMedia(m, warnings, `${where}, Antwort ${'ABCD'[i] || i + 1}`)) : fromObj
  if (list.some(Boolean)) optionImages = list.slice(0, 4)
  return { image, optionImages }
}

// ------------------------------------------------------------------ Anzeige
const urlCache = new Map()
/** Daten-URL für <img> (Graphen werden gerendert, Ergebnis wird gemerkt) */
export function mediaUrl(m) {
  if (!m) return ''
  if (m.type === 'raster') return m.src
  const key = m.type === 'svg' ? m.svg : JSON.stringify(m.plot)
  let u = urlCache.get(key)
  if (!u) {
    let svg
    try { svg = m.type === 'svg' ? m.svg : renderPlot(m.plot) } catch (e) { svg = errorSvg(e.message) }
    u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    if (urlCache.size > 300) urlCache.clear()
    urlCache.set(key, u)
  }
  return u
}
const errorSvg = (msg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60"><rect width="300" height="60" fill="#fde4e1"/><text x="10" y="35" font-family="sans-serif" font-size="12" fill="#b3261e">${String(msg).replace(/[<&>]/g, '').slice(0, 50)}</text></svg>`

/** Ungefähre Größe (Byte) im Speicher */
export function mediaBytes(m) {
  if (!m) return 0
  if (m.type === 'raster') { const b = m.src.slice(m.src.indexOf(',') + 1); return Math.floor((b.length * 3) / 4) }
  return m.type === 'svg' ? m.svg.length : JSON.stringify(m.plot).length
}

export const hasMedia = (q) => !!(q?.image || q?.optionImages?.some(Boolean))
export const setHasMedia = (set) => set.questions.some(hasMedia)
export const setHasRaster = (set) => set.questions.some((q) => q.image?.type === 'raster' || q.optionImages?.some((m) => m?.type === 'raster'))

// ------------------------------------------------------------------ QR-Paket
/** Medien-Objekt -> kompakte Form fürs QR-Paket */
export function packMedia(m) {
  if (!m) return 0
  if (m.type === 'plot') return m.plot
  if (m.type === 'svg') return minifySvg(m.svg).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '')
  const r = RASTER_RE.exec(m.src)
  return r ? `${SHORT[r[1]]}:${r[2]}` : 0
}
/** kompakte Form -> Medien-Objekt (tolerant: Unbekanntes -> null) */
export function unpackMedia(c) {
  if (!c) return null
  try {
    if (typeof c === 'object' && !Array.isArray(c)) return { type: 'plot', plot: normalizePlot(c) }
    if (typeof c !== 'string') return null
    if (c[0] === '<') return { type: 'svg', svg: cleanSvg(c) }
    const m = /^([a-z]):([A-Za-z0-9+/=]+)$/.exec(c)
    if (m && LONG[m[1]]) return { type: 'raster', src: `data:image/${LONG[m[1]]};base64,${m[2]}` }
  } catch {}
  return null
}
/** Bilder einer Frage -> Feld für die compact-Zeile (oder null) */
export function packQuestionMedia(q) {
  if (!hasMedia(q)) return null
  const o = {}
  if (q.image) o.i = packMedia(q.image)
  if (q.optionImages?.some(Boolean)) o.o = q.optionImages.map(packMedia)
  return o
}
export function unpackQuestionMedia(c) {
  if (!c || typeof c !== 'object') return {}
  const image = unpackMedia(c.i)
  const list = Array.isArray(c.o) ? c.o.map(unpackMedia) : null
  return { ...(image ? { image } : {}), ...(list?.some(Boolean) ? { optionImages: list } : {}) }
}

// ------------------------------------------------------------------ Für QR-Codes passend machen
/**
 * Stufen zum Verkleinern von Fotos (Kantenlänge großes Bild / Antwortbild, Qualität).
 * Stufe 0 = schön, letzte Stufe = gerade noch erkennbar.
 */
export const RASTER_LEVELS = [
  { big: 640, small: 320, q: 0.72 }, { big: 512, small: 256, q: 0.66 }, { big: 420, small: 210, q: 0.6 },
  { big: 340, small: 180, q: 0.55 }, { big: 280, small: 150, q: 0.5 }, { big: 220, small: 128, q: 0.45 },
  { big: 180, small: 104, q: 0.4 }, { big: 140, small: 88, q: 0.36 }, { big: 110, small: 72, q: 0.32 },
  { big: 88, small: 60, q: 0.3 },
]

/** Alle Medien eines Quiz ersetzen (map: (m, {q, role}) -> m) – liefert eine Kopie */
export function mapSetMedia(set, fn) {
  return {
    ...set,
    questions: set.questions.map((q) => {
      if (!hasMedia(q)) return q
      const c = { ...q }
      if (q.image) c.image = fn(q.image, { q, role: 'big' })
      if (q.optionImages) c.optionImages = q.optionImages.map((m) => (m ? fn(m, { q, role: 'small' }) : m))
      return c
    }),
  }
}

/**
 * Verkleinert Fotos stufenweise, bis `fits(set)` stimmt (binäre Suche über RASTER_LEVELS, beste Qualität zuerst).
 * Graphen und SVGs bleiben unverändert (sind ohnehin klein).
 * @param {object} set
 * @param {{encode:(src:string, o:{maxDim:number, quality:number})=>Promise<string>, fits:(set:object)=>boolean|Promise<boolean>, levels?:object[]}} o
 * @returns {Promise<{set:object, level:number, fits:boolean, levels:number}>}
 *   level = -1: keine Fotos (nichts zu tun) · fits=false: passt selbst auf der kleinsten Stufe nicht (set = kleinste Stufe)
 */
export async function fitRasters(set, { encode, fits, levels = RASTER_LEVELS }) {
  if (!setHasRaster(set)) return { set, level: -1, fits: !!(await fits(set)), levels: levels.length }
  const cache = new Map()
  const at = async (L) => {
    if (cache.has(L)) return cache.get(L)
    const lv = levels[L], jobs = []
    const out = mapSetMedia(set, (m, { role }) => {
      if (m.type !== 'raster') return m
      const r = { type: 'raster', src: m.src }
      jobs.push(encode(m.src, { maxDim: role === 'big' ? lv.big : lv.small, quality: lv.q }).then((src) => { r.src = src }))
      return r
    })
    await Promise.all(jobs)
    cache.set(L, out)
    return out
  }
  const last = levels.length - 1
  if (!(await fits(await at(last)))) return { set: await at(last), level: last, fits: false, levels: levels.length }
  let lo = 0, hi = last // hi passt immer
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (await fits(await at(mid))) hi = mid
    else lo = mid + 1
  }
  return { set: await at(hi), level: hi, fits: true, levels: levels.length }
}

/** Quiz ohne Fotos (Graphen/SVGs bleiben) */
export const withoutRasters = (set) => mapSetMedia(set, (m) => (m.type === 'raster' ? null : m))
