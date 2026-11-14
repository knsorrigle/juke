import { mediaUrl } from './mediaUrl.ts'
import type { Track } from './types.ts'

/**
 * Tracks whose media and frame geometry are settled but whose sonification
 * rules are not written yet (`createRunner: null`). The projection, geographic
 * and mask values here are what those rules will rely on.
 */

export const nightLights: Track = {
  id: 'night-lights',
  title: 'Night lights, 2012 to 2023',
  videoSrc: mediaUrl('night-lights.mp4'),
  credit: "NASA's Scientific Visualization Studio",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5313/',
  description:
    'Yearly average night lights from 2012 to 2023, followed by a map of where lighting grew or faded between those years.',
  altText:
    'A dark world map. City lights appear in pale yellow while a year label counts from 2012 to 2023. The lights then fade into a map of change: purple where there is more light than in 2012, orange where there is less.',
  projection: 'equirectangular',
  // Longitude was measured (left edge 180 W, to about a quarter of a degree).
  // Latitude at the top and bottom edges has not been measured yet.
  geographic: { x: true, y: true, lon: [-180, 180] },
  // Year label and change legend, measured over the whole clip:
  // x 0.012-0.170, y 0.500-0.593, plus a small margin.
  masks: [{ x: 0.005, y: 0.49, width: 0.175, height: 0.115 }],
  legend: [],
  timeLabels: null,
  notes:
    'Cropped from a 32:9 frame that showed the world about twice. Measure the latitude of the top and bottom edges before mapping y to latitude.',
  createRunner: null,
}

export const aerosols: Track = {
  id: 'aerosols',
  title: 'Aerosols in the air',
  videoSrc: mediaUrl('aerosols.mp4'),
  credit:
    "NASA's Global Modeling Assimilation Office (GMAO) and NASA's Scientific Visualization Studio (SVS)",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5572/',
  description:
    'Tiny airborne particles modelled by NASA GEOS for 1 August to 14 September 2024, coloured by type: black carbon, dust, sea salt and sulfate.',
  altText:
    'A world map covered in swirling colour: green sulfate haze across the northern continents, a lilac river of Saharan dust crossing the Atlantic, orange-red smoke over central Africa and South America, and grey-blue sea-salt spirals around storms in the southern oceans.',
  projection: 'equirectangular',
  // A flat lat/lon map filling the frame. The edge longitudes and latitudes
  // have not been measured yet.
  geographic: { x: true, y: true },
  // The in-frame legend box, read from a frame by eye with a margin. Small text
  // annotations (for example "Dust, Sahara Desert") come and go and are not masked.
  masks: [{ x: 0.665, y: 0.895, width: 0.225, height: 0.09 }],
  legend: [],
  timeLabels: null,
  notes:
    'Legend colours: black carbon orange-red, dust lilac, sea salt grey-teal, sulfate green. Measure the map edges before using lon/lat.',
  createRunner: null,
}

export const seaSurfaceCurrents: Track = {
  id: 'sea-surface-currents',
  title: 'Ocean surface currents and temperature',
  videoSrc: mediaUrl('sea-surface-currents.mp4'),
  credit: 'NASA/Goddard Space Flight Center Scientific Visualization Studio',
  sourceUrl: 'https://svs.gsfc.nasa.gov/3912/',
  description:
    'Modelled ocean surface currents (ECCO2) drawn as flowing lines, coloured by sea surface temperature from 0 to 32 degrees Celsius.',
  altText:
    'A world map with grey land. The oceans are filled with fine flowing lines that curl into eddies: red and orange in the warm tropics, yellow and green in the mid-latitudes, blue near the poles.',
  projection: 'equirectangular',
  // A flat lat/lon map filling the frame. Edges not measured yet.
  geographic: { x: true, y: true },
  masks: [],
  legend: [],
  timeLabels: null,
  notes: 'Colour scale: 0 C blue, about 10 C green, about 25 C yellow, 32 C red. No date in frame.',
  createRunner: null,
}

export const co2: Track = {
  id: 'co2',
  title: 'Carbon dioxide, January to March 2020',
  videoSrc: mediaUrl('co2.mp4'),
  credit: "NASA's Scientific Visualization Studio",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5196/',
  description:
    'Carbon dioxide moving through the atmosphere from January to March 2020, from the DYAMOND model run, on a slowly turning globe.',
  altText:
    'A globe on a black background, turning slowly from Asia past Africa to the Americas. Carbon dioxide appears as a pale haze that thickens to orange and red over cities, industrial regions and fires, and pulses from day to night.',
  projection: 'globe',
  // The camera orbits, so a pixel's position is not a place on Earth.
  geographic: { x: false, y: false },
  // The date stamp, measured over the whole clip:
  // x 0.805-0.981, y 0.943-0.963, plus a margin.
  masks: [{ x: 0.79, y: 0.93, width: 0.2, height: 0.045 }],
  legend: [],
  timeLabels: null,
  notes: 'Colour scale: 380 to 460 ppm; nearly transparent below about 415, orange near 440, red at 460.',
  createRunner: null,
}
