<script setup>
// Projektor-Ansicht: folgt der Live-Sitzung (anderer Tab/Fenster auf demselben Gerät).
import MathText from '../components/MathText.vue'
import { computed } from 'vue'
import { getSession, questionStats } from '../lib/store.js'
import { route } from '../lib/router.js'
import ResultBars from '../components/ResultBars.vue'
import QMedia from '../components/QMedia.vue'

const session = computed(() => getSession(route.parts[1]))
const q = computed(() => session.value?.questions[session.value.current])
const st = computed(() => (q.value ? questionStats(session.value, q.value) : null))
const revealed = computed(() => !!(q.value && session.value.revealed[q.value.id]))
const done = computed(() => !!session.value?.endedAt)

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg" @dblclick="fullscreen">
    <div v-if="!session" class="m-auto text-xl text-muted">Sitzung nicht gefunden.</div>
    <template v-else>
      <header class="flex items-center gap-4 px-[4vw] pt-[3vh] text-[clamp(14px,1.6vw,26px)] text-muted">
        <img :src="'icon.svg'" alt="" class="size-[1.6em] rounded-lg" />
        <span class="font-bold text-ink">{{ session.title }}</span>
        <span class="ml-auto tabular-nums">Frage {{ session.current + 1 }} / {{ session.questions.length }}</span>
      </header>

      <div v-if="done" class="m-auto text-center">
        <div class="text-[8vw]">🎉</div>
        <div class="text-[4vw] font-extrabold">Geschafft!</div>
      </div>

      <main v-else class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center px-[4vw] py-[3vh]">
        <div :class="q.image ? 'grid items-center gap-[3vw] lg:grid-cols-[1fr_1fr]' : ''">
          <MathText tag="h1" class="block text-[clamp(28px,4.2vw,80px)] leading-tight font-extrabold" :text="q.text" />
          <QMedia v-if="q.image" :media="q.image" class="max-h-[42vh] w-full shadow-sm" />
        </div>

        <div v-if="!revealed" class="mt-[5vh] grid gap-[2vh]" :class="q.options.length > 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2'">
          <div v-for="(o, i) in q.options" :key="i" class="flex items-center gap-[1.2vw] rounded-[2vw] bg-surface p-[1.4vw] shadow-sm">
            <span class="letter size-[clamp(40px,4.5vw,88px)] shrink-0 rounded-[1vw] text-[clamp(20px,2.4vw,46px)]" :class="'L-' + 'ABCD'[i]">{{ 'ABCD'[i] }}</span>
            <QMedia v-if="q.optionImages?.[i]" :media="q.optionImages[i]" :alt="'Antwort ' + 'ABCD'[i]" class="h-[18vh] min-w-0 flex-1" />
            <MathText v-if="o || !q.optionImages?.[i]" big class="text-[clamp(18px,2.4vw,46px)] font-semibold" :text="o" />
          </div>
        </div>
        <div v-else class="mt-[5vh] text-[clamp(16px,1.2vw,22px)]">
          <ResultBars :question="q" :counts="st.counts" :answered="st.answered" :reveal="true" big />
          <p v-if="q.explanation" class="mt-[4vh] rounded-[1.5vw] bg-brand-soft p-[1.5vw] text-[clamp(18px,1.8vw,34px)]"><MathText :text="q.explanation" /></p>
        </div>
      </main>

      <footer v-if="!done" class="flex items-center gap-4 px-[4vw] pb-[3vh] text-[clamp(14px,1.5vw,26px)]">
        <div class="h-[1vh] flex-1 overflow-hidden rounded-full bg-surface-2">
          <div class="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all duration-500" :style="{ width: (st.total ? (st.answered / st.total) * 100 : 0) + '%' }" />
        </div>
        <span class="font-bold tabular-nums">{{ st.answered }} / {{ st.total }}</span>
      </footer>
      <p class="pb-2 text-center text-xs text-muted/60">Doppelklick: Vollbild</p>
    </template>
  </div>
</template>
