// services/hazardsAhead.ts
//
// Waze's best habit, for Navigo's road reports: what's reported on the way
// ahead, said once at a sensible distance, and "Still there?" once you've
// passed it, so the map stays honest.
//
// A report counts when it lies within 40 m of the route line; it's placed
// at its distance along the route, so "ahead" means ahead on the way, not
// as the crow flies. Which reports matter depends on how you travel: a
// driver wants accidents and police checks, someone on foot wants floods
// and security; a passenger only sees them (they're not driving).
import type { LegKind, Role } from "./navProfile";
import type { ReportType } from "@/components/icons/reportIcons";

type LatLng = [number, number]; // [lat, lng]

export interface HazardReport {
  id: string;
  type: ReportType | string;
  lat: number;
  lng: number;
  source?: "community" | "tomtom";
  upvotes?: number;
  created_at?: string;
}

export interface PlacedHazard extends HazardReport {
  /** Distance along the route from its start (m). */
  alongM: number;
}

export const CORRIDOR_M = 40;

/** Cumulative distance along a polyline (m), one entry per point. */
export function cumulative(coords: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + dist(coords[i - 1], coords[i]));
  return out;
}

/** The reports near the route line, placed along it, in order. */
export function placeHazards(coords: LatLng[], reports: HazardReport[], corridorM = CORRIDOR_M): PlacedHazard[] {
  if (coords.length < 2) return [];
  const cum = cumulative(coords);
  const out: PlacedHazard[] = [];
  for (const r of reports) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    let best = Infinity;
    let along = 0;
    for (let i = 1; i < coords.length; i++) {
      const { d, t } = toSegment([r.lat, r.lng], coords[i - 1], coords[i]);
      if (d < best) {
        best = d;
        along = cum[i - 1] + t * (cum[i] - cum[i - 1]);
      }
    }
    if (best <= corridorM) out.push({ ...r, alongM: along });
  }
  return out.sort((a, b) => a.alongM - b.alongM);
}

/** What each way of travelling is warned about. */
const RELEVANT: Record<LegKind, ReportType[]> = {
  car: ["accident", "road_blocked", "police_check", "flooded_route", "breakdown", "traffic_jam"],
  motorbike: ["accident", "road_blocked", "police_check", "flooded_route", "breakdown", "traffic_jam"],
  bicycle: ["accident", "road_blocked", "flooded_route", "security"],
  walk: ["flooded_route", "security", "road_blocked"],
  transit: ["accident", "road_blocked", "flooded_route", "traffic_jam"],
};

export function isRelevant(type: string, kind: LegKind): boolean {
  return (RELEVANT[kind] as string[]).includes(type);
}

/** How far ahead to warn: about 30 s ahead in a vehicle, a block ahead on foot. */
export function warnDistance(kind: LegKind, speedMps: number): number {
  switch (kind) {
    case "walk": return 150;
    case "bicycle": return 250;
    case "transit": return 800;
    default: return Math.min(1000, Math.max(400, speedMps * 30));
  }
}

/** Whether the warning is spoken: to whoever is in control, not to passengers. */
export function speaksHazard(kind: LegKind, role: Role): boolean {
  return role === "driver" && kind !== "transit";
}

/** Waze-like words: "Accident reported ahead, 400 metres." */
export function hazardText(type: string, aheadM: number): string {
  const d = aheadM >= 1000 ? `${(aheadM / 1000).toFixed(1)} kilometres` : `${Math.max(50, Math.round(aheadM / 50) * 50)} metres`;
  switch (type) {
    case "accident": return `Accident reported ahead, ${d}.`;
    case "road_blocked": return `Road reported blocked ahead, ${d}.`;
    case "police_check": return `Police check reported ahead, ${d}.`;
    case "flooded_route": return `Flooding reported ahead, ${d}.`;
    case "breakdown": return `Vehicle stopped on the road ahead, ${d}.`;
    case "traffic_jam": return `Heavy traffic reported ahead, ${d}.`;
    case "security": return `Security incident reported ahead, ${d}. Stay alert.`;
    default: return `Report ahead, ${d}.`;
  }
}

/** Short label for the card: "Accident", "Police check". */
export function hazardLabel(type: string): string {
  switch (type) {
    case "accident": return "Accident";
    case "road_blocked": return "Road blocked";
    case "police_check": return "Police check";
    case "flooded_route": return "Flooding";
    case "breakdown": return "Vehicle stopped";
    case "traffic_jam": return "Heavy traffic";
    case "security": return "Security incident";
    case "stage_queue": return "Long queue";
    case "fare_hike": return "Fare hike";
    default: return "Report";
  }
}

/**
 * The next relevant hazard ahead within the warning distance, and the one
 * just passed (to ask "Still there?"), from the progress along the route.
 */
export function hazardsNear(
  placed: PlacedHazard[],
  progressM: number,
  kind: LegKind,
  speedMps: number,
): { ahead: (PlacedHazard & { aheadM: number }) | null; passed: PlacedHazard | null } {
  const warn = warnDistance(kind, speedMps);
  let ahead: (PlacedHazard & { aheadM: number }) | null = null;
  let passed: PlacedHazard | null = null;
  for (const h of placed) {
    if (!isRelevant(String(h.type), kind)) continue;
    const d = h.alongM - progressM;
    if (d >= -10 && d <= warn && !ahead) ahead = { ...h, aheadM: Math.max(0, d) };
    // Passed within the last 30–200 m: close enough to have seen it.
    if (d < -30 && d >= -200 && h.source !== "tomtom") passed = h;
  }
  return { ahead, passed };
}

// ── geometry ─────────────────────────────────────────────────────────────────

function dist(a: LatLng, b: LatLng): number {
  const kx = 111_320 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.hypot((b[1] - a[1]) * kx, (b[0] - a[0]) * 110_540);
}

/** Distance from p to the segment a–b (m), and where along it (0–1). */
function toSegment(p: LatLng, a: LatLng, b: LatLng): { d: number; t: number } {
  const kx = 111_320 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110_540;
  const ax = a[1] * kx, ay = a[0] * ky, bx = b[1] * kx, by = b[0] * ky, px = p[1] * kx, py = p[0] * ky;
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return { d: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)), t };
}
