<script setup>
import { hasMath } from '../lib/math.js'
import { loadMathRenderer } from '../lib/mathpdf.js'
// Auswertung einer Sitzung: Kennzahlen, Fragen, Personen, Export (PDF/CSV/JSON).
import MathText from '../components/MathText.vue'
import { ref, computed, watch } from 'vue'
import { state, getSession } from '../lib/store.js'
import { route, go } from '../lib/router.js'
import { sessionStats, reportPdf } from '../lib/pdf.js'
import { sessionCsv, APP_ID, FORMAT_VERSION } from '../lib/format.js'
import { shareFile, downloadBlob, toast, fmtDate, slug } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import ResultBars from '../components/ResultBars.vue'
import Modal from '../components/Modal.vue'

const session = computed(() => getSession(route.parts[1]))
const st = computed(() => session.value && sessionStats(session.value))
const tab = ref('questions')
const confirmDelete = ref(false)
const pct = (v) => (v == null ? '–' : Math.round(v * 100) + '%')
const base = computed(() => `drehmoment-${slug(session.value.title)}-${new Date(session.value.startedAt).toISOString().slice(0, 10)}`)

// Formeln im PDF: MathJax vorab laden (iOS erlaubt „Teilen“ nur kurz nach dem Antippen)
const needsMath = computed(() => session.value?.questions.some((q) => [q.text, q.explanation, ...q.options].some(hasMath)))
let mathR = null
watch(needsMath, (v) => { if (v && !mathR) loadMathRenderer().then((r) => (mathR = r)).catch(() => {}) }, { immediate: true })

async function pdf() {
  const math = mathR || (needsMath.value ? await loadMathRenderer().catch(() => null) : null)
  const doc = reportPdf(session.value, { math })
  await shareFile(doc.output('blob'), base.value + '.pdf', 'Auswertung')
}
function csv() {
  downloadBlob(new Blob(['﻿' + sessionCsv(session.value)], { type: 'text/csv;charset=utf-8' }), base.value + '.csv')
}
function json() {
  const s = session.value
  const data = { app: APP_ID, format: FORMAT_VERSION, exportedAt: new Date().toISOString(), content: 'full', sets: [], sessions: [s] }
  const set = state.sets.find((x) => x.id === s.setId)
  if (set) data.sets.push(set)
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), base.value + '.json')
}
function resume() { session.value.endedAt = null; go('/live/' + session.value.id) }
function remove() {
  const i = state.sessions.findIndex((s) => s.id === session.value.id)
  state.sessions.splice(i, 1)
  toast('Sitzung gelöscht')
  go('/')
}
const sortedStudents = computed(() => [...st.value.students].sort((a, b) => (b.graded ? b.right / b.graded : -1) - (a.graded ? a.right / a.graded : -1) || a.card - b.card))
const tone = (v) => (v == null ? 'text-muted' : v >= 0.7 ? 'text-ok' : v >= 0.4 ? 'text-ans-c' : 'text-bad')
</script>

<template>
  <div v-if="!session" class="page">Sitzung nicht gefunden. <a href="#/">Zurück</a></div>
  <template v-else>
    <div class="topbar">
      <a href="#/" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
      <div class="topbar-title">Auswertung</div>
      <button class="btn btn-ghost btn-icon" aria-label="Löschen" @click="confirmDelete = true"><Icon name="trash" /></button>
    </div>
    <main class="page space-y-4">
      <section class="panel">
        <h1 class="text-xl">{{ session.title }}</h1>
        <p class="text-sm text-muted">{{ session.className }} · {{ fmtDate(session.startedAt) }}</p>
        <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-2xl bg-surface-2 p-3"><div class="text-xs font-semibold text-muted">Ø richtig</div><div class="text-2xl font-extrabold" :class="tone(st.avg)">{{ pct(st.avg) }}</div></div>
          <div class="rounded-2xl bg-surface-2 p-3"><div class="text-xs font-semibold text-muted">Teilnehmende</div><div class="text-2xl font-extrabold">{{ st.participants }}<span class="text-base text-muted">/{{ session.roster.length }}</span></div></div>
          <div class="rounded-2xl bg-surface-2 p-3"><div class="text-xs font-semibold text-muted">Fragen</div><div class="text-2xl font-extrabold">{{ session.questions.length }}</div></div>
          <div class="rounded-2xl bg-surface-2 p-3"><div class="text-xs font-semibold text-muted">Beteiligung</div><div class="text-2xl font-extrabold">{{ pct(st.participation) }}</div></div>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2">
          <button class="btn btn-primary" @click="pdf"><Icon name="file" />PDF</button>
          <button class="btn" @click="csv"><Icon name="download" />CSV</button>
          <button class="btn" @click="json"><Icon name="download" />JSON</button>
        </div>
        <button class="btn btn-ghost btn-sm mt-2 w-full" @click="resume"><Icon name="play" class="size-4" />Sitzung fortsetzen</button>
      </section>

      <div class="seg w-full">
        <button class="flex-1" :class="{ on: tab === 'questions' }" @click="tab = 'questions'">Fragen</button>
        <button class="flex-1" :class="{ on: tab === 'people' }" @click="tab = 'people'">Personen</button>
      </div>

      <template v-if="tab === 'questions'">
        <section v-for="(p, i) in st.perQ" :key="p.q.id" class="panel">
          <div class="mb-2 flex items-start gap-2">
            <span class="chip chip-brand mt-0.5">F{{ i + 1 }}</span>
            <MathText tag="h2" class="flex-1 text-base leading-snug" :text="p.q.text" />
            <span v-if="p.graded" class="shrink-0 font-extrabold" :class="tone(p.pct)">{{ pct(p.pct) }}</span>
            <span v-else class="chip shrink-0">Umfrage</span>
          </div>
          <ResultBars :question="p.q" :counts="p.counts" :answered="p.answered" :reveal="true" />
          <p class="mt-2 text-xs text-muted">{{ p.answered }} Antworten<template v-if="p.q.explanation"> · <MathText :text="p.q.explanation" /></template></p>
        </section>
      </template>

      <section v-else class="panel-list">
        <div v-for="s in sortedStudents" :key="s.card" class="flex items-center gap-3 px-4 py-2.5">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-bold text-muted">{{ s.card }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold">{{ s.name || 'Karte ' + s.card }}</div>
            <div class="flex flex-wrap gap-0.5 pt-1">
              <span
                v-for="(a, k) in s.answers" :key="k"
                class="grid size-5 place-items-center rounded text-[10px] font-bold"
                :class="!a ? 'bg-surface-2 text-muted' : session.questions[k].type === 'poll' || !session.questions[k].correct.length ? 'bg-surface-2' : session.questions[k].correct.includes('ABCD'.indexOf(a)) ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'"
              >{{ a || '·' }}</span>
            </div>
          </div>
          <span class="shrink-0 text-right font-bold tabular-nums" :class="tone(s.graded ? s.right / s.graded : null)">
            {{ s.graded ? `${s.right}/${s.graded}` : '–' }}
          </span>
        </div>
      </section>
    </main>

    <Modal v-if="confirmDelete" title="Sitzung löschen?" @close="confirmDelete = false">
      <p class="mb-4 text-muted">Alle Antworten dieser Sitzung werden gelöscht. Das Quiz selbst bleibt erhalten.</p>
      <button class="btn btn-lg btn-danger" @click="remove"><Icon name="trash" />Endgültig löschen</button>
    </Modal>
  </template>
</template>
