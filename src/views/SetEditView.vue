<script setup>
import MathText from '../components/MathText.vue'
import { hasMath, plainMath } from '../lib/math.js'
import { ref, computed, watch } from 'vue'
import { state, getSet, newQuestion, uid } from '../lib/store.js'
import { buildExport } from '../lib/format.js'
import { route, go } from '../lib/router.js'
import { toast, copyText, shareFile, slug, today } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StartModal from '../components/StartModal.vue'
import QrShare from '../components/QrShare.vue'
import QMedia from '../components/QMedia.vue'
import MediaEditor from '../components/MediaEditor.vue'
import { hasMedia } from '../lib/media.js'

const set = computed(() => getSet(route.parts[1]))
const starting = ref(false)
const showSettings = ref(false)
const showQr = ref(false)
const showMaterial = ref(false)
const openQ = ref(null)
const mediaEdit = ref(null) // {q, k}  k = -1: Bild zur Frage, sonst Antwort k

function setMedia(m) {
  const { q, k } = mediaEdit.value
  if (k < 0) { if (m) q.image = m; else delete q.image; return }
  const list = q.options.map((_, i) => q.optionImages?.[i] || null)
  list[k] = m
  if (list.some(Boolean)) q.optionImages = list; else delete q.optionImages
}
function removeOption(q, k) {
  q.options.splice(k, 1)
  q.correct = q.correct.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c))
  if (q.optionImages) { q.optionImages.splice(k, 1); if (!q.optionImages.some(Boolean)) delete q.optionImages }
}
const mediaContext = (q) => [q.text, ...q.options.map((o, i) => `${'ABCD'[i]}) ${o || (q.optionImages?.[i] ? '[Bild]' : '')}`)].join('\n')

watch(() => set.value && JSON.stringify(set.value.questions) + set.value.title, () => { if (set.value) set.value.updated = Date.now() })

const TYPES = { mc: 'Multiple Choice', tf: 'Wahr / Falsch', poll: 'Umfrage' }

function addQuestion(type = 'mc') {
  const q = newQuestion(type)
  set.value.questions.push(q)
  openQ.value = q.id
}
function setType(q, type) {
  q.type = type
  if (type === 'tf') { delete q.optionImages; q.options = ['Wahr', 'Falsch']; q.correct = q.correct.filter((i) => i < 2); if (!q.correct.length) q.correct = [0] }
  if (type === 'poll') q.correct = []
  if (type === 'mc' && !q.correct.length) q.correct = [0]
}
function toggleCorrect(q, i) {
  if (q.type === 'poll') return
  q.correct = q.correct.includes(i) ? q.correct.filter((x) => x !== i) : [...q.correct, i].sort()
}
function move(i, d) {
  const qs = set.value.questions, j = i + d
  if (j < 0 || j >= qs.length) return
  ;[qs[i], qs[j]] = [qs[j], qs[i]]
}
function dup(i) {
  const c = { ...JSON.parse(JSON.stringify(set.value.questions[i])), id: uid() }
  set.value.questions.splice(i + 1, 0, c)
}
function remove(i) {
  if (confirm('Frage löschen?')) set.value.questions.splice(i, 1)
}
function removeSet() {
  if (!confirm(`„${set.value.title}“ wirklich löschen? Ergebnisse bleiben erhalten.`)) return
  state.sets.splice(state.sets.indexOf(set.value), 1)
  go('/')
}
function duplicateSet() {
  const c = JSON.parse(JSON.stringify(set.value))
  c.id = uid(); c.title += ' (Kopie)'; c.questions.forEach((q) => (q.id = uid()))
  state.sets.unshift(c)
  go('/set/' + c.id)
  toast('Kopie erstellt', 'ok')
}
async function exportSet() {
  const data = buildExport(state, { setIds: [set.value.id] })
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  await shareFile(blob, `drehmoment-${slug(set.value.title)}-${today()}.json`, set.value.title)
}
async function shareMaterial() {
  const text = `${set.value.title}\n\n${set.value.material}`
  if (navigator.share) { try { await navigator.share({ title: set.value.title, text }); return } catch (e) { if (e.name === 'AbortError') return } }
  if (await copyText(text)) toast('Vorbereitung kopiert', 'ok')
}
const isWrong = (q) => !q.text.trim() || (q.type !== 'poll' && !q.correct.length) || q.options.some((o, k) => !o.trim() && !q.optionImages?.[k])
</script>

