// Configuration d'un projet : un fichier `video.config.ts` par application,
// qui exporte `defineVideoConfig({...})`. Tout ce qui n'est pas précisé prend
// les valeurs par défaut ci-dessous.
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AnyStep, BaseStep, Layout, ThemeColors, TimelineTheme, VideoScenario } from './types'
import { DEFAULT_COLORS } from './config-defaults'

export { DEFAULT_COLORS }

export interface VoiceConfig {
  engine: 'piper' | 'mock'
  /** Modèle Piper (<model>.onnx dans le dossier des voix). */
  model: string
  language: string
  rate: number
  volume: number
  sentenceGapMs: number
}

export interface NetworkFixture {
  id: string
  match: RegExp
  /** Fichier relatif à `network.fixturesDir`. */
  file: string
  contentType: string
  nature: 'simulé' | 'réel figé'
  note?: string
}

export interface EngineDriver {
  /** L'application embarque son propre moteur de démo, qui parle le protocole de capture. */
  type: 'engine'
  /** Chemin à ouvrir (ex. '/?capture=1'). */
  url: string
  /** Noms des globales window utilisées par le moteur de l'app. */
  globals?: Partial<EngineGlobals>
}

export interface EngineGlobals {
  request: string
  events: string
  result: string
  stop: string
  realClock: string
}

export interface RuntimeDriver {
  /** video-studio injecte son propre moteur et joue les étapes RuntimeStep. */
  type: 'runtime'
  /** Chemin à ouvrir (défaut '/'). */
  url?: string
  /** Attribut de ciblage (défaut 'data-demo-id'). */
  targetAttribute?: string
  /** Sélecteur d'indicateur de chargement à attendre après une navigation. */
  loadingSelector?: string
  /** Délai avant le départ, après le chargement (ms). */
  startDelayMs?: number
}

export interface VideoStudioConfig {
  /** Nom de l'application (affichage CLI). */
  name: string
  app: {
    /** Commande de build (null = aucun build). Ex. 'npx vite build'. */
    build?: string | null
    /** Dossier statique servi par le serveur intégré (relatif à la racine du projet). */
    staticDir?: string
    /** Repli SPA vers index.html (défaut true). */
    spaFallback?: boolean
    /** Alternative au serveur intégré : commande qui sert l'app ({port} remplacé). */
    command?: string
    port?: number
    host?: string
  }
  driver: EngineDriver | RuntimeDriver
  scenarios: VideoScenario<any>[]
  layout?: Layout
  capture?: Partial<CaptureConfig>
  output?: Partial<OutputConfig>
  narration?: Partial<{ pauseBeforeMs: number; pauseAfterMs: number }>
  voices?: Record<string, VoiceConfig>
  defaultVoice?: Record<string, string>
  /** Dossier des modèles et du venv Piper (défaut : ~/.cache/video-studio). */
  voicesDir?: string
  /** Règles de prononciation (ajoutées aux règles par défaut de la langue). */
  pronunciations?: Record<string, [RegExp, string][]>
  subtitles?: Partial<SubtitleConfig>
  network?: {
    mode?: 'replay' | 'refresh' | 'offline'
    fixtures?: NetworkFixture[]
    fixturesDir?: string
    /** Toujours bloqués (en plus des APIs d'IA par défaut). */
    blockedHosts?: RegExp[]
  }
  /** Clés localStorage posées avant le chargement de l'app. */
  preseed?: (scn: VideoScenario<any>, ctx: { root: string }) => Record<string, string>
  /** Vérifie que le moteur de l'app restaure le localStorage (pilote engine). */
  verifyRestore?: { prefix: string; ignore?: (key: string) => boolean } | false
  validation?: {
    /** Dossiers source analysés pour trouver les cibles (relatifs à la racine). */
    sourceDirs?: string[]
    targetAttribute?: string
    /** Cibles générées dynamiquement, inconnues de l'analyse statique. */
    extraTargets?: string[]
    targetPrefixes?: string[]
    /**
     * Motifs supplémentaires pour repérer les cibles dans le code (groupe 1 = identifiant).
     * Les fichiers .dart sont déjà reconnus : `Semantics(identifier: 'x')`.
     */
    patterns?: RegExp[]
    /** Contrôles propres à l'app ; renvoie des messages d'erreur. */
    validateStep?: (step: BaseStep, index: number) => string[]
  }
  theme?: Partial<Omit<TimelineTheme, 'colors' | 'fonts' | 'labels'>> & {
    colors?: Partial<ThemeColors>
    fonts?: Partial<TimelineTheme['fonts']>
    labels?: Partial<TimelineTheme['labels']>
    /** Feuilles de style de polices importées dans la composition (ex. '@fontsource/inter/400.css'). */
    fontCss?: string[]
  }
}

