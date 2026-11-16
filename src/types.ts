// Types publics de video-studio.
//
// Un scénario vidéo = une liste d'étapes jouées dans l'application réelle,
// enrichie de métadonnées audiovisuelles optionnelles. Les étapes sont
// interprétées soit par le moteur de démo de l'application (pilote « engine »),
// soit par le moteur injecté de video-studio (pilote « runtime »).

export type LanguageCode = 'fr' | 'en' | (string & {})

// ── Étapes ─────────────────────────────────────────────────────────────────

export interface VideoNarration {
  /** Texte parlé (par défaut : `narrate`, ou `text` d'une étape narrate). */
  text?: string
  language?: LanguageCode
  /** Clé de voix (config `voices`). */
  voice?: string
  /** Débit relatif : 1.1 = 10 % plus rapide. */
  rate?: number
  pauseBeforeMs?: number
  pauseAfterMs?: number
}

export interface VideoStepMetadata {
  /** Narration parlée ; `false` = étape muette même si `narrate` existe. */
  narration?: VideoNarration | false
  /** Sous-titre forcé (par défaut : le texte parlé). */
  subtitle?: string
  /** Pause de lecture supplémentaire après la voix (ms). */
  readingPause?: number
  transition?: 'none' | 'fade' | 'slide'
  /** Début d'un chapitre (titre affiché + chapitrage YouTube). */
  chapter?: string
  /** Zoom léger sur l'élément mis en évidence (1 – 1.6). */
  zoom?: number
}

/** Forme minimale commune à toutes les étapes (moteur de l'app ou runtime). */
export interface BaseStep {
  type: string
  narrate?: string
  target?: string
  text?: string
  ms?: number
  video?: VideoStepMetadata
  [key: string]: unknown
}

/** Étapes comprises par le moteur injecté (pilote « runtime »). */
export type RuntimeStep =
  | { type: 'navigate'; url?: string; target?: string; narrate?: string; video?: VideoStepMetadata }
  | { type: 'click'; target: string; narrate?: string; video?: VideoStepMetadata }
  | { type: 'type'; target: string; text: string; narrate?: string; video?: VideoStepMetadata }
  | { type: 'highlight'; target: string; label?: string; narrate?: string; video?: VideoStepMetadata }
  | { type: 'scroll'; target: string; narrate?: string; video?: VideoStepMetadata }
  | { type: 'wait'; ms: number; video?: VideoStepMetadata }
  | { type: 'narrate'; text: string; title?: string; ms?: number; video?: VideoStepMetadata }

// ── Scénario ───────────────────────────────────────────────────────────────

export interface VideoCard {
  eyebrow?: string
  title?: string
  tagline?: string
  narration?: string
  bullets?: string[]
  links?: { label: string; url: string }[]
  minDurationMs?: number
}

export interface VideoMetadata {
  title: string
  description?: string
  language: LanguageCode
  voiceEnabled: boolean
  voice?: string
  resolution: { width: number; height: number }
  fps: number
  intro?: VideoCard | false
  outro?: VideoCard | false
  subtitles?: { export?: boolean; burnIn?: boolean }
  /** Date/heure simulée dans le navigateur (ISO 8601). */
  clock?: string
  timezone?: string
  /** Géolocalisation simulée. */
  location?: { city?: string; lat: number; lng: number }
  /** Clés localStorage posées avant le chargement (en plus de config.preseed). */
  seed?: Record<string, string>
  /** Vitesse des animations du moteur (défaut 1). */
  speed?: number
  /** Chapitre de la première séquence (après l'intro). */
  firstChapter?: string
}

/** Toute forme d'étape convient (moteur de l'app ou RuntimeStep), pourvu qu'elle ait un `type`. */
export type AnyStep = { type: string; video?: VideoStepMetadata }

export interface VideoScenario<S extends AnyStep = BaseStep> {
  /** Identifiant (nom des fichiers de sortie) : minuscules, chiffres, tirets. */
  id: string
  video: VideoMetadata
  scenario: { name: string; label: string; description?: string; steps: S[] }
}

// ── Protocole de capture (événements émis par le moteur) ────────────────────

