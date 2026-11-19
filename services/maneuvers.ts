// services/maneuvers.ts
//
// Turn-by-turn on street legs (walking, cycling, car, boda).
//
// Each leg carries its manoeuvres (`walk_steps`: "Turn left onto Ngong Road",
// with the point where the turn is). They're placed along the leg once, in
// metres from its start; from then on, the engine's progress along the route
// gives the next turn and the distance to it, along the road (not as the crow
// flies, which is what made the old "nearest step" banner jump between turns).
//
// Cues are timed to the mode and the speed: a walker hears "In 60 metres…",
// a driver at 80 km/h hears it about 20 seconds ahead.
import { detectManeuver, type Maneuver } from "@/utils/mapHelpers";
import { asLandmark, withLandmark } from "@/utils/landmarks";
import type { LegKind } from "./navProfile";

type LatLng = [number, number]; // [lat, lng], as in RouteSegment.coordinates

export interface LegTurn {
  /** Index in the leg's walk_steps. */
  index: number;
  /** "Turn left onto Kimathi St, after Java House" */
  instruction: string;
  maneuver: Maneuver;
  /** "after Java House", when the API found a landmark at the turn. */
  landmarkText: string | null;
  /** Distance from the leg's start (m). */
  offsetM: number;
}

export type TurnCue = "far" | "near" | "now";

export const CUE_RANK: Record<TurnCue, number> = { far: 1, near: 2, now: 3 };

// ── Geometry ─────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;

function metres(a: LatLng, b: LatLng): number {
  const k = Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  const dy = (b[0] - a[0]) * M_PER_DEG_LAT;
  const dx = (b[1] - a[1]) * M_PER_DEG_LNG * k;
  return Math.hypot(dx, dy);
}

/** Cumulative distance (m) at each vertex of a [lat, lng] polyline. */
export function cumulative(coords: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
  return cum;
}

/** Closest point of segment AB to P, in a local metric frame: t in [0, 1] and the distance (m). */
function project(p: LatLng, a: LatLng, b: LatLng): { t: number; d: number } {
  const k = Math.cos(a[0] * (Math.PI / 180));
  const ax = 0, ay = 0;
  const bx = (b[1] - a[1]) * M_PER_DEG_LNG * k, by = (b[0] - a[0]) * M_PER_DEG_LAT;
  const px = (p[1] - a[1]) * M_PER_DEG_LNG * k, py = (p[0] - a[0]) * M_PER_DEG_LAT;
  const ab2 = bx * bx + by * by;
  const t = ab2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / ab2)) : 0;
  return { t, d: Math.hypot(px - t * bx, py - t * by) };
}

/**
 * Where each manoeuvre sits along the leg (m from its start), in order and
 * never going backwards. A route can pass the same corner twice (a loop
 * round a block): the search starts from the previous turn and takes the
 * first pass that lies on the line.
 */
export function placeTurns(coords: LatLng[], points: { lat: number; lng: number }[]): number[] {
  if (coords.length < 2) return points.map(() => 0);
  const cum = cumulative(coords);
  const out: number[] = [];
  let from = 0;
  for (const pt of points) {
    const p: LatLng = [pt.lat, pt.lng];
    const prev = out.length ? out[out.length - 1] : 0;
    let best = { d: Infinity, seg: from, off: prev };
    for (let i = from; i < coords.length - 1; i++) {
      const { t, d } = project(p, coords[i], coords[i + 1]);
      const off = cum[i] + t * (cum[i + 1] - cum[i]);
      if (off < prev - 1) continue; // behind the previous turn
      if (d < best.d) best = { d, seg: i, off };
      if (d < 3) break; // on the line: this pass is the one
    }
    out.push(Math.max(prev, best.off));
    from = best.seg;
  }
  return out;
}

