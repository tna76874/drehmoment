// Projekt-Regeln, die sonst unbemerkt kaputtgehen könnten:
//  - kein Markenname des kommerziellen Karten-Systems irgendwo im Projekt
//  - Doku/Hilfe passen zum Stand (keine entfernten Optionen mehr, neues Kartenformat dokumentiert)
//  - der gesicherte Build (Tests vor dist/) ist überall verdrahtet: npm, Makefile, Docker, CI
//   node test/project.test.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let ok = 0
const t = (name, fn) => { fn(); ok++; console.log('  ✓', name) }
const read = (f) => readFileSync(f, 'utf8')
const SKIP = new Set(['node_modules', '.ai-pod', '.git', 'dist', '.dist-pruefung', 'out', 'ANDERES_PROJEKT_AUS_DEM_KLASSENLINKS_ERSTELLT_WERDEN_SOLLEN'])
function* files(dir) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (!/\.(png|ico|jpg|pdf|y4m|pgm)$/.test(f)) yield p
  }
}
const BRAND = new RegExp(['pli', 'ckers?'].join(''), 'i') // Wort nicht ausschreiben

t('kein Markenname in Quellcode, Tests, Doku, Build-Dateien (Dateinamen und Inhalte)', () => {
  const hits = []
  for (const f of files('.')) { if (BRAND.test(f) || BRAND.test(read(f))) hits.push(f) }
  assert.deepEqual(hits, [])
})

t('llms.txt/Hilfe/Werkzeugkasten: alte Kartenoptionen entfernt, gedrehte Karten dokumentiert', () => {
  const llms = read('public/llms.txt'), kit = read('src/kit.js'), help = read('src/views/HelpView.vue'), cards = read('src/views/CardsView.vue')
  for (const s of ['--backs', '--per-page', 'perPage']) { assert.ok(!llms.includes(s), 'llms.txt: ' + s); assert.ok(!kit.includes("flag('" + s.slice(2)), 'kit: ' + s) }
  assert.ok(!/--per-page|--backs/.test(kit.slice(kit.lastIndexOf('Drehmoment-Werkzeugkasten'))), 'Hilfe des Werkzeugkastens')
  for (const s of ['`DM+', '`DM.', '`DM/', 'cardRotation']) assert.ok(llms.includes(s), 'llms.txt erwähnt ' + s)
  assert.ok(!/AnswerCardBack|cardBacks|cardsPerPage|Rückseite bedrucken|Karten pro A4-Seite/.test(cards), 'Kartenseite ohne alte Optionen')
  assert.ok(!/1 pro Seite|„groß“ drucken/.test(help))
  assert.ok(!/AnswerCardBack|backLayout|drawBack/.test([...files('src')].map(read).join('\n')), 'Rückseiten-Code entfernt')
})

t('Scanner zeigt beim Erfassen keine Antwortfarben (Farben nur über „Antworten zeigen“)', () => {
  const sc = read('src/components/Scanner.vue')
  assert.ok(!/COLORS\[c\.answer\]/.test(sc), 'Kamerabild-Markierung darf nicht nach Antwort färben')
  assert.ok(/cardMark\(/.test(sc), 'Markierung kommt aus cardMark (getestet in scanlogic.test.mjs)')
  assert.equal(sc.split('COLORS[').length, sc.split('COLORS[responses[s.card]]').length, 'Antwortfarbe nur in der Kachel')
  assert.ok(/responses\[s\.card\] && showLetters \? \{ background: COLORS/.test(sc), '… und dort nur mit „Antworten zeigen“')
  assert.ok(/joy\(\)/.test(sc), 'Freude-Animation')
})

t('Gesicherter Build überall verdrahtet: npm, Makefile, Docker, CI', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs')
  const b = read('scripts/build.mjs')
  assert.ok(b.indexOf("run(['scripts/test.mjs'])") < b.indexOf("'build', '--outDir', STAGE"), 'Unit-Tests vor dem Build')
  assert.ok(b.indexOf("'--e2e'") < b.indexOf("renameSync(STAGE, 'dist')"), 'Browser-Tests vor dist/')
  assert.ok(!/outDir', 'dist'/.test(b), 'nie direkt nach dist/ bauen')
  // Im Docker-Build fehlen Makefile/Dockerfile (.dockerignore) – dort geprüft werden sie lokal und in CI
  const inDocker = process.env.DM_IN_DOCKER === '1'
  for (const f of ['Makefile', 'Dockerfile']) if (!existsSync(f)) assert.ok(inDocker, f + ' fehlt')
  if (existsSync('Makefile')) assert.match(read('Makefile'), /build-local:[^\n]*\n\tnpm run build/)
  if (existsSync('Dockerfile')) {
  const df = read('Dockerfile')
  assert.match(df, /FROM \$\{NODE_IMAGE\} AS build[\s\S]*RUN npm run build/)
  assert.ok(!/RUN npx vite build|RUN vite build/.test(df))
  assert.match(df, /COPY --from=build \/src\/dist \/usr\/share\/nginx\/html/)
  assert.match(df, /poppler-utils/); assert.match(df, /playwright install --with-deps chromium/)
  assert.match(df, /ENV DM_IN_DOCKER=1/)
  }
  const ci = read('.github/workflows/pages.yml')
  assert.match(ci, /run: npm run build/); assert.ok(!/vite build/.test(ci)); assert.match(ci, /poppler-utils/); assert.match(ci, /playwright install/)
  assert.ok(ci.indexOf('npm run build') < ci.indexOf('upload-pages-artifact'))
  const runner = read('scripts/test.mjs')
  assert.match(runner, /readdirSync\('test'\)/, 'Tests werden automatisch gefunden')
})

t('Test-Runner findet alle Testdateien (Unit + Browser)', () => {
  const all = readdirSync('test').filter((f) => f.endsWith('.test.mjs'))
  for (const f of ['cardcode', 'compat', 'csv', 'detect', 'gridcards', 'media', 'pdf', 'print', 'project', 'scanlogic']) assert.ok(all.includes(f + '.test.mjs'), f)
  for (const f of ['e2e', 'e2e-media', 'e2e-scan', 'e2e-kit', 'e2e-lock']) assert.ok(all.includes(f + '.test.mjs'), f)
})

console.log(`\n✓ ${ok} Projekt-Tests bestanden`)
