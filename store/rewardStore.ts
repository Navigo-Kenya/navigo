// store/rewardStore.ts
//
// What a contribution just earned, shown once by RewardToast (mounted in
// app/_layout.tsx): points, the streak, new badges, or "sent for review"
// with what approval will earn. Every form says thanks the same way,
// instead of each with its own Alert.
import { create } from "zustand";

export interface Reward {
  /** Points earned now (0 when it waits for a moderator). */
  points: number;
  /** Badge slugs earned with it. */
  badges?: string[];
  streak?: number | null;
  /** Waiting for a moderator: the points approval will bring. */
  pendingPoints?: number;
  /** What was done ("Review posted"). */
  title?: string;
}

interface RewardState {
  reward: (Reward & { at: number }) | null;
  show: (r: Reward) => void;
  clear: () => void;
}

export const useRewardStore = create<RewardState>((set) => ({
  reward: null,
  show: (r) => set({ reward: { ...r, at: Date.now() } }),
  clear: () => set({ reward: null }),
}));

export const showReward = (r: Reward) => useRewardStore.getState().show(r);

/** "first_report" → "First report", for a badge whose name isn't loaded yet. */
export function humanizeSlug(slug: string): string {
  const t = slug.replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : slug;
}

/** The toast's two lines. */
export function rewardLines(r: Reward, badgeName?: string | null): { title: string; sub: string | null } {
  const streak = r.streak && r.streak > 1 ? `${r.streak}-day streak` : null;
  const pts = r.points > 0 ? `+${r.points} Safiri Points` : null;
  const badge = r.badges?.[0];

  if (badge) {
    const more = (r.badges?.length ?? 0) > 1 ? ` and ${r.badges!.length - 1} more` : "";
    return {
      title: `New badge: ${badgeName ?? humanizeSlug(badge)}${more}`,
      sub: [pts, streak].filter(Boolean).join(" · ") || null,
    };
  }
  if (r.pendingPoints) {
    return {
      title: r.title ?? "Sent for review",
      sub: [`+${r.pendingPoints} Safiri Points once it's approved`, streak].filter(Boolean).join(" · "),
    };
  }
  if (pts) return { title: pts, sub: [r.title, streak].filter(Boolean).join(" · ") || null };
  return { title: r.title ?? "Thank you", sub: streak };
}
