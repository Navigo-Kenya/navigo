import { formatDurationParts, formatEta, sToMin, sToShort } from "../mapHelpers";

const min = (m: number) => m * 60;

describe("sToMin (70-minute rule)", () => {
  it("keeps minutes up to and including 70", () => {
    expect(sToMin(min(1))).toBe("1min");
    expect(sToMin(min(65))).toBe("65min");
    expect(sToMin(min(70))).toBe("70min");
  });
  it("switches to hours past 70 minutes", () => {
    expect(sToMin(min(71))).toBe("1hr 11min");
    expect(sToMin(min(125))).toBe("2hr 5min");
    expect(sToMin(min(600))).toBe("10hr");
  });
  it("never shows less than a minute", () => {
    expect(sToMin(0)).toBe("1min");
    expect(sToMin(20)).toBe("1min");
  });
});

describe("sToShort", () => {
  it("uses the compact form with the same threshold", () => {
    expect(sToShort(min(45))).toBe("45m");
    expect(sToShort(min(70))).toBe("70m");
    expect(sToShort(min(95))).toBe("1h 35m");
    expect(sToShort(min(120))).toBe("2h");
  });
});

describe("formatEta", () => {
  it("says Arriving within 90 seconds", () => {
    expect(formatEta(0)).toBe("Arriving");
    expect(formatEta(90)).toBe("Arriving");
  });
  it("formats later departures like sToMin", () => {
    expect(formatEta(min(7))).toBe("7min");
    expect(formatEta(min(600))).toBe("10hr");
  });
});

describe("formatDurationParts", () => {
  it("keeps hours at 0 up to 70 minutes", () => {
    expect(formatDurationParts(min(65))).toMatchObject({ hours: 0, minutes: 65 });
  });
  it("splits hours and minutes past 70", () => {
    expect(formatDurationParts(min(84))).toMatchObject({ hours: 1, minutes: 24, text: "1hr 24min" });
  });
});