/** The leg's turns, placed along it. */
export function legTurns(
  coords: LatLng[],
  steps: { instruction: string; lat: number; lng: number; landmark?: unknown }[] | null | undefined,
): LegTurn[] {
  const list = (steps ?? []).filter((s) => s && typeof s.lat === "number" && typeof s.lng === "number" && (s.lat !== 0 || s.lng !== 0));
  const offsets = placeTurns(coords, list);
  return list.map((s, i) => {
    const lm = asLandmark(s.landmark);
    return {
      index: i,
      instruction: withLandmark(String(s.instruction ?? "Continue").replace(/\.$/, ""), lm),
      maneuver: detectManeuver(String(s.instruction ?? "")),
      landmarkText: lm?.text ?? null,
      offsetM: offsets[i],
    };
  });
}

// ── The next turn and its cues ───────────────────────────────────────────────

/**
 * How far before a turn point it counts as made, per kind. GPS fixes are
 * smoothed, so progress runs a few metres behind the user; a driver is past
 * the corner before the projection is.
 */
export const REACHED_M: Record<LegKind, number> = { walk: 6, bicycle: 10, car: 15, motorbike: 15, transit: 0 };

/** The index (in `turns`) of the next turn ahead, or -1 once past the last one. */
export function nextTurnIndex(turns: LegTurn[], progressM: number, kind: LegKind): number {
  const reached = REACHED_M[kind];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].offsetM > progressM + reached) return i;
  }
  return -1;
}