export type CaptureEventType =
  | 'scenario:start' | 'scenario:end'
  | 'step:start' | 'step:end'
  | 'navigation:complete'
  | 'cursor:move'
  | 'action:click' | 'action:type'
  | 'highlight:show' | 'highlight:hide'
  | 'narration:show' | 'narration:hide'
  | 'action:error'
  | 'sync:mark'

export interface DemoEvent {
  type: CaptureEventType
  /** Horloge réelle de la page (ms). */
  t: number
  /** Temps Unix (ms). */
  epoch: number
  step?: number
  data?: Record<string, unknown>
}

export interface DemoRunResult { ok: boolean; error?: string; step?: number }

/** Requête injectée dans la page avant le chargement. */
export interface CaptureRequest {
  scenario: { name: string; label: string; steps: BaseStep[] }
  options: {
    holdMs?: Record<number, number>
    speed?: number
    syncMark?: boolean
    stepTimeoutMs?: number
    breathMs?: number
    showNarration?: boolean
  }
  seed?: Record<string, string>
}

// ── Artefacts du pipeline ───────────────────────────────────────────────────

export interface WordTiming { word: string; start: number; end: number }

export interface VoiceSentence {
  text: string
  /** Fichier WAV, relatif au dossier vidéo du projet. */
  file: string
  hash: string
  offsetMs: number
  durationMs: number
  words: WordTiming[]
  wordTiming: 'exact' | 'estimated'
}

export interface VoiceSegment {
  key: string
  kind: 'intro' | 'step' | 'outro'
  step?: number
  text: string
  language: LanguageCode
  voice: string
  pauseBeforeMs: number
  pauseAfterMs: number
  speechMs: number
  totalMs: number
  sentences: VoiceSentence[]
}

export interface VoiceManifest {
  scenarioId: string
  engine: string
  generatedAt: string
  voiceEnabled: boolean
  segments: VoiceSegment[]
  cache: { hits: number; misses: number }
}

export interface CaptureEvent extends DemoEvent { videoT: number }

export interface NetworkReport {
  mode: 'replay' | 'refresh' | 'offline'
  fixtures: string[]
  harHits: number
  blocked: string[]
  failed: string[]
}

export interface CaptureManifest {
  scenarioId: string
  recordedAt: string
  ok: boolean
  error?: string
  failedStep?: number
  driver: 'engine' | 'runtime'
  viewport: { width: number; height: number; deviceScaleFactor: number }
  clock: string | null
  video: { file: string; width: number; height: number; fps: number; durationS: number; frames: number }
  sync: { markVideoT: number; method: 'frame-scan' | 'timestamps'; screencastDriftMs: number | null }
  events: CaptureEvent[]
  network: NetworkReport
  storeRestored: boolean | null
}

export interface TimelineSentence {
  text: string
  src: string
  from: number
  durationInFrames: number
  words: { word: string; from: number }[]
  segment: string
}

export interface TimelineCue { index: number; startMs: number; endMs: number; lines: string[] }

/** Thème résolu transmis à la composition. */
export interface TimelineTheme {
  brand: string
  url: string | null
  logo: string | null
  colors: ThemeColors
  fonts: { serif: string; sans: string; mono: string }
  labels: { chapter: string; tutorial: string; intro: string; outro: string }
  starfield: boolean
}

export interface ThemeColors {
  bg: string
  bgTop: string
  bgMid: string
  surface: string
  line: string
  text: string
  dim: string
  faint: string
  accent: string
  accentLight: string
  accentDark: string
  accentSoft: string
  accentLine: string
  accentInk: string
  glowA: string
  glowB: string
}

export type Layout = 'phone' | 'desktop'

export interface Timeline {
  id: string
  title: string
  description?: string
  language: string
  fps: number
  width: number
  height: number
  durationInFrames: number
  layout: Layout
  theme: TimelineTheme
  intro: { from: number; durationInFrames: number; card: VideoCard } | null
  body: {
    from: number
    durationInFrames: number
    src: string
    trimStartFrames: number
    screen: { width: number; height: number }
  }
  outro: { from: number; durationInFrames: number; card: VideoCard } | null
  sentences: TimelineSentence[]
  chapters: { title: string; from: number }[]
  zooms: { from: number; to: number; scale: number; cx: number; cy: number }[]
  transitions: { at: number; kind: 'fade' | 'slide' }[]
  cues: TimelineCue[]
  subtitles: { burnIn: boolean }
}
