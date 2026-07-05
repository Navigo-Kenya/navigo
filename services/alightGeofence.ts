// services/alightGeofence.ts
// Dead-man's-switch for the alight moment: OS-level geofences around the
// alight stop and final destination. The OS relaunches the task and fires
// the notification even if the JS navigation loop has been killed — the
// backup for the highest-stakes moment of a matatu trip.
//
// The task MUST be defined at module scope and this module imported from
// app/_layout.tsx so it's registered before the app finishes launching.
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { NAV_ALERTS_CHANNEL } from "./notifications";
import { Platform } from "react-native";

const TASK_NAME = "navigo-alight-geofence";

/** Region identifiers carry their own notification copy. */
interface RegionPayload {
  title: string;
  body: string;
}

function encodeId(payload: RegionPayload): string {
  return JSON.stringify(payload);
}

function decodeId(identifier: string): RegionPayload | null {
  try {
    const p = JSON.parse(identifier);
    return typeof p?.title === "string" && typeof p?.body === "string" ? p : null;
  } catch {
    return null;
  }
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  const payload = decodeId(region.identifier ?? "");
  if (!payload) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      sound: "default",
      categoryIdentifier: "nav",
      interruptionLevel: "timeSensitive",
      data: { type: "alight_geofence" },
    },
    trigger: Platform.OS === "android"
      ? ({ channelId: NAV_ALERTS_CHANNEL } as Notifications.NotificationTriggerInput)
      : null,
  }).catch(() => {});
});

export interface AlightRegion {
  lat: number;
  lng: number;
  radiusM: number;
  title: string;
  body: string;
}

/**
 * Arm geofences for the current transit leg. Silently no-ops without
 * background location permission (the foreground engine still announces).
 */
export async function armAlightGeofence(regions: AlightRegion[]): Promise<void> {
  try {
    if (regions.length === 0) return;
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== "granted") return;

    await Location.startGeofencingAsync(
      TASK_NAME,
      regions.map((r) => ({
        identifier: encodeId({ title: r.title, body: r.body }),
        latitude: r.lat,
        longitude: r.lng,
        radius: r.radiusM,
        notifyOnEnter: true,
        notifyOnExit: false,
      })),
    );
  } catch {
    // Geofencing is a backup layer — never let it break navigation.
  }
}

export async function disarmAlightGeofence(): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(TASK_NAME)) {
      await Location.stopGeofencingAsync(TASK_NAME);
    }
  } catch {
    // ignore
  }
}
