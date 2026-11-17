<script setup>
// Import per Link (alle Formate bleiben für immer gültig, Host egal):
//   #/import?b=<Paket> (QR, seit 0.2) | ?z=<komprimiert> (QR, 0.1) | ?q=DMQ:… | ?url=<JSON-URL> | ?d=<base64url-JSON> | ?json=<URI-kodiertes JSON>
// Gedacht für KI-Agenten und externe Tools, die ein fertiges Quiz – oder Klassenlisten – als Link übergeben.
import { ref, onMounted } from 'vue'
import { state, startSession, getSet } from '../lib/store.js'
import { resolveImport, fingerprint } from '../lib/share.js'
import { parseImport, applyImport, mergeClasses } from '../lib/format.js'
import { route, go } from '../lib/router.js'
import { toast } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import SetPreview from '../components/SetPreview.vue'
import StartModal from '../components/StartModal.vue'

const parsed = ref(null)
const error = ref('')
const loading = ref(false)
const source = ref('')
const starting = ref(null)

onMounted(async () => {
  try {
    loading.value = !!route.query.url; source.value = route.query.url || ''
    const r = await resolveImport(route.query, parseImport)
    parsed.value = r.parsed; source.value = r.source
    if (route.query.start && r.parsed.kind === 'set') return quickStart()
  } catch (e) {
    error.value = (e.name === 'TypeError' ? 'Die Adresse ist nicht erreichbar oder erlaubt keinen Abruf (CORS). ' : '') + e.message
  } finally { loading.value = false }
})

const classExists = (name) => state.classes.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())
function saveClasses() {
  const n = mergeClasses(state, parsed.value.classes)
  toast(`${n.created} Klassen neu · ${n.added} Personen übernommen${n.linked ? ` · ${n.linked} mit Schüler-Karte verknüpft` : ''}`, 'ok')
  go('/classes')
}

// QR-Code mit start=1: Quiz übernehmen (ohne Duplikat) und sofort loslegen
function quickStart() {
  const set = parsed.value.sets[0]
  set.id = fingerprint(set)
  if (!getSet(set.id)) state.sets.unshift(set)
  if (state.classes.length) { starting.value = set.id; return } // nur noch Klasse antippen
  const s = startSession(set.id, null)
  go('/live/' + s.id)
}

function save(start) {
  const p = parsed.value
  if (p.kind === 'backup') {
    const n = applyImport(state, p, 'merge')
    toast(`Importiert: ${n.sets} Quizze, ${n.classes} Klassen, ${n.sessions} Sitzungen`, 'ok')
    return go('/')
  }
  for (const s of p.sets) state.sets.unshift(s)
  toast('Quiz gespeichert', 'ok')
  if (start) starting.value = p.sets[0].id
  else go('/set/' + p.sets[0].id)
}
</script>

<template>
  <div class="topbar">
    <a href="#/" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
    <div class="topbar-title">Import</div>
  </div>
  <main class="page space-y-4">
    <div v-if="loading" class="panel py-10 text-center text-muted">Lade {{ source }} …</div>
    <div v-if="error" class="notice notice-bad">{{ error }}</div>
    <template v-if="parsed">
      <div class="notice">Von {{ source.length > 60 ? source.slice(0, 60) + '…' : source }} · {{ parsed.kind === 'backup' ? 'Sicherung' : parsed.kind === 'classes' ? parsed.classes.length + ' Klassen' : parsed.sets.length + ' Quiz' }}</div>
      <div v-if="parsed.warnings.length" class="notice notice-bad">
        <b>Hinweise:</b>
        <ul class="mt-1 list-disc pl-5"><li v-for="w in parsed.warnings" :key="w">{{ w }}</li></ul>
      </div>
      <section v-for="s in parsed.sets" :key="s.id" class="panel"><SetPreview :set="s" /></section>
      <div v-if="parsed.kind === 'backup'" class="panel text-sm">
        {{ parsed.sets.length }} Quizze · {{ parsed.classes.length }} Klassen · {{ parsed.sessions.length }} Sitzungen
      </div>
      <template v-if="parsed.kind === 'classes'">
        <section v-for="c in parsed.classes" :key="c.name" class="panel">
          <div class="mb-2 flex items-center gap-2">
            <b class="flex-1 text-lg">{{ c.name }}</b>
            <span class="chip" :class="classExists(c.name) ? '' : 'chip-brand'">{{ classExists(c.name) ? 'ergänzen' : 'neu' }}</span>
            <span class="text-sm text-muted">{{ c.students.length }} Personen</span>
          </div>
          <ol class="columns-2 text-sm"><li v-for="(st, i) in c.students" :key="i"><span class="text-muted tabular-nums">{{ st.gid ? '🪪' : st.card }}</span> · {{ st.name }}</li></ol>
        </section>
        <p class="text-xs text-muted">Bestehende Klassen werden nur ergänzt – vorhandene Kartennummern bleiben gleich.<template v-if="parsed.classes.some((c) => c.students.some((s) => s.gid))"> 🪪 = feste Schüler-Karte: gleiche Person, gleiche Karte – bei allen Lehrkräften. Druck unter „Karten“.</template></p>
        <button class="btn btn-hero btn-lg" @click="saveClasses"><Icon name="check" />Klassen übernehmen</button>
      </template>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <button class="btn btn-lg" @click="save(false)"><Icon name="check" />Speichern</button>
        <button v-if="parsed.kind === 'set'" class="btn btn-hero btn-lg" @click="save(true)"><Icon name="play" class="fill-current" />Speichern & starten</button>
      </div>
    </template>
  </main>
  <StartModal v-if="starting" :set-id="starting" @close="starting = null; go('/')" />
</template>
