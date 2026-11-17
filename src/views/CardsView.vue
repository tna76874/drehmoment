<script setup>
import { ref, computed } from 'vue'
import { state, getClass } from '../lib/store.js'
import { route } from '../lib/router.js'
import { cardsPdf } from '../lib/pdf.js'
import { downloadBlob, toast } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import AnswerCard from '../components/AnswerCard.vue'
import AnswerCardBack from '../components/AnswerCardBack.vue'

const source = ref(route.query.class || 'range')
const from = ref(1)
const to = ref(Math.max(30, state.prefs.anonymousCards))
const busy = ref(false)
const LAYOUTS = [[1, 'groß', '19 cm'], [2, 'mittel', '14 cm'], [6, 'kompakt', '9 cm']]

// Feste Schüler-Karten: gleiche Karte für dieselbe Person bei allen Lehrkräften (ID z. B. aus der Schulverwaltung)
const useGid = ref(true)
const cls = computed(() => source.value !== 'range' && getClass(source.value))
const gidCount = computed(() => (cls.value ? cls.value.students.filter((s) => s.name.trim() && s.gid).length : 0))
const only = ref('') // Teil der Klasse: kommagetrennte Kartennummern / Namen (leer = alle)
const cards = computed(() => {
  const c = cls.value
  if (c) {
    const want = only.value.split(/[,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
    return c.students.filter((s) => s.name.trim())
      .filter((s) => !want.length || want.some((w) => String(s.card) === w || s.name.toLowerCase().includes(w)))
      .map((s) => ({ card: s.card, name: s.name, ...(useGid.value && s.gid ? { gid: s.gid } : {}) }))
  }
  const a = Math.max(1, Math.min(999, from.value | 0)), b = Math.max(a, Math.min(999, to.value | 0))
  return Array.from({ length: b - a + 1 }, (_, i) => ({ card: a + i, name: '' }))
})
const preview = computed(() => cards.value.slice(0, 6))

async function download() {
  busy.value = true
  await new Promise((r) => setTimeout(r, 30))
  try {
    const doc = cardsPdf(cards.value, state.prefs.cardsPerPage, { backs: state.prefs.cardBacks })
    const name = cls.value ? `drehmoment-karten-${cls.value.name}` : `drehmoment-karten-${cards.value[0].card}-${cards.value.at(-1).card}`
    downloadBlob(doc.output('blob'), name.replace(/[^\w-]+/g, '_') + '.pdf')
    toast('PDF erstellt', 'ok')
  } finally { busy.value = false }
}
</script>
<template>
  <div class="topbar"><div class="topbar-title pl-1">Antwortkarten</div></div>
  <main class="page space-y-4">
    <section class="panel flex gap-4">
      <div class="relative mt-2 ml-2 w-24 shrink-0 sm:w-28">
        <div v-if="state.prefs.cardBacks" class="absolute inset-0 -translate-x-2 -translate-y-1 -rotate-[14deg] drop-shadow-lg"><AnswerCardBack :card="7" /></div>
        <div class="relative translate-x-2 translate-y-2 rotate-[4deg] drop-shadow-xl"><AnswerCard :card="7" /></div>
      </div>
      <div class="text-sm">
        <p class="mb-2 font-bold text-base">So funktioniert's</p>
        <p class="text-muted">Die Antwort ist der Buchstabe, der <b class="text-ink">oben</b> steht. Karte drehen, hochhalten – fertig. Die Kamera liest alle Karten gleichzeitig.</p>
        <p class="mt-2 text-muted">Karte <b class="text-ink">7</b> ist immer Karte 7: einmal drucken (gerne laminieren) und immer wieder verwenden.</p>
      </div>
    </section>

    <section class="panel space-y-4">
      <div>
        <label class="field-label">Welche Karten?</label>
        <select v-model="source">
          <option value="range">Nummernbereich</option>
          <option v-for="c in state.classes" :key="c.id" :value="c.id">Klasse {{ c.name }} (mit Namen)</option>
        </select>
      </div>
      <template v-if="cls">
        <label v-if="gidCount" class="check rounded-2xl bg-surface-2 px-4 py-2">
          <input v-model="useGid" type="checkbox" />
          <span><b class="block">Feste Schüler-Karten ({{ gidCount }} von {{ cls.students.filter((s) => s.name.trim()).length }})</b><span class="text-sm text-muted">Empfohlen: Jede Person hat <b>eine</b> Karte für alle Fächer – auch wenn andere Lehrkräfte sie drucken oder austeilen. Personen ohne ID bekommen ihre Nummernkarte.</span></span>
        </label>
        <div>
          <label class="field-label">Nur einzelne Personen (optional)</label>
          <input v-model="only" type="text" placeholder="z. B. 3, 7 oder Anna, Ben – leer = alle" />
        </div>
      </template>
      <div v-if="source === 'range'" class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Von</label><input v-model.number="from" type="number" min="1" max="999" /></div>
        <div><label class="field-label">Bis</label><input v-model.number="to" type="number" min="1" max="999" /></div>
      </div>
      <div>
        <label class="field-label">Karten pro A4-Seite</label>
        <div class="seg w-full">
          <button v-for="l in LAYOUTS" :key="l[0]" class="flex-1 leading-tight" :class="{ on: state.prefs.cardsPerPage === l[0] }" @click="state.prefs.cardsPerPage = l[0]">
            {{ l[0] }} · {{ l[1] }}<span class="block text-[11px] font-normal opacity-70">{{ l[2] }} Kante</span>
          </button>
        </div>
        <p class="mt-2 text-xs text-muted">Die Karten werden <b>quadratisch</b> zugeschnitten (gestrichelte Linie + Schnittmarken). Groß = auch aus der letzten Reihe lesbar, kompakt reicht bis ca. 5 m.</p>
      </div>
      <label class="check rounded-2xl bg-surface-2 px-4 py-2">
        <input v-model="state.prefs.cardBacks" type="checkbox" />
        <span><b class="block">Rückseite bedrucken</b><span class="text-sm text-muted">Standardmäßig aus: So sieht niemand hinter dir, was du antwortest. Eingeschaltet: beidseitig drucken (lange Kante), die Rückseite zeigt die gewählte Antwort groß.</span></span>
      </label>
      <button class="btn btn-hero btn-lg" :disabled="!cards.length || busy" @click="download">
        <Icon name="download" />{{ busy ? 'Erstelle PDF …' : `PDF herunterladen (${cards.length} Karten)` }}
      </button>
    </section>

    <div class="section-head"><h2>Vorschau</h2><span class="text-sm text-muted">{{ cards.length }} Karten</span></div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <template v-for="c in preview" :key="c.card">
        <div class="rounded-2xl border border-line p-1 shadow-sm"><AnswerCard :card="c.card" :name="c.name" :gid="c.gid" /></div>
        <div v-if="state.prefs.cardBacks" class="rounded-2xl border border-line p-1 shadow-sm"><AnswerCardBack :card="c.card" :name="c.name" :gid="c.gid" /></div>
      </template>
    </div>
  </main>
</template>
