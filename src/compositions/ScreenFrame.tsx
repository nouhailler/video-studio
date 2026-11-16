// Cadre de la capture réelle (screen.mp4) : maquette de téléphone ou fenêtre
// de navigateur. Zooms légers optionnels, centrés sur l'élément mis en évidence.
import React from 'react'
import { Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion'
import type { Timeline } from '../types'
import { useT } from './theme'
import { stepTransitionStyle } from './Transition'

function zoomAt(frame: number, zooms: Timeline['zooms']): { s: number; ox: number; oy: number } {
  for (const z of zooms) {
    if (frame < z.from - 1 || frame > z.to + 14) continue
    const inP = interpolate(frame, [z.from, z.from + 16], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const outP = interpolate(frame, [z.to - 2, z.to + 12], [1, 0], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return { s: 1 + (z.scale - 1) * Math.min(inP, outP), ox: z.cx * 100, oy: z.cy * 100 }
  }
  return { s: 1, ox: 50, oy: 50 }
}

const Screen: React.FC<{ tl: Timeline; abs: number }> = ({ tl, abs }) => {
  const z = zoomAt(abs, tl.zooms)
  const tr = stepTransitionStyle(abs, tl.transitions)
  return (
    <div style={{ width: '100%', height: '100%', transform: `scale(${z.s})`, transformOrigin: `${z.ox}% ${z.oy}%`, ...tr }}>
      <OffthreadVideo src={staticFile(tl.body.src)} trimBefore={tl.body.trimStartFrames} muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  )
}

/** Téléphone centré sur (x, y), écran de `screenHeight` px de haut. */
export const PhoneFrame: React.FC<{ tl: Timeline; offset: number; x: number; y: number; screenHeight?: number }> = ({ tl, offset, x, y, screenHeight = 880 }) => {
  const T = useT()
  const abs = useCurrentFrame() + offset
  const bezel = 13
  const radius = 58
  const h = screenHeight
  const w = Math.round(tl.body.screen.width * (h / tl.body.screen.height))
  return (
    <div style={{ position: 'absolute', left: x - w / 2 - bezel, top: y - h / 2 - bezel, width: w + bezel * 2, height: h + bezel * 2,
      borderRadius: radius, padding: bezel, background: 'linear-gradient(160deg, #1b2440, #070b16 60%, #121a30)',
      boxShadow: `0 0 0 1px ${T.accentLine}, 0 40px 90px rgba(0,0,0,.65), 0 0 120px rgba(126,166,230,.10)` }}>
      <div style={{ width: w, height: h, borderRadius: radius - bezel, overflow: 'hidden', position: 'relative', background: T.bg }}>
        <Screen tl={tl} abs={abs} />
      </div>
    </div>
  )
}

/** Fenêtre de navigateur (barre de titre discrète) en (left, top), largeur `width`. */
export const DesktopFrame: React.FC<{ tl: Timeline; offset: number; left: number; top: number; width: number }> = ({ tl, offset, left, top, width }) => {
  const T = useT()
  const abs = useCurrentFrame() + offset
  const h = Math.round(width * (tl.body.screen.height / tl.body.screen.width))
  const bar = 34
  return (
    <div style={{ position: 'absolute', left, top, width, height: h + bar, borderRadius: 14, overflow: 'hidden', background: T.surface,
      boxShadow: `0 0 0 1px ${T.accentLine}, 0 40px 90px rgba(0,0,0,.6)` }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: 'rgba(255,255,255,.04)', borderBottom: `1px solid ${T.line}` }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
        {T.url && <span style={{ marginLeft: 16, fontFamily: T.mono, fontSize: 13, color: T.faint }}>{T.url}</span>}
      </div>
      <div style={{ width, height: h, overflow: 'hidden', position: 'relative' }}>
        <Screen tl={tl} abs={abs} />
      </div>
    </div>
  )
}
