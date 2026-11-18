import {
  AwayTracker,
  cueDistances,
  cueFor,
  legTurns,
  nextTurnIndex,
  placeTurns,
  riderCue,
  spokenDistance,
  turnSpeech,
} from "../maneuvers";

// Moi Avenue east, then left (north): two ~445 m sides, in [lat, lng].
const A: [number, number] = [-1.2864, 36.8172];
const B: [number, number] = [-1.2864, 36.8212];
const C: [number, number] = [-1.2824, 36.8212];
const D: [number, number] = [-1.2824, 36.8172];

describe("placeTurns", () => {
  it("places each turn along the leg", () => {
    const offsets = placeTurns([A, B, C], [
      { lat: A[0], lng: A[1] },
      { lat: B[0], lng: B[1] },
    ]);
    expect(offsets[0]).toBeCloseTo(0, 0);
    expect(offsets[1]).toBeGreaterThan(440);
    expect(offsets[1]).toBeLessThan(450);
  });

  it("takes the later pass when a route comes back to the same corner", () => {
    // Round the block and back past A, then on north-west.
    const E: [number, number] = [-1.2844, 36.8152];
    const offsets = placeTurns([A, B, C, D, A, E], [
      { lat: B[0], lng: B[1] },
      { lat: A[0], lng: A[1] },
    ]);
    expect(offsets[0]).toBeGreaterThan(440);
    expect(offsets[1]).toBeGreaterThan(1700); // four sides, not the start
  });

  it("never goes backwards", () => {
    const offsets = placeTurns([A, B, C], [
      { lat: B[0], lng: B[1] },
      { lat: A[0] + 0.0001, lng: A[1] }, // a stray point near the start
    ]);
    expect(offsets[1]).toBeGreaterThanOrEqual(offsets[0]);
  });
});

describe("next turn", () => {
  const turns = legTurns([A, B, C], [
    { instruction: "Head east on Moi Avenue", lat: A[0], lng: A[1] },
    { instruction: "Turn left onto Kenyatta Avenue.", lat: B[0], lng: B[1], landmark: { name: "Total", text: "after Total" } },
  ]);

  it("keeps the landmark and reads the manoeuvre", () => {
    expect(turns[1].instruction).toBe("Turn left onto Kenyatta Avenue, after Total");
    expect(turns[1].maneuver).toBe("turn-left");
    expect(turns[1].landmarkText).toBe("after Total");
  });

  it("skips the departure and stops after the last turn", () => {
    expect(nextTurnIndex(turns, 0, "car")).toBe(1);
    const at = turns[1].offsetM;
    expect(nextTurnIndex(turns, at - 20, "walk")).toBe(1);
    expect(nextTurnIndex(turns, at - 5, "walk")).toBe(-1); // within 6 m: made
    expect(nextTurnIndex(turns, at - 20, "car")).toBe(1);
    expect(nextTurnIndex(turns, at - 10, "car")).toBe(-1); // a driver is round before the projection
  });
});

describe("cues", () => {
  it("are fixed on foot and on a bike", () => {
    expect(cueDistances("walk", 1.4)).toEqual({ far: null, near: 60, now: 15 });
    expect(cueDistances("bicycle", 5)).toEqual({ far: null, near: 150, now: 35 });
  });

  it("follow the speed in a vehicle", () => {
    const town = cueDistances("car", 50 / 3.6);
    expect(town.far).toBeNull();
    expect(town.near).toBeCloseTo(250, 5);
    expect(town.now).toBeCloseTo(69.4, 0);

    const highway = cueDistances("car", 100 / 3.6);
    expect(highway.far).toBe(1700);
    expect(highway.near).toBeCloseTo(500, 5);
    expect(highway.now).toBeCloseTo(138.9, 0);

    // Stopped at lights: still timed for town speed.
    expect(cueDistances("motorbike", 0).near).toBe(250);
  });

  it("pick the most urgent phase", () => {
    const d = cueDistances("car", 100 / 3.6);
    expect(cueFor(2000, d)).toBeNull();
    expect(cueFor(1500, d)).toBe("far");
    expect(cueFor(400, d)).toBe("near");
    expect(cueFor(100, d)).toBe("now");
  });
});

describe("words", () => {
  it("say distances the way people do", () => {
    expect(spokenDistance(37)).toBe("40 metres");
    expect(spokenDistance(4)).toBe("10 metres");
    expect(spokenDistance(260)).toBe("250 metres");
    expect(spokenDistance(1000)).toBe("1 kilometre");
    expect(spokenDistance(1540)).toBe("1.5 kilometres");
    expect(spokenDistance(2010)).toBe("2 kilometres");
  });

  const turns = legTurns([A, B, C], [
    { instruction: "Head east", lat: A[0], lng: A[1] },
    { instruction: "Turn left onto Kenyatta Avenue", lat: B[0], lng: B[1], landmark: { name: "Total", text: "after Total" } },
    { instruction: "Turn right onto Koinange Street", lat: C[0], lng: C[1] },
  ]);

  it("build the spoken cue", () => {
    expect(turnSpeech("near", turns[1], 260)).toBe("In 250 metres, turn left onto Kenyatta Avenue, after Total");
    expect(turnSpeech("now", turns[1], 30)).toBe("Turn left onto Kenyatta Avenue, after Total");
    expect(turnSpeech("now", turns[1], 30, turns[2])).toBe(
      "Turn left onto Kenyatta Avenue, after Total, then turn right onto Koinange Street"
    );
  });

  it("give the boda passenger one word to show the rider", () => {
    expect(riderCue(turns[1])).toEqual({ word: "Left", detail: "after Total" });
    expect(riderCue(turns[2])).toEqual({ word: "Right", detail: "onto Koinange Street" });
    const [round] = legTurns([A, B], [
      { instruction: "Enter the roundabout and take the 2nd exit onto Ngong Road", lat: A[0], lng: A[1] },
    ]);
    expect(riderCue(round)).toEqual({ word: "Roundabout", detail: "2nd exit onto Ngong Road" });
  });
});

describe("AwayTracker", () => {
  it("flags a vehicle carrying the passenger away, and clears once it closes in", () => {
    const t = new AwayTracker();
    let now = 0;
    let d = 5000;
    // Closing in for a minute: fine.
    for (let i = 0; i < 60; i++) expect(t.update((now += 1000), (d -= 10), 10)).toBe(false);
    // Then away, 10 m/s: flagged once 350 m further than the closest point.
    let flaggedAt = -1;
    for (let i = 0; i < 60; i++) {
      if (t.update((now += 1000), (d += 10), 10) && flaggedAt < 0) flaggedAt = i;
    }
    expect(flaggedAt).toBeGreaterThanOrEqual(34);
    expect(flaggedAt).toBeLessThanOrEqual(36);
    // Turned round: clears once the last 20 s brought it closer overall (~11 s in).
    let clearedAt = -1;
    for (let i = 0; i < 40; i++) {
      if (!t.update((now += 1000), (d -= 10), 10) && clearedAt < 0) clearedAt = i;
    }
    expect(clearedAt).toBeGreaterThanOrEqual(10);
    expect(clearedAt).toBeLessThanOrEqual(12);
  });

  it("ignores a stationary vehicle and GPS jitter", () => {
    const t = new AwayTracker();
    let now = 0;
    for (let i = 0; i < 120; i++) {
      expect(t.update((now += 1000), 3000 + (i % 2 ? 40 : -40), 0)).toBe(false);
    }
  });
});
