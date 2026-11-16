// Build de l'application puis service local pour la capture : serveur
// statique intégré (staticDir, repli SPA) ou commande fournie par l'app.
import { spawn, type ChildProcess } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { Project } from '../config'
import { StudioError, run, sleep } from './util'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.wasm': 'application/wasm', '.mp4': 'video/mp4',
}

export async function buildApp(p: Project): Promise<void> {
  const cmd = p.config.app.build
  if (!cmd) return
  const r = await run('sh', ['-c', cmd], { cwd: p.root })
  if (r.code !== 0) throw new StudioError(`Build de l’application échoué (« ${cmd} »)`, (r.stderr || r.stdout).slice(-3000))
}

export interface AppServer { url: string; stop: () => void }

function serveStatic(root: string, host: string, port: number, spa: boolean): Promise<AppServer> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let file = path.join(root, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
    if (!file.startsWith(root)) { res.writeHead(403).end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!existsSync(file)) {
      if (spa && !path.extname(urlPath)) file = path.join(root, 'index.html')
      else { res.writeHead(404).end('Not found'); return }
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(new StudioError(`Serveur local impossible sur le port ${port} : ${(e as Error).message}`)))
    server.listen(port, host, () => resolve({ url: `http://${host}:${port}`, stop: () => server.close() }))
  })
}

export async function startApp(p: Project): Promise<AppServer> {
  const { host, port, staticDir, command, spaFallback } = p.config.app
  if (staticDir) {
    const dir = path.resolve(p.root, staticDir)
    if (!existsSync(path.join(dir, 'index.html'))) throw new StudioError(`${staticDir}/index.html absent : lancer le build (sans --no-build)`)
    return serveStatic(dir, host, port, spaFallback)
  }
  if (!command) throw new StudioError('Configurer app.staticDir ou app.command pour servir l’application')
  const url = `http://${host}:${port}`
  let proc: ChildProcess | null = spawn('sh', ['-c', command.replaceAll('{port}', String(port)).replaceAll('{host}', host)],
    { cwd: p.root, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let stderr = ''
  let exited = false
  proc.stderr?.on('data', (d) => { stderr += d })
  proc.on('exit', () => { exited = true })
  const stop = () => {
    if (proc && !exited && proc.pid) { try { process.kill(-proc.pid, 'SIGTERM') } catch { /* déjà arrêté */ } }
    proc = null
  }
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (exited) throw new StudioError(`Le serveur de l’application n’a pas démarré (« ${command} »)`, stderr.slice(-2000))
    try { if ((await fetch(url)).ok) return { url, stop } } catch { /* pas encore prêt */ }
    await sleep(250)
  }
  stop()
  throw new StudioError(`Application injoignable sur ${url}`, stderr.slice(-2000))
}
