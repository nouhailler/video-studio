// `video-studio init` : crée video/video.config.ts, un premier scénario, les
// entrées .gitignore et les scripts npm du projet courant.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PKG_DIR } from './lib/paths'
import { StudioError } from './lib/util'

const IGNORE = ['video/audio/', 'video/cache/', 'video/recordings/', 'video/build/', 'video/output/']

export async function init(cwd: string, opts: { force?: boolean; layout?: 'phone' | 'desktop' } = {}): Promise<void> {
  const pkgFile = path.join(cwd, 'package.json')
  if (!existsSync(pkgFile)) throw new StudioError('Lancer « video-studio init » à la racine du projet (package.json introuvable)')
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { name?: string; scripts?: Record<string, string>; devDependencies?: Record<string, string> }
  const name = (pkg.name ?? path.basename(cwd)).replace(/^@[^/]+\//, '')
  const pretty = name.charAt(0).toUpperCase() + name.slice(1)
  const vite = existsSync(path.join(cwd, 'vite.config.js')) || existsSync(path.join(cwd, 'vite.config.ts'))
  const vars: Record<string, string> = {
    __NAME__: pretty, __BUILD__: vite ? 'npx vite build' : 'npm run build', __STATIC__: vite ? 'dist' : 'build', __LAYOUT__: opts.layout ?? 'phone',
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
  pkg.scripts = pkg.scripts ?? {}
  for (const c of ['list', 'validate', 'audio', 'record', 'render', 'generate', 'preview']) {
    pkg.scripts[`video:${c}`] ??= `video-studio ${c}`
  }
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
  console.log('  ✓ scripts npm video:*')
  console.log(`\nÉtapes suivantes :\n  1. npx video-studio setup   (une fois par machine)\n  2. poser des data-demo-id dans l'app et écrire video/scenarios/presentation-fr.ts\n  3. npm run video:generate -- --scenario presentation-fr`)
}
