import { isStreetMode, streetVerb } from "../streetModes";

describe("streetModes", () => {
  it("treats walk, bike, car and boda as street modes", () => {
    for (const m of ["WALK", "BICYCLE", "CAR", "MOTORBIKE", "motorbike"]) expect(isStreetMode(m)).toBe(true);
    for (const m of ["BUS", "RAIL", "SUBWAY", undefined, null, ""]) expect(isStreetMode(m)).toBe(false);
  });

  it("uses the right verb per mode", () => {
    expect(streetVerb("CAR")).toBe("Drive");
    expect(streetVerb("MOTORBIKE")).toBe("Ride");
    expect(streetVerb("BICYCLE")).toBe("Cycle");
    expect(streetVerb("WALK")).toBe("Walk");
    expect(streetVerb(undefined)).toBe("Walk");
  });
});
