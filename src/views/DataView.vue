<script setup>
// Daten & Einstellungen: Export/Import der Sitzung, Speicher, App-Installation.
import { ref, computed, onMounted } from 'vue'
import { state } from '../lib/store.js'
import { buildExport, parseImport, applyImport } from '../lib/format.js'
import { shareFile, toast, today } from '../lib/ui.js'
import { QrCollector, importQueryFrom, b64u } from '../lib/share.js'
import { go } from '../lib/router.js'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'

const scope = ref('questions')
const parsed = ref(null)
const importMode = ref('merge')
const fileInput = ref(null)
const confirmReset = ref(false)
const pasted = ref('')
const installEvt = ref(null)
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone

const SCOPES = [
  { id: 'questions', label: 'Nur Fragen', desc: 'Alle Quizze – zum Teilen mit Kolleg:innen' },
  { id: 'classes', label: 'Fragen + Klassen', desc: 'Zusätzlich Klassenlisten mit Namen' },
  { id: 'full', label: 'Alles', desc: 'Inkl. aller Ergebnisse – komplette Sicherung' },
]
const size = computed(() => {
  const bytes = new Blob([JSON.stringify(state)]).size
  return bytes > 1e6 ? (bytes / 1e6).toFixed(1) + ' MB' : Math.ceil(bytes / 1e3) + ' kB'
})

async function exportNow() {
  const data = buildExport(state, { classes: scope.value !== 'questions', sessions: scope.value === 'full' })
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  await shareFile(blob, `drehmoment-${scope.value === 'full' ? 'sicherung' : 'fragen'}-${today()}.json`, 'Drehmoment-Export')
}
async function pick(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  try { parsed.value = parseImport(await f.text()) } catch (err) { toast(err.message, 'bad', 5000) }
}
/** Eingefügter Text: QR-Inhalt (DMQ…, auch mehrere Teile), Link von beliebigem Host oder JSON */
function readPasted() {
  const t = pasted.value.trim()
  if (!t) return
  try {
    if (/^DMQ/.test(t)) {
      const c = new QrCollector()
      let r = null
      for (const line of t.split(/\n+/)) if (line.trim()) r = c.add(line) || r
      if (!r || r.have < r.total) throw new Error(r ? `Es fehlen Teile (${r.have} von ${r.total}).` : 'Code nicht erkannt.')
      pasted.value = ''
      return go('/import?b=' + b64u(r.packet))
    }
    const q = importQueryFrom(t)
    if (q) { pasted.value = ''; return go('/import?' + new URLSearchParams(q.query)) }
    parsed.value = parseImport(t)
    pasted.value = ''
  } catch (err) { toast(err.message, 'bad', 5000) }
}
function doImport() {
  const n = applyImport(state, parsed.value, parsed.value.kind === 'backup' ? importMode.value : 'merge')
  toast(`Importiert: ${n.sets} Quizze · ${n.classes} Klassen · ${n.sessions} Sitzungen`, 'ok')
  parsed.value = null
}
function reset() {
  Object.assign(state, { sets: [], classes: [], sessions: [] })
  confirmReset.value = false
  toast('Alle Daten gelöscht')
}
onMounted(() => {
  if (window.__installEvt) installEvt.value = window.__installEvt
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt.value = e })
})
async function install() { installEvt.value.prompt(); await installEvt.value.userChoice; installEvt.value = null }
const version = __APP_VERSION__
</script>

