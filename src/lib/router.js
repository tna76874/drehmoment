// Minimaler Hash-Router (funktioniert statisch & offline, egal unter welchem Pfad).
import { reactive } from 'vue'

export const route = reactive({ path: '/', parts: [], query: {} })

function parse() {
  const h = location.hash.replace(/^#/, '') || '/'
  const [path, qs] = h.split('?')
  route.path = path
  route.parts = path.split('/').filter(Boolean)
  route.query = Object.fromEntries(new URLSearchParams(qs || ''))
}
window.addEventListener('hashchange', parse)
parse()

export const go = (path) => { location.hash = path }
export const back = (fallback = '/') => (history.length > 1 ? history.back() : go(fallback))
