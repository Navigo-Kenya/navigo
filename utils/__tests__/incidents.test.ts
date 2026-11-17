import { incidentWhere, splitIncidents } from "../incidents";
import type { MapIncident } from "@/services/report";

const inc = (over: Partial<MapIncident>): MapIncident => ({
  id: "TTI-1",
  type: "road_closed",
  level: 2,
  description: "Closed",
  from: "Valley Road",
  to: "Ngong Road",
  road: null,
  delay_s: null,
  length_m: 300,
  point: [-1.29, 36.79],
  line: null,
  ...over,
});

describe("splitIncidents", () => {
  it("draws jams as lines in [lng, lat] order and never as pins", () => {
    const { pins, jams } = splitIncidents([
      inc({ id: "J", type: "jam", level: 1, line: [[-1.29, 36.79], [-1.3, 36.8]] }),
    ]);
    expect(pins).toEqual([]);
    expect(jams).toEqual([{ id: "J", level: 1, coordinates: [[36.79, -1.29], [36.8, -1.3]] }]);
  });

  it("turns other incidents into TomTom pins with our report artwork", () => {
    const { pins } = splitIncidents([
      inc({ id: "A", type: "accident" }),
      inc({ id: "R", type: "roadworks" }),
      inc({ id: "F", type: "flooding" }),
      inc({ id: "B", type: "broken_down_vehicle" }),
    ]);
    expect(pins.map((p) => p.type)).toEqual(["accident", "road_blocked", "flooded_route", "breakdown"]);
    expect(pins[0]).toMatchObject({ id: "tomtom:A", source: "tomtom", lat: -1.29, lng: 36.79, upvotes: 0, reporter: null });
  });

  it("drops incidents with no usable geometry", () => {
    const { pins, jams } = splitIncidents([
      inc({ type: "jam", line: [[-1.29, 36.79]] }),
      inc({ point: [NaN, 36.79] as unknown as [number, number] }),
    ]);
    expect(pins).toEqual([]);
    expect(jams).toEqual([]);
  });
});

describe("incidentWhere", () => {
  it("prefers from → to, then whichever end or road is known", () => {
    expect(incidentWhere({ from: "A", to: "B", road: null })).toBe("A → B");
    expect(incidentWhere({ from: null, to: "B", road: null })).toBe("B");
    expect(incidentWhere({ from: null, to: null, road: "A104" })).toBe("A104");
    expect(incidentWhere({ from: null, to: null, road: null })).toBeNull();
  });
});
