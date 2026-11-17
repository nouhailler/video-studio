// video-studio — interface en ligne de commande.
//
//   video-studio list | validate | audio | record | timeline | render | generate | preview
//     --scenario <id> [--config video/video.config.ts] [--force] [--no-build]
//     [--network replay|refresh|offline] [--headed]
//   video-studio setup        installe Piper, les voix et Chromium (une fois par machine)
//   video-studio init         crée video/video.config.ts et un premier scénario
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { loadProject, type Project } from './config'
import type { VideoScenario } from './types'
import { buildTimeline } from './build-timeline'
import { generateVoice } from './generate-voice'
import { init } from './init'
import { findScenario } from './lib/narration'
import { PKG_DIR, projectFiles, rel } from './lib/paths'
import { StudioError, fmtMs, hasBinary, parseArgs, writeJson } from './lib/util'
import { record } from './record'
import { ensureRemotionBrowser, preparePublicDir, render, writeEntry } from './render'
import { validateScenario } from './validate'

const C = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`, gold: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`, red: (s: string) => `\x1b[31m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

async function stage<T>(i: number, n: number, label: string, fn: (log: (m: string) => void) => Promise<T>): Promise<T> {
  const head = `[${i}/${n}] ${label}`.padEnd(40)
  const t0 = Date.now()
  process.stdout.write(head)
  let dirty = false
  const log = (m: string) => { if (!dirty) { process.stdout.write('\n'); dirty = true } console.log(C.dim(`      · ${m}`)) }
  try {
    const r = await fn(log)
    const took = C.dim(`(${fmtMs(Date.now() - t0)})`)
    console.log(dirty ? `${' '.repeat(40)}${C.green('OK')} ${took}` : `${C.green('OK')} ${took}`)
    return r
  } catch (e) {
    console.log(dirty ? `${' '.repeat(40)}${C.red('ÉCHEC')}` : C.red('ÉCHEC'))
    throw e
  }
}

async function preflight() {
  for (const b of ['ffmpeg', 'ffprobe']) if (!(await hasBinary(b))) throw new StudioError(`${b} introuvable dans le PATH (ex. sudo apt install ffmpeg)`)
}

function doValidate(p: Project, scn: VideoScenario, log: (m: string) => void) {
  const r = validateScenario(p, scn)
  for (const w of r.warnings) log(`⚠ ${w}`)
  if (!r.ok) throw new StudioError(`Scénario invalide :\n${r.errors.map((e) => `  ✗ ${e}`).join('\n')}`)
  log(`${r.stats.steps} étapes, ${r.stats.narrations} narrations, durée estimée ≈ ${fmtMs(r.stats.estimatedMs)}`)
}

async function doAudio(p: Project, scn: VideoScenario, force: boolean, log: (m: string) => void) {
  const m = await generateVoice(p, scn, { force, log })
  log(`${m.segments.length} narrations, voix ${fmtMs(m.segments.reduce((s, x) => s + x.totalMs, 0))} · cache : ${m.cache.hits} réutilisé(s), ${m.cache.misses} généré(s)`)
}

function runSetup(args: ReturnType<typeof parseArgs>): Promise<number> {
  return new Promise((resolve) => {
    const extra = typeof args.voices === 'string' ? [args.voices] : []
    const playwrightCli = path.join(path.dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js')
    const env = { ...process.env, PLAYWRIGHT_CLI: playwrightCli, ...(typeof args.dir === 'string' ? { VIDEO_STUDIO_HOME: path.resolve(args.dir) } : {}) }
    spawn('bash', [path.join(PKG_DIR, 'scripts', 'setup.sh'), ...extra], { stdio: 'inherit', env }).on('close', (c) => resolve(c ?? 1))
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  console.log(`\n${C.bold(C.gold('VIDEO STUDIO'))}`)

  if (cmd === 'setup') {
    process.exitCode = await runSetup(args)
    if (process.exitCode === 0) {
      console.log('→ Chrome Headless Shell pour Remotion')
      try { await ensureRemotionBrowser((m) => console.log(`  ${m}`)); console.log('✓ navigateur de rendu prêt.') } catch (e) {
        console.log(`⚠ navigateur de rendu non installé (${(e as Error).message}) : il sera téléchargé au premier rendu`)
      }
    }
    return
  }
  if (cmd === 'init') { await init(process.cwd(), { force: !!args.force, layout: args.layout as 'phone' | 'desktop' | undefined }); return }
  if (!cmd || !['list', 'validate', 'audio', 'record', 'timeline', 'render', 'generate', 'preview'].includes(cmd)) {
    console.log('\nCommandes : setup | init | list | validate | audio | record | timeline | render | generate | preview')
    console.log(C.dim('Options   : --scenario <id> [--config <fichier>] [--force] [--no-build] [--network replay|refresh|offline] [--headed]'))
    if (cmd) process.exitCode = 1
    return
  }

  const p = await loadProject(typeof args.config === 'string' ? args.config : undefined)
  console.log(C.dim(`${p.config.name} · ${rel(p, p.configFile)}\n`))
  const files = projectFiles(p)
  const recordOpts = (log: (m: string) => void) => ({ build: args['no-build'] !== true, network: args.network as 'replay' | undefined, headed: !!args.headed, log })

  if (cmd === 'list') {
    for (const s of p.config.scenarios) {
      const st = [existsSync(files.voice(s.id)) && 'voix', existsSync(files.capture(s.id)) && 'capture', existsSync(files.mp4(s.id)) && 'MP4'].filter(Boolean).join(', ')
      console.log(`  ${C.bold(s.id.padEnd(28))} ${s.video.title}`)
      console.log(C.dim(`  ${''.padEnd(28)} ${s.scenario.steps.length} étapes · ${s.video.language} · ${st || 'rien de produit'}`))
    }
    return
  }

  const scn = findScenario(p.config, args.scenario)
  switch (cmd) {
    case 'validate':
      await stage(1, 1, 'Validation du scénario', async (log) => doValidate(p, scn, log))
      return
    case 'audio':
      await preflight()
      await stage(1, 1, 'Génération de la voix', (log) => doAudio(p, scn, !!args.force, log))
      return
    case 'record': {
      await preflight()
      const m = await stage(1, 1, 'Enregistrement du parcours', (log) => record(p, scn, recordOpts(log)))
      console.log(`\n${C.dim(rel(p, files.screen(scn.id)))} — ${m.video.durationS} s, synchro ${m.sync.method}`)
      return
    }
    case 'timeline':
      await stage(1, 1, 'Construction de la chronologie', async (log) => buildTimeline(p, scn, { log }))
      return
    case 'render': {
      await preflight()
      await stage(1, 2, 'Composition de la vidéo', async (log) => buildTimeline(p, scn, { log }))
      const out = await stage(2, 2, 'Exportation MP4', (log) => render(p, scn, { log }))
      console.log(`\nVidéo générée :\n${C.bold(rel(p, out.mp4))}`)
      return
    }
    case 'generate': {
      await preflight()
      const N = 6
      await stage(1, N, 'Validation du scénario', async (log) => doValidate(p, scn, log))
      await stage(2, N, 'Préparation des données', async (log) => {
        log(`horloge ${scn.video.clock ?? 'réelle'} · ${scn.video.location?.city ?? 'position non simulée'} · réseau ${args.network ?? p.config.network.mode} · pilote ${p.config.driver.type}`)
      })
      await stage(3, N, 'Génération de la voix', (log) => doAudio(p, scn, !!args.force, log))
      await stage(4, N, 'Enregistrement du parcours', (log) => record(p, scn, recordOpts(log)))
      await stage(5, N, 'Composition de la vidéo', async (log) => buildTimeline(p, scn, { log }))
      const out = await stage(6, N, 'Exportation MP4', (log) => render(p, scn, { log }))
      console.log(`\nVidéo générée :\n${C.bold(rel(p, out.mp4))}`)
      console.log(C.dim(`Sous-titres : ${rel(p, out.srt)} · ${rel(p, out.vtt)}\nChapitres  : ${rel(p, out.chapters)}\nRapport    : ${rel(p, out.report)}`))
      return
    }
    case 'preview': {
      if (!existsSync(files.timeline(scn.id))) await stage(1, 1, 'Construction de la chronologie', async (log) => buildTimeline(p, scn, { log }))
      const pub = await preparePublicDir(p, scn)
      const entry = writeEntry(p, scn)
      console.log(C.dim('Remotion Studio — Ctrl+C pour quitter'))
      const cliDir = path.dirname(createRequire(import.meta.url).resolve('@remotion/cli/package.json'))
      spawn(process.execPath, [path.join(cliDir, 'remotion-cli.js'), 'studio', entry, `--props=${files.timeline(scn.id)}`, `--public-dir=${pub}`],
        { stdio: 'inherit', cwd: p.root })
      return
    }
  }
}

main().catch(async (e) => {
  const err = e as StudioError
  console.error(`\n${C.red('✗ Production interrompue')} : ${err.message}`)
  if (err.details) console.error(C.dim(typeof err.details === 'string' ? err.details : JSON.stringify(err.details, null, 2)))
  const args = parseArgs(process.argv.slice(2))
  if (typeof args.scenario === 'string') {
    try {
      const p = await loadProject(typeof args.config === 'string' ? args.config : undefined)
      const f = projectFiles(p).report(args.scenario)
      writeJson(f, { ok: false, error: err.message, details: err.details ?? null, at: new Date().toISOString() })
      console.error(C.dim(`Rapport : ${rel(p, f)}`))
    } catch { /* configuration illisible : pas de rapport */ }
  }
  process.exitCode = 1
})
