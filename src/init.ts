// `video-studio init` : crée video/video.config.ts, un premier scénario et les
// entrées .gitignore du projet courant. Ne touche ni au package.json ni aux
// dépendances : video-studio est un outil de la machine (installation globale),
// pas une dépendance de l'application.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PKG_DIR } from './lib/paths'

const IGNORE = ['video/audio/', 'video/cache/', 'video/recordings/', 'video/build/', 'video/output/']

function appName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')) as { name?: string }
    if (pkg.name) return pkg.name.replace(/^@[^/]+\//, '')
  } catch { /* pas de package.json */ }
  try {
    const m = readFileSync(path.join(cwd, 'pubspec.yaml'), 'utf8').match(/^name:\s*(\S+)/m)
    if (m) return m[1]
  } catch { /* pas de pubspec.yaml */ }
  return path.basename(cwd)
}

export async function init(cwd: string, opts: { force?: boolean; layout?: 'phone' | 'desktop' } = {}): Promise<void> {
  const name = appName(cwd)
  const pretty = name.charAt(0).toUpperCase() + name.slice(1)
  const vite = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some((f) => existsSync(path.join(cwd, f)))
  const flutter = existsSync(path.join(cwd, 'pubspec.yaml'))
  const vars: Record<string, string> = {
    __NAME__: pretty,
    __BUILD__: flutter ? 'flutter build web --release' : 'npm run build',
    __STATIC__: flutter ? 'build/web' : vite ? 'dist' : 'build',
    __LAYOUT__: opts.layout ?? 'phone',
  }
  const fill = (s: string) => Object.entries(vars).reduce((a, [k, v]) => a.replaceAll(k, v), s)
  for (const f of ['video/video.config.ts', 'video/scenarios/presentation-fr.ts']) {
    const dest = path.join(cwd, f)
    if (existsSync(dest) && !opts.force) { console.log(`  · ${f} existe déjà (--force pour écraser)`); continue }
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, fill(readFileSync(path.join(PKG_DIR, 'templates', f), 'utf8')))
    console.log(`  ✓ ${f}`)
  }
  const gi = path.join(cwd, '.gitignore')
  const cur = existsSync(gi) ? readFileSync(gi, 'utf8') : ''
  const add = IGNORE.filter((l) => !cur.includes(l))
  if (add.length) { writeFileSync(gi, `${cur.trimEnd()}\n\n# video-studio — fichiers générés\n${add.join('\n')}\n`); console.log('  ✓ .gitignore') }
  console.log('  · package.json inchangé (video-studio n\'est pas une dépendance de l\'application)')
  console.log(`\nÉtapes suivantes :\n  1. poser des data-demo-id dans l'app et écrire video/scenarios/presentation-fr.ts\n  2. video-studio generate --scenario presentation-fr`)
}
