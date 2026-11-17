// Läuft in einem Web Worker, damit die Kamera-Vorschau flüssig bleibt.
import { detectCards } from './detect.js'

self.onmessage = (e) => {
  const { id, gen, buffer, width, height, gridCards = true } = e.data
  const t0 = performance.now()
  let cards = []
  let error = null
  try {
    cards = detectCards(new Uint8ClampedArray(buffer), width, height, { gridCards })
  } catch (err) {
    error = String(err)
  }
  self.postMessage({ id, gen, cards, error, ms: Math.round(performance.now() - t0), width, height })
}
