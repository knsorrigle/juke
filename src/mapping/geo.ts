import { clamp } from './scales.ts'

/** The longitudes and latitudes at the edges of a flat-map video frame. */
export interface GeoFrame {
  lonLeft: number
  lonRight: number
  latTop: number
  latBottom: number
}

/** A full-globe equirectangular frame: 180 W to 180 E, 90 N to 90 S. */
export const FULL_GLOBE: GeoFrame = { lonLeft: -180, lonRight: 180, latTop: 90, latBottom: -90 }

/** Longitude in degrees for a horizontal position 0..1. */
export function xToLongitude(x: number, geo: GeoFrame): number {
  return geo.lonLeft + clamp(x, 0, 1) * (geo.lonRight - geo.lonLeft)
}

/** Latitude in degrees for a vertical position 0..1 (0 = top). */
export function yToLatitude(y: number, geo: GeoFrame): number {
  return geo.latTop + clamp(y, 0, 1) * (geo.latBottom - geo.latTop)
}

/** West is left, east is right. `width` keeps sounds off the hard edges. */
export function longitudeToPan(lon: number, width = 0.9): number {
  return clamp((lon / 180) * width, -width, width)
}

/** 0 at `south`, 1 at `north`; clamped outside that band. */
export function latitudeToPosition(lat: number, south: number, north: number): number {
  return clamp((lat - south) / (north - south), 0, 1)
}
