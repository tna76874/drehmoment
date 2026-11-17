<script setup>
// QR-Code für ein Quiz.
//  • „Nur Inhalt“ (Standard): Quiz steckt komplett im Code, ohne Web-Adresse – funktioniert für immer,
//    egal wo die App gehostet ist. Lesen mit „QR scannen“ in Drehmoment. Große Quizze -> mehrere kleine Codes.
//  • „Link“: Handykamera öffnet direkt die App – hängt aber an der aktuellen Adresse.
import { ref, computed, watch } from 'vue'
import qrcode from 'qrcode-generator'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { setLink, qrTexts } from '../lib/share.js'
import { state } from '../lib/store.js'
import { copyText, toast, shareFile, slug } from '../lib/ui.js'
import { quizQrPdf } from '../lib/pdf.js'
import { hasMath } from '../lib/math.js'
import { loadMathRenderer } from '../lib/mathpdf.js'
import { fitRasters, setHasRaster, withoutRasters, RASTER_LEVELS } from '../lib/media.js'
import { planQuizQr, MIN_MOD } from '../lib/qrlayout.js'

const props = defineProps({ set: Object })
const emit = defineEmits(['close'])
const start = ref(true)
const mode = ref(state.prefs.qrMode || 'content')
const size = ref(state.prefs.qrSize || 500)
watch(mode, (v) => (state.prefs.qrMode = v))
watch(size, (v) => (state.prefs.qrSize = v))

// Formeln im PDF: MathJax vorab laden (iOS erlaubt „Teilen“ nur kurz nach dem Antippen)
const needsMath = [props.set.title, props.set.description, ...props.set.questions.map((q) => q.text)].some(hasMath)
let mathR = null
if (needsMath) loadMathRenderer().then((r) => (mathR = r)).catch(() => {})
const busy = ref(false)

// ---- Bilder: Fotos stufenweise verkleinern, bis das Quiz auf 2 A4-Seiten passt
const hasPhotos = setHasRaster(props.set)
const fitted = ref(null) // {set, level, fits}
const fitting = ref(false)
const dropPhotos = ref(false)
const allowMore = ref(false)
let fitRun = 0
async function refit() {
  if (!hasPhotos) return
  const run = ++fitRun
  fitting.value = true
  try {
    const { encodeRaster } = await import('../lib/imageenc.js')
    const r = await fitRasters(props.set, {
      encode: encodeRaster,
      fits: (s) => { const p = planQuizQr(s, { start: start.value, maxBytes: size.value }); return !!p.lay && p.mod >= MIN_MOD },
    })
    if (run === fitRun) fitted.value = r
  } catch (e) { toast(e.message, 'bad') } finally { if (run === fitRun) fitting.value = false }
}
watch([start, size], refit, { immediate: true })
const effSet = computed(() => (dropPhotos.value ? withoutRasters(props.set) : fitted.value?.set || props.set))
const need = computed(() => (mode.value === 'content' ? planQuizQr(effSet.value, { start: start.value, maxBytes: size.value, maxPages: 99 }) : null))
const tooBig = computed(() => need.value && need.value.pages > 2)

async function pdf() {
  busy.value = true
  try {
    const math = mathR || (needsMath ? await loadMathRenderer().catch(() => null) : null)
    const doc = quizQrPdf(effSet.value, { mode: mode.value, start: start.value, maxBytes: size.value, math, maxPages: allowMore.value ? 99 : 2 })
    await shareFile(doc.output('blob'), `drehmoment-quiz-${slug(props.set.title)}.pdf`, props.set.title)
  } catch (e) { toast(e.message, 'bad', 5000) } finally { busy.value = false }
}

const SIZES = [[300, 'Klein'], [500, 'Mittel'], [2000, 'Ein Code']]

const result = computed(() => {
  if (mode.value === 'link') {
    const l = setLink(effSet.value, { start: start.value })
    return { texts: [l.url], link: l, alnum: false }
  }
  const r = qrTexts(effSet.value, { maxBytes: size.value, autostart: start.value })
  return { texts: r.texts, bytes: r.bytes, alnum: true }
})

