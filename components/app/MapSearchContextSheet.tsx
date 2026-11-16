// components/app/MapSearchContextSheet.tsx
//
// Search results over the map (KakaoMap-style), on MapSheet:
//   - results sheet: drag down to its lowest snap for the map view, up for the
//     list; "Best match" / "Nearest" sorting; sections in "All"
//   - place sheet: details of the selected place with From / To
// Only real data is shown: ratings / open-now only when Google returns them,
// distances computed from the user's position.
import React, { useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  useExploreSearchStore,
  type ExplorePlaceItem,
} from "@/store/exploreSearchStore";
import { useSavedStore } from "@/store/savedStore";
import type { MobilitySearchRouteItem } from "@/services/stop";
import type { Stop } from "@/utils/mapHelpers";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { StopTypeGlyph } from "@/components/icons/NavigoIcons";
import { PressableScale } from "@/components/ui/PressableScale";
import { resolveStopCategory } from "./StopsLayer";
import { MapSheet, type MapSheetHandle } from "./MapSheet";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";
const GREEN = "#16A34A";
const RED = "#DC2626";
const { height: SH } = Dimensions.get("window");

type Props = {
  onSelectStopOnMap: (stop: Stop) => void;
  onFocusCoords: (lat: number, lng: number) => void;
  onSelectCorridorRoute?: (routeId: string) => void;
  userLat?: number | null;
  userLng?: number | null;
};

