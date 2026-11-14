import { useJukebox } from '../../store.ts'

const KEY = 'earth-jukebox:high-contrast'

/** The saved choice, or the system's "more contrast" setting if there is none. */
export function initialHighContrast(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved !== null) return saved === '1'
  } catch {
    // Storage unavailable: fall through to the system setting.
  }
  return window.matchMedia?.('(prefers-contrast: more)').matches ?? false
}

/** Apply the theme to the page and remember it. */
export function applyHighContrast(on: boolean): void {
  document.documentElement.classList.toggle('hc', on)
  useJukebox.getState().patch({ highContrast: on })
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Not saved, but still applied for this visit.
  }
}

/** C key: switch the theme and say so. */
export function toggleHighContrast(): void {
  const on = !useJukebox.getState().highContrast
  applyHighContrast(on)
  useJukebox.getState().announce(on ? 'High contrast on.' : 'High contrast off.')
}
