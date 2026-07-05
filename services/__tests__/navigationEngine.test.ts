// Golden-trace tests for the projection-based NavigationEngine.
// Every real-world nav bug should land here as a regression trace
// (see fixtures/README.md for the recorded-trace format from traceRecorder).
import { NavigationEngine } from "../navigationEngine";
import { buildJourney, marchTrace, replay, offsetMeters, LngLat } from "./traceKit";

const START: LngLat = [36.82, -1.3]; // Nairobi-ish, heading north

// Walk 500 m → bus 2000 m (stops every 500 m) → walk 300 m. Total 2800 m.
function standardJourney() {
  return buildJourney(START, [
    { type: "WALK", lengthM: 500 },
    { type: "BUS", lengthM: 2000, stopEveryM: 500, durationS: 300 },
    { type: "WALK", lengthM: 300 },
  ]);
}

describe("NavigationEngine — step advancement", () => {
  it("advances through legs monotonically and in order", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    const ticks = replay(engine, marchTrace(START, 0, 2800, 25, 1.4));

    let prev = 0;
    for (const t of ticks) {
      expect(t.result.stepIndex).toBeGreaterThanOrEqual(prev);
      prev = t.result.stepIndex;
    }
    // Reached the final leg by the end.
    expect(ticks[ticks.length - 1].result.stepIndex).toBe(2);
    // Walk leg (step 0) holds until near its 500 m end (STEP_REACH_M = 18),
    // then flips to the bus leg — NOT one segment late (the off-by-one that
    // originally shipped: advancement compared steps[i+1].routeOffset).
    const firstOnBus = ticks.find((t) => t.result.stepIndex === 1)!;
    const busStartM = 500;
    const fixNorthM = (firstOnBus.fix.lat - START[1]) * 111_320;
    expect(fixNorthM).toBeGreaterThanOrEqual(busStartM - 25 - 18);
    expect(fixNorthM).toBeLessThanOrEqual(busStartM + 50);
  });

  it("reports transit metadata on the bus leg", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    const ticks = replay(engine, marchTrace(START, 0, 2800, 25, 8));

    const midBus = ticks.find((t) => {
      const northM = (t.fix.lat - START[1]) * 111_320;
      return northM > 1200 && northM < 1300;
    })!;
    expect(midBus.result.currentSegmentMode).toBe("BUS");
    expect(midBus.result.stopsRemaining).not.toBeNull();
    expect(midBus.result.stopsRemaining!).toBeGreaterThan(0);
  });
});

describe("NavigationEngine — arrival", () => {
  it("does not arrive while clearly short of the destination", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    // Stop 30 m short.
    const ticks = replay(engine, marchTrace(START, 0, 2770, 25, 1.4));
    expect(ticks.some((t) => t.result.status === "arrived")).toBe(false);
  });

  it("arrives within the 5 m radius of the final coordinate", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    const ticks = replay(engine, marchTrace(START, 0, 2800, 25, 1.4));
    expect(ticks[ticks.length - 1].result.status).toBe("arrived");
  });
});

describe("NavigationEngine — off-route detection", () => {
  it("needs sustained deviation (3 strikes), then recovers", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);

    // On-route for 200 m, drift 60 m east (>45 m threshold) for 6 fixes, come back.
    const drift = (atM: number) => (atM > 200 && atM <= 350 ? 60 : 0);
    const ticks = replay(engine, marchTrace(START, 0, 500, 25, 1.4, drift));

    const statuses = ticks.map((t) => t.result.status);
    // First deviated fix must NOT immediately flag off-route (strike 1 of 3).
    const firstDeviatedIdx = ticks.findIndex((t) => t.result.distanceFromRouteM > 45);
    expect(statuses[firstDeviatedIdx]).toBe("active");
    // Sustained deviation eventually flags off_route.
    expect(statuses).toContain("off_route");
    // After returning to the line, the trip ends active again.
    expect(statuses[statuses.length - 1]).toBe("active");
  });

  it("brief GPS blips never flag off-route", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    // Single-fix 60 m spike at 250 m.
    const drift = (atM: number) => (atM === 250 ? 60 : 0);
    const ticks = replay(engine, marchTrace(START, 0, 500, 25, 1.4, drift));
    expect(ticks.some((t) => t.result.status === "off_route")).toBe(false);
  });
});

