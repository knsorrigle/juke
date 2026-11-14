import type { Geographic } from '../tracks/types.ts'

const fmt = (deg: number, pos: string, neg: string) =>
  `${Math.abs(Math.round(deg))} degrees ${deg >= 0 ? pos : neg}`

/**
 * The place under a point (0..1 from the top-left), in words. Says latitude
 * and longitude only when the track's config says that axis is geographic and
 * its edges were measured; otherwise falls back to screen position.
 */
export function describePlace(x: number, y: number, geo: Geographic): string {
  const parts: string[] = []
  if (geo.y && geo.lat) parts.push(fmt(geo.lat[0] + y * (geo.lat[1] - geo.lat[0]), 'north', 'south'))
  if (geo.x && geo.lon) parts.push(fmt(geo.lon[0] + x * (geo.lon[1] - geo.lon[0]), 'east', 'west'))
  if (parts.length === 2) return parts.join(', ')
  const screen = `${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down the screen`
  return parts.length ? `${parts[0]}; ${screen}` : screen
}
