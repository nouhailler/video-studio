# video-studio

Génération **automatique** de tutoriels vidéo à partir de vos applications web réelles.

Un scénario TypeScript, versionné avec l'application, est joué dans un vrai navigateur, filmé,
doublé par une voix de synthèse **locale**, sous-titré, chapitré et exporté en MP4 prêt pour YouTube.
Aucune API payante ni service cloud.

```text
VIDEO STUDIO
[1/6] Validation du scénario          OK
[2/6] Préparation des données         OK
[3/6] Génération de la voix           OK
[4/6] Enregistrement du parcours      OK
[5/6] Composition de la vidéo         OK
[6/6] Exportation MP4                 OK
```

Sorties : `<id>.mp4` (H.264 1920×1080 30 i/s, AAC), `<id>.srt`, `<id>.vtt`, `<id>.chapters.txt`
(chapitrage YouTube) et `<id>.report.json` (vérifications de l'export).

Né du projet [Astror](https://github.com/nouhailler/astror), puis extrait pour servir à toutes les applications.

---

## Installation

Prérequis : Node ≥ 20, Python 3 avec `venv`, FFmpeg (`ffmpeg` et `ffprobe` dans le PATH).

```bash
npm install -D github:nouhailler/video-studio#v0.1.0
```

Une fois par machine (venv Piper, voix FR/EN, Chromium ; partagés par tous les projets dans
`~/.cache/video-studio`) :

```bash
npx video-studio setup
```

Dans un nouveau projet :

```bash
npx video-studio init
```

`init` crée `video/video.config.ts`, un premier scénario `video/scenarios/presentation-fr.ts`,
les entrées `.gitignore` et les scripts `npm run video:*`.

## Commandes

| Commande | Rôle |
|---|---|
| `video-studio list` | Scénarios du projet et ce qui a été produit |
| `video-studio validate --scenario <id>` | Contrôle statique (cibles présentes dans le code, voix, horloge…) |
| `video-studio audio --scenario <id> [--force]` | Narration (cache par empreinte) |
| `video-studio record --scenario <id>` | Joue et filme le scénario |
| `video-studio render --scenario <id>` | Chronologie + rendu + vérification de l'export |
| `video-studio generate --scenario <id>` | Toutes les étapes, dans l'ordre |
| `video-studio preview --scenario <id>` | Remotion Studio sur la dernière capture |
| `video-studio setup [voix]` | Installation (voix supplémentaire possible, ex. `de_DE-thorsten-medium`) |
| `video-studio init [--layout desktop]` | Initialise un projet |

Options : `--config <fichier>` (défaut `video/video.config.ts`), `--no-build`, `--headed`,
`--network replay|refresh|offline`.

## Configuration (`video/video.config.ts`)

```ts
import { defineVideoConfig } from '@nouhailler/video-studio'
import presentation from './scenarios/presentation-fr'

export default defineVideoConfig({
  name: 'Mon app',
  app: { build: 'npx vite build', staticDir: 'dist' },   // ou app.command: 'npm run preview -- --port {port}'
  driver: { type: 'runtime' },                            // voir « Pilotes »
  layout: 'phone',                                        // 'phone' (PWA mobile) ou 'desktop'
  scenarios: [presentation],
  validation: { sourceDirs: ['src'] },
  theme: {
    brand: 'Mon app', logo: 'assets/logo.svg', url: 'mon-app.exemple.org',
    colors: { accent: '#d9b36c', accentLight: '#efce8c', accentDark: '#b8924c' },
    fontCss: ['@fontsource/inter/400.css'], fonts: { sans: "'Inter', sans-serif" },
    labels: { chapter: 'Chapitre', tutorial: 'Tutoriel', intro: 'Introduction', outro: 'Conclusion' },
  },
  // Données de démonstration posées avant le chargement (jamais vos données réelles) :
  preseed: () => ({ 'monapp_onboarded': '1' }),
  network: {
    fixtures: [{ id: 'meteo', match: /api\.open-meteo\.com/, file: 'meteo.json', contentType: 'application/json', nature: 'simulé' }],
  },
  pronunciations: { fr: [[/mon-app\.exemple\.org/g, 'mon app point exemple point org']] },
})
```

Autres réglages (valeurs par défaut entre parenthèses) : `capture` (viewport selon `layout`,
`stepTimeoutMs` 10000, `breathMs` 650, `tailMs` 1200, `locale` fr-FR, `timezone` Europe/Paris),
`output` (1920×1080, 30 i/s, `crf` 18, `concurrency` 2), `narration` (pauses 300 / 550 ms),
`voices` / `defaultVoice` (fr-siwis, fr-tom, en-alba), `voicesDir`, `subtitles`
(42 caractères × 2 lignes, incrustation désactivée), `verifyRestore`.

## Scénarios

```ts
import { defineScenario, type RuntimeStep } from '@nouhailler/video-studio'

export default defineScenario<RuntimeStep>({
  id: 'presentation-fr',
  video: {
    title: 'Découvrez Mon app', language: 'fr', voiceEnabled: true,
    resolution: { width: 1920, height: 1080 }, fps: 30,
    clock: '2026-11-20T21:30:00+01:00',                 // heure simulée → prises reproductibles
    location: { city: 'Paris', lat: 48.8566, lng: 2.3522 },
    intro: { title: 'Découvrez Mon app', tagline: '…', narration: 'Texte parlé de l’intro.' },
    outro: { title: '…', bullets: ['…'], links: [{ label: 'Application', url: 'https://…' }], narration: '…' },
    firstChapter: 'Premiers pas',
  },
  scenario: {
    name: 'presentation-fr', label: 'Présentation',
    steps: [
      { type: 'highlight', target: 'liste', narrate: 'Affiché et parlé.', video: { zoom: 1.2 } },
      { type: 'type', target: 'recherche', text: 'Lune', narrate: '…' },
      { type: 'click', target: 'objet-lune', narrate: '…' },
      { type: 'navigate', target: 'menu-carnet', narrate: '…', video: { chapter: 'Le carnet', transition: 'fade' } },
      { type: 'navigate', url: '/reglages', narrate: '…' },   // pushState + popstate (routeurs SPA)
      { type: 'narrate', text: '…' },
      { type: 'wait', ms: 1500 },
    ],
  },
})
```

- `narrate` est à la fois affiché et parlé ; `video.narration.text` surcharge le texte parlé ;
  `video.narration: false` rend une étape muette.
- Métadonnées d'étape : `chapter`, `zoom` (1 – 1,6), `transition` (`fade` | `slide`), `subtitle`, `readingPause`.
- `voiceEnabled: false` : durées estimées, sous-titres conservés, vidéo sans narration.
- Une langue par tutoriel (`presentation-fr`, `presentation-en`).

## Pilotes

### `runtime` — pour toute application

video-studio injecte son propre moteur dans la page. Il suffit de poser des attributs
`data-demo-id="…"` (configurable : `driver.targetAttribute`) sur les éléments à montrer. Étapes :
`navigate` (`url` ou `target`), `click`, `type` (compatible React/Vue), `highlight`, `scroll`,
`narrate`, `wait`. Après une navigation, le moteur attend que le DOM soit calme (et que
`driver.loadingSelector` ait disparu, si fourni).

### `engine` — l'application a son propre moteur de démo

C'est le cas d'Astror (`src/demo/`). Le moteur de l'app doit parler le **protocole de capture** :

1. lire la requête injectée dans `window[globals.request]` avant le chargement
   (`{ scenario, options: { holdMs, speed, syncMark, stepTimeoutMs, breathMs }, seed }`) ;
2. afficher une mire magenta plein écran (`#ff00ff`) ~500 ms et émettre `sync:mark` au moment où elle est peinte ;
3. pousser les événements `{ type, t, epoch, step?, data? }` dans `window[globals.events]` :
   `scenario:start|end`, `step:start|end`, `narration:show|hide`, `navigation:complete`,
   `cursor:move`, `action:click|type`, `highlight:show|hide` (avec `rect` et `viewport`), `action:error` ;
   `t` vient de l'horloge réelle `window[globals.realClock].now()` (l'horloge de la page est simulée) ;
4. tenir chaque étape au moins `holdMs[i]` ms après `narration:show` ;
5. publier `{ ok, error?, step? }` dans `window[globals.result]` ; exposer `window[globals.stop]()`
   qui restaure l'application (vérifiable avec `verifyRestore`).

Le moteur de `src/runtime/engine.ts` est une implémentation de référence.

## Garanties

- **Synchronisation** : la voix est générée avant la capture ; chaque étape est tenue la durée réelle
  de sa voix ; la mire est repérée image par image ; chaque phrase est posée à l'instant exact de sa
  narration. Bornes de phrases exactes ; minutage mot à mot estimé si le TTS ne fournit pas d'alignement.
- **Déterminisme** : horloge et position simulées, service workers bloqués, notifications refusées,
  fixtures réseau + cache HAR rejoué, APIs d'IA (OpenRouter, Anthropic, OpenAI, Gemini, Mistral) toujours bloquées.
- **Arrêt explicite** plutôt qu'une vidéo incomplète : élément introuvable, écran non stabilisé, page
  plantée, voix obsolète ou manquante, narration absente ou superposée, mire introuvable, store non
  restauré… Rapport dans `capture.json` / `report.json` (+ `failure.png`).
- **Export vérifié** : H.264, résolution, cadence, piste AAC non muette, durée exacte, décodage complet.

## Exemple

`example/` contient une application HTML statique et sa configuration (pilote runtime, mise en page bureau) :

```bash
npm run example
```

## Licences

Code : MIT. Dépendances notables : [Remotion](https://www.remotion.dev/license) (gratuit pour les
particuliers et structures ≤ 3 personnes, licence d'entreprise au-delà), Playwright (Apache-2.0),
`piper-tts` (GPL-3.0, installé dans un venv et exécuté comme programme externe), voix Piper (voir les
fiches des modèles sur rhasspy/piper-voices), polices Fontsource (OFL-1.1).

## Limites

- Format vertical 9:16 non encore proposé (mises en page : `phone`, `desktop`).
- Navigation `url` : SPA à base de `history`/`popstate` ; un rechargement complet de page interrompt le moteur injecté.
- Minutage mot à mot estimé avec les voix Piper actuelles.
