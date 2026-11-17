<script setup>
// Liest Quiz-QR-Codes aller Versionen (nur Inhalt „DMQ…“, auch mehrteilig; Links von beliebigem Host; JSON).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import jsQR from 'jsqr'
import { go } from '../lib/router.js'
import { QrCollector, importQueryFrom, b64u } from '../lib/share.js'

const emit = defineEmits(['close'])
const video = ref(null)
const error = ref('')
const hint = ref('Richte die Kamera auf den Quiz-QR-Code')
const progress = ref(null)
let stream = null, timer = 0, stopped = false
const cv = document.createElement('canvas')
const ctx = cv.getContext('2d', { willReadFrequently: true })
const collector = new QrCollector()

function handle(text) {
  try {
    const r = collector.add(text)
    if (r) {
      if (r.have < r.total) {
        if (progress.value?.have !== r.have) navigator.vibrate?.(20)
        progress.value = r
        hint.value = `Teil ${r.have} von ${r.total} gelesen – jetzt den nächsten Code`
        return
      }
      return finish(`/import?b=${b64u(r.packet)}${r.set?.autostart ? '&start=1' : ''}`)
    }
  } catch (e) { hint.value = e.message; return }
  const q = importQueryFrom(text)
  if (q) return finish('/import?' + new URLSearchParams(q.query))
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) return finish('/import?json=' + encodeURIComponent(t))
  if (/^DM:\d+$/.test(t)) { hint.value = 'Das ist eine Antwortkarte – hier bitte einen Quiz-Code scannen.'; return }
  hint.value = 'Das ist kein Drehmoment-Code.'
}
function finish(path) {
  stop()
  navigator.vibrate?.(40)
  emit('close')
  go(path)
}

function tick() {
  if (stopped) return
  const v = video.value
  if (v && v.readyState >= 2 && v.videoWidth) {
    const s = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight))
    cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s)
    ctx.drawImage(v, 0, 0, cv.width, cv.height)
    const img = ctx.getImageData(0, 0, cv.width, cv.height)
    const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    if (res?.data) { handle(res.data); if (stopped) return }
  }
  timer = setTimeout(tick, 150)
}

onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
    if (stopped) return stop()
    video.value.srcObject = stream
    await video.value.play().catch(() => {})
    tick()
  } catch (e) {
    error.value = !navigator.mediaDevices ? 'Kamerazugriff braucht HTTPS.' : e.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert.' : 'Kamera nicht verfügbar: ' + e.message
  }
})
function stop() { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null }
onBeforeUnmount(stop)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref="video" class="absolute inset-0 size-full object-cover" playsinline muted autoplay />
      <div class="relative flex items-center px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <span class="flex-1 font-bold">QR-Code scannen</span>
        <button class="h-11 rounded-full bg-white px-5 font-bold text-black" @click="emit('close')">Abbrechen</button>
      </div>
      <div class="relative m-auto size-[min(70vw,320px)] rounded-[32px] border-4 border-white/90 shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]" />
      <div v-if="progress" class="relative mx-auto mb-3 flex gap-1.5">
        <span v-for="(p, i) in collector.parts" :key="i" class="h-2.5 w-8 rounded-full" :class="p ? 'bg-white' : 'bg-white/30'" />
      </div>
      <p class="relative mb-[calc(env(safe-area-inset-bottom)+28px)] px-6 text-center font-semibold">{{ error || hint }}</p>
    </div>
  </Teleport>
</template>
