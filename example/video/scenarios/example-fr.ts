import { defineScenario, type RuntimeStep } from '../../../src/index'

export default defineScenario<RuntimeStep>({
  id: 'example-fr',
  video: {
    title: 'Le carnet du ciel en 30 secondes',
    language: 'fr',
    voiceEnabled: true,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    clock: '2026-11-20T21:30:00+01:00',
    intro: { eyebrow: 'Exemple', title: 'Carnet du ciel', tagline: 'Démonstration de video-studio', narration: 'Voici une application d’exemple, filmée automatiquement.', minDurationMs: 4000 },
    outro: { title: 'Carnet du ciel', bullets: ['Recherche instantanée', 'Fiches détaillées', 'Carnet d’observation'], narration: 'Fin de la démonstration.', minDurationMs: 5000 },
    firstChapter: 'Les objets',
  },
  scenario: {
    name: 'example-fr',
    label: 'Exemple',
    steps: [
      { type: 'highlight', target: 'liste', narrate: 'La liste présente les objets à observer ce soir.' },
      { type: 'type', target: 'recherche', text: 'M4', narrate: 'Une recherche filtre la liste en direct.' },
      { type: 'click', target: 'objet-m42', narrate: 'Un clic ouvre la fiche de l’objet.', video: { zoom: 1.2 } },
      { type: 'navigate', target: 'nav-carnet', narrate: 'Le carnet garde la trace de vos observations.', video: { chapter: 'Le carnet', transition: 'fade' } },
      { type: 'highlight', target: 'observations', narrate: 'Chaque séance est notée avec le matériel utilisé.' },
    ],
  },
})
