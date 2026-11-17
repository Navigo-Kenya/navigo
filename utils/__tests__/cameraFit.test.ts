import { computeFit, FIT_MAX_ZOOM } from "../cameraFit";

const W = 390;
const H = 844;
const PAD = { top: 180, right: 56, bottom: Math.round(H * 0.5) + 28, left: 40 };

// Nairobi CBD → Westlands area, roughly 2 km across.
const CBD_RESULTS = [
  { latitude: -1.2841, longitude: 36.8233 },
  { latitude: -1.2676, longitude: 36.8108 },
  { latitude: -1.2790, longitude: 36.8170 },
];

describe("computeFit", () => {
  it("returns null for nothing to fit", () => {
    expect(computeFit([], PAD, W, H)).toBeNull();
  });

  it("is deterministic: refitting the same results gives the same camera (no creeping zoom-out)", () => {
    const a = computeFit(CBD_RESULTS, PAD, W, H)!;
    const b = computeFit(CBD_RESULTS, PAD, W, H)!;
    expect(b).toEqual(a);
  });

  it("zooms to a neighbourhood level for results ~2 km apart", () => {
    const fit = computeFit(CBD_RESULTS, PAD, W, H)!;
    expect(fit.zoom).toBeGreaterThan(12);
    expect(fit.zoom).toBeLessThan(15);
  });

  it("centres on the middle of the results", () => {
    const fit = computeFit(CBD_RESULTS, PAD, W, H)!;
    expect(fit.center[0]).toBeCloseTo((36.8233 + 36.8108) / 2, 3);
    expect(fit.center[1]).toBeCloseTo((-1.2841 + -1.2676) / 2, 3);
  });

  it("caps the zoom for a single point", () => {
    const fit = computeFit([CBD_RESULTS[0]], PAD, W, H)!;
    expect(fit.zoom).toBe(FIT_MAX_ZOOM);
  });

  it("shrinks oversized padding so part of the map stays visible", () => {
    const fit = computeFit(CBD_RESULTS, { top: 500, right: 40, bottom: 500, left: 40 }, W, H)!;
    expect(H - fit.padding.top - fit.padding.bottom).toBeGreaterThanOrEqual(96);
    expect(Number.isFinite(fit.zoom)).toBe(true);
  });

  it("fits a bigger spread at a lower zoom", () => {
    const near = computeFit(CBD_RESULTS, PAD, W, H)!;
    const far = computeFit([...CBD_RESULTS, { latitude: -1.3192, longitude: 36.9275 }], PAD, W, H)!;
    expect(far.zoom).toBeLessThan(near.zoom);
  });
});