describe("NavigationEngine — manual boarding (forceProgressTo)", () => {
  it("jumps progress to the transit leg", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);

    // User is standing at the boarding stop (walk leg end, 500 m).
    const [lng, lat] = offsetMeters(START, 0, 500);
    engine.update(lng, lat, 0, 0);

    const boardOffset = engine.steps[0].routeOffset ?? 0;
    engine.forceProgressTo(boardOffset + 2);
    expect(engine.getHighWaterMark()).toBeCloseTo(boardOffset + 2, 0);

    // Next update from the same position lands on the bus step.
    const r = engine.update(lng, lat, 0, 1);
    expect(r.stepIndex).toBe(1);
    expect(r.currentSegmentMode).toBe("BUS");
  });
});

describe("NavigationEngine — dead reckoning", () => {
  it("clamps speed to 30 m/s so stale readings can't teleport progress", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    engine.deadReckon(1000, 10); // absurd 1000 m/s for 10 s
    expect(engine.getHighWaterMark()).toBeLessThanOrEqual(300);
  });

  it("never exceeds the route length", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    engine.deadReckon(30, 10_000);
    expect(engine.getHighWaterMark()).toBeLessThanOrEqual(j.totalM + 1);
  });
});

describe("NavigationEngine — ETA & remaining distance", () => {
  it("remaining distance decreases monotonically at constant speed", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);
    const ticks = replay(engine, marchTrace(START, 0, 2800, 25, 1.4));

    let prev = Infinity;
    for (const t of ticks) {
      expect(t.result.remainingDistanceM).toBeLessThanOrEqual(prev + 0.5);
      prev = t.result.remainingDistanceM;
    }
    expect(ticks[ticks.length - 1].result.remainingDistanceM).toBeLessThanOrEqual(5);
  });

  it("progress never snaps backwards (high-water mark)", () => {
    const j = standardJourney();
    const engine = new NavigationEngine(j.coords, j.steps);

    // Advance to 1000 m, then feed a noisy fix 100 m behind.
    replay(engine, marchTrace(START, 0, 1000, 25, 8));
    const hwmBefore = engine.getHighWaterMark();
    const [lng, lat] = offsetMeters(START, 0, 900);
    engine.update(lng, lat, 8, 1);
    expect(engine.getHighWaterMark()).toBeGreaterThanOrEqual(hwmBefore);
  });
});

describe("NavigationEngine — corner handling", () => {
  it("stays snapped and on-route around a 90° corner", () => {
    // 400 m north then 400 m east.
    const north: LngLat[] = [];
    for (let d = 0; d <= 400; d += 25) north.push(offsetMeters(START, 0, d));
    const corner = offsetMeters(START, 0, 400);
    const east: LngLat[] = [];
    for (let d = 25; d <= 400; d += 25) east.push(offsetMeters(corner, d, 0));
    const coords = [...north, ...east];

    const end = offsetMeters(corner, 400, 0);
    const engine = new NavigationEngine(coords, [
      { instruction: "Walk", distance: 800, duration: 570, location: end, type: "WALK" },
    ]);

    // Walk the L, cutting the corner by 10 m diagonally at the bend.
    const trace = [
      ...marchTrace(START, 0, 375, 25, 1.4),
      { ...(() => { const [lng, lat] = offsetMeters(START, 7, 393); return { lng, lat }; })(), speed: 1.4 },
      ...Array.from({ length: 16 }, (_, i) => {
        const [lng, lat] = offsetMeters(corner, (i + 1) * 25, 0);
        return { lng, lat, speed: 1.4 };
      }),
    ];

    const ticks = replay(engine, trace);
    for (const t of ticks) {
      expect(t.result.status).not.toBe("off_route");
      expect(t.result.distanceFromRouteM).toBeLessThan(20);
    }
    expect(ticks[ticks.length - 1].result.status).toBe("arrived");
  });
});
