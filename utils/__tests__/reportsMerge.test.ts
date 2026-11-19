import type { TransitReport } from "@/services/report";
import { inBounds, mergeViewportReports } from "../reportsMerge";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const report = (id: string, lat: number, lng: number, over: Partial<TransitReport> = {}): TransitReport => ({
  id,
  type: "traffic_jam",
  lat,
  lng,
  upvotes: 0,
  downvotes: 0,
  created_at: "2026-11-19T09:30:00Z",
  expires_at: "2026-11-19T11:00:00Z",
  reporter: null,
  ...over,
});

// The CBD, and Westlands to its north-west.
const CBD = { north: -1.27, south: -1.3, east: 36.84, west: 36.8 };
const cbd = report("a", -1.284, 36.822);
const westlands = report("w", -1.265, 36.805);

describe("reports across viewport fetches", () => {
  it("keeps the pins outside the fetched bounds", () => {
    const merged = mergeViewportReports([cbd, westlands], [cbd], CBD, NOW);
    expect(merged.map((r) => r.id).sort()).toEqual(["a", "w"]);
  });

  it("takes the fresh answer as the truth inside the bounds", () => {
    // "a" was resolved or dismissed: it isn't in the answer any more.
    expect(mergeViewportReports([cbd], [], CBD, NOW)).toEqual([]);
    const voted = { ...cbd, upvotes: 3 };
    expect(mergeViewportReports([cbd], [voted], CBD, NOW)[0].upvotes).toBe(3);
  });

  it("drops expired reports, kept or fresh", () => {
    const old = report("o", -1.265, 36.805, { expires_at: "2026-11-19T09:59:00Z" });
    expect(mergeViewportReports([old], [], CBD, NOW)).toEqual([]);
    expect(mergeViewportReports([], [old], CBD, NOW)).toEqual([]);
  });

  it("returns the same list when nothing changed, so the map isn't re-sent", () => {
    const prev = [cbd, westlands];
    expect(mergeViewportReports(prev, [{ ...cbd }], CBD, NOW)).toBe(prev);
  });

  it("keeps the newest beyond the cap, and the whole fresh answer", () => {
    const far = Array.from({ length: 5 }, (_, i) =>
      report(`f${i}`, -1.1, 36.9, { created_at: `2026-11-19T09:0${i}:00Z` })
    );
    const merged = mergeViewportReports(far, [cbd], CBD, NOW, 3);
    expect(merged.map((r) => r.id)).toEqual(["a", "f4", "f3"]);
  });

  it("ignores duplicates and bad coordinates in an answer", () => {
    const merged = mergeViewportReports([], [cbd, { ...cbd }, report("x", Number.NaN, 36.8)], CBD, NOW);
    expect(merged.map((r) => r.id)).toEqual(["a"]);
  });

  it("handles bounds across the antimeridian", () => {
    expect(inBounds({ lat: 0, lng: 179.5 }, { north: 1, south: -1, east: -179, west: 179 })).toBe(true);
    expect(inBounds({ lat: 0, lng: 0 }, { north: 1, south: -1, east: -179, west: 179 })).toBe(false);
  });
});
