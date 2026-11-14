import { useEffect } from 'react'
import { JukeboxPlayer } from '../player.ts'

/** Elements that already do something with these keys. */
function handlesItsOwnKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Space activates buttons, links and <summary> natively; arrows do nothing there.
  if (key === ' ') return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY'
  return false
}

/**
 * Page-wide shortcuts: Space plays and pauses, Left and Right skip 5 seconds,
 * L speaks the legend, 1 to 4 solo an instrument (on tracks that have them).
 */
export function useKeyboard(player: JukeboxPlayer): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key
      if (handlesItsOwnKeys(event.target, key)) return
      if (key === ' ') {
        event.preventDefault() // stop Space from scrolling the page
        if (!event.repeat) void player.toggle()
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault()
        player.seekBy(key === 'ArrowLeft' ? -JukeboxPlayer.seekStep : JukeboxPlayer.seekStep)
      } else if (key === 'l' || key === 'L') {
        if (!event.repeat) player.speakLegend()
      } else if (key >= '1' && key <= '4') {
        if (!event.repeat) player.toggleSolo(Number(key) - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player])
}
