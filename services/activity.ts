// services/activity.ts
//
// The day's useful acts, the streak and the quests (api: ActivityController).
//   - A trip with Navigo counts like any other useful act: navigation sends
//     it on arrival (1 km or more counts), signed in, whatever the
//     analytics setting (it isn't a measurement).
//   - Today's three quests, and the streak (days, best, freezes, whether
//     weekends count).
// Quests completed by any act come back as `quests_done`, and ride along
// in the thanks toast (rewardStore).
import api from "./apiClient";
import { useAuthStore } from "@/store/authStore";
import { useContributionStore } from "@/store/contributionStore";
import { showReward } from "@/store/rewardStore";

export interface QuestDone {
  key: string;
  title: string;
  points: number;
}

export interface Quest {
  key: string;
  title: string;
  desc: string;
  icon: string;
  progress: number;
  target: number;
  points: number;
  done: boolean;
}

export interface StreakSummary {
  days: number;
  best: number;
  /** Freezes held (two at most): each covers a missed day on its own. */
  freezes: number;
  /** Whether Saturday and Sunday count (off: they never break a streak). */
  weekends: boolean;
  active_today: boolean;
}

export interface TodayQuests {
  day: string;
  quests: Quest[];
  /** Extra points for all three. */
  bonus: number;
  all_done: boolean;
  streak: StreakSummary;
}

export const ActivityService = {
  /** A trip with navigation ended. Counts from 1 km; nothing when signed out. */
  async tripDone(distanceM: number): Promise<void> {
    if (!useAuthStore.getState().isAuthenticated || !(distanceM > 0)) return;
    const res = await api.post<{ counted: boolean; quests_done: QuestDone[]; streak: StreakSummary }>("/user/activity", {
      kind: "trip",
      distance_m: Math.round(distanceM),
    });
    if (!res.data.counted) return;
    useContributionStore.getState().noteActivity(res.data.streak);
    // The arrival speaks for itself; a quest done is worth a word.
    if (res.data.quests_done.length) {
      showReward({ points: 0, title: "Trip with Navigo", streak: res.data.streak.days, quests: res.data.quests_done });
    }
  },

  async today(): Promise<TodayQuests> {
    const res = await api.get<TodayQuests>("/user/quests");
    return res.data;
  },

  /** Count Saturday and Sunday too (a 7-day streak), or not. */
  async setWeekends(weekends: boolean): Promise<StreakSummary> {
    const res = await api.patch<StreakSummary>("/user/streak", { weekends });
    return res.data;
  },
};