export interface CueDistances {
  /** Early warning (fast roads only), else null. */
  far: number | null;
  near: number;
  now: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * When to speak, by kind and speed. On foot and on a bike the distances are
 * fixed; in a vehicle they follow the speed (about 18 s and 5 s ahead, an
 * extra minute's warning above 60 km/h), so a driver on Mombasa Road gets as
 * much time to change lanes as one crawling through town.
 */
export function cueDistances(kind: LegKind, speedMps: number): CueDistances {
  switch (kind) {
    case "walk": return { far: null, near: 60, now: 15 };
    case "bicycle": return { far: null, near: 150, now: 35 };
    default: {
      const v = Math.max(speedMps, 8); // ~30 km/h: town speed when stopped at lights
      return {
        far: v >= 16.7 ? Math.round((v * 60) / 100) * 100 : null,
        near: clamp(v * 18, 250, 800),
        now: clamp(v * 5, 50, 200),
      };
    }
  }
}

export function cueFor(distanceM: number, d: CueDistances): TurnCue | null {
  if (distanceM <= d.now) return "now";
  if (distanceM <= d.near) return "near";
  if (d.far != null && distanceM <= d.far) return "far";
  return null;
}

/** Two turns this close are spoken together: "Turn left, then turn right". */
export function chainDistance(kind: LegKind, d: CueDistances): number {
  switch (kind) {
    case "walk": return 25;
    case "bicycle": return 60;
    default: return Math.max(80, d.now);
  }
}

// ── Words ────────────────────────────────────────────────────────────────────

/** Distances as people say them: 40 metres, 250 metres, 1.5 kilometres. */
export function spokenDistance(m: number): string {
  if (m < 100) return `${Math.max(10, Math.round(m / 10) * 10)} metres`;
  if (m < 1000) return `${Math.round(m / 50) * 50} metres`;
  const km = Math.round(m / 100) / 10;
  return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} kilometre${km === 1 ? "" : "s"}`;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

export function turnSpeech(cue: TurnCue, turn: LegTurn, distanceM: number, then?: LegTurn | null): string {
  if (cue === "now") return then ? `${turn.instruction}, then ${lowerFirst(then.instruction)}` : turn.instruction;
  return `In ${spokenDistance(distanceM)}, ${lowerFirst(turn.instruction)}`;
}

const RIDER_WORD: Record<Maneuver, string> = {
  "turn-left": "Left",
  "turn-right": "Right",
  "slight-left": "Keep left",
  "slight-right": "Keep right",
  "sharp-left": "Sharp left",
  "sharp-right": "Sharp right",
  "u-turn": "U-turn",
  roundabout: "Roundabout",
  merge: "Merge",
  cross: "Cross",
  start: "Go",
  straight: "Straight on",
};

/**
 * The boda passenger's card: one big word to show the rider, and where
 * ("Left · after Total", "Roundabout · 2nd exit onto Ngong Road").
 */
export function riderCue(turn: LegTurn): { word: string; detail: string | null } {
  const word = RIDER_WORD[turn.maneuver] ?? "Straight on";
  const exit = turn.instruction.match(/(\d+(?:st|nd|rd|th)) exit(?: onto ([^,]+))?/i);
  if (turn.maneuver === "roundabout" && exit) {
    return { word, detail: exit[2] ? `${exit[1]} exit onto ${exit[2].trim()}` : `${exit[1]} exit` };
  }
  if (turn.landmarkText) return { word, detail: turn.landmarkText };
  const street = turn.instruction.match(/\b(?:onto|on|into)\s+([^,]+)/i);
  return { word, detail: street ? `onto ${street[1].trim()}` : null };
}

// ── Passengers: is the vehicle taking them away? ─────────────────────────────

/**
 * A passenger can't turn, but should know when the car or boda is carrying
 * them away from where they're going (a detour, the wrong direction, worse).
 * "Away" = the straight-line distance to the destination has grown by more
 * than AWAY_M over the last two minutes while moving; it clears once the
 * destination has been getting closer for 20 seconds (a detour that comes
 * back, or the driver turning round).
 */
export const AWAY_M = 350;
const AWAY_WINDOW_MS = 120_000;
const CLOSING_MS = 20_000;
const CLOSING_M = 30;

export class AwayTracker {
  private samples: { t: number; d: number }[] = [];
  private away = false;

  reset() {
    this.samples = [];
    this.away = false;
  }

  /** Feed the distance (m) to the destination; returns whether the vehicle is heading away. */
  update(nowMs: number, distanceToEndM: number, speedMps: number): boolean {
    this.samples.push({ t: nowMs, d: distanceToEndM });
    while (this.samples.length && nowMs - this.samples[0].t > AWAY_WINDOW_MS) this.samples.shift();
    if (this.away) {
      if (this.closing()) {
        this.away = false;
        this.samples = [{ t: nowMs, d: distanceToEndM }]; // start over, or it would flag again at once
      }
    } else {
      const min = Math.min(...this.samples.map((s) => s.d));
      if (speedMps >= 3 && distanceToEndM - min >= AWAY_M) this.away = true;
    }
    return this.away;
  }

  /** The last 20 s brought the destination closer. */
  private closing(): boolean {
    const last = this.samples[this.samples.length - 1];
    let ref: { t: number; d: number } | undefined;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (last.t - this.samples[i].t >= CLOSING_MS) { ref = this.samples[i]; break; }
    }
    return ref ? last.d < ref.d - CLOSING_M : false;
  }
}

/**
 * The banner's words for an instruction, Google Maps' way: the street
 * large, the verb small above it, the landmark under it.
 *   "Turn left onto Kimathi St, after Java House"
 *     → { verb: "Turn left onto", street: "Kimathi St", landmark: "after Java House" }
 *   "Turn left" → { verb: "Turn left", street: null, landmark: null }
 */
export function splitInstruction(
  instruction: string,
  landmarkText?: string | null,
): { verb: string; street: string | null; landmark: string | null } {
  let text = String(instruction ?? "").trim().replace(/\.$/, "");
  let landmark: string | null = null;
  if (landmarkText && text.endsWith(`, ${landmarkText}`)) {
    text = text.slice(0, -(landmarkText.length + 2)).trim();
    landmark = landmarkText;
  } else {
    const lm = text.match(/,\s*((?:after|before|past|opposite|near|by)\s+.+)$/i);
    if (lm && lm.index != null) {
      landmark = lm[1].trim();
      text = text.slice(0, lm.index).trim();
    }
  }
  // The strongest preposition wins: "Turn right to stay on Moi Ave" is about Moi Ave.
  for (const rx of [/^(.*\b(?:onto|into))\s+(.+)$/i, /^(.*?\bon)\s+(.+)$/i, /^(.*?\btowards?)\s+(.+)$/i, /^(.*?\bto)\s+(.+)$/i, /^(Arrive at)\s+(.+)$/i]) {
    const m = text.match(rx);
    if (m && m[2].trim().length > 1) return { verb: m[1].trim(), street: m[2].trim(), landmark };
  }
  return { verb: text, street: null, landmark };
}
