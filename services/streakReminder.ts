// services/streakReminder.ts
//
// The evening nudge that a streak is about to end: one local notification
// at 19:00, and only when it's worth it:
//   - the streak is 2 days or more (a 1-day streak isn't worth a buzz);
//   - nothing was done today (a trip, a vote, a report, a contribution);
//   - it's a day that counts: Saturday and Sunday never break a streak
//     unless the person asked for weekends to count;
//   - the person allows "Points and contributions" notifications (the
//     setting says so: Notifications screen), with their sound choice.
// It's cancelled the moment they contribute, so it never nags someone who
// already kept their streak.
import * as Notifications from "expo-notifications";
import { CacheService, CACHE_KEYS } from "./cache";
import { SettingsService } from "./settings";

export const STREAK_REMINDER_ID = "streak-reminder";
export const STREAK_REMINDER_HOUR = 19;

/** When to remind, or null for no reminder. */
export function streakReminderAt(opts: {
  streakDays: number;
  contributedToday: boolean;
  allowed: boolean;
  now: Date;
  /** Weekends count (off by default: a weekend never breaks the streak). */
  weekends?: boolean;
}): Date | null {
  if (!opts.allowed || opts.contributedToday || opts.streakDays < 2) return null;
  const day = opts.now.getDay(); // 0 Sunday, 6 Saturday
  if (!opts.weekends && (day === 0 || day === 6)) return null;
  const at = new Date(opts.now);
  at.setHours(STREAK_REMINDER_HOUR, 0, 0, 0);
  return at > opts.now ? at : null;
}

/** The streak, in a few words (the Contribute tab's card). */
export function streakLine(days: number, today: boolean): string {
  if (today) return days > 1 ? `${days}-day streak, safe for today` : "Streak started today";
  if (days > 0) return `Keep your ${days}-day streak going today`;
  return "Contribute today to start a streak";
}

export function streakReminderText(days: number): { title: string; body: string } {
  return {
    title: `Keep your ${days}-day streak`,
    body: "A trip with Navigo, a vote or a report today keeps it going.",
  };
}

type Prefs = { master?: boolean; points_earned?: boolean; sound?: boolean };

async function prefs(): Promise<Prefs | null> {
  // The person's choice doesn't expire: read the cache whatever its age.
  const cached = await CacheService.get<Prefs>(CACHE_KEYS.SETTINGS_NOTIFICATIONS, Number.MAX_SAFE_INTEGER);
  if (cached) return cached;
  return SettingsService.get()
    .then((s) => s.notifications as Prefs)
    .catch(() => null);
}

export async function cancelStreakReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID).catch(() => {});
}

/** Schedules tonight's reminder, or cancels it, from the latest stats. */
export async function syncStreakReminder(
  stats: { streak_days: number; contributed_today: boolean; streak?: { weekends: boolean } } | null
): Promise<void> {
  try {
    await cancelStreakReminder();
    if (!stats || stats.contributed_today || stats.streak_days < 2) return;
    const p = await prefs();
    const allowed = (p?.master ?? true) && (p?.points_earned ?? true);
    const at = streakReminderAt({
      streakDays: stats.streak_days,
      contributedToday: stats.contributed_today,
      allowed,
      now: new Date(),
      weekends: stats.streak?.weekends ?? false,
    });
    if (!at) return;
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        ...streakReminderText(stats.streak_days),
        sound: p?.sound ?? true,
        data: { type: "streak", screen: "/(tabs)/contribution" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch {
    // No reminder: the streak itself still works.
  }
}