function mapboxStaticPhoto(lng: number, lat: number, zoom = 16): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+FF6F00(${lng},${lat})/${lng},${lat},${zoom},0,35/400x240@2x?access_token=${token}`;
}

function palette(dark: boolean) {
  return {
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    chip: dark ? "#27272A" : "#F1F5F9",
    line: dark ? "#27272A" : "#EEF0F3",
    skeleton: dark ? "#27272A" : "#EEF0F3",
    seg: dark ? "#27272A" : "#F1F5F9",
    segOn: dark ? "#3F3F46" : "#FFFFFF",
  };
}

export default function MapSearchContextSheet(props: Props) {
  const { active, selectedPlace } = useExploreSearchStore();
  if (!active) return null;
  return selectedPlace ? (
    <PlaceSheet key={selectedPlace.id} place={selectedPlace} {...props} />
  ) : (
    <ResultsSheet {...props} />
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

type Row =
  | { kind: "header"; key: string; title: string; count: number }
  | { kind: "place"; key: string; item: ExplorePlaceItem }
  | { kind: "route"; key: string; item: MobilitySearchRouteItem }
  | { kind: "stop"; key: string; item: Stop & Record<string, any> };

function ResultsSheet({
  onSelectStopOnMap,
  onFocusCoords,
  onSelectCorridorRoute,
  userLat,
  userLng,
}: Props) {
  const dark = useColorScheme() === "dark";
  const C = palette(dark);
  const router = useRouter();
  const sheet = useRef<MapSheetHandle>(null);
  const {
    query,
    activeTab,
    sortBy,
    places,
    stops,
    routes,
    loading,
    setSortBy,
    setMinimizedToMap,
    selectPlace,
    clearSearch,
  } = useExploreSearchStore();
  const { addPlace } = useSavedStore();

  const hasUser = userLat != null && userLng != null;
  const distOf = (lat: number, lng: number, known?: number | null) =>
    known ?? (hasUser ? distanceM(userLat!, userLng!, lat, lng) : undefined);

  const rows = useMemo<Row[]>(() => {
    const nearest = sortBy === "location" && hasUser;
    const sortByDist = <T,>(arr: T[], d: (x: T) => number | undefined) =>
      nearest ? [...arr].sort((a, b) => (d(a) ?? Infinity) - (d(b) ?? Infinity)) : arr;

    const placeRows = sortByDist(places, (p) => distOf(p.lat, p.lng, p.distanceM));
    const stopRows = sortByDist(stops as any[], (s) => distOf(s.lat, s.lng, s.distance_m));

    const out: Row[] = [];
    const section = (title: string, items: Row[]) => {
      if (!items.length) return;
      if (activeTab === "all") out.push({ kind: "header", key: `h-${title}`, title, count: items.length });
      out.push(...items);
    };
    if (activeTab === "all" || activeTab === "place")
      section("Places", placeRows.map((p) => ({ kind: "place" as const, key: `pl-${p.id}`, item: p })));
    if (activeTab === "all" || activeTab === "bus")
      section("Lines", routes.map((r) => ({ kind: "route" as const, key: `rt-${r.route_id}`, item: r })));
    if (activeTab === "all" || activeTab === "stop")
      section("Stops", stopRows.map((s) => ({ kind: "stop" as const, key: `st-${s.id}`, item: s })));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sortBy, places, stops, routes, userLat, userLng]);

  const count = rows.filter((r) => r.kind !== "header").length;

  const goToRoute = (role: "from" | "to", t: { name: string; lat: number; lng: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params =
      role === "from"
        ? { fLat: String(t.lat), fLng: String(t.lng), fName: t.name }
        : { tLat: String(t.lat), tLng: String(t.lng), tName: t.name };
    router.push({ pathname: "/route" as any, params });
  };

  const header = (
    <View style={s.resHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[s.resTitle, { color: C.text }]} numberOfLines={1}>
          {loading ? "Searching…" : count === 0 ? "No results" : `${count} result${count === 1 ? "" : "s"}`}
        </Text>
        <Text style={[s.resSub, { color: C.sub }]} numberOfLines={1}>
          for “{query}”
        </Text>
      </View>
      <View style={[s.segment, { backgroundColor: C.seg }]}>
        {(
          [
            { key: "map", label: "Best match" },
            { key: "location", label: "Nearest" },
          ] as const
        ).map((o) => {
          const on = sortBy === o.key;
          const disabled = o.key === "location" && !hasUser;
          return (
            <PressableScale
              key={o.key}
              disabled={disabled}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy(o.key);
              }}
              style={[s.segBtn, on && { backgroundColor: C.segOn }, disabled && { opacity: 0.4 }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
            >
              <Text style={[s.segText, { color: on ? C.text : C.sub }]}>{o.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );

  return (
    <MapSheet
      ref={sheet}
      snapPoints={[150, SH * 0.5, SH * 0.88]}
      initialSnap={1}
      onSnapChange={(i) => setMinimizedToMap(i === 0)}
      onClose={clearSearch}
      header={header}
    >
      {loading ? (
        <SkeletonRows color={C.skeleton} />
      ) : count === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyDisc, { backgroundColor: C.chip }]}>
            <Ionicons name="search-outline" size={26} color={C.sub} />
          </View>
          <Text style={[s.emptyTitle, { color: C.text }]}>Nothing found for “{query}”</Text>
          <Text style={[s.emptySub, { color: C.sub }]}>
            Check the spelling, try a broader word (“pharmacy”, “Westlands”), or switch tabs above.
          </Text>
        </View>
      ) : (
        rows.map((row) => {
          if (row.kind === "header") {
            return (
              <Text key={row.key} style={[s.section, { color: C.sub }]}>
                {row.title.toUpperCase()} · {row.count}
              </Text>
            );
          }

          if (row.kind === "place") {
            const pl = row.item;
            const dist = formatDistance(distOf(pl.lat, pl.lng, pl.distanceM));
            return (
              <PressableScale
                key={row.key}
                pressedScale={0.98}
                onPress={() => {
                  Haptics.selectionAsync();
                  onFocusCoords(pl.lat, pl.lng);
                  selectPlace(pl);
                }}
                style={[s.row, { borderBottomColor: C.line }]}
                accessibilityRole="button"
                accessibilityLabel={pl.name}
              >
                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                  <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
                    {pl.name}
                  </Text>
                  <PlaceFacts place={pl} sub={C.sub} />
                  <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
                    {[dist, pl.address].filter(Boolean).join(" · ")}
                  </Text>
                  <View style={[s.actions, { marginTop: 6 }]}>
                    <RoundAction icon="bookmark-outline" label="Save" bg={C.chip} onPress={() =>
                      addPlace({
                        name: pl.name, lat: pl.lat, lng: pl.lng, type: "location", place_id: pl.id,
                        pin: null, list: "favorites", category: pl.category, note: null,
                      }).catch(() => {})} />
                    <RoundAction icon="share-outline" label="Share" bg={C.chip} onPress={() =>
                      Share.share({ message: `${pl.name} · ${pl.address}` }).catch(() => {})} />
                    <RoundAction icon="navigate" label="Directions" bg={BLUE} fg="#FFFFFF"
                      onPress={() => goToRoute("to", pl)} />
                  </View>
                </View>
                <Image
                  source={{ uri: pl.photos?.[0] ?? mapboxStaticPhoto(pl.lng, pl.lat, 15) }}
                  style={[s.thumb, { backgroundColor: C.chip }]}
                  contentFit="cover"
                  transition={180}
                />
              </PressableScale>
            );
          }

          if (row.kind === "route") {
            const rt = row.item;
            return (
              <PressableScale
                key={row.key}
                pressedScale={0.98}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelectCorridorRoute?.(rt.route_id);
                }}
                style={[s.row, { borderBottomColor: C.line }]}
                accessibilityRole="button"
                accessibilityLabel={`Line ${rt.route_short_name}`}
              >
                <View style={[s.modeTag, { backgroundColor: rt.route_color || ORANGE }]}>
                  <Text style={s.modeTagText}>{rt.mode_badge}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
                    Line {rt.route_short_name}
                  </Text>
                  <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
                    {[rt.route_long_name, rt.agency_name].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.sub} />
              </PressableScale>
            );
          }

          const st = row.item;
          const meta = resolveStopCategory(st as any);
          const dist = formatDistance(distOf(st.lat, st.lng, st.distance_m));
          return (
            <PressableScale
              key={row.key}
              pressedScale={0.98}
              onPress={() => {
                Haptics.selectionAsync();
                clearSearch();
                onSelectStopOnMap(st);
              }}
              style={[s.row, { borderBottomColor: C.line }]}
              accessibilityRole="button"
              accessibilityLabel={st.name}
            >
              <View style={[s.stopBadge, { backgroundColor: meta.color }]}>
                <StopTypeGlyph category={meta.category} size={17} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
                  {st.name}
                </Text>
                <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
                  {[dist, st.stop_code, st.direction_label, st.route_nams].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <RoundAction icon="navigate" label="Directions" bg={C.chip} fg={BLUE}
                onPress={() => goToRoute("to", st)} />
            </PressableScale>
          );
        })
      )}
    </MapSheet>
  );
}

// ─── Selected place ──────────────────────────────────────────────────────────

function PlaceSheet({ place, onFocusCoords, userLat, userLng }: Props & { place: ExplorePlaceItem }) {
  const dark = useColorScheme() === "dark";
  const C = palette(dark);
  const router = useRouter();
  const sheet = useRef<MapSheetHandle>(null);
  const { selectPlace } = useExploreSearchStore();
  const { places: saved, addPlace } = useSavedStore();
  const isSaved = saved.some((p) => p.place_id === place.id);

  const dist = formatDistance(
    place.distanceM ??
      (userLat != null && userLng != null ? distanceM(userLat, userLng, place.lat, place.lng) : undefined)
  );
  const photos = place.photos?.length ? place.photos : [mapboxStaticPhoto(place.lng, place.lat)];

  const go = (role: "from" | "to") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params =
      role === "from"
        ? { fLat: String(place.lat), fLng: String(place.lng), fName: place.name }
        : { tLat: String(place.lat), tLng: String(place.lng), tName: place.name };
    router.push({ pathname: "/route" as any, params });
  };

  const header = (
    <View style={s.placeHeader}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.placeTitle, { color: C.text }]} numberOfLines={2}>
          {place.name}
        </Text>
        <PlaceFacts place={place} sub={C.sub} showCategory />
        <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>
          {[dist, place.address].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <PressableScale
        onPress={() => sheet.current?.close()}
        hitSlop={12}
        style={[s.roundBtn, { backgroundColor: C.chip }]}
        accessibilityRole="button"
        accessibilityLabel="Back to results"
      >
        <Ionicons name="close" size={16} color={C.sub} />
      </PressableScale>
    </View>
  );

  const footer = (
    <View style={s.footerRow}>
      <PressableScale containerStyle={{ flex: 1 }} onPress={() => go("from")} style={[s.bigBtn, { backgroundColor: C.chip }]}>
        <Text style={[s.bigBtnText, { color: C.text }]}>From here</Text>
      </PressableScale>
      <PressableScale containerStyle={{ flex: 1.4 }} onPress={() => go("to")} style={[s.bigBtn, { backgroundColor: ORANGE }]}>
        <Ionicons name="navigate" size={16} color="#FFFFFF" />
        <Text style={[s.bigBtnText, { color: "#FFFFFF" }]}>Directions</Text>
      </PressableScale>
    </View>
  );

  return (
    <MapSheet
      ref={sheet}
      snapPoints={[330, SH * 0.66]}
      onClose={() => selectPlace(null)}
      header={header}
      footer={footer}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
        {photos.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={[s.photo, { backgroundColor: C.chip }]}
            contentFit="cover"
            transition={200}
          />
        ))}
      </ScrollView>

      <View style={[s.actions, s.placeActions]}>
        <RoundAction
          icon={isSaved ? "bookmark" : "bookmark-outline"}
          label={isSaved ? "Saved" : "Save"}
          bg={C.chip}
          fg={isSaved ? ORANGE : C.text}
          withLabel
          onPress={() => {
            if (isSaved) return;
            Haptics.selectionAsync();
            addPlace({
              name: place.name, lat: place.lat, lng: place.lng, type: "location", place_id: place.id,
              pin: null, list: "favorites", category: place.category, note: null,
            }).catch(() => {});
          }}
        />
        <RoundAction
          icon="share-outline"
          label="Share"
          bg={C.chip}
          fg={C.text}
          withLabel
          onPress={() =>
            Share.share({
              message: `${place.name} (${place.address})\nhttps://navigo.co.ke/route?tLat=${place.lat}&tLng=${place.lng}&tName=${encodeURIComponent(place.name)}`,
            }).catch(() => {})
          }
        />
        <RoundAction
          icon="locate-outline"
          label="Show on map"
          bg={C.chip}
          fg={C.text}
          withLabel
          onPress={() => {
            onFocusCoords(place.lat, place.lng);
            sheet.current?.snapTo(0);
          }}
        />
      </View>
    </MapSheet>
  );
}

