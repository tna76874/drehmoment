<script setup>
// Bildschirm-Vorschau einer Antwortkarte – gleiche Geometrie wie im PDF.
import { computed } from 'vue'
import { cardPath } from '../lib/qr.js'
import { cardLayout } from '../lib/pdf.js'
import { formatGid } from '../lib/gid.js'
const props = defineProps({ card: Number, name: String, gid: String })
const slot = { x: 0, y: 0, w: 100, h: 100 }
const lay = cardLayout(slot)
const qr = computed(() => cardPath(props.gid || props.card))
</script>
<template>
  <svg viewBox="0 0 100 100" class="block h-auto w-full rounded-2xl bg-white" role="img" :aria-label="gid ? 'Schüler-Karte ' + gid : 'Karte ' + card">
    <g :transform="`translate(${lay.cx - lay.qr / 2} ${lay.cy - lay.qr / 2}) scale(${lay.qr / qr.size})`">
      <path :d="qr.d" fill="#000" shape-rendering="crispEdges" />
    </g>
    <text
      v-for="t in lay.letters" :key="t.L" :x="t.x" :y="t.y" :transform="`rotate(${-t.angle} ${t.x} ${t.y})`"
      text-anchor="middle" dominant-baseline="central" font-weight="800" font-family="Helvetica, Arial, sans-serif"
      :font-size="lay.letterPt * 0.3528" fill="#787878"
    >{{ t.L }}</text>
    <text x="4" y="7.2" font-size="3.2" font-weight="700" fill="#282828" font-family="Helvetica, Arial, sans-serif">{{ gid ? formatGid(gid) : card }}</text>
    <text v-if="name" x="4" y="96" font-size="2.6" fill="#282828" font-family="Helvetica, Arial, sans-serif">{{ name }}</text>
  </svg>
</template>
