#!/usr/bin/env node
// Point d'entrée : active tsx (TypeScript à la volée) puis lance la CLI.
// Le paquet est distribué en sources TypeScript, sans étape de build.
import { register } from 'tsx/esm/api'

register()
await import('../src/cli.ts')
