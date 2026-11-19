// components/badges/levels.ts
//
// The seven Navigo levels, as the API counts them (User::level,
// levelLabel, pointsToNextLevel). Keep in step with api/app/Models/User.php.
export interface Level {
  n: number;
  name: string;
  /** Points to reach it. */
  from: number;
  color: string;
}

export const LEVELS: Level[] = [
  { n: 1, name: "Commuter",        from: 0,    color: "#94A3B8" },
  { n: 2, name: "Explorer",        from: 50,   color: "#22C55E" },
  { n: 3, name: "Safiri Guide",    from: 150,  color: "#0EA5E9" },
  { n: 4, name: "Transit Expert",  from: 400,  color: "#6366F1" },
  { n: 5, name: "Matatu Master",   from: 900,  color: "#F97316" },
  { n: 6, name: "Route Pioneer",   from: 2000, color: "#E11D48" },
  { n: 7, name: "Community Elder", from: 4500, color: "#A16207" },
];

export function levelFor(points: number): Level {
  return [...LEVELS].reverse().find((l) => points >= l.from) ?? LEVELS[0];
}

/** Progress (0–1) from this level to the next; 1 at the top level. */
export function levelProgress(points: number): { level: Level; next: Level | null; ratio: number; toNext: number } {
  const level = levelFor(points);
  const next = LEVELS.find((l) => l.n === level.n + 1) ?? null;
  if (!next) return { level, next, ratio: 1, toNext: 0 };
  const ratio = (points - level.from) / (next.from - level.from);
  return { level, next, ratio: Math.max(0, Math.min(1, ratio)), toNext: Math.max(0, next.from - points) };
}