// ─── Small parts ─────────────────────────────────────────────────────────────

/** Category, rating and open status, each only when we actually know it. */
function PlaceFacts({ place, sub, showCategory }: { place: ExplorePlaceItem; sub: string; showCategory?: boolean }) {
  const bits: React.ReactNode[] = [];
  if (showCategory && place.category) {
    bits.push(<Text key="c" style={[s.fact, { color: sub }]}>{place.category}</Text>);
  }
  if (place.rating != null) {
    bits.push(
      <View key="r" style={s.ratingWrap}>
        <Ionicons name="star" size={12} color="#F59E0B" />
        <Text style={[s.fact, { color: sub }]}>
          <Text style={s.ratingNum}>{place.rating.toFixed(1)}</Text>
          {place.reviewCount != null ? ` (${place.reviewCount.toLocaleString()})` : ""}
        </Text>
      </View>
    );
  }
  if (place.openNow != null) {
    bits.push(
      <Text key="o" style={[s.fact, { color: place.openNow ? GREEN : RED, fontWeight: "700" }]}>
        {place.openNow ? "Open now" : "Closed"}
      </Text>
    );
  }
  if (!bits.length) return null;
  return (
    <View style={s.factsRow}>
      {bits.map((b, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text style={[s.fact, { color: sub }]}>·</Text>}
          {b}
        </React.Fragment>
      ))}
    </View>
  );
}

