import type { LatLng } from "@/providers/map/types";
import { getRouteColor } from "@/utils/mapHelpers";

// ── Overlay types ─────────────────────────────────────────────────────────────

export interface WalkLeg          { id: string; coords: LatLng[] }
export interface TransitLeg {
  id: string;
  coords: LatLng[];
  color: string;
  /** Segment mode (BUS, RAIL, CAR, MOTORBIKE…) and route, for the 3D vehicle in navigation. */
  mode?: string;
  routeId?: string | null;
  routeName?: string | null;
}
export interface NodeMarker       { id: string; coord: LatLng; name: string; color: string }
export interface LocMarker        { id: string; coord: LatLng; name: string; isStart: boolean }
export interface IntermediateStop { id: string; coord: LatLng; color: string; name: string; routeName: string }

// ── Utilities ─────────────────────────────────────────────────────────────────

// Force valid hex colors for the map engine.
export function sanitizeHex(color: string | null | undefined, fallbackName: string): string {
  if (!color) return getRouteColor(fallbackName);
  let clean = color.trim();
  if (!clean.startsWith("#")) clean = "#" + clean;
  const isValid = /^#([0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(clean);
  return isValid ? clean : getRouteColor(fallbackName);
}

// Projects a lat/lng point onto the nearest segment of a polyline.
// Keeps intermediate-stop dots exactly on the route line regardless of
// how far the GTFS stop is from the road-snapped geometry.
export function projectOntoPolyline(point: LatLng, polyline: LatLng[]): LatLng {
  let bestDist = Infinity;
  let best = point;
  const px = point.longitude, py = point.latitude;

  for (let i = 0; i < polyline.length - 1; i++) {
    const ax = polyline[i].longitude,  ay = polyline[i].latitude;
    const bx = polyline[i + 1].longitude, by = polyline[i + 1].latitude;
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    const qx = ax + t * abx, qy = ay + t * aby;
    const d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bestDist) { bestDist = d; best = { latitude: qy, longitude: qx }; }
  }
  return best;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_REGION = {
  latitude:      -1.286389,
  longitude:     36.817223,
  latitudeDelta:  360 / Math.pow(2, 13),
  longitudeDelta: 360 / Math.pow(2, 13),
};
