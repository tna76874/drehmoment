<script setup>
// Kamera-Scanner: liest alle Karten im Bild, zeichnet Markierungen und meldet Antworten.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../lib/store.js'
import { toast } from '../lib/ui.js'
import { AnswerTracker } from '../lib/scanlogic.js'
import MathText from './MathText.vue'
import QMedia from './QMedia.vue'

const props = defineProps({
  roster: Array, // [{card, name, gid?, label?}]  label: Anzeige statt Kartennummer (Namen verdeckt)
  responses: Object, // {card: 'A'}
  optionCount: { type: Number, default: 4 },
  question: Object, // {text, options} – in der Übersicht groß angezeigt (die Klasse muss sie lesen können)
  grow: { type: Boolean, default: true }, // unbekannte Kartennummern aufnehmen (Liste wächst automatisch)
})
const emit = defineEmits(['answer', 'close'])

const video = ref(null)
const overlay = ref(null)
const error = ref('')
const starting = ref(true)
const zoomCap = ref(null)
const zoom = ref(1)
const torchCap = ref(false)
const torch = ref(false)
const showMissing = ref(false)
const ms = ref(0)
const flash = ref(0)
const diag = ref([]) // Kamera-Ereignisse (für Fehlersuche, v. a. iPad/iOS)
const needTap = ref(false) // play() wurde abgelehnt -> Tippen zum Starten
function log(msg) { diag.value = [...diag.value.slice(-7), new Date().toLocaleTimeString() + ' ' + msg]; console.info('[Scanner]', msg) }
// Ansicht: 'camera' = Vollbild-Kamera · 'board' = Kacheln aller Karten groß, Kamera klein in der Ecke
// Start immer in der Übersicht: Kamera klein, Frage + Kacheln groß (vermeidet auch den Größenwechsel des Videos)
const view = ref('board')
const showLetters = ref(!!state.prefs.boardLetters)
watch(view, () => { requestAnimationFrame(() => draw(lastCards, lastW, lastH)) })
watch(showLetters, (v) => (state.prefs.boardLetters = v))
const recent = ref({}) // card -> Zeitpunkt der letzten Erfassung (für die Animation)
let lastCards = [], lastW = 1, lastH = 1
function markRecent(card) {
  recent.value = { ...recent.value, [card]: Date.now() }
  setTimeout(() => { const r = { ...recent.value }; delete r[card]; recent.value = r }, 1400)
}

let stream = null, worker = null, raf = 0, busy = false, stopped = false, frameId = 0

// ---- Schutz gegen Bilddrehung (v. a. iPad/iOS) und versehentliche Wechsel: siehe lib/scanlogic.js
// Die Ausrichtung beim START des Scannens gilt. Jede spätere Drehung des Kamerabilds ist ein Fehler und wird
// zurückgerechnet: zuerst aus dem Bildschirmwinkel (sofort), dann geprüft an schon erfassten Karten.
const tracker = new AnswerTracker()
const rotOffset = ref(0) // Korrektur in Buchstaben-Schritten (A->B->C->D), Anzeige am „Oben“-Knopf
const checking = ref(false) // Ausrichtung wird gerade geprüft (nach einer Drehung)
const rotHint = ref(false) // Ausrichtung unklar -> Hinweis
let gen = 0, lastDims = ''
const screenAngle = () => (screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0)) || 0
let lastAngle = screenAngle()
watch(() => props.responses, () => tracker.reset()) // neue Frage
function imageChanged() {
  gen++
  // Bildschirm hat sich gedreht -> Kamerabild dreht mit; erwarteten Buchstaben-Versatz sofort zurückrechnen
  const a = screenAngle(), steps = Math.round((a - lastAngle) / 90)
  lastAngle = a
  tracker.imageChanged(performance.now(), ((-steps % 4) + 4) % 4)
  rotOffset.value = tracker.rotOffset; checking.value = true
}
function rotateManually() { tracker.rotateManually(); rotOffset.value = tracker.rotOffset; rotHint.value = false; checking.value = false }
const grabCanvas = document.createElement('canvas')
const grabCtx = grabCanvas.getContext('2d', { willReadFrequently: true })

