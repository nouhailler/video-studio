// Rendu final avec Remotion (H.264 + AAC) puis vérification de l'export :
// codec, résolution, cadence, présence et niveau de l'audio, durée attendue,
// décodage complet. Un export qui échoue n'est jamais publié.
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Project } from './config'
import type { Timeline, VideoScenario } from './types'
import { PKG_DIR, projectFiles, projectPaths, rel } from './lib/paths'
import { StudioError, ensureDir, ffprobe, readJson, run, writeJson } from './lib/util'

export interface RenderOptions { log?: (m: string) => void }
export interface RenderOutput { mp4: string; srt: string; vtt: string; chapters: string; report: string }

/** Médias servis à Remotion (staticFile) : build/<id>/public. */
export async function preparePublicDir(p: Project, scn: VideoScenario): Promise<string> {
  const files = projectFiles(p)
  const pub = path.join(projectPaths(p).build(scn.id), 'public')
  rmSync(pub, { recursive: true, force: true })
  ensureDir(path.join(pub, 'audio'))
  const screen = files.screen(scn.id)
  if (!existsSync(screen)) throw new StudioError(`Enregistrement absent : ${rel(p, screen)} (lancer « video-studio record »)`)
  copyFileSync(screen, path.join(pub, 'screen.mp4'))
  const tl = readJson<Timeline>(files.timeline(scn.id), 'Chronologie')
  for (const s of tl.sentences) {
    if (!s.src) continue
    const src = path.join(projectPaths(p).ttsCache, path.basename(s.src))
    if (!existsSync(src)) throw new StudioError(`Fichier audio manquant : ${rel(p, src)} (relancer « video-studio audio »)`)
    copyFileSync(src, path.join(pub, s.src))
  }
  const { logoPath, logo } = p.config.theme
  if (logoPath && logo) {
    if (!existsSync(logoPath)) throw new StudioError(`Logo introuvable : ${logoPath}`)
    copyFileSync(logoPath, path.join(pub, logo))
  }
  return pub
}

/** Point d'entrée Remotion propre au projet : polices du thème + composition du paquet. */
export function writeEntry(p: Project, scn: VideoScenario): string {
  const entry = path.join(projectPaths(p).build(scn.id), 'entry.ts')
  const fonts = p.config.theme.fontCss.map((f) => {
    const spec = f.startsWith('.') ? path.resolve(p.dir, f) : f
    return `import ${JSON.stringify(spec)}`
  })
  writeFileSync(entry, [
    '// Généré par video-studio — ne pas modifier.',
    ...fonts,
    "import { registerRoot } from 'remotion'",
    `import { Root } from ${JSON.stringify(path.join(PKG_DIR, 'src', 'compositions', 'Root'))}`,
    'registerRoot(Root)',
    '',
  ].join('\n'))
  return entry
}

