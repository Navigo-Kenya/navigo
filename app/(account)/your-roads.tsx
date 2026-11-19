// app/(account)/your-roads.tsx
//
// "Your roads": the roads Navigo watches for you, learned from your saved
// routes and Home ↔ Work. A confirmed accident, flood or blocked road on
// one, around the time you use it, reaches you as a push ("Reports on my
// roads", in Notifications). Each road with its line on a map and its
// times; remove any (it stays removed), bring removed ones back. Never
// shared.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { Icon } from "@/components/icons/Icon";
import { useActionSheet } from "@/components/ui/ActionSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { CorridorService, type Road } from "@/services/corridors";
import { SettingsService } from "@/services/settings";
import { roadMapUrl, sourceText, windowsText } from "@/utils/roads";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#F6F7F8",
    card: dark ? "#1C1C1F" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#2A2A2F" : "#EEF0F3",
    chip: dark ? "#27272A" : "#F3F4F6",
    warn: dark ? "rgba(255,111,0,0.14)" : "#FFF4EB",
  };
}
type Palette = ReturnType<typeof makeC>;

function ago(iso: string): string {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function RoadCard({ road, C, dark, onMore }: { road: Road; C: Palette; dark: boolean; onMore: () => void }) {
  const url = roadMapUrl(road.path, dark, process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");
  const icon = road.source === "home_work" ? "business" : road.source === "work_home" ? "home" : "bookmark";
  return (
    <View style={[s.card, { backgroundColor: C.card }]}>
      {url ? <Image source={{ uri: url }} style={s.map} contentFit="cover" transition={150} /> : <View style={[s.map, { backgroundColor: C.chip }]} />}
      <View style={s.cardBody}>
        <View style={[s.cardIcon, { backgroundColor: ORANGE + "1A" }]}>
          <Icon name={icon} size={17} color={ORANGE} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.label, { color: C.text }]} numberOfLines={1}>{road.label}</Text>
          <Text style={[s.when, { color: C.text }]} numberOfLines={2}>{windowsText(road.windows)}</Text>
          <Text style={[s.meta, { color: C.sub }]} numberOfLines={1}>
            {[sourceText(road.source), road.last_alerted_at ? `Last alert ${ago(road.last_alerted_at)}` : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Pressable onPress={onMore} hitSlop={10} style={s.more} accessibilityLabel={`${road.label} options`}>
          <Icon name="ellipsis-horizontal" size={18} color={C.sub} />
        </Pressable>
      </View>
    </View>
  );
}

export default function YourRoadsScreen() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const router = useRouter();
  const sheet = useActionSheet();

  const [roads, setRoads] = useState<Road[] | null>(null);
  const [removed, setRemoved] = useState(0);
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const take = (r: { data: Road[]; removed: number }) => {
    setRoads(r.data);
    setRemoved(r.removed);
    setError(false);
  };

  const load = useCallback(async () => {
    try {
      take(await CorridorService.list());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    SettingsService.get()
      .then((st) => setOn(st.notifications.master !== false && st.notifications.route_reports !== false))
      .catch(() => {});
  }, [load]);

  // Pulling builds them again: a new route or a moved pin shows at once.
  const refresh = async () => {
    setRefreshing(true);
    try {
      take(await CorridorService.refresh());
    } catch {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const turnOn = async () => {
    Haptics.selectionAsync();
    setOn(true);
    try {
      await SettingsService.update({ notifications: { master: true, route_reports: true } } as any);
    } catch {
      setOn(false);
      Alert.alert("Couldn't turn it on", "Check your connection and try again.");
    }
  };

  const remove = (road: Road) => {
    sheet.open(road.label, [
      {
        label: "Remove this road",
        icon: "trash-outline",
        destructive: true,
        hint: "You won't hear about reports on it. You can bring it back.",
        run: () => {
          setRoads((list) => list?.filter((r) => r.id !== road.id) ?? null);
          setRemoved((n) => n + 1);
          CorridorService.remove(road.id).catch(() => load());
        },
      },
    ], windowsText(road.windows));
  };

  const restore = async () => {
    Haptics.selectionAsync();
    try {
      take(await CorridorService.restore());
    } catch {
      Alert.alert("Couldn't bring them back", "Check your connection and try again.");
    }
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Your roads" C={{ bg: C.bg, text: C.text, hairline: C.line }} />
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ORANGE} />}
      >
        <Text style={[s.intro, { color: C.sub }]}>
          Navigo watches these roads for you. A confirmed accident, flood or blocked road on one, around the time you use it,
          reaches you before you leave. At most 3 a day, never at night. Only you see them.
        </Text>

        {on === false ? (
          <View style={[s.banner, { backgroundColor: C.warn }]}>
            <Icon name="notifications-off" size={18} color={ORANGE} />
            <Text style={[s.bannerText, { color: C.text }]}>Reports on my roads is off.</Text>
            <PressableScale onPress={turnOn} style={s.bannerBtn} accessibilityRole="button">
              <Text style={s.bannerBtnText}>Turn on</Text>
            </PressableScale>
          </View>
        ) : null}

        {roads === null ? (
          error ? (
            <View style={s.center}>
              <Text style={[s.emptySub, { color: C.sub }]}>Couldn&apos;t load your roads.</Text>
              <PressableScale onPress={load} style={[s.btn, { backgroundColor: ORANGE }]}>
                <Text style={s.btnText}>Try again</Text>
              </PressableScale>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 40 }} color={ORANGE} />
          )
        ) : roads.length === 0 ? (
          <View style={s.center}>
            <View style={[s.emptyIcon, { backgroundColor: ORANGE + "1A" }]}>
              <Icon name="trail-sign" size={30} color={ORANGE} />
            </View>
            <Text style={[s.emptyTitle, { color: C.text }]}>No roads yet</Text>
            <Text style={[s.emptySub, { color: C.sub }]}>
              Set Home and Work, or save a route you take, and Navigo will watch it for you.
            </Text>
            <PressableScale onPress={() => router.push({ pathname: "/(account)/pick-place", params: { pin: "home" } } as any)} style={[s.btn, { backgroundColor: ORANGE }]}>
              <Icon name="home" size={16} color="#FFFFFF" />
              <Text style={s.btnText}>Set Home and Work</Text>
            </PressableScale>
          </View>
        ) : (
          roads.map((r) => <RoadCard key={r.id} road={r} C={C} dark={dark} onMore={() => remove(r)} />)
        )}

        {removed > 0 ? (
          <Pressable onPress={restore} style={s.restore} accessibilityRole="button">
            <Icon name="arrow-undo" size={15} color={ORANGE} />
            <Text style={s.restoreText}>{removed === 1 ? "Bring back the road you removed" : `Bring back the ${removed} roads you removed`}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {sheet.element}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, gap: 12 },
  intro: { fontSize: 13.5, lineHeight: 19, paddingHorizontal: 4 },

  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16 },
  bannerText: { flex: 1, fontSize: 14, fontWeight: "600" },
  bannerBtn: { backgroundColor: ORANGE, paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: "center" },
  bannerBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },

  card: { borderRadius: 20, overflow: "hidden" },
  map: { width: "100%", height: 140 },
  cardBody: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  cardIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontWeight: "800" },
  when: { fontSize: 13.5, fontWeight: "600", marginTop: 2 },
  meta: { fontSize: 12.5, marginTop: 2 },
  more: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  center: { alignItems: "center", gap: 10, paddingTop: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 18, borderRadius: 22, marginTop: 6 },
  btnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  restore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  restoreText: { color: ORANGE, fontSize: 14, fontWeight: "700" },
});
