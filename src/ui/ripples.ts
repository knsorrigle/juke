/** A note made visible: where it came from, its colour and how hard it was played. */
export interface Ripple {
  x: number
  y: number
  color: string
  velocity: number
}

type Listener = (ripple: Ripple) => void
const listeners = new Set<Listener>()

/** A tiny event bus: the player emits a ripple at the moment a note sounds. */
export const ripples = {
  emit(ripple: Ripple): void {
    listeners.forEach((l) => l(ripple))
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
