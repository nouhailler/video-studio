// Enregistrement de la composition Remotion. Durée, dimensions, thème et
// mise en page viennent de la chronologie passée en inputProps.
import React from 'react'
import { Composition } from 'remotion'
import { DEFAULT_COLORS } from '../config-defaults'
import type { Timeline } from '../types'
import { VideoComposition } from './VideoComposition'

const PLACEHOLDER: Timeline = {
  id: 'apercu', title: 'Aperçu', language: 'fr', fps: 30, width: 1920, height: 1080, durationInFrames: 90, layout: 'phone',
  theme: { brand: 'Video Studio', url: null, logo: null, colors: DEFAULT_COLORS, starfield: true,
    fonts: { serif: "'Spectral', serif", sans: "'IBM Plex Sans', sans-serif", mono: "'IBM Plex Mono', monospace" },
    labels: { chapter: 'Chapitre', tutorial: 'Tutoriel', intro: 'Introduction', outro: 'Conclusion' } },
  intro: null, outro: null, sentences: [], chapters: [], zooms: [], transitions: [], cues: [], subtitles: { burnIn: false },
  body: { from: 0, durationInFrames: 90, src: 'screen.mp4', trimStartFrames: 0, screen: { width: 860, height: 1864 } },
}

export const Root: React.FC = () => (
  <Composition
    id="VideoStudioTutorial"
    component={VideoComposition as unknown as React.FC<Record<string, unknown>>}
    defaultProps={PLACEHOLDER as unknown as Record<string, unknown>}
    durationInFrames={90} fps={30} width={1920} height={1080}
    calculateMetadata={({ props }) => {
      const tl = props as unknown as Timeline
      return { durationInFrames: tl.durationInFrames, fps: tl.fps, width: tl.width, height: tl.height }
    }}
  />
)
