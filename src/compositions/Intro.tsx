// Introduction paramétrable : logo, nom de l'app, titre de la vidéo, accroche.
import React from 'react'
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { TimelineSentence, VideoCard } from '../types'
import { Background } from './Background'
import { NarrationOverlay } from './NarrationOverlay'
import { useT } from './theme'
import { Fade, useAppear } from './Transition'

/** Logo du projet, ou monogramme si aucun logo n'est fourni. */
export const Logo: React.FC<{ size: number; glow?: boolean }> = ({ size, glow = true }) => {
  const T = useT()
  const filter = glow ? `drop-shadow(0 0 ${size / 3}px ${T.accentLine})` : undefined
  if (T.logo) return <Img src={staticFile(T.logo)} style={{ width: size, height: size, objectFit: 'contain', filter }} />
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.27, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(160deg, ${T.accentLight}, ${T.accentDark})`, color: T.accentInk, fontFamily: T.serif,
      fontWeight: 500, fontSize: size * 0.5, filter }}>{T.brand.slice(0, 1).toUpperCase()}</div>
  )
}

export const Intro: React.FC<{ card: VideoCard; duration: number; sentences: TimelineSentence[]; offset: number }> = ({ card, duration, sentences, offset }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const T = useT()
  const logo = spring({ frame: f - 6, fps, config: { damping: 14, mass: 0.8 } })
  const halo = interpolate(f, [0, duration], [0.9, 1.15], { easing: Easing.inOut(Easing.sin) })
  const name = useAppear(18, 22, 12)
  const title = useAppear(34, 24, 20)
  const tagline = useAppear(50, 24, 16)
  return (
    <Fade duration={duration} inFrames={18} outFrames={16}>
      <Background seed="intro" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', transform: `scale(${halo})`,
          background: `radial-gradient(circle, ${T.accentSoft}, transparent 60%)` }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -60 }}>
          <div style={{ transform: `scale(${0.6 + 0.4 * logo})`, opacity: logo }}><Logo size={132} /></div>
          <div style={{ ...name, marginTop: 34, fontFamily: T.serif, fontWeight: 500, fontSize: 40, letterSpacing: '0.42em', color: T.accentLight, paddingLeft: '0.42em' }}>
            {T.brand.toUpperCase()}
          </div>
          {card.eyebrow && (
            <div style={{ ...name, marginTop: 26, fontFamily: T.mono, fontSize: 20, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.faint }}>
              {card.eyebrow}
            </div>
          )}
          {card.title && (
            <div style={{ ...title, marginTop: 18, fontFamily: T.serif, fontWeight: 400, fontSize: 84, lineHeight: 1.05, color: T.text, maxWidth: 1400 }}>
              {card.title}
            </div>
          )}
          {card.tagline && (
            <div style={{ ...tagline, marginTop: 22, fontFamily: T.serif, fontStyle: 'italic', fontSize: 38, color: T.dim, maxWidth: 1300 }}>
              {card.tagline}
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 110, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <NarrationOverlay sentences={sentences} offset={offset} segmentPrefix="intro" fontSize={30} align="center" maxWidth={1300} />
        </div>
      </AbsoluteFill>
    </Fade>
  )
}
