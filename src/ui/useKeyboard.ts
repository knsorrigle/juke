import { useEffect } from 'react'
import { JukeboxPlayer } from '../player.ts'

/** Elements that already do something with Space or the arrow keys. */
function handlesItsOwnKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Space activates buttons, links and <summary> natively; arrows do nothing there.
  if (key === ' ') return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY'
  return false
}

/** Page-wide shortcuts: Space plays and pauses, Left and Right arrows skip. */
export function useKeyboard(player: JukeboxPlayer): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key
      if (key !== ' ' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
      if (handlesItsOwnKeys(event.target, key)) return
      event.preventDefault() // stop Space from scrolling the page
      if (key === ' ') {
        if (!event.repeat) void player.toggle()
      } else {
        player.seekBy(key === 'ArrowLeft' ? -JukeboxPlayer.seekStep : JukeboxPlayer.seekStep)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player])
}
