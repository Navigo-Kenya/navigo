// app/search.tsx
//
// Full-screen search: type → places, stops and lines as you go; submit or tap
// a category → results on the map (MapSearchContextSheet). Only real data:
// no invented ratings; recent places open directly.
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStopSearch } from "@/hooks/useStopSearch";
import { MapService, type PlacePrediction } from "@/services/map";
import { StopService, type MobilitySearchRouteItem } from "@/services/stop";
import { runExploreSearch } from "@/services/exploreSearch";
import { useSavedStore } from "@/store/savedStore";
import { UnifiedLocation } from "@/store/journeyStore";
import { useExploreSearchStore } from "@/store/exploreSearchStore";
import { QUICK_CATEGORIES } from "@/components/app/MapFloatingUI";
import { resolveStopCategory } from "@/components/app/StopsLayer";
import { PlaceCategoryIcon, StopTypeGlyph } from "@/components/icons/NavigoIcons";
import { PressableScale } from "@/components/ui/PressableScale";

const ORANGE = "#FF6F00";

type Filter = "all" | "place" | "transit" | "route";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "place", label: "Places" },
  { key: "transit", label: "Stops" },
  { key: "route", label: "Lines" },
];

type Row =
  | { kind: "header"; key: string; title: string }
  | { kind: "recent"; key: string; item: UnifiedLocation }
  | { kind: "route"; key: string; item: MobilitySearchRouteItem }
  | { kind: "stop"; key: string; item: UnifiedLocation }
  | { kind: "place"; key: string; item: PlacePrediction };

/** Bold the part of `text` that matches `query` (case-insensitive). */
function Highlight({ text, query, style, strong }: { text: string; query: string; style: any; strong: any }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <Text style={style} numberOfLines={1}>{text}</Text>;
  return (
    <Text style={style} numberOfLines={1}>
      {text.slice(0, i)}
      <Text style={strong}>{text.slice(i, i + q.length)}</Text>
      {text.slice(i + q.length)}
    </Text>
  );
}

