// services/notifications.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import ApiClient from "./apiClient";

const PROJECT_ID = "acc62a4b-150f-4ea6-b0f3-296dca0d6683";

/** The trip's own alerts (below); everything else waits during a trip. */
const TRIP_ALERT_TYPES = new Set(["trip_alert", "alight_warning", "arrival"]);
let tripActive = false;

/**
 * Navigation's manners, like a car's driving mode: while a trip is guided,
 * other notifications (points, news, a friend's report) arrive silently in
 * the notification list instead of dropping a banner over the turn arrow.
 */
export function setTripActive(on: boolean): void {
  tripActive = on;
}

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const type = (n?.request?.content?.data as Record<string, unknown> | undefined)?.type;
    if (tripActive && !TRIP_ALERT_TYPES.has(String(type ?? ""))) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: false,
        shouldShowList: true,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function registerPushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    return token.data;
  } catch {
    return null;
  }
}

export async function syncTokenWithBackend(token: string): Promise<void> {
  await ApiClient.post("/auth/device-tokens", {
    token,
    platform: Platform.OS,
  });
}

export async function unregisterToken(token: string): Promise<void> {
  await ApiClient.delete("/auth/device-tokens", { data: { token } });
}

export function setupNotificationTapHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (data?.screen) router.push(data.screen as any);
  });
  return () => sub.remove();
}

// ── The trip's alert, when the app is in the background ──────────────────────
// One notification for the whole trip, replaced as it goes ("Get off in 2
// stops" becomes "Get off at the next stop"): never a stack in the shade.
// High-importance channel + time-sensitive level: paired watches mirror it
// with vibration, which is exactly what the alight moment needs. Only the
// moments that need you are sent; turn cues stay spoken, and "wrong way" is
// never pushed (a reroute or the screen says it).

export const NAV_ALERTS_CHANNEL = "nav-alerts";
const TRIP_ALERT_ID = "navigo-trip";
let navChannelReady = false;

async function ensureNavAlertsChannel(): Promise<void> {
  if (navChannelReady || Platform.OS !== "android") { navChannelReady = true; return; }
  await Notifications.setNotificationChannelAsync(NAV_ALERTS_CHANNEL, {
    name:             "Navigation alerts",
    importance:       Notifications.AndroidImportance.HIGH,
    sound:            "default",
    vibrationPattern: [0, 250, 150, 250],
    enableVibrate:    true,
  }).catch(() => {});
  navChannelReady = true;
}

function navAlertTrigger(): Notifications.NotificationTriggerInput {
  return Platform.OS === "android"
    ? ({ channelId: NAV_ALERTS_CHANNEL } as Notifications.NotificationTriggerInput)
    : null;
}

/**
 * Shows (or replaces) the trip's notification. `urgent` breaks through
 * Focus modes on iOS: only for the moment to get off.
 */
export async function showTripAlert(title: string, body: string, urgent = false): Promise<void> {
  await ensureNavAlertsChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: TRIP_ALERT_ID,
    content: {
      title,
      body,
      data: { type: "trip_alert" },
      sound: "default",
      categoryIdentifier: "nav",
      ...(urgent ? { interruptionLevel: "timeSensitive" as const } : {}),
    },
    trigger: navAlertTrigger(),
  });
}

/** Takes the trip's notification away (the trip ended, or you're back in the app). */
export async function clearTripAlert(): Promise<void> {
  await Notifications.dismissNotificationAsync(TRIP_ALERT_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(TRIP_ALERT_ID).catch(() => {});
}
