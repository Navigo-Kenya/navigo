// utils/leaderboard.ts
//
// The words the leaderboard puts around your rank.
import type { Standing } from "@/services/contribution";

/** First name only, as a board says it ("Wanjiru", not "Wanjiru Kamau"). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What to do next: "12 points to pass Wanjiru", or how to get on the board. */
export function nextStep(me: Standing | null | undefined, weekly: boolean): string {
  if (!me || me.rank == null) {
    return weekly ? "One road report puts you on this week's board." : "Your first contribution puts you on the board.";
  }
  if (me.rank === 1) return weekly ? "You're leading this week. Keep it up!" : "You're the top contributor in Navigo.";
  if (me.ahead) {
    const gap = Math.max(1, me.ahead.points - me.points + 1);
    return `${gap} point${gap === 1 ? "" : "s"} to pass ${firstName(me.ahead.name)}`;
  }
  return "Keep going to climb the board.";
}

/** "Resets in 2 days" until Monday 00:00, Nairobi. */
export function resetsIn(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `Resets in ${Math.floor(h / 24)} days`;
  if (h >= 1) return `Resets in ${h} h`;
  return `Resets in ${Math.max(1, Math.floor(ms / 60_000))} min`;
}
