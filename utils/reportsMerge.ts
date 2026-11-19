// utils/reportsMerge.ts
//
// The reports on the map across viewport fetches. Each fetch answers for
// its own bounds only, so replacing the whole list made pins blink out
// (panning back and forth, a slow answer for an older viewport, a zoom-in
// fetch dropping everything around it). Instead:
//   - inside the fetched bounds, the fresh answer is the truth (resolved and
//     dismissed reports go);
//   - outside them, what we had stays, until it expires;
//   - when nothing changed, the same array comes back, so the map's source
//     isn't re-sent and the pins don't fade out and in again.
import type { TransitReport } from "@/services/report";

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** At most this many reports are kept around (the newest first). */
export const MAX_KEPT_REPORTS = 400;

const expired = (r: TransitReport, now: number) => {
  const t = r.expires_at ? Date.parse(r.expires_at) : NaN;
  return Number.isFinite(t) && t <= now;
};

export function inBounds(r: { lat: number; lng: number }, b: Bounds): boolean {
  if (r.lat > b.north || r.lat < b.south) return false;
  // Across the antimeridian, west > east.
  return b.west <= b.east ? r.lng >= b.west && r.lng <= b.east : r.lng >= b.west || r.lng <= b.east;
}

const sameReport = (a: TransitReport, b: TransitReport) =>
  a.id === b.id &&
  a.type === b.type &&
  a.lat === b.lat &&
  a.lng === b.lng &&
  a.upvotes === b.upvotes &&
  a.downvotes === b.downvotes &&
  (a.my_vote ?? null) === (b.my_vote ?? null) &&
  a.expires_at === b.expires_at &&
  a.reliability === b.reliability;

export function mergeViewportReports(
  prev: TransitReport[],
  fresh: TransitReport[],
  bounds: Bounds,
  now = Date.now(),
  cap = MAX_KEPT_REPORTS
): TransitReport[] {
  const seen = new Set<string>();
  const next: TransitReport[] = [];
  for (const r of fresh) {
    if (seen.has(r.id) || expired(r, now) || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    seen.add(r.id);
    next.push(r);
  }
  const kept = prev.filter((r) => !seen.has(r.id) && !inBounds(r, bounds) && !expired(r, now));
  // Newest first beyond the cap; the fresh answer always stays whole.
  kept.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  for (const r of kept) {
    if (next.length >= Math.max(cap, fresh.length)) break;
    next.push(r);
  }

  if (next.length === prev.length) {
    const byId = new Map(prev.map((r) => [r.id, r]));
    if (next.every((r) => { const p = byId.get(r.id); return p != null && sameReport(p, r); })) return prev;
  }
  return next;
}
