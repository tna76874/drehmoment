<script setup>
// Dialog: Bild zu einer Frage oder Antwort – Graph (JSON), Vektorgrafik (SVG) oder Foto.
// Für Graph und SVG gibt es einen fertigen KI-Prompt; Fotos lassen sich vektorisieren (Zeichnungen, Tafelbilder).
import { ref, computed, watch } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import QMedia from './QMedia.vue'
import DrawEditor from './DrawEditor.vue'
import { normalizePlot, gridOf, GRID_NAMES } from '../lib/plot.js'
import { cleanSvg, mediaBytes, minifySvg } from '../lib/media.js'
import { GRAPH_HELP, SVG_HELP, extractJson } from '../lib/format.js'
import { plainMath } from '../lib/math.js'
import { copyText, toast } from '../lib/ui.js'

const props = defineProps({
  modelValue: Object, // Medien-Objekt oder null
  title: { type: String, default: 'Bild' },
  context: { type: String, default: '' }, // Frage (+ Antworten) – für den KI-Prompt
  small: Boolean, // Antwortbild (klein)
})
const emit = defineEmits(['update:modelValue', 'close'])

const TEMPLATES = {
  Parabel: { x: [-4, 4], fn: ['x^2-2'], points: [[0, -2, 'S']] },
  Gerade: { x: [-4, 4], fn: ['2x-1'] },
  'sin/cos': { x: [-6.3, 6.3], y: [-1.5, 1.5], fn: [{ f: 'sin(x)', label: 'f' }, { f: 'cos(x)', label: 'g', dash: true }] },
  Fläche: { x: [-1, 4], fn: [{ f: '0.5x^2', fill: [0, 2] }] },
  Dreieck: { x: [-1, 5], y: [-1, 4], equal: true, polygons: [[[0, 0], [4, 0], [0, 3]]], texts: [[2, -0.5, 'a'], [-0.4, 1.5, 'b']] },
  Säulen: { bars: { labels: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], values: [3, 5, 2, 7, 4] } },
  'v-t-Diagramm': { x: [0, 10], y: [0, 6], lines: [[[0, 0], [2, 4], [6, 4], [9, 0]]], xlabel: 't', xunit: 's', ylabel: 'v', yunit: 'm/s', grid: { x: 'minor', y: 'major' } },
  '3D-Vektoren': { space: { vectors: [{ v: [2, 3, 1], label: 'a' }, { v: [0, 2, 3], label: 'b' }], guides: true } },
  'Ebene + Gerade': { space: { range: [-1, 4], planes: [{ n: [0, 0.3, 1], d: 1.5, label: 'E' }], lines: [{ p: [1, 1, 0], d: [0.5, 0.5, 1], label: 'g' }], box: true } },
}

const tab = ref(props.modelValue?.type || 'plot')
const plotText = ref(JSON.stringify(props.modelValue?.type === 'plot' ? props.modelValue.plot : TEMPLATES.Parabel, null, 1).replace(/\n\s*/g, ' '))
const svgText = ref(props.modelValue?.type === 'svg' ? props.modelValue.svg : '')
const raster = ref(props.modelValue?.type === 'raster' ? props.modelValue : null)
const busy = ref(false)
const drawing = ref(false) // Zeicheneditor offen

