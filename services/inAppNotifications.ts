// services/inAppNotifications.ts
//
// Notifications inside the app, Snapchat's way:
//   - A push that arrives while the app is open drops in as a small card
//     (components/notifications/InAppBanner), not the system banner over
//     the map. One at a time; several waiting become "3 new notifications".
//   - During a trip, only trip updates show; the rest wait in the inbox,
//     silently, like a car's driving mode.
//   - The inbox reads each one as Snapchat reads a chat: a coloured circle
//     for its kind, and a status line, "New · 3m" (filled) or "Opened · 2h"
//     (outline).
import * as Notifications from "expo-notifications";
import { create } from "zustand";
import type { IconName } from "@/components/icons/Icon";
import { useNavStateStore } from "@/store/navStateStore";
import { useNotificationStore } from "@/store/notificationStore";

export type NotifKind = "trip" | "transit" | "community" | "navigo";

export const KIND_META: Record<NotifKind, { label: string; noun: string; icon: IconName; color: string }> = {
  trip:      { label: "Trips",          noun: "trip update", icon: "navigate", color: "#7C3AED" },
  transit:   { label: "Service alerts", noun: "alert",       icon: "warning",  color: "#EA580C" },
  community: { label: "Points",         noun: "points",      icon: "trophy",   color: "#059669" },
  navigo:    { label: "Navigo",         noun: "from Navigo", icon: "sparkles", color: "#2563EB" },
};

export const KIND_ORDER: NotifKind[] = ["trip", "transit", "community", "navigo"];

const TYPE_KIND: Record<string, NotifKind> = {
  journey_reminder: "trip",
  turn_by_turn: "trip",
  alight_warning: "trip",
  arrival: "trip",
  wrong_direction: "trip",
  trip_alert: "trip",
  route_changes: "transit",
  disruptions: "transit",
  stop_updates: "transit",
  bus_arriving: "transit",
  route_reports: "transit",
  nearby_contrib: "community",
  points_earned: "community",
  streak: "community",
  tips: "navigo",
  app_news: "navigo",
};

export function kindOf(type: string | null | undefined): NotifKind {
  return TYPE_KIND[String(type ?? "")] ?? "navigo";
}

/** Snapchat's compact age: now, 3m, 2h, 4d, 3w. */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/** "New alert · 3m" or "Opened · 2h". */
export function statusLine(kind: NotifKind, unread: boolean, iso: string, now = Date.now()): string {
  const what = unread ? `New ${KIND_META[kind].noun}` : "Opened";
  return `${what} · ${ago(iso, now)}`;
}

/** Today, this week, earlier: the inbox's sections. */
export function sectionOf(iso: string, now = new Date()): "Today" | "This week" | "Earlier" {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (d >= start) return "Today";
  if (now.getTime() - d.getTime() < 7 * 86_400_000) return "This week";
  return "Earlier";
}

// ── The banner's queue ───────────────────────────────────────────────────────

export interface InAppItem {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  /** Where a tap goes (the push's data.screen). */
  screen: string | null;
  at: number;
}

/** What the banner shows: one card, or a summary when several wait. */
export type BannerView =
  | { mode: "one"; item: InAppItem }
  | { mode: "many"; count: number; kinds: NotifKind[]; at: number };

/** More than this many waiting at once, and they're summed up in one card. */
export const COLLAPSE_AFTER = 2;

export function bannerView(queue: InAppItem[]): BannerView | null {
  if (!queue.length) return null;
  if (queue.length > COLLAPSE_AFTER) {
    return {
      mode: "many",
      count: queue.length,
      kinds: KIND_ORDER.filter((k) => queue.some((q) => q.kind === k)),
      at: queue[queue.length - 1].at,
    };
  }
  return { mode: "one", item: queue[0] };
}

interface BannerState {
  queue: InAppItem[];
  push: (item: InAppItem) => void;
  /** The card shown was dismissed or opened: the next one comes. */
  shift: () => void;
  clear: () => void;
}

export const useInAppBannerStore = create<BannerState>((set) => ({
  queue: [],
  push: (item) => set((s) => (s.queue.some((q) => q.id === item.id) ? s : { queue: [...s.queue, item] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));

const TRIP_LIVE = new Set(["WAITING_FOR_BUS", "IN_TRANSIT", "PAUSED"]);

/** Set by navigation (useNavigation start/stop): a trip is being guided. */
let tripActive = false;

/**
 * Navigation's manners, like a car's driving mode: while a trip is guided,
 * only trip updates get the card; the rest wait in the inbox, silently.
 */
export function setTripActive(on: boolean): void {
  tripActive = on;
}

/**
 * How a notification that arrives while the app is open is shown
 * (Notifications.setNotificationHandler): our own card, never the system
 * banner over the map, and kept in the phone's list. During a trip only
 * trip updates get the card; the rest wait in the inbox.
 */
export async function foregroundPresentation(
  n: Notifications.Notification
): Promise<Notifications.NotificationBehavior> {
  const content = n.request.content;
  const data = (content.data ?? {}) as Record<string, unknown>;
  const kind = kindOf(typeof data.type === "string" ? data.type : null);
  const remote = (n.request.trigger as any)?.type === "push";

  // A server push is also an inbox entry.
  if (remote) {
    const st = useNotificationStore.getState();
    st.setUnreadCount(st.unreadCount + 1);
  }

  const onTrip = tripActive || TRIP_LIVE.has(useNavStateStore.getState().snapshot.tripStatus);
  if (content.title && (!onTrip || kind === "trip")) {
    useInAppBannerStore.getState().push({
      id: n.request.identifier,
      kind,
      title: content.title,
      body: content.body ?? "",
      screen: typeof data.screen === "string" ? data.screen : null,
      at: Date.now(),
    });
  }

  return {
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  };
}
