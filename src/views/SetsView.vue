<script setup>
import { ref, computed } from 'vue'
import { state, newSet, firstRun } from '../lib/store.js'
import { normalizeSet } from '../lib/format.js'
import { SAMPLE } from '../lib/sample.js'
import { go } from '../lib/router.js'
import { fmtDate, toast } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import StartModal from '../components/StartModal.vue'
import QrScan from '../components/QrScan.vue'

const starting = ref(null)
const qrScan = ref(false)
const query = ref('')
const sets = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? state.sets.filter((s) => (s.title + ' ' + s.subject + ' ' + s.grade).toLowerCase().includes(q)) : state.sets
})
const recent = computed(() => state.sessions.slice(0, 5))
const lastRun = (id) => state.sessions.find((s) => s.setId === id)

function create() { const s = newSet(); go('/set/' + s.id) }
function loadSample() {
  const s = normalizeSet(SAMPLE)
  state.sets.unshift(s)
  toast('Beispielquiz angelegt', 'ok')
}
const typeCount = (s) => s.questions.length
</script>

<template>
  <header class="relative overflow-hidden bg-gradient-to-br from-brand via-[#7a4df7] to-brand-2 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-16 text-white">
    <div class="pointer-events-none absolute -top-10 -right-10 size-48 rotate-12 rounded-[36px] border-[10px] border-white/15" />
    <div class="pointer-events-none absolute top-16 right-20 size-16 -rotate-12 rounded-2xl border-[6px] border-white/20" />
    <div class="relative mx-auto max-w-3xl">
      <div class="flex items-center gap-2.5">
        <img :src="'icon.svg'" alt="" class="size-9 rounded-xl shadow-lg" />
        <span class="text-xl font-extrabold tracking-tight">Drehmoment</span>
        <a href="#/help" class="ml-auto rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white no-underline backdrop-blur">Anleitung</a>
      </div>
      <h1 class="mt-6 text-3xl leading-tight font-extrabold sm:text-4xl">Karte drehen.<br />Klasse verstehen.</h1>
      <p class="mt-2 max-w-md text-white/85">Live-Abstimmung mit gedruckten Karten – ohne Schülergeräte, ohne Konto, komplett offline.</p>
    </div>
  </header>

  <main class="page -mt-10">
    <div class="relative grid grid-cols-2 gap-3">
      <button class="btn btn-lg h-auto flex-col items-start gap-1 rounded-3xl py-4 text-left shadow-lg" @click="create">
        <span class="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="plus" /></span>
        <span>Neues Quiz</span>
        <span class="text-xs font-normal text-muted">Fragen selbst erstellen</span>
      </button>
      <a href="#/ai" class="btn btn-lg h-auto flex-col items-start gap-1 rounded-3xl py-4 text-left shadow-lg">
        <span class="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white"><Icon name="spark" /></span>
        <span>Mit KI erstellen</span>
        <span class="text-xs font-normal text-muted">Prompt bauen, JSON einfügen</span>
      </a>
    </div>
    <button class="btn mt-3 w-full rounded-2xl shadow-sm" @click="qrScan = true"><Icon name="camera" />Quiz-QR-Code scannen</button>

    <div v-if="firstRun && !state.sets.length" class="panel mt-6">
      <h2 class="text-lg">Willkommen 👋</h2>
      <ol class="mt-3 space-y-3">
        <li class="flex gap-3"><span class="letter L-A">1</span><span><b>Karten drucken</b> – jede Person bekommt eine feste Nummer. <a href="#/cards">Zu den Karten</a></span></li>
        <li class="flex gap-3"><span class="letter L-B">2</span><span><b>Klasse anlegen</b> – Namen den Kartennummern zuordnen (optional). <a href="#/classes">Klassen</a></span></li>
        <li class="flex gap-3"><span class="letter L-C">3</span><span><b>Quiz starten</b> – Frage zeigen, Kamera über die Klasse schwenken, fertig.</span></li>
      </ol>
      <button class="btn mt-4 w-full" @click="loadSample">Beispielquiz laden</button>
    </div>

    <div class="section-head">
      <h2>Deine Quizze <span class="text-muted">· {{ state.sets.length }}</span></h2>
    </div>
    <input v-if="state.sets.length > 4" v-model="query" type="search" placeholder="Suchen …" class="mb-3" />

    <div v-if="!state.sets.length" class="panel py-10 text-center text-muted">
      <div class="mb-2 text-4xl">🗂️</div>
      Noch keine Quizze. Leg eins an oder lass es von einer KI erstellen.
    </div>
    <div v-else class="space-y-3">
      <article v-for="s in sets" :key="s.id" class="panel flex items-center gap-3 p-3 pl-4 transition hover:border-brand/40">
        <a :href="'#/set/' + s.id" class="min-w-0 flex-1 text-ink no-underline">
          <div class="truncate font-bold">{{ s.title || 'Ohne Titel' }}</div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span class="chip chip-brand">{{ typeCount(s) }} Fragen</span>
            <span v-if="s.subject" class="chip">{{ s.subject }}</span>
            <span v-if="s.grade" class="chip">{{ s.grade }}</span>
            <span v-if="lastRun(s.id)">zuletzt {{ fmtDate(lastRun(s.id).startedAt).split(',')[0] }}</span>
          </div>
        </a>
        <button class="btn btn-primary btn-icon size-12 rounded-2xl" :aria-label="'Starten: ' + s.title" @click="starting = s.id">
          <Icon name="play" class="fill-current" />
        </button>
      </article>
    </div>

    <template v-if="recent.length">
      <div class="section-head"><h2>Letzte Sitzungen</h2></div>
      <div class="panel-list">
        <a v-for="r in recent" :key="r.id" :href="r.endedAt ? '#/session/' + r.id : '#/live/' + r.id" class="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
          <span class="grid size-10 place-items-center rounded-2xl bg-surface-2 text-muted"><Icon name="chart" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ r.title }}</span>
            <span class="block text-xs text-muted">{{ r.className }} · {{ fmtDate(r.startedAt) }}</span>
          </span>
          <span v-if="!r.endedAt" class="chip chip-brand">läuft</span>
          <Icon name="next" class="text-muted" />
        </a>
      </div>
    </template>
  </main>
  <QrScan v-if="qrScan" @close="qrScan = false" />
  <StartModal v-if="starting" :set-id="starting" @close="starting = null" />
</template>
