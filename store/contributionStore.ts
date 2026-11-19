import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  Badge,
  CommunityStats,
  Contribution,
  ContributionService,
  CreateContributionPayload,
} from "@/services/contribution";
import { syncWidgetData } from "@/services/widgetBridge";
import { cancelStreakReminder } from "@/services/streakReminder";

const STALE_MS = 5 * 60 * 1000; // 5 minutes

interface ContributionStore {
  contributions:  Contribution[];
  stats:          CommunityStats | null;
  badges:         { earned: Badge[]; locked: Badge[] };
  loaded:         boolean;
  lastFetchedAt:  number;
  fetch:          () => Promise<void>;
  refresh:        () => Promise<void>;
  reset:          () => void;
  submit:         (payload: CreateContributionPayload) => Promise<{ points_awarded: number; new_badges: string[]; streak_days: number }>;
  /** A road report sent from the map: its points and streak count here too. */
  noteReport:     (r: { points_awarded: number; new_badges: string[]; streak_days: number | null }) => void;
  removeContribution: (id: number) => Promise<void>;
}

export const useContributionStore = create<ContributionStore>()(
  persist(
    (set, get) => ({
      contributions:  [],
      stats:          null,
      badges:         { earned: [], locked: [] },
      loaded:         false,
      lastFetchedAt:  0,

      async fetch() {
        const { loaded, lastFetchedAt } = get();
        const isStale = !lastFetchedAt || Date.now() - lastFetchedAt > STALE_MS;

        if (loaded && !isStale) return;          // fresh, nothing to do
        if (loaded && isStale) {
          get().refresh();                       // stale, background refresh, don't await
          return;
        }

        // First load: data already hydrated by persist, just mark loaded and trigger refresh
        set({ loaded: true });
        get().refresh();
      },

      async refresh() {
        const [contributions, stats, badges] = await Promise.all([
          ContributionService.getContributions(),
          ContributionService.getStats(),
          ContributionService.getBadges(),
        ]);
        set({ contributions, stats, badges, loaded: true, lastFetchedAt: Date.now() });
      },

      reset() {
        set({ contributions: [], stats: null, badges: { earned: [], locked: [] }, loaded: false, lastFetchedAt: 0 });
      },

      async submit(payload) {
        const result = await ContributionService.createContribution(payload);
        set((s) => ({
          contributions: [result.data, ...s.contributions],
          stats: s.stats
            ? {
                ...s.stats,
                points: s.stats.points + result.points_awarded,
                submissions_count: s.stats.submissions_count + 1,
                streak_days: result.streak_days ?? s.stats.streak_days,
                contributed_today: true,
              }
            : null,
        }));
        // The streak is safe for today: no 7 p.m. reminder.
        cancelStreakReminder().catch(() => {});
        if (result.new_badges.length > 0) {
          const [badges, stats] = await Promise.all([
            ContributionService.getBadges(),
            ContributionService.getStats(),
          ]);
          set({ badges, stats });
        }
        // Sync streak to widget bridge so home-screen widget reflects current streak.
        syncWidgetData({ streakDays: result.streak_days }).catch(() => {});
        return { points_awarded: result.points_awarded, new_badges: result.new_badges, streak_days: result.streak_days };
      },

      noteReport(r) {
        set((s) => ({
          stats: s.stats
            ? {
                ...s.stats,
                points: s.stats.points + (r.points_awarded || 0),
                streak_days: r.streak_days ?? s.stats.streak_days,
                contributed_today: r.streak_days != null ? true : s.stats.contributed_today,
              }
            : null,
        }));
        if (r.streak_days != null) cancelStreakReminder().catch(() => {});
        // A new badge: the badges (names, art) come from the server.
        if (r.new_badges.length) get().refresh().catch(() => {});
      },

      async removeContribution(id) {
        set((s) => ({
          contributions: s.contributions.filter((c) => c.id !== id),
          stats: s.stats
            ? { ...s.stats, submissions_count: Math.max(0, s.stats.submissions_count - 1) }
            : null,
        }));
        await ContributionService.deleteContribution(id);
      },
    }),
    {
      name:    "navigo:store:contribution",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        contributions:  state.contributions,
        stats:          state.stats,
        badges:         state.badges,
        lastFetchedAt:  state.lastFetchedAt,
      }),
    },
  ),
);
