<script setup>
// Live-Sitzung: Frage zeigen, Karten scannen, Ergebnis aufdecken, weiter.
import MathText from '../components/MathText.vue'
import { ref, computed, watch } from 'vue'
import { getSession, questionStats, flush, addToRoster } from '../lib/store.js'
import { route, go } from '../lib/router.js'
import { toast } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import Scanner from '../components/Scanner.vue'
import ResultBars from '../components/ResultBars.vue'
import QMedia from '../components/QMedia.vue'
import Modal from '../components/Modal.vue'

const session = computed(() => getSession(route.parts[1]))
const q = computed(() => session.value?.questions[session.value.current])
const resp = computed(() => (q.value && session.value.responses[q.value.id]) || {})
const st = computed(() => (q.value ? questionStats(session.value, q.value) : null))
const revealed = computed(() => !!(q.value && session.value.revealed[q.value.id]))
const scanning = ref(false)
const showGrid = ref(false)
const confirmEnd = ref(false)
const TYPES = { mc: 'Multiple Choice', tf: 'Wahr / Falsch', poll: 'Umfrage' }

// Beamer-Fenster sollen sofort folgen
watch(() => [session.value?.current, JSON.stringify(session.value?.revealed), session.value?.graph], () => flush())

function onAnswer(card, letter) {
  const s = session.value, id = q.value.id
  if (addToRoster(s, card) && s.classId) toast(`Karte ${card} gehört zu keinem Namen – als Gast aufgenommen`)
  if (!s.responses[id]) s.responses[id] = {}
  s.responses[id][card] = letter
}
function cycle(card) {
  const cur = resp.value[card] || ''
  const order = ['', ...'ABCD'.slice(0, q.value.options.length)]
  const next = order[(order.indexOf(cur) + 1) % order.length]
  if (!session.value.responses[q.value.id]) session.value.responses[q.value.id] = {}
  if (next) session.value.responses[q.value.id][card] = next
  else delete session.value.responses[q.value.id][card]
}
function clearAnswers() {
  delete session.value.responses[q.value.id]
  delete session.value.revealed[q.value.id]
  toast('Antworten dieser Frage gelöscht')
}
function move(d) {
  const s = session.value
  s.current = Math.max(0, Math.min(s.questions.length - 1, s.current + d))
}
function toggleReveal() { session.value.revealed[q.value.id] = !revealed.value }
function finish() {
  session.value.endedAt = Date.now()
  flush()
  go('/session/' + session.value.id)
}
function openBeamer() {
  const url = location.href.split('#')[0] + '#/beamer/' + session.value.id
  const w = window.open(url, 'drehmoment-beamer', 'popup,width=1280,height=720')
  if (!w) go('/beamer/' + session.value.id)
}
const isLast = computed(() => session.value && session.value.current === session.value.questions.length - 1)
// „Namen verdecken“: während der Stunde nur Kartennummern (jederzeit umschaltbar)
// Namen verdeckt: Die Kartennummern folgen dem Alphabet – wer die Reihenfolge der Klasse kennt, könnte
// sonst zuordnen. Deshalb in zufälliger (pro Sitzung fester) Reihenfolge und ohne Kartennummer, nur „P1, P2 …“.
function seededShuffle(list, seed) {
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rnd = () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const anonRoster = computed(() => [
  ...seededShuffle(session.value.roster.filter((s) => !s.guest), session.value.id).map((s, i) => ({ card: s.card, name: '', ...(s.gid ? { gid: s.gid } : {}), label: 'P' + (i + 1) })),
  ...session.value.roster.filter((s) => s.guest).map((s) => ({ card: s.card, name: '', label: 'G' + s.card })), // Gäste hinten, Reihenfolge der anderen bleibt
])
const shownRoster = computed(() => (session.value.hideNames ? anonRoster.value : session.value.roster))
const fmtName = (s) => (s.label ? (s.label[0] === 'G' ? 'Gast' : 'Person ' + s.label.slice(1)) : s.name || (s.guest ? 'Gast #' : '#') + s.card)
</script>

<template>
  <div v-if="!session" class="page">Sitzung nicht gefunden. <a href="#/">Zurück</a></div>
  <div v-else class="flex min-h-dvh flex-col">
    <!-- Kopf -->
    <div class="topbar">
      <a href="#/" class="btn btn-ghost btn-icon" aria-label="Zur Übersicht"><Icon name="back" /></a>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-bold">{{ session.title }}</div>
        <div class="truncate text-xs text-muted">{{ session.className }} · Frage {{ session.current + 1 }} / {{ session.questions.length }}</div>
      </div>
      <button v-if="session.classId" class="btn btn-ghost btn-icon text-lg" :aria-label="session.hideNames ? 'Namen zeigen' : 'Namen verdecken'" :title="session.hideNames ? 'Namen zeigen' : 'Namen verdecken'" @click="session.hideNames = !session.hideNames">{{ session.hideNames ? '🙈' : '👁️' }}</button>
      <button class="btn btn-ghost btn-icon" aria-label="Beamer-Ansicht öffnen" title="Beamer-Ansicht" @click="openBeamer"><Icon name="screen" /></button>
      <button class="btn btn-sm" @click="confirmEnd = true">Beenden</button>
    </div>
    <div class="h-1 bg-surface-2">
      <div class="h-full bg-gradient-to-r from-brand to-brand-2 transition-all" :style="{ width: ((session.current + 1) / session.questions.length) * 100 + '%' }" />
    </div>

    <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pt-4 pb-40">
      <!-- Frage -->
      <section class="panel">
        <div class="mb-2 flex items-center gap-2">
          <span class="chip chip-brand">F{{ session.current + 1 }}</span>
          <span class="chip">{{ TYPES[q.type] }}</span>
          <span class="ml-auto text-xs text-muted">{{ st.answered }} / {{ st.total }} Antworten</span>
        </div>
        <MathText tag="h1" class="block text-xl leading-snug sm:text-2xl" :text="q.text" />
        <QMedia v-if="q.image" :media="q.image" class="mx-auto mt-3 max-h-[40vh] w-full border border-line" />
        <div class="mt-4">
          <ResultBars :question="q" :counts="st.counts" :answered="st.answered" :reveal="revealed" />
        </div>
        <div v-if="revealed && st.graded && st.answered" class="mt-4 flex items-center gap-3 rounded-2xl p-3" :class="st.correct / st.answered >= 0.7 ? 'bg-ok-soft' : st.correct / st.answered >= 0.4 ? 'bg-surface-2' : 'bg-bad-soft'">
          <span class="text-3xl font-extrabold tabular-nums">{{ Math.round((st.correct / st.answered) * 100) }}%</span>
          <span class="text-sm">richtig ({{ st.correct }} von {{ st.answered }})</span>
        </div>
        <p v-if="revealed && q.explanation" class="mt-3 rounded-2xl bg-brand-soft p-3 text-sm"><b>Erklärung:</b> <MathText :text="q.explanation" /></p>
      </section>

      <!-- Wer hat wie geantwortet -->
      <section class="panel">
        <button class="flex w-full items-center justify-between text-left" @click="showGrid = !showGrid">
          <span class="font-bold">Antworten je Person</span>
          <Icon :name="showGrid ? 'up' : 'down'" class="text-muted" />
        </button>
        <template v-if="showGrid">
          <p class="mt-1 text-xs text-muted">Antippen zum manuellen Ändern (z. B. wenn eine Karte fehlt).</p>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              v-for="s in shownRoster" :key="s.card"
              class="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-left text-sm"
              @click="cycle(s.card)"
            >
              <span v-if="resp[s.card]" class="letter size-7 text-xs" :class="'L-' + resp[s.card]">{{ resp[s.card] }}</span>
              <span v-else class="grid size-7 place-items-center rounded-xl bg-surface-2 text-xs text-muted">–</span>
              <span class="min-w-0 flex-1 truncate">{{ fmtName(s) }}</span>
              <span v-if="revealed && resp[s.card] && st.graded" class="text-xs" :class="q.correct.includes('ABCD'.indexOf(resp[s.card])) ? 'text-ok' : 'text-bad'">
                {{ q.correct.includes('ABCD'.indexOf(resp[s.card])) ? '✓' : '✗' }}
              </span>
            </button>
          </div>
          <button v-if="st.answered" class="btn btn-sm btn-danger mt-3" @click="clearAnswers"><Icon name="trash" class="size-4" />Antworten dieser Frage löschen</button>
        </template>
      </section>
    </main>

    <!-- Steuerleiste -->
    <div class="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-xl">
      <div class="mx-auto flex max-w-3xl items-center gap-2">
        <button class="btn btn-icon" :disabled="session.current === 0" aria-label="Vorherige Frage" @click="move(-1)"><Icon name="back" /></button>
        <button class="btn btn-hero h-14 flex-1 text-base" @click="scanning = true"><Icon name="camera" />Scannen</button>
        <button v-if="session.showCorrect || q.type === 'poll'" class="btn btn-icon" :class="revealed ? 'border-brand text-brand' : ''" :aria-label="revealed ? 'Lösung verbergen' : 'Lösung zeigen'" @click="toggleReveal"><Icon name="eye" /></button>
        <button v-if="!isLast" class="btn btn-icon" aria-label="Nächste Frage" @click="move(1)"><Icon name="next" /></button>
        <button v-else class="btn btn-primary" @click="confirmEnd = true"><Icon name="check" />Fertig</button>
      </div>
    </div>

    <Scanner v-if="scanning" :key="q.id" :roster="shownRoster" :responses="resp" :option-count="q.options.length" :question="q" @answer="onAnswer" @close="scanning = false" />

    <Modal v-if="confirmEnd" title="Sitzung beenden?" @close="confirmEnd = false">
      <p class="mb-4 text-muted">Die Ergebnisse bleiben gespeichert. Du kannst die Sitzung später fortsetzen.</p>
      <button class="btn btn-hero btn-lg" @click="finish"><Icon name="chart" />Beenden & auswerten</button>
    </Modal>
  </div>
</template>
