// Enregistrement automatique d'un scénario dans l'application réelle.
//
// build + serveur local → Chromium (viewport du gabarit, service workers
// bloqués, horloge/géolocalisation simulées, notifications refusées) → réseau
// déterministe (fixtures + cache HAR, APIs d'IA bloquées) → injection de la
// requête de capture (pilote engine) ou du moteur video-studio (pilote runtime)
// → screencast CDP horodaté → attente de la fin RÉELLE → MP4 30 i/s constants
// → repérage de la mire → contrôles de complétude → capture.json.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { Project } from './config'
import type { CaptureEvent, CaptureManifest, CaptureRequest, DemoEvent, DemoRunResult, NetworkReport, VideoScenario } from './types'
import { holdsFromManifest, loadVoiceFor } from './generate-voice'
import { PKG_DIR, projectFiles, projectPaths, rel } from './lib/paths'
import { buildApp, startApp, type AppServer } from './lib/server'
import { StudioError, ensureDir, runOk, sleep, writeJson } from './lib/util'

const EXTERNAL = /^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/

export interface RecordOptions {
  build?: boolean
  network?: 'replay' | 'refresh' | 'offline'
  headed?: boolean
  log?: (msg: string) => void
}

/** Bundle IIFE du moteur injecté (pilote runtime). */
export async function runtimeBundle(): Promise<string> {
  const { build } = await import('esbuild')
  const r = await build({
    stdin: { contents: "import { autoStart } from './engine'; autoStart()", resolveDir: path.join(PKG_DIR, 'src', 'runtime'), loader: 'ts' },
    bundle: true, format: 'iife', write: false, target: 'es2019', minify: false, legalComments: 'none',
  })
  return r.outputFiles[0].text
}

/** Repère la mire magenta dans la vidéo assemblée (image par image). */
export async function findSyncMark(mp4: string, fps: number): Promise<number | null> {
  const buf: Buffer = await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', mp4, '-t', '40', '-vf', 'scale=4:4:flags=area,format=rgb24', '-f', 'rawvideo', '-'])
    const chunks: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => chunks.push(d))
    p.on('error', reject)
    p.on('close', () => resolve(Buffer.concat(chunks)))
  })
  const frame = 48
  for (let f = 0; f * frame < buf.length; f++) {
    let rr = 0, gg = 0, bb = 0
    for (let k = 0; k < 16; k++) { rr += buf[f * frame + k * 3]; gg += buf[f * frame + k * 3 + 1]; bb += buf[f * frame + k * 3 + 2] }
    if (rr / 16 > 200 && gg / 16 < 70 && bb / 16 > 200) return f / fps
  }
  return null
}

