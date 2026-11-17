// Rendu final avec Remotion (H.264 + AAC) puis vérification de l'export :
// codec, résolution, cadence, présence et niveau de l'audio, durée attendue,
// décodage complet. Un export qui échoue n'est jamais publié.
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Project } from './config'
import type { Timeline, VideoScenario } from './types'
import { PKG_DIR, projectFiles, projectPaths, rel, studioHome } from './lib/paths'
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

const pkgRequire = createRequire(path.join(PKG_DIR, 'package.json'))

/**
 * Feuille de style de police du thème, en chemin absolu : cherchée dans le projet,
 * puis dans les dépendances de video-studio (le projet n'a pas à installer quoi que ce soit).
 */
function resolveFontCss(p: Project, f: string): string {
  if (f.startsWith('.')) return path.resolve(p.dir, f)
  if (path.isAbsolute(f)) return f
  for (const req of [createRequire(path.join(p.root, 'package.json')), pkgRequire]) {
    try { return req.resolve(f) } catch { /* suivant */ }
  }
  throw new StudioError(`Police introuvable : ${f}`, 'Installer le paquet de police dans le projet, ou retirer theme.fontCss.')
}

/** Point d'entrée Remotion propre au projet : polices du thème + composition du paquet. */
export function writeEntry(p: Project, scn: VideoScenario): string {
  const entry = path.join(projectPaths(p).build(scn.id), 'entry.ts')
  const fonts = p.config.theme.fontCss.map((f) => `import ${JSON.stringify(resolveFontCss(p, f))}`)
  // `remotion` par le dossier du paquet (pas le fichier) : webpack le résout comme
  // l'import nu de la composition, donc une seule instance.
  const remotionDir = path.dirname(pkgRequire.resolve('remotion/package.json'))
  writeFileSync(entry, [
    '// Généré par video-studio — ne pas modifier.',
    ...fonts,
    `import { registerRoot } from ${JSON.stringify(remotionDir)}`,
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

/** Erreurs Remotion qu'un nouvel essai, moins gourmand, règle en général. */
function isTransientRenderError(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err)
  return /delayRender|timeout|Target closed|Request closed|Could not extract frame|ProtocolError/i.test(m)
}

/**
 * Dossier Remotion partagé par tous les projets : navigateur de rendu et cache webpack.
 * Remotion range l'un et l'autre près du package.json le plus proche ; ce dossier a le
 * sien, pour que rien ne soit écrit dans le projet.
 */
function remotionHome(): string {
  const dir = path.join(studioHome(), 'remotion')
  mkdirSync(dir, { recursive: true })
  const pkg = path.join(dir, 'package.json')
  if (!existsSync(pkg)) writeFileSync(pkg, '{ "private": true, "description": "Navigateur de rendu et cache Remotion partagés par video-studio" }\n')
  return dir
}

/**
 * Chrome Headless Shell de Remotion (~100 Mo), partagé par tous les projets dans
 * <studioHome>/remotion/.remotion. Remotion le range près du package.json du dossier
 * courant : on lui fournit le nôtre le temps du téléchargement, puis on passe le chemin
 * de l'exécutable au rendu. Appelé par `setup` et avant chaque rendu.
 */
export async function ensureRemotionBrowser(log: (m: string) => void): Promise<string> {
  const { ensureBrowser } = await import('@remotion/renderer')
  const dir = remotionHome()
  const cwd = process.cwd()
  let last = -25
  process.chdir(dir)
  try {
    const status = await ensureBrowser({
      onBrowserDownload: () => {
        log('téléchargement de Chrome Headless Shell pour Remotion (~100 Mo, une fois par machine)…')
        return {
          version: null,
          onProgress: ({ percent }) => {
            const pct = Math.floor(percent <= 1 ? percent * 100 : percent)
            if (pct >= last + 25) { last = pct; log(`téléchargement ${pct} %`) }
          },
        }
      },
    })
    if (!('path' in status)) throw new StudioError('Navigateur de rendu Remotion indisponible')
    return status.path
  } finally {
    process.chdir(cwd)
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
  const serveUrl = await bundle({ entryPoint: entry, publicDir: pub, outDir: path.join(P.build(scn.id), 'bundle'), rootDir: remotionHome() })
  const inputProps = tl as unknown as Record<string, unknown>
  const browserExecutable = await ensureRemotionBrowser(log)
  const composition = await selectComposition({ serveUrl, id: 'VideoStudioTutorial', inputProps, browserExecutable })
  ensureDir(P.output)
  const mp4 = files.mp4(scn.id)
  const tmp = `${mp4}.partial.mp4`
  rmSync(tmp, { force: true })
  const out = p.config.output
  const attempt = (concurrency: number, timeoutInMilliseconds: number) => {
    let lastPct = -10
    return renderMedia({
      composition, serveUrl, inputProps, codec: 'h264', audioCodec: 'aac', crf: out.crf,
      pixelFormat: 'yuv420p', outputLocation: tmp, concurrency, timeoutInMilliseconds, chromiumOptions: { gl: 'swangle' }, browserExecutable,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100)
        if (pct >= lastPct + 10) { lastPct = pct; log(`rendu ${pct} %`) }
      },
    })
  }
  try {
    await attempt(out.concurrency, out.timeoutMs)
  } catch (err) {
    // Délai dépassé ou onglet fermé : presque toujours un manque de mémoire.
    // Un seul onglet et un délai doublé suffisent en général.
    if (!isTransientRenderError(err)) throw err
    log(`rendu interrompu (${String((err as Error).message ?? err).split('\n')[0].slice(0, 140)}) → nouvel essai : 1 onglet, délai ${(out.timeoutMs * 2) / 1000} s`)
    rmSync(tmp, { force: true })
    try { await attempt(1, out.timeoutMs * 2) } catch (err2) {
      throw new StudioError(`Rendu Remotion impossible : ${(err2 as Error).message?.split('\n')[0] ?? err2}`,
        'Mémoire insuffisante ? Fermer d’autres applications ou fixer output.concurrency: 1 dans la configuration.')
    }
  }

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
