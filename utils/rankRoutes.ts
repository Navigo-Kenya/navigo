// utils/rankRoutes.ts
// Pure route-ranking helpers for the itinerary tradeoff chips
// (Fastest / Cheapest / Least walking / Fewest transfers).
// Structural typing keeps this unit-testable without app imports.

export type RouteRanking = "fastest" | "cheapest" | "least_walking" | "fewest_transfers";

export interface RankableSegment {
  mode: string;
  fare?: { amount: number; currency: string } | null;
}

export interface RankableRoute {
  total_duration: number;       // seconds
  total_walk_distance: number;  // metres
  segments?: RankableSegment[];
}

export const RANKING_OPTIONS: { key: RouteRanking; label: string; icon: string }[] = [
  { key: "fastest",          label: "Fastest",          icon: "flash-outline" },
  { key: "cheapest",         label: "Cheapest",         icon: "cash-outline" },
  { key: "least_walking",    label: "Least walking",    icon: "walk-outline" },
  { key: "fewest_transfers", label: "Fewest transfers", icon: "git-network-outline" },
];

export function transferCount(route: RankableRoute): number {
  const transitLegs = (route.segments ?? []).filter((s) => s.mode !== "WALK").length;
  return Math.max(0, transitLegs - 1);
}

/** Total known fare. Null when no segment carries fare info. */
export function totalFare(route: RankableRoute): number | null {
  const fares = (route.segments ?? [])
    .filter((s) => s.mode !== "WALK" && s.fare)
    .map((s) => s.fare!.amount);
  return fares.length > 0 ? fares.reduce((a, b) => a + b, 0) : null;
}

function score(route: RankableRoute, criterion: RouteRanking): number {
  switch (criterion) {
    case "fastest":
      return route.total_duration;
    case "cheapest": {
      // Routes without fare data rank by transit-leg count (more legs ≈ more
      // fares to pay) after all fare-known routes.
      const fare = totalFare(route);
      return fare != null
        ? fare
        : 1_000_000 + (route.segments ?? []).filter((s) => s.mode !== "WALK").length;
    }
    case "least_walking":
      return route.total_walk_distance;
    case "fewest_transfers":
      return transferCount(route);
  }
}

/** Stable sort by criterion, ties broken by duration. */
export function rankRoutes<T extends RankableRoute>(routes: T[], criterion: RouteRanking): T[] {
  return [...routes].sort((a, b) => {
    const d = score(a, criterion) - score(b, criterion);
    return d !== 0 ? d : a.total_duration - b.total_duration;
  });
}

export interface RouteDeltas {
  /** Extra minutes vs the fastest option (0 for the fastest). */
  minutesVsBest: number;
  /** Extra fare vs the cheapest fare-known option; null when fare unknown. */
  fareVsBest: number | null;
  /** Extra walking metres vs the least-walking option. */
  walkVsBest: number;
  transfers: number;
}

/** Per-route deltas against the best-in-class of the whole set. */
export function routeDeltas(routes: RankableRoute[]): RouteDeltas[] {
  if (routes.length === 0) return [];
  const bestDuration = Math.min(...routes.map((r) => r.total_duration));
  const bestWalk     = Math.min(...routes.map((r) => r.total_walk_distance));
  const knownFares   = routes.map(totalFare).filter((f): f is number => f != null);
  const bestFare     = knownFares.length > 0 ? Math.min(...knownFares) : null;

  return routes.map((r) => {
    const fare = totalFare(r);
    return {
      minutesVsBest: Math.round((r.total_duration - bestDuration) / 60),
      fareVsBest:    fare != null && bestFare != null ? fare - bestFare : null,
      walkVsBest:    Math.round(r.total_walk_distance - bestWalk),
      transfers:     transferCount(r),
    };
  });
}

/** Headline stat for the selected chip, e.g. "Fastest · 32 min". */
export function rankingHeadline(routes: RankableRoute[], criterion: RouteRanking): string | null {
  if (routes.length === 0) return null;
  const best = rankRoutes(routes, criterion)[0];
  switch (criterion) {
    case "fastest":          return `${Math.round(best.total_duration / 60)} min`;
    case "cheapest": {
      const fare = totalFare(best);
      return fare != null ? `KES ${fare}` : null;
    }
    case "least_walking":    return `${best.total_walk_distance >= 1000
      ? (best.total_walk_distance / 1000).toFixed(1) + " km"
      : Math.round(best.total_walk_distance) + " m"} walk`;
    case "fewest_transfers": {
      const t = transferCount(best);
      return t === 0 ? "Direct" : `${t} transfer${t === 1 ? "" : "s"}`;
    }
  }
}
