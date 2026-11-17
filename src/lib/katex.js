// KaTeX-Darstellung in der App (wird erst geladen, wenn eine Formel angezeigt wird).
import { ref } from 'vue'
import { splitMath } from './math.js'

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

let katex = null, loading = null
export const katexReady = ref(false)
export function loadKatex() {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([k]) => import('katex/contrib/mhchem').then(() => k))
      .then((k) => { katex = k.default || k; katexReady.value = true })
  }
  return loading
}

/** Sicheres HTML (Text escaped, Formeln per KaTeX). Ohne geladenes KaTeX: Formel als Quelltext. */
export function mathHtml(text) {
  return splitMath(text).map((p) => {
    if (p.text !== undefined) return esc(p.text)
    if (!katex) return `<code>${esc(p.tex)}</code>`
    try {
      // \displaystyle: Brüche/Summen auch im Fließtext in voller Größe (gut lesbar am Beamer)
      return katex.renderToString(p.display ? p.tex : '\\displaystyle ' + p.tex, { displayMode: p.display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml', trust: false })
    } catch { return `<code>${esc(p.tex)}</code>` }
  }).join('')
}

