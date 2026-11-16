// Fond : dégradé du thème, deux halos discrets, étoiles optionnelles qui
// scintillent doucement. Déterministe (random(seed)).
import React, { useMemo } from 'react'
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion'
import { useT } from './theme'

export const Starfield: React.FC<{ count?: number; seed?: string; drift?: number }> = ({ count = 220, seed = 'vs', drift = 0.012 }) => {
  const frame = useCurrentFrame()
  const T = useT()
  const { width, height } = useVideoConfig()
  const stars = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: random(`${seed}-x-${i}`) * width, y: random(`${seed}-y-${i}`) * height,
    r: 0.5 + random(`${seed}-r-${i}`) ** 3 * 1.9, a: 0.25 + random(`${seed}-a-${i}`) * 0.6,
    p: random(`${seed}-p-${i}`) * Math.PI * 2, gold: random(`${seed}-g-${i}`) > 0.93,
  })), [count, seed, width, height])
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      {stars.map((s, i) => (
        <circle key={i} cx={(s.x + frame * drift * (1 + s.r)) % width} cy={s.y} r={s.r}
          fill={s.gold ? T.accentLight : '#dfe7ff'} opacity={s.a * (0.75 + 0.25 * Math.sin(frame / 38 + s.p))} />
      ))}
    </svg>
  )
}

export const Background: React.FC<{ seed?: string }> = ({ seed }) => {
  const T = useT()
  return (
    <AbsoluteFill style={{ background: `radial-gradient(140% 95% at 50% -10%, ${T.bgTop} 0%, ${T.bgMid} 46%, ${T.bg} 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(38% 34% at 82% 18%, ${T.glowA}, transparent 70%), radial-gradient(40% 32% at 14% 78%, ${T.glowB}, transparent 70%)` }} />
      {T.starfield && <Starfield seed={seed} />}
    </AbsoluteFill>
  )
}