function RoundAction({
  icon, label, bg, fg = BLUE, withLabel, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bg: string;
  fg?: string;
  withLabel?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={s.roundActionWrap}>
      <View style={[s.roundAction, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={fg} />
      </View>
      {withLabel && <Text style={[s.roundActionLabel, { color: fg === "#FFFFFF" ? BLUE : fg }]}>{label}</Text>}
    </PressableScale>
  );
}

/** Pulsing placeholders while results load (smoother than a spinner). */
function SkeletonRows({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ opacity: pulse }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelLine, { width: "62%", backgroundColor: color }]} />
            <View style={[s.skelLine, { width: "40%", backgroundColor: color }]} />
            <View style={[s.skelLine, { width: "78%", backgroundColor: color }]} />
          </View>
          <View style={[s.thumb, { backgroundColor: color }]} />
        </View>
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  resHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  resTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  resSub: { fontSize: 12.5, marginTop: 1 },
  segment: { flexDirection: "row", padding: 3, borderRadius: 12, gap: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  segText: { fontSize: 12, fontWeight: "700" },

  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 15.5, fontWeight: "700" },
  rowSub: { fontSize: 12.5 },
  thumb: { width: 76, height: 76, borderRadius: 14 },
  factsRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  fact: { fontSize: 12.5 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingNum: { fontWeight: "800" },

  modeTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, minWidth: 38, alignItems: "center" },
  modeTagText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },
  stopBadge: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
  },

  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  roundActionWrap: { alignItems: "center", gap: 4 },
  roundAction: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roundActionLabel: { fontSize: 11.5, fontWeight: "700" },

  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 24, gap: 8 },
  emptyDisc: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 13, lineHeight: 19, textAlign: "center" },

  skelRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  skelLine: { height: 11, borderRadius: 6 },

  placeHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  placeTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  photoStrip: { paddingHorizontal: 18, gap: 10 },
  photo: { width: 200, height: 128, borderRadius: 14 },
  placeActions: { justifyContent: "space-around", paddingHorizontal: 18, paddingTop: 16 },

  footerRow: { flexDirection: "row", gap: 10 },
  bigBtn: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  bigBtnText: { fontSize: 15, fontWeight: "800" },
});