const rosterMap = computed(() => new Map(props.roster.map((s) => [s.card, s])))
// Feste Schüler-Karten („DM-XXXXXXX“) zählen wie die Nummernkarte derselben Person
const gidMap = computed(() => new Map(props.roster.filter((s) => s.gid).map((s) => [s.gid, s.card])))
const toKey = (c) => (c.gid ? gidMap.value.get(c.gid) ?? 'DM-' + c.gid : c.card)
const answered = computed(() => props.roster.filter((s) => props.responses[s.card]).length)
const missing = computed(() => props.roster.filter((s) => !props.responses[s.card]))

// iPadOS/iOS beendet die Kamera mitunter kurz nach dem Start (rotes Symbol geht aus, Bild schwarz) –
// z. B. bei Split View/Stage Manager, wenn eine andere App/ein anderer Tab die Kamera nimmt, oder bei
// Speichermangel. Dann neu starten (beim Wiederholen mit kleinerer Auflösung) und sonst Grund anzeigen.
let restarts = [], lowRes = false
async function openCamera() {
  const res = lowRes ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1920 }, height: { ideal: 1080 } }
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...res } })
  if (stopped) return stopStream()
  const track = stream.getVideoTracks()[0]
  const st = track.getSettings?.() || {}
  log(`Kamera an: ${track.label || '?'} ${st.width || '?'}×${st.height || '?'}`)
  track.addEventListener('ended', () => { if (track === stream?.getVideoTracks()[0]) onTrackLost('beendet') })
  track.addEventListener('mute', () => log('Kamera unterbrochen (mute)'))
  track.addEventListener('unmute', () => log('Kamera wieder da (unmute)'))
  const v = video.value
  v.srcObject = stream
  try { await v.play(); needTap.value = false } catch (e) { log('play() abgelehnt: ' + e.name); needTap.value = true }
  return track
}
async function onTrackLost(why) {
  if (stopped) return
  log('Kamera vom System ' + why)
  const now = Date.now()
  restarts = restarts.filter((t) => now - t < 15000)
  if (restarts.length >= 3) {
    error.value = 'Die Kamera wird vom Gerät immer wieder beendet. Split View/Stage Manager schließen, andere Tabs/Apps mit Kamera beenden und erneut versuchen.'
    stopStream()
    return
  }
  restarts.push(now)
  lowRes = true
  stopStream()
  await new Promise((r) => setTimeout(r, 400)) // iOS gibt die Kamera erst verzögert frei
  if (stopped) return
  try { await openCamera(); lastDims = '' } catch (e) { log('Neustart fehlgeschlagen: ' + e.name); error.value = 'Kamera konnte nicht neu gestartet werden: ' + (e.message || e.name) }
}
function retry() { error.value = ''; restarts = []; onTrackLost('(manuell neu gestartet)') }
async function tapToPlay() { try { await video.value.play(); needTap.value = false } catch (e) { log('play() erneut abgelehnt: ' + e.name) } }

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = window.isSecureContext
      ? 'Dieser Browser unterstützt keinen Kamerazugriff.'
      : 'Kamerazugriff braucht HTTPS (oder localhost). Öffne die Seite über https://'
    starting.value = false
    return
  }
  let track
  try {
    track = await openCamera()
  } catch (e) {
    error.value = e.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.' : 'Kamera konnte nicht gestartet werden: ' + e.message
    starting.value = false
    return
  }
  if (!track || stopped) return
  try {
    const caps = track.getCapabilities?.() || {}
    if (caps.zoom) { zoomCap.value = caps.zoom; zoom.value = track.getSettings().zoom || caps.zoom.min }
    torchCap.value = !!caps.torch
    worker = new Worker(new URL('../lib/scan.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = onResult
    worker.onerror = (e) => { log('Worker-Fehler: ' + (e.message || 'unbekannt')); error.value = 'Die Kartenerkennung konnte nicht gestartet werden (Browser zu alt?). ' + (e.message || '') }
  } catch (e) {
    log('Start-Fehler: ' + e.message)
    error.value = 'Die Kartenerkennung konnte nicht gestartet werden (Browser zu alt?): ' + e.message
  }
  starting.value = false
  loop()
}

function loop() {
  if (stopped) return
  const v = video.value
  if (!busy && worker && stream && v && v.readyState >= 2 && v.videoWidth) grab(v)
  raf = requestAnimationFrame(loop)
}

function grab(v) {
  const dims = v.videoWidth + 'x' + v.videoHeight
  if (dims !== lastDims) {
    // Nur ein Wechsel Hoch-/Querformat ist eine Drehung. Reine Größenänderungen (iOS liefert z. B. eine kleinere
    // Auflösung, sobald das Video in der Übersicht klein in der Ecke steckt) dürfen die Dreh-Prüfung NICHT auslösen.
    if (lastDims) {
      const [pw, ph] = lastDims.split('x').map(Number)
      log(`Bildformat ${lastDims} → ${dims}`)
      if ((pw > ph) !== (v.videoWidth > v.videoHeight)) imageChanged()
    }
    lastDims = dims
  }
  const s = Math.min(1, state.prefs.resolution / Math.max(v.videoWidth, v.videoHeight))
  const w = Math.round(v.videoWidth * s), h = Math.round(v.videoHeight * s)
  if (grabCanvas.width !== w) grabCanvas.width = w
  if (grabCanvas.height !== h) grabCanvas.height = h
  grabCtx.drawImage(v, 0, 0, w, h)
  const img = grabCtx.getImageData(0, 0, w, h)
  busy = true
  worker.postMessage({ id: ++frameId, gen, buffer: img.data.buffer, width: w, height: h, gridCards: state.prefs.gridCards !== false }, [img.data.buffer])
}

function onResult(e) {
  busy = false
  const { width, height } = e.data
  ms.value = e.data.ms
  if (e.data.gen !== gen) return draw([], width, height) // Bild wurde gerade gedreht
  const raw = e.data.cards.map((c) => ({ ...c, card: toKey(c) }))
  const r = tracker.process(raw, performance.now(), { responses: props.responses, known: (c) => rosterMap.value.has(c), grow: props.grow, optionCount: props.optionCount })
  rotOffset.value = tracker.rotOffset; rotHint.value = tracker.hint; checking.value = r.status !== 'ok'
  if (r.corrected) toast('Kamerabild hatte sich gedreht – Ausrichtung vom Start wiederhergestellt')
  for (const [card, letter] of r.emit) {
    const first = !props.responses[card]
    emit('answer', card, letter)
    markRecent(card)
    if (first) { flash.value++; if (state.prefs.vibrate) navigator.vibrate?.(25) }
  }
  draw(r.status === 'paused' ? [] : r.cards, width, height)
}

const COLORS = { A: '#ef4452', B: '#3b6cf0', C: '#f29d0b', D: '#16a75c' }
function draw(cards, aw, ah) {
  lastCards = cards; lastW = aw; lastH = ah
  const cv = overlay.value, v = video.value
  if (!cv || !v) return
  const dpr = window.devicePixelRatio || 1
  const cw = cv.clientWidth, ch = cv.clientHeight
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr) }
  const small = cw < 300
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  // object-fit: cover -> Abbildung Analyse-Koordinaten -> Bildschirm
  const vw = v.videoWidth, vh = v.videoHeight
  const sc = Math.max(cw / vw, ch / vh), ox = (cw - vw * sc) / 2, oy = (ch - vh * sc) / 2
  const k = vw / aw
  const P = (p) => [ox + p.x * k * sc, oy + p.y * (vh / ah) * sc]
  for (const c of cards) {
    const known = rosterMap.value.has(c.card) || (props.grow && typeof c.card === 'number')
    const valid = known && c.answer && 'ABCD'.indexOf(c.answer) < props.optionCount
    const col = valid ? COLORS[c.answer] : 'rgba(255,255,255,0.8)'
    const pts = c.quad.map(P)
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
    ctx.fillStyle = valid ? col + '55' : 'rgba(255,255,255,0.15)'; ctx.fill()
    ctx.lineWidth = small ? 2 : 3; ctx.strokeStyle = col; ctx.stroke()
    if (small) continue // im kleinen Kamerabild nur Rahmen, keine Namen
    const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4
    const r = rosterMap.value.get(c.card)
    const who = r ? (r.label ? '' : r.name || '#' + c.card) : known ? '#' + c.card : (c.gid ? c.card : '#' + c.card) + ' ?' // verdeckt: keine Kartennummer
    const label = valid ? (who ? `${c.answer} · ${who}` : c.answer) : who
    if (!label) continue
    ctx.font = '700 14px system-ui, sans-serif'
    const tw = ctx.measureText(label).width + 16
    ctx.fillStyle = valid ? col : 'rgba(20,20,30,0.75)'
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(cx - tw / 2, cy - 13, tw, 26, 13); else ctx.rect(cx - tw / 2, cy - 13, tw, 26) // roundRect erst ab iOS 16
    ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, cy + 1)
  }
}

