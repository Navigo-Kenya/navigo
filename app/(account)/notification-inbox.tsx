// app/(account)/notification-inbox.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import ApiClient from "@/services/apiClient";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "@/services/cache";
import { useNotificationStore } from "@/store/notificationStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";

// ── API types ─────────────────────────────────────────────────────────────────

interface ApiNotification {
  id:         number;
  type:       string;
  title:      string;
  body:       string;
  data:       Record<string, unknown> | null;
  read_at:    string | null;
  created_at: string;
}

interface PaginatedResponse {
  data:         ApiNotification[];
  current_page: number;
  last_page:    number;
}

// ── Category derivation from notification type ────────────────────────────────

type NotifCategory = "transit" | "community" | "system" | "journey";

const TYPE_TO_CATEGORY: Record<string, NotifCategory> = {
  route_changes:    "transit",
  disruptions:      "transit",
  stop_updates:     "transit",
  bus_arriving:     "transit",
  journey_reminder: "journey",
  turn_by_turn:     "journey",
  alight_warning:   "journey",
  arrival:          "journey",
  wrong_direction:  "journey",
  nearby_contrib:   "community",
  points_earned:    "community",
  tips:             "system",
  app_news:         "system",
};

function categoryFor(type: string): NotifCategory {
  return TYPE_TO_CATEGORY[type] ?? "system";
}

const CATEGORY_META: Record<NotifCategory, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; darkBg: string }> = {
  transit:   { icon: "bus",             color: ORANGE,    bg: "#FFF3E0", darkBg: "rgba(255,111,0,0.18)"  },
  community: { icon: "people",          color: "#10B981", bg: "#F0FFF4", darkBg: "rgba(16,185,129,0.15)" },
  system:    { icon: "information",     color: "#3B82F6", bg: "#EFF6FF", darkBg: "rgba(59,130,246,0.15)" },
  journey:   { icon: "navigate-circle", color: "#8B5CF6", bg: "#F5F3FF", darkBg: "rgba(139,92,246,0.15)" },
};

// ── Color factory ─────────────────────────────────────────────────────────────

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    unread:   dark ? "#2C2C2E" : "#FFF8F4",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)    return "Just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotifRow({
  notif,
  C,
  dark,
  onPress,
}: {
  notif: ApiNotification;
  C: ReturnType<typeof makeC>;
  dark: boolean;
  onPress: (id: number) => void;
}) {
  const cat  = categoryFor(notif.type);
  const meta = CATEGORY_META[cat];
  const bg   = dark ? meta.darkBg : meta.bg;
  const read = notif.read_at !== null;

  return (
    <Pressable
      onPress={() => { if (!read) onPress(notif.id); }}
      style={({ pressed }) => [
        s.notifRow,
        { backgroundColor: read ? C.card : C.unread },
        pressed && { opacity: 0.72 },
      ]}
    >
      <View style={[s.notifIcon, { backgroundColor: bg }]}>
        <Icon name={meta.icon} size={20} color={meta.color} />
      </View>

      <View style={s.notifBody}>
        <View style={s.notifTop}>
          <Text style={[s.notifTitle, { color: C.text }]} numberOfLines={1}>{notif.title}</Text>
          <Text style={[s.notifTime, { color: C.sub }]}>{formatTime(notif.created_at)}</Text>
        </View>
        <Text style={[s.notifText, { color: C.sub }]} numberOfLines={2}>{notif.body}</Text>
      </View>

      {!read && <View style={[s.unreadDot, { backgroundColor: ORANGE }]} />}
    </Pressable>
  );
}

