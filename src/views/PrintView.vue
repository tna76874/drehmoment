<script setup>
// Druckseite für Agenten & Tools:  #/print?d=<base64url-JSON> | ?json= | ?url= | ?b= | ?z=
//   Optionen: &mode=content|link  &size=300|500|2000  &start=0|1
// Erzeugt sofort das A4-Blatt mit Quiz-QR-Code(s) – die Lehrkraft druckt nur noch aus.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { route, go } from '../lib/router.js'
import { state, startSession, getSet } from '../lib/store.js'
import { resolveImport, fingerprint } from '../lib/share.js'
import { parseImport } from '../lib/format.js'
import { quizQrPdf } from '../lib/pdf.js'
import { hasMath } from '../lib/math.js'
import { loadMathRenderer } from '../lib/mathpdf.js'
import { downloadBlob, toast, slug } from '../lib/ui.js'
import Icon from '../components/Icon.vue'
import SetPreview from '../components/SetPreview.vue'
import StartModal from '../components/StartModal.vue'

const q = route.query
const set = ref(null)
const error = ref('')
const pdfUrl = ref('')
const busy = ref(true)
const mode = ref(q.mode === 'link' ? 'link' : 'content')
const size = ref([300, 500, 2000].includes(+q.size) ? +q.size : 500)
const start = ref(q.start !== '0')
const starting = ref(null)
const frame = ref(null)
let blob = null, math = null

async function render() {
  if (!set.value) return
  busy.value = true
  try {
    const doc = quizQrPdf(set.value, { mode: mode.value, start: start.value, maxBytes: size.value, math })
    blob = doc.output('blob')
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = URL.createObjectURL(blob)
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

onMounted(async () => {
  try {
    const { parsed } = await resolveImport(q, parseImport)
    set.value = parsed.sets[0]
    const s = set.value
    if ([s.title, s.description, ...s.questions.map((x) => x.text)].some(hasMath)) math = await loadMathRenderer().catch(() => null)
    await render()
  } catch (e) {
    error.value = (e.name === 'TypeError' ? 'Die Adresse ist nicht erreichbar oder erlaubt keinen Abruf (CORS). ' : '') + e.message
    busy.value = false
  }
})
onBeforeUnmount(() => pdfUrl.value && URL.revokeObjectURL(pdfUrl.value))
watch([mode, size, start], render)

function print() {
  try { frame.value.contentWindow.focus(); frame.value.contentWindow.print() } catch { window.open(pdfUrl.value, '_blank') }
}
const save = () => downloadBlob(blob, `drehmoment-quiz-${slug(set.value.title)}.pdf`)

/** Quiz in die App übernehmen (ohne Duplikat) und direkt starten */
function useNow() {
  const s = JSON.parse(JSON.stringify(set.value))
  s.id = fingerprint(s)
  if (!getSet(s.id)) { state.sets.unshift(s); toast('Quiz gespeichert', 'ok') }
  if (state.classes.length) { starting.value = s.id; return }
  go('/live/' + startSession(s.id, null).id)
}
</script>

<template>
  <div class="topbar">
    <a href="#/" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
    <div class="topbar-title">Quiz-Blatt drucken</div>
  </div>
  <main class="page space-y-4">
    <div v-if="error" class="notice notice-bad">{{ error }}</div>
    <div v-else-if="!set" class="panel py-10 text-center text-muted">Erstelle das Blatt …</div>
    <template v-else>
      <div class="grid gap-2 sm:grid-cols-3">
        <button class="btn btn-hero btn-lg" :disabled="busy" @click="print"><Icon name="download" />Drucken</button>
        <button class="btn btn-lg" :disabled="busy" @click="save"><Icon name="download" />PDF speichern</button>
        <button class="btn btn-lg" @click="useNow"><Icon name="play" class="fill-current" />Jetzt starten</button>
      </div>

      <section class="panel space-y-3">
        <div class="seg w-full">
          <button class="flex-1" :class="{ on: mode === 'content' }" @click="mode = 'content'">Nur Inhalt</button>
          <button class="flex-1" :class="{ on: mode === 'link' }" @click="mode = 'link'">Mit Link</button>
        </div>
        <div v-if="mode === 'content'" class="seg w-full">
          <button v-for="s in [[300, 'Kleine Codes'], [500, 'Mittel'], [2000, 'Ein Code']]" :key="s[0]" class="flex-1" :class="{ on: size === s[0] }" @click="size = s[0]">{{ s[1] }}</button>
        </div>
        <label class="check"><input v-model="start" type="checkbox" />Nach dem Scannen direkt starten</label>
      </section>

      <div class="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <iframe v-if="pdfUrl" ref="frame" :src="pdfUrl" title="PDF-Vorschau" class="block h-[75vh] w-full" />
      </div>

      <details class="panel">
        <summary class="cursor-pointer font-semibold">Inhalt prüfen</summary>
        <div class="mt-3"><SetPreview :set="set" /></div>
      </details>
    </template>
  </main>
  <StartModal v-if="starting" :set-id="starting" @close="starting = null; go('/')" />
</template>
