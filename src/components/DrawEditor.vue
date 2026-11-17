<script setup>
// Mini-Zeicheneditor: Skizzen zeichnen oder ein vorhandenes Bild (SVG) beschriften. Ergebnis ist ein kleines SVG.
import { ref, computed } from 'vue'
import { W, H, GRID, COLORS, WIDTHS, buildDrawing, parseDrawing, penPath, arrowPath, bgImageUrl, gridPath } from '../lib/draw.js'

const props = defineProps({ svg: { type: String, default: '' } })
const emit = defineEmits(['done', 'cancel'])

const start = (() => { try { return parseDrawing(props.svg) } catch { return { shapes: [], bg: '', grid: 0 } } })()
const shapes = ref(start.shapes)
const bg = ref(start.bg)
const history = ref([])
const tool = ref('pen')
const color = ref(COLORS[0])
const width = ref(WIDTHS[0])
const filled = ref(false)
const snap = ref(!!start.grid)
const keepGrid = ref(!!start.grid)
const draft = ref(null)
const svgEl = ref(null)

const TOOLS = [['pen', '✏️', 'Stift'], ['line', '／', 'Linie'], ['arrow', '↗', 'Pfeil'], ['rect', '▭', 'Rechteck'], ['ellipse', '◯', 'Ellipse'], ['text', 'T', 'Text'], ['erase', '⌫', 'Radierer']]
const bgUrl = computed(() => bgImageUrl(bg.value))
const gridD = gridPath(GRID)

function commit(next) { history.value.push(shapes.value); if (history.value.length > 60) history.value.shift(); shapes.value = next }
function undo() { if (history.value.length) shapes.value = history.value.pop() }
function clearAll() { if (shapes.value.length) commit([]) }

function pos(e) {
  const pt = svgEl.value.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  const p = pt.matrixTransform(svgEl.value.getScreenCTM().inverse())
  let x = Math.max(0, Math.min(W, p.x)), y = Math.max(0, Math.min(H, p.y))
  if (snap.value && tool.value !== 'pen') { x = Math.round(x / (GRID / 2)) * (GRID / 2); y = Math.round(y / (GRID / 2)) * (GRID / 2) }
  return [x, y]
}
const stroke = () => ({ stroke: color.value, 'stroke-width': String(width.value) })
const fillOf = () => (filled.value ? { fill: color.value, 'fill-opacity': '0.25' } : { fill: 'none' })

function shapeFrom(d) {
  const [x1, y1] = d.a, [x2, y2] = d.b
  if (d.tool === 'pen') return { tag: 'path', a: { d: penPath(d.pts), ...stroke(), fill: 'none' } }
  if (d.tool === 'line') return { tag: 'line', a: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), ...stroke() } }
  if (d.tool === 'arrow') return { tag: 'path', a: { d: arrowPath(x1, y1, x2, y2, width.value), ...stroke(), fill: 'none' } }
  const r = (v) => String(Math.round(v * 10) / 10)
  if (d.tool === 'rect') return { tag: 'rect', a: { x: r(Math.min(x1, x2)), y: r(Math.min(y1, y2)), width: r(Math.abs(x2 - x1)), height: r(Math.abs(y2 - y1)), ...stroke(), ...fillOf() } }
  if (d.tool === 'ellipse') return { tag: 'ellipse', a: { cx: r((x1 + x2) / 2), cy: r((y1 + y2) / 2), rx: r(Math.abs(x2 - x1) / 2), ry: r(Math.abs(y2 - y1) / 2), ...stroke(), ...fillOf() } }
  return null
}
const draftShape = computed(() => (draft.value ? shapeFrom(draft.value) : null))

function down(e) {
  if (tool.value === 'erase') return // Radierer: Klick auf ein Element (siehe erase)
  e.preventDefault()
  const p = pos(e)
  if (tool.value === 'text') {
    const t = window.prompt('Text')
    if (t && t.trim()) commit([...shapes.value, { tag: 'text', a: { x: String(Math.round(p[0])), y: String(Math.round(p[1])), 'font-size': String(Math.round(12 + width.value * 3)), fill: color.value, stroke: 'none' }, text: t.trim().slice(0, 80) }])
    return
  }
  svgEl.value.setPointerCapture?.(e.pointerId)
  draft.value = { tool: tool.value, a: p, b: p, pts: [p] }
}
function move(e) {
  if (!draft.value) return
  const p = pos(e)
  draft.value = { ...draft.value, b: p, pts: draft.value.tool === 'pen' ? [...draft.value.pts, p] : draft.value.pts }
}
function up() {
  const d = draft.value
  draft.value = null
  if (!d) return
  const big = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) > 3
  if (d.tool !== 'pen' && !big) return
  const s = shapeFrom(d)
  if (s) commit([...shapes.value, s])
}
function erase(i) { if (tool.value === 'erase') commit(shapes.value.filter((_, k) => k !== i)) }

