import { DETECT, PhaseTracker, initialPhase, type PhaseEvent, type PhaseInput } from "../legPhase";

const M_PER_DEG = 111_320;

/** Feed `secs` one-second fixes; `at(k)` overrides the input at second k. Returns the events with their second. */
function feed(t: PhaseTracker, from: number, secs: number, at: (k: number) => Partial<PhaseInput>, base: Partial<PhaseInput> = {}) {
  const events: { k: number; e: PhaseEvent }[] = [];
  let lng = 36.8172;
  for (let k = 0; k < secs; k++) {
    const o = at(k);
    lng += (o.speed ?? 0) / M_PER_DEG; // moving east
    const input: PhaseInput = {
      now: (from + k) * 1000,
      lat: -1.2864,
      lng,
      speed: 0,
      heading: 90,
      legKind: "walk",
      prevIsTransit: false,
      nextIsTransit: true,
      distFromLineM: 5,
      routeBearing: 90,
      alongM: 0,
      legLengthM: 3000,
      toLegStartM: 0,
      toLegEndM: 3000,
      ...base,
      ...o,
    };
    const e = t.update(input);
    if (e) events.push({ k, e });
  }
  return events;
}

describe("the phase a leg starts in", () => {
  it("follows the leg and who's in control", () => {
    expect(initialPhase("walk", "driver")).toBe("walk");
    expect(initialPhase("transit", "passenger")).toBe("wait");
    expect(initialPhase("transit", "passenger", true)).toBe("ride");
    expect(initialPhase("car", "driver")).toBe("go");
    expect(initialPhase("car", "passenger")).toBe("pickup");
    expect(initialPhase("motorbike", "passenger")).toBe("pickup");
    expect(initialPhase("bicycle", "driver")).toBe("go");
  });
});

describe("walk → wait at the stage", () => {
  it("waits once standing near the stop for a few seconds", () => {
    const t = new PhaseTracker();
    const walking = feed(t, 0, 10, (k) => ({ speed: 1.4, toLegEndM: 50 - k }));
    expect(walking).toEqual([]);
    const standing = feed(t, 10, 20, () => ({ speed: 0, toLegEndM: 30 }));
    expect(standing.map((x) => x.e)).toEqual(["waiting"]);
    expect(t.phase).toBe("wait");
  });

  it("doesn't wait when stopping far from the stop (a red light, a shop)", () => {
    const t = new PhaseTracker();
    expect(feed(t, 0, 40, () => ({ speed: 0, toLegEndM: 200 }))).toEqual([]);
    expect(t.phase).toBe("walk");
  });
});

describe("wait → ride", () => {
  const leaving = (k: number) => ({ speed: k < 3 ? 0 : Math.min(9, (k - 2) * 1.5) });

  it("boards once the vehicle has been moving along the line for 8 s", () => {
    const t = new PhaseTracker();
    t.enterLeg("transit", "passenger");
    expect(t.phase).toBe("wait");
    const ev = feed(t, 0, 30, (k) => ({ ...leaving(k), legKind: "transit" }));
    expect(ev.map((x) => x.e)).toEqual(["boarded"]);
    expect(ev[0].k).toBeGreaterThanOrEqual(12);
    expect(ev[0].k).toBeLessThanOrEqual(20);
    expect(t.phase).toBe("ride");
  });

  it("doesn't board a vehicle on another road, or going the other way", () => {
    const off = new PhaseTracker();
    off.enterLeg("transit", "passenger");
    expect(feed(off, 0, 30, (k) => ({ ...leaving(k), legKind: "transit", distFromLineM: 80 }))).toEqual([]);

    const back = new PhaseTracker();
    back.enterLeg("transit", "passenger");
    expect(feed(back, 0, 30, (k) => ({ ...leaving(k), legKind: "transit", heading: 270 }))).toEqual([]);
  });

  it("can be undone for 15 s", () => {
    const t = new PhaseTracker();
    t.enterLeg("transit", "passenger");
    const [{ k }] = feed(t, 0, 30, (k) => ({ ...leaving(k), legKind: "transit" }));
    expect(t.undo((k + 10) * 1000)).toBe("wait");
    expect(t.phase).toBe("wait");

    const late = new PhaseTracker();
    late.enterLeg("transit", "passenger");
    const [b] = feed(late, 0, 30, (k) => ({ ...leaving(k), legKind: "transit" }));
    expect(late.undo((b.k + 20) * 1000)).toBeNull();
    expect(late.phase).toBe("ride");
  });
});

