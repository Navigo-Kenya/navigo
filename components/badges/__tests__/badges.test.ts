import { badgeProgress, familyOf, tierOf } from "../NavigoBadge";
import { LEVELS, levelFor, levelProgress } from "../levels";

const b = (slug: string, requirement_type: string, requirement_value: number, type?: string) => ({
  slug, requirement_type, requirement_value, requirement_meta: type ? { type } : null,
});

// As the API seeds them (database/seeders/BadgeSeeder.php).
const ALL = [
  b("first_alert", "report_count", 1),
  b("road_reporter", "report_count", 10),
  b("city_watchman", "report_count", 50),
  b("guardian_of_nairobi", "report_count", 150),
  b("traffic_hawk", "report_type_count", 15, "traffic_jam"),
  b("photo_taker", "type_count", 5, "stop_photo"),
  b("photo_pro", "type_count", 20, "stop_photo"),
  b("visual_legend", "type_count", 60, "stop_photo"),
  b("delay_spotter", "type_count", 10, "delay_report"),
  b("community_voice", "type_count", 20, "stop_review"),
  b("route_pioneer", "approved_type_count", 3, "new_stop"),
  b("first_step", "total_count", 1),
  b("points_100", "points", 100),
  b("points_5000", "points", 5000),
];
const get = (slug: string) => ALL.find((x) => x.slug === slug)!;

describe("badge families and tiers", () => {
  it("gives each kind of contribution its shape", () => {
    expect(familyOf(get("city_watchman"))).toBe("report");
    expect(familyOf(get("traffic_hawk"))).toBe("report");
    expect(familyOf(get("photo_pro"))).toBe("photo");
    expect(familyOf(get("delay_spotter"))).toBe("traffic");
    expect(familyOf(get("community_voice"))).toBe("voice");
    expect(familyOf(get("route_pioneer"))).toBe("pioneer");
    expect(familyOf(get("points_100"))).toBe("milestone");
    expect(familyOf(get("first_step"))).toBe("milestone");
  });

  it("ranks a badge within its own ladder", () => {
    expect(tierOf(get("first_alert"), ALL)).toBe(1);
    expect(tierOf(get("guardian_of_nairobi"), ALL)).toBe(4);
    expect(tierOf(get("visual_legend"), ALL)).toBe(3);
    // A ladder of its own (by report type): first of it.
    expect(tierOf(get("traffic_hawk"), ALL)).toBe(1);
    expect(tierOf(get("points_5000"), ALL)).toBe(2);
  });
});

describe("badge progress", () => {
  const base = { points: 120, submissions_count: 7 } as any;

  it("reads the API's counts, capped at the target", () => {
    const stats = {
      ...base,
      progress: { total: 7, by_type: { stop_photo: 30 }, approved_by_type: {}, report_total: 12, report_by_type: { traffic_jam: 4 } },
    };
    expect(badgeProgress(get("road_reporter"), stats)).toEqual({ current: 10, target: 10 });
    expect(badgeProgress(get("city_watchman"), stats)).toEqual({ current: 12, target: 50 });
    expect(badgeProgress(get("photo_pro"), stats)).toEqual({ current: 20, target: 20 });
    expect(badgeProgress(get("traffic_hawk"), stats)).toEqual({ current: 4, target: 15 });
    expect(badgeProgress(get("route_pioneer"), stats)).toEqual({ current: 0, target: 3 });
  });

  it("knows points and totals without the counts, and invents nothing else", () => {
    expect(badgeProgress(get("points_100"), base)).toEqual({ current: 100, target: 100 });
    expect(badgeProgress(get("first_step"), base)).toEqual({ current: 1, target: 1 });
    expect(badgeProgress(get("city_watchman"), base)).toBeNull();
    expect(badgeProgress(get("photo_pro"), null)).toBeNull();
  });
});

describe("levels", () => {
  it("matches the API's thresholds", () => {
    expect(LEVELS.map((l) => l.from)).toEqual([0, 50, 150, 400, 900, 2000, 4500]);
    expect(levelFor(0).name).toBe("Commuter");
    expect(levelFor(150).name).toBe("Safiri Guide");
    expect(levelFor(9999).n).toBe(7);
  });

  it("measures the way to the next level", () => {
    expect(levelProgress(100)).toMatchObject({ level: { n: 2 }, next: { n: 3 }, toNext: 50, ratio: 0.5 });
    expect(levelProgress(5000)).toMatchObject({ next: null, ratio: 1, toNext: 0 });
  });
});
