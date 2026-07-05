// Test kit for NavigationEngine golden-trace tests.
// Builds synthetic routes/GPS traces and replays recorded ones (the JSON
// exported by services/traceRecorder.ts — see fixtures/README.md).
import { NavigationEngine, EngineResult, NavStep } from "../navigationEngine";

export type LngLat = [number, number];

const M_PER_DEG_LAT = 111_320;

/** Offset a [lng,lat] point by metres east/north (flat-earth, fine at test scale). */
export function offsetMeters([lng, lat]: LngLat, eastM: number, northM: number): LngLat {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return [lng + eastM / (M_PER_DEG_LAT * cosLat), lat + northM / M_PER_DEG_LAT];
}

/** Straight polyline heading north from `start`, one vertex every `stepM`. */
export function lineNorth(start: LngLat, lengthM: number, stepM = 50): LngLat[] {
  const pts: LngLat[] = [];
  for (let d = 0; d <= lengthM; d += stepM) pts.push(offsetMeters(start, 0, d));
  return pts;
}

export interface LegSpec {
  type: "WALK" | "BUS";
  lengthM: number;
  /** Transit legs: place a stop every N metres (including both ends). */
  stopEveryM?: number;
  durationS?: number;
}

export interface BuiltJourney {
  coords: LngLat[];
  steps: NavStep[];
  totalM: number;
  /** Cumulative end offset of each leg (m). */
  legEnds: number[];
}

/** Build a straight multi-leg journey heading north (mirrors useNavigation's engine input). */
export function buildJourney(start: LngLat, legs: LegSpec[], stepM = 50): BuiltJourney {
  const coords: LngLat[] = [start];
  const steps: NavStep[] = [];
  const legEnds: number[] = [];
  let cursor = 0;

  for (const leg of legs) {
    const from = cursor;
    for (let d = stepM; d <= leg.lengthM; d += stepM) {
      coords.push(offsetMeters(start, 0, from + d));
    }
    cursor = from + leg.lengthM;
    legEnds.push(cursor);

    const stops =
      leg.type !== "WALK" && leg.stopEveryM
        ? Array.from({ length: Math.floor(leg.lengthM / leg.stopEveryM) + 1 }, (_, i) => {
            const [lng, lat] = offsetMeters(start, 0, from + i * leg.stopEveryM!);
            return { name: `Stop ${i}`, lat, lng };
          })
        : [];

    const [endLng, endLat] = offsetMeters(start, 0, cursor);
    steps.push({
      instruction: leg.type === "WALK" ? "Walk" : "Ride the bus",
      distance: leg.lengthM,
      duration: leg.durationS ?? (leg.type === "WALK" ? leg.lengthM / 1.4 : leg.lengthM / 8),
      location: [endLng, endLat],
      type: leg.type,
      stops,
    });
  }

  return { coords, steps, totalM: cursor, legEnds };
}

export interface TraceFix {
  lng: number;
  lat: number;
  speed: number;
}

/** Fixes marching north along the journey at fixed spacing, with optional per-fix east drift. */
export function marchTrace(
  start: LngLat,
  fromM: number,
  toM: number,
  spacingM: number,
  speed: number,
  eastDriftM: (atM: number) => number = () => 0,
): TraceFix[] {
  const out: TraceFix[] = [];
  for (let d = fromM; d <= toM; d += spacingM) {
    const [lng, lat] = offsetMeters(start, eastDriftM(d), d);
    out.push({ lng, lat, speed });
  }
  return out;
}

export interface ReplayTick {
  fix: TraceFix;
  result: EngineResult;
}

/** Feed a trace through the engine exactly like useNavigation does (stepIndex carried forward). */
export function replay(engine: NavigationEngine, trace: TraceFix[]): ReplayTick[] {
  let stepIndex = 0;
  return trace.map((fix) => {
    const result = engine.update(fix.lng, fix.lat, fix.speed, stepIndex);
    stepIndex = result.stepIndex;
    return { fix, result };
  });
}

/** Recorded-trace JSON shape exported by services/traceRecorder.ts. */
export interface RecordedTraceFile {
  version: 1;
  route: { coords: LngLat[]; steps: NavStep[] };
  fixes: { t: number; lat: number; lng: number; speed: number }[];
}

export function replayRecorded(file: RecordedTraceFile): ReplayTick[] {
  const engine = new NavigationEngine(file.route.coords, file.route.steps);
  return replay(
    engine,
    file.fixes.map((f) => ({ lng: f.lng, lat: f.lat, speed: f.speed })),
  );
}
