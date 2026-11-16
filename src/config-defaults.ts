// Valeurs par défaut sans dépendance Node : importables par la composition (navigateur).
import type { ThemeColors } from './types'

export const DEFAULT_COLORS: ThemeColors = {
  bg: '#04060e', bgTop: '#0e1838', bgMid: '#070c1c', surface: '#0a1020',
  line: 'rgba(150,180,235,0.18)', text: '#eef2fb', dim: '#a3aece', faint: '#8090b8',
  accent: '#d9b36c', accentLight: '#efce8c', accentDark: '#b8924c',
  accentSoft: 'rgba(217,179,108,0.13)', accentLine: 'rgba(217,179,108,0.32)', accentInk: '#1a130a',
  glowA: 'rgba(176,138,224,.16)', glowB: 'rgba(126,166,230,.12)',
}