function SectionLabel({ label, C }: { label: string; C: ReturnType<typeof makeC> }) {
  return (
    <View style={[s.sectionLabel, { backgroundColor: C.bg }]}>
      <Text style={[s.sectionText, { color: C.sub }]}>{label}</Text>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ C }: { C: ReturnType<typeof makeC> }) {
  const router = useRouter();
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <View style={[s.emptyIconOuter, { backgroundColor: ORANGE + "18" }]}>
          <View style={[s.emptyIconInner, { backgroundColor: ORANGE + "30" }]}>
            <Icon name="notifications" size={38} color={ORANGE} />
          </View>
        </View>
        <View style={s.emptySparkle1}><Icon name="sparkles" size={14} color={ORANGE} /></View>
        <View style={s.emptySparkle2}><Icon name="star" size={10} color="#FCD34D" /></View>
      </View>

      <Text style={[s.emptyTitle, { color: C.text }]}>You're all caught up</Text>
      <Text style={[s.emptySub, { color: C.sub }]}>
        Transit alerts, journey reminders, and community updates will appear here.
      </Text>

      <View style={s.categoryRow}>
        {(Object.entries(CATEGORY_META) as [NotifCategory, typeof CATEGORY_META[NotifCategory]][]).map(([key, meta]) => (
          <View key={key} style={[s.categoryChip, { backgroundColor: meta.bg }]}>
            <Icon name={meta.icon} size={13} color={meta.color} />
            <Text style={[s.categoryChipText, { color: meta.color }]}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [s.settingsLink, { backgroundColor: C.card, opacity: pressed ? 0.7 : 1 }]}
        onPress={() => router.push("/(account)/notifications" as any)}
      >
        <View style={[s.settingsIcon, { backgroundColor: ORANGE + "18" }]}>
          <Icon name="settings-outline" size={18} color={ORANGE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.settingsTitle, { color: C.text }]}>Notification settings</Text>
          <Text style={[s.settingsSub, { color: C.sub }]}>Control what you receive and how</Text>
        </View>
        <Icon name="chevron-forward" size={16} color={C.sub} />
      </Pressable>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationInbox() {
  const insets  = useSafeAreaInsets();
  const dark    = useColorScheme() === "dark";
  const C       = makeC(dark);
  const router  = useRouter();

  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [markingAll, setMarkingAll]       = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const syncUnread = useCallback((list: ApiNotification[]) => {
    const count = list.filter((n) => n.read_at === null).length;
    setUnreadCount(count);
  }, [setUnreadCount]);

  const loadNotifications = useCallback(async () => {
    // Show cached data immediately
    const cached = await CacheService.get<ApiNotification[]>(CACHE_KEYS.NOTIFICATIONS_INBOX, CACHE_TTL.NOTIFICATIONS_INBOX);
    if (cached && mountedRef.current) {
      setNotifications(cached);
      syncUnread(cached);
      setLoading(false);
    }

    // Fetch fresh from server
    try {
      const res = await ApiClient.get<PaginatedResponse>("/auth/notifications");
      const fresh = res.data.data;
      if (mountedRef.current) {
        setNotifications(fresh);
        syncUnread(fresh);
        setLoading(false);
      }
      await CacheService.set(CACHE_KEYS.NOTIFICATIONS_INBOX, fresh);
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  }, [syncUnread]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = useCallback(async (id: number) => {
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
    );
    setNotifications(updated);
    syncUnread(updated);
    CacheService.set(CACHE_KEYS.NOTIFICATIONS_INBOX, updated);

    ApiClient.patch(`/auth/notifications/${id}/read`).catch(() => {});
  }, [notifications, syncUnread]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    const updated = notifications.map((n) => ({ ...n, read_at: n.read_at ?? now }));
    setNotifications(updated);
    syncUnread(updated);
    CacheService.set(CACHE_KEYS.NOTIFICATIONS_INBOX, updated);

    try {
      await ApiClient.post("/auth/notifications/mark-all-read");
    } catch {
      Alert.alert("Error", "Could not mark all as read. Please try again.");
      setNotifications(notifications);
      syncUnread(notifications);
    } finally {
      if (mountedRef.current) setMarkingAll(false);
    }
  }, [markingAll, notifications, syncUnread]);

  const unreadCount = notifications.filter((n) => n.read_at === null).length;
  const today       = notifications.filter((n) => isToday(n.created_at));
  const earlier     = notifications.filter((n) => !isToday(n.created_at));

  const headerC = { bg: C.card, text: C.text, hairline: C.hairline };

  const headerRight = unreadCount > 0 ? (
    <Pressable
      onPress={handleMarkAllRead}
      disabled={markingAll}
      style={({ pressed }) => ({ opacity: pressed || markingAll ? 0.5 : 1 })}
    >
      <Text style={s.markAllText}>
        {markingAll ? "Marking…" : "Mark all read"}
      </Text>
    </Pressable>
  ) : undefined;

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader
        title="Notifications"
        C={headerC}
        rightLabel={unreadCount > 0 ? undefined : "Settings"}
        rightAction={unreadCount > 0 ? undefined : () => router.push("/(account)/notifications" as any)}
        rightNode={headerRight}
      />

      {loading && notifications.length === 0 ? (
        <View style={s.loaderWrap}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : notifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={[s.emptyScroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <EmptyState C={C} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {today.length > 0 && (
            <>
              <SectionLabel label="TODAY" C={C} />
              {today.map((n) => (
                <NotifRow key={n.id} notif={n} C={C} dark={dark} onPress={handleMarkRead} />
              ))}
            </>
          )}
          {earlier.length > 0 && (
            <>
              <SectionLabel label="EARLIER" C={C} />
              {earlier.map((n) => (
                <NotifRow key={n.id} notif={n} C={C} dark={dark} onPress={handleMarkRead} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  markAllText: { fontSize: 14, fontWeight: "600", color: ORANGE },

  notifRow: {
    flexDirection:    "row",
    alignItems:       "flex-start",
    paddingHorizontal: 16,
    paddingVertical:  14,
    gap:              12,
  },
  notifIcon: {
    width:          44,
    height:         44,
    borderRadius:   14,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  notifBody:  { flex: 1, gap: 4 },
  notifTop:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  notifTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  notifTime:  { fontSize: 12, flexShrink: 0 },
  notifText:  { fontSize: 13, lineHeight: 18 },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },

  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:      6,
  },
  sectionText: {
    fontSize:      11,
    fontWeight:    "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  emptyScroll: { flexGrow: 1, paddingHorizontal: 24 },
  empty: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    gap:            16,
    paddingTop:     48,
    paddingBottom:  32,
  },
  emptyIconWrap:  { position: "relative", width: 120, height: 120, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyIconOuter: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  emptyIconInner: { width: 78,  height: 78,  borderRadius: 39, alignItems: "center", justifyContent: "center" },
  emptySparkle1:  { position: "absolute", top: 4,  right: 6  },
  emptySparkle2:  { position: "absolute", bottom: 8, left: 8 },
  emptyTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  emptySub:   { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 280 },

  categoryRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 },
  categoryChip: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              5,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:     99,
  },
  categoryChipText: { fontSize: 12, fontWeight: "600" },

  settingsLink: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              12,
    marginTop:        24,
    borderRadius:     16,
    paddingHorizontal: 14,
    paddingVertical:  14,
    shadowColor:      "#000",
    shadowOpacity:    0.04,
    shadowRadius:     8,
    elevation:        2,
  },
  settingsIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingsTitle: { fontSize: 15, fontWeight: "600" },
  settingsSub:   { fontSize: 12, marginTop: 1 },
});