export interface CaptureConfig {
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  isMobile: boolean
  jpegQuality: number
  stepTimeoutMs: number
  breathMs: number
  tailMs: number
  maxDurationMs: number
  locale: string
  timezone: string
  colorScheme: 'dark' | 'light'
}

export interface OutputConfig {
  width: number; height: number; fps: number; crf: number
  /** Onglets de rendu Remotion en parallèle (en cas d'échec, nouvel essai avec 1). */
  concurrency: number
  /** Délai Remotion par image (delayRender), en ms. */
  timeoutMs: number
}

export interface SubtitleConfig { maxCharsPerLine: number; maxLines: number; minCueMs: number; burnIn: boolean }

export function defineVideoConfig(c: VideoStudioConfig): VideoStudioConfig {
  return c
}

/** Aide au typage d'un scénario. */
export function defineScenario<S extends AnyStep>(s: VideoScenario<S>): VideoScenario<S> {
  return s
}

// ── Valeurs par défaut ──────────────────────────────────────────────────────

export const DEFAULT_VOICES: Record<string, VoiceConfig> = {
  'fr-siwis': { engine: 'piper', model: 'fr_FR-siwis-medium', language: 'fr', rate: 1.0, volume: 1.0, sentenceGapMs: 280 },
  'fr-tom': { engine: 'piper', model: 'fr_FR-tom-medium', language: 'fr', rate: 1.05, volume: 1.0, sentenceGapMs: 280 },
  'en-alba': { engine: 'piper', model: 'en_GB-alba-medium', language: 'en', rate: 1.0, volume: 1.0, sentenceGapMs: 260 },
}

export const DEFAULT_PRONUNCIATIONS: Record<string, [RegExp, string][]> = {
  fr: [
    [/\b(\d{1,2}) h (\d{2})\b/g, '$1 heures $2'],
    [/\b(\d{1,2}) h\b/g, '$1 heures'],
    [/\bIA\b/g, 'I A'],
  ],
  en: [],
}

export const DEFAULT_BLOCKED_HOSTS: RegExp[] = [
  /^https:\/\/openrouter\.ai\//,
  /^https:\/\/api\.anthropic\.com\//,
  /^https:\/\/api\.openai\.com\//,
  /^https:\/\/generativelanguage\.googleapis\.com\//,
  /^https:\/\/api\.mistral\.ai\//,
]


const LAYOUT_CAPTURE: Record<Layout, Pick<CaptureConfig, 'viewport' | 'deviceScaleFactor' | 'isMobile'>> = {
  phone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, isMobile: false },
}

export interface ResolvedConfig {
  name: string
  app: Required<Pick<VideoStudioConfig['app'], 'spaFallback' | 'port' | 'host'>> & VideoStudioConfig['app']
  driver: (EngineDriver & { globals: EngineGlobals }) | (RuntimeDriver & Required<Pick<RuntimeDriver, 'url' | 'targetAttribute' | 'startDelayMs'>>)
  scenarios: VideoScenario<any>[]
  layout: Layout
  capture: CaptureConfig
  output: OutputConfig
  narration: { pauseBeforeMs: number; pauseAfterMs: number }
  voices: Record<string, VoiceConfig>
  defaultVoice: Record<string, string>
  voicesDir: string
  pronunciations: Record<string, [RegExp, string][]>
  subtitles: SubtitleConfig
  network: { mode: 'replay' | 'refresh' | 'offline'; fixtures: NetworkFixture[]; fixturesDir: string; blockedHosts: RegExp[] }
  preseed?: VideoStudioConfig['preseed']
  verifyRestore: VideoStudioConfig['verifyRestore']
  validation: { sourceDirs: string[]; targetAttribute: string; extraTargets: string[]; targetPrefixes: string[]; patterns: RegExp[]; validateStep?: (step: BaseStep, i: number) => string[] }
  theme: TimelineTheme & { fontCss: string[]; logoPath: string | null }
}

/** Projet chargé : configuration résolue + emplacements. */
export interface Project {
  config: ResolvedConfig
  /** Fichier de configuration. */
  configFile: string
  /** Dossier vidéo du projet (celui du fichier de configuration). */
  dir: string
  /** Racine de l'application (dossier contenant package.json). */
  root: string
}

