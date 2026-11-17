import { incidentLine, trafficSummary } from "../traffic";
import type { RouteTraffic } from "@/services/route";

const base: RouteTraffic = {
  source: "tomtom",
  live: true,
  level: "moderate",
  delay_s: 540,
  vs_typical_s: 130,
  free_flow_s: 1320,
  incidents: [],
};

describe("trafficSummary", () => {
  it("shows nothing without live timing", () => {
    expect(trafficSummary(null)).toBeNull();
    expect(trafficSummary({ ...base, live: false })).toBeNull();
    expect(trafficSummary({ ...base, source: "reports", live: false, delay_s: null })).toBeNull();
  });

  it("describes the delay by level", () => {
    expect(trafficSummary({ ...base, delay_s: 30, level: "low" })!.headline).toBe("Clear roads");
    expect(trafficSummary({ ...base, delay_s: 240, level: "low" })!.headline).toBe("Light traffic · +4 min");
    expect(trafficSummary(base)!.headline).toBe("+9 min in traffic");
    expect(trafficSummary({ ...base, delay_s: 1620, level: "heavy" })!.headline).toBe("Heavy traffic · +27 min");
  });

  it("compares with a usual day only when the gap is 2 min or more", () => {
    expect(trafficSummary(base)!.vsUsual).toBe("2 min slower than usual");
    expect(trafficSummary({ ...base, vs_typical_s: -300 })!.vsUsual).toBe("5 min quicker than usual");
    expect(trafficSummary({ ...base, vs_typical_s: 60 })!.vsUsual).toBe("Usual for this time");
    expect(trafficSummary({ ...base, vs_typical_s: null })!.vsUsual).toBeNull();
  });

  it("names the biggest incident, or says there are none", () => {
    expect(trafficSummary(base)!.incident).toBe("No incidents on this route");
    const s = trafficSummary({
      ...base,
      incidents: [{ source: "tomtom", type: "jam", description: "Stationary traffic", from: "Popo Road", to: "Uhuru Highway", road: null, length_m: 800, delay_s: 960 }],
    })!;
    expect(s.hasIncident).toBe(true);
    expect(s.incident).toBe("Stationary traffic · Popo Road → Uhuru Highway · 16 min");
  });

  it("leaves out an unknown delay", () => {
    expect(
      incidentLine({ source: "tomtom", type: "roadworks", description: "Roadworks", from: "Valley Road", to: "Ralph Bunche Road", road: null, length_m: null, delay_s: null })
    ).toBe("Roadworks · Valley Road → Ralph Bunche Road");
  });
});