async function meanVolumeDb(file: string): Promise<number> {
  const r = await run('ffmpeg', ['-v', 'info', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'])
  const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)
  return m ? Number(m[1]) : -Infinity
}

export interface ExportCheck { ok: boolean; problems: string[]; facts: Record<string, unknown> }

export async function verifyExport(mp4: string, tl: Timeline): Promise<ExportCheck> {
  const problems: string[] = []
  const pr = await ffprobe(mp4)
  const v = pr.streams.find((s) => s.codec_type === 'video')
  const a = pr.streams.find((s) => s.codec_type === 'audio')
  const duration = Number(pr.format.duration)
  const expected = tl.durationInFrames / tl.fps
  if (!v) problems.push('aucune piste vidéo')
  else {
    if (v.codec_name !== 'h264') problems.push(`codec vidéo ${v.codec_name} ≠ h264`)
    if (v.width !== tl.width || v.height !== tl.height) problems.push(`résolution ${v.width}×${v.height} ≠ ${tl.width}×${tl.height}`)
    const [num, den] = (v.r_frame_rate ?? '0/1').split('/').map(Number)
    if (Math.abs(num / den - tl.fps) > 0.01) problems.push(`cadence ${v.r_frame_rate} ≠ ${tl.fps}`)
  }
  let vol: number | null = null
  if (tl.sentences.some((s) => s.src)) {
    if (!a) problems.push('aucune piste audio alors que la narration est activée')
    else {
      if (a.codec_name !== 'aac') problems.push(`codec audio ${a.codec_name} ≠ aac`)
      vol = await meanVolumeDb(mp4)
      if (vol < -45) problems.push(`piste audio quasi muette (${vol} dB)`)
    }
  }
  if (Math.abs(duration - expected) > 0.15) problems.push(`durée ${duration.toFixed(2)} s ≠ attendue ${expected.toFixed(2)} s (séquence manquante ?)`)
  const dec = await run('ffmpeg', ['-v', 'error', '-i', mp4, '-f', 'null', '-'])
  if (dec.code !== 0 || dec.stderr.trim()) problems.push(`erreurs de décodage : ${dec.stderr.trim().slice(0, 300)}`)
  return {
    ok: problems.length === 0, problems,
    facts: { durationS: +duration.toFixed(3), expectedS: +expected.toFixed(3), video: v ? `${v.codec_name} ${v.width}×${v.height} @ ${v.r_frame_rate}` : null,
      audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : null, meanVolumeDb: vol },
  }
}

export async function render(p: Project, scn: VideoScenario, opts: RenderOptions = {}): Promise<RenderOutput> {
  const log = opts.log ?? (() => {})
  const files = projectFiles(p)
  const P = projectPaths(p)
  const tl = readJson<Timeline>(files.timeline(scn.id), 'Chronologie')
  const pub = await preparePublicDir(p, scn)
  const entry = writeEntry(p, scn)
  const { bundle } = await import('@remotion/bundler')
  const { renderMedia, selectComposition } = await import('@remotion/renderer')

  log('préparation de la composition (bundle Remotion)…')
  const serveUrl = await bundle({ entryPoint: entry, publicDir: pub, outDir: path.join(P.build(scn.id), 'bundle') })
  const inputProps = tl as unknown as Record<string, unknown>
  const composition = await selectComposition({ serveUrl, id: 'VideoStudioTutorial', inputProps })
  ensureDir(P.output)
  const mp4 = files.mp4(scn.id)
  const tmp = `${mp4}.partial.mp4`
  rmSync(tmp, { force: true })
  let lastPct = -10
  await renderMedia({
    composition, serveUrl, inputProps, codec: 'h264', audioCodec: 'aac', crf: p.config.output.crf,
    pixelFormat: 'yuv420p', outputLocation: tmp, concurrency: p.config.output.concurrency, chromiumOptions: { gl: 'swangle' },
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100)
      if (pct >= lastPct + 10) { lastPct = pct; log(`rendu ${pct} %`) }
    },
  })

  const check = await verifyExport(tmp, tl)
  writeJson(files.report(scn.id), {
    ok: check.ok, scenario: scn.id, title: scn.video.title, at: new Date().toISOString(), output: rel(p, mp4),
    checks: check, chapters: tl.chapters.length, cues: tl.cues.length, sentences: tl.sentences.length,
  })
  if (!check.ok) throw new StudioError(`Export refusé :\n${check.problems.map((x) => `  ✗ ${x}`).join('\n')}`, { partial: rel(p, tmp) })
  rmSync(mp4, { force: true })
  copyFileSync(tmp, mp4)
  rmSync(tmp, { force: true })
  log(`${check.facts.video} · ${check.facts.audio ?? 'sans audio'} · ${check.facts.durationS} s`)
  return { mp4, srt: files.srt(scn.id), vtt: files.vtt(scn.id), chapters: files.chapters(scn.id), report: files.report(scn.id) }
}