<template>
  <div class="topbar"><div class="topbar-title pl-1">Mehr</div></div>
  <main class="page space-y-4">
    <a href="#/help" class="panel flex items-center gap-3 text-ink no-underline">
      <span class="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="book" /></span>
      <span class="flex-1"><b class="block">Anleitung & Tipps</b><span class="text-sm text-muted">So klappt das Scannen am besten</span></span>
      <Icon name="next" class="text-muted" />
    </a>
    <a href="#/help?t=agent" class="panel flex items-center gap-3 text-ink no-underline">
      <span class="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white"><Icon name="robot" /></span>
      <span class="flex-1"><b class="block">Für KI-Agenten & Tools</b><span class="text-sm text-muted">Spezifikation, JSON-Schema, Import-Links</span></span>
      <Icon name="next" class="text-muted" />
    </a>

    <div class="section-head"><h2>Exportieren</h2></div>
    <section class="panel space-y-3">
      <label v-for="s in SCOPES" :key="s.id" class="check rounded-2xl border border-line px-4 py-2" :class="scope === s.id ? 'border-brand bg-brand-soft' : ''">
        <input v-model="scope" type="radio" :value="s.id" />
        <span><b class="block">{{ s.label }}</b><span class="text-sm text-muted">{{ s.desc }}</span></span>
      </label>
      <button class="btn btn-primary btn-lg" @click="exportNow"><Icon name="download" />Datei exportieren</button>
    </section>

    <div class="section-head"><h2>Importieren</h2></div>
    <section class="panel">
      <p class="mb-3 text-sm text-muted">Drehmoment-Dateien oder beliebiges Quiz-JSON (z. B. von einer KI).</p>
      <input ref="fileInput" type="file" accept=".json,application/json,text/plain" class="hidden" @change="pick" />
      <button class="btn btn-lg" @click="fileInput.click()"><Icon name="upload" />Datei wählen</button>
      <label class="field-label mt-4">… oder Text einfügen</label>
      <textarea v-model="pasted" rows="3" placeholder="QR-Code-Text (DMQ:…), Drehmoment-Link oder JSON" class="font-mono text-xs" />
      <button class="btn mt-2 w-full" :disabled="!pasted.trim()" @click="readPasted"><Icon name="check" />Einlesen</button>
    </section>

    <div class="section-head"><h2>Einstellungen</h2></div>
    <section class="panel space-y-4">
      <label class="check"><input v-model="state.prefs.gridCards" type="checkbox" />Rasterkarten (5×5, Nr. 1–40) erkennen</label>
      <div>
        <label class="field-label">Scan-Auflösung</label>
        <div class="seg w-full">
          <button v-for="r in [[960, 'Schnell'], [1280, 'Ausgewogen'], [1920, 'Weit']]" :key="r[0]" class="flex-1" :class="{ on: state.prefs.resolution === r[0] }" @click="state.prefs.resolution = r[0]">{{ r[1] }}</button>
        </div>
        <p class="mt-1.5 text-xs text-muted">„Weit“ erkennt kleine Karten in großen Räumen, braucht aber mehr Rechenleistung.</p>
      </div>
      <label class="check"><input v-model="state.prefs.vibrate" type="checkbox" />Vibrieren bei neuer Antwort</label>
    </section>

    <div class="section-head"><h2>App</h2></div>
    <section class="panel space-y-3 text-sm">
      <div class="flex justify-between"><span class="text-muted">Gespeichert</span><span>{{ state.sets.length }} Quizze · {{ state.classes.length }} Klassen · {{ state.sessions.length }} Sitzungen</span></div>
      <div class="flex justify-between"><span class="text-muted">Speicherbedarf</span><span>{{ size }}</span></div>
      <div class="flex justify-between"><span class="text-muted">Version</span><span>{{ version }}</span></div>
      <div class="flex justify-between"><span class="text-muted">Lizenz</span><span>GNU GPL v3 oder später · <a href="#/help">Hinweise &amp; Lizenztexte</a></span></div>
      <button v-if="installEvt && !standalone" class="btn btn-primary w-full" @click="install"><Icon name="download" />Als App installieren</button>
      <p v-else-if="!standalone" class="text-xs text-muted">Tipp: Über „Zum Startbildschirm hinzufügen“ im Browser-Menü wird Drehmoment zur App – und läuft komplett offline.</p>
      <button class="btn btn-danger w-full" @click="confirmReset = true"><Icon name="trash" />Alle Daten löschen</button>
    </section>
  </main>

  <Modal v-if="parsed" title="Importieren" @close="parsed = null">
    <div class="space-y-3">
      <div class="rounded-2xl bg-surface-2 p-4 text-sm">
        <b>{{ parsed.sets.length }}</b> Quizze · <b>{{ parsed.classes.length }}</b> Klassen · <b>{{ parsed.sessions.length }}</b> Sitzungen
      </div>
      <div v-if="parsed.warnings.length" class="notice notice-bad max-h-32 overflow-auto">
        <div v-for="w in parsed.warnings" :key="w">{{ w }}</div>
      </div>
      <div v-if="parsed.kind === 'backup'" class="seg w-full">
        <button class="flex-1" :class="{ on: importMode === 'merge' }" @click="importMode = 'merge'">Zusammenführen</button>
        <button class="flex-1" :class="{ on: importMode === 'replace' }" @click="importMode = 'replace'">Alles ersetzen</button>
      </div>
      <p v-if="importMode === 'replace' && parsed.kind === 'backup'" class="text-sm text-bad">Achtung: Alle vorhandenen Daten werden überschrieben.</p>
      <button class="btn btn-hero btn-lg" @click="doImport"><Icon name="check" />Importieren</button>
    </div>
  </Modal>
  <Modal v-if="confirmReset" title="Alle Daten löschen?" @close="confirmReset = false">
    <p class="mb-4 text-muted">Quizze, Klassen und Ergebnisse werden von diesem Gerät gelöscht. Exportiere vorher eine Sicherung!</p>
    <button class="btn btn-lg btn-danger" @click="reset"><Icon name="trash" />Endgültig löschen</button>
  </Modal>
</template>
