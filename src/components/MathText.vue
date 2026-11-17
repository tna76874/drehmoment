<script setup>
// Text mit LaTeX-Formeln ($…$, $$…$$, \(…\), \[…\]) – sicher escaped, Zeilenumbrüche bleiben erhalten.
import { computed } from 'vue'
import { hasMath } from '../lib/math.js'
import { mathHtml, loadKatex, katexReady } from '../lib/katex.js'

// big: größere Formeln (z. B. Antwortmöglichkeiten, damit Brüche auch am Beamer lesbar sind)
const props = defineProps({ text: { type: [String, Number], default: '' }, tag: { type: String, default: 'span' }, big: Boolean })
const math = computed(() => hasMath(props.text))
const html = computed(() => {
  if (!math.value) return null
  if (!katexReady.value) loadKatex()
  void katexReady.value // neu rendern, sobald KaTeX da ist
  return mathHtml(props.text)
})
</script>

<template>
  <component :is="tag" v-if="html !== null" class="math-text" :class="{ 'math-big': big }" v-html="html" />
  <component :is="tag" v-else class="math-text">{{ text }}</component>
</template>

<style>
.math-text { white-space: pre-line; }
.math-text { line-height: 1.5; }
.math-text .katex { font-size: 1.25em; white-space: nowrap; }
.math-text .katex-display > .katex { font-size: 1.35em; }
.math-text.math-big .katex { font-size: 1.6em; }
.math-text.math-big { line-height: 1.7; }
.math-text .katex-display { margin: 0.4em 0; overflow-x: auto; overflow-y: hidden; padding: 0.1em 0; }
</style>
