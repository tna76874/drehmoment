<script setup>
import { computed } from 'vue'
import { route } from '../lib/router.js'
import { copyText, toast, shareFile } from '../lib/ui.js'
import { classLink, b64u } from '../lib/share.js'
import Icon from '../components/Icon.vue'
import AnswerCard from '../components/AnswerCard.vue'

const agent = computed(() => route.query.t === 'agent')
const version = __APP_VERSION__.split('+')[0]
const author = __APP_AUTHOR__ || 'die Autorinnen und Autoren von Drehmoment'
const source = __APP_SOURCE__
const base = location.href.split('#')[0].replace(/index\.html$/, '')
const links = [
  { label: 'Spezifikation für KI-Agenten (llms.txt)', url: base + 'llms.txt' },
  { label: 'JSON-Schema', url: base + 'drehmoment.schema.json' },
  { label: 'Beispiel-Quiz (JSON)', url: base + 'example.json' },
  { label: 'Werkzeugkasten: PDFs lokal erzeugen (drehmoment-kit.mjs)', url: base + 'kit/drehmoment-kit.mjs' },
  { label: 'Beispiel: fertiges Druckblatt', url: base + '#/print?url=' + encodeURIComponent(base + 'example.json') },
]
const importExample = base + '#/import?url=' + encodeURIComponent(base + 'example.json')
const printExample = base + '#/print?url=' + encodeURIComponent(base + 'example.json')
const classExample = classLink([{ name: '7b (Beispiel)', students: ['Anna M.', 'Ben K.', 'Çem Ö.', 'Lea S.'].map((name) => ({ name })) }], { base })
const classJson = '{ "classes": [ { "name": "7b", "students": ["Anna M.", "Ben K.", "Lea S."] } ] }'
const classJsonLink = base + '#/import?d=' + b64u(new TextEncoder().encode(classJson))
async function copy(t) { if (await copyText(t)) toast('Kopiert', 'ok') }
async function poster() {
  const { posterPdf } = await import('../lib/pdf.js')
  await shareFile(posterPdf(base).output('blob'), 'drehmoment-poster.pdf', 'Drehmoment – Poster')
}
</script>