export function resolveConfig(c: VideoStudioConfig, dir: string, root: string): ResolvedConfig {
  const layout = c.layout ?? 'phone'
  const pron: Record<string, [RegExp, string][]> = {}
  for (const lang of new Set([...Object.keys(DEFAULT_PRONUNCIATIONS), ...Object.keys(c.pronunciations ?? {})])) {
    pron[lang] = [...(c.pronunciations?.[lang] ?? []), ...(DEFAULT_PRONUNCIATIONS[lang] ?? [])]
  }
  const driver = c.driver.type === 'engine'
    ? { ...c.driver, globals: { request: '__VIDEO_CAPTURE__', events: '__VIDEO_CAPTURE_EVENTS__', result: '__VIDEO_CAPTURE_RESULT__',
        stop: '__VIDEO_STOP_DEMO__', realClock: '__VIDEO_REAL_CLOCK__', ...c.driver.globals } }
    : { url: '/', targetAttribute: 'data-demo-id', startDelayMs: 800, ...c.driver }
  const logo = c.theme?.logo ? path.resolve(dir, c.theme.logo) : null
  return {
    name: c.name,
    app: { spaFallback: true, port: 4317, host: '127.0.0.1', ...c.app },
    driver: driver as ResolvedConfig['driver'],
    scenarios: c.scenarios,
    layout,
    capture: {
      ...LAYOUT_CAPTURE[layout], jpegQuality: 92, stepTimeoutMs: 10000, breathMs: 650, tailMs: 1200,
      maxDurationMs: 15 * 60 * 1000, locale: 'fr-FR', timezone: 'Europe/Paris', colorScheme: 'dark', ...c.capture,
    },
    output: { width: 1920, height: 1080, fps: 30, crf: 18, concurrency: 2, timeoutMs: 120000, ...c.output },
    narration: { pauseBeforeMs: 300, pauseAfterMs: 550, ...c.narration },
    voices: { ...DEFAULT_VOICES, ...c.voices },
    defaultVoice: { fr: 'fr-siwis', en: 'en-alba', ...c.defaultVoice },
    voicesDir: c.voicesDir ? path.resolve(dir, c.voicesDir)
      : process.env.VIDEO_STUDIO_HOME ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'video-studio'),
    pronunciations: pron,
    subtitles: { maxCharsPerLine: 42, maxLines: 2, minCueMs: 1200, burnIn: false, ...c.subtitles },
    network: {
      mode: c.network?.mode ?? 'replay',
      fixtures: c.network?.fixtures ?? [],
      fixturesDir: path.resolve(dir, c.network?.fixturesDir ?? 'fixtures/network'),
      blockedHosts: [...DEFAULT_BLOCKED_HOSTS, ...(c.network?.blockedHosts ?? [])],
    },
    preseed: c.preseed,
    verifyRestore: c.verifyRestore ?? false,
    validation: {
      sourceDirs: c.validation?.sourceDirs ?? ['src'],
      targetAttribute: c.validation?.targetAttribute ?? defaultSourceAttribute(c),
      extraTargets: c.validation?.extraTargets ?? [],
      targetPrefixes: c.validation?.targetPrefixes ?? [],
      patterns: c.validation?.patterns ?? [],
      validateStep: c.validation?.validateStep,
    },
    theme: {
      brand: c.theme?.brand ?? c.name,
      url: c.theme?.url ?? null,
      logo: logo ? `logo${path.extname(logo)}` : null,
      logoPath: logo,
      colors: { ...DEFAULT_COLORS, ...c.theme?.colors },
      fonts: { serif: "'Spectral', Georgia, serif", sans: "'IBM Plex Sans', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace", ...c.theme?.fonts },
      labels: { chapter: 'Chapitre', tutorial: 'Tutoriel', intro: 'Introduction', outro: 'Conclusion', ...c.theme?.labels },
      starfield: c.theme?.starfield ?? true,
      fontCss: c.theme?.fontCss ?? [],
    },
  }
}

/** Attribut cherché dans le code : Flutter expose `Semantics(identifier:)` sous `flt-semantics-identifier`. */
function defaultSourceAttribute(c: VideoStudioConfig): string {
  const attr = c.driver.type === 'runtime' ? c.driver.targetAttribute ?? 'data-demo-id' : 'data-demo-id'
  return attr === 'flt-semantics-identifier' ? 'identifier' : attr
}

function findRoot(start: string): string {
  let d = start
  while (true) {
    if (existsSync(path.join(d, 'package.json'))) return d
    const up = path.dirname(d)
    if (up === d) return start
    d = up
  }
}

export const CONFIG_CANDIDATES = ['video/video.config.ts', 'video.config.ts']

export async function loadProject(configArg?: string, cwd = process.cwd()): Promise<Project> {
  const file = configArg
    ? path.resolve(cwd, configArg)
    : CONFIG_CANDIDATES.map((c) => path.resolve(cwd, c)).find((f) => existsSync(f))
  if (!file || !existsSync(file)) {
    throw new Error(`Configuration introuvable (${configArg ?? CONFIG_CANDIDATES.join(' ou ')}). Créez-la avec « npx video-studio init ».`)
  }
  const mod = await import(pathToFileURL(file).href)
  const raw = (mod.default ?? mod.config) as VideoStudioConfig | undefined
  if (!raw || !raw.driver || !Array.isArray(raw.scenarios)) {
    throw new Error(`${file} doit exporter par défaut defineVideoConfig({ name, app, driver, scenarios, … })`)
  }
  const dir = path.dirname(file)
  const root = findRoot(dir)
  return { config: resolveConfig(raw, dir, root), configFile: file, dir, root }
}
