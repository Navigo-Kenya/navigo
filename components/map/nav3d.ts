/**
 * Immersive navigation: the 3D model for each mode, its size on screen, how
 * the camera frames it, and the map's light for the time of day.
 *
 * The models are Navigo's own, built from code in the navigo-models repo and
 * bundled with the app (navModelAssets.ts; no download, no third-party licences).
 */
import type { LatLng } from "@/providers/map/types";

export type VehicleModel =
  | "matatu" | "bus" | "car" | "boda" | "bicycle"
  | "train_sgr_loco" | "train_sgr_coach" | "train_commuter"
  | "ferry" | "plane" | "puck";


/**
 * Our models face glTF +Z, which Mapbox places facing south, and Mapbox
 * rotates clockwise: a bearing plus 180° turns them to face it. If a device
 * build shows them driving backwards, this is the one number to change.
 */
export const MODEL_YAW_OFFSET = 180;
export const modelYaw = (bearing: number) => (((bearing + MODEL_YAW_OFFSET) % 360) + 360) % 360;

/** Real length (m) and length on screen (px), whatever the zoom. */
const SIZE: Record<VehicleModel, { lengthM: number; px: number }> = {
  matatu: { lengthM: 5.5, px: 58 },
  bus: { lengthM: 8.3, px: 70 },
  car: { lengthM: 4.3, px: 52 },
  boda: { lengthM: 2.0, px: 40 },
  bicycle: { lengthM: 1.9, px: 38 },
  train_sgr_loco: { lengthM: 22.4, px: 64 },
  train_sgr_coach: { lengthM: 26.9, px: 72 },
  train_commuter: { lengthM: 20.0, px: 62 },
  ferry: { lengthM: 72.0, px: 130 },
  plane: { lengthM: 37.7, px: 96 },
  puck: { lengthM: 2.5, px: 46 },
};

/** Metres per screen point at a zoom (512-px tiles, near the equator). */
const metresPerPx = (zoom: number) => 0.597 * Math.pow(2, 17 - zoom);

/** Scale that gives the model its on-screen length at this zoom (never below real size). */
export function modelScaleAt(model: VehicleModel, zoom: number): number {
  const { lengthM, px } = SIZE[model];
  return Math.max(1, (px * metresPerPx(zoom)) / lengthM);
}

/** Mapbox expression: the same on-screen size at every zoom. */
export function modelScaleExpr(model: VehicleModel): any[] {
  const stop = (z: number) => {
    const s = modelScaleAt(model, z);
    return ["literal", [s, s, s]];
  };
  return ["interpolate", ["exponential", 2], ["zoom"], 8, stop(8), 12, stop(12), 15, stop(15), 17, stop(17), 20, stop(20)];
}

/** A stable choice per route: about one bus route in three runs a 33-seater nganya. */
function isNganyaRoute(routeKey: string): boolean {
  let h = 5381;
  for (let i = 0; i < routeKey.length; i++) h = ((h << 5) + h + routeKey.charCodeAt(i)) | 0;
  return Math.abs(h) % 3 === 0;
}

const RAIL_MODES = new Set(["RAIL", "SUBWAY", "TRAM", "MONORAIL", "FUNICULAR"]);

export function isRailMode(mode?: string | null): boolean {
  return RAIL_MODES.has((mode ?? "").toUpperCase());
}

/** The vehicle drawn for a leg. Trains are drawn as a consist (trainConsist). */
export function vehicleFor(mode?: string | null, routeId?: string | null, routeName?: string | null): VehicleModel {
  const m = (mode ?? "").toUpperCase();
  switch (m) {
    case "WALK": return "puck";
    case "CAR": return "car";
    case "MOTORBIKE": return "boda";
    case "BICYCLE": return "bicycle";
    case "FERRY": return "ferry";
    case "AIRPLANE": case "FLIGHT": return "plane";
  }
  if (RAIL_MODES.has(m)) return trainConsist(routeId)[0];
  return isNganyaRoute(routeId ?? routeName ?? "") ? "bus" : "matatu";
}

/**
 * Cars of a train, front first. SGR services: locomotive and four coaches.
 * Nairobi commuter lines: two DMU cars back to back. Other metre-gauge trains
 * (the safari trains): locomotive and three coaches.
 */
export function trainConsist(routeId?: string | null): VehicleModel[] {
  const id = (routeId ?? "").toUpperCase();
  if (id.startsWith("SGR")) return ["train_sgr_loco", "train_sgr_coach", "train_sgr_coach", "train_sgr_coach", "train_sgr_coach"];
  if (id.startsWith("NCR")) return ["train_commuter", "train_commuter"];
  return ["train_sgr_loco", "train_sgr_coach", "train_sgr_coach", "train_sgr_coach"];
}

/** The models a journey can need (registered with the map only while navigating). */
export function modelsFor(legs: { mode?: string; routeId?: string | null; routeName?: string | null }[]): VehicleModel[] {
  const set = new Set<VehicleModel>(["puck"]);
  for (const leg of legs) {
    if (isRailMode(leg.mode)) trainConsist(leg.routeId).forEach((m) => set.add(m));
    else set.add(vehicleFor(leg.mode, leg.routeId, leg.routeName));
  }
  return [...set];
}

