// Génération de la narration vocale d'un scénario.
//
// Découpage en phrases → synthèse locale d'un WAV par phrase → durée RÉELLE
// mesurée (ffprobe) → manifeste voice.json. Cache adressé par contenu :
// empreinte(moteur, version, modèle, débit, volume, langue, texte prononcé).
import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Project, VoiceConfig } from './config'
import type { VideoScenario, VoiceManifest, VoiceSegment, VoiceSentence } from './types'
import { collectNarrations, estimateWords, pronounce, readingTimeMs, splitSentences } from './lib/narration'
import { projectFiles, projectPaths } from './lib/paths'
import { StudioError, ensureDir, mediaDurationMs, readJson, sha256, writeJson } from './lib/util'
import { MockEngine, type TtsEngine, type TtsRequest } from './tts/engine'
import { PiperEngine } from './tts/piper'

export interface VoiceOptions {
  force?: boolean
  /** Remplace le moteur configuré (tests). */
  engine?: TtsEngine
  cacheDir?: string
  manifestFile?: string
  log?: (msg: string) => void
}

interface CacheMeta { text: string; durationMs: number; alignments: boolean; engine: string; createdAt: string }

const engines = new Map<string, TtsEngine>()
function engineById(p: Project, id: string): TtsEngine {
  const key = `${id}:${p.config.voicesDir}`
  if (!engines.has(key)) {
    const P = projectPaths(p)
    engines.set(key, id === 'piper' ? new PiperEngine(P.venvPython, P.models) : new MockEngine())
  }
  return engines.get(key)!
}

