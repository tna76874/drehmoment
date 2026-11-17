<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { state } from '../lib/store.js'
import { AI_DEFAULTS, buildPrompt, parseImport, suggestsImages } from '../lib/format.js'
import { copyText, toast } from '../lib/ui.js'
import { go } from '../lib/router.js'
import Icon from '../components/Icon.vue'
import SetPreview from '../components/SetPreview.vue'
import StartModal from '../components/StartModal.vue'

const f = reactive({ ...JSON.parse(JSON.stringify(AI_DEFAULTS)), ...(state.prefs.ai || {}) })
watch(f, () => { state.prefs.ai = JSON.parse(JSON.stringify({ ...f, source: '' })) }, { deep: true })

if (f.images === true) f.images = 'some' // ältere Einstellung (Häkchen)
const IMAGE_MODES = [[false, 'Keine'], ['some', 'Wo sinnvoll'], ['many', '📈 Graphen-Quiz']]
const step = ref(1)
const prompt = computed(() => buildPrompt(f))
const answer = ref('')
const parsed = ref(null)
const error = ref('')
const starting = ref(null)

const SERVICES = [
  { name: 'ChatGPT', url: (p) => 'https://chatgpt.com/?q=' + encodeURIComponent(p) },
  { name: 'Claude', url: (p) => 'https://claude.ai/new?q=' + encodeURIComponent(p) },
  { name: 'Le Chat', url: (p) => 'https://chat.mistral.ai/chat?q=' + encodeURIComponent(p) },
  { name: 'Perplexity', url: (p) => 'https://www.perplexity.ai/search?q=' + encodeURIComponent(p) },
  { name: 'Gemini', url: () => 'https://gemini.google.com/app' },
  { name: 'Copilot', url: () => 'https://copilot.microsoft.com/' },
]
async function copy() {
  if (await copyText(prompt.value)) toast('Prompt kopiert – jetzt in die KI einfügen', 'ok')
  step.value = Math.max(step.value, 2)
}
async function openService(s) {
  await copyText(prompt.value)
  const url = s.url(prompt.value)
  // sehr lange Prompts passen nicht in eine URL -> nur öffnen, Prompt ist in der Zwischenablage
  window.open(url.length > 7500 ? s.url('') : url, '_blank', 'noopener')
  toast('Prompt ist auch in der Zwischenablage', 'info')
  step.value = Math.max(step.value, 2)
}
async function share() {
  try { await navigator.share({ text: prompt.value }); step.value = 2 } catch {}
}
async function paste() {
  try { answer.value = await navigator.clipboard.readText(); read() } catch { toast('Einfügen nicht erlaubt – bitte manuell einfügen', 'bad') }
}
function read() {
  error.value = ''; parsed.value = null
  if (!answer.value.trim()) return
  try {
    const p = parseImport(answer.value)
    parsed.value = p
    step.value = 3
  } catch (e) { error.value = e.message }
}
function save(start) {
  const sets = parsed.value.sets
  for (const s of sets) state.sets.unshift(s)
  toast(`${sets.length > 1 ? sets.length + ' Quizze' : 'Quiz'} gespeichert`, 'ok')
  answer.value = ''; const first = sets[0]; parsed.value = null; step.value = 1
  if (start) starting.value = first.id
  else go('/set/' + first.id)
}
const canShare = typeof navigator !== 'undefined' && 'share' in navigator
const typesOk = computed(() => f.types.mc || f.types.tf || f.types.poll)
</script>

