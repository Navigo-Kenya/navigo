// app/(account)/notification-inbox.tsx
//
// The inbox, read the way Snapchat reads chats: a coloured circle for each
// kind (trips, service alerts, points, Navigo), the title in bold while
// it's new, and a status line, a filled mark "New alert · 3m" or an outline
// "Opened · 2h". Chips filter by kind. A tap opens what it's about (and
// marks it read); one with nowhere to go opens up to show all its text.
// Hold one for its actions. Pull to refresh.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import ApiClient from "@/services/apiClient";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "@/services/cache";
import {
  KIND_META,
  KIND_ORDER,
  kindOf,
  sectionOf,
  statusLine,
  type NotifKind,
} from "@/services/inAppNotifications";
import { useNotificationStore } from "@/store/notificationStore";
import { useActionSheet } from "@/components/ui/ActionSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";

interface ApiNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: ApiNotification[];
  current_page: number;
  last_page: number;
}

type Filter = "all" | NotifKind;

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#232326" : "#F1F2F4",
    chip: dark ? "#232326" : "#F3F4F6",
    pressed: dark ? "#1C1C1F" : "#F7F7F8",
  };
}
type Palette = ReturnType<typeof makeC>;

const screenOf = (n: ApiNotification) => (typeof n.data?.screen === "string" ? (n.data.screen as string) : null);

// ── A row ────────────────────────────────────────────────────────────────────

