import { aerosols } from './aerosols.ts'
import { co2 } from './co2.ts'
import { lightning } from './lightning.ts'
import { nightLights } from './nightLights.ts'
import { seaSurfaceCurrents } from './ocean.ts'
import type { Track } from './types.ts'

/** Every track, in display order. */
export const tracks: Track[] = [lightning, aerosols, seaSurfaceCurrents, nightLights, co2]

export function getTrack(id: string): Track | undefined {
  return tracks.find((t) => t.id === id)
}

export type { Track } from './types.ts'