export async function record(p: Project, scn: VideoScenario, opts: RecordOptions = {}): Promise<CaptureManifest> {
  const cfg = p.config
  const cap = cfg.capture
  const fps = cfg.output.fps
  const files = projectFiles(p)
  const P = projectPaths(p)
  const log = opts.log ?? (() => {})
  const voice = loadVoiceFor(p, scn)
  const holdMs = voice ? holdsFromManifest(voice) : undefined
  const drv = cfg.driver
  const G = drv.type === 'engine' ? drv.globals
    : { request: '__VIDEO_RUNTIME__', events: '__VIDEO_CAPTURE_EVENTS__', result: '__VIDEO_CAPTURE_RESULT__', stop: '', realClock: '__VIDEO_REAL_CLOCK__' }

  const dir = P.recording(scn.id)
  const framesDir = path.join(dir, 'frames')
  rmSync(dir, { recursive: true, force: true })
  ensureDir(framesDir)
  ensureDir(P.networkCache)

  let mode = opts.network ?? cfg.network.mode
  const har = files.har(scn.id)
  if (mode === 'replay' && !existsSync(har)) {
    log(`cache réseau absent → première prise en mode « refresh » (${rel(p, har)})`)
    mode = 'refresh'
  }
  const network: NetworkReport = { mode, fixtures: [], harHits: 0, blocked: [], failed: [] }
  const seed = { ...(cfg.preseed?.(scn, { root: p.root }) ?? {}), ...(scn.video.seed ?? {}) }
  const pageErrors: string[] = []
  const frames: { file: string; ts: number }[] = []
  let server: AppServer | null = null
  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  const base = {
    scenarioId: scn.id, recordedAt: new Date().toISOString(), driver: drv.type,
    viewport: { ...cap.viewport, deviceScaleFactor: cap.deviceScaleFactor }, clock: scn.video.clock ?? null, network,
  }
  const failReport = async (message: string, extra: Partial<CaptureManifest> = {}): Promise<never> => {
    if (page && !page.isClosed()) { try { await page.screenshot({ path: path.join(dir, 'failure.png') }) } catch { /* ignore */ } }
    writeJson(files.capture(scn.id), { ...base, ok: false, error: message, pageErrors, video: null, sync: null, events: [], storeRestored: null, ...extra })
    throw new StudioError(`Capture échouée : ${message}`, { report: rel(p, files.capture(scn.id)), pageErrors })
  }
  const onSigint = () => { void browser?.close().catch(() => {}); server?.stop() }
  process.once('SIGINT', onSigint)

  try {
    if (opts.build !== false && cfg.app.build) { log(`build : ${cfg.app.build}`); await buildApp(p) }
    server = await startApp(p)
    browser = await chromium.launch({ headless: !opts.headed })
    const loc = scn.video.location
    context = await browser.newContext({
      viewport: cap.viewport, deviceScaleFactor: cap.deviceScaleFactor, isMobile: cap.isMobile, hasTouch: cap.isMobile,
      serviceWorkers: 'block', locale: cap.locale, timezoneId: scn.video.timezone ?? cap.timezone,
      ...(loc ? { geolocation: { latitude: loc.lat, longitude: loc.lng }, permissions: ['geolocation'] } : {}),
      colorScheme: cap.colorScheme, reducedMotion: 'no-preference',
    })

    // ── Réseau déterministe (dernière route enregistrée = prioritaire) ──────
    if (mode === 'refresh') await context.routeFromHAR(har, { url: EXTERNAL, update: true, updateContent: 'embed', updateMode: 'minimal' })
    else if (mode === 'replay') await context.routeFromHAR(har, { url: EXTERNAL, notFound: 'abort' })
    else await context.route(EXTERNAL, (r) => { network.blocked.push(r.request().url()); return r.abort('blockedbyclient') })
    for (const fx of cfg.network.fixtures) {
      const body = readFileSync(path.join(cfg.network.fixturesDir, fx.file))
      await context.route(fx.match, (r) => {
        if (!network.fixtures.includes(fx.id)) network.fixtures.push(fx.id)
        return r.fulfill({ status: 200, contentType: fx.contentType, body, headers: { 'access-control-allow-origin': '*' } })
      })
    }
    for (const h of cfg.network.blockedHosts) {
      await context.route(h, (r) => { network.blocked.push(r.request().url()); return r.abort('blockedbyclient') })
    }

    // ── Injection avant chargement ─────────────────────────────────────────
    const request: CaptureRequest = {
      scenario: { name: scn.scenario.name, label: scn.scenario.label, steps: scn.scenario.steps },
      options: { holdMs, speed: scn.video.speed ?? 1, syncMark: true, stepTimeoutMs: cap.stepTimeoutMs, breathMs: cap.breathMs, showNarration: false },
      seed: scn.video.seed ?? {},
    }
    const injected = drv.type === 'engine' ? request : {
      ...request, targetAttribute: drv.targetAttribute, loadingSelector: drv.loadingSelector,
      accent: cfg.theme.colors.accent, accentInk: cfg.theme.colors.accentInk, startDelayMs: drv.startDelayMs,
    }
    // tsx/esbuild (keepNames) insère des appels __name() dans les fonctions sérialisées.
    await context.addInitScript('window.__name = window.__name || ((f) => f)')
    await context.addInitScript(({ req, keys, G }) => {
      const perf = performance
      Object.defineProperty(window, G.realClock, { value: { now: perf.now.bind(perf), origin: perf.timeOrigin } })
      ;(window as unknown as Record<string, unknown>)[G.request] = req
      if (!sessionStorage.getItem('__vs_preseeded')) {
        for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v as string)
        sessionStorage.setItem('__vs_preseeded', '1')
      }
      try { Object.defineProperty(Notification, 'permission', { get: () => 'denied' }) } catch { /* ignore */ }
    }, { req: injected, keys: seed, G })
    if (drv.type === 'runtime') await context.addInitScript(await runtimeBundle())

    page = await context.newPage()
    if (scn.video.clock) await page.clock.install({ time: new Date(scn.video.clock) })
    page.on('pageerror', (e) => pageErrors.push(e.message))
    page.on('dialog', (d) => void d.dismiss())
    page.on('requestfinished', (r) => {
      const u = r.url()
      if (EXTERNAL.test(u) && !cfg.network.fixtures.some((f) => f.match.test(u))) network.harHits++
    })
    page.on('requestfailed', (r) => {
      const u = r.url()
      if (!network.blocked.includes(u)) network.failed.push(`${u.slice(0, 140)} — ${r.failure()?.errorText ?? '?'}`)
    })
    let crashed = false
    page.on('crash', () => { crashed = true })

    // ── Screencast CDP ─────────────────────────────────────────────────────
    const cdp = await context.newCDPSession(page)
    let n = 0
    cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const file = path.join(framesDir, `${String(++n).padStart(6, '0')}.jpg`)
      writeFileSync(file, Buffer.from(f.data, 'base64'))
      frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 })
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: cap.jpegQuality, everyNthFrame: 1,
      maxWidth: Math.round(cap.viewport.width * cap.deviceScaleFactor), maxHeight: Math.round(cap.viewport.height * cap.deviceScaleFactor),
    })

    log('lecture du scénario dans le navigateur…')
    await page.goto(`${server.url}${drv.url ?? '/'}`, { waitUntil: 'load' })

    // ── Attente de la fin réelle ───────────────────────────────────────────
    const t0 = Date.now()
    let result: DemoRunResult | null = null
    let lastStep = -1
    while (!result) {
      if (crashed || page.isClosed()) await failReport('capture interrompue (page fermée ou plantée)')
      if (Date.now() - t0 > cap.maxDurationMs) await failReport(`délai global dépassé (${cap.maxDurationMs} ms)`)
      const state = await page.evaluate((G) => {
        const w = window as unknown as Record<string, unknown>
        const evs = (w[G.events] as DemoEvent[] | undefined) ?? []
        const lastStart = [...evs].reverse().find((e) => e.type === 'step:start')
        return { result: (w[G.result] as DemoRunResult | null | undefined) ?? null, step: lastStart?.step ?? -1, started: Array.isArray(w[G.events]) }
      }, G).catch(() => ({ result: null, step: -1, started: false }))
      if (!state.started && Date.now() - t0 > 20000) await failReport('le moteur de capture ne s’est pas lancé (requête non reçue par l’application ?)')
      if (state.step !== lastStep) { lastStep = state.step; log(`étape ${state.step + 1}/${scn.scenario.steps.length}`) }
      result = state.result
      if (!result) await sleep(250)
    }

    await sleep(cap.tailMs)
    const events = await page.evaluate((G) => (window as unknown as Record<string, DemoEvent[]>)[G.events], G)
    await cdp.send('Page.stopScreencast').catch(() => {})
    const endTs = Date.now() / 1000
    if (!result.ok) await failReport(`étape ${(result.step ?? 0) + 1} — ${result.error ?? 'erreur inconnue'}`, { failedStep: result.step, events: events as CaptureEvent[] })
    if (pageErrors.length) log(`⚠ erreurs JavaScript de la page : ${pageErrors.length}`)

    // ── Restauration du store (moteur de l'app) ────────────────────────────
    let storeRestored: boolean | null = null
    if (drv.type === 'engine' && cfg.verifyRestore) {
      const { prefix } = cfg.verifyRestore
      const ignoreSrc = cfg.verifyRestore.ignore?.toString() ?? null
      storeRestored = await page.evaluate(({ expected, prefix, stop, ignoreSrc }) => {
        ;((window as unknown as Record<string, (() => void) | undefined>)[stop])?.()
        // eslint-disable-next-line no-new-func
        const ignore = ignoreSrc ? (new Function(`return (${ignoreSrc})`)() as (k: string) => boolean) : () => false
        const now: Record<string, string> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!
          if (k.startsWith(prefix)) now[k] = localStorage.getItem(k)!
        }
        const a = Object.keys(now).filter((k) => !ignore(k)).sort()
        const b = Object.keys(expected).filter((k) => k.startsWith(prefix) && !ignore(k)).sort()
        return a.join() === b.join() && b.every((k) => now[k] === expected[k])
      }, { expected: seed, prefix, stop: G.stop, ignoreSrc })
    }

    await context.close(); context = null   // écrit le HAR en mode refresh
    await browser.close(); browser = null
    server.stop(); server = null

    // ── Assemblage MP4 30 i/s constants ────────────────────────────────────
    if (frames.length < 2) await failReport('aucune image capturée')
    const first = frames[0].ts
    const lines = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
      const next = i + 1 < frames.length ? frames[i + 1].ts : endTs
      lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${Math.max(0.001, next - frames[i].ts).toFixed(6)}`)
    }
    lines.push(`file '${path.basename(frames.at(-1)!.file)}'`)
    const list = path.join(framesDir, 'list.ffconcat')
    writeFileSync(list, lines.join('\n') + '\n')
    const mp4 = files.screen(scn.id)
    log(`assemblage de ${frames.length} images…`)
    await runOk('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-movflags', '+faststart', mp4])
    const durationS = endTs - first
    const W = Math.round(cap.viewport.width * cap.deviceScaleFactor / 2) * 2
    const H = Math.round(cap.viewport.height * cap.deviceScaleFactor / 2) * 2

    // ── Synchronisation ───────────────────────────────────────────────────
    const mark = events.find((e) => e.type === 'sync:mark')
    if (!mark) await failReport('événement sync:mark absent')
    const scanned = await findSyncMark(mp4, fps)
    const byTs = mark!.epoch / 1000 - first
    const markVideoT = scanned ?? byTs
    if (scanned == null) log('⚠ mire non détectée dans l’image : synchronisation par horodatage')
    const capEvents: CaptureEvent[] = events.map((e) => ({ ...e, videoT: +(markVideoT + (e.t - mark!.t) / 1000).toFixed(4) }))

    const missing = scn.scenario.steps.map((_, i) => i).filter((i) =>
      !capEvents.some((e) => e.type === 'step:start' && e.step === i) || !capEvents.some((e) => e.type === 'step:end' && e.step === i))
    if (missing.length) await failReport(`étapes incomplètes : ${missing.join(', ')}`)
    if (!capEvents.some((e) => e.type === 'scenario:end')) await failReport('scenario:end absent')
    rmSync(framesDir, { recursive: true, force: true })

    const manifest: CaptureManifest = {
      ...base, ok: true,
      video: { file: path.basename(mp4), width: W, height: H, fps, durationS: +durationS.toFixed(3), frames: Math.round(durationS * fps) },
      sync: { markVideoT: +markVideoT.toFixed(4), method: scanned != null ? 'frame-scan' : 'timestamps', screencastDriftMs: scanned != null ? Math.round((scanned - byTs) * 1000) : null },
      events: capEvents, network, storeRestored,
    }
    writeJson(files.capture(scn.id), { ...manifest, pageErrors })
    if (storeRestored === false) throw new StudioError('Le localStorage n’a pas été restauré à l’identique après la démo')
    return manifest
  } finally {
    process.removeListener('SIGINT', onSigint)
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    server?.stop()
  }
}
