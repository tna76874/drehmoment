<script setup>
import { computed } from 'vue'
import { route } from './lib/router.js'
import { toasts } from './lib/ui.js'
import { saveError } from './lib/store.js'
import Icon from './components/Icon.vue'
import SetsView from './views/SetsView.vue'
import SetEditView from './views/SetEditView.vue'
import ClassesView from './views/ClassesView.vue'
import ClassEditView from './views/ClassEditView.vue'
import CardsView from './views/CardsView.vue'
import AiView from './views/AiView.vue'
import DataView from './views/DataView.vue'
import LiveView from './views/LiveView.vue'
import SessionView from './views/SessionView.vue'
import BeamerView from './views/BeamerView.vue'
import HelpView from './views/HelpView.vue'
import ImportView from './views/ImportView.vue'
import PrintView from './views/PrintView.vue'

const views = {
  '': SetsView, set: SetEditView, classes: ClassesView, class: ClassEditView,
  cards: CardsView, ai: AiView, data: DataView, live: LiveView, session: SessionView,
  beamer: BeamerView, help: HelpView, import: ImportView, print: PrintView,
}
const current = computed(() => views[route.parts[0] || ''] || SetsView)
const fullscreen = computed(() => ['live', 'beamer'].includes(route.parts[0]))
const tabs = [
  { to: '/', key: ['', 'set', 'session', 'import'], label: 'Quiz', icon: 'quiz' },
  { to: '/classes', key: ['classes', 'class'], label: 'Klassen', icon: 'users' },
  { to: '/cards', key: ['cards'], label: 'Karten', icon: 'card' },
  { to: '/ai', key: ['ai'], label: 'KI', icon: 'spark' },
  { to: '/data', key: ['data', 'help'], label: 'Mehr', icon: 'box' },
]
</script>

<template>
  <div v-if="saveError.message" class="notice notice-bad rounded-none">{{ saveError.message }}</div>
  <component :is="current" :key="route.path" />
  <nav
    v-if="!fullscreen"
    class="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
  >
    <div class="mx-auto grid h-[var(--nav-h)] max-w-3xl grid-cols-5">
      <a
        v-for="t in tabs"
        :key="t.to"
        :href="'#' + t.to"
        class="group flex flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold no-underline transition"
        :class="t.key.includes(route.parts[0] || '') ? 'text-brand' : 'text-muted'"
      >
        <span
          class="grid h-8 w-14 place-items-center rounded-full transition"
          :class="t.key.includes(route.parts[0] || '') ? 'bg-brand-soft' : 'group-hover:bg-surface-2'"
        >
          <Icon :name="t.icon" class="size-[22px]" />
        </span>
        {{ t.label }}
      </a>
    </div>
  </nav>
  <div
    class="pointer-events-none fixed inset-x-0 z-[100] grid justify-items-center gap-2 px-4"
    :class="fullscreen ? 'bottom-[calc(env(safe-area-inset-bottom)+96px)]' : 'bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)]'"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="max-w-lg rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-xl"
        :class="t.kind === 'bad' ? 'bg-bad text-white' : t.kind === 'ok' ? 'bg-ok text-white' : 'bg-ink text-bg'"
      >
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style>
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px) scale(0.96); }
</style>
