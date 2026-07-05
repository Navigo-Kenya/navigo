// app/search.tsx
import { useStopSearch } from "@/hooks/useStopSearch";
import { MapService, type PlacePrediction } from "@/services/map";
import { RouteService, type Route } from "@/services/route";
import { useSavedStore } from "@/store/savedStore";
import { usePrefsStore } from "@/store/prefsStore";
import { rankRoutes, routeDeltas, type RouteRanking } from "@/utils/rankRoutes";
import RouteRankChips from "@/components/app/RouteRankChips";
import { UnifiedLocation, useJourneyStore } from "@/store/journeyStore";
import { getRouteColor, extractFares } from "@/utils/mapHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const BLUE   = "#007AFF";
const GREY   = "#8E8E93";
const SCREEN_HEIGHT = Dimensions.get("window").height;

type Field = "from" | "to";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#FFFFFF",
    card:     dark ? "#1C1C1E" : "#F2F2F7",
    sheet:    dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#000000",
    sub:      dark ? "#8E8E93" : "#8E8E93",
    border:   dark ? "#2C2C2E" : "#E5E5EA",
    handle:   dark ? "#3A3A3C" : "#D1D5DB",
    input:    dark ? "#0F0F0F" : "#FFFFFF",
    iconBg:   dark ? "#2C2C2E" : "#F2F2F7",
    pressed:  dark ? "#2C2C2E" : "#E5E5EA",
    hairline: dark ? "#2C2C2E" : "#E5E5EA",
    routeCard:dark ? "#1C1C1E" : "#F2F2F7",
  };
}

const DEFAULT_LISTS = [
  { key: "favorites",    label: "Favorites"    },
  { key: "want_to_go",   label: "Want to go"   },
  { key: "travel_plans", label: "Travel plans"  },
  { key: "labeled",      label: "Labeled"       },
] as const;