function matrixOf(text, alnum) {
  const qr = qrcode(0, 'L')
  qr.addData(text, alnum ? 'Alphanumeric' : 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
  return { d, n }
}
const codes = computed(() => result.value.texts.map((t) => matrixOf(t, result.value.alnum)))
const multi = computed(() => codes.value.length > 1)

async function copy() { if (await copyText(result.value.texts.join('\n'))) toast(mode.value === 'link' ? 'Link kopiert' : 'Code-Text kopiert', 'ok') }

async function png() {
  const list = codes.value, q = 4, px = 10
  const cell = Math.max(...list.map((m) => m.n + 2 * q)) * px
  const cols = Math.min(list.length, 3), rows = Math.ceil(list.length / cols)
  const lab = multi.value ? 44 : 0
  const c = document.createElement('canvas')
  c.width = cols * cell; c.height = rows * (cell + lab) + 100
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  list.forEach((m, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + lab)
    const off = (cell - m.n * px) / 2
    ctx.save(); ctx.translate(x + off, y + off); ctx.scale(px, px); ctx.fillStyle = '#000'; ctx.fill(new Path2D(m.d)); ctx.restore()
    if (multi.value) { ctx.fillStyle = '#5b3df5'; ctx.font = '700 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`Teil ${i + 1} / ${list.length}`, x + cell / 2, y + cell + 24) }
  })
  const h = rows * (cell + lab)
  ctx.textAlign = 'center'; ctx.fillStyle = '#17151f'; ctx.font = '700 34px system-ui, sans-serif'
  ctx.fillText(props.set.title.slice(0, 50), c.width / 2, h + 40)
  ctx.fillStyle = '#6c6879'; ctx.font = '24px system-ui, sans-serif'
  ctx.fillText(mode.value === 'link' ? 'Mit Drehmoment oder der Handykamera scannen' : 'In Drehmoment „QR scannen“' + (multi.value ? ' – alle Teile nacheinander' : ''), c.width / 2, h + 78)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  await shareFile(blob, `drehmoment-qr-${slug(props.set.title)}.png`, props.set.title)
}
</script>

<template>
  <Modal title="Als QR-Code teilen" @close="emit('close')">
    <div class="space-y-4">
      <div class="seg w-full">
        <button class="flex-1" :class="{ on: mode === 'content' }" @click="mode = 'content'">Nur Inhalt</button>
        <button class="flex-1" :class="{ on: mode === 'link' }" @click="mode = 'link'">Mit Link</button>
      </div>
      <p class="text-xs text-muted">
        <template v-if="mode === 'content'">Das Quiz steckt komplett und stark komprimiert im Code – ohne Web-Adresse. So bleibt er kleiner und funktioniert für immer, egal wo Drehmoment gehostet ist. Lesen mit <b>„QR scannen“</b> in Drehmoment.</template>
        <template v-else>Die Handykamera öffnet direkt Drehmoment. Der Code ist größer und hängt an der Adresse <b>dieser</b> Seite. In Drehmoment über „QR scannen“ funktioniert er aber auch nach einem Umzug.</template>
      </p>

      <div class="grid gap-3" :class="multi ? 'grid-cols-2' : ''">
        <figure v-for="(m, i) in codes" :key="i" class="m-0">
          <div class="mx-auto w-full max-w-72 rounded-3xl bg-white p-3 shadow-inner">
            <svg :viewBox="`-4 -4 ${m.n + 8} ${m.n + 8}`" class="block h-auto w-full" role="img" :aria-label="multi ? `QR-Code Teil ${i + 1}` : 'QR-Code'">
              <path :d="m.d" fill="#000" shape-rendering="crispEdges" />
            </svg>
          </div>
          <figcaption v-if="multi" class="mt-1 text-center text-xs font-bold text-brand">Teil {{ i + 1 }} / {{ codes.length }}</figcaption>
        </figure>
      </div>
      <p class="text-center text-xs text-muted">
        {{ codes[0].n }}×{{ codes[0].n }} Module<template v-if="result.bytes"> · {{ result.bytes }} Byte komprimiert</template><template v-if="multi"> · {{ codes.length }} Codes nacheinander scannen</template>
      </p>

      <div v-if="mode === 'content'">
        <label class="field-label">Größe je Code</label>
        <div class="seg w-full">
          <button v-for="s in SIZES" :key="s[0]" class="flex-1" :class="{ on: size === s[0] }" @click="size = s[0]">{{ s[1] }}</button>
        </div>
        <p class="mt-1.5 text-xs text-muted">Große Quizze werden auf mehrere kleine Codes verteilt – die liest jede Kamera zuverlässig.</p>
      </div>

      <div v-if="mode === 'content' && (hasPhotos || tooBig)" class="space-y-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <p v-if="fitting">⏳ Fotos werden für die QR-Codes verkleinert …</p>
        <p v-else-if="hasPhotos && !dropPhotos && fitted && fitted.level >= 0">
          🖼 Fotos für die QR-Codes verkleinert auf {{ RASTER_LEVELS[fitted.level].big }} px
          (Stufe {{ fitted.level + 1 }}/{{ fitted.levels }}{{ fitted.level >= 6 ? ' – sehr klein' : '' }}).
          <template v-if="fitted.level >= 4"> Tipp: Zeichnungen und Diagramme im Bild-Dialog vektorisieren – das ist schärfer und kleiner.</template>
        </p>
        <p v-if="need">📄 Benötigt <b>{{ need.pages }} A4-{{ need.pages === 1 ? 'Seite' : 'Seiten' }}</b> · {{ (need.bytes / 1000).toFixed(1) }} kB in {{ need.texts.length }} Code(s)</p>
        <div v-if="tooBig && !fitting" class="notice space-y-2">
          <p><b>Passt nicht auf 2 Blätter.</b> {{ hasPhotos && !dropPhotos ? 'Selbst die kleinste Foto-Stufe ist zu groß.' : '' }} Du kannst mehr Seiten drucken{{ hasPhotos && !dropPhotos ? ' oder die Fotos weglassen (Graphen und Zeichnungen bleiben)' : '' }} – oder das Quiz als Datei teilen.</p>
          <label class="check"><input v-model="allowMore" type="checkbox" />{{ need.pages }} Seiten drucken</label>
          <label v-if="hasPhotos" class="check"><input v-model="dropPhotos" type="checkbox" />Fotos weglassen</label>
        </div>
      </div>

      <label class="check rounded-2xl bg-surface-2 px-4 py-2">
        <input v-model="start" type="checkbox" />
        <span><b class="block">Sitzung direkt starten</b><span class="text-sm text-muted">Nach dem Scannen geht die Abstimmung sofort los</span></span>
      </label>
      <p v-if="result.link?.trimmed" class="notice text-xs">
        Damit der Link lesbar bleibt, wurden {{ result.link.trimmed === 'media' ? 'Material, Erklärungen und Bilder' : result.link.trimmed === 'both' ? 'Vorbereitungsmaterial und Erklärungen' : 'das Vorbereitungsmaterial' }} weggelassen. „Nur Inhalt“ nimmt alles mit.
      </p>
      <button class="btn btn-hero btn-lg" :disabled="busy || fitting || (tooBig && !allowMore)" @click="pdf"><Icon name="download" />{{ busy ? 'Erstelle PDF …' : 'PDF zum Ausdrucken' }}</button>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn" @click="copy"><Icon name="link" class="size-4" />{{ mode === 'link' ? 'Link kopieren' : 'Text kopieren' }}</button>
        <button class="btn" @click="png"><Icon name="download" class="size-4" />Bild speichern</button>
      </div>
    </div>
  </Modal>
</template>