function done() { emit('done', buildDrawing({ shapes: shapes.value, bg: bg.value, grid: keepGrid.value ? 1 : 0 })) }
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-1" role="toolbar" aria-label="Werkzeuge">
      <button v-for="[t, icon, label] in TOOLS" :key="t" class="btn btn-sm min-w-10 px-2!" :class="tool === t ? 'btn-primary' : ''" :aria-label="label" :title="label" @click="tool = t">{{ icon }}</button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <button v-for="c in COLORS" :key="c" class="size-7 rounded-full border-2" :class="color === c ? 'border-ink ring-2 ring-brand' : 'border-white'" :style="{ background: c }" :aria-label="'Farbe ' + c" @click="color = c" />
      <span class="mx-1 h-6 w-px bg-line" />
      <button v-for="(w, i) in WIDTHS" :key="w" class="grid size-8 place-items-center rounded-xl" :class="width === w ? 'bg-brand-soft' : ''" :aria-label="['dünn', 'mittel', 'dick'][i]" @click="width = w">
        <span class="block rounded-full bg-ink" :style="{ width: w * 2 + 'px', height: w * 2 + 'px' }" />
      </button>
      <label class="check ml-1 text-xs"><input v-model="filled" type="checkbox" />gefüllt</label>
    </div>

    <svg
      ref="svgEl" :viewBox="`0 0 ${W} ${H}`" class="block w-full touch-none rounded-2xl border border-line bg-white select-none"
      :class="tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair'" role="img" aria-label="Zeichenfläche"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"
    >
      <path v-if="snap || keepGrid" :d="gridD" :stroke="keepGrid ? '#d9d6e3' : '#ecebf1'" stroke-width="0.7" />
      <image v-if="bgUrl" :href="bgUrl" x="0" y="0" :width="W" :height="H" preserveAspectRatio="xMidYMid meet" />
      <g stroke-linecap="round" stroke-linejoin="round" font-family="Helvetica,Arial,sans-serif">
        <template v-for="(s, i) in shapes" :key="i">
          <text v-if="s.tag === 'text'" v-bind="s.a">{{ s.text }}</text>
          <component :is="s.tag" v-else v-bind="s.a" />
          <!-- breite unsichtbare Trefferfläche für den Radierer -->
          <component :is="s.tag === 'text' ? 'rect' : s.tag" v-if="tool === 'erase'" v-bind="s.tag === 'text' ? { x: +s.a.x - 4, y: +s.a.y - (+s.a['font-size'] || 16), width: s.text.length * (+s.a['font-size'] || 16) * 0.6 + 8, height: (+s.a['font-size'] || 16) + 6 } : s.a"
            stroke="transparent" stroke-width="16" fill="transparent" pointer-events="all" :data-i="i" @pointerdown.stop="erase(i)" />
        </template>
        <component :is="draftShape.tag" v-if="draftShape" v-bind="draftShape.a" opacity="0.7" />
      </g>
    </svg>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <button class="btn btn-sm" :disabled="!history.length" @click="undo">↶ Rückgängig</button>
      <button class="btn btn-sm btn-ghost" :disabled="!shapes.length" @click="clearAll">Alles löschen</button>
      <button v-if="bg" class="btn btn-sm btn-ghost" @click="bg = ''">Hintergrund entfernen</button>
      <label class="check text-xs"><input v-model="snap" type="checkbox" />Raster (einrasten)</label>
      <label class="check text-xs"><input v-model="keepGrid" type="checkbox" />Kästchen mitspeichern</label>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-primary" @click="done">✓ Zeichnung übernehmen</button>
      <button class="btn" @click="emit('cancel')">Abbrechen</button>
    </div>
  </div>
</template>
