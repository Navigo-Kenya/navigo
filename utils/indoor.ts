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

/** A level's corridor, the colour the floor reads in: the outline everything else sits on. */
const FLOOR = "#F4F1E8";

/** The symbols drawn for points (assets/images/indoor), the same as the console's. */
export const POINT_ICONS = [
  "escalator", "elevator", "stairs", "restroom", "atm", "parking", "rideshare", "taxi", "bus", "information", "ticketing",
  "firstaid", "security", "bench", "drinkingfountain", "babychanging", "wheelchairassist", "wifi", "exhibit",
] as const;
export const iconOf = (category: string) => `indoor-${(POINT_ICONS as readonly string[]).includes(category) ? category : "default"}`;

/** Label sizes (the plan's names) in pixels at zoom 19; they grow and shrink with the zoom. */
export const LABEL_PX: Record<string, number> = { s: 10, m: 11.5, med: 12.5, l: 13.5, big: 15.5, xl: 17.5, out: 11 };

/**
 * One level's shapes for the map, with what the layers read:
 *   - `floor` (the level's outline: its corridor) and `outline` (the venue's) first;
 *   - spaces, doors and points with `color`, `icon` (points), `rotate` (a point's angle) and `rank`
 *     (spaces under doors under points);
 *   - `label`: the name as the plan writes it (| breaks a line), empty when nothing should be
 *     written, with its `px` size and `labelRotate` angle;
 *   - `label` features: names the plan places itself, at their own point.
 */
export function levelShape(venue: IndoorVenue, levelId: string | null, dark: boolean): GeoJSON.FeatureCollection {
  const rank = { unit: 0, opening: 1, amenity: 2 } as const;
  const features: GeoJSON.Feature[] = [];
  const level = venue.levels.find((l) => l.id === levelId);
  if (level?.outline) {
    features.push({ type: "Feature", geometry: level.outline, properties: { id: `floor-${level.id}`, kind: "floor", color: shade(FLOOR, dark), label: "", rank: -2 } });
  }
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
    const px = LABEL_PX[p.label?.size ?? (p.anchor ? "med" : "m")] ?? LABEL_PX.m;
    // Spaces write their name (or the plan's label for it), never a category over every corridor;
    // points say it with their symbol, and their name if they have one.
    const text = p.kind === "opening" ? "" : (p.label?.text ?? p.name ?? "").replace(/\|/g, "\n");
    const placed = !!p.label?.at;
    features.push({
      type: "Feature",
      id: p.id,
      geometry: f.geometry,
      properties: {
        id: p.id, kind: p.kind, category: p.category, color, rank: rank[p.kind],
        icon: p.kind === "amenity" ? iconOf(p.category) : "",
        rotate: p.rotate ?? 0,
        label: placed ? "" : text,
        px,
        labelRotate: p.label?.rotate ?? 0,
      },
    });
    if (placed && text) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: p.label!.at! },
        properties: { id: `label-${p.id}`, of: p.id, kind: "label", label: text, px, labelRotate: p.label?.rotate ?? 0, rank: 3 },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export interface IndoorHit {
  /** The space (or point) to show. */
  featureId: string;
  levelId: string;
  title: string;
  /** What it is, and where: "Supermarket · Lower Ground". */
  sub: string;
  /** Lower is better: an exact name, then a name starting with it, then anywhere in it. */
  score: number;
}

/** Shops, spaces and points matching what's typed, on every floor; the best first. */
export function searchVenue(venue: IndoorVenue, query: string, limit = 40): IndoorHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const byId = new Map(venue.features.features.map((f) => [f.properties.id, f]));
  const levelName = new Map(venue.levels.map((l) => [l.id, l.name]));
  const score = (t: string) => {
    const s = t.toLowerCase();
    if (s === q) return 0;
    if (s.startsWith(q)) return 1;
    if (s.split(/[\s\-&/()]+/).some((w) => w.startsWith(q))) return 2;
    return s.includes(q) ? 3 : -1;
  };
  const hits = new Map<string, IndoorHit>();
  const add = (featureId: string, title: string, what: string) => {
    const f = byId.get(featureId);
    const sc = score(title);
    if (!f || sc < 0) return;
    const key = `${featureId}:${title.toLowerCase()}`;
    const prev = hits.get(key);
    if (prev && prev.score <= sc) return;
    hits.set(key, { featureId, levelId: f.properties.level, title, sub: [what, levelName.get(f.properties.level)].filter(Boolean).join(" · "), score: sc });
  };
  for (const o of venue.occupants) {
    if (o.unit) add(o.unit, o.name, venue.labels.occupants[o.category] ?? "");
  }
  for (const f of venue.features.features) {
    const p = f.properties;
    if (p.kind === "opening" && !p.name) continue;
    const title = p.name ?? (p.kind === "amenity" ? featureLabel(venue, p) : null);
    if (title) add(p.id, title, p.kind === "unit" ? venue.labels.units[p.category] ?? "" : p.kind === "amenity" ? (p.name ? featureLabel(venue, { ...p, name: undefined }) : "") : "Door");
  }
  return [...hits.values()].sort((a, b) => a.score - b.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/** A point to fly to for a shape: the middle of its corners' box. */
export function middleOf(g: GeoJSON.Geometry): [number, number] | null {
  const pts: number[][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((g as { coordinates?: unknown }).coordinates);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** Who is in a space, from the directory. */
export function occupantsOf(venue: IndoorVenue, featureId: string) {
  return venue.occupants.filter((o) => o.unit === featureId);
}
