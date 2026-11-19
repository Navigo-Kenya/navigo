import { encodePolyline, roadMapUrl, windowsText } from "../roads";

describe("your roads", () => {
  it("encodes a line as Google's polyline", () => {
    // Google's own example.
    expect(encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("says when a road is in use", () => {
    expect(windowsText([{ days: [1, 2, 3, 4, 5], from: "05:30", to: "09:30" }])).toBe("Weekdays 05:30–09:30");
    expect(windowsText([{ days: [1, 2, 3, 4, 5, 6, 7], from: "06:10", to: "08:10" }])).toBe("Every day 06:10–08:10");
    expect(windowsText([{ days: [6, 7], from: "09:00", to: "12:00" }, { days: [1, 3], from: "17:00", to: "19:00" }]))
      .toBe("Weekends 09:00–12:00 · Mon, Wed 17:00–19:00");
    expect(windowsText([])).toBe("Any time");
  });

  it("draws the road with its ends marked", () => {
    const url = roadMapUrl([[-1.26, 36.8], [-1.26, 36.81], [-1.27, 36.82]], false, "tok")!;
    expect(url).toContain("path-5+ff6f00-0.9(");
    expect(url).toContain("pin-s+10b981(36.80000,-1.26000)");
    expect(url).toContain("pin-s+ff6f00(36.82000,-1.27000)");
    expect(url).toContain("/auto/");
    expect(roadMapUrl([[-1.26, 36.8]], false, "tok")).toBeNull();
  });
});
