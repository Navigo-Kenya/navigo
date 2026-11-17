import {
  asLandmark,
  progressAlong,
  rideCue,
  withLandmark,
  type AlongLandmark,
} from "../landmarks";

const lm = (name: string, text: string) => asLandmark({ id: 1, name, relation: "after", text })!;

describe("asLandmark", () => {
  it("accepts API objects and legacy strings", () => {
    expect(asLandmark({ id: 3, name: "Sarit Centre", relation: "opposite", text: "opposite Sarit Centre" })?.text)
      .toBe("opposite Sarit Centre");
    expect(asLandmark("Kencom House")?.text).toBe("near Kencom House");
    expect(asLandmark("   ")).toBeNull();
    expect(asLandmark(null)).toBeNull();
    expect(asLandmark({ text: "no name" })).toBeNull();
  });
});

describe("withLandmark", () => {
  it("appends the landmark fragment", () => {
    expect(withLandmark("Turn left onto Kimathi St", lm("Java House", "after Java House")))
      .toBe("Turn left onto Kimathi St, after Java House");
  });
  it("does not repeat a landmark the instruction already names", () => {
    expect(withLandmark("Turn right at Java House onto Kimathi St.", lm("Java House", "after Java House")))
      .toBe("Turn right at Java House onto Kimathi St");
  });
  it("leaves the instruction alone without a landmark", () => {
    expect(withLandmark("Continue", null)).toBe("Continue");
  });
});

describe("progressAlong", () => {
  // ~1.11 km due north from the equator.
  const line: [number, number][] = [[0, 36.8], [0.005, 36.8], [0.01, 36.8]];
  it("measures metres along the line", () => {
    expect(progressAlong(line, { latitude: 0, longitude: 36.8 })).toBeCloseTo(0, 0);
    expect(progressAlong(line, { latitude: 0.005, longitude: 36.8001 })).toBeCloseTo(556.6, 0);
    expect(progressAlong(line, { latitude: 0.02, longitude: 36.8 })).toBeCloseTo(1113.2, 0);
  });
  it("is 0 for degenerate lines", () => {
    expect(progressAlong([[0, 0]], { latitude: 1, longitude: 1 })).toBe(0);
  });
});

describe("rideCue", () => {
  const along: AlongLandmark[] = [
    { id: 1, name: "Naivas", category: "grocery", lat: 0, lng: 0, progress_m: 400, progress: 0.2, side: "left" },
    { id: 2, name: "Meditest Hospital", category: "health", lat: 0, lng: 0, progress_m: 1200, progress: 0.6, side: "right" },
  ];
  const base = { along, alightStopName: "Westlands", alightLandmark: lm("Oryx Energies", "just after Oryx Energies") };

  it("reports the landmark being passed and the next one", () => {
    const c = rideCue({ ...base, progressM: 380, stopsRemaining: 5 });
    expect(c.passing?.name).toBe("Naivas");
    expect(c.next?.landmark.name).toBe("Meditest Hospital");
    expect(c.next?.inM).toBe(820);
    expect(c.alight).toBeNull();
  });
  it("only looks ahead between landmarks", () => {
    const c = rideCue({ ...base, progressM: 700, stopsRemaining: 4 });
    expect(c.passing).toBeNull();
    expect(c.next?.landmark.name).toBe("Meditest Hospital");
  });
  it("gives the alight cue two stops out, with the landmark", () => {
    expect(rideCue({ ...base, progressM: 1900, stopsRemaining: 2 }).alight)
      .toBe("Alight at Westlands, just after Oryx Energies");
    expect(rideCue({ ...base, progressM: 1900, stopsRemaining: 3 }).alight).toBeNull();
    expect(rideCue({ ...base, progressM: 1900, stopsRemaining: 0 }).alight).toBeNull();
  });
});
