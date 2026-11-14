import { lightning } from './lightning.ts'
import type { Track } from './types.ts'
import { aerosols, co2, nightLights, seaSurfaceCurrents } from './upcoming.ts'

/** Every track, in display order. Tracks without rules yet have `createRunner: null`. */
export const tracks: Track[] = [lightning, nightLights, aerosols, seaSurfaceCurrents, co2]

/** Tracks that can be played today. */
export const playableTracks: Track[] = tracks.filter((t) => t.createRunner !== null)

export function getTrack(id: string): Track | undefined {
  return tracks.find((t) => t.id === id)
}

export type { Track } from './types.ts'
