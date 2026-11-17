<script setup>
// Balkendiagramm der Antwortverteilung
import MathText from './MathText.vue'
import { computed } from 'vue'
import { hasMath } from '../lib/math.js'
import QMedia from './QMedia.vue'
const props = defineProps({ question: Object, counts: Object, answered: Number, reveal: Boolean, big: Boolean })
const rows = computed(() => props.question.options.map((text, i) => {
  const L = 'ABCD'[i], n = props.counts[L] || 0
  return { L, text, img: props.question.optionImages?.[i] || null, n, share: props.answered ? n / props.answered : 0, right: props.reveal && props.question.type !== 'poll' && props.question.correct.includes(i) }
}))
</script>
<template>
  <div class="space-y-2.5">
    <div v-for="r in rows" :key="r.L" class="flex items-center gap-3" :class="reveal && !r.right && question.type !== 'poll' ? 'opacity-55' : ''">
      <span class="letter" :class="['L-' + r.L, big ? 'size-11 text-lg' : '']">{{ r.L }}</span>
      <QMedia v-if="r.img" :media="r.img" :alt="'Antwort ' + r.L" class="shrink-0 border border-line" :class="big ? 'h-[9vh] w-[13vh]' : 'h-12 w-16'" />
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-baseline justify-between gap-2" :class="big ? 'text-xl' : 'text-sm'">
          <span class="min-w-0 font-semibold" :class="[r.right ? 'text-ok' : '', hasMath(r.text) ? 'py-1' : 'truncate']"><MathText big :text="r.text || (r.img ? '' : '–')" /><span v-if="r.right"> ✓</span></span>
          <span class="shrink-0 tabular-nums text-muted">{{ r.n }} · {{ Math.round(r.share * 100) }}%</span>
        </div>
        <div class="overflow-hidden rounded-full bg-surface-2" :class="big ? 'h-4' : 'h-2.5'">
          <div class="h-full rounded-full transition-all duration-500" :class="r.right ? 'bg-ok' : 'bg-L-' + r.L" :style="{ width: r.share * 100 + '%' }" />
        </div>
      </div>
    </div>
  </div>
</template>