export default function PlaceAndTransitSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const params = useLocalSearchParams<{
    tab?: string;
    mode?: string;
    fLat?: string;
    fLng?: string;
    fName?: string;
    tLat?: string;
    tLng?: string;
    tName?: string;
  }>();

  // Deep-linked with planner params: forward straight to the route planner.
  useEffect(() => {
    if (
      params.mode === "planner" ||
      (params.fLat && params.fLng) ||
      (params.tLat && params.tLng)
    ) {
      router.replace({ pathname: "/route" as any, params });
    }
  }, [params, router]);

  const { query: existingQuery, startSearch } = useExploreSearchStore();

  const [query, setQuery] = useState(existingQuery || "");
  const [filter, setFilter] = useState<Filter>(params.tab === "transit" ? "transit" : "all");
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [matchedRoutes, setMatchedRoutes] = useState<MobilitySearchRouteItem[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { places: savedPlaces, fetch: fetchSaved } = useSavedStore();
  useEffect(() => {
    fetchSaved().catch(() => {});
  }, [fetchSaved]);
  const homePlace = savedPlaces.find((p) => p.pin === "home");
  const workPlace = savedPlaces.find((p) => p.pin === "work");

  // Position for nearby ranking: last known fix right away, a fresh one after.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (alive && last) setMe({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (alive && fresh) setMe({ latitude: fresh.coords.latitude, longitude: fresh.coords.longitude });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const {
    stops,
    places: placePredictions,
    recents,
    pushRecent,
    isSearchingStops,
    isSearchingPlaces,
  } = useStopSearch(query, me);

  // Matching lines (bus, BRT, rail…), debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setMatchedRoutes([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      StopService.searchMobility(q, me?.latitude, me?.longitude)
        .then((res) => {
          if (!cancelled) setMatchedRoutes(res.routes);
        })
        .catch(() => {});
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, me?.latitude, me?.longitude]);

  const C = {
    bg: dark ? "#0F0F0F" : "#FFFFFF",
    field: dark ? "#18181B" : "#F4F4F5",
    chip: dark ? "#1F1F22" : "#F4F4F5",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#27272A" : "#EEF0F3",
  };

  const near = { lat: me?.latitude, lng: me?.longitude };

  /** Submit / category: show results on the map, then fill them in. */
  const searchOnMap = (term: string) => {
    const q = term.trim();
    if (!q) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startSearch({ query: q, activeTab: "all" });
    router.replace("/(tabs)/map" as any);
    runExploreSearch(q, near).catch(() => useExploreSearchStore.getState().setLoading(false));
  };

  /** Open a place on the map's place sheet. */
  const openPlace = (p: {
    id: string; name: string; lat: number; lng: number;
    address?: string; category?: string; rating?: number; reviewCount?: number;
    openNow?: boolean; photos?: string[];
  }) => {
    const place = {
      id: p.id,
      name: p.name,
      address: p.address ?? "",
      category: p.category ?? "",
      lat: p.lat,
      lng: p.lng,
      rating: p.rating,
      reviewCount: p.reviewCount,
      openNow: p.openNow,
      photos: p.photos,
    };
    startSearch({ query: p.name, activeTab: "place", places: [place], selectedPlace: place });
    router.replace("/(tabs)/map" as any);
  };

  const handleSelectPrediction = async (pred: PlacePrediction) => {
    setResolvingId(pred.place_id);
    const details = await MapService.getPlaceDetails(pred.place_id);
    setResolvingId(null);
    if (!details) return;
    pushRecent({ _type: "location", id: pred.place_id, name: pred.main_text, lat: details.lat, lng: details.lng });
    openPlace({
      id: pred.place_id,
      name: pred.main_text,
      address: details.address || pred.secondary_text || pred.description,
      lat: details.lat,
      lng: details.lng,
      rating: details.rating,
      reviewCount: details.reviewCount,
      openNow: details.openNow,
      photos: details.photos,
    });
  };

  const handleSelectStop = (loc: UnifiedLocation) => {
    pushRecent(loc);
    const l = loc as any;
    startSearch({
      query: loc.name,
      activeTab: "stop",
      stops: [{
        id: loc.id, name: loc.name, lat: loc.lat, lng: loc.lng,
        route_nams: loc.route_nams, stop_code: l.stop_code, stop_type: l.stop_type,
        direction_label: l.direction_label, mode_badge: l.mode_badge, badge_color: l.badge_color,
      } as any],
    });
    router.replace("/(tabs)/map" as any);
  };

  const handleSelectRoute = (rt: MobilitySearchRouteItem) => {
    startSearch({ query: `Line ${rt.route_short_name}`, activeTab: "bus", routes: [rt] });
    router.replace("/(tabs)/map" as any);
  };

  const q = query.trim();
  const searching = !!q && (isSearchingStops || isSearchingPlaces);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!q) {
      const rec = recents.filter((r) =>
        filter === "place" ? r._type === "location" : filter === "transit" ? r._type === "stop" : filter !== "route"
      );
      if (rec.length) out.push({ kind: "header", key: "h-rec", title: "Recent" });
      rec.forEach((r) => out.push({ kind: "recent", key: `rec-${r.id}`, item: r }));
      return out;
    }
    const add = (title: string, items: Row[]) => {
      if (!items.length) return;
      if (filter === "all") out.push({ kind: "header", key: `h-${title}`, title });
      out.push(...items);
    };
    if (filter === "all" || filter === "route")
      add("Lines", matchedRoutes.map((rt) => ({ kind: "route" as const, key: `rt-${rt.route_id}`, item: rt })));
    if (filter === "all" || filter === "transit")
      add("Stops", stops.map((st) => ({ kind: "stop" as const, key: `st-${st.id}`, item: st })));
    if (filter === "all" || filter === "place")
      add("Places", placePredictions.map((p) => ({ kind: "place" as const, key: `pl-${p.place_id}`, item: p })));
    return out;
  }, [q, recents, filter, matchedRoutes, stops, placePredictions]);

  const goPinned = (place: typeof homePlace, label: string) => {
    Haptics.selectionAsync();
    if (place) {
      router.push({
        pathname: "/route" as any,
        params: { tLat: String(place.lat), tLng: String(place.lng), tName: label },
      });
    } else {
      router.push("/(account)/saved-places" as any);
    }
  };

  const strong = { fontWeight: "800" as const, color: C.text };

  const renderRow = ({ item, index }: { item: Row; index: number }) => {
    const enter = FadeIn.duration(160).delay(Math.min(index, 8) * 18);

    if (item.kind === "header") {
      return (
        <Reanimated.View entering={enter}>
          <Text style={[s.section, { color: C.sub }]}>{item.title.toUpperCase()}</Text>
        </Reanimated.View>
      );
    }

    if (item.kind === "route") {
      const rt = item.item;
      return (
        <Reanimated.View entering={enter}>
          <PressableScale pressedScale={0.98} onPress={() => handleSelectRoute(rt)} style={[s.row, { borderBottomColor: C.line }]}>
            <View style={[s.modeTag, { backgroundColor: rt.route_color || ORANGE }]}>
              <Text style={s.modeTagText}>{rt.mode_badge}</Text>
            </View>
            <View style={s.rowText}>
              <Highlight text={`Line ${rt.route_short_name}`} query={q} style={[s.rowTitle, { color: C.text }]} strong={strong} />
              <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
                {[rt.route_long_name, rt.agency_name].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.sub} />
          </PressableScale>
        </Reanimated.View>
      );
    }

    if (item.kind === "stop" || (item.kind === "recent" && item.item._type === "stop")) {
      const st = item.item as UnifiedLocation & Record<string, any>;
      const meta = resolveStopCategory(st as any);
      return (
        <Reanimated.View entering={enter}>
          <PressableScale pressedScale={0.98} onPress={() => handleSelectStop(st)} style={[s.row, { borderBottomColor: C.line }]}>
            <View style={[s.stopBadge, { backgroundColor: meta.color }]}>
              <StopTypeGlyph category={meta.category} size={16} />
            </View>
            <View style={s.rowText}>
              <Highlight text={st.name} query={q} style={[s.rowTitle, { color: C.text }]} strong={strong} />
              <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
                {[st.stop_code, st.route_nams ? `Lines ${st.route_nams}` : null].filter(Boolean).join(" · ") || "Stop"}
              </Text>
            </View>
            {item.kind === "recent" && <Ionicons name="time-outline" size={16} color={C.sub} />}
          </PressableScale>
        </Reanimated.View>
      );
    }

    if (item.kind === "place") {
      const pred = item.item;
      const busy = resolvingId === pred.place_id;
      return (
        <Reanimated.View entering={enter}>
          <PressableScale pressedScale={0.98} onPress={() => handleSelectPrediction(pred)} style={[s.row, { borderBottomColor: C.line }]}>
            <View style={[s.iconDisc, { backgroundColor: C.chip }]}>
              {busy ? <ActivityIndicator size="small" color={ORANGE} /> : <Ionicons name="location" size={16} color={C.sub} />}
            </View>
            <View style={s.rowText}>
              <Highlight text={pred.main_text} query={q} style={[s.rowTitle, { color: C.text }]} strong={strong} />
              {!!pred.secondary_text && (
                <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{pred.secondary_text}</Text>
              )}
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => setQuery(pred.main_text)}
              accessibilityLabel={`Search for ${pred.main_text}`}
            >
              <Ionicons name="arrow-up-outline" size={17} color={C.sub} style={{ transform: [{ rotate: "-45deg" }] }} />
            </Pressable>
          </PressableScale>
        </Reanimated.View>
      );
    }

    // Recent place: open it directly (we already have its coordinates).
    const rec = item.item;
    return (
      <Reanimated.View entering={enter}>
        <PressableScale
          pressedScale={0.98}
          onPress={() => openPlace({ id: rec.id, name: rec.name, lat: rec.lat, lng: rec.lng })}
          style={[s.row, { borderBottomColor: C.line }]}
        >
          <View style={[s.iconDisc, { backgroundColor: C.chip }]}>
            <Ionicons name="location" size={16} color={C.sub} />
          </View>
          <View style={s.rowText}>
            <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{rec.name}</Text>
          </View>
          <Ionicons name="time-outline" size={16} color={C.sub} />
        </PressableScale>
      </Reanimated.View>
    );
  };

  const empty = q ? (
    searching ? null : (
      <View style={s.empty}>
        <View style={[s.emptyDisc, { backgroundColor: C.chip }]}>
          <Ionicons name="search-outline" size={24} color={C.sub} />
        </View>
        <Text style={[s.emptyTitle, { color: C.text }]}>No matches for “{q}”</Text>
        <Text style={[s.emptySub, { color: C.sub }]}>
          Press search to look around the map, or try a stop name, a line number (“14A”) or a place.
        </Text>
      </View>
    )
  ) : (
    <View style={s.empty}>
      <View style={[s.emptyDisc, { backgroundColor: C.chip }]}>
        <Ionicons name="compass-outline" size={24} color={C.sub} />
      </View>
      <Text style={[s.emptyTitle, { color: C.text }]}>Where to?</Text>
      <Text style={[s.emptySub, { color: C.sub }]}>
        Search a place, a stop or a line. Your recent searches will show up here.
      </Text>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: C.bg }]}>
      {/* ── Search field + categories ─────────────────────────────────────── */}
      <View style={[s.topHeader, { paddingTop: Math.max(insets.top, 12) + 4, borderBottomColor: C.line }]}>
        <View style={[s.searchBox, { backgroundColor: C.field }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search places, stops or lines"
            placeholderTextColor={C.sub}
            style={[s.searchInput, { color: C.text }]}
            returnKeyType="search"
            onSubmitEditing={() => searchOnMap(query)}
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={ORANGE} />
          ) : query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear">
              <Ionicons name="close-circle" size={18} color={C.sub} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.categoryStrip}
        >
          {QUICK_CATEGORIES.map((cat) => (
            <PressableScale
              key={cat.key}
              onPress={() => searchOnMap(cat.label)}
              style={[s.catChip, { backgroundColor: C.chip }]}
              accessibilityRole="button"
            >
              <PlaceCategoryIcon category={cat.key} size={16} color={cat.color} />
              <Text style={[s.catLabel, { color: C.text }]}>{cat.label}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      {/* ── Home / Work + Directions ──────────────────────────────────────── */}
      <View style={[s.quickRow, { borderBottomColor: C.line }]}>
        <PressableScale onPress={() => goPinned(homePlace, "Home")} style={[s.quickChip, { backgroundColor: C.chip }]}>
          <Ionicons name="home" size={15} color={ORANGE} />
          <Text style={[s.quickText, { color: C.text }]}>{homePlace ? "Home" : "Set home"}</Text>
        </PressableScale>
        <PressableScale onPress={() => goPinned(workPlace, "Work")} style={[s.quickChip, { backgroundColor: C.chip }]}>
          <Ionicons name="briefcase" size={15} color={ORANGE} />
          <Text style={[s.quickText, { color: C.text }]}>{workPlace ? "Work" : "Set work"}</Text>
        </PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale
          onPress={() => router.push("/route" as any)}
          style={[s.quickChip, { backgroundColor: ORANGE }]}
          accessibilityRole="button"
        >
          <Ionicons name="navigate" size={14} color="#FFFFFF" />
          <Text style={[s.quickText, { color: "#FFFFFF" }]}>Directions</Text>
        </PressableScale>
      </View>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <PressableScale
              key={f.key}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter(f.key);
              }}
              style={[s.filterPill, { backgroundColor: on ? C.text : C.chip }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.filterText, { color: on ? C.bg : C.sub }]}>{f.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      {/* ── Results / recents ─────────────────────────────────────────────── */}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topHeader: { paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, fontWeight: "500" },
  categoryStrip: { paddingTop: 12, gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  catLabel: { fontSize: 13, fontWeight: "600" },

  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  quickText: { fontSize: 13, fontWeight: "700" },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  filterText: { fontSize: 13, fontWeight: "700" },

  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  iconDisc: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  stopBadge: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
  },
  modeTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, minWidth: 38, alignItems: "center" },
  modeTagText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },

  empty: { alignItems: "center", paddingHorizontal: 34, paddingTop: 40, gap: 8 },
  emptyDisc: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
