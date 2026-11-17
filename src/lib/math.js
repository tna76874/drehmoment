// LaTeX-Formeln in Texten: $…$, $$…$$, \(…\), \[…\]  (\$ = echtes Dollarzeichen)
// Regeln für $…$ wie in Pandoc: nach dem öffnenden $ kein Leerzeichen, vor dem schließenden $ keins
// und direkt danach keine Ziffer – so bleiben Preise wie „5 $ und 3 $“ normaler Text.
// Reine Funktionen (ohne Vue/KaTeX) – auch im Agenten-Werkzeugkasten und in Node nutzbar.

/** @returns {({text:string}|{tex:string, display:boolean})[]} */
export function splitMath(input) {
  const s = String(input ?? '')
  const out = []
  let buf = '', i = 0
  const push = (m) => { if (buf) out.push({ text: buf }); buf = ''; out.push(m) }
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue }
    let m = null
    if (s.startsWith('$$', i)) {
      const e = s.indexOf('$$', i + 2)
      if (e > i + 2) m = { tex: s.slice(i + 2, e), display: true, end: e + 2 }
    } else if (s.startsWith('\\[', i) || s.startsWith('\\(', i)) {
      const close = s[i + 1] === '[' ? '\\]' : '\\)'
      const e = s.indexOf(close, i + 2)
      if (e > i + 2) m = { tex: s.slice(i + 2, e), display: close === '\\]', end: e + 2 }
    } else if (s[i] === '$' && s[i + 1] && !/\s/.test(s[i + 1])) {
      let e = i + 1
      while ((e = s.indexOf('$', e)) > 0) {
        if (s[e - 1] !== '\\' && !/\s/.test(s[e - 1]) && !/\d/.test(s[e + 1] || '')) break
        e++
      }
      if (e > i + 1) m = { tex: s.slice(i + 1, e), display: false, end: e + 1 }
    }
    if (m) { push({ tex: m.tex.trim(), display: m.display }); i = m.end } else { buf += s[i]; i++ }
  }
  if (buf) out.push({ text: buf })
  return out
}

export const hasMath = (s) => /\$|\\\(|\\\[/.test(String(s ?? '')) && splitMath(s).some((p) => p.tex !== undefined)

/** Formeln als einfacher Text (für Titel, Dateinamen …): $\\frac{1}{2}$ -> 1/2 */
export function plainMath(text) {
  return splitMath(text).map((p) => {
    if (p.text !== undefined) return p.text
    let t = p.tex
    for (let i = 0; i < 5; i++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => (a.length > 1 ? `(${a})` : a) + '/' + (b.length > 1 ? `(${b})` : b))
    return t.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)').replace(/\\(cdot|times)/g, '·').replace(/\^\{?2\}?/g, '²').replace(/\^\{?3\}?/g, '³')
      .replace(/\\(text|mathrm|ce)\{([^{}]*)\}/g, '$2').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  }).join('')
}