describe("not a vehicle", () => {
  it("a jogger stays on foot", () => {
    const t = new PhaseTracker();
    expect(feed(t, 0, 60, () => ({ speed: 3.0 }))).toEqual([]);
    expect(t.phase).toBe("walk");
  });

  it("a GPS spike changes nothing", () => {
    const t = new PhaseTracker();
    expect(feed(t, 0, 60, (k) => ({ speed: k === 20 ? 15 : 1.4 }))).toEqual([]);
  });
});

describe("boarded at an earlier stage", () => {
  it("rides from the walk when moving like a vehicle along it for 10 s", () => {
    const t = new PhaseTracker();
    const ev = feed(t, 0, 30, () => ({ speed: 8 }));
    expect(ev.map((x) => x.e)).toEqual(["boarded_early"]);
    expect(t.phase).toBe("ride");
    // The ride's leg starts: still riding, no wait at the stage.
    t.enterLeg("transit", "passenger");
    expect(t.phase).toBe("ride");
  });
});

describe("on board", () => {
  const riding = () => {
    const t = new PhaseTracker();
    t.set("ride");
    return t;
  };

  it("stays on board in a jam, however long", () => {
    const t = riding();
    expect(feed(t, 0, 300, () => ({ speed: 0, legKind: "transit", toLegStartM: 1500, toLegEndM: 2000, alongM: 1500 }))).toEqual([]);
    expect(t.phase).toBe("ride");
  });

  it("gets off at the stop once stopped there for 8 s", () => {
    const t = riding();
    const ev = feed(t, 0, 30, (k) => ({ speed: k < 5 ? 6 : 0, legKind: "transit", toLegEndM: 50, alongM: 2950, toLegStartM: 2900 }));
    expect(ev.map((x) => x.e)).toEqual(["alighted"]);
    expect(t.phase).toBe("walk");
  });

  it("gets off at once when walking away from the line at the stop", () => {
    const t = riding();
    feed(t, 0, 6, () => ({ speed: 6, legKind: "transit", toLegEndM: 300, alongM: 2700 }));
    const ev = feed(t, 6, 3, () => ({ speed: 1.3, legKind: "transit", toLegEndM: 40, alongM: 2980, distFromLineM: 35 }));
    expect(ev.map((x) => x.e)).toEqual(["alighted"]);
  });

  it("warns once about a missed stop", () => {
    const t = riding();
    const ev = feed(t, 0, 40, () => ({ speed: 9, legKind: "walk", prevIsTransit: true, nextIsTransit: false, toLegStartM: 400 }));
    expect(ev.map((x) => x.e)).toEqual(["missed_stop"]);
    expect(t.phase).toBe("ride");
  });

  it("goes back to waiting after a false start at the stage", () => {
    const t = riding();
    const ev = feed(t, 0, 80, () => ({ speed: 0, legKind: "transit", toLegStartM: 40, alongM: 20, toLegEndM: 2980 }));
    expect(ev.map((x) => x.e)).toEqual(["back_to_stop"]);
    expect(t.phase).toBe("wait");
  });
});

describe("boda or taxi passenger", () => {
  it("starts the ride once moving for 6 s, not while waiting", () => {
    const t = new PhaseTracker();
    t.enterLeg("motorbike", "passenger");
    expect(t.phase).toBe("pickup");
    expect(feed(t, 0, 30, () => ({ speed: 0, legKind: "motorbike" }))).toEqual([]);
    const ev = feed(t, 30, 20, (k) => ({ speed: Math.min(8, k * 2), legKind: "motorbike", distFromLineM: 60 }));
    expect(ev.map((x) => x.e)).toEqual(["ride_started"]);
    expect(t.phase).toBe("go");
  });

  it("a driver or cyclist is moving from the start", () => {
    const t = new PhaseTracker();
    t.enterLeg("car", "driver");
    expect(t.phase).toBe("go");
    expect(feed(t, 0, 30, () => ({ speed: 10, legKind: "car" }))).toEqual([]);
  });
});

it("the thresholds are the documented ones", () => {
  expect(DETECT.VEHICLE_MEDIAN_MPS * 3.6).toBeCloseTo(16.2, 1);
  expect(DETECT.HOLD_MS).toBe(8_000);
});
