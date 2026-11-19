import { hazardText, hazardsNear, isRelevant, placeHazards, speaksHazard, warnDistance } from "../hazardsAhead";

// A straight road north, about 1.1 km long.
const road: [number, number][] = [
  [-1.3000, 36.8000],
  [-1.2950, 36.8000],
  [-1.2900, 36.8000],
];
const report = (id: string, lat: number, lng: number, type = "accident", source: "community" | "tomtom" = "community") => ({ id, type, lat, lng, source });

describe("reports on the way", () => {
  it("places reports near the line at their distance along it", () => {
    const placed = placeHazards(road, [
      report("on", -1.2950, 36.80020),   // 22 m east, half way
      report("off", -1.2950, 36.8010),   // 111 m east: another road
    ]);
    expect(placed.map((p) => p.id)).toEqual(["on"]);
    expect(placed[0].alongM).toBeGreaterThan(540);
    expect(placed[0].alongM).toBeLessThan(570);
  });

  it("orders them along the way and skips bad coordinates", () => {
    const placed = placeHazards(road, [report("far", -1.2905, 36.8), report("near", -1.2990, 36.8), report("nan", Number.NaN, 36.8)]);
    expect(placed.map((p) => p.id)).toEqual(["near", "far"]);
  });

  it("finds the next one within warning distance, and the one just passed", () => {
    const placed = placeHazards(road, [report("a", -1.2990, 36.8), report("b", -1.2950, 36.8)]);
    // ~110 m in: "a" was just under us, "b" is ~440 m ahead.
    const at150 = hazardsNear(placed, 260, "car", 14);
    expect(at150.ahead?.id).toBe("b");
    expect(at150.passed?.id).toBe("a");
    // On foot, 440 m is too far to warn about.
    expect(hazardsNear(placed, 260, "walk", 1.4).ahead).toBeNull();
  });

  it("never asks 'Still there?' about a TomTom incident", () => {
    const placed = placeHazards(road, [report("tt", -1.2990, 36.8, "accident", "tomtom")]);
    expect(hazardsNear(placed, 200, "car", 10).passed).toBeNull();
  });
});

describe("what matters to whom", () => {
  it("warns drivers about police and pedestrians about floods", () => {
    expect(isRelevant("police_check", "car")).toBe(true);
    expect(isRelevant("police_check", "walk")).toBe(false);
    expect(isRelevant("flooded_route", "walk")).toBe(true);
    expect(isRelevant("stage_queue", "car")).toBe(false);
  });

  it("speaks only to whoever is in control", () => {
    expect(speaksHazard("car", "driver")).toBe(true);
    expect(speaksHazard("car", "passenger")).toBe(false);
    expect(speaksHazard("transit", "passenger")).toBe(false);
  });

  it("warns about 30 s ahead in a vehicle", () => {
    expect(warnDistance("car", 25)).toBe(750);
    expect(warnDistance("car", 5)).toBe(400);
    expect(warnDistance("walk", 1.4)).toBe(150);
  });

  it("words it like Waze", () => {
    expect(hazardText("accident", 420)).toBe("Accident reported ahead, 400 metres.");
    expect(hazardText("police_check", 1240)).toBe("Police check reported ahead, 1.2 kilometres.");
  });
});
