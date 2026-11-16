// Composition principale : intro → démonstration réelle (téléphone ou fenêtre
// + encadrés synchronisés) → conclusion. Toutes les positions temporelles
// viennent de la chronologie (événements de capture × durées audio réelles).
import React from 'react'
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion'
import type { Timeline } from '../types'
import { Background } from './Background'
import { ChapterProgress, ChapterTitle } from './ChapterTitle'
import { Intro, Logo } from './Intro'
import { NarrationOverlay } from './NarrationOverlay'
import { Outro } from './Outro'
import { DesktopFrame, PhoneFrame } from './ScreenFrame'
import { SubtitleOverlay } from './SubtitleOverlay'
import { ThemeContext, tokens, useT } from './theme'
import { Fade } from './Transition'

const LAYOUTS = {
  phone: { textLeft: 860, textWidth: 940, chapterTop: 236, narrTop: 520, narrSize: 44, titleSize: 68 },
  desktop: { textLeft: 1300, textWidth: 560, chapterTop: 200, narrTop: 470, narrSize: 34, titleSize: 52 },
}

const Body: React.FC<{ tl: Timeline }> = ({ tl }) => {
  const T = useT()
  const { from, durationInFrames } = tl.body
  const L = LAYOUTS[tl.layout]
  return (
    <Fade duration={durationInFrames} inFrames={tl.intro ? 16 : 0} outFrames={tl.outro ? 14 : 0}>
      <Background seed="body" />
      {tl.layout === 'phone'
        ? <PhoneFrame tl={tl} offset={from} x={520} y={540} />
        : <DesktopFrame tl={tl} offset={from} left={70} top={150} width={1180} />}
      <div style={{ position: 'absolute', left: L.textLeft, top: 118, width: L.textWidth, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo size={40} glow={false} />
        <span style={{ fontFamily: T.serif, fontWeight: 500, fontSize: 24, letterSpacing: '0.38em', color: T.accentLight }}>{T.brand.toUpperCase()}</span>
        <span style={{ fontFamily: T.mono, fontSize: 16, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, marginLeft: 8 }}>
          {tl.title.length > 48 || tl.layout === 'desktop' ? T.labels.tutorial : tl.title}
        </span>
      </div>
      <div style={{ position: 'absolute', left: L.textLeft, top: L.chapterTop, width: L.textWidth }}>
        <ChapterTitle chapters={tl.chapters} offset={from} titleSize={L.titleSize} />
      </div>
      <div style={{ position: 'absolute', left: L.textLeft, top: L.narrTop, width: L.textWidth }}>
        <NarrationOverlay sentences={tl.sentences} offset={from} segmentPrefix="step-" fontSize={L.narrSize} maxWidth={L.textWidth} />
      </div>
      <div style={{ position: 'absolute', left: L.textLeft, bottom: 92 }}>
        <ChapterProgress tl={tl} offset={from} width={L.textWidth} />
      </div>
    </Fade>
  )
}

export const VideoComposition: React.FC<Timeline> = (tl) => (
  <ThemeContext.Provider value={tokens(tl.theme)}>
    <AbsoluteFill style={{ background: tl.theme.colors.bg }}>
      {tl.intro && (
        <Sequence from={tl.intro.from} durationInFrames={tl.intro.durationInFrames} name="Introduction">
          <Intro card={tl.intro.card} duration={tl.intro.durationInFrames} sentences={tl.sentences} offset={tl.intro.from} />
        </Sequence>
      )}
      <Sequence from={tl.body.from} durationInFrames={tl.body.durationInFrames} name="Démonstration">
        <Body tl={tl} />
      </Sequence>
      {tl.outro && (
        <Sequence from={tl.outro.from} durationInFrames={tl.outro.durationInFrames} name="Conclusion">
          <Outro card={tl.outro.card} duration={tl.outro.durationInFrames} sentences={tl.sentences} offset={tl.outro.from} />
        </Sequence>
      )}
      {/* Piste vocale : une phrase = un fichier, posé à son image exacte. */}
      {tl.sentences.filter((s) => s.src).map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames + 2} name={`voix ${s.segment}`} layout="none">
          <Audio src={staticFile(s.src)} />
        </Sequence>
      ))}
      {tl.subtitles.burnIn && <SubtitleOverlay cues={tl.cues} />}
    </AbsoluteFill>
  </ThemeContext.Provider>
)
