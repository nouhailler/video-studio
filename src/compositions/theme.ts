// Thème transmis par la chronologie (config.theme du projet). Polices par
// défaut embarquées hors ligne ; les projets peuvent en ajouter (theme.fontCss).
import '@fontsource/spectral/300.css'
import '@fontsource/spectral/400.css'
import '@fontsource/spectral/500.css'
import '@fontsource/spectral/400-italic.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { createContext, useContext } from 'react'
import type { TimelineTheme } from '../types'

export interface Tokens {
  bg: string; bgTop: string; bgMid: string; surface: string; line: string
  text: string; dim: string; faint: string
  accent: string; accentLight: string; accentDark: string; accentSoft: string; accentLine: string; accentInk: string
  glowA: string; glowB: string
  serif: string; sans: string; mono: string
  brand: string; url: string | null; logo: string | null; starfield: boolean
  labels: TimelineTheme['labels']
}

export function tokens(t: TimelineTheme): Tokens {
  return { ...t.colors, ...t.fonts, brand: t.brand, url: t.url, logo: t.logo, starfield: t.starfield, labels: t.labels }
}

export const ThemeContext = createContext<Tokens | null>(null)

export function useT(): Tokens {
  const t = useContext(ThemeContext)
  if (!t) throw new Error('ThemeContext absent')
  return t
}
