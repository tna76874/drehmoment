import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

// Installations-Angebot merken (Android/Chrome), Anzeige in „Mehr“
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installEvt = e })

// Offline-Fähigkeit: Service Worker nur im Produktions-Build
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
