// services/venues.ts
//
// Indoor maps: venues (a station, a mall) drawn in the console and published
// as versions. The map asks which live venues are in view, then loads the one
// it's looking at: its levels, spaces, doors, points and directory.
import { dedupedGet, fetchApi } from "./apiClient";

export interface VenueInView {
  /** The venue's slug. */
  id: string;
  name: string;
  category: string;
  /** The published version: a new one means a new snapshot. */
  version: number;
  lat: number;
  lng: number;
}

export type IndoorKind = "unit" | "opening" | "amenity";

export interface IndoorLevel {
  id: string;
  /** 0 is the street, 1 the floor above, -1 the one below. */
  ordinal: number;
  name: string;
  short_name: string;
  outdoor: boolean;
  height_m: number;
  /** The floor's outline: its corridor, drawn under the spaces. */
  outline?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

/** How the plan writes a name: | breaks a line; rotate is degrees clockwise on the map. */
export interface IndoorLabel {
  text?: string;
  size?: "s" | "m" | "med" | "l" | "big" | "xl" | "out";
  rotate?: number;
  /** Where it sits, [lng, lat]; else the shape's middle. */
  at?: [number, number];
}

export interface IndoorFeatureProps {
  id: string;
  kind: IndoorKind;
  category: string;
  name?: string;
  /** The level's id. */
  level: string;
  ordinal: number;
  accessible?: boolean;
  label?: IndoorLabel;
  /** A big tenant: its name written larger. */
  anchor?: boolean;
  /** A point's angle (an escalator's way up), degrees clockwise. */
  rotate?: number;
}

/** Who drew the map the venue was traced from: shown with it. */
export interface IndoorSource {
  name: string;
  url?: string | null;
  captured?: string | null;
}

export type IndoorFeature = GeoJSON.Feature<GeoJSON.Geometry, IndoorFeatureProps>;

export interface IndoorOccupant {
  id: string;
  name: string;
  category: string;
  /** The space it's in. */
  unit?: string;
  point?: [number, number];
  hours?: string;
  phone?: string;
  website?: string;
  description?: string;
}

export interface IndoorVenue {
  venue: {
    id: string;
    uuid: string;
    name: string;
    category: string;
    address: string | null;
    stop_id: string | null;
    display_point: GeoJSON.Point;
    outline: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    default_level: string | null;
    source?: IndoorSource | null;
  };
  levels: IndoorLevel[];
  features: { type: "FeatureCollection"; features: IndoorFeature[] };
  occupants: IndoorOccupant[];
  /** Fill colour per space category used in this venue. */
  colors: Record<string, string>;
  labels: {
    units: Record<string, string>;
    amenities: Record<string, string>;
    occupants: Record<string, string>;
  };
}

/** Snapshots by slug and version: a version never changes. */
const snapshots = new Map<string, IndoorVenue>();
/** Venues per box, for 5 minutes (the API caches as long). */
const boxes = new Map<string, { at: number; list: VenueInView[] }>();
const BOX_TTL_MS = 5 * 60_000;

export const VenueService = {
  /** Live venues whose point is in the box. */
  async inView(south: number, west: number, north: number, east: number): Promise<VenueInView[]> {
    const bbox = [south, west, north, east].map((v) => v.toFixed(4)).join(",");
    const hit = boxes.get(bbox);
    if (hit && Date.now() - hit.at < BOX_TTL_MS) return hit.list;
    const res = await dedupedGet(`venues:${bbox}`, () =>
      fetchApi<{ data: VenueInView[] }>("/venues", { params: { bbox } })
    );
    const list = res?.data ?? [];
    if (boxes.size > 200) boxes.clear();
    boxes.set(bbox, { at: Date.now(), list });
    return list;
  },

  /** The published venue; cached for the life of the app, per version. */
  async get(slug: string, version: number): Promise<IndoorVenue> {
    const key = `${slug}@${version}`;
    const hit = snapshots.get(key);
    if (hit) return hit;
    const venue = await dedupedGet(`venue:${key}`, () =>
      fetchApi<IndoorVenue>(`/venues/${encodeURIComponent(slug)}`)
    );
    snapshots.set(key, venue);
    return venue;
  },
};
