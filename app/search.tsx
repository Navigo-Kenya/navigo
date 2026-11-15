// app/(tabs)/search.tsx
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
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStopSearch } from "@/hooks/useStopSearch";
import { MapService, type PlacePrediction } from "@/services/map";
import { StopService, type MobilitySearchRouteItem } from "@/services/stop";
import { useSavedStore } from "@/store/savedStore";
import { UnifiedLocation } from "@/store/journeyStore";
import { useExploreSearchStore } from "@/store/exploreSearchStore";
import { QUICK_CATEGORIES } from "@/components/app/MapFloatingUI";

const ORANGE = "#FF6F00";

type HistoryFilter = "recent" | "place" | "address" | "transit" | "route";

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

  // If deep-linked with planner params, forward straight to the dedicated `/route` screen
  useEffect(() => {
    if (
      params.mode === "planner" ||
      (params.fLat && params.fLng) ||
      (params.tLat && params.tLng)
    ) {
      router.replace({ pathname: "/route" as any, params });
    }
  }, [params, router]);

  const { query: existingQuery, startSearch, setResults, setLoading } =
    useExploreSearchStore();

  const [query, setQuery] = useState(existingQuery || "");
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>(
    params.tab === "transit" ? "transit" : "recent"
  );
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [matchedRoutes, setMatchedRoutes] = useState<MobilitySearchRouteItem[]>(
    []
  );
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { places: savedPlaces, fetch: fetchSaved } = useSavedStore();
  useEffect(() => {
    fetchSaved().catch(() => {});
  }, [fetchSaved]);

  const homePlace = savedPlaces.find((p) => p.pin === "home");
  const workPlace = savedPlaces.find((p) => p.pin === "work");

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        setMe({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      }
    })();
  }, []);

  const {
    stops,
    places: placePredictions,
    recents,
    pushRecent,
    isSearchingStops,
    isSearchingPlaces,
  } = useStopSearch(query, me);

  // Also fetch matching transit routes (Bus, BRT, Rail, SGR)
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

  const bg = dark ? "#0F0F0F" : "#FFFFFF";
  const cardBg = dark ? "#18181B" : "#F8FAFC";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";

  // Smoothly transitions to `/map` while preserving the full search results & context sheet!
  const handleExecuteSearchToMap = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    startSearch({ query: q, activeTab: "all" });
    setLoading(true);
    router.replace("/(tabs)/map" as any);

    try {
      const [preds, mobility] = await Promise.all([
        MapService.placesAutocomplete(q, me?.latitude, me?.longitude),
        StopService.searchMobility(q, me?.latitude, me?.longitude),
      ]);

      const resolvedPlaces = await Promise.all(
        preds.slice(0, 4).map(async (p) => {
          const det = await MapService.getPlaceDetails(p.place_id);
          if (!det) return null;
          return {
            id: p.place_id,
            name: p.main_text,
            address: p.secondary_text || p.description,
            category: "Place",
            lat: det.lat,
            lng: det.lng,
            rating: 4.5,
            reviewCount: 28,
          };
        })
      );

      setResults({
        places: resolvedPlaces.filter(Boolean) as any[],
        stops: mobility.stops,
        routes: mobility.routes,
      });
    } catch {
      setLoading(false);
    }
  };

  const handleSelectPrediction = async (pred: PlacePrediction) => {
    setResolvingId(pred.place_id);
    const details = await MapService.getPlaceDetails(pred.place_id);
    setResolvingId(null);
    if (!details) return;

    const unified: UnifiedLocation = {
      _type: "location",
      id: pred.place_id,
      name: pred.main_text,
      lat: details.lat,
      lng: details.lng,
    };
    pushRecent(unified);

    const placeObj = {
      id: pred.place_id,
      name: pred.main_text,
      address: pred.secondary_text || pred.description,
      category: "Place & Building",
      lat: details.lat,
      lng: details.lng,
      rating: 4.5,
      reviewCount: 31,
    };

    startSearch({
      query: pred.main_text,
      activeTab: "place",
      places: [placeObj],
      selectedPlace: placeObj,
    });
    router.replace("/(tabs)/map" as any);
  };

  const handleSelectStopItem = (loc: UnifiedLocation) => {
    pushRecent(loc);
    startSearch({
      query: loc.name,
      activeTab: "stop",
      stops: [
        {
          id: loc.id,
          name: loc.name,
          lat: loc.lat,
          lng: loc.lng,
          route_nams: loc.route_nams,
          stop_code: (loc as any).stop_code,
          direction_label: (loc as any).direction_label,
          mode_badge: (loc as any).mode_badge ?? "Bus",
          badge_color: (loc as any).badge_color ?? "#2563EB",
        },
      ],
    });
    router.replace("/(tabs)/map" as any);
  };

  const handleSelectRouteItem = (rt: MobilitySearchRouteItem) => {
    startSearch({
      query: `Line ${rt.route_short_name}`,
      activeTab: "bus",
      routes: [rt],
    });
    router.replace("/(tabs)/map" as any);
  };

  const listItems = useMemo(() => {
    const rows: any[] = [];
    const q = query.trim();

    if (!q) {
      const filteredRecents = recents.filter((r) => {
        if (activeFilter === "place") return r._type === "location";
        if (activeFilter === "transit") return r._type === "stop";
        return true;
      });
      filteredRecents.forEach((r) =>
        rows.push({ _kind: "recent", item: r, key: `rec-${r.id}` })
      );
      return rows;
    }

    if (activeFilter === "recent" || activeFilter === "route" || activeFilter === "transit") {
      matchedRoutes.forEach((rt) =>
        rows.push({ _kind: "route", item: rt, key: `rt-${rt.route_id}` })
      );
    }

    if (activeFilter === "recent" || activeFilter === "transit") {
      stops.forEach((st) =>
        rows.push({ _kind: "stop", item: st, key: `st-${st.id}` })
      );
    }

    if (activeFilter === "recent" || activeFilter === "place" || activeFilter === "address") {
      placePredictions.forEach((p) =>
        rows.push({ _kind: "place", item: p, key: `pl-${p.place_id}` })
      );
    }

    return rows;
  }, [query, recents, activeFilter, matchedRoutes, stops, placePredictions]);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* 1. Top Search Input Header (< Search places or buses)[cite: 4, 14] */}
      <View
        style={[
          s.topHeader,
          { paddingTop: Math.max(insets.top, 12) + 4, borderBottomColor: borderCol },
        ]}
      >
        <View
          style={[
            s.searchBox,
            { backgroundColor: cardBg, borderColor: borderCol },
          ]}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={s.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={textPrimary} />
          </Pressable>

          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search places, buses, or stations"
            placeholderTextColor={textMuted}
            style={[s.searchInput, { color: textPrimary }]}
            returnKeyType="search"
            onSubmitEditing={() => handleExecuteSearchToMap(query)}
          />

          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={textMuted} />
            </Pressable>
          )}
        </View>

        {/* 2. Quick Category Row (Restaurant, Cafe, 24h Store, Gas Station, Hospital, Parking)[cite: 4, 14] */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.categoryStrip}
        >
          {QUICK_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => handleExecuteSearchToMap(cat.label)}
              style={s.catItem}
            >
              <Ionicons name={cat.icon as any} size={15} color={cat.color} />
              <Text style={[s.catLabel, { color: textPrimary }]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* 3. Home / Work/School Quick Bar + [Edit] Pill[cite: 4, 14] */}
      <View style={[s.homeWorkBar, { borderBottomColor: borderCol }]}>
        <View style={s.homeWorkLeft}>
          <Pressable
            onPress={() => {
              if (homePlace) {
                router.push({
                  pathname: "/route" as any,
                  params: {
                    tLat: String(homePlace.lat),
                    tLng: String(homePlace.lng),
                    tName: "Home",
                  },
                });
              } else {
                router.push("/(account)/saved-places" as any);
              }
            }}
            style={s.pinShortcut}
          >
            <Ionicons name="home" size={16} color={textMuted} />
            <Text style={[s.pinShortcutText, { color: textPrimary }]}>
              Home
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (workPlace) {
                router.push({
                  pathname: "/route" as any,
                  params: {
                    tLat: String(workPlace.lat),
                    tLng: String(workPlace.lng),
                    tName: "Work",
                  },
                });
              } else {
                router.push("/(account)/saved-places" as any);
              }
            }}
            style={s.pinShortcut}
          >
            <Ionicons name="business" size={16} color={textMuted} />
            <Text style={[s.pinShortcutText, { color: textPrimary }]}>
              Work/School
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push("/(account)/saved-places" as any)}
          style={[s.editPill, { borderColor: borderCol }]}
        >
          <Text style={[s.editPillText, { color: textMuted }]}>Edit</Text>
        </Pressable>
      </View>

      {/* 4. Filter Tabs: Recent | Place | Address | Transit | Route[cite: 4, 14] */}
      <View style={s.filterPillsRow}>
        {(
          [
            { key: "recent", label: "Recent" },
            { key: "place", label: "Place" },
            { key: "address", label: "Address" },
            { key: "transit", label: "Transit" },
            { key: "route", label: "Route" },
          ] as const
        ).map((f) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                Haptics.selectionAsync();
                if (f.key === "route" && !query.trim()) {
                  router.push("/route" as any);
                  return;
                }
                setActiveFilter(f.key);
              }}
              style={[
                s.filterPill,
                active
                  ? [s.filterPillActive, { borderColor: textPrimary }]
                  : { backgroundColor: cardBg },
              ]}
            >
              <Text
                style={[
                  s.filterPillText,
                  { color: active ? textPrimary : textMuted },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 5. Results & Recent History List[cite: 4, 14] */}
      {(isSearchingStops || isSearchingPlaces) && listItems.length === 0 ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={ORANGE} />
          <Text style={{ color: textMuted, fontSize: 13 }}>Searching…</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            if (item._kind === "route") {
              const rt = item.item as MobilitySearchRouteItem;
              return (
                <Pressable
                  onPress={() => handleSelectRouteItem(rt)}
                  style={[s.row, { borderBottomColor: borderCol }]}
                >
                  <View
                    style={[
                      s.roundBadge,
                      { backgroundColor: rt.route_color || ORANGE },
                    ]}
                  >
                    <Ionicons name="bus" size={15} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.rowTitle, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      Line {rt.route_short_name} · {rt.route_long_name}
                    </Text>
                    <Text style={[s.rowSub, { color: textMuted }]}>
                      {rt.mode_badge}
                      {rt.agency_name ? ` · ${rt.agency_name}` : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            }

            if (item._kind === "stop") {
              const st = item.item as UnifiedLocation;
              const code =
                (st as any).stop_code ?? st.id.slice(-5).toUpperCase();
              return (
                <Pressable
                  onPress={() => handleSelectStopItem(st)}
                  style={[s.row, { borderBottomColor: borderCol }]}
                >
                  <View style={[s.roundBadge, { backgroundColor: cardBg }]}>
                    <Text style={[s.busCircleText, { color: textMuted }]}>
                      BUS
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.stopTitleLine}>
                      <Text
                        style={[s.rowTitle, { color: textPrimary }]}
                        numberOfLines={1}
                      >
                        {st.name}
                      </Text>
                      <Text style={[s.stopCodeText, { color: textMuted }]}>
                        {code}
                      </Text>
                    </View>
                    {st.route_nams && (
                      <Text
                        style={[s.rowSub, { color: textMuted }]}
                        numberOfLines={1}
                      >
                        Lines: {st.route_nams}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }

            if (item._kind === "place") {
              const pred = item.item as PlacePrediction;
              const busy = resolvingId === pred.place_id;
              return (
                <Pressable
                  onPress={() => handleSelectPrediction(pred)}
                  style={[s.row, { borderBottomColor: borderCol }]}
                >
                  <View style={[s.roundBadge, { backgroundColor: cardBg }]}>
                    {busy ? (
                      <ActivityIndicator size="small" color={ORANGE} />
                    ) : (
                      <Ionicons
                        name="location"
                        size={16}
                        color={textMuted}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.rowTitle, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      {pred.main_text}
                    </Text>
                    {pred.secondary_text ? (
                      <Text
                        style={[s.rowSub, { color: textMuted }]}
                        numberOfLines={1}
                      >
                        {pred.secondary_text}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }

            // Recent item (matches KakaoMap's BUS / Pin / Train icon + date on right)[cite: 4, 14]
            const rec = item.item as UnifiedLocation;
            const isStop = rec._type === "stop";
            const code = isStop ? rec.id.slice(-5).toUpperCase() : null;
            return (
              <Pressable
                onPress={() =>
                  isStop
                    ? handleSelectStopItem(rec)
                    : handleExecuteSearchToMap(rec.name)
                }
                style={[s.row, { borderBottomColor: borderCol }]}
              >
                <View style={[s.roundBadge, { backgroundColor: cardBg }]}>
                  {isStop ? (
                    <Text style={[s.busCircleText, { color: textMuted }]}>
                      BUS
                    </Text>
                  ) : (
                    <Ionicons name="location" size={16} color={textMuted} />
                  )}
                </View>
                <View style={s.stopTitleLine}>
                  <Text
                    style={[s.rowTitle, { color: textPrimary }]}
                    numberOfLines={1}
                  >
                    {rec.name}
                  </Text>
                  {code && (
                    <Text style={[s.stopCodeText, { color: textMuted }]}>
                      {code}
                    </Text>
                  )}
                </View>
                <Text style={[s.dateRight, { color: textMuted }]}>Recent</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 8,
  },
  backBtn: { paddingRight: 2 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  categoryStrip: {
    paddingTop: 12,
    paddingBottom: 2,
    gap: 18,
    paddingHorizontal: 4,
  },
  catItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  homeWorkBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  homeWorkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  pinShortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pinShortcutText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  editPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  editPillText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  filterPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 18,
  },
  filterPillActive: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  roundBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  busCircleText: {
    fontSize: 9,
    fontWeight: "900",
  },
  stopTitleLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  stopCodeText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  dateRight: {
    fontSize: 11.5,
  },
});