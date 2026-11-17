<script setup>
import MathText from './MathText.vue'
import QMedia from './QMedia.vue'
defineProps({ set: Object })
const TYPES = { mc: 'MC', tf: 'Wahr/Falsch', poll: 'Umfrage' }
</script>
<template>
  <div class="space-y-3">
    <div>
      <div class="text-lg font-bold">{{ set.title }}</div>
      <div class="text-sm text-muted">{{ [set.subject, set.grade, set.questions.length + ' Fragen'].filter(Boolean).join(' · ') }}</div>
      <p v-if="set.description" class="mt-1 text-sm">{{ set.description }}</p>
    </div>
    <details v-if="set.material" class="rounded-2xl bg-surface-2 p-3 text-sm">
      <summary class="cursor-pointer font-semibold">📚 Vorbereitung für zu Hause</summary>
      <MathText tag="p" class="mt-2 block" :text="set.material" />
    </details>
    <ol class="space-y-2">
      <li v-for="(q, i) in set.questions" :key="q.id" class="rounded-2xl border border-line p-3">
        <div class="flex gap-2 text-sm font-semibold"><span class="text-muted">{{ i + 1 }}.</span><MathText class="flex-1" :text="q.text" /><span class="chip">{{ TYPES[q.type] }}</span></div>
        <QMedia v-if="q.image" :media="q.image" class="mt-2 max-h-40 w-full border border-line" />
        <div class="mt-2 grid gap-1">
          <div v-for="(o, k) in q.options" :key="k" class="flex items-center gap-2 text-sm" :class="q.correct.includes(k) ? 'font-bold text-ok' : ''">
            <span class="letter size-6 rounded-lg text-xs" :class="'L-' + 'ABCD'[k]">{{ 'ABCD'[k] }}</span><QMedia v-if="q.optionImages?.[k]" :media="q.optionImages[k]" class="h-14 w-20 border border-line" /><MathText big :text="o" /><span v-if="q.correct.includes(k)">✓</span>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
