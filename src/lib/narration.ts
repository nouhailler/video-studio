// Extraction des narrations d'un scénario et traitement du texte.
// Le texte parlé vient de `step.video.narration.text`, sinon du texte déjà
// présent dans l'étape (`narrate`, ou `text` d'une étape narrate).
import type { ResolvedConfig } from '../config'
import type { BaseStep, VideoNarration, VideoScenario } from '../types'

export interface NarrationItem {
  key: string
  kind: 'intro' | 'step' | 'outro'
  step?: number
  text: string
  language: string
  voice: string
  rate?: number
  pauseBeforeMs: number
  pauseAfterMs: number
}

function displayedText(step: BaseStep): string | undefined {
  if (step.type === 'narrate' && typeof step.text === 'string') return step.text
  return typeof step.narrate === 'string' ? step.narrate : undefined
}

/** Retire les symboles d'interface non prononçables. */
export function speakable(text: string): string {
  return text.replace(/[✕✓▶›→←↑↓]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function pronounce(cfg: ResolvedConfig, text: string, language: string): string {
  let out = text
  for (const [re, rep] of cfg.pronunciations[language] ?? []) out = out.replace(re, rep)
  return out
}

export function voiceFor(cfg: ResolvedConfig, scn: VideoScenario, n?: VideoNarration | null): string {
  const lang = n?.language ?? scn.video.language
  const key = n?.voice ?? scn.video.voice ?? cfg.defaultVoice[lang]
  if (!key) throw new Error(`Aucune voix configurée pour la langue « ${lang} »`)
  return key
}

export function collectNarrations(cfg: ResolvedConfig, scn: VideoScenario): NarrationItem[] {
  const items: NarrationItem[] = []
  const base = cfg.narration
  const lang = scn.video.language
  if (scn.video.intro && scn.video.intro.narration) {
    items.push({ key: 'intro', kind: 'intro', text: scn.video.intro.narration, language: lang,
      voice: voiceFor(cfg, scn), pauseBeforeMs: 700, pauseAfterMs: 700 })
  }
  scn.scenario.steps.forEach((step, i) => {
    const meta = step.video
    if (meta?.narration === false) return
    const n = meta?.narration || undefined
    const text = n?.text ?? displayedText(step)
    if (!text || !text.trim()) return
    items.push({
      key: `step-${i}`, kind: 'step', step: i, text: speakable(text),
      language: n?.language ?? lang, voice: voiceFor(cfg, scn, n), rate: n?.rate,
      pauseBeforeMs: n?.pauseBeforeMs ?? base.pauseBeforeMs,
      pauseAfterMs: (n?.pauseAfterMs ?? base.pauseAfterMs) + (meta?.readingPause ?? 0),
    })
  })
  if (scn.video.outro && scn.video.outro.narration) {
    items.push({ key: 'outro', kind: 'outro', text: scn.video.outro.narration, language: lang,
      voice: voiceFor(cfg, scn), pauseBeforeMs: 700, pauseAfterMs: 1200 })
  }
  return items
}

/** Découpe en phrases sans couper « M. », « 18 h 42 » ni les points de suspension internes. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  let cur = ''
  for (const t of clean.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Ý«"0-9])/u)) {
    cur = cur ? `${cur} ${t}` : t
    if (/\b(M|Mme|Dr|St|av|J\.-C|etc|Mr|Mrs|e\.g|i\.e)\.$/.test(cur)) continue
    out.push(cur)
    cur = ''
  }
  if (cur) out.push(cur)
  return out
}

/** Minutage estimé des mots (proportionnel aux caractères) dans la durée exacte de la phrase. */
export function estimateWords(sentence: string, durationMs: number): { word: string; start: number; end: number }[] {
  const words = sentence.split(/\s+/).filter(Boolean)
  const weight = (w: string) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length) + 1
  const total = words.reduce((s, w) => s + weight(w), 0)
  let acc = 0
  return words.map((word) => {
    const start = Math.round((acc / total) * durationMs)
    acc += weight(word)
    return { word, start, end: Math.round((acc / total) * durationMs) }
  })
}

export function readingTimeMs(text: string): number {
  return Math.min(6500, Math.max(2200, text.length * 55))
}

export function findScenario(cfg: ResolvedConfig, id: unknown): VideoScenario {
  const ids = cfg.scenarios.map((s) => s.id).join(', ')
  if (!id || typeof id !== 'string') throw new Error(`Préciser --scenario <id>. Disponibles : ${ids}`)
  const s = cfg.scenarios.find((x) => x.id === id)
  if (!s) throw new Error(`Scénario inconnu : « ${id} ». Disponibles : ${ids}`)
  return s
}