<template>
  <div class="topbar"><div class="topbar-title pl-1">KI-Modus</div><a href="#/help?t=agent" class="btn btn-ghost btn-sm"><Icon name="robot" class="size-4" />Für Agenten</a></div>
  <main class="page space-y-4">
    <!-- Schritte -->
    <ol class="flex items-center gap-2 text-xs font-semibold">
      <li v-for="(s, i) in ['Wünsche', 'An KI geben', 'Einfügen']" :key="s" class="flex flex-1 items-center gap-2">
        <span class="grid size-7 shrink-0 place-items-center rounded-full" :class="step > i ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'">{{ i + 1 }}</span>
        <span :class="step > i ? 'text-ink' : 'text-muted'">{{ s }}</span>
      </li>
    </ol>

    <section class="panel space-y-4">
      <div>
        <label class="field-label">Thema *</label>
        <input v-model="f.topic" type="text" placeholder="z. B. Bruchrechnung: Erweitern und Kürzen" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Fach</label><input v-model="f.subject" type="text" placeholder="Mathe" /></div>
        <div><label class="field-label">Klasse / Niveau</label><input v-model="f.grade" type="text" placeholder="6. Klasse" /></div>
      </div>
      <div>
        <label class="field-label">Anzahl Fragen: <b class="text-ink">{{ f.count }}</b></label>
        <input v-model.number="f.count" type="range" min="1" max="30" />
      </div>
      <div>
        <label class="field-label">Fragetypen</label>
        <div class="flex flex-wrap gap-2">
          <label v-for="(l, k) in { mc: 'Multiple Choice', tf: 'Wahr/Falsch', poll: 'Umfrage' }" :key="k" class="check rounded-2xl border border-line px-3" :class="f.types[k] ? 'border-brand bg-brand-soft' : ''">
            <input v-model="f.types[k]" type="checkbox" />{{ l }}
          </label>
        </div>
        <p v-if="!typesOk" class="mt-1 text-xs text-bad">Mindestens einen Typ wählen.</p>
      </div>
      <div>
        <label class="field-label">Abbildungen (Funktionsgraphen, Diagramme, Skizzen)</label>
        <div class="seg w-full"><button v-for="[v, l] in IMAGE_MODES" :key="l" class="flex-1" :class="{ on: f.images === v }" @click="f.images = v">{{ l }}</button></div>
        <p v-if="!f.images && suggestsImages(f)" class="mt-1 text-xs text-brand">💡 Für dieses Thema lohnen sich Graphen – „Wo sinnvoll“ oder „Graphen-Quiz“ wählen. Die KI bekommt dann eine genaue Anleitung und die App zeichnet die Graphen.</p>
        <p v-else-if="f.images" class="mt-1 text-xs text-muted">Die KI beschreibt Graphen in einem kleinen Format, Drehmoment zeichnet sie – scharf am Beamer und winzig im QR-Code.</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">Antworten (MC)</label>
          <div class="seg w-full"><button v-for="n in [2, 3, 4]" :key="n" class="flex-1" :class="{ on: f.optionCount === n }" @click="f.optionCount = n">{{ n }}</button></div>
        </div>
        <div>
          <label class="field-label">Schwierigkeit</label>
          <select v-model="f.difficulty"><option>leicht</option><option>mittel</option><option>schwer</option><option>gemischt</option></select>
        </div>
      </div>
      <div>
        <label class="field-label">Sprache</label>
        <select v-model="f.language"><option>Deutsch</option><option>Englisch</option><option>Französisch</option><option>Spanisch</option><option>Leichte Sprache</option></select>
      </div>
      <details class="group">
        <summary class="cursor-pointer text-sm font-semibold text-brand">Mehr Optionen</summary>
        <div class="mt-3 space-y-3">
          <label class="check"><input v-model="f.explanations" type="checkbox" />Erklärungen zu jeder Frage</label>
          <label class="check"><input v-model="f.material" type="checkbox" />Vorbereitungsmaterial für zu Hause (Flipped Classroom)</label>
          <label class="check"><input v-model="f.showCorrect" type="checkbox" />Richtige Antwort nach dem Scannen zeigen</label>
          <label class="check"><input v-model="f.shuffle" type="checkbox" />Fragen mischen</label>
          <div>
            <label class="field-label">Grundlage (Text, Transkript, Hausaufgabe …)</label>
            <textarea v-model="f.source" rows="4" placeholder="Optional: Material einfügen, auf dem die Fragen basieren sollen" />
          </div>
          <div>
            <label class="field-label">Weitere Wünsche</label>
            <textarea v-model="f.extra" rows="2" placeholder="z. B. Fehlvorstellungen zu … abfragen, Alltagsbezug" class="min-h-0" />
          </div>
        </div>
      </details>
    </section>

    <section class="panel space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base">Dein Prompt</h2>
        <span class="text-xs text-muted">{{ prompt.length }} Zeichen</span>
      </div>
      <pre class="max-h-48 overflow-auto rounded-2xl bg-surface-2 p-3 text-xs whitespace-pre-wrap">{{ prompt }}</pre>
      <button class="btn btn-hero btn-lg" :disabled="!f.topic.trim() || !typesOk" @click="copy"><Icon name="copy" />Prompt kopieren</button>
      <div class="grid grid-cols-3 gap-2">
        <button v-for="s in SERVICES" :key="s.name" class="btn btn-sm" :disabled="!f.topic.trim()" @click="openService(s)">{{ s.name }} ↗</button>
      </div>
      <button v-if="canShare" class="btn btn-sm w-full" :disabled="!f.topic.trim()" @click="share"><Icon name="share" class="size-4" />An KI-App teilen</button>
    </section>

    <section class="panel space-y-3">
      <h2 class="text-base">Antwort der KI einfügen</h2>
      <textarea v-model="answer" rows="5" class="font-mono text-xs" placeholder='Die komplette Antwort hier einfügen – der JSON-Block wird automatisch erkannt.' @input="error = ''" />
      <div class="grid grid-cols-2 gap-2">
        <button class="btn" @click="paste"><Icon name="file" class="size-4" />Aus Zwischenablage</button>
        <button class="btn btn-primary" :disabled="!answer.trim()" @click="read">Einlesen</button>
      </div>
      <p v-if="error" class="notice notice-bad">⚠️ {{ error }}</p>
    </section>

    <section v-if="parsed" class="panel space-y-4 ring-2 ring-brand">
      <div v-if="parsed.warnings.length" class="notice">
        <b>Hinweise:</b>
        <ul class="mt-1 list-disc pl-5"><li v-for="w in parsed.warnings" :key="w">{{ w }}</li></ul>
      </div>
      <SetPreview v-for="s in parsed.sets" :key="s.id" :set="s" />
      <div class="grid grid-cols-2 gap-2">
        <button class="btn" @click="save(false)"><Icon name="edit" class="size-4" />Speichern & bearbeiten</button>
        <button class="btn btn-hero" @click="save(true)"><Icon name="play" class="size-4 fill-current" />Speichern & starten</button>
      </div>
    </section>
  </main>
  <StartModal v-if="starting" :set-id="starting" @close="starting = null" />
</template>
