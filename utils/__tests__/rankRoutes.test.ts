import {
  rankRoutes,
  routeDeltas,
  rankingHeadline,
  transferCount,
  totalFare,
  RankableRoute,
} from "../rankRoutes";

const walk = { mode: "WALK" };
const bus = (fare?: number) => ({ mode: "BUS", fare: fare != null ? { amount: fare, currency: "KES" } : null });

const fast: RankableRoute = {
  total_duration: 1200, total_walk_distance: 900,
  segments: [walk, bus(80), walk],
};
const cheap: RankableRoute = {
  total_duration: 2100, total_walk_distance: 600,
  segments: [walk, bus(30), walk],
};
const lazy: RankableRoute = {
  total_duration: 1800, total_walk_distance: 150,
  segments: [walk, bus(50), bus(40), walk],
};
const noFare: RankableRoute = {
  total_duration: 1500, total_walk_distance: 400,
  segments: [walk, bus(), walk],
};

const ALL = [fast, cheap, lazy, noFare];

describe("rankRoutes", () => {
  it("fastest sorts by duration", () => {
    expect(rankRoutes(ALL, "fastest")[0]).toBe(fast);
  });

  it("cheapest prefers known fares, unknown fares last", () => {
    const ranked = rankRoutes(ALL, "cheapest");
    expect(ranked[0]).toBe(cheap);
    expect(ranked[ranked.length - 1]).toBe(noFare);
  });

  it("least_walking sorts by walk distance", () => {
    expect(rankRoutes(ALL, "least_walking")[0]).toBe(lazy);
  });

  it("fewest_transfers puts direct routes first, ties by duration", () => {
    const ranked = rankRoutes(ALL, "fewest_transfers");
    expect(transferCount(ranked[0])).toBe(0);
    expect(ranked[0]).toBe(fast); // fastest among the three direct options
    expect(ranked[ranked.length - 1]).toBe(lazy); // the only 1-transfer route
  });

  it("does not mutate the input array", () => {
    const input = [...ALL];
    rankRoutes(input, "cheapest");
    expect(input).toEqual(ALL);
  });
});

describe("totalFare / transferCount", () => {
  it("sums transit fares and ignores walks", () => {
    expect(totalFare(lazy)).toBe(90);
    expect(totalFare(noFare)).toBeNull();
  });
  it("counts transfers as transit legs minus one", () => {
    expect(transferCount(fast)).toBe(0);
    expect(transferCount(lazy)).toBe(1);
  });
});

describe("routeDeltas", () => {
  it("computes deltas against best-in-class", () => {
    const d = routeDeltas([fast, cheap, lazy]);
    expect(d[0].minutesVsBest).toBe(0);           // fast IS the fastest
    expect(d[1].minutesVsBest).toBe(15);          // (2100-1200)/60
    expect(d[0].fareVsBest).toBe(50);             // 80 vs cheapest 30
    expect(d[2].walkVsBest).toBe(0);              // lazy has least walking
    expect(d[1].walkVsBest).toBe(450);
  });

  it("returns null fare deltas when fare unknown", () => {
    const d = routeDeltas([fast, noFare]);
    expect(d[1].fareVsBest).toBeNull();
  });

  it("handles empty input", () => {
    expect(routeDeltas([])).toEqual([]);
  });
});

describe("rankingHeadline", () => {
  it("summarizes the best option per criterion", () => {
    expect(rankingHeadline(ALL, "fastest")).toBe("20 min");
    expect(rankingHeadline(ALL, "cheapest")).toBe("KES 30");
    expect(rankingHeadline(ALL, "least_walking")).toBe("150 m walk");
    expect(rankingHeadline(ALL, "fewest_transfers")).toBe("Direct");
  });
});
