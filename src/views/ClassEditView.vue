<script setup>
import { ref, computed } from 'vue'
import { state, getClass } from '../lib/store.js'
import { route, go } from '../lib/router.js'
import { toast } from '../lib/ui.js'
import { formatGid } from '../lib/gid.js'
import Icon from '../components/Icon.vue'

const cls = computed(() => getClass(route.parts[1]))
const bulk = ref('')
const showBulk = ref(false)

function addStudent() {
  const used = new Set(cls.value.students.map((s) => s.card))
  let n = 1
  while (used.has(n)) n++
  cls.value.students.push({ card: n, name: '' })
  cls.value.students.sort((a, b) => a.card - b.card)
}
function importBulk() {
  const names = bulk.value.split(/\r?\n|;|,(?=\s*[A-ZÄÖÜ])/).map((s) => s.trim()).filter(Boolean)
  const used = new Set(cls.value.students.map((s) => s.card))
  let n = 1
  for (const name of names) {
    while (used.has(n)) n++
    cls.value.students.push({ card: n, name }); used.add(n)
  }
  cls.value.students.sort((a, b) => a.card - b.card)
  toast(`${names.length} Namen übernommen`, 'ok')
  bulk.value = ''; showBulk.value = false
}
function sortAlpha() {
  if (!confirm('Namen alphabetisch sortieren und Karten 1, 2, 3 … neu vergeben? Bereits ausgeteilte Karten mit Namen passen dann nicht mehr.')) return
  const list = cls.value.students.filter((s) => s.name.trim()).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  cls.value.students = list.map((s, i) => ({ card: i + 1, name: s.name, ...(s.gid ? { gid: s.gid } : {}) })) // feste Schüler-ID bleibt
}
function remove() {
  if (!confirm(`Klasse „${cls.value.name}“ löschen?`)) return
  state.classes.splice(state.classes.indexOf(cls.value), 1)
  go('/classes')
}
const dupes = computed(() => {
  const seen = new Set(), d = new Set()
  for (const s of cls.value?.students || []) { if (seen.has(s.card)) d.add(s.card); seen.add(s.card) }
  return d
})
</script>
<template>
  <div v-if="!cls" class="page">Klasse nicht gefunden. <a href="#/classes">Zurück</a></div>
  <template v-else>
    <div class="topbar">
      <a href="#/classes" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
      <div class="topbar-title">{{ cls.name }}</div>
      <a :href="'#/cards?class=' + cls.id" class="btn"><Icon name="print" class="size-4" />Karten</a>
    </div>
    <main class="page space-y-4">
      <section class="panel">
        <label class="field-label">Name der Klasse</label>
        <input v-model="cls.name" type="text" />
      </section>

      <div class="section-head mb-0!">
        <h2>Personen <span class="text-muted">· {{ cls.students.length }}</span></h2>
        <div class="flex gap-1">
          <button class="btn btn-sm btn-ghost" @click="showBulk = !showBulk">Liste einfügen</button>
          <button class="btn btn-sm btn-ghost" :disabled="cls.students.length < 2" @click="sortAlpha">A–Z</button>
        </div>
      </div>
      <section v-if="showBulk" class="panel space-y-2">
        <textarea v-model="bulk" rows="6" placeholder="Ein Name pro Zeile (z. B. aus einer Tabelle kopiert)" />
        <button class="btn btn-primary w-full" :disabled="!bulk.trim()" @click="importBulk">Übernehmen</button>
      </section>

      <div class="panel-list">
        <div v-for="(s, i) in cls.students" :key="i" class="flex items-center gap-2 px-3 py-2">
          <input v-model.number="s.card" type="number" min="1" max="999" class="w-20! text-center font-bold" :class="dupes.has(s.card) ? 'border-bad! text-bad' : ''" aria-label="Kartennummer" />
          <input v-model="s.name" type="text" placeholder="Name" />
          <span v-if="s.gid" class="chip shrink-0 font-mono text-xs" title="Feste Schüler-Karte – gilt bei allen Lehrkräften">{{ formatGid(s.gid) }}</span>
          <button class="btn btn-ghost btn-icon text-muted" aria-label="Entfernen" @click="cls.students.splice(i, 1)">✕</button>
        </div>
        <div v-if="!cls.students.length" class="p-6 text-center text-sm text-muted">Noch niemand in der Klasse.</div>
      </div>
      <p v-if="cls.students.some((s) => s.gid)" class="text-xs text-muted">Personen mit Kennung (z. B. <span class="font-mono">{{ formatGid(cls.students.find((s) => s.gid).gid) }}</span>) haben eine <b>feste Schüler-Karte</b>, die bei allen Lehrkräften gleich ist. Ihre Nummernkarte funktioniert zusätzlich.</p>
      <p v-if="dupes.size" class="notice notice-bad">Kartennummer doppelt vergeben: {{ [...dupes].join(', ') }}</p>
      <button class="btn w-full" @click="addStudent"><Icon name="plus" class="size-4" />Person hinzufügen</button>
      <button class="btn btn-ghost btn-danger w-full" @click="remove"><Icon name="trash" class="size-4" />Klasse löschen</button>
    </main>
  </template>
</template>
