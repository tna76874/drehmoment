<script setup>
// Zeigt ein Bild einer Frage (Graph, SVG oder Foto) – immer als <img>, damit nichts aus dem Bild ausgeführt wird.
import { computed } from 'vue'
import { mediaUrl } from '../lib/media.js'
const props = defineProps({ media: Object, alt: { type: String, default: 'Abbildung' } })
const src = computed(() => mediaUrl(props.media))
</script>
<template>
  <img v-if="media" :src="src" :alt="alt" class="qmedia block rounded-xl bg-white object-contain" draggable="false" />
</template>
