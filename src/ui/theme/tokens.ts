/**
 * Design tokens for "Mission Control meets vinyl". The CSS custom properties in
 * index.css mirror these; the contrast test checks both against WCAG AA.
 */

export const COLORS = {
  bg: '#06070a',
  /** Lifted surface: never a flat pure-black panel. */
  panel: '#0d0f14',
  text: '#ede8df',
  secondary: '#8a8f98',
  /** Decorative frames, dividers and crop marks only (not control borders). */
  hairline: 'rgba(255, 255, 255, 0.08)',
  /** Borders that identify controls: at least 3:1 against the background. */
  line: '#666c79',
} as const

/** One accent per track, taken from that track's legend. */
export const TRACK_ACCENTS: Record<string, string> = {
  lightning: '#ffd43b', // lightning yellow
  aerosols: '#c49be0', // dust lilac
  'sea-surface-currents': '#3fd4c4', // ocean teal
  'night-lights': '#ffb347', // city-light amber
  co2: '#ff6b4a', // high-CO2 orange-red
}

/** Text drawn on an accent-coloured surface. */
export const ACCENT_INK = '#06070a'

/** 8 px spacing grid. */
export const space = (n: number) => `${n * 8}px`

export const FONTS = {
  display: "'Instrument Serif', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

/** Track switches, accent re-tint and disc swaps. */
export const SWITCH_MS = 600
