<script setup>
// Bildschirm-Vorschau der Kartenrückseite – gleiche Geometrie wie im PDF.
import { backLayout } from '../lib/pdf.js'
import { formatGid } from '../lib/gid.js'
defineProps({ card: Number, name: String, gid: String })
const lay = backLayout({ x: 0, y: 0, w: 100, h: 100 })
const COL = { A: '#ef4452', B: '#3b6cf0', C: '#f29d0b', D: '#16a75c' }
const tint = (hex) => {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255]
  return `rgb(${c.map((v) => Math.round(255 - (255 - v) * 0.2)).join(',')})`
}
</script>
<template>
  <svg viewBox="0 0 100 100" class="block h-auto w-full rounded-2xl bg-white" role="img" :aria-label="'Rückseite Karte ' + card">
    <polygon v-for="w in lay.wedges" :key="w.L" :points="`${w.pts[0]} ${w.pts[1]} ${lay.cx},${lay.cy}`" :fill="tint(COL[w.L])" />
    <g stroke="#fff" :stroke-width="lay.side * 0.012">
      <line :x1="lay.r.x" :y1="lay.r.y" :x2="lay.r.x + lay.r.w" :y2="lay.r.y + lay.r.h" />
      <line :x1="lay.r.x + lay.r.w" :y1="lay.r.y" :x2="lay.r.x" :y2="lay.r.y + lay.r.h" />
    </g>
    <text
      v-for="w in lay.wedges" :key="'t' + w.L" :x="w.x" :y="w.y" :transform="`rotate(${-w.angle} ${w.x} ${w.y})`"
      text-anchor="middle" dominant-baseline="central" font-weight="800" font-family="Helvetica, Arial, sans-serif"
      :font-size="lay.letterPt * 0.3528" :fill="COL[w.L]"
    >{{ w.L }}</text>
    <circle :cx="lay.cx" :cy="lay.cy" :r="lay.disc" fill="#fff" />
    <text :x="lay.cx" :y="lay.cy - (name ? lay.disc * 0.18 : 0)" text-anchor="middle" dominant-baseline="central" font-weight="800" font-family="Helvetica, Arial, sans-serif" :font-size="lay.disc * (gid ? 0.36 : 0.95)" fill="#17151f">{{ gid ? formatGid(gid) : card }}</text>
    <text v-if="name" :x="lay.cx" :y="lay.cy + lay.disc * 0.55" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" :font-size="lay.side * 0.028" fill="#6c6879">{{ name }}</text>
    <text :x="lay.cx" :y="lay.cy + lay.disc + lay.side * 0.04" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" :font-size="lay.side * 0.021" fill="#6c6879">Deine Antwort steht oben</text>
  </svg>
</template>
