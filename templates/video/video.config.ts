// Configuration video-studio de __NAME__.
// Doc : https://github.com/nouhailler/video-studio#readme
import { defineVideoConfig } from '@nouhailler/video-studio'
import presentation from './scenarios/presentation-fr'

export default defineVideoConfig({
  name: '__NAME__',
  app: {
    build: '__BUILD__',          // commande de build (null si aucune)
    staticDir: '__STATIC__',     // dossier servi pendant la capture
  },
  // Moteur injecté : les étapes ciblent des attributs data-demo-id posés dans l'app.
  driver: { type: 'runtime', url: '/', targetAttribute: 'data-demo-id' },
  layout: '__LAYOUT__',          // 'phone' (app mobile) ou 'desktop'
  scenarios: [presentation],
  validation: { sourceDirs: ['src'] },
  theme: {
    brand: '__NAME__',
    // logo: 'assets/logo.svg',
    // url: 'mon-app.exemple.org',
    // colors: { accent: '#d9b36c', accentLight: '#efce8c', accentDark: '#b8924c' },
  },
})
