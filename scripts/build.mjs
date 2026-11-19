// Gesicherter Build: Es entsteht nur dann ein fertiges dist/, wenn ALLE Tests bestehen.
//   1. Unit-Tests          (test/*.test.mjs ohne e2e-*)
//   2. vite build          -> .dist-pruefung/ (Zwischenstand, NICHT dist/)
//   3. Browser-/Build-Tests (test/e2e-*.test.mjs) gegen genau diesen Zwischenstand
//   4. erst dann: .dist-pruefung/ -> dist/
// Schlägt etwas fehl, bleibt dist/ unverändert und der Zwischenstand wird gelöscht.
import { spawnSync } from 'node:child_process'
import { rmSync, renameSync, existsSync } from 'node:fs'

const STAGE = '.dist-pruefung'
const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) { rmSync(STAGE, { recursive: true, force: true }); console.error('\n✗ Build abgebrochen – dist/ bleibt unverändert.'); process.exit(1) }
}
const vite = 'node_modules/vite/bin/vite.js'
rmSync(STAGE, { recursive: true, force: true })
console.log('▶ 1/3 Unit-Tests'); run(['scripts/test.mjs'])
console.log('\n▶ 2/3 Build (Zwischenstand)'); run([vite, 'build', '--outDir', STAGE, '--emptyOutDir']); run([vite, 'build', '-c', 'vite.kit.config.js'], { DM_OUT: STAGE })
console.log('\n▶ 3/3 Browser- und Build-Tests gegen den Zwischenstand'); run(['scripts/test.mjs', '--e2e'], { DM_DIST: STAGE })
if (existsSync('dist')) rmSync('dist', { recursive: true, force: true })
renameSync(STAGE, 'dist')
console.log('\n✓ Alle Tests bestanden – dist/ ist fertig.')