// --- aktuelles Ergebnis + Fehler je Reiter
const plotRes = computed(() => {
  try {
    const t = plotText.value.trim()
    const obj = /^[{[]/.test(t) ? JSON.parse(t) : extractJson(t)
    return { media: { type: 'plot', plot: normalizePlot(obj.graph ?? obj.plot ?? obj) } }
  } catch (e) { return { error: e.message } }
})
const svgRes = computed(() => {
  if (!svgText.value.trim()) return { error: '' }
  try { return { media: { type: 'svg', svg: cleanSvg(svgText.value) } } } catch (e) { return { error: e.message } }
})
// ---- einfache Schalter/Felder, die die Beschreibung direkt ändern (Gitter, Achsen)
const rawPlot = computed(() => { try { return JSON.parse(plotText.value) } catch { return null } })
const is2d = computed(() => !!(plotRes.value.media && !plotRes.value.media.plot.space && !plotRes.value.media.plot.bars && rawPlot.value))
const grid = computed(() => (plotRes.value.media ? gridOf(plotRes.value.media.plot) : { x: 1, y: 1 }))
function patch(fn) { const o = JSON.parse(plotText.value); fn(o); plotText.value = JSON.stringify(o) }
function setGrid(axis, level) {
  patch((o) => {
    const g = { ...grid.value, [axis]: level }
    o.grid = g.x === g.y ? GRID_NAMES[g.x] : { x: GRID_NAMES[g.x], y: GRID_NAMES[g.y] }
    if (o.grid === 'major') delete o.grid
  })
}
function setField(key, val) { patch((o) => { if (val.trim()) o[key] = val.trim(); else delete o[key] }) }

const current = computed(() => (tab.value === 'plot' ? plotRes.value.media : tab.value === 'svg' ? svgRes.value.media : raster.value) || null)
const size = (m) => { const b = m?.type === 'svg' ? minifySvg(m.svg).length : mediaBytes(m); return b < 1000 ? b + ' Byte' : (b / 1000).toFixed(1) + ' kB' }

// --- KI-Prompts
const ctx = computed(() => (props.context ? `\nZur Quizfrage:\n"""\n${plainMath(props.context)}\n"""\n` : ''))
function graphPrompt() {
  return `Erstelle ${props.small ? 'eine kleine Abbildung für eine Antwortmöglichkeit' : 'eine Abbildung'} für eine Quizfrage in der Unterrichts-App „Drehmoment“.${ctx.value}
Beschreibe den Graphen/das Diagramm im folgenden JSON-Format und antworte NUR mit einem JSON-Codeblock.
Wähle den Achsenbereich so, dass alles Wichtige (Nullstellen, Scheitel, Schnittpunkte) gut sichtbar ist. Verrate die Lösung nicht durch Beschriftungen.
${GRAPH_HELP}`
}
function svgPrompt() {
  return `Zeichne ${props.small ? 'eine kleine Abbildung für eine Antwortmöglichkeit' : 'eine Abbildung'} für eine Quizfrage in der Unterrichts-App „Drehmoment“.${ctx.value}
Antworte NUR mit dem SVG-Code in einem Codeblock. Verrate die Lösung nicht durch Beschriftungen.
${SVG_HELP}`
}
async function copyPrompt(kind) {
  if (await copyText(kind === 'plot' ? graphPrompt() : svgPrompt())) toast('Prompt kopiert – in die KI einfügen, Antwort hier einfügen', 'ok', 4000)
}
async function pasteInto(target) {
  try {
    const t = await navigator.clipboard.readText()
    if (!t) return
    if (target === 'plot') plotText.value = t; else svgText.value = t
  } catch { toast('Einfügen nicht erlaubt – bitte lange ins Feld tippen und „Einsetzen“ wählen') }
}

// --- Foto
const fileInput = ref(null)
async function pickFile(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  busy.value = true
  try {
    const { fileToMedia } = await import('../lib/imageenc.js')
    const m = await fileToMedia(f, props.small ? { maxDim: 600, quality: 0.75 } : {})
    if (m.type === 'svg') { svgText.value = m.svg; tab.value = 'svg' } else { raster.value = m; vec.value = null }
  } catch (err) { toast(err.message, 'bad') } finally { busy.value = false }
}
async function pasteImage() {
  try {
    const items = await navigator.clipboard.read()
    for (const it of items) {
      const type = it.types.find((t) => t.startsWith('image/'))
      if (type) { await pickFile({ target: { files: [new File([await it.getType(type)], 'bild', { type })], value: '' } }); return }
    }
    toast('Kein Bild in der Zwischenablage')
  } catch { toast('Einfügen nicht möglich – bitte „Foto wählen“ nutzen') }
}

// --- Vektorisieren (Zeichnungen, Tafelbilder, Diagramme)
const vec = ref(null) // {svg, threshold}
const threshold = ref(0)
const invert = ref(false)
const colors = ref(2) // 2 = Schwarz/Weiß (mit Schwelle), sonst Anzahl Farben inkl. Hintergrund
let gray = null, rgba = null
async function vectorize() {
  busy.value = true
  try {
    const enc = await import('../lib/imageenc.js'), tr = await import('../lib/trace.js')
    const dim = props.small ? 300 : 500
    if (colors.value === 2) {
      gray = gray && gray.src === raster.value.src ? gray : { src: raster.value.src, ...(await enc.imageToGray(raster.value.src, dim)) }
      const r = tr.traceToSvg(gray.gray, gray.w, gray.h, { threshold: threshold.value || undefined, invert: invert.value, eps: 1, minArea: 8 })
      threshold.value = r.threshold
      vec.value = { svg: r.svg }
    } else {
      rgba = rgba && rgba.src === raster.value.src ? rgba : { src: raster.value.src, ...(await enc.imageToRgba(raster.value.src, dim)) }
      const r = tr.traceColorToSvg(rgba.rgba, rgba.w, rgba.h, { colors: colors.value, eps: 1, minArea: 10 })
      vec.value = { svg: r.svg, palette: r.palette }
    }
  } catch (e) { toast(e.message, 'bad') } finally { busy.value = false }
}
watch([threshold, invert, colors], () => { if (vec.value) vectorize() })
function useVector() { svgText.value = vec.value.svg; tab.value = 'svg'; vec.value = null }

function save() { emit('update:modelValue', current.value); emit('close') }
function remove() { emit('update:modelValue', null); emit('close') }
</script>

<template>
  <Modal :title="title" @close="emit('close')">
    <div class="space-y-3">
      <div class="seg w-full">
        <button class="flex-1" :class="{ on: tab === 'plot' }" @click="tab = 'plot'">📈 Graph</button>
        <button class="flex-1" :class="{ on: tab === 'svg' }" @click="tab = 'svg'">✏️ Skizze</button>
        <button class="flex-1" :class="{ on: tab === 'raster' }" @click="tab = 'raster'">📷 Foto</button>
      </div>

      <!-- Graph -->
      <template v-if="tab === 'plot'">
        <p class="text-xs text-muted">Funktionsgraphen, Physik-Diagramme mit Einheiten, Flächen, Dreiecke, Säulendiagramme und 3D (Vektoren, Geraden, Ebenen) – als kleine Beschreibung. Winzig im QR-Code (meist &lt; 150 Byte).</p>
        <div class="flex flex-wrap gap-1">
          <button v-for="(t, name) in TEMPLATES" :key="name" class="chip cursor-pointer" @click="plotText = JSON.stringify(t)">{{ name }}</button>
        </div>
        <textarea v-model="plotText" rows="4" class="font-mono text-xs" spellcheck="false" aria-label="Graph-Beschreibung" />
        <div v-if="is2d" class="space-y-2 rounded-2xl bg-surface-2 p-3 text-sm">
          <div v-for="ax in ['x', 'y']" :key="ax" class="grid grid-cols-[2.2rem_1fr] items-center gap-2">
            <b class="text-xs leading-tight">{{ ax }}-<br />Achse</b>
            <div class="space-y-1.5">
              <div class="seg w-full">
                <button v-for="(l, lv) in ['Keins', 'Haupt', 'Fein']" :key="lv" class="flex-1 text-xs" :class="{ on: grid[ax] === lv }" :aria-label="'Gitter ' + ax + ': ' + ['kein Gitter', 'Hauptlinien', 'Haupt- und Nebenlinien'][lv]" @click="setGrid(ax, lv)">{{ l }}</button>
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <input :value="rawPlot[ax + 'label'] || ''" type="text" class="py-1! text-sm" :placeholder="'Größe (z. B. ' + (ax === 'x' ? 't' : 'v') + ')'" :aria-label="'Achsenname ' + ax" @change="setField(ax + 'label', $event.target.value)" />
                <input :value="rawPlot[ax + 'unit'] || ''" type="text" class="py-1! text-sm" :placeholder="'Einheit (z. B. ' + (ax === 'x' ? 's' : 'm/s') + ')'" :aria-label="'Einheit ' + ax" @change="setField(ax + 'unit', $event.target.value)" />
              </div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-sm" @click="copyPrompt('plot')"><Icon name="copy" class="size-4" />KI-Prompt</button>
          <button class="btn btn-sm" @click="pasteInto('plot')">📋 KI-Antwort einfügen</button>
        </div>
        <p v-if="plotRes.error" class="text-sm text-bad">{{ plotRes.error }}</p>
      </template>

      <!-- Zeicheneditor -->
      <DrawEditor v-if="tab === 'svg' && drawing" :svg="svgRes.media ? svgRes.media.svg : ''" @done="(x) => { svgText = x; drawing = false }" @cancel="drawing = false" />

      <!-- SVG -->
      <template v-if="tab === 'svg' && !drawing">
        <button class="btn w-full" @click="drawing = true">✏️ {{ svgRes.media ? 'Zeichnen / beschriften' : 'Selbst zeichnen' }}</button>
        <p class="text-xs text-muted">Vektorgrafik (SVG) – selbst gezeichnet, von einer KI gezeichnet oder vektorisiert. Klein und gestochen scharf. Vorhandene Bilder lassen sich im Zeicheneditor beschriften.</p>
        <textarea v-model="svgText" rows="5" class="font-mono text-xs" spellcheck="false" placeholder="<svg viewBox='0 0 200 150'> … </svg>" aria-label="SVG-Code" />
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-sm" @click="copyPrompt('svg')"><Icon name="copy" class="size-4" />KI-Prompt</button>
          <button class="btn btn-sm" @click="pasteInto('svg')">📋 KI-Antwort einfügen</button>
        </div>
        <p v-if="svgRes.error" class="text-sm text-bad">{{ svgRes.error }}</p>
      </template>

      <!-- Foto -->
      <template v-if="tab === 'raster'">
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="pickFile" />
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-sm" :disabled="busy" @click="fileInput.click()"><Icon name="camera" class="size-4" />Foto wählen</button>
          <button class="btn btn-sm" :disabled="busy" @click="pasteImage">📋 Einfügen</button>
        </div>
        <p class="text-xs text-muted">Fotos werden beim Einfügen verkleinert und für QR-Codes bei Bedarf automatisch weiter verkleinert. <b>Zeichnungen, Tafelbilder, Diagramme</b> lieber vektorisieren – das ist oft viel kleiner und schärfer.</p>
        <div v-if="raster" class="space-y-2 rounded-2xl bg-surface-2 p-3">
          <button class="btn btn-sm w-full" :disabled="busy" @click="vectorize">✨ Vektorisieren</button>
          <template v-if="vec">
            <div class="flex items-center gap-2"><span class="text-xs text-muted">Farben</span><div class="seg flex-1">
              <button v-for="[n, l] in [[2, 'S/W'], [3, '3'], [4, '4'], [6, '6']]" :key="n" class="flex-1 text-xs" :class="{ on: colors === n }" @click="colors = n">{{ l }}</button>
            </div></div>
            <template v-if="colors === 2">
              <label class="block text-xs text-muted">Schwelle (heller = mehr Linien): {{ threshold }}
                <input v-model.number="threshold" type="range" min="20" max="240" step="5" class="w-full" />
              </label>
              <label class="check text-sm"><input v-model="invert" type="checkbox" />Helle Linien auf dunklem Grund (Tafel)</label>
            </template>
            <p v-else-if="vec?.palette" class="flex items-center gap-1 text-xs text-muted">Erkannt:
              <span v-for="c in vec.palette" :key="c" class="inline-block size-4 rounded border border-line" :style="{ background: c }" />
              <span class="ml-1">(mehr Farben = genauer, aber größer)</span>
            </p>
            <div class="grid grid-cols-2 gap-2 text-center text-xs">
              <figure class="m-0"><QMedia :media="raster" class="mx-auto max-h-32 w-full" /><figcaption class="mt-1 text-muted">Foto · {{ size(raster) }}</figcaption></figure>
              <figure class="m-0"><QMedia :media="{ type: 'svg', svg: vec.svg }" class="mx-auto max-h-32 w-full" /><figcaption class="mt-1 text-muted">Vektor · {{ size({ type: 'svg', svg: vec.svg }) }}</figcaption></figure>
            </div>
            <button class="btn btn-sm btn-primary w-full" @click="useVector"><Icon name="check" class="size-4" />Vektor übernehmen</button>
          </template>
        </div>
      </template>

      <div v-if="current && !(tab === 'raster' && vec) && !drawing" class="rounded-2xl border border-line p-2">
        <QMedia :media="current" class="mx-auto max-h-64 w-full" />
        <p class="mt-1 text-center text-xs text-muted">{{ size(current) }}</p>
      </div>

      <div v-if="!drawing" class="grid grid-cols-[1fr_auto] gap-2">
        <button class="btn btn-primary" :disabled="!current || busy" @click="save"><Icon name="check" class="size-4" />Übernehmen</button>
        <button v-if="modelValue" class="btn btn-danger" @click="remove"><Icon name="trash" class="size-4" />Entfernen</button>
      </div>
    </div>
  </Modal>
</template>