export async function generateVoice(p: Project, scn: VideoScenario, opts: VoiceOptions = {}): Promise<VoiceManifest> {
  const cfg = p.config
  const log = opts.log ?? (() => {})
  const cacheDir = ensureDir(opts.cacheDir ?? projectPaths(p).ttsCache)
  const items = collectNarrations(cfg, scn)
  const manifestFile = opts.manifestFile ?? projectFiles(p).voice(scn.id)
  const voiceConf = (key: string): VoiceConfig => {
    const v = cfg.voices[key]
    if (!v) throw new StudioError(`Voix inconnue : « ${key} » (voir voices dans la configuration)`)
    return v
  }

  // Mode sans voix : durées estimées, aucune synthèse.
  if (!scn.video.voiceEnabled) {
    const segments: VoiceSegment[] = items.map((it) => {
      let offset = it.pauseBeforeMs
      const sentences: VoiceSentence[] = splitSentences(it.text).map((text) => {
        const d = readingTimeMs(text)
        const s: VoiceSentence = { text, file: '', hash: '', offsetMs: offset, durationMs: d, words: estimateWords(text, d), wordTiming: 'estimated' }
        offset += d + 200
        return s
      })
      const speechMs = Math.max(0, offset - 200 - it.pauseBeforeMs)
      return { key: it.key, kind: it.kind, step: it.step, text: it.text, language: it.language, voice: 'none',
        pauseBeforeMs: it.pauseBeforeMs, pauseAfterMs: it.pauseAfterMs, speechMs, totalMs: it.pauseBeforeMs + speechMs + it.pauseAfterMs, sentences }
    })
    const manifest: VoiceManifest = { scenarioId: scn.id, engine: 'none', generatedAt: new Date().toISOString(), voiceEnabled: false, segments, cache: { hits: 0, misses: 0 } }
    writeJson(manifestFile, manifest)
    return manifest
  }

  const used = new Map<string, TtsEngine>()
  const engineFor = (v: VoiceConfig) => {
    const e = opts.engine ?? engineById(p, v.engine)
    used.set(e.id, e)
    return e
  }
  for (const v of [...new Set(items.map((i) => i.voice))].map(voiceConf)) await engineFor(v).check([v])

  interface Planned { seg: number; text: string; spoken: string; hash: string; wav: string; meta: string; voice: VoiceConfig; rate?: number; engine: TtsEngine }
  const planned: Planned[] = []
  for (const [segIdx, it] of items.entries()) {
    const voice = voiceConf(it.voice)
    if (voice.language !== it.language) {
      throw new StudioError(`La voix « ${it.voice} » (${voice.language}) ne correspond pas à la langue « ${it.language} » (${it.key})`)
    }
    const engine = engineFor(voice)
    const ver = await engine.version()
    for (const text of splitSentences(it.text)) {
      const spoken = pronounce(cfg, text, it.language)
      const hash = sha256(engine.id, ver, voice.model, engine.modelFingerprint(voice),
        (voice.rate || 1) * (it.rate || 1), voice.volume ?? 1, it.language, spoken).slice(0, 24)
      planned.push({ seg: segIdx, text, spoken, hash, wav: path.join(cacheDir, `${hash}.wav`),
        meta: path.join(cacheDir, `${hash}.json`), voice, rate: it.rate, engine })
    }
  }

  const missing = planned.filter((x) => opts.force || !existsSync(x.wav) || !existsSync(x.meta))
  const unique = [...new Map(missing.map((x) => [x.hash, x])).values()]
  if (unique.length) log(`synthèse de ${unique.length} phrase(s)…`)
  for (const engine of used.values()) {
    const reqs: TtsRequest[] = unique.filter((x) => x.engine === engine)
      .map((x) => ({ text: x.spoken, voice: x.voice, rate: x.rate, out: x.wav }))
    let results
    try {
      results = await engine.synthesize(reqs)
    } catch (e) {
      for (const r of reqs) if (existsSync(r.out)) unlinkSync(r.out)
      throw e instanceof StudioError ? e : new StudioError(`Échec de génération vocale : ${(e as Error).message}`)
    }
    for (const r of results) {
      const x = unique.find((u) => u.wav === r.out)!
      if (!existsSync(r.out)) throw new StudioError(`Fichier audio non produit : ${r.out}`)
      const meta: CacheMeta = { text: x.spoken, durationMs: await mediaDurationMs(r.out), alignments: r.alignments, engine: engine.id, createdAt: new Date().toISOString() }
      writeJson(x.meta, meta)
    }
  }

  const segments: VoiceSegment[] = []
  for (const [segIdx, it] of items.entries()) {
    const voice = voiceConf(it.voice)
    const mine = planned.filter((x) => x.seg === segIdx)
    let offset = it.pauseBeforeMs
    const sentences: VoiceSentence[] = []
    for (const [k, x] of mine.entries()) {
      if (!existsSync(x.wav)) throw new StudioError(`Fichier audio manquant après génération : ${x.wav}`)
      const meta = readJson<CacheMeta>(x.meta, 'métadonnées audio')
      const durationMs = await mediaDurationMs(x.wav)
      if (Math.abs(durationMs - meta.durationMs) > 20) {
        throw new StudioError(`Cache audio incohérent pour « ${x.text.slice(0, 40)}… » : relancer avec --force`)
      }
      sentences.push({ text: x.text, file: path.relative(p.dir, x.wav), hash: x.hash, offsetMs: offset, durationMs,
        words: estimateWords(x.text, durationMs), wordTiming: 'estimated' })
      offset += durationMs + (k < mine.length - 1 ? voice.sentenceGapMs : 0)
    }
    const speechMs = offset - it.pauseBeforeMs
    segments.push({ key: it.key, kind: it.kind, step: it.step, text: it.text, language: it.language, voice: it.voice,
      pauseBeforeMs: it.pauseBeforeMs, pauseAfterMs: it.pauseAfterMs, speechMs, totalMs: it.pauseBeforeMs + speechMs + it.pauseAfterMs, sentences })
  }

  const manifest: VoiceManifest = {
    scenarioId: scn.id, engine: [...used.keys()].join(','), generatedAt: new Date().toISOString(), voiceEnabled: true, segments,
    cache: { hits: planned.length - missing.length, misses: missing.length },
  }
  writeJson(manifestFile, manifest)
  return manifest
}

/** Durées minimales d'étape transmises au moteur (mode capture). */
export function holdsFromManifest(m: VoiceManifest): Record<number, number> {
  const out: Record<number, number> = {}
  for (const s of m.segments) if (s.kind === 'step' && s.step != null) out[s.step] = s.totalMs
  return out
}

/** Charge voice.json et vérifie qu'il correspond aux narrations actuelles du scénario. */
export function loadVoiceFor(p: Project, scn: VideoScenario): VoiceManifest | null {
  if (!scn.video.voiceEnabled) return null
  const m = readJson<VoiceManifest>(projectFiles(p).voice(scn.id), 'Manifeste de voix (lancer « video-studio audio »)')
  const expected = collectNarrations(p.config, scn).map((n) => `${n.key}:${n.text}`)
  const got = m.segments.map((s) => `${s.key}:${s.text}`)
  if (expected.join('\n') !== got.join('\n')) {
    throw new StudioError('Le manifeste de voix ne correspond plus au scénario (texte modifié) : relancer « video-studio audio »')
  }
  for (const seg of m.segments) for (const s of seg.sentences) {
    if (s.file && !existsSync(path.join(p.dir, s.file))) throw new StudioError(`Fichier audio manquant : ${s.file} — relancer « video-studio audio »`)
  }
  return m
}
