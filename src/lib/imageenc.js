// Fotos im Browser verkleinern/neu kodieren (Canvas). WebP, wo der Browser es kodieren kann, sonst JPEG.
// WebP ist bei gleicher Qualität ~25–35 % kleiner als JPEG (siehe test/imagefit.e2e.mjs).

const cache = new Map() // `${src.length}:${hash}|${maxDim}|${q}` -> Promise<dataURL>
let webpOk = null

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
    img.src = src
  })
}
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q))
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(fr.result)
  fr.onerror = () => reject(fr.error)
  fr.readAsDataURL(blob)
})

/** Schrittweises Halbieren -> deutlich schärfer als ein einzelnes drawImage bei starker Verkleinerung */
function drawScaled(img, w, h) {
  let src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height
  while (sw / 2 > w * 1.2) {
    const c = document.createElement('canvas')
    c.width = Math.round(sw / 2); c.height = Math.round(sh / 2)
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height)
    src = c; sw = c.width; sh = c.height
  }
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const x = c.getContext('2d')
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h) // Transparenz -> weiß (JPEG)
  x.imageSmoothingQuality = 'high'
  x.drawImage(src, 0, 0, w, h)
  return c
}

/**
 * Bild (Daten-URL oder Blob-URL) verkleinern und neu kodieren.
 * Ist das Original schon klein genug und kleiner als das Ergebnis, bleibt es unverändert.
 * @returns {Promise<string>} Daten-URL
 */
export function encodeRaster(src, { maxDim = 1000, quality = 0.8 } = {}) {
  const key = `${src.length}:${src.slice(-48)}|${maxDim}|${quality}`
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const img = await loadImage(src)
      const iw = img.naturalWidth, ih = img.naturalHeight
      const s = Math.min(1, maxDim / Math.max(iw, ih))
      const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s))
      const canvas = drawScaled(img, w, h)
      let blob = null
      if (webpOk !== false) { blob = await toBlob(canvas, 'image/webp', quality); webpOk = blob?.type === 'image/webp'; if (!webpOk) blob = null }
      if (!blob) blob = await toBlob(canvas, 'image/jpeg', quality)
      const out = await blobToDataUrl(blob)
      return s === 1 && src.startsWith('data:image/') && src.length <= out.length ? src : out
    })())
    if (cache.size > 200) cache.delete(cache.keys().next().value)
  }
  return cache.get(key)
}

/** Datei (Foto-Auswahl, Einfügen) -> Medien-Objekt für die Frage (max. 1000 px, ~100 kB) */
export async function fileToMedia(file, { maxDim = 1000, quality = 0.78 } = {}) {
  if (file.type === 'image/svg+xml') {
    const { normalizeMedia } = await import('./media.js')
    const m = normalizeMedia(await file.text())
    if (!m) throw new Error('SVG konnte nicht gelesen werden.')
    return m
  }
  if (!file.type.startsWith('image/')) throw new Error('Bitte ein Bild wählen.')
  const url = URL.createObjectURL(file)
  try {
    let src = await encodeRaster(url, { maxDim, quality })
    // sehr detailreiche Bilder: noch einmal kleiner, damit der Gerätespeicher reicht
    if (src.length > 220000) src = await encodeRaster(url, { maxDim: 800, quality: 0.68 })
    return { type: 'raster', src }
  } finally { URL.revokeObjectURL(url) }
}

/** Bild -> Graustufen (verkleinert auf maxDim) für das Vektorisieren */
export async function imageToGray(src, maxDim = 600) {
  const { rgbaToGray } = await import('./trace.js')
  const img = await loadImage(src)
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s))
  const c = drawScaled(img, w, h)
  return { gray: rgbaToGray(c.getContext('2d').getImageData(0, 0, w, h).data, w, h), w, h }
}

/** Bild -> RGBA (verkleinert) für das mehrfarbige Vektorisieren */
export async function imageToRgba(src, maxDim = 500) {
  const img = await loadImage(src)
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s))
  return { rgba: drawScaled(img, w, h).getContext('2d').getImageData(0, 0, w, h).data, w, h }
}
