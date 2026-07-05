// services/notifications.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import ApiClient from "./apiClient";

const PROJECT_ID = "acc62a4b-150f-4ea6-b0f3-296dca0d6683";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
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

// ── Local navigation notifications (fired when app is backgrounded) ──────────
// High-importance channel + time-sensitive level: paired watches mirror these
// with vibration, which is exactly what the alight moment needs.

export const NAV_ALERTS_CHANNEL = "nav-alerts";
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

const NAV_ALERT_CONTENT = {
  sound: "default",
  categoryIdentifier: "nav",
  // iOS: break through Focus modes for the alight moment.
  interruptionLevel: "timeSensitive",
} as const;

export async function scheduleAlightWarning(minutesAway: number, stopName: string): Promise<string> {
  await ensureNavAlertsChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to get off soon",
      body: `Alight at ${stopName} in ~${minutesAway} min`,
      data: { type: "alight_warning" },
      ...NAV_ALERT_CONTENT,
    },
    trigger: navAlertTrigger(),
  });
}

export async function scheduleArrivalNotification(stopName: string): Promise<string> {
  await ensureNavAlertsChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "You've arrived",
      body: `You've reached ${stopName}`,
      data: { type: "arrival" },
      ...NAV_ALERT_CONTENT,
    },
    trigger: navAlertTrigger(),
  });
}

export async function scheduleWrongDirectionAlert(): Promise<string> {
  await ensureNavAlertsChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Wrong direction",
      body: "Turn around to get back on route",
      data: { type: "wrong_direction" },
      ...NAV_ALERT_CONTENT,
    },
    trigger: navAlertTrigger(),
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}
