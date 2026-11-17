<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { state, uid } from '../lib/store.js'
import { go } from '../lib/router.js'
import { parseClassCsv, applyClassCsv, decodeCsvBytes, displayNames } from '../lib/format.js'
import { toast } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'

// CSV-Import: Spalten „Klasse“, „Nachname“, „Vorname“ (z. B. Export aus der Schulverwaltung / Excel)
const csvInput = ref(null)
const csv = ref(null)
const fullName = ref(false) // Standard: „Vorname N.“ – datensparsam auf gedruckten Karten
const exists = (name) => state.classes.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())
function pickCsv(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (f) readCsv(f)
}
async function readCsv(f) {
  try {
    const text = decodeCsvBytes(new Uint8Array(await f.arrayBuffer()))
    csv.value = parseClassCsv(text, f.name.replace(/\.[^.]+$/, ''))
  } catch (err) { toast(err.message, 'bad', 5000) }
}
// Drag & Drop: Datei irgendwo auf die Seite ziehen
const dragging = ref(false)
let depth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
const onEnter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; dragging.value = true }
const onOver = (e) => { if (hasFiles(e)) e.preventDefault() }
const onLeave = () => { if (--depth <= 0) { depth = 0; dragging.value = false } }
const onDrop = (e) => {
  if (!hasFiles(e)) return
  e.preventDefault(); depth = 0; dragging.value = false
  const f = e.dataTransfer.files[0]
  if (f) readCsv(f)
}
onMounted(() => { for (const [n, h] of [['dragenter', onEnter], ['dragover', onOver], ['dragleave', onLeave], ['drop', onDrop]]) window.addEventListener(n, h) })
onBeforeUnmount(() => { for (const [n, h] of [['dragenter', onEnter], ['dragover', onOver], ['dragleave', onLeave], ['drop', onDrop]]) window.removeEventListener(n, h) })

function importCsv() {
  const r = applyClassCsv(state, csv.value, { fullName: fullName.value })
  toast(`${r.created} Klassen neu · ${r.added} Personen übernommen`, 'ok')
  csv.value = null
}

function create() {
  const c = { id: uid(), name: 'Neue Klasse', students: [] }
  state.classes.push(c)
  go('/class/' + c.id)
}
const count = (c) => c.students.filter((s) => s.name.trim()).length
</script>
<template>
  <div class="topbar"><div class="topbar-title pl-1">Klassen</div><div class="flex gap-2"><button class="btn" @click="csvInput.click()"><Icon name="upload" class="size-4" />CSV</button><button class="btn btn-primary" @click="create"><Icon name="plus" class="size-4" />Klasse</button></div></div>
  <input ref="csvInput" type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" @change="pickCsv" />
  <main class="page space-y-4">
    <p class="text-sm text-muted">Jede Person bekommt eine feste Kartennummer. Druck die Karten einmal aus – sie passen für alle Quizze.</p>
    <div v-if="!state.classes.length" class="panel py-10 text-center text-muted">
      <div class="mb-2 text-4xl">🧑‍🏫</div>
      Noch keine Klassen. Ohne Klasse funktioniert Drehmoment anonym mit Kartennummern.
    </div>
    <div v-else class="panel-list">
      <a v-for="c in state.classes" :key="c.id" :href="'#/class/' + c.id" class="flex items-center gap-3 px-4 py-3.5 text-ink no-underline hover:bg-surface-2">
        <span class="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 font-extrabold text-white">{{ c.name.slice(0, 2) }}</span>
        <span class="flex-1"><span class="block font-bold">{{ c.name }}</span><span class="text-sm text-muted">{{ count(c) }} Personen</span></span>
        <Icon name="next" class="text-muted" />
      </a>
    </div>
    <button class="panel flex w-full items-center gap-3 text-left" @click="csvInput.click()">
      <span class="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="upload" /></span>
      <span class="flex-1"><b class="block">Klassen aus CSV importieren</b><span class="text-sm text-muted">Spalten <b>Klasse</b>, <b>Nachname</b>, <b>Vorname</b> – Datei wählen oder einfach hierher ziehen</span></span>
    </button>
  </main>

  <Teleport to="body">
    <div v-if="dragging" class="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/20 p-6 backdrop-blur-sm">
      <div class="rounded-3xl border-4 border-dashed border-brand bg-surface px-10 py-8 text-center shadow-2xl">
        <div class="mb-2 text-5xl">📄</div>
        <b class="block text-lg">CSV hier ablegen</b>
        <span class="text-sm text-muted">Spalten Klasse · Nachname · Vorname</span>
      </div>
    </div>
  </Teleport>

  <Modal v-if="csv" title="Klassen importieren" @close="csv = null">
    <div class="space-y-3">
      <div v-if="csv.warnings.length" class="notice text-sm"><div v-for="w in csv.warnings" :key="w">{{ w }}</div></div>
      <div class="panel-list max-h-80 overflow-auto">
        <details v-for="c in csv.classes" :key="c.name" class="px-4 py-3">
          <summary class="flex cursor-pointer items-center gap-2">
            <b class="flex-1">{{ c.name }}</b>
            <span class="chip" :class="exists(c.name) ? '' : 'chip-brand'">{{ exists(c.name) ? 'ergänzen' : 'neu' }}</span>
            <span class="text-sm text-muted">{{ c.students.length }} Personen</span>
          </summary>
          <ol class="mt-2 columns-2 text-sm text-muted"><li v-for="(n, i) in displayNames(c.students, fullName)" :key="i">{{ n }}</li></ol>
        </details>
      </div>
      <label class="check rounded-2xl bg-surface-2 px-4 py-2">
        <input v-model="fullName" type="checkbox" />
        <span><b class="block">Ganzer Name</b><span class="text-sm text-muted">Standard ist Vorname + Anfangsbuchstabe des Nachnamens (z. B. „Anna M.“) – so steht weniger auf den gedruckten Karten.</span></span>
      </label>
      <p class="text-xs text-muted">Neue Klassen bekommen Karten 1, 2, 3 … alphabetisch nach Nachname. Bei bestehenden Klassen werden nur neue Namen ergänzt – vorhandene Kartennummern bleiben gleich.</p>
      <button class="btn btn-hero btn-lg" @click="importCsv"><Icon name="check" />{{ csv.classes.length }} Klassen übernehmen</button>
    </div>
  </Modal>
</template>
