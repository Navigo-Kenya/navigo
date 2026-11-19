// utils/indoor.ts
//
// The indoor map's pure parts: which venue the map is looking at, which
// levels it has (top floor first, as the picker shows them), and the shapes
// of one level, coloured and labelled for Mapbox.
import type { IndoorFeature, IndoorLevel, IndoorVenue, VenueInView } from "@/services/venues";

/** Indoor maps show from here (a street, a station's platforms). */
export const INDOOR_MIN_ZOOM = 16;
/** ...and stay until the map zooms out past this, so they don't flicker at the edge. */
export const INDOOR_KEEP_ZOOM = 15.5;

/** The same colours as the console, so a door reads the same everywhere. */
export const OPENING_COLORS: Record<string, string> = {
  "pedestrian.principal": "#EA580C",
  "pedestrian.transit": "#7C3AED",
  emergencyexit: "#DC2626",
  service: "#64748B",
  automobile: "#64748B",
  pedestrian: "#059669",
};
export const AMENITY_COLOR = "#2563EB";
const UNIT_FALLBACK = "#F4F4F5";

const OPENING_LABELS: Record<string, string> = {
  "pedestrian.principal": "Main entrance",
  "pedestrian.transit": "To the trains",
  emergencyexit: "Emergency exit",
  service: "Service door",
  automobile: "Vehicle gate",
  pedestrian: "Door",
};

/** A box around the centre that covers about the screen at this zoom. */
export function bboxAround(center: { lat: number; lng: number }, zoom: number): [number, number, number, number] {
  const halfLng = (360 / Math.pow(2, zoom)) * 1.5;
  const halfLat = halfLng * Math.cos((center.lat * Math.PI) / 180);
  return [center.lat - halfLat, center.lng - halfLng, center.lat + halfLat, center.lng + halfLng];
}

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The venue nearest the centre, if one is close enough to be what we're looking at. */
export function pickVenue(
  venues: VenueInView[],
  center: { lat: number; lng: number },
  maxMeters = 700
): VenueInView | null {
  let best: VenueInView | null = null;
  let bestD = Infinity;
  for (const v of venues) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue;
    const d = metersBetween(center, v);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best && bestD <= maxMeters ? best : null;
}

/** Top floor first, as the picker lists them. */
export function levelsTopDown(venue: IndoorVenue): IndoorLevel[] {
  return [...venue.levels].sort((a, b) => b.ordinal - a.ordinal);
}

/** The level to open on: the venue's own default, else street level, else the first. */
export function defaultLevel(venue: IndoorVenue): string | null {
  const ids = new Set(venue.levels.map((l) => l.id));
  if (venue.venue.default_level && ids.has(venue.venue.default_level)) return venue.venue.default_level;
  const byStreet = [...venue.levels].sort((a, b) => Math.abs(a.ordinal) - Math.abs(b.ordinal) || a.ordinal - b.ordinal);
  return byStreet[0]?.id ?? null;
}

/** Pastel floor colours darkened for the night map. */
export function shade(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number, base: number) => Math.round(c * 0.32 + base * 0.68);
  const r = mix((n >> 16) & 255, 0x1f);
  const g = mix((n >> 8) & 255, 0x25);
  const b = mix(n & 255, 0x31);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** What a feature is called when it has no name. */
export function featureLabel(venue: IndoorVenue, f: Pick<IndoorFeature["properties"], "kind" | "category" | "name">): string {
  if (f.name) return f.name;
  if (f.kind === "unit") return venue.labels.units[f.category] ?? "Space";
  if (f.kind === "amenity") return venue.labels.amenities[f.category] ?? "Point";
  return OPENING_LABELS[f.category] ?? "Door";
}

/**
 * One level's shapes for the map, with what the layers read: `color`,
 * `label` (empty when nothing should be written) and `rank` (spaces under
 * doors under points). The venue's outline comes first, as a frame.
 */
export function levelShape(venue: IndoorVenue, levelId: string | null, dark: boolean): GeoJSON.FeatureCollection {
  const rank = { unit: 0, opening: 1, amenity: 2 } as const;
  const features: GeoJSON.Feature[] = [];
  if (venue.venue.outline) {
    features.push({ type: "Feature", geometry: venue.venue.outline, properties: { id: "outline", kind: "outline", color: "", label: "", rank: -1 } });
  }
  for (const f of venue.features.features) {
    const p = f.properties;
    if (!levelId || p.level !== levelId || !f.geometry) continue;
    const color =
      p.kind === "unit" ? shade(venue.colors[p.category] ?? UNIT_FALLBACK, dark)
        : p.kind === "opening" ? OPENING_COLORS[p.category] ?? OPENING_COLORS.pedestrian
          : AMENITY_COLOR;
    // Spaces write their own name only (no "Walkway" over every corridor);
    // points always say what they are.
    const label = p.kind === "unit" ? p.name ?? "" : p.kind === "amenity" ? featureLabel(venue, p) : "";
    features.push({
      type: "Feature",
      id: p.id,
      geometry: f.geometry,
      properties: { id: p.id, kind: p.kind, category: p.category, color, label, rank: rank[p.kind] },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Who is in a space, from the directory. */
export function occupantsOf(venue: IndoorVenue, featureId: string) {
  return venue.occupants.filter((o) => o.unit === featureId);
}