async function setZoom(z) {
  zoom.value = +z
  try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: +z }] }) } catch {}
}
async function toggleTorch() {
  torch.value = !torch.value
  try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: torch.value }] }) } catch { torch.value = false }
}

function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null }
const onOrient = () => imageChanged()
onMounted(() => {
  start()
  // Wo möglich (Android, installierte App) Bildschirmdrehung während des Scannens sperren
  try { screen.orientation?.lock?.(screen.orientation.type)?.catch?.(() => {}) } catch {}
  window.addEventListener('orientationchange', onOrient)
  screen.orientation?.addEventListener?.('change', onOrient)
})
onBeforeUnmount(() => {
  window.removeEventListener('orientationchange', onOrient)
  screen.orientation?.removeEventListener?.('change', onOrient)
  try { screen.orientation?.unlock?.() } catch {}
  stopped = true
  cancelAnimationFrame(raf)
  worker?.terminate()
  stopStream()
})
</script>

<template>
  <div class="fixed inset-0 z-40 flex flex-col text-white" :class="view === 'board' ? 'bg-[#100e1a]' : 'bg-black'">
    <div
      :class="view === 'board'
        ? 'absolute right-3 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-20 h-48 w-36 cursor-pointer overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/40 sm:h-56 sm:w-44'
        : 'absolute inset-0'"
      @click="view === 'board' && (view = 'camera')"
    >
      <video ref="video" class="absolute inset-0 size-full object-cover" playsinline muted autoplay />
      <canvas ref="overlay" class="pointer-events-none absolute inset-0 size-full" />
      <span v-if="view === 'board'" class="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">Tippen = groß</span>
    </div>

    <!-- Kopf -->
    <div class="relative flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-8">
      <div class="flex-1">
        <div class="text-xs font-semibold uppercase tracking-wider text-white/70">Erfasst</div>
        <div class="text-3xl font-extrabold tabular-nums">
          <Transition name="pop" mode="out-in"><span :key="answered">{{ answered }}</span></Transition>
          <span v-if="roster.length" class="text-white/50"> / {{ roster.length }}</span>
        </div>
      </div>
      <button class="h-12 rounded-full bg-white/15 px-3 text-sm font-bold backdrop-blur" :aria-label="view === 'board' ? 'Kamera groß' : 'Übersicht'" @click="view = view === 'board' ? 'camera' : 'board'">
        {{ view === 'board' ? '📷 Kamera' : '▦ Übersicht' }}
      </button>
      <button class="flex h-12 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-bold backdrop-blur" :class="rotOffset ? 'bg-amber-300! text-black' : ''" aria-label="Bezugsrichtung oben drehen" title="Falls alle Antworten um eine Stelle verschoben sind: Bezug „oben“ drehen" @click="rotateManually">
        <span class="inline-block transition-transform" :style="{ transform: `rotate(${rotOffset * 90}deg)` }">↑</span>Oben
      </button>
      <button v-if="torchCap" class="grid size-12 place-items-center rounded-full bg-white/15 backdrop-blur" :class="torch ? 'bg-yellow-300! text-black' : ''" aria-label="Licht" @click="toggleTorch">⚡</button>
      <button class="h-12 rounded-full bg-white px-6 font-bold text-black shadow-lg" @click="emit('close')">Fertig</button>
    </div>

    <!-- Fortschritt -->
    <div class="relative mx-4 h-1.5 overflow-hidden rounded-full bg-white/20">
      <div class="h-full rounded-full bg-gradient-to-r from-[#8f7aff] to-[#ff7aa2] transition-all duration-300" :style="{ width: (roster.length ? (answered / roster.length) * 100 : 0) + '%' }" />
    </div>

    <div v-if="checking || rotHint" class="relative mx-4 mt-2 rounded-2xl px-3 py-2 text-center text-sm font-semibold" :class="rotHint ? 'bg-amber-300 text-black' : 'bg-white/15'">
      <template v-if="checking && !rotHint">↻ Kamerabild hat sich gedreht – Ausrichtung wird geprüft …</template>
      <template v-else>Kamerabild hat sich gedreht. Stimmen die Buchstaben? Sonst „↑ Oben“ antippen, bis A oben ist.</template>
    </div>
    <!-- Übersicht: alle Karten als Kacheln, leuchten live auf -->
    <div v-if="view === 'board'" class="relative mt-3 flex-1 overflow-auto px-3 pb-56 sm:pr-52 sm:pb-6">
      <!-- Frage + Antwortmöglichkeiten bleiben sichtbar -->
      <div v-if="question" class="mb-4 rounded-3xl bg-white/8 p-4 sm:p-5">
        <MathText tag="h2" class="block text-[clamp(20px,3vw,40px)] leading-tight font-extrabold" :text="question.text" />
        <QMedia v-if="question.image" :media="question.image" class="mx-auto mt-3 max-h-[35vh] w-full" />
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div v-for="(o, i) in question.options" :key="i" class="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2">
            <span class="letter size-[clamp(32px,3.2vw,52px)] shrink-0 rounded-xl text-[clamp(16px,1.8vw,28px)]" :class="'L-' + 'ABCD'[i]">{{ 'ABCD'[i] }}</span>
            <QMedia v-if="question.optionImages?.[i]" :media="question.optionImages[i]" :alt="'Antwort ' + 'ABCD'[i]" class="h-[14vh] min-w-0 flex-1" />
            <MathText v-if="o || !question.optionImages?.[i]" big class="text-[clamp(16px,2vw,30px)] font-semibold" :text="o" />
          </div>
        </div>
      </div>
      <div class="mb-1.5 flex items-center justify-between px-1 text-xs text-white/60">
        <span>{{ answered }} erfasst · {{ missing.length }} offen</span>
        <label class="flex items-center gap-1.5"><input v-model="showLetters" type="checkbox" class="size-4 accent-white" />Antworten zeigen</label>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1.5">
        <div
          v-for="s in roster" :key="s.card"
          class="tile relative flex min-h-11 flex-col justify-center rounded-xl px-1 py-1 text-center transition-all duration-300"
          :class="[responses[s.card] ? (showLetters ? 'text-white' : 'bg-[#16a75c] text-white') : 'bg-white/8 text-white/55', recent[s.card] ? 'pop-tile' : '']"
          :style="responses[s.card] && showLetters ? { background: COLORS[responses[s.card]] } : null"
        >
          <span v-if="responses[s.card]" class="absolute top-0.5 right-1 text-[10px] font-extrabold">{{ showLetters ? responses[s.card] : '✓' }}</span>
          <span class="text-sm leading-none font-extrabold tabular-nums">{{ s.label || s.card }}</span>
          <span v-if="s.name" class="mt-0.5 truncate text-[9px] leading-tight font-semibold">{{ s.name }}</span>
        </div>
      </div>
    </div>

    <div v-if="starting" class="relative m-auto text-center text-white/80">Kamera wird gestartet …</div>
    <div v-if="error" class="relative m-auto max-w-sm rounded-3xl bg-white/10 p-6 text-center backdrop-blur">
      <div class="mb-2 text-4xl">📷</div>
      <p class="mb-4">{{ error }}</p>
      <div class="flex justify-center gap-2">
        <button class="h-11 rounded-full bg-white/20 px-5 font-bold" @click="retry">Neu starten</button>
        <button class="h-11 rounded-full bg-white px-5 font-bold text-black" @click="emit('close')">Zurück</button>
      </div>
      <pre v-if="diag.length" class="mt-4 text-left text-[10px] leading-snug whitespace-pre-wrap text-white/60">{{ diag.join('\n') }}</pre>
    </div>
    <button v-if="needTap && !error" class="relative m-auto h-14 rounded-full bg-white px-6 text-base font-bold text-black" @click="tapToPlay">📷 Tippen, um die Kamera zu zeigen</button>

    <!-- Fuß -->
    <div class="relative mt-auto bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div v-if="zoomCap" class="mb-3 flex items-center gap-3 text-sm">
        <span>🔍</span>
        <input type="range" :min="zoomCap.min" :max="Math.min(zoomCap.max, 8)" :step="zoomCap.step || 0.1" :value="zoom" class="flex-1" @input="setZoom($event.target.value)" />
        <span class="w-10 text-right tabular-nums">{{ zoom.toFixed(1) }}×</span>
      </div>
      <button v-if="view !== 'board'" class="mb-2 flex w-full items-center justify-between text-left text-sm font-semibold" @click="showMissing = !showMissing">
        <span>{{ !roster.length ? 'Jede erkannte Karte kommt automatisch dazu' : missing.length ? `Noch offen: ${missing.length}` : 'Alle erfasst 🎉' }}</span>
        <span v-if="missing.length" class="text-white/60">{{ showMissing ? 'ausblenden' : 'anzeigen' }}</span>
      </button>
      <div v-if="view !== 'board' && showMissing && missing.length" class="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
        <span v-for="s in missing" :key="s.card" class="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur">
          {{ s.label || s.card }}<template v-if="s.name"> · {{ s.name }}</template>
        </span>
      </div>
      <p v-if="diag.length > 1 && !error" class="text-center text-[10px] text-amber-200/80">{{ diag[diag.length - 1] }}</p>
      <p class="mt-2 text-center text-xs text-white/55">Halte das Handy ruhig und schwenke langsam über die Klasse · {{ ms }} ms</p>
    </div>
  </div>
</template>

<style scoped>
.pop-enter-active { transition: all 0.25s cubic-bezier(0.3, 1.6, 0.6, 1); }
.pop-enter-from { transform: scale(1.5); opacity: 0; }
.pop-tile { animation: tile-pop 1.2s ease-out; }
@keyframes tile-pop {
  0% { transform: scale(0.85); box-shadow: 0 0 0 0 rgb(255 255 255 / 0.9); }
  25% { transform: scale(1.12); box-shadow: 0 0 0 6px rgb(255 255 255 / 0.5); }
  100% { transform: scale(1); box-shadow: 0 0 0 14px rgb(255 255 255 / 0); }
}
</style>
