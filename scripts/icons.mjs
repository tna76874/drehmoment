// Erzeugt public/icon-192.png und public/icon-512.png aus public/icon.svg (Playwright)
//   node scripts/icons.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const b = await chromium.launch()
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  await p.setContent(`<style>*{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg.replace(/rx="112"/, 'rx="0"')}`)
  await p.screenshot({ path: `public/icon-${s}.png`, omitBackground: true })
}
await b.close()
