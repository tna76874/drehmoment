// Kleine UI-Helfer: Toasts, Bestätigungen, Datei-Download/Teilen, Zwischenablage
import { reactive } from 'vue'

export const toasts = reactive([])
export function toast(text, kind = 'info', ms = 2800) {
  const t = { id: Math.random(), text, kind }
  toasts.push(t)
  setTimeout(() => { const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1) }, ms)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Datei speichern; auf Mobilgeräten optional über das Teilen-Menü */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return true } catch (e) { if (e.name === 'AbortError') return true }
  }
  downloadBlob(blob, filename)
  return false
}

export const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }) } catch { return false }
}

export const today = () => new Date().toISOString().slice(0, 10)
export const slug = (s) => String(s).toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'export'
export const fmtDate = (ts) => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
