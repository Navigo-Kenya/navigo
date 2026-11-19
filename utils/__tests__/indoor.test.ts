import type { IndoorVenue, VenueInView } from "@/services/venues";
import {
  bboxAround, defaultLevel, featureLabel, levelShape, levelsTopDown, metersBetween, occupantsOf, pickVenue, shade,
} from "../indoor";

const NBO = { lat: -1.2917, lng: 36.8286 };

const venue = (over: Partial<IndoorVenue["venue"]> = {}): IndoorVenue => ({
  venue: {
    id: "nairobi-central-station", uuid: "v", name: "Nairobi Central Station", category: "trainstation",
    address: null, stop_id: "MGR_NBO", display_point: { type: "Point", coordinates: [NBO.lng, NBO.lat] },
    outline: { type: "Polygon", coordinates: [[[36.828, -1.292], [36.829, -1.292], [36.829, -1.291], [36.828, -1.292]]] },
    default_level: "g", ...over,
  },
  levels: [
    { id: "b1", ordinal: -1, name: "Basement", short_name: "B1", outdoor: false, height_m: 4 },
    { id: "g", ordinal: 0, name: "Ground", short_name: "G", outdoor: false, height_m: 5 },
    { id: "l1", ordinal: 1, name: "Footbridge", short_name: "1", outdoor: true, height_m: 4 },
  ],
  features: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[36.828, -1.292], [36.8285, -1.292], [36.8285, -1.2915], [36.828, -1.292]]] },
        properties: { id: "u1", kind: "unit", category: "platform", name: "Platform 1", level: "g", ordinal: 0 } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[36.8285, -1.292], [36.829, -1.292], [36.829, -1.2915], [36.8285, -1.292]]] },
        properties: { id: "u2", kind: "unit", category: "walkway", level: "g", ordinal: 0 } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[36.828, -1.292], [36.82802, -1.292]] },
        properties: { id: "o1", kind: "opening", category: "pedestrian.principal", level: "g", ordinal: 0, accessible: true } },
      { type: "Feature", geometry: { type: "Point", coordinates: [36.8284, -1.2918] },
        properties: { id: "a1", kind: "amenity", category: "ticketing", level: "g", ordinal: 0 } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[36.828, -1.292], [36.829, -1.292], [36.829, -1.2915], [36.828, -1.292]]] },
        properties: { id: "u3", kind: "unit", category: "walkway", name: "Footbridge", level: "l1", ordinal: 1 } },
    ],
  },
  occupants: [
    { id: "oc1", name: "Kenya Railways tickets", category: "ticketoffice", unit: "u1", hours: "Mo-Su 05:30-20:00" },
    { id: "oc2", name: "Kiosk", category: "shop" },
  ],
  colors: { platform: "#FDECB5", walkway: "#ECEEF2" },
  labels: { units: { platform: "Platform", walkway: "Walkway" }, amenities: { ticketing: "Tickets" }, occupants: { ticketoffice: "Ticket office" } },
});

describe("bboxAround", () => {
  it("covers about a screen around the centre, south-west to north-east", () => {
    const [s, w, n, e] = bboxAround(NBO, 16);
    expect(s).toBeLessThan(NBO.lat);
    expect(n).toBeGreaterThan(NBO.lat);
    expect(w).toBeLessThan(NBO.lng);
    expect(e).toBeGreaterThan(NBO.lng);
    // ~800 m either side at zoom 16
    expect(metersBetween({ lat: NBO.lat, lng: w }, NBO)).toBeGreaterThan(500);
    expect(metersBetween({ lat: NBO.lat, lng: w }, NBO)).toBeLessThan(1200);
  });
  it("shrinks as the map zooms in", () => {
    const wide = bboxAround(NBO, 16);
    const close = bboxAround(NBO, 18);
    expect(close[3] - close[1]).toBeCloseTo((wide[3] - wide[1]) / 4, 6);
  });
});

describe("pickVenue", () => {
  const near: VenueInView = { id: "nbo", name: "Nairobi Central", category: "trainstation", version: 2, lat: -1.2919, lng: 36.8288 };
  const far: VenueInView = { id: "mall", name: "Mall", category: "shoppingcenter", version: 1, lat: -1.2990, lng: 36.8200 };
  it("takes the nearest venue", () => {
    expect(pickVenue([far, near], NBO)?.id).toBe("nbo");
  });
  it("takes none when the nearest is too far to be what we're looking at", () => {
    expect(pickVenue([far], NBO)).toBeNull();
  });
  it("skips venues without a usable point", () => {
    expect(pickVenue([{ ...near, lat: NaN }], NBO)).toBeNull();
  });
});

describe("levels", () => {
  it("lists the top floor first", () => {
    expect(levelsTopDown(venue()).map((l) => l.short_name)).toEqual(["1", "G", "B1"]);
  });
  it("opens on the venue's default level", () => {
    expect(defaultLevel(venue({ default_level: "l1" }))).toBe("l1");
  });
  it("falls back to street level when the default is missing or gone", () => {
    expect(defaultLevel(venue({ default_level: null }))).toBe("g");
    expect(defaultLevel(venue({ default_level: "deleted" }))).toBe("g");
  });
});

describe("levelShape", () => {
  it("keeps one level, framed by the outline", () => {
    const fc = levelShape(venue(), "g", false);
    expect(fc.features[0].properties?.kind).toBe("outline");
    expect(fc.features.map((f) => f.properties?.id)).toEqual(["outline", "u1", "u2", "o1", "a1"]);
  });
  it("colours spaces by category and doors by kind", () => {
    const byId = Object.fromEntries(levelShape(venue(), "g", false).features.map((f) => [f.properties?.id, f.properties]));
    expect(byId.u1?.color).toBe("#FDECB5");
    expect(byId.o1?.color).toBe("#EA580C");
  });
  it("writes names on spaces, never a category over every corridor, and says what points are", () => {
    const byId = Object.fromEntries(levelShape(venue(), "g", false).features.map((f) => [f.properties?.id, f.properties]));
    expect(byId.u1?.label).toBe("Platform 1");
    expect(byId.u2?.label).toBe("");
    expect(byId.a1?.label).toBe("Tickets");
  });
  it("darkens floors for the night map", () => {
    const night = levelShape(venue(), "g", true).features.find((f) => f.properties?.id === "u1");
    expect(night?.properties?.color).not.toBe("#FDECB5");
    expect(night?.properties?.color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("is just the outline without a level", () => {
    expect(levelShape(venue(), null, false).features).toHaveLength(1);
  });
});

describe("labels and directory", () => {
  it("names unnamed features by what they are", () => {
    const v = venue();
    expect(featureLabel(v, { kind: "unit", category: "walkway" })).toBe("Walkway");
    expect(featureLabel(v, { kind: "opening", category: "pedestrian.principal" })).toBe("Main entrance");
    expect(featureLabel(v, { kind: "amenity", category: "ticketing", name: "Booking hall" })).toBe("Booking hall");
  });
  it("finds who is in a space", () => {
    expect(occupantsOf(venue(), "u1").map((o) => o.name)).toEqual(["Kenya Railways tickets"]);
    expect(occupantsOf(venue(), "u2")).toEqual([]);
  });
  it("leaves day colours alone", () => {
    expect(shade("#FDECB5", false)).toBe("#FDECB5");
  });
});
