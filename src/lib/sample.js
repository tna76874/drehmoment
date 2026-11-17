// Beispielquiz für den ersten Start
export const SAMPLE = {
  app: 'drehmoment',
  title: 'Beispiel: Photosynthese',
  description: 'Kurzer Check nach dem Erklärvideo',
  subject: 'Biologie',
  grade: 'Klasse 7',
  material: 'Schau dir vor der Stunde ein Erklärvideo zur Photosynthese an (Suchbegriff: „Photosynthese einfach erklärt“).\n\nLeitfragen:\n1. Welche Stoffe braucht eine Pflanze für die Photosynthese?\n2. Was entsteht dabei?\n3. Wo in der Zelle läuft sie ab?',
  settings: { showCorrect: true, shuffle: false },
  questions: [
    { type: 'poll', question: 'Hast du das Video zur Vorbereitung geschaut?', options: ['Ja, komplett', 'Teilweise', 'Nein'] },
    { type: 'mc', question: 'Wo findet die Photosynthese statt?', options: ['Mitochondrien', 'Chloroplasten', 'Zellkern', 'Zellwand'], correct: 'B', explanation: 'Die Chloroplasten enthalten das grüne Chlorophyll.' },
    { type: 'mc', question: 'Welches Gas nimmt die Pflanze auf?', options: ['Sauerstoff', 'Stickstoff', 'Kohlenstoffdioxid', 'Wasserstoff'], correct: 'C', explanation: 'CO₂ wird mit Wasser zu Glucose aufgebaut.' },
    { type: 'tf', question: 'Bei der Photosynthese entsteht Sauerstoff.', options: ['Wahr', 'Falsch'], correct: 'A', explanation: 'Sauerstoff ist ein „Abfallprodukt“ der Photosynthese.' },
    { type: 'mc', question: 'Welche Energieform nutzt die Pflanze?', options: ['Wärme', 'Lichtenergie', 'Bewegungsenergie', 'Elektrische Energie'], correct: 'B' },
  ],
}