<template>
  <div class="topbar">
    <a href="#/data" class="btn btn-ghost btn-icon" aria-label="Zurück"><Icon name="back" /></a>
    <div class="seg">
      <a href="#/help" class="grid min-h-9 place-items-center rounded-xl px-3 text-sm font-semibold no-underline" :class="!agent ? 'bg-surface text-ink shadow-sm' : 'text-muted'">Anleitung</a>
      <a href="#/help?t=agent" class="grid min-h-9 place-items-center rounded-xl px-3 text-sm font-semibold no-underline" :class="agent ? 'bg-surface text-ink shadow-sm' : 'text-muted'">Für Agenten</a>
    </div>
  </div>

  <main v-if="!agent" class="page space-y-4">
    <button class="panel flex w-full items-center gap-3 bg-gradient-to-br from-brand to-brand-2 text-left text-white" @click="poster">
      <span class="grid size-12 place-items-center rounded-2xl bg-white/20 text-2xl">🖼️</span>
      <span class="flex-1"><b class="block text-base">Poster herunterladen</b><span class="text-sm text-white/85">A4-Übersicht für Kollegium & Lehrerzimmer – mit QR-Code zur App</span></span>
      <Icon name="download" />
    </button>
    <section class="panel">
      <h1 class="text-xl">So funktioniert Drehmoment</h1>
      <ol class="mt-4 space-y-4">
        <li class="flex gap-3"><span class="letter L-A">1</span><div><b>Karten drucken.</b> Jede Person bekommt eine Karte mit fester Nummer. Die Karten sind immer gleich – einmal drucken, laminieren, jahrelang benutzen.</div></li>
        <li class="flex gap-3"><span class="letter L-B">2</span><div><b>Klasse anlegen</b> (optional). Ordne Namen den Kartennummern zu. Ohne Klasse läuft alles anonym.</div></li>
        <li class="flex gap-3"><span class="letter L-C">3</span><div><b>Quiz erstellen</b> – selbst oder mit dem KI-Modus. Bis zu 4 Antworten (A–D).</div></li>
        <li class="flex gap-3"><span class="letter L-D">4</span><div><b>Abstimmen.</b> Alle drehen ihre Karte so, dass ihre Antwort <b>oben</b> steht, und halten sie hoch. Du tippst auf „Scannen“ und schwenkst das Handy über die Klasse.</div></li>
      </ol>
    </section>

    <section class="panel flex items-center gap-4">
      <div class="w-24 shrink-0"><AnswerCard :card="12" /></div>
      <p class="text-sm text-muted">Hier antwortet Karte 12 mit <b class="text-ink">A</b>. Dreht man die Karte um 90° nach links, steht <b class="text-ink">B</b> oben, usw. Die Buchstaben sind klein und grau – Mitschüler:innen können die Antwort kaum ablesen.</p>
    </section>

    <section class="panel">
      <h2 class="mb-2">Tipps für zuverlässiges Scannen</h2>
      <ul class="list-disc space-y-1.5 pl-5 text-sm">
        <li>Karten ruhig und gerade hochhalten, Finger nicht auf den Code.</li>
        <li>Langsam schwenken – erkannte Karten werden farbig markiert.</li>
        <li>In großen Räumen: Karten „groß“ drucken (1 pro Seite) oder Zoom nutzen.</li>
        <li>Gegenlicht vermeiden; matte Laminierfolie spiegelt weniger.</li>
        <li>Antwort geändert? Einfach erneut scannen – die neue Antwort zählt. Direkt nach dem Erfassen ist eine Karte 2 Sekunden gesperrt (Karte herunternehmen ändert nichts).</li>
        <li>Die Ausrichtung beim Start des Scannens gilt. Dreht sich das Kamerabild (z. B. iPad), rechnet Drehmoment das anhand der schon erfassten Karten zurück.</li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="mb-2">Rasterkarten</h2>
      <p class="text-sm">Schon vorhandene <b>Rasterkarten</b> – die verbreiteten quadratischen Schwarz-Weiß-Abstimmkarten mit 5×5-Muster und den Buchstaben A–D am Rand (Standardsatz Nr. 1–40) – funktionieren ohne Einrichtung: einfach austeilen und scannen. Karte <i>n</i> gehört zu Person <i>n</i> der Klassenliste; ohne Klasse kommt jede erkannte Karte automatisch dazu. Abschalten unter „Mehr → Einstellungen“.</p>
    </section>

    <section class="panel">
      <h2 class="mb-2">Bilder & Graphen</h2>
      <ul class="list-disc space-y-1.5 pl-5 text-sm">
        <li><b>Graph</b>: Funktionsgraphen, Flächen, Dreiecke, Säulendiagramme als kleine Beschreibung – per Vorlage oder KI-Prompt. Winzig im QR-Code.</li>
        <li><b>Skizze (SVG)</b>: im Zeicheneditor selbst zeichnen (Stift, Linie, Pfeil, Rechteck, Ellipse, Text, Kästchenraster) oder von einer KI zeichnen lassen („KI-Prompt“). Vorhandene Bilder lassen sich im Zeicheneditor beschriften.</li>
        <li><b>Foto</b>: wird beim Einfügen verkleinert, für QR-Codes bei Bedarf weiter. Zeichnungen, Tafelbilder und Diagramme lieber <b>vektorisieren</b> – schwarz-weiß oder mit 3–6 Farben, meist kleiner und schärfer.</li>
        <li>Bilder gehen zur Frage oder als Antworten A–D (🖼 neben der Antwort).</li>
        <li>Zwei A4-Blätter fassen ≈ 15 kB Fotodaten (etwa 1 Foto in 420 px oder 6 kleine). Passt es nicht, schlägt Drehmoment mehr Seiten oder „ohne Fotos“ vor.</li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="mb-2">Beamer</h2>
      <p class="text-sm text-muted">Die Beamer-Ansicht (<Icon name="screen" class="inline size-4" />) öffnet ein zweites Fenster, das der Sitzung automatisch folgt – <b class="text-ink">auf demselben Gerät</b>. Zwei Geräte (z. B. Laptop und Handy) tauschen sich nicht live aus, denn Drehmoment hat bewusst keinen Server.</p>
      <p class="mt-2 text-sm font-semibold">So klappt es mit Beamer:</p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
        <li><b class="text-ink">Handy spiegeln (empfohlen):</b> Sitzung auf dem Handy starten und den Bildschirm per AirPlay, Chromecast/Miracast oder Kabel auf den Beamer bringen. In der Scan-Ansicht zeigt „▦ Übersicht“ groß, wer schon erfasst ist.</li>
        <li><b class="text-ink">Nur Laptop:</b> Mit einer USB- oder Dokumentenkamera kann auch der Laptop selbst scannen; die Beamer-Ansicht läuft im zweiten Fenster.</li>
        <li><b class="text-ink">Ergebnisse später zusammenführen:</b> Nach der Stunde auf dem Handy „Auswertung → JSON“ exportieren und am Laptop unter „Mehr → Importieren“ einlesen.</li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="mb-2">Offline & Datenschutz</h2>
      <p class="text-sm text-muted">Alle Daten bleiben auf diesem Gerät (Browser-Speicher). Es gibt keinen Server und kein Konto. Nach dem ersten Laden funktioniert die App auch ohne Internet. Sichere deine Daten regelmäßig über „Mehr → Exportieren“.</p>
    </section>

    <!-- Rechtliche Hinweise nach GPLv3 §0 / §5 („Appropriate Legal Notices“) -->
    <section id="lizenz" class="panel text-sm">
      <h2 class="mb-2">Über Drehmoment & Lizenz</h2>
      <p>Drehmoment {{ version }} · © {{ new Date().getFullYear() }} {{ author }}</p>
      <p class="mt-2 text-muted">Drehmoment ist freie Software: Du darfst sie unter den Bedingungen der <b>GNU General Public License</b>, Version 3 oder (nach deiner Wahl) jeder späteren Version, nutzen, weitergeben und verändern (SPDX: GPL-3.0-or-later). Sie wird <b>ohne jede Gewährleistung</b> bereitgestellt – auch ohne die Gewähr der Marktreife oder Eignung für einen bestimmten Zweck. Einzelheiten stehen im Lizenztext.</p>
      <p v-if="source" class="mt-2 text-muted">Quellcode: <a :href="source" target="_blank" rel="noopener" class="break-all">{{ source }}</a></p>
      <div class="mt-3 flex flex-wrap gap-2">
        <a class="btn btn-sm" href="LICENSE.txt" target="_blank">Lizenztext (GNU GPL v3)</a>
        <a class="btn btn-sm" href="third-party-licenses.txt" target="_blank">Lizenzen verwendeter Bibliotheken</a>
      </div>
      <p class="mt-2 text-xs text-muted">Genannte Produkt- und Kartenbezeichnungen dienen nur der Beschreibung der Kompatibilität; es besteht keine Verbindung zu deren Herstellern.</p>
    </section>
  </main>

  <main v-else class="page space-y-4">
    <section class="panel">
      <h1 class="text-xl">Für KI-Agenten & externe Tools</h1>
      <p class="mt-2 text-sm text-muted">Drehmoment beschreibt sein Datenformat maschinenlesbar. Gib einem KI-Agenten einfach die Adresse der Spezifikation – er kann dann Quizze erzeugen, die hier direkt aufgehen.</p>
      <div class="mt-4 space-y-2">
        <div v-for="l in links" :key="l.url" class="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-3">
          <a :href="l.url" target="_blank" class="min-w-0 flex-1 text-sm font-semibold">{{ l.label }}<span class="block truncate text-xs font-normal text-muted">{{ l.url }}</span></a>
          <button class="btn btn-ghost btn-icon" aria-label="Kopieren" @click="copy(l.url)"><Icon name="copy" /></button>
        </div>
      </div>
    </section>

    <section class="panel space-y-3 text-sm">
      <h2>Fertiges Druckblatt (empfohlen)</h2>
      <p class="text-muted">Der Agent baut nur einen Link. Die Lehrkraft öffnet ihn, druckt das A4-Blatt mit Titel, Inhaltsübersicht und QR-Code(s) – und startet das Quiz im Unterricht per „QR scannen“.</p>
      <div class="rounded-xl bg-surface-2 p-3 font-mono text-xs break-all">{{ base }}#/print?d=<b>&lt;base64url(Quiz-JSON)&gt;</b></div>
      <p class="text-muted">Optionen: <code>&amp;mode=link</code> (Code mit Web-Adresse), <code>&amp;size=300|500|2000</code> (Größe je Code), <code>&amp;start=0</code> (nicht direkt starten).</p>
      <a :href="printExample" class="btn w-full"><Icon name="download" />Beispiel-Druckblatt öffnen</a>
    </section>

    <section class="panel space-y-3 text-sm">
      <h2>Klassen per Link anlegen</h2>
      <p class="text-muted">Ein Link kann Klassenlisten mitbringen. Beim Öffnen zeigt Drehmoment eine Vorschau; „Klassen übernehmen“ legt sie an. Gibt es die Klasse schon, werden nur neue Namen ergänzt – ausgeteilte Karten behalten ihre Nummer.</p>
      <p class="font-semibold">Einfach (JSON):</p>
      <pre class="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{{ classJson }}</pre>
      <div class="rounded-xl bg-surface-2 p-3 font-mono text-xs break-all">{{ base }}#/import?d=<b>&lt;base64url(JSON)&gt;</b></div>
      <p class="text-muted">Die Namen bekommen der Reihe nach die Karten 1, 2, 3 … Eigene Nummern: <code>"students": [{"name": "Anna M.", "card": 7}]</code>. Auch erlaubt: <code>{"vorname": "Anna", "nachname": "Müller"}</code>.</p>
      <p class="font-semibold">Feste Schüler-Karten (z. B. aus der Schulverwaltung):</p>
      <p class="text-muted"><code>{"name": "Anna M.", "gid": "17DWY6F"}</code> – 7 Zeichen (Crockford-Base32). Die Karte trägt dann den Code <code>DM-17DWY6F</code> und ist bei <b>allen</b> Lehrkräften dieselbe – egal wer sie wann (oder nur für einen Teil der Klasse) druckt. Gleiche ID wird beim erneuten Import nie doppelt angelegt; die Nummernkarte der Person gilt zusätzlich weiter. Empfohlene Ableitung aus einer stabilen Kennung: die ersten 35 Bit von <code>SHA-256("drehmoment|" + kennung)</code> als Crockford-Base32.</p>
      <p class="font-semibold">Kompakt (ca. ⅓ so lang, auch als QR-Code):</p>
      <div class="rounded-xl bg-surface-2 p-3 font-mono text-xs break-all">{{ base }}#/import?b=<b>&lt;base64url(0x01 + deflate-raw(JSON, Wörterbuch))&gt;</b></div>
      <pre class="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{ "v": 1, "k": [ ["7b", ["Anna M.", "Ben K."]],
                ["8a", ["Lea K.", "Tom A."], [4, 9]],
                ["9c", ["Mia B.", "Jan O."], [1, 2], ["17DWY6F", 0]] ] }</pre>
      <p class="text-muted">Am einfachsten mit dem Werkzeugkasten: <code>node drehmoment-kit.mjs classlink klasse.csv --base {{ base }}</code> (CSV mit Klasse;Nachname;Vorname).</p>
      <p class="notice text-xs">Datenschutz: Namen stehen im Link. Empfohlen ist „Vorname + Anfangsbuchstabe“ (z. B. „Anna M.“) – so macht es auch der CSV-Import standardmäßig.</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <a :href="classExample" class="btn"><Icon name="link" />Kompakt ausprobieren</a>
        <a :href="classJsonLink" class="btn"><Icon name="link" />JSON ausprobieren</a>
      </div>
    </section>

    <section class="panel space-y-3 text-sm">
      <h2>Werkzeugkasten: alles lokal erzeugen</h2>
      <p class="text-muted">Eine einzige Datei, läuft mit Node ≥ 18 ohne Installation. Erzeugt dieselben PDFs und Codes wie die App – auch ohne Browser.</p>
      <pre class="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">curl -O {{ base }}kit/drehmoment-kit.mjs
