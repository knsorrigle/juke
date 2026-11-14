import { useEffect } from 'react'
import { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'

/** Elements that already do something with these keys. */
function handlesItsOwnKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Space and Enter activate buttons, links and <summary> natively.
  if (key === ' ') return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY'
  // Up and Down move within the track list.
  if (key === 'ArrowUp' || key === 'ArrowDown') return Boolean(target.closest('.tracks'))
  return false
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * Page-wide shortcuts, following the blueprint:
 * 1 Play mode, 2 Explore mode (3 and 4 are reserved for later modes);
 * Shift+1 to 4 solo an instrument; Space play/pause; arrows seek in Play mode
 * and move the cursor in Explore mode (Shift for 10 cells); I says what is
 * under the cursor; F and G describe the frame; L explains the sounds; Escape
 * leaves Explore mode.
 */
export function useKeyboard(player: JukeboxPlayer): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key
      if (handlesItsOwnKeys(event.target, key)) return
      const exploring = useJukebox.getState().mode === 'explore'
      const digit = /^Digit([1-4])$/.exec(event.code)

      if (digit && event.shiftKey) {
        if (!event.repeat) player.toggleSolo(Number(digit[1]) - 1)
      } else if (digit) {
        if (event.repeat) return
        const n = Number(digit[1])
        if (n === 1) {
          if (exploring) player.exitExplore()
          else useJukebox.getState().announce('Play mode. Press Space to play or pause.')
        } else if (n === 2) {
          if (!exploring) void player.enterExplore()
        } else {
          useJukebox.getState().announce(`Mode ${n} is not built yet.`)
        }
      } else if (key === ' ') {
        event.preventDefault() // stop Space from scrolling the page
        if (!event.repeat) void player.toggle()
      } else if (key in ARROWS) {
        const [dx, dy] = ARROWS[key]
        if (exploring) {
          event.preventDefault()
          const step = event.shiftKey ? 10 : 1
          player.moveCursor(dx * step, dy * step)
        } else if (dx) {
          event.preventDefault()
          player.seekBy(dx * JukeboxPlayer.seekStep)
        }
      } else if (key === 'Escape') {
        if (exploring) player.exitExplore()
      } else if (!event.repeat) {
        const lower = key.toLowerCase()
        if (lower === 'l') player.speakLegend()
        else if (lower === 'i') player.speakProbe()
        else if (lower === 'f') player.speakFrame(false)
        else if (lower === 'g') player.speakFrame(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player])
}