export default function SearchScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const dark        = useColorScheme() === "dark";
  const C           = makeC(dark);

  // ── Deep-link pre-fill (from route.tsx share redirect) ───────────────────────
  const dlParams = useLocalSearchParams<{
    fLat?: string; fLng?: string; fName?: string;
    tLat?: string; tLng?: string; tName?: string;
  }>();
  const hasDeepLink = !!(dlParams.fLat && dlParams.fLng && dlParams.tLat && dlParams.tLng);

  // ── Journey state ────────────────────────────────────────────────────────────
  const [currentLocation, setCurrentLocation] = useState<UnifiedLocation | null>(null);
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ]     = useState("");
  const [fromLoc, setFromLoc] = useState<UnifiedLocation | null>(null);
  const [toLoc, setToLoc]     = useState<UnifiedLocation | null>(null);
  const setJourney = useJourneyStore((s) => s.setJourney);

  const [focusedField, setFocusedField] = useState<Field>("to");
  const toInputRef = useRef<TextInput>(null);

  // ── Saved store (home / work / custom lists) ─────────────────────────────────
  const { places: savedPlaces, addPlace, customLists, fetch: fetchSaved } = useSavedStore();
  useEffect(() => { fetchSaved().catch(() => {}); }, [fetchSaved]);
  const { prefs, load: loadPrefs } = usePrefsStore();
  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const homePlace = savedPlaces.find((p) => p.pin === "home");
  const workPlace = savedPlaces.find((p) => p.pin === "work");

  const isSaved = (loc: UnifiedLocation) =>
    savedPlaces.some((p) => p.place_id === loc.id && p.pin === null);

  // ── Search ────────────────────────────────────────────────────────────────────
  const activeQuery = focusedField === "from" ? fromQ : toQ;
  const {
    stops,
    places: placeResults,
    recents,
    pushRecent,
    isSearchingStops,
    isSearchingPlaces,
  } = useStopSearch(
    activeQuery,
    currentLocation ? { latitude: currentLocation.lat, longitude: currentLocation.lng } : null,
  );

  // ── Route sheet ───────────────────────────────────────────────────────────────
  const sheetAnim         = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [availableRoutes, setAvailableRoutes]   = useState<Route[]>([]);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);

  // Tradeoff chips: null = follow the user's preferred default until they tap.
  const [rankingOverride, setRankingOverride] = useState<RouteRanking | null>(null);
  const activeRanking = rankingOverride ?? prefs.routeRanking;
  const rankedRoutes  = useMemo(
    () => rankRoutes(availableRoutes, activeRanking),
    [availableRoutes, activeRanking],
  );
  const deltas = useMemo(() => routeDeltas(rankedRoutes), [rankedRoutes]);

  // Pre-populate from/to when arriving via a shared route link
  useEffect(() => {
    if (!hasDeepLink) return;
    const from: UnifiedLocation = {
      _type: 'location',
      id:    dlParams.fName || 'Origin',
      name:  dlParams.fName || 'Origin',
      lat:   parseFloat(dlParams.fLat!),
      lng:   parseFloat(dlParams.fLng!),
    };
    const to: UnifiedLocation = {
      _type: 'location',
      id:    dlParams.tName || 'Destination',
      name:  dlParams.tName || 'Destination',
      lat:   parseFloat(dlParams.tLat!),
      lng:   parseFloat(dlParams.tLng!),
    };
    setFromLoc(from);  setFromQ(from.name);
    setToLoc(to);      setToQ(to.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Destination-only deep link (home-screen quick actions: "Go home"/"Go to
  // work"): prefill the destination and let origin default to the user.
  useEffect(() => {
    if (hasDeepLink) return;
    if (!dlParams.tLat || !dlParams.tLng) return;
    const to: UnifiedLocation = {
      _type: 'location',
      id:    dlParams.tName || 'Destination',
      name:  dlParams.tName || 'Destination',
      lat:   parseFloat(dlParams.tLat),
      lng:   parseFloat(dlParams.tLng),
    };
    setToLoc(to);
    setToQ(to.name);
    setFocusedField("from");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Current location permission
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          _type: "location",
          id:    "current_location",
          name:  "Current Location",
          lat:   pos.coords.latitude,
          lng:   pos.coords.longitude,
        });
      }
    })();
  }, []);

  // Route fetching + keyboard dismiss
  useEffect(() => {
    if (fromLoc && toLoc) {
      Keyboard.dismiss();
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }).start();
      setIsFetchingRoutes(true);
      RouteService.calculateJourney(fromLoc, toLoc, prefs.maxWalkMeters)
        .then(setAvailableRoutes)
        .catch(() => setAvailableRoutes([]))
        .finally(() => setIsFetchingRoutes(false));
    } else {
      Animated.timing(sheetAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setAvailableRoutes([]);
    }
  }, [fromLoc, toLoc, sheetAnim, prefs.maxWalkMeters]);

  // ── Save recent to list ───────────────────────────────────────────────────────
  const saveToList = (loc: UnifiedLocation, listKey: string) => {
    addPlace({
      name:     loc.name,
      lat:      loc.lat,
      lng:      loc.lng,
      type:     loc._type,
      place_id: loc.id ?? null,
      pin:      null,
      list:     listKey,
      category: loc._type === "stop" ? "Transit stop" : null,
      note:     null,
    }).catch(() => Alert.alert("Error", "Could not save this place."));
  };

  const showSavePicker = (loc: UnifiedLocation) => {
    const allLists = [
      ...DEFAULT_LISTS,
      ...customLists.map((l) => ({ key: l, label: l })),
    ];
    Alert.alert(
      "Save to list",
      loc.name,
      [
        ...allLists.map((l) => ({ text: l.label, onPress: () => saveToList(loc, l.key) })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  // ── List rows ─────────────────────────────────────────────────────────────────
  const data = useMemo(() => {
    const rows: any[] = [];

    if (!activeQuery) {
      // Current location (from field only)
      if (focusedField === "from" && currentLocation) {
        rows.push({ _type: "current-location", location: currentLocation, key: "current-location" });
      }

      // Home address (both fields)
      if (homePlace) {
        rows.push({
          _type: "home-address",
          key:   "home-address",
          location: {
            _type: "location" as const,
            id:    `home_${homePlace.id}`,
            name:  homePlace.name,
            lat:   homePlace.lat,
            lng:   homePlace.lng,
          } as UnifiedLocation,
        });
      }

      // Work address (both fields)
      if (workPlace) {
        rows.push({
          _type: "work-address",
          key:   "work-address",
          location: {
            _type: "location" as const,
            id:    `work_${workPlace.id}`,
            name:  workPlace.name,
            lat:   workPlace.lat,
            lng:   workPlace.lng,
          } as UnifiedLocation,
        });
      }

      // Recents
      if (recents.length > 0) {
        rows.push({ _type: "header", title: "Recent", key: "hdr-recent" });
        for (const r of recents)
          rows.push({ _type: "recent", location: r, key: `recent-${r.id}` });
      }
    }

    if (activeQuery) {
      // Transit stops
      if (stops.length > 0 || isSearchingStops) {
        rows.push({ _type: "header", title: "Transit Stops", key: "hdr-stops" });
        if (isSearchingStops) {
          rows.push({ _type: "stops-loading", key: "stops-loading" });
        } else {
          for (const s of stops)
            rows.push({ _type: "stop-item", location: s, key: `stop-${s.id}` });
        }
      }

      // Places
      if (placeResults.length > 0 || isSearchingPlaces) {
        rows.push({ _type: "header", title: "Places", key: "hdr-places" });
        if (isSearchingPlaces) {
          rows.push({ _type: "places-loading", key: "places-loading" });
        } else {
          for (const p of placeResults)
            rows.push({ _type: "place-item", place: p, key: `place-${p.place_id}` });
        }
      }

      if (!isSearchingStops && !isSearchingPlaces && stops.length === 0 && placeResults.length === 0) {
        rows.push({ _type: "header", title: "No places found", key: "hdr-empty" });
      }
    }

    return rows;
  }, [
    activeQuery, stops, placeResults, isSearchingStops, isSearchingPlaces,
    recents, focusedField, currentLocation, homePlace, workPlace,
  ]);

  // ── Select handlers ───────────────────────────────────────────────────────────
  function onSelectLocation(loc: UnifiedLocation) {
    pushRecent(loc);
    if (focusedField === "from") {
      setFromLoc(loc);
      setFromQ(loc.name);
      if (!toLoc) {
        setFocusedField("to");
        toInputRef.current?.focus();
      }
    } else {
      setToLoc(loc);
      setToQ(loc.name);
    }
  }

  async function onSelectPlace(pred: PlacePrediction) {
    setResolvingPlaceId(pred.place_id);
    const details = await MapService.getPlaceDetails(pred.place_id);
    setResolvingPlaceId(null);
    if (!details) return;
    onSelectLocation({
      _type: "location",
      id:    pred.place_id,
      name:  pred.main_text,
      lat:   details.lat,
      lng:   details.lng,
    });
  }

  function onSelectRoute(route: Route) {
    if (fromLoc && toLoc) {
      setJourney(fromLoc, toLoc, route);
      router.replace("/map");
    }
  }

  function swapFields() {
    setFromQ(toQ);    setToQ(fromQ);
    setFromLoc(toLoc); setToLoc(fromLoc);
  }

  // ── Header bar ────────────────────────────────────────────────────────────────
  const HeaderBar = (
    <View style={[s.headerContainer, { paddingTop: Math.max(insets.top, 16), backgroundColor: C.bg, borderBottomColor: C.hairline }]}>
      <View style={s.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={15} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: C.text }]}>Plan Route</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={[s.routeCard, { backgroundColor: C.routeCard }]}>
        <View style={s.timeline}>
          <View style={[s.dotFrom, { backgroundColor: C.sub }]} />
          <View style={[s.line, { backgroundColor: C.border }]} />
          <View style={[s.squareTo, { backgroundColor: C.text }]} />
        </View>

        <View style={s.inputStack}>
          <View style={s.inputWrapper}>
            <TextInput
              value={fromQ}
              onChangeText={(txt) => { setFromQ(txt); setFromLoc(null); }}
              onFocus={() => setFocusedField("from")}
              placeholder="From…"
              placeholderTextColor={BLUE}
              style={[s.input, { color: C.text }]}
              returnKeyType="next"
              onSubmitEditing={() => toInputRef.current?.focus()}
            />
            {fromQ.length > 0 && focusedField === "from" && (
              <Pressable
                onPress={() => { setFromQ(""); setFromLoc(null); }}
                hitSlop={10}
                style={s.clearBtn}
              >
                <Ionicons name="close-circle" size={16} color={C.sub} />
              </Pressable>
            )}
          </View>

          <View style={[s.divider, { backgroundColor: C.border }]} />

          <View style={s.inputWrapper}>
            <TextInput
              ref={toInputRef}
              autoFocus={!hasDeepLink}
              value={toQ}
              onChangeText={(txt) => { setToQ(txt); setToLoc(null); }}
              onFocus={() => setFocusedField("to")}
              placeholder="Where to?"
              placeholderTextColor={C.sub}
              style={[s.input, { color: C.text }]}
              returnKeyType="search"
            />
            {toQ.length > 0 && focusedField === "to" && (
              <Pressable
                onPress={() => { setToQ(""); setToLoc(null); }}
                hitSlop={10}
                style={s.clearBtn}
              >
                <Ionicons name="close-circle" size={16} color={C.sub} />
              </Pressable>
            )}
          </View>
        </View>

        <Pressable onPress={swapFields} style={s.swapBtn} hitSlop={10}>
          <Ionicons name="swap-vertical" size={20} color={C.sub} />
        </Pressable>
      </View>
    </View>
  );

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: any }) => {

    // Loading skeletons
    if (item._type === "stops-loading" || item._type === "places-loading") {
      return (
        <View style={[s.loadingRow, { borderBottomColor: C.hairline }]}>
          <ActivityIndicator size="small" color={C.sub} />
          <Text style={[s.loadingText, { color: C.sub }]}>Searching…</Text>
        </View>
      );
    }

    // Section header
    if (item._type === "header") {
      return <Text style={[s.sectionTitle, { color: C.sub }]}>{item.title}</Text>;
    }

    // Current location
    if (item._type === "current-location") {
      return (
        <Pressable
          onPress={() => onSelectLocation(item.location)}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: BLUE }]}>
            <Ionicons name="locate" size={18} color="#FFF" />
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]}>{item.location.name}</Text>
            <Text style={[s.rowSub, { color: C.sub }]}>Use my current location</Text>
          </View>
        </Pressable>
      );
    }

    // Home address
    if (item._type === "home-address") {
      return (
        <Pressable
          onPress={() => onSelectLocation(item.location)}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: ORANGE + "22" }]}>
            <Ionicons name="home" size={18} color={ORANGE} />
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]}>Home</Text>
            <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{item.location.name}</Text>
          </View>
        </Pressable>
      );
    }

    // Work address
    if (item._type === "work-address") {
      return (
        <Pressable
          onPress={() => onSelectLocation(item.location)}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: "#3B82F622" }]}>
            <Ionicons name="briefcase" size={18} color="#3B82F6" />
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]}>Work</Text>
            <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{item.location.name}</Text>
          </View>
        </Pressable>
      );
    }

    // Place result (Mapbox prediction)
    if (item._type === "place-item") {
      const pred = item.place as PlacePrediction;
      const isResolving = resolvingPlaceId === pred.place_id;
      return (
        <Pressable
          onPress={() => onSelectPlace(pred)}
          disabled={isResolving}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: C.iconBg }]}>
            {isResolving
              ? <ActivityIndicator size="small" color={ORANGE} />
              : <Ionicons name="location-outline" size={18} color={C.text} />
            }
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{pred.main_text}</Text>
            {pred.secondary_text ? (
              <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{pred.secondary_text}</Text>
            ) : null}
          </View>
        </Pressable>
      );
    }

    // Stop item
    if (item._type === "stop-item") {
      const loc = item.location as UnifiedLocation;
      return (
        <Pressable
          onPress={() => onSelectLocation(loc)}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: ORANGE + "18" }]}>
            <Ionicons name="bus-outline" size={18} color={ORANGE} />
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{loc.name}</Text>
            {loc.route_nams ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                pointerEvents="none"
                style={{ marginTop: 4 }}
                contentContainerStyle={{ gap: 4, alignItems: "center" }}
              >
                {loc.route_nams.split(",").map((name, i) => {
                  const n = name.trim();
                  const bc = getRouteColor(n);
                  return (
                    <View key={i} style={[s.routeBadge, { backgroundColor: bc + "15", borderColor: bc + "30" }]}>
                      <Text style={[s.routeBadgeText, { color: bc }]}>{n}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </Pressable>
      );
    }

    // Recent row
    if (item._type === "recent") {
      const loc = item.location as UnifiedLocation;
      const saved = isSaved(loc);
      return (
        <Pressable
          onPress={() => onSelectLocation(loc)}
          style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent", borderBottomColor: C.hairline }]}
        >
          <View style={[s.iconWrap, { backgroundColor: C.iconBg }]}>
            <Ionicons name="time-outline" size={18} color={C.sub} />
          </View>
          <View style={s.rowBody}>
            <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{loc.name}</Text>
            {loc._type === "stop" && loc.route_nams ? (
              <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{loc.route_nams}</Text>
            ) : null}
          </View>
          <Pressable
            hitSlop={12}
            onPress={() => showSavePicker(loc)}
            style={[s.saveIconBtn, { backgroundColor: saved ? ORANGE + "18" : C.iconBg }]}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={16}
              color={saved ? ORANGE : C.sub}
            />
          </Pressable>
        </Pressable>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: C.bg }]}>
      {HeaderBar}

      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[s.listContent, { backgroundColor: C.bg }]}
        keyboardShouldPersistTaps="handled"
        extraData={resolvingPlaceId}
        renderItem={renderItem}
      />

      {/* Route results sheet */}
      <Animated.View
        style={[
          s.bottomSheet,
          {
            transform: [{ translateY: sheetAnim }],
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: C.sheet,
          },
        ]}
      >
        <View style={[s.sheetHandle, { backgroundColor: C.handle }]} />

        <View style={[s.sheetHeader, { borderBottomColor: C.hairline }]}>
          <Text style={[s.sheetTitle, { color: C.text }]}>Available Routes</Text>
          {fromLoc && toLoc && (
            <Text style={[s.sheetSubtitle, { color: C.sub }]} numberOfLines={1}>
              {fromLoc.name} → {toLoc.name}
            </Text>
          )}
        </View>

        {isFetchingRoutes ? (
          <View style={s.sheetEmpty}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={[s.sheetEmptySub, { color: C.sub, marginTop: 16 }]}>
              Finding the best lines…
            </Text>
          </View>
        ) : availableRoutes.length === 0 ? (
          <View style={s.sheetEmpty}>
            <View style={[s.sheetEmptyIcon, { backgroundColor: C.iconBg }]}>
              <Ionicons name="bus-outline" size={32} color={C.sub} />
            </View>
            <Text style={[s.sheetEmptyTitle, { color: C.text }]}>No transit available</Text>
            <Text style={[s.sheetEmptySub, { color: C.sub }]}>
              Buses might not be running right now, or the location is too far.
            </Text>
          </View>
        ) : (
          <FlatList
            data={rankedRoutes}
            keyExtractor={(_, i) => `route-${i}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8, gap: 10 }}
            ListHeaderComponent={
              <RouteRankChips
                routes={rankedRoutes}
                active={activeRanking}
                onSelect={setRankingOverride}
                dark={dark}
              />
            }
            renderItem={({ item: route, index }) => {
              const transitSegs = (route.segments || []).filter(
                (seg) => seg.mode === "BUS" || seg.mode === "TRAM"
              );

              let title = "Walk Only";
              if (transitSegs.length === 1) title = `Line ${transitSegs[0].route_name}`;
              else if (transitSegs.length > 1)
                title = `Line ${transitSegs[0].route_name} → ${transitSegs[1].route_name}`;

              const hasTransit = transitSegs.length > 0;
              const iconName = route.type === "transfer"
                ? "git-network-outline"
                : hasTransit ? "bus" : "walk";
              const iconBg = route.type === "transfer"
                ? BLUE
                : hasTransit ? ORANGE : GREY;
              const durationMins = Math.round(route.total_duration / 60);
              const walkKm = route.total_walk_distance
                ? (route.total_walk_distance / 1000).toFixed(1)
                : null;
              const fare = prefs.showFares
                ? extractFares(route.segments ?? [])
                : null;

              return (
                <Pressable
                  onPress={() => onSelectRoute(route)}
                  style={({ pressed }) => [
                    s.routeCard2,
                    { borderColor: C.hairline, backgroundColor: pressed ? C.pressed : C.card },
                  ]}
                >
                  <View style={s.routeCard2Row}>
                    <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
                      <Ionicons name={iconName} size={18} color="#FFF" />
                    </View>

                    <View style={s.routeCard2Body}>
                      <Text style={[s.routeCard2Title, { color: C.text }]} numberOfLines={1}>
                        {title}
                      </Text>
                      <View style={s.routeMeta}>
                        {route.type === "transfer" ? (
                          <View style={[s.metaBadge, { backgroundColor: BLUE + "15" }]}>
                            <Ionicons name="git-network-outline" size={11} color={BLUE} />
                            <Text style={[s.metaBadgeText, { color: BLUE }]}>Transfer</Text>
                          </View>
                        ) : hasTransit ? (
                          <View style={[s.metaBadge, { backgroundColor: "#30D15815" }]}>
                            <Ionicons name="checkmark-circle-outline" size={11} color="#30D158" />
                            <Text style={[s.metaBadgeText, { color: "#30D158" }]}>Direct</Text>
                          </View>
                        ) : null}
                        {walkKm && (
                          <View style={[s.metaBadge, { backgroundColor: C.iconBg }]}>
                            <Ionicons name="walk-outline" size={11} color={C.sub} />
                            <Text style={[s.metaBadgeText, { color: C.sub }]}>{walkKm} km walk</Text>
                          </View>
                        )}
                        {/* Tradeoff vs the best alternative for the active criterion */}
                        {deltas[index]?.minutesVsBest > 0 && (
                          <View style={[s.metaBadge, { backgroundColor: C.iconBg }]}>
                            <Text style={[s.metaBadgeText, { color: C.sub }]}>+{deltas[index].minutesVsBest} min</Text>
                          </View>
                        )}
                        {deltas[index]?.fareVsBest != null && deltas[index].fareVsBest! > 0 && (
                          <View style={[s.metaBadge, { backgroundColor: C.iconBg }]}>
                            <Text style={[s.metaBadgeText, { color: C.sub }]}>+KES {deltas[index].fareVsBest}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={s.routeCard2Right}>
                      {fare?.found ? (
                        <>
                          <Text style={[s.routeCard2FareAmt, { color: C.text }]}>
                            {fare.confidence === "zone" ? "~" : ""}{fare.currency} {fare.total}
                          </Text>
                          <Text style={[s.routeCard2Mins, { color: C.sub }]}>{durationMins} min</Text>
                        </>
                      ) : (
                        <Text style={[s.routeCard2FareAmt, { color: C.text }]}>{durationMins} min</Text>
                      )}
                    </View>

                    <Ionicons name="chevron-forward" size={15} color={C.sub} />
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerContainer: {
    paddingBottom:     16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex:            10,
  },
  headerRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom:   16,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  backBtn:     { marginLeft: -8 },

  // Route card (from/to inputs)
  routeCard: {
    flexDirection:    "row",
    alignItems:       "center",
    marginHorizontal: 16,
    borderRadius:     14,
    paddingVertical:  4,
    paddingRight:     8,
  },
  timeline: {
    width:          40,
    alignItems:     "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  dotFrom:  { width: 8, height: 8, borderRadius: 4 },
  line:     { width: 2, height: 24, marginVertical: 4 },
  squareTo: { width: 8, height: 8 },

  inputStack:   { flex: 1 },
  inputWrapper: { flexDirection: "row", alignItems: "center" },
  input:        { flex: 1, height: 44, fontSize: 16 },
  clearBtn:     { padding: 8 },
  divider:      { height: 1 },
  swapBtn:      { padding: 8, marginLeft: 4 },

  // List
  listContent: { paddingBottom: 120, paddingTop: 4 },

  sectionTitle: {
    fontSize:      12,
    fontWeight:    "700",
    marginTop:     16,
    marginBottom:  6,
    marginHorizontal: 16,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  loadingRow: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingVertical:  14,
    paddingHorizontal: 16,
    gap:              10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  loadingText: { fontSize: 13 },

  // Rows
  row: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal: 16,
    paddingVertical:  12,
    gap:              12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  rowBody:   { flex: 1 },
  rowTitle:  { fontSize: 15, fontWeight: "500" },
  rowSub:    { fontSize: 12, marginTop: 2 },

  routeBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      5,
    borderWidth:       StyleSheet.hairlineWidth,
  },
  routeBadgeText: { fontSize: 11, fontWeight: "700" },

  saveIconBtn: {
    width:          32,
    height:         32,
    borderRadius:   16,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },

  // Bottom sheet
  bottomSheet: {
    position:            "absolute",
    left:                0,
    right:               0,
    bottom:              0,
    height:              SCREEN_HEIGHT * 0.62,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.12,
    shadowRadius:         16,
    elevation:            24,
  },
  sheetHandle: {
    width:      40,
    height:     5,
    borderRadius: 3,
    alignSelf:  "center",
    marginTop:  12,
    marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle:    { fontSize: 20, fontWeight: "700" },
  sheetSubtitle: { fontSize: 13, marginTop: 3 },

  sheetEmpty: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap:            12,
  },
  sheetEmptyIcon:  { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  sheetEmptyTitle: { fontSize: 17, fontWeight: "600" },
  sheetEmptySub:   { fontSize: 14, textAlign: "center" },

  routeCard2: {
    borderRadius: 14,
    borderWidth:   1,
    padding:      14,
  },
  routeCard2Row: {
    flexDirection: "row" as const,
    alignItems:    "center",
    gap:            12,
  },
  routeCard2Body: {
    flex: 1,
    gap:   6,
  },
  routeCard2Title: {
    fontSize:      16,
    fontWeight:    "700" as const,
    letterSpacing: -0.2,
  },
  routeCard2Right: {
    alignItems: "flex-end" as const,
    gap:         2,
  },
  routeCard2FareAmt: {
    fontSize:      17,
    fontWeight:    "700" as const,
    letterSpacing: -0.3,
  },
  routeCard2Mins: {
    fontSize:   12,
    fontWeight: "500" as const,
  },
  routeMeta:    { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
  metaBadge:    { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  metaBadgeText: { fontSize: 11, fontWeight: "600" as const },
});
