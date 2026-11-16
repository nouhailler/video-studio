// Exemple video-studio : application HTML statique, pilote « runtime »,
// mise en page bureau. Lancer : npm run example
import { defineVideoConfig } from '../../src/index'
import exempleFr from './scenarios/example-fr'

export default defineVideoConfig({
  name: 'Carnet du ciel',
  app: { build: null, staticDir: 'app' },
  driver: { type: 'runtime', url: '/' },
  layout: 'desktop',
  scenarios: [exempleFr],
  validation: { sourceDirs: ['app'], targetPrefixes: ['objet-'] },
  theme: {
    brand: 'Carnet du ciel',
    url: 'carnet-du-ciel.exemple',
    colors: { accent: '#7cc4ff', accentLight: '#a9d8ff', accentDark: '#4a90c8', accentSoft: 'rgba(124,196,255,.13)', accentLine: 'rgba(124,196,255,.32)', accentInk: '#081018' },
  },
})
