<script setup>
// Dialog: Klasse wählen und Live-Sitzung starten
import { ref, computed } from 'vue'
import Modal from './Modal.vue'
import { state, startSession, getSet } from '../lib/store.js'
import { go } from '../lib/router.js'

const props = defineProps({ setId: String })
const emit = defineEmits(['close'])
const set = computed(() => getSet(props.setId))
const classId = ref(state.classes[0]?.id || '')
const hideNames = ref(!!state.prefs.hideNames)
const ready = computed(() => set.value?.questions.filter((q) => q.text.trim()).length || 0)

function start() {
  state.prefs.hideNames = hideNames.value
  const s = startSession(props.setId, classId.value || null, { hideNames: hideNames.value })
  emit('close')
  go('/live/' + s.id)
}
</script>
<template>
  <Modal title="Quiz starten" @close="emit('close')">
    <div class="space-y-4">
      <div class="rounded-2xl bg-surface-2 p-4">
        <div class="font-bold">{{ set?.title }}</div>
        <div class="text-sm text-muted">{{ ready }} Fragen</div>
      </div>
      <div>
        <label class="field-label">Klasse</label>
        <div class="space-y-2">
          <label v-for="c in state.classes" :key="c.id" class="check rounded-2xl border border-line px-4 py-2" :class="classId === c.id ? 'border-brand bg-brand-soft' : ''">
            <input v-model="classId" type="radio" :value="c.id" />
            <span class="flex-1 font-semibold">{{ c.name }}</span>
            <span class="text-sm text-muted">{{ c.students.filter((s) => s.name.trim()).length }} Personen</span>
          </label>
          <label class="check rounded-2xl border border-line px-4 py-2" :class="!classId ? 'border-brand bg-brand-soft' : ''">
            <input v-model="classId" type="radio" value="" />
            <span class="flex-1 font-semibold">Ohne Klasse (anonym)</span>
            <span class="text-sm text-muted">jede Karte zählt</span>
          </label>
        </div>
      </div>
      <label v-if="classId" class="check rounded-2xl bg-surface-2 px-4 py-2">
        <input v-model="hideNames" type="checkbox" />
        <span><b class="block">Namen verdecken</b><span class="text-sm text-muted">Während der Stunde nur Kartennummern zeigen – gut für den Beamer. In der Auswertung danach stehen die Namen.</span></span>
      </label>
      <p class="text-xs text-muted">📇 Drehmoment-Karten und <b>Rasterkarten</b> (quadratische Schwarz-Weiß-Karten mit 5×5-Muster, Nr. 1–40) werden automatisch erkannt – einfach austeilen und scannen. Karte <i>n</i> gehört zu Person <i>n</i> der Klassenliste; ohne Klasse kommt jede erkannte Karte dazu.</p>
      <button class="btn btn-hero btn-lg" :disabled="!ready" @click="start">▶ Los geht's</button>
      <p v-if="!ready" class="text-center text-sm text-bad">Das Quiz enthält noch keine Fragen mit Text.</p>
    </div>
  </Modal>
</template>
