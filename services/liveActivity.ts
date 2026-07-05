// services/liveActivity.ts
// Cross-platform persistent navigation notification — Phase 3 full implementation.
//
// ARCHITECTURE (3 tiers, evaluated in order):
//
// Tier 1 — iOS 16.2+ ActivityKit (Dynamic Island + lock screen)
//   navigo-live-activity Expo Module. Active when linked (Phase 3 EAS build)
//   and the device supports Live Activities.
//
// Tier 2 — Android: @notifee/react-native ongoing notification with real progress bar
//   AndroidCategory.NAVIGATION, true ProgressBar, ongoing (non-dismissable).
//   Falls through to Tier 3 if notifee is not yet linked.
//
// Tier 3 — expo-notifications fallback (iOS <16.2 / notifee not yet built)
//   Silent channel, stable identifier → updates in-place.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  isLiveActivitySupported,
  startNavActivity,
  updateNavActivity,
  stopNavActivity,
} from "navigo-live-activity";

// Notifee is optional — gracefully absent if the Phase 3 build hasn't run yet.
let notifee: typeof import("@notifee/react-native").default | null = null;
let AndroidImportanceMod: any = null;
let AndroidCategoryMod: any   = null;
try {
  const mod        = require("@notifee/react-native");
  notifee          = mod.default;
  AndroidImportanceMod = mod.AndroidImportance;
  AndroidCategoryMod   = mod.AndroidCategory;
} catch { /* not yet installed / built */ }

const CHANNEL_ID    = "navigation-progress";
const NOTIF_ID      = "nav-progress";
const MIN_UPDATE_MS = 15_000;

let started      = false;
let channelReady = false;
let lastPushAt   = 0;
let destination  = "";
let routeTotalM  = 0;
let navStartTime = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtEta(d: Date): string {
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

// ── Tier 3 channel (expo-notifications fallback) ──────────────────────────────
async function ensureFallbackChannel() {
  if (channelReady || Platform.OS !== "android") { channelReady = true; return; }
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name:             "Navigation progress",
    importance:       Notifications.AndroidImportance.LOW,
    sound:            null,
    vibrationPattern: [0],
    enableVibrate:    false,
    showBadge:        false,
  });
  channelReady = true;
}

// ── Tier 2 channel (notifee) ──────────────────────────────────────────────────
async function ensureNotifeeChannel() {
  if (!notifee || !AndroidImportanceMod) return;
  await notifee.createChannel({
    id:        CHANNEL_ID,
    name:      "Navigation Progress",
    sound:     "",
    importance: AndroidImportanceMod.LOW,
    vibration: false,
    badge:     false,
  });
}

// ── Public types ──────────────────────────────────────────────────────────────
export interface NavActivityUpdate {
  instruction?:        string | null;
  remainingDistanceM?: number | null;
  eta?:                Date | null;
  /** 0–1 fraction of route completed. */
  progress?:           number | null;
  isPaused?:           boolean;
  /** Bypass the MIN_UPDATE_MS throttle (step change, boarding, arrival). */
  force?:              boolean;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const LiveActivity = {
  async start(destinationName: string, totalDistanceM?: number) {
    destination  = destinationName || "your destination";
    routeTotalM  = totalDistanceM ?? 0;
    started      = true;
    lastPushAt   = 0;
    navStartTime = Date.now();

    // Tier 1: iOS ActivityKit
    if (Platform.OS === "ios" && isLiveActivitySupported()) {
      const ok = await startNavActivity(destination, {
        instruction:           "Navigation started",
        remainingDistanceText: routeTotalM > 0 ? fmtDist(routeTotalM) : "",
        eta:                   "",
        progress:              0,
        isPaused:              false,
      });
      if (ok) return;
    }

    // Tier 2 / 3 channel setup
    if (Platform.OS === "android" && notifee) {
      await ensureNotifeeChannel().catch(() => {});
    } else {
      await ensureFallbackChannel().catch(() => {});
    }
    await this.update({ instruction: "Navigation started", force: true });
  },

  async update({
    instruction,
    remainingDistanceM,
    eta,
    progress,
    isPaused = false,
    force    = false,
  }: NavActivityUpdate) {
    if (!started) return;
    const now = Date.now();
    if (!force && now - lastPushAt < MIN_UPDATE_MS) return;
    lastPushAt = now;

    let frac = progress ?? null;
    if (frac == null && routeTotalM > 0 && remainingDistanceM != null) {
      frac = Math.max(0, Math.min(1, 1 - remainingDistanceM / routeTotalM));
    }

    const distStr = remainingDistanceM != null ? fmtDist(remainingDistanceM) : "";
    const etaStr  = eta ? fmtEta(eta) : "";

    // Tier 1: iOS ActivityKit update
    if (Platform.OS === "ios" && isLiveActivitySupported()) {
      const ok = await updateNavActivity({
        instruction:           instruction ?? "",
        remainingDistanceText: distStr,
        eta:                   etaStr,
        progress:              frac ?? 0,
        isPaused,
      });
      if (ok) return;
    }

    // Tier 2: Android notifee with real progress bar
    if (Platform.OS === "android" && notifee && AndroidCategoryMod && AndroidImportanceMod) {
      const body = [
        isPaused ? "Trip paused" : instruction,
        distStr ? `${distStr} left` : null,
        etaStr  ? `ETA ${etaStr}` : null,
      ].filter(Boolean).join("  ·  ");
      try {
        await notifee.displayNotification({
          id:    NOTIF_ID,
          title: `→ ${destination}`,
          body:  body || "Navigating…",
          android: {
            channelId:         CHANNEL_ID,
            ongoing:           true,
            asForegroundService: false,
            category:          AndroidCategoryMod.NAVIGATION,
            color:             "#FF6F00",
            smallIcon:         "ic_notification",
            importance:        AndroidImportanceMod.LOW,
            progress: frac != null
              ? { max: 100, current: Math.round(frac * 100), indeterminate: false }
              : { max: 0, current: 0, indeterminate: true },
            timestamp:    navStartTime,
            showTimestamp: true,
          },
        });
        return;
      } catch { /* fall through to Tier 3 */ }
    }

    // Tier 3: expo-notifications fallback
    const parts = [
      isPaused ? "Trip paused" : instruction,
      distStr ? `${distStr} left` : null,
      etaStr  ? `ETA ${etaStr}` : null,
    ].filter(Boolean);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: NOTIF_ID,
        content: {
          title:              `→ ${destination}`,
          body:               parts.join("  ·  ") || "Navigating…",
          sound:              false,
          interruptionLevel:  "active" as any,
          categoryIdentifier: "nav",
          data:               { type: "nav_progress", screen: "/(tabs)/map" },
        },
        trigger: Platform.OS === "android"
          ? ({ channelId: CHANNEL_ID } as Notifications.NotificationTriggerInput)
          : null,
      });
    } catch { /* notifications unavailable — navigation itself must never break */ }
  },

  async stop() {
    if (!started) return;
    started     = false;
    routeTotalM = 0;

    // Tier 1
    if (Platform.OS === "ios" && isLiveActivitySupported()) {
      const ok = await stopNavActivity();
      if (ok) return;
    }

    // Tier 2
    if (Platform.OS === "android" && notifee) {
      await notifee.cancelNotification(NOTIF_ID).catch(() => {});
      return;
    }

    // Tier 3
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});
  },
};
