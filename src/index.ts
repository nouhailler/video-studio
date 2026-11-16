// API publique de video-studio (utilisée dans les fichiers video.config.ts et
// les scénarios des projets).
export { defineVideoConfig, defineScenario, DEFAULT_VOICES, DEFAULT_PRONUNCIATIONS, DEFAULT_BLOCKED_HOSTS, DEFAULT_COLORS, loadProject } from './config'
export type { VideoStudioConfig, VoiceConfig, NetworkFixture, EngineDriver, RuntimeDriver, Project, ResolvedConfig } from './config'
export type * from './types'
export { generateVoice, holdsFromManifest, loadVoiceFor } from './generate-voice'
export { validateScenario, collectTargets } from './validate'
export { record } from './record'
export { buildTimeline } from './build-timeline'
export { render, verifyExport } from './render'
export type { TtsEngine, TtsRequest, TtsResult } from './tts/engine'
export { MockEngine } from './tts/engine'
