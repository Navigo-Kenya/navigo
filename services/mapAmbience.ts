// services/mapAmbience.ts
//
// The map's ambience where the camera is looking: the light of the time of
// day (dawn, day, dusk, night, from the sun's position there) and the
// weather falling there (rain or snow, from Open-Meteo's current weather).
// Pure functions; the hook that drives them is hooks/useMapAmbience.

export type PrecipKind = "rain" | "snow";
export interface Precip {
  kind: PrecipKind;
  /** 1 light (drizzle, slight), 2 moderate, 3 heavy (or a thunderstorm). */
  level: 1 | 2 | 3;
}

/**
 * What to draw for a WMO weather code and the current precipitation (mm in
 * the last 15 min), or null for nothing. The code describes the last 15
 * minutes; when the model says nothing is falling now (0 mm), the rain has
 * stopped and none is drawn, except in a thunderstorm.
 */
export function precipFor(code: number | null | undefined, precipMm?: number | null): Precip | null {
  if (code == null || !Number.isFinite(code)) return null;

  // Snow: 71/73/75 snowfall, 77 snow grains, 85/86 snow showers.
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    if (precipMm === 0) return null;
    return { kind: "snow", level: code === 75 || code === 86 ? 3 : code === 73 ? 2 : 1 };
  }

  // Rain: 51–57 drizzle, 61–67 rain (66/67 freezing), 80–82 showers, 95–99 thunderstorm.
  const thunder = code >= 95 && code <= 99;
  const rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || thunder;
  if (!rainy) return null;
  if (precipMm === 0 && !thunder) return null;

  let level: 1 | 2 | 3 =
    code <= 57 || code === 61 || code === 80 ? 1
    : code === 63 || code === 66 || code === 81 ? 2
    : 3;
  // The measured amount wins when it says more than the code.
  if (precipMm != null && precipMm >= 4) level = 3;
  else if (precipMm != null && precipMm >= 1.5 && level < 2) level = 2;
  return { kind: "rain", level };
}

/** A stable string for a precip value ("rain:2"), so state only changes when it does. */
export const precipKey = (p: Precip | null): string | null => (p ? `${p.kind}:${p.level}` : null);

export function precipFromKey(key: string | null): Precip | null {
  if (!key) return null;
  const [kind, lvl] = key.split(":");
  const level = Number(lvl);
  if ((kind !== "rain" && kind !== "snow") || ![1, 2, 3].includes(level)) return null;
  return { kind, level: level as 1 | 2 | 3 };
}

/**
 * The particles fade in from zoom 10.5 to 12.5: rain is weather at street
 * level, and a city-wide view isn't drawn as one shower.
 */
export const PRECIP_MIN_ZOOM = 10.5;
const fadeIn = (v: number) => ["interpolate", ["linear"], ["zoom"], PRECIP_MIN_ZOOM, 0, 12.5, v];

interface Look {
  /** A dark map: the phone's dark style, satellite, or Standard's night light. */
  dark: boolean;
  /** Navigating: keep the screen edges clear for the banner and the card. */
  navigating: boolean;
}

/**
 * Mapbox rain for a level. Colours are explicit: Mapbox's defaults use
 * measure-light, which only exists in Standard styles (the phone's dark
 * style isn't one), and the rain would then be invisible.
 */
export function rainStyle(level: 1 | 2 | 3, { dark, navigating }: Look) {
  return {
    density: fadeIn([0.3, 0.55, 0.85][level - 1]),
    intensity: [0.5, 0.8, 1][level - 1],
    color: dark ? "#5d6b8a" : "#a8adbc",
    opacity: dark ? 0.85 : 0.7,
    vignette: navigating ? 0.08 * level : 0.12 + 0.1 * level,
    vignetteColor: dark ? "#0b1220" : "#464646",
    centerThinning: navigating ? 0.75 : 0.57,
    // Transitions: the shower builds and fades instead of switching on.
    densityTransition: { duration: 1500, delay: 0 },
    intensityTransition: { duration: 1500, delay: 0 },
  };
}

/** Mapbox snow for a level (explicit colours, as for rain). */
export function snowStyle(level: 1 | 2 | 3, { dark, navigating }: Look) {
  return {
    density: fadeIn([0.35, 0.6, 0.85][level - 1]),
    intensity: [0.6, 0.8, 1][level - 1],
    color: "#ffffff",
    opacity: dark ? 0.85 : 0.95,
    vignette: navigating ? 0.08 * level : 0.1 + 0.08 * level,
    vignetteColor: dark ? "#c8d2e6" : "#ffffff",
    centerThinning: navigating ? 0.7 : 0.4,
    densityTransition: { duration: 1500, delay: 0 },
    intensityTransition: { duration: 1500, delay: 0 },
  };
}

/**
 * Where the sun is computed: the camera centre snapped to 0.5° (about 55 km;
 * the sun's elevation differs by about 2 minutes of time across it), so
 * panning around a city never recomputes the light.
 */
export const snapSun = (v: number) => Math.round(v * 2) / 2;

/** Where the weather is fetched: the same ~5 km cells as the weather pill (one shared cache). */
export const snapWeather = (v: number) => Math.round(v * 20) / 20;
