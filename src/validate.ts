// Validation statique d'un scénario avant production : structure des étapes,
// cibles réellement présentes dans le code source, voix et langues
// configurées, métadonnées cohérentes, contrôles propres à l'application.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Project } from './config'
import type { VideoScenario } from './types'
import { collectNarrations, readingTimeMs } from './lib/narration'

const COMMON_TYPES = ['navigate', 'click', 'type', 'highlight', 'scroll', 'wait', 'narrate']

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats: { steps: number; narrations: number; estimatedMs: number }
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Cibles trouvées dans le code source : valeurs littérales et préfixes de gabarits. */
export function collectTargets(p: Project): { exact: Set<string>; prefixes: string[] } {
  const v = p.config.validation
  const attr = escapeRe(v.targetAttribute)
  const exact = new Set<string>(v.extraTargets)
  const prefixes: string[] = [...v.targetPrefixes]
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? (['node_modules', '__tests__', 'dist', '.git'].includes(d.name) ? [] : walk(path.join(dir, d.name)))
      : /\.(jsx?|tsx?|vue|svelte|html)$/.test(d.name) ? [path.join(dir, d.name)] : [])
  const res = [
    new RegExp(`${attr}="([^"]+)"`, 'g'),
    new RegExp(`${attr}='([^']+)'`, 'g'),
    /demoId="([^"]+)"/g,
    new RegExp(`${attr}=\\{[^}]*?'([^'$]+)'[^}]*\\}`, 'g'),
  ]
  for (const dir of v.sourceDirs.map((d) => path.resolve(p.root, d)).filter(existsSync)) {
    for (const f of walk(dir)) {
      const code = readFileSync(f, 'utf8')
      for (const re of res) for (const m of code.matchAll(re)) exact.add(m[1])
      for (const m of code.matchAll(/demoIdPrefix="([^"]+)"/g)) prefixes.push(`${m[1]}-`)
      for (const m of code.matchAll(new RegExp(`${attr}=\\{\`([a-zA-Z0-9_-]+-)\\$\\{`, 'g'))) prefixes.push(m[1])
    }
  }
  // Valeurs interpolées (`objet-${id}`, {{ … }}) : on garde le préfixe fixe.
  for (const e of [...exact]) {
    const cut = e.search(/\$\{|\{\{/)
    if (cut >= 0) { exact.delete(e); if (cut > 0) prefixes.push(e.slice(0, cut)) }
  }
  return { exact, prefixes: [...new Set(prefixes)] }
}

export function validateScenario(p: Project, scn: VideoScenario, targets = collectTargets(p)): ValidationReport {
  const cfg = p.config
  const errors: string[] = []
  const warnings: string[] = []
  const v = scn.video
  if (!/^[a-z0-9-]+$/.test(scn.id)) errors.push(`id invalide « ${scn.id} » (minuscules, chiffres, tirets)`)
  if (!v.title?.trim()) errors.push('video.title manquant')
  if (!v.resolution || v.resolution.width % 2 || v.resolution.height % 2) errors.push('video.resolution doit avoir des dimensions paires')
  if (![24, 25, 30, 50, 60].includes(v.fps)) errors.push(`video.fps non standard : ${v.fps}`)
  if (v.clock != null && Number.isNaN(Date.parse(v.clock))) errors.push('video.clock doit être une date ISO 8601')
  if (!v.clock) warnings.push('video.clock absent : l’heure réelle sera utilisée (prises non reproductibles)')
  if (!cfg.defaultVoice[v.language] && !v.voice) errors.push(`Aucune voix configurée pour la langue « ${v.language} »`)

  const steps = scn.scenario.steps
  if (!steps.length) errors.push('Scénario vide')
  const runtime = cfg.driver.type === 'runtime'
  const targetOk = (t: string) => targets.exact.has(t) || targets.prefixes.some((x) => t.startsWith(x))
  steps.forEach((s, i) => {
    const where = `étape ${i} (${s.type})`
    if (runtime && !COMMON_TYPES.includes(s.type)) errors.push(`${where} : type inconnu du moteur injecté`)
    switch (s.type) {
      case 'navigate':
        if (runtime && !s.url && !s.target) errors.push(`${where} : « url » ou « target » requis`)
        if (s.target && !targetOk(s.target)) errors.push(`${where} : cible « ${s.target} » absente du code source`)
        break
      case 'click': case 'highlight': case 'type': case 'scroll':
        if (!s.target) errors.push(`${where} : « target » requis`)
        else if (!targetOk(s.target)) errors.push(`${where} : cible « ${s.target} » absente du code source (${cfg.validation.sourceDirs.join(', ')})`)
        if (s.type === 'type' && !s.text) errors.push(`${where} : « text » requis`)
        break
      case 'wait':
        if (!((s.ms ?? 0) > 0)) errors.push(`${where} : « ms » > 0 requis`)
        break
      case 'narrate':
        if (!s.text?.trim()) errors.push(`${where} : « text » requis`)
        break
    }
    for (const e of cfg.validation.validateStep?.(s, i) ?? []) errors.push(`${where} : ${e}`)
    if (s.video?.zoom != null && (s.video.zoom < 1 || s.video.zoom > 1.6)) warnings.push(`${where} : zoom ${s.video.zoom} hors plage conseillée [1 ; 1.6]`)
  })

  let narr: ReturnType<typeof collectNarrations> = []
  try { narr = collectNarrations(cfg, scn) } catch (e) { errors.push((e as Error).message) }
  for (const n of narr) {
    const voice = cfg.voices[n.voice]
    if (!voice) errors.push(`${n.key} : voix inconnue « ${n.voice} »`)
    else if (voice.language !== n.language) errors.push(`${n.key} : voix « ${n.voice} » ≠ langue « ${n.language} »`)
    if (n.text.length > 320) warnings.push(`${n.key} : narration longue (${n.text.length} car.), à découper`)
  }
  if (v.voiceEnabled && !narr.length) errors.push('voiceEnabled est vrai mais aucune narration')
  if (!steps.some((s) => s.video?.chapter) && !v.firstChapter) warnings.push('Aucun chapitre (video.chapter) : pas de chapitrage YouTube')

  const estimatedMs = narr.reduce((s, n) => s + readingTimeMs(n.text) + n.pauseBeforeMs + n.pauseAfterMs, 0) + steps.length * cfg.capture.breathMs
  return { ok: errors.length === 0, errors, warnings, stats: { steps: steps.length, narrations: narr.length, estimatedMs } }
}
