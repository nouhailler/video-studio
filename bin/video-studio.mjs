#!/usr/bin/env node
// Point d'entrée : active tsx (TypeScript à la volée) puis lance la CLI.
// Le paquet est distribué en sources TypeScript, sans étape de build.
import Module, { register as registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { register as registerCjs } from 'tsx/cjs/api'
import { register } from 'tsx/esm/api'

register()
// Fichiers chargés en CommonJS (projet sans package.json ou sans "type": "module") :
// imports relatifs sans extension vers des .ts.
registerCjs()
// Enregistré après tsx, donc consulté en premier (voir resolve-self.mjs).
registerHooks('./resolve-self.mjs', import.meta.url)

// Même redirection pour les fichiers que tsx charge en CommonJS (projet sans "type": "module").
const SELF = {
  '@nouhailler/video-studio': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
  '@nouhailler/video-studio/runtime': fileURLToPath(new URL('../src/runtime/engine.ts', import.meta.url)),
}
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, SELF[request] ?? request, ...rest)
}

await import('../src/cli.ts')