function Row({ n, C, expanded, onPress, onLongPress }: {
  n: ApiNotification;
  C: Palette;
  expanded: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const kind = kindOf(n.type);
  const meta = KIND_META[kind];
  const unread = n.read_at === null;
  const opens = !!screenOf(n);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent" }]}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "New. " : ""}${n.title}. ${n.body}`}
    >
      <View style={[s.avatar, { backgroundColor: unread ? meta.color : meta.color + "26" }]}>
        <Icon name={meta.icon} size={21} color={unread ? "#FFFFFF" : meta.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.title, { color: C.text, fontWeight: unread ? "800" : "500" }]} numberOfLines={1}>{n.title}</Text>
        <View style={s.status}>
          {/* Snapchat's mark: filled while new, an outline once opened. */}
          <View style={[s.mark, unread ? { backgroundColor: meta.color } : { borderWidth: 1.5, borderColor: meta.color }]} />
          <Text style={[s.statusText, { color: unread ? meta.color : C.sub, fontWeight: unread ? "800" : "600" }]} numberOfLines={1}>
            {statusLine(kind, unread, n.created_at)}
          </Text>
        </View>
        {n.body ? (
          <Text style={[s.body, { color: C.sub }]} numberOfLines={expanded ? undefined : 2}>{n.body}</Text>
        ) : null}
      </View>
      {opens ? <Icon name="chevron-forward" size={16} color={C.sub} style={{ marginTop: 14 }} /> : null}
    </Pressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationInbox() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const router = useRouter();
  const sheet = useActionSheet();
  const setUnreadCount = useNotificationStore((st) => st.setUnreadCount);

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const keep = useCallback((list: ApiNotification[]) => {
    setItems(list);
    setUnreadCount(list.filter((n) => n.read_at === null).length);
    CacheService.set(CACHE_KEYS.NOTIFICATIONS_INBOX, list);
  }, [setUnreadCount]);

  const load = useCallback(async () => {
    try {
      const res = await ApiClient.get<PaginatedResponse>("/auth/notifications");
      if (mounted.current) keep(res.data.data);
    } catch {
      // The cached list stays.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [keep]);

  useEffect(() => {
    CacheService.get<ApiNotification[]>(CACHE_KEYS.NOTIFICATIONS_INBOX, CACHE_TTL.NOTIFICATIONS_INBOX).then((cached) => {
      if (cached && mounted.current) {
        setItems(cached);
        setLoading(false);
      }
    });
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  };

  const markRead = useCallback((id: number) => {
    const n = items.find((x) => x.id === id);
    if (!n || n.read_at) return;
    keep(items.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)));
    ApiClient.patch(`/auth/notifications/${id}/read`).catch(() => {});
  }, [items, keep]);

  const markAllRead = async () => {
    const before = items;
    const now = new Date().toISOString();
    keep(items.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    Haptics.selectionAsync();
    try {
      await ApiClient.post("/auth/notifications/mark-all-read");
    } catch {
      keep(before);
      Alert.alert("Couldn't mark them read", "Check your connection and try again.");
    }
  };

  const open = (n: ApiNotification) => {
    markRead(n.id);
    const to = screenOf(n);
    if (to) router.push(to as any);
    else setExpanded((e) => (e === n.id ? null : n.id));
  };

  const actions = (n: ApiNotification) => {
    const kind = kindOf(n.type);
    sheet.open(n.title, [
      ...(screenOf(n) ? [{ label: "Open", icon: "open-outline" as const, run: () => open(n) }] : []),
      ...(n.read_at === null ? [{ label: "Mark as read", icon: "checkmark-done" as const, run: () => markRead(n.id) }] : []),
      {
        label: `${KIND_META[kind].label} settings`,
        icon: "options-outline" as const,
        hint: "Choose which of these reach you",
        run: () => router.push("/(account)/notifications" as any),
      },
    ], statusLine(kind, n.read_at === null, n.created_at));
  };

  const unreadBy = useMemo(() => {
    const m: Record<string, number> = { all: 0 };
    for (const n of items) {
      if (n.read_at !== null) continue;
      m.all += 1;
      const k = kindOf(n.type);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [items]);

  const shown = filter === "all" ? items : items.filter((n) => kindOf(n.type) === filter);
  const kindsPresent = KIND_ORDER.filter((k) => items.some((n) => kindOf(n.type) === k));
  const sections = useMemo(() => {
    const out: { title: string; rows: ApiNotification[] }[] = [];
    for (const n of shown) {
      const t = sectionOf(n.created_at);
      const last = out[out.length - 1];
      if (last?.title === t) last.rows.push(n);
      else out.push({ title: t, rows: [n] });
    }
    return out;
  }, [shown]);

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader
        title="Notifications"
        C={{ bg: C.bg, text: C.text, hairline: C.line }}
        rightNode={
          <Pressable onPress={() => router.push("/(account)/notifications" as any)} hitSlop={10} accessibilityLabel="Notification settings">
            <Icon name="settings-outline" size={21} color={C.text} />
          </Pressable>
        }
      />

      {items.length > 0 ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {(["all", ...kindsPresent] as Filter[]).map((f) => {
              const on = f === filter;
              const color = f === "all" ? ORANGE : KIND_META[f].color;
              const count = unreadBy[f] ?? 0;
              return (
                <PressableScale
                  key={f}
                  onPress={() => { Haptics.selectionAsync(); setFilter(f); }}
                  style={[s.chip, { backgroundColor: on ? color : C.chip }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  {f !== "all" ? <Icon name={KIND_META[f].icon} size={13} color={on ? "#FFFFFF" : color} /> : null}
                  <Text style={[s.chipText, { color: on ? "#FFFFFF" : C.text }]}>{f === "all" ? "All" : KIND_META[f].label}</Text>
                  {count > 0 ? (
                    <View style={[s.chipCount, { backgroundColor: on ? "rgba(255,255,255,0.28)" : color }]}>
                      <Text style={s.chipCountText}>{count}</Text>
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}
          </ScrollView>
          {unreadBy.all > 0 ? (
            <Pressable onPress={markAllRead} style={s.markAll} hitSlop={6} accessibilityRole="button">
              <Icon name="checkmark-done" size={15} color={ORANGE} />
              <Text style={s.markAllText}>Mark all {unreadBy.all} as read</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={s.center}><ActivityIndicator color={ORANGE} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ORANGE} />}
          showsVerticalScrollIndicator={false}
        >
          {shown.length === 0 ? (
            <Empty C={C} filter={filter} onSettings={() => router.push("/(account)/notifications" as any)} />
          ) : (
            sections.map((sec) => (
              <View key={sec.title}>
                <Text style={[s.section, { color: C.sub }]}>{sec.title}</Text>
                {sec.rows.map((n, i) => (
                  <View key={n.id}>
                    {i > 0 ? <View style={[s.sep, { backgroundColor: C.line }]} /> : null}
                    <Row n={n} C={C} expanded={expanded === n.id} onPress={() => open(n)} onLongPress={() => { Haptics.selectionAsync(); actions(n); }} />
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
      {sheet.element}
    </View>
  );
}

function Empty({ C, filter, onSettings }: { C: Palette; filter: Filter; onSettings: () => void }) {
  const meta = filter === "all" ? null : KIND_META[filter];
  return (
    <View style={s.empty}>
      <View style={s.emptyStack}>
        {KIND_ORDER.map((k, i) => (
          <View key={k} style={[s.emptyDot, { backgroundColor: KIND_META[k].color, left: i * 30, borderColor: C.bg }]}>
            <Icon name={KIND_META[k].icon} size={20} color="#FFFFFF" />
          </View>
        ))}
      </View>
      <Text style={[s.emptyTitle, { color: C.text }]}>{meta ? `No ${meta.label.toLowerCase()} yet` : "Nothing new"}</Text>
      <Text style={[s.emptySub, { color: C.sub }]}>
        Trip updates, service alerts on your lines, points and news from Navigo land here.
      </Text>
      <PressableScale onPress={onSettings} style={[s.emptyBtn, { backgroundColor: C.chip }]} accessibilityRole="button">
        <Icon name="options-outline" size={16} color={C.text} />
        <Text style={[s.emptyBtnText, { color: C.text }]}>Choose what you get</Text>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  chips: { gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17 },
  chipText: { fontSize: 13.5, fontWeight: "700" },
  chipCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  chipCountText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  markAll: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 6 },
  markAllText: { color: ORANGE, fontSize: 13, fontWeight: "700" },

  section: { fontSize: 13, fontWeight: "800", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15.5 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  mark: { width: 10, height: 10, borderRadius: 2.5 },
  statusText: { fontSize: 12.5, flexShrink: 1 },
  body: { fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 74 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, paddingBottom: 60, gap: 10 },
  emptyStack: { width: 46 + 3 * 30, height: 46, marginBottom: 8 },
  emptyDot: { position: "absolute", top: 0, width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 19, fontWeight: "800" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 16, borderRadius: 21, marginTop: 8 },
  emptyBtnText: { fontSize: 14, fontWeight: "700" },
});
