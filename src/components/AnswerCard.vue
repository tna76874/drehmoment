<script setup>
// Bildschirm-Vorschau einer Antwortkarte – gleiche Geometrie wie im PDF (QR fest pro Karte gedreht).
import { computed } from 'vue'
import { cardPath } from '../lib/qr.js'
import { cardLayout, cardInfo } from '../lib/pdf.js'
const props = defineProps({ card: Number, name: String, gid: String, big: Boolean }) // big: Buchstaben für die Erklärung größer zeigen
const lay = cardLayout({ x: 0, y: 0, w: 100, h: 100 })
const qr = computed(() => cardPath(props.gid || props.card))
const info = computed(() => cardInfo(props.card, props.name && props.name.slice(0, 40), props.gid))
const fs = computed(() => lay.letterPt * 0.3528 * (props.big ? 2.4 : 1))
</script>
<template>
  <svg viewBox="0 0 100 100" class="block h-auto w-full rounded-2xl bg-white" role="img" :aria-label="gid ? 'Schüler-Karte ' + gid : 'Karte ' + card">
    <g :transform="`translate(${lay.cx - lay.qr / 2} ${lay.cy - lay.qr / 2}) scale(${lay.qr / qr.size})`">
      <path :d="qr.d" fill="#000" shape-rendering="crispEdges" />
    </g>
    <g font-family="Helvetica, Arial, sans-serif" fill="#6e6e6e">
      <text
        v-for="t in lay.letters" :key="t.L" :x="t.x" :y="t.y" :transform="`rotate(${-t.angle} ${t.x} ${t.y})`"
        text-anchor="middle" dominant-baseline="central" font-weight="800" :font-size="fs"
      >{{ t.L }}</text>
      <template v-if="!big">
        <text
          v-for="t in lay.letters" :key="'i' + t.L" :x="t.ix" :y="t.iy" :transform="`rotate(${-t.angle} ${t.ix} ${t.iy})`"
          dominant-baseline="central" :font-size="lay.infoPt * 0.3528"
        >{{ info }}</text>
      </template>
    </g>
  </svg>
</template>