node drehmoment-kit.mjs quiz quiz.json         # A4-Blatt mit Quiz-QR
node drehmoment-kit.mjs cards 1-30             # Antwortkarten
node drehmoment-kit.mjs cards klasse.csv       # Karten mit Namen
node drehmoment-kit.mjs link quiz.json --base {{ base }}
node drehmoment-kit.mjs classlink klasse.csv --base {{ base }}</pre>
    </section>

    <section class="panel space-y-3 text-sm">
      <h2>Quiz per Link öffnen</h2>
      <p class="text-muted">Agenten können ein Quiz als Link übergeben. Beim Öffnen erscheint eine Vorschau, dann „Speichern & starten“.</p>
      <div class="space-y-2 font-mono text-xs">
        <div class="rounded-xl bg-surface-2 p-3 break-all">{{ base }}#/import?url=<b>&lt;URL zu JSON&gt;</b></div>
        <div class="rounded-xl bg-surface-2 p-3 break-all">{{ base }}#/import?d=<b>&lt;base64url(JSON)&gt;</b></div>
        <div class="rounded-xl bg-surface-2 p-3 break-all">{{ base }}#/import?json=<b>&lt;encodeURIComponent(JSON)&gt;</b></div>
      </div>
      <p class="text-muted">Bei <code>?url=</code> muss der Server CORS erlauben (z. B. GitHub Gist „raw“).</p>
      <a :href="importExample" class="btn w-full"><Icon name="link" />Beispiel ausprobieren</a>
    </section>

    <section class="panel text-sm">
      <h2 class="mb-2">Minimales Format</h2>
      <pre class="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{
  "app": "drehmoment",
  "title": "Bruchrechnung",
  "questions": [
    { "type": "mc", "question": "1/2 + 1/4 = ?",
      "options": ["3/4", "2/6", "1/8", "2/4"],
      "correct": "A", "explanation": "2/4 + 1/4" },
    { "type": "tf", "question": "$0{,}5 = \\frac{1}{2}$",
      "options": ["Wahr", "Falsch"], "correct": "A" },
    { "type": "poll", "question": "Wie fit fühlst du dich?",
      "options": ["Sehr", "Geht so", "Gar nicht"] }
  ]
}</pre>
      <p class="mt-2 text-muted">Formeln in LaTeX zwischen <code>$…$</code>, im JSON Backslashes verdoppeln. Codes und Links bleiben dauerhaft gültig – auch wenn die App umzieht.</p>
    </section>
  </main>
</template>