// ── Camera ───────────────────────────────────────────────────────────────

export interface CameraProfile {
  pitch: number;
  zoom: (kph: number) => number;
  /** Puts the vehicle low on screen, so the road ahead fills the view. */
  paddingBottom: number;
}

const lerpBy = (kph: number, pts: [number, number][]) => {
  if (kph <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [k1, z1] = pts[i];
    const [k0, z0] = pts[i - 1];
    if (kph <= k1) return z0 + ((kph - k0) / (k1 - k0)) * (z1 - z0);
  }
  return pts[pts.length - 1][1];
};

export function cameraFor(model: VehicleModel): CameraProfile {
  switch (model) {
    case "puck":
      return { pitch: 55, paddingBottom: 220, zoom: (k) => lerpBy(k, [[5, 19.0], [15, 18.3]]) };
    case "bicycle":
      return { pitch: 60, paddingBottom: 240, zoom: (k) => lerpBy(k, [[5, 18.2], [30, 17.2]]) };
    case "train_sgr_loco": case "train_sgr_coach": case "train_commuter":
      return { pitch: 55, paddingBottom: 300, zoom: (k) => lerpBy(k, [[5, 15.8], [60, 15.0], [120, 14.2]]) };
    case "ferry":
      return { pitch: 50, paddingBottom: 260, zoom: () => 15.6 };
    case "plane":
      return { pitch: 40, paddingBottom: 200, zoom: (k) => lerpBy(k, [[200, 9], [800, 7]]) };
    default:                                   // matatu, bus, car, boda
      return { pitch: 64, paddingBottom: 260, zoom: (k) => lerpBy(k, [[5, 17.2], [30, 16.4], [80, 15.5]]) };
  }
}

// ── Train cars along the line ────────────────────────────────────────────

const R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

function metres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x = Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude))
    - Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Positions and bearings of the cars of a train along its line; the user rides the second car. */
export function trainCars(line: LatLng[], user: LatLng, consist: VehicleModel[], zoom: number):
  { model: VehicleModel; coord: [number, number]; bearing: number; flip: boolean }[] {
  if (line.length < 2) return [];
  // Cumulative distances, and the user's distance along the line.
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + metres(line[i - 1], line[i]));
  let best = { d: Infinity, along: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const kx = Math.cos(toRad(user.latitude)) * 111_320, ky = 110_540;
    const ax = (a.longitude - user.longitude) * kx, ay = (a.latitude - user.latitude) * ky;
    const bx = (b.longitude - user.longitude) * kx, by = (b.latitude - user.latitude) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, along: cum[i] + t * (cum[i + 1] - cum[i]) };
  }
  const at = (dist: number) => {
    const s = Math.max(0, Math.min(cum[cum.length - 1], dist));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = line[i - 1], b = line[i];
    const f = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return {
      coord: [a.longitude + (b.longitude - a.longitude) * f, a.latitude + (b.latitude - a.latitude) * f] as [number, number],
      bearing: bearing(a, b),
    };
  };
  // Cars are drawn enlarged (constant screen size), so they're spaced by their drawn length.
  const lengths = consist.map((m) => SIZE[m].lengthM * modelScaleAt(m, zoom));
  const front = best.along + lengths[0] + lengths[1] / 2;
  const out: { model: VehicleModel; coord: [number, number]; bearing: number; flip: boolean }[] = [];
  let edge = front;
  consist.forEach((m, i) => {
    const centre = edge - lengths[i] / 2;
    const p = at(centre);
    // A commuter set runs its second car turned round (cab at the back).
    out.push({ model: m, coord: p.coord, bearing: p.bearing, flip: m === "train_commuter" && i > 0 });
    edge -= lengths[i];
  });
  return out;
}

// ── Light for the time of day ────────────────────────────────────────────

export type LightPreset = "dawn" | "day" | "dusk" | "night";

/** The sun's elevation (degrees) and whether it's morning, at a place and time. */
export function sunAt(lat: number, lng: number, date = new Date()): { elevation: number; morning: boolean } {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0;      // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let ha = ((gmst + lng / 15) * 15) * rad - ra;
  ha = Math.atan2(Math.sin(ha), Math.cos(ha));                               // -π..π
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return { elevation: el / rad, morning: ha < 0 };
}

/** Mapbox Standard's light preset for the sun's position (civil twilight = dawn / dusk). */
export function lightPresetAt(lat: number, lng: number, date = new Date()): LightPreset {
  const { elevation, morning } = sunAt(lat, lng, date);
  if (elevation > 6) return "day";
  if (elevation > -6) return morning ? "dawn" : "dusk";
  return "night";
}

/** How much the models' lamps, neon and lit signs glow. */
export const EMISSIVE: Record<LightPreset, number> = { day: 0.15, dawn: 0.6, dusk: 0.8, night: 1.0 };
