// Führt ALLE Tests aus (test/*.test.mjs werden automatisch gefunden – neue Tests können nicht vergessen werden).
//   node scripts/test.mjs          Unit-Tests (alles außer e2e-*)
//   node scripts/test.mjs --e2e    Browser-/Build-Tests (e2e-*) gegen DM_DIST (Standard: dist)
// Bricht beim ersten Fehler ab (Exit-Code 1).
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const e2e = process.argv.includes('--e2e')
const files = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).filter((f) => f.startsWith('e2e') === e2e).sort()
if (!files.length) { console.error('Keine Tests gefunden'); process.exit(1) }
const t0 = Date.now()
for (const f of files) {
  console.log(`\n━━ ${f}`)
  const r = spawnSync(process.execPath, ['test/' + f], { stdio: 'inherit', env: process.env })
  if (r.status !== 0) { console.error(`\n✗ ${f} fehlgeschlagen (Exit ${r.status ?? r.signal})`); process.exit(1) }
}
console.log(`\n✓ ${files.length} Testdateien (${e2e ? 'Browser/Build' : 'Unit'}) bestanden in ${Math.round((Date.now() - t0) / 1000)} s`)
