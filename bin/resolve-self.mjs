// Crochet de résolution : `@nouhailler/video-studio` (et `/runtime`) pointent vers
// le paquet qui exécute la CLI. Les fichiers video.config.ts et les scénarios d'un
// projet fonctionnent ainsi sans que video-studio soit installé dans ce projet
// (installation globale, recommandée) — et, s'il l'est quand même, sans risque
// de mélanger deux versions.
const SELF = {
  '@nouhailler/video-studio': new URL('../src/index.ts', import.meta.url).href,
  '@nouhailler/video-studio/runtime': new URL('../src/runtime/engine.ts', import.meta.url).href,
}

export async function resolve(specifier, context, next) {
  const url = SELF[specifier]
  if (url) return { url, shortCircuit: true }
  return next(specifier, context)
}