<template>
  <div v-if="!set" class="page"><p>Quiz nicht gefunden. <a href="#/">Zurück</a></p></div>
  <template v-else>
    <div class="topbar">
      <a href="#/" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
      <div class="topbar-title">{{ set.title || 'Quiz' }}</div>
      <button class="btn btn-ghost btn-icon" aria-label="Als QR-Code teilen" title="QR-Code" @click="showQr = true"><Icon name="card" /></button>
      <button class="btn btn-ghost btn-icon" aria-label="Einstellungen" @click="showSettings = true"><Icon name="dots" /></button>
      <button class="btn btn-primary" @click="starting = true"><Icon name="play" class="size-4 fill-current" />Start</button>
    </div>
    <main class="page space-y-4">
      <section class="panel space-y-3">
        <input v-model="set.title" type="text" placeholder="Titel des Quiz" class="border-transparent! bg-transparent! px-0! text-xl font-bold focus:ring-0!" />
        <div class="grid grid-cols-2 gap-2">
          <input v-model="set.subject" type="text" placeholder="Fach" />
          <input v-model="set.grade" type="text" placeholder="Klasse / Niveau" />
        </div>
        <textarea v-model="set.description" rows="2" placeholder="Kurzbeschreibung (optional)" class="min-h-0" />
      </section>

      <!-- Flipped Classroom -->
      <section class="panel">
        <button class="flex w-full items-center gap-3 text-left" @click="showMaterial = !showMaterial">
          <span class="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="book" /></span>
          <span class="flex-1">
            <span class="block font-bold">Vorbereitung für zu Hause</span>
            <span class="block text-sm text-muted">{{ set.material ? plainMath(set.material).slice(0, 60) + (set.material.length > 60 ? '…' : '') : 'Material, Video-Links, Leitfragen' }}</span>
          </span>
          <Icon :name="showMaterial ? 'up' : 'down'" class="text-muted" />
        </button>
        <div v-if="showMaterial" class="mt-3 space-y-2">
          <textarea v-model="set.material" rows="6" placeholder="z. B. Link zum Erklärvideo, Lesetext, Leitfragen … Formeln mit $…$" />
          <div v-if="hasMath(set.material)" class="rounded-2xl bg-surface-2 p-3 text-sm">
            <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Vorschau</div>
            <MathText tag="div" :text="set.material" />
          </div>
          <button class="btn btn-sm" :disabled="!set.material" @click="shareMaterial"><Icon name="share" class="size-4" />An Klasse teilen</button>
        </div>
      </section>

      <div class="section-head mb-0!">
        <h2>Fragen <span class="text-muted">· {{ set.questions.length }}</span></h2>
      </div>

      <TransitionGroup name="list" tag="div" class="space-y-3">
        <section v-for="(q, i) in set.questions" :key="q.id" class="panel p-0">
          <button class="flex w-full items-start gap-3 p-4 text-left" @click="openQ = openQ === q.id ? null : q.id">
            <span class="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-bold">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold" :class="!q.text ? 'text-muted italic' : ''"><MathText :text="q.text || 'Neue Frage …'" /></span>
              <span class="mt-1 flex flex-wrap gap-1.5">
                <span class="chip">{{ TYPES[q.type] }}</span>
                <span v-if="q.type !== 'poll' && q.correct.length" class="chip bg-ok-soft! text-ok!">✓ {{ q.correct.map((c) => 'ABCD'[c]).join(', ') }}</span>
                <span v-if="hasMedia(q)" class="chip">🖼 Bild</span>
                <span v-if="isWrong(q)" class="chip bg-bad-soft! text-bad!">unvollständig</span>
              </span>
            </span>
            <Icon :name="openQ === q.id ? 'up' : 'down'" class="mt-1.5 text-muted" />
          </button>

          <div v-if="openQ === q.id" class="space-y-3 border-t border-line p-4">
            <div class="seg w-full">
              <button v-for="(label, t) in TYPES" :key="t" class="flex-1" :class="{ on: q.type === t }" @click="setType(q, t)">{{ label }}</button>
            </div>
            <textarea v-model="q.text" rows="2" placeholder="Fragetext – Formeln mit $…$, z. B. $\frac{1}{2}$" class="min-h-0 text-lg" />
            <div v-if="q.image" class="flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
              <QMedia :media="q.image" class="max-h-28 w-40 shrink-0" />
              <div class="flex flex-1 flex-col gap-1">
                <button class="btn btn-sm" @click="mediaEdit = { q, k: -1 }">Bild bearbeiten</button>
                <button class="btn btn-sm btn-ghost btn-danger" @click="delete q.image">Entfernen</button>
              </div>
            </div>
            <button v-else class="btn btn-sm btn-ghost" @click="mediaEdit = { q, k: -1 }">🖼 Bild, Graph oder Zeichnung zur Frage</button>
            <div v-if="[q.text, ...q.options, q.explanation].some(hasMath)" class="rounded-2xl bg-surface-2 p-3 text-sm">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Vorschau</div>
              <MathText tag="div" class="text-base font-semibold" :text="q.text" />
              <div v-for="(o, k) in q.options" :key="k" class="mt-1"><b>{{ 'ABCD'[k] }}:</b> <MathText big :text="o" /></div>
              <MathText v-if="q.explanation" tag="div" class="mt-1 text-muted" :text="q.explanation" />
            </div>
            <div class="space-y-2">
              <div v-for="(o, k) in q.options" :key="k" class="flex items-center gap-2">
                <button
                  class="letter size-11 rounded-2xl transition"
                  :class="['L-' + 'ABCD'[k], q.type !== 'poll' && !q.correct.includes(k) ? 'opacity-30 grayscale' : '']"
                  :title="q.type === 'poll' ? '' : 'Als richtig markieren'"
                  @click="toggleCorrect(q, k)"
                >{{ q.type !== 'poll' && q.correct.includes(k) ? '✓' : 'ABCD'[k] }}</button>
                <input v-model="q.options[k]" type="text" :placeholder="q.optionImages?.[k] ? 'Beschriftung (optional)' : 'Antwort ' + 'ABCD'[k]" :readonly="q.type === 'tf'" />
                <button v-if="q.type !== 'tf'" class="btn btn-ghost btn-icon shrink-0 overflow-hidden p-0!" :aria-label="'Bild für Antwort ' + 'ABCD'[k]" :title="'Bild für Antwort ' + 'ABCD'[k]" @click="mediaEdit = { q, k }">
                  <QMedia v-if="q.optionImages?.[k]" :media="q.optionImages[k]" class="size-11" /><span v-else class="text-muted">🖼</span>
                </button>
                <button v-if="q.type !== 'tf' && q.options.length > 2" class="btn btn-ghost btn-icon text-muted" aria-label="Antwort entfernen" @click="removeOption(q, k)">✕</button>
              </div>
              <button v-if="q.type !== 'tf' && q.options.length < 4" class="btn btn-sm btn-ghost" @click="q.options.push(''); q.optionImages?.push(null)"><Icon name="plus" class="size-4" />Antwort</button>
              <p v-if="q.type !== 'poll'" class="text-xs text-muted">Tippe auf einen Buchstaben, um ihn als richtig zu markieren.</p>
            </div>
            <textarea v-model="q.explanation" rows="2" placeholder="Erklärung für die Besprechung (optional)" class="min-h-0 text-sm" />
            <div class="flex flex-wrap gap-1">
              <button class="btn btn-sm btn-ghost" :disabled="i === 0" @click="move(i, -1)"><Icon name="up" class="size-4" />Hoch</button>
              <button class="btn btn-sm btn-ghost" :disabled="i === set.questions.length - 1" @click="move(i, 1)"><Icon name="down" class="size-4" />Runter</button>
              <button class="btn btn-sm btn-ghost" @click="dup(i)"><Icon name="copy" class="size-4" />Duplizieren</button>
              <button class="btn btn-sm btn-ghost btn-danger ml-auto" @click="remove(i)"><Icon name="trash" class="size-4" />Löschen</button>
            </div>
          </div>
        </section>
      </TransitionGroup>

      <div class="grid grid-cols-3 gap-2">
        <button class="btn" @click="addQuestion('mc')"><Icon name="plus" class="size-4" />MC</button>
        <button class="btn" @click="addQuestion('tf')"><Icon name="plus" class="size-4" />Wahr/F.</button>
        <button class="btn" @click="addQuestion('poll')"><Icon name="plus" class="size-4" />Umfrage</button>
      </div>
      <button class="btn btn-hero btn-lg" @click="starting = true"><Icon name="play" class="fill-current" />Quiz starten</button>
    </main>

    <Modal v-if="showSettings" title="Quiz-Optionen" @close="showSettings = false">
      <div class="space-y-1">
        <label class="check"><input v-model="set.settings.showCorrect" type="checkbox" />Richtige Antwort nach dem Scannen hervorheben</label>
        <label class="check"><input v-model="set.settings.shuffle" type="checkbox" />Fragen bei jedem Start mischen</label>
      </div>
      <hr class="my-4 border-line" />
      <div class="grid gap-2">
        <button class="btn" @click="showSettings = false; showQr = true"><Icon name="card" class="size-4" />Als QR-Code teilen</button>
        <button class="btn" @click="exportSet"><Icon name="download" class="size-4" />Nur dieses Quiz exportieren</button>
        <button class="btn" @click="duplicateSet"><Icon name="copy" class="size-4" />Duplizieren</button>
        <button class="btn btn-danger" @click="removeSet"><Icon name="trash" class="size-4" />Quiz löschen</button>
      </div>
    </Modal>
    <StartModal v-if="starting" :set-id="set.id" @close="starting = false" />
    <QrShare v-if="showQr" :set="set" @close="showQr = false" />
    <MediaEditor
      v-if="mediaEdit"
      :model-value="mediaEdit.k < 0 ? mediaEdit.q.image : mediaEdit.q.optionImages?.[mediaEdit.k]"
      :title="mediaEdit.k < 0 ? 'Bild zur Frage' : 'Bild für Antwort ' + 'ABCD'[mediaEdit.k]"
      :context="mediaContext(mediaEdit.q)"
      :small="mediaEdit.k >= 0"
      @update:model-value="setMedia"
      @close="mediaEdit = null"
    />
  </template>
</template>

<style scoped>
.list-move, .list-enter-active, .list-leave-active { transition: all 0.25s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(8px); }
</style>
