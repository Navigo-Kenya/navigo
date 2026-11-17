// utils/landmarks.ts
//
// Landmark-anchored guidance (API: LandmarkService). Riders navigate by
// landmarks, not stop codes: "alight just after Sarit Centre", "the stage
// opposite Kenyatta Hospital", "turn left after the Total station".
// Pure helpers, shared by the step builder, the ride feed and voice.

export type LandmarkRelation = "at" | "next_to" | "opposite" | "before" | "after" | "near";

export interface Landmark {
  id: number | null;
  name: string;
  category: string | null;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  relation: LandmarkRelation;
  /** English fragment, e.g. "just after Sarit Centre". */
  text: string;
}

export interface AlongLandmark {
  id: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  /** Metres from the start of the leg. */
  progress_m: number;
  /** 0–1 along the leg. */
  progress: number;
  side: "left" | "right";
}

/** API landmark, or the older free-text stop landmark. */
export function asLandmark(v: unknown): Landmark | null {
  if (!v) return null;
  if (typeof v === "string") {
    const name = v.trim();
    return name
      ? { id: null, name, category: null, lat: null, lng: null, distance_m: null, relation: "near", text: `near ${name}` }
      : null;
  }
  const o = v as Partial<Landmark>;
  if (!o.name) return null;
  return {
    id: o.id ?? null,
    name: o.name,
    category: o.category ?? null,
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    distance_m: o.distance_m ?? null,
    relation: (o.relation as LandmarkRelation) ?? "near",
    text: o.text || `near ${o.name}`,
  };
}

/**
 * Appends the landmark to an instruction ("Turn left onto Kimathi St, after
 * Java House"), unless the instruction already names it (Google's walking
 * directions often do: "Turn right at Pathfinder International").
 */
export function withLandmark(instruction: string, lm: Landmark | null | undefined): string {
  if (!lm) return instruction;
  const base = instruction.trim().replace(/[.,;]+$/, "");
  if (base.toLowerCase().includes(lm.name.toLowerCase())) return base;
  return `${base}, ${lm.text}`;
}

// ── Position along a leg ─────────────────────────────────────────────────────

const M_PER_DEG = 111_320;

/** Metres along `coords` ([lat, lng]) of the closest point to `p`. */
export function progressAlong(
  coords: [number, number][],
  p: { latitude: number; longitude: number }
): number {
  if (coords.length < 2) return 0;
  const kx = Math.cos((coords[0][0] * Math.PI) / 180) * M_PER_DEG;
  const px = p.longitude * kx;
  const py = p.latitude * M_PER_DEG;
  let cum = 0;
  let best = { d2: Infinity, progress: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][1] * kx, ay = coords[i][0] * M_PER_DEG;
    const bx = coords[i + 1][1] * kx, by = coords[i + 1][0] * M_PER_DEG;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d2 = (px - qx) ** 2 + (py - qy) ** 2;
    if (d2 < best.d2) best = { d2, progress: cum + t * len };
    cum += len;
  }
  return best.progress;
}

// ── Ride feed ────────────────────────────────────────────────────────────────

/** Within this many metres of a landmark (along the leg) we're "passing" it. */
export const PASSING_WINDOW_M = 90;
/** How many stops before alighting the "get ready" cue appears. */
export const ALIGHT_CUE_STOPS = 2;

export interface RideCue {
  /** Landmark being passed right now. */
  passing: AlongLandmark | null;
  /** Next landmark ahead and its distance. */
  next: { landmark: AlongLandmark; inM: number } | null;
  /** "Alight at Westlands, just after Oryx Energies" once close. */
  alight: string | null;
}

export function rideCue(input: {
  along: AlongLandmark[] | undefined;
  progressM: number;
  stopsRemaining: number | null;
  alightStopName: string;
  alightLandmark: Landmark | null;
}): RideCue {
  const along = input.along ?? [];
  let passing: AlongLandmark | null = null;
  let next: RideCue["next"] = null;
  for (const lm of along) {
    const d = lm.progress_m - input.progressM;
    if (Math.abs(d) <= PASSING_WINDOW_M) {
      passing = lm;
    } else if (d > PASSING_WINDOW_M && !next) {
      next = { landmark: lm, inM: Math.round(d) };
    }
  }
  const close =
    input.stopsRemaining != null && input.stopsRemaining > 0 && input.stopsRemaining <= ALIGHT_CUE_STOPS;
  const alight = close
    ? withLandmark(`Alight at ${input.alightStopName}`, input.alightLandmark)
    : null;
  return { passing, next, alight };
}
