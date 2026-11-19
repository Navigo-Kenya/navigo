import {
  precipFor,
  precipFromKey,
  precipKey,
  rainStyle,
  snapSun,
  snapWeather,
  snowStyle,
} from "../mapAmbience";

describe("what falls on the map", () => {
  it("draws nothing in dry weather", () => {
    for (const code of [0, 1, 2, 3, 45, 48]) expect(precipFor(code, 0)).toBeNull();
    expect(precipFor(null)).toBeNull();
    expect(precipFor(Number.NaN)).toBeNull();
  });

  it("grades rain by the code", () => {
    expect(precipFor(51, 0.1)).toEqual({ kind: "rain", level: 1 }); // drizzle
    expect(precipFor(61, 0.4)).toEqual({ kind: "rain", level: 1 }); // slight rain
    expect(precipFor(63, 1.2)).toEqual({ kind: "rain", level: 2 }); // moderate
    expect(precipFor(65, 3)).toEqual({ kind: "rain", level: 3 });   // heavy
    expect(precipFor(81)).toEqual({ kind: "rain", level: 2 });      // showers, no amount reported
    expect(precipFor(95, 0.5)).toEqual({ kind: "rain", level: 3 }); // thunderstorm
  });

  it("lets the measured amount raise the level, never lower it", () => {
    expect(precipFor(61, 2)).toEqual({ kind: "rain", level: 2 });
    expect(precipFor(80, 6)).toEqual({ kind: "rain", level: 3 });
    expect(precipFor(65, 0.2)).toEqual({ kind: "rain", level: 3 });
  });

  it("stops the rain when nothing falls now, except in a thunderstorm", () => {
    expect(precipFor(61, 0)).toBeNull();
    expect(precipFor(80, 0)).toBeNull();
    expect(precipFor(95, 0)).toEqual({ kind: "rain", level: 3 });
  });

  it("draws snow for snowfall and snow showers", () => {
    expect(precipFor(71, 0.3)).toEqual({ kind: "snow", level: 1 });
    expect(precipFor(73, 0.8)).toEqual({ kind: "snow", level: 2 });
    expect(precipFor(75, 2)).toEqual({ kind: "snow", level: 3 });
    expect(precipFor(86)).toEqual({ kind: "snow", level: 3 });
    expect(precipFor(71, 0)).toBeNull();
  });

  it("round-trips through its state key", () => {
    expect(precipKey(null)).toBeNull();
    expect(precipFromKey(precipKey({ kind: "rain", level: 2 }))).toEqual({ kind: "rain", level: 2 });
    expect(precipFromKey("hail:9")).toBeNull();
  });
});

describe("the rain and snow look", () => {
  it("uses explicit colours, so the phone's dark style shows them too", () => {
    for (const style of [rainStyle(2, { dark: true, navigating: false }), snowStyle(2, { dark: false, navigating: false })]) {
      expect(typeof style.color).toBe("string");
      expect(typeof style.vignetteColor).toBe("string");
    }
  });

  it("is heavier with the level and calmer while navigating", () => {
    const light = rainStyle(1, { dark: false, navigating: false });
    const heavy = rainStyle(3, { dark: false, navigating: false });
    const nav = rainStyle(3, { dark: false, navigating: true });
    const top = (s: { density: any[] }) => s.density[s.density.length - 1];
    expect(top(heavy)).toBeGreaterThan(top(light));
    expect(heavy.intensity).toBeGreaterThan(light.intensity);
    expect(nav.vignette).toBeLessThan(heavy.vignette);
  });

  it("fades in with the zoom (no shower over a whole city)", () => {
    const d = snowStyle(1, { dark: false, navigating: false }).density;
    expect(d.slice(0, 3)).toEqual(["interpolate", ["linear"], ["zoom"]]);
    expect(d[4]).toBe(0);
  });
});

describe("snapping", () => {
  it("keeps the sun's cell for a whole city and the weather's for a neighbourhood", () => {
    expect(snapSun(-1.2864)).toBe(-1.5);
    expect(snapSun(-1.21)).toBe(-1);
    expect(snapWeather(36.8172)).toBeCloseTo(36.8, 5);
    expect(snapWeather(36.83)).toBeCloseTo(36.85, 5);
  });
});
