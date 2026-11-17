// Emplacements d'un projet. Tout ce qui est généré vit dans le dossier vidéo
// du projet, dans des sous-dossiers à ignorer par git : audio/, cache/,
// recordings/, build/, output/.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Project } from '../config'

/** Racine du paquet video-studio. */
export const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Dossier partagé par tous les projets (voix, venv Piper, navigateur de rendu Remotion). */
export function studioHome(): string {
  return process.env.VIDEO_STUDIO_HOME ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'video-studio')
}

export function projectPaths(p: Project) {
  const d = p.dir
  return {
    ttsCache: path.join(d, 'cache', 'tts'),
    networkCache: path.join(d, 'cache', 'network'),
    audio: (id: string) => path.join(d, 'audio', id),
    recording: (id: string) => path.join(d, 'recordings', id),
    build: (id: string) => path.join(d, 'build', id),
    output: path.join(d, 'output'),
    models: path.join(p.config.voicesDir, 'models'),
    venvPython: path.join(p.config.voicesDir, '.venv', 'bin', 'python'),
  }
}

export function projectFiles(p: Project) {
  const P = projectPaths(p)
  return {
    voice: (id: string) => path.join(P.audio(id), 'voice.json'),
    capture: (id: string) => path.join(P.recording(id), 'capture.json'),
    screen: (id: string) => path.join(P.recording(id), 'screen.mp4'),
    timeline: (id: string) => path.join(P.build(id), 'timeline.json'),
    har: (id: string) => path.join(P.networkCache, `${id}.har`),
    mp4: (id: string) => path.join(P.output, `${id}.mp4`),
    srt: (id: string) => path.join(P.output, `${id}.srt`),
    vtt: (id: string) => path.join(P.output, `${id}.vtt`),
    chapters: (id: string) => path.join(P.output, `${id}.chapters.txt`),
    report: (id: string) => path.join(P.output, `${id}.report.json`),
  }
}

export function rel(p: Project, file: string): string {
  return path.relative(p.root, file) || '.'
}
