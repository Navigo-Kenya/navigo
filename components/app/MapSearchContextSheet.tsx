// components/app/MapSearchContextSheet.tsx
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  useExploreSearchStore,
  type ExplorePlaceItem,
} from "@/store/exploreSearchStore";
import { useSavedStore } from "@/store/savedStore";
import type { Stop } from "@/utils/mapHelpers";

const ORANGE = "#FF6F00";
const BLUE = "#2563EB";

function mapboxStaticPhoto(lng: number, lat: number, zoom = 16): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+FF6F00(${lng},${lat})/${lng},${lat},${zoom},0,35/400x240@2x?access_token=${token}`;
}

function mapboxSatellitePhoto(lng: number, lat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lng},${lat},17,0,45/400x240@2x?access_token=${token}`;
}

export default function MapSearchContextSheet({
  onSelectStopOnMap,
  onFocusCoords,
  onSelectCorridorRoute,
}: {
  onSelectStopOnMap: (stop: Stop) => void;
  onFocusCoords: (lat: number, lng: number) => void;
  onSelectCorridorRoute?: (routeId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";

  const {
    active,
    activeTab,
    sortBy,
    minimizedToMap,
    places,
    stops,
    routes,
    selectedPlace,
    loading,
    setSortBy,
    setMinimizedToMap,
    selectPlace,
    clearSearch,
  } = useExploreSearchStore();

  const { places: savedPlaces, addPlace } = useSavedStore();

  const combinedRows = useMemo(() => {
    const out: any[] = [];
    if (activeTab === "all" || activeTab === "place") {
      places.forEach((p) => out.push({ _kind: "place", item: p, key: `pl-${p.id}` }));
    }
    if (activeTab === "all" || activeTab === "bus") {
      routes.forEach((r) =>
        out.push({ _kind: "route", item: r, key: `rt-${r.route_id}` })
      );
    }
    if (activeTab === "all" || activeTab === "stop") {
      stops.forEach((st) =>
        out.push({ _kind: "stop", item: st, key: `st-${st.id}` })
      );
    }
    return out;
  }, [activeTab, places, routes, stops]);

  if (!active) return null;

  const sheetBg = dark ? "#18181B" : "#FFFFFF";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";
  const pillBg = dark ? "#27272A" : "#F3F4F6";

  const goToRoutePlanner = (
    role: "from" | "to",
    target: { id?: string; name: string; lat: number; lng: number }
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params =
      role === "from"
        ? {
            fLat: String(target.lat),
            fLng: String(target.lng),
            fName: target.name,
          }
        : {
            tLat: String(target.lat),
            tLng: String(target.lng),
            tName: target.name,
          };
    router.push({ pathname: "/route" as any, params });
  };

  // ── 1. SELECTED PLACE FLOATING CARD (Matches KakaoMap's IMT Motel Screen)[cite: 2] ──
  if (selectedPlace) {
    const isBookmarked = savedPlaces.some(
      (sp) => sp.place_id === selectedPlace.id
    );
    const distKm =
      selectedPlace.distanceM != null
        ? selectedPlace.distanceM >= 1000
          ? `${(selectedPlace.distanceM / 1000).toFixed(1)}km`
          : `${Math.round(selectedPlace.distanceM)}m`
        : "Nearby";

    const photos =
      selectedPlace.photos && selectedPlace.photos.length > 0
        ? selectedPlace.photos
        : [
            mapboxStaticPhoto(selectedPlace.lng, selectedPlace.lat),
            mapboxSatellitePhoto(selectedPlace.lng, selectedPlace.lat),
          ];

    return (
      <View
        style={[
          s.placeSheet,
          {
            backgroundColor: sheetBg,
            paddingBottom: Math.max(insets.bottom, 16) + 64,
          },
        ]}
      >
        <View style={s.handleWrap}>
          <View
            style={[
              s.handle,
              { backgroundColor: dark ? "#3F3F46" : "#D1D5DB" },
            ]}
          />
        </View>

        {/* Title + Category + Close */}
        <View style={s.placeHeader}>
          <View style={{ flex: 1 }}>
            <View style={s.placeTitleRow}>
              <Text
                style={[s.placeTitle, { color: textPrimary }]}
                numberOfLines={1}
              >
                {selectedPlace.name}
              </Text>
              <Text style={[s.placeCategory, { color: textMuted }]}>
                {selectedPlace.category}
              </Text>
            </View>

            {/* Rating Stars + Review Count[cite: 2] */}
            <View style={s.ratingRow}>
              <Text style={s.ratingScore}>
                {(selectedPlace.rating ?? 4.4).toFixed(1)}
              </Text>
              <View style={s.starsWrap}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={
                      n <= Math.round(selectedPlace.rating ?? 4.4)
                        ? "star"
                        : "star-outline"
                    }
                    size={13}
                    color="#EF4444"
                  />
                ))}
              </View>
              <Text style={[s.reviewCount, { color: textMuted }]}>
                ({selectedPlace.reviewCount ?? 24}) &gt;
              </Text>
            </View>

            {/* Distance + Address[cite: 2] */}
            <Text
              style={[s.placeAddress, { color: textMuted }]}
              numberOfLines={1}
            >
              {distKm} · {selectedPlace.address}
            </Text>
          </View>

          <Pressable
            onPress={() => selectPlace(null)}
            style={[s.closeBtn, { backgroundColor: pillBg }]}
          >
            <Ionicons name="close" size={18} color={textPrimary} />
          </Pressable>
        </View>

        {/* Horizontal Photo Strip[cite: 2] */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.photoStrip}
        >
          {photos.map((uri, idx) => (
            <Image
              key={idx}
              source={{ uri }}
              style={s.placePhoto}
              contentFit="cover"
            />
          ))}
        </ScrollView>

        {/* Bottom Action Row: Bookmark, Share, Call + [From] [To][cite: 2] */}
        <View style={s.placeFooter}>
          <View style={s.leftIconGroup}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                addPlace({
                  name: selectedPlace.name,
                  lat: selectedPlace.lat,
                  lng: selectedPlace.lng,
                  type: "location",
                  place_id: selectedPlace.id,
                  pin: null,
                  list: "favorites",
                  category: selectedPlace.category,
                  note: null,
                }).catch(() => {});
              }}
              style={[s.roundActionBtn, { backgroundColor: pillBg }]}
            >
              <Ionicons
                name={isBookmarked ? "bookmark" : "bookmark-outline"}
                size={18}
                color={isBookmarked ? ORANGE : BLUE}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                Share.share({
                  message: `${selectedPlace.name} (${selectedPlace.address})\nhttps://navigo.co.ke/route?tLat=${selectedPlace.lat}&tLng=${selectedPlace.lng}&tName=${encodeURIComponent(
                    selectedPlace.name
                  )}`,
                }).catch(() => {});
              }}
              style={[s.roundActionBtn, { backgroundColor: pillBg }]}
            >
              <Ionicons name="share-outline" size={18} color={BLUE} />
            </Pressable>
          </View>

          <View style={s.fromToGroup}>
            <Pressable
              onPress={() => goToRoutePlanner("from", selectedPlace)}
              style={s.fromBtn}
            >
              <Text style={s.fromToText}>From</Text>
            </Pressable>
            <Pressable
              onPress={() => goToRoutePlanner("to", selectedPlace)}
              style={s.toBtn}
            >
              <Text style={s.fromToText}>To</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── 2. MINIMIZED MAP-PINS MODE: Floating "[:= View List]" Pill + Bottom [Sort ⌄] Bar[cite: 12] ──
  if (minimizedToMap) {
    return (
      <>
        <View
          pointerEvents="box-none"
          style={[
            s.minimizedWrap,
            { bottom: Math.max(insets.bottom, 16) + 126 },
          ]}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setMinimizedToMap(false);
            }}
            style={[
              s.viewListFloatingPill,
              { backgroundColor: sheetBg, borderColor: borderCol },
            ]}
          >
            <Ionicons name="list" size={16} color={textPrimary} />
            <Text style={[s.viewListText, { color: textPrimary }]}>
              View List
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            s.minimizedBottomBar,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 12) + 64,
            },
          ]}
        >
          <View style={s.handleWrap}>
            <View
              style={[
                s.handle,
                { backgroundColor: dark ? "#3F3F46" : "#D1D5DB" },
              ]}
            />
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Pressable
              onPress={() =>
                setSortBy(sortBy === "location" ? "map" : "location")
              }
              style={[
                s.sortPill,
                {
                  borderColor: borderCol,
                  borderWidth: 1,
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                },
              ]}
            >
              <Text style={[s.sortPillText, { color: textPrimary }]}>
                Sort ⌄
              </Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  // ── 3. DRAGGABLE SEARCH RESULTS SHEET (KakaoMap IMG_6284.PNG)[cite: 5] ──
  return (
    <View
      style={[
        s.resultsSheet,
        {
          backgroundColor: sheetBg,
          paddingBottom: Math.max(insets.bottom, 16) + 64,
        },
      ]}
    >
      {/* Drag Handle — Tap to minimize into Map Pins view */}
      <Pressable
        onPress={() => setMinimizedToMap(true)}
        style={s.handleWrap}
      >
        <View
          style={[
            s.handle,
            { backgroundColor: dark ? "#3F3F46" : "#D1D5DB" },
          ]}
        />
      </Pressable>

      {/* Filter Bar: [Map] [My Location] on Left + "View Map Pins" on Right[cite: 5] */}
      <View style={[s.filterBar, { borderBottomColor: borderCol }]}>
        <View style={s.sortPillsRow}>
          <Pressable
            onPress={() => setSortBy("map")}
            style={[
              s.sortPill,
              sortBy === "map"
                ? [s.sortPillActive, { borderColor: textPrimary }]
                : { backgroundColor: pillBg },
            ]}
          >
            <Text
              style={[
                s.sortPillText,
                { color: sortBy === "map" ? textPrimary : textMuted },
              ]}
            >
              Map
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSortBy("location")}
            style={[
              s.sortPill,
              sortBy === "location"
                ? [s.sortPillActive, { borderColor: textPrimary }]
                : { backgroundColor: pillBg },
            ]}
          >
            <Text
              style={[
                s.sortPillText,
                { color: sortBy === "location" ? textPrimary : textMuted },
              ]}
            >
              My Location
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setMinimizedToMap(true)}
          style={s.hideListBtn}
        >
          <Ionicons name="map-outline" size={14} color={ORANGE} />
          <Text style={s.hideListText}>Map View</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="small" color={ORANGE} />
          <Text style={{ color: textMuted, fontSize: 13 }}>
            Searching nearby mobility results…
          </Text>
        </View>
      ) : combinedRows.length === 0 ? (
        <View style={s.loadingBox}>
          <Text style={{ color: textMuted, fontSize: 13 }}>
            No matching places, routes, or stops found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={combinedRows}
          keyExtractor={(item) => item.key}
          style={{ maxHeight: 280 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item._kind === "stop") {
              const st = item.item;
              const code =
                st.stop_code ?? st.id.slice(-5).toUpperCase();
              const distLabel =
                st.distance_m != null
                  ? st.distance_m >= 1000
                    ? `${(st.distance_m / 1000).toFixed(1)}km`
                    : `${st.distance_m}m`
                  : null;

              return (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    clearSearch();
                    onSelectStopOnMap(st);
                  }}
                  style={[s.resultRow, { borderBottomColor: borderCol }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text
                      style={[s.rowTitle, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      {st.name}
                    </Text>
                    <Text
                      style={[s.rowSub, { color: textMuted }]}
                      numberOfLines={1}
                    >
                      {code}
                      {st.direction_label ? ` · ${st.direction_label}` : ""}
                    </Text>
                    <View style={s.badgesWrap}>
                      {distLabel && (
                        <Text style={[s.distText, { color: textMuted }]}>
                          {distLabel}
                        </Text>
                      )}
                      <View
                        style={[
                          s.modeTag,
                          { backgroundColor: st.badge_color ?? BLUE },
                        ]}
                      >
                        <Text style={s.modeTagText}>
                          {st.mode_badge ?? "Bus"}
                        </Text>
                      </View>
                      {st.route_nams && (
                        <Text
                          style={[s.routesInline, { color: textMuted }]}
                          numberOfLines={1}
                        >
                          {st.route_nams}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={s.rowActions}>
                    <Pressable
                      onPress={() =>
                        addPlace({
                          name: st.name,
                          lat: st.lat,
                          lng: st.lng,
                          type: "stop",
                          place_id: st.id,
                          pin: null,
                          list: "favorites",
                          category: "Transit Stop",
                          note: null,
                        }).catch(() => {})
                      }
                      style={[s.rowActionCircle, { backgroundColor: pillBg }]}
                    >
                      <Ionicons
                        name="bookmark-outline"
                        size={16}
                        color={BLUE}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => goToRoutePlanner("to", st)}
                      style={[s.rowActionCircle, { backgroundColor: pillBg }]}
                    >
                      <Ionicons
                        name="return-up-forward"
                        size={16}
                        color={BLUE}
                      />
                    </Pressable>
                  </View>
                </Pressable>
              );
            }

            if (item._kind === "route") {
              const rt = item.item;
              return (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectCorridorRoute?.(rt.route_id);
                  }}
                  style={[s.resultRow, { borderBottomColor: borderCol }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={s.badgesWrap}>
                      <View
                        style={[
                          s.modeTag,
                          { backgroundColor: rt.route_color || ORANGE },
                        ]}
                      >
                        <Text style={s.modeTagText}>{rt.mode_badge}</Text>
                      </View>
                      <Text style={[s.rowTitle, { color: textPrimary }]}>
                        Line {rt.route_short_name}
                      </Text>
                    </View>
                    <Text
                      style={[s.rowSub, { color: textMuted }]}
                      numberOfLines={1}
                    >
                      {rt.route_long_name}
                      {rt.agency_name ? ` · ${rt.agency_name}` : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={textMuted}
                  />
                </Pressable>
              );
            }

            const pl = item.item as ExplorePlaceItem;
            const thumbUri =
              pl.photos?.[0] ?? mapboxStaticPhoto(pl.lng, pl.lat, 15);
            const distText =
              pl.distanceM != null
                ? pl.distanceM >= 1000
                  ? `${(pl.distanceM / 1000).toFixed(1)}km`
                  : `${Math.round(pl.distanceM)}m`
                : "Nearby";

            return (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onFocusCoords(pl.lat, pl.lng);
                  selectPlace(pl);
                }}
                style={[s.resultRow, { borderBottomColor: borderCol }]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={[s.rowTitle, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      {pl.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: textMuted }}>
                      {pl.category}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600" }}>
                    Open
                  </Text>

                  <Text
                    style={[s.rowSub, { color: textMuted }]}
                    numberOfLines={1}
                  >
                    {distText} · {pl.address}
                  </Text>

                  {/* 4 Circular Light-Blue Action Buttons: Bookmark, Share, Focus Pin, Route[cite: 15] */}
                  <View style={[s.rowActions, { marginTop: 8 }]}>
                    <Pressable
                      onPress={() =>
                        addPlace({
                          name: pl.name,
                          lat: pl.lat,
                          lng: pl.lng,
                          type: "location",
                          place_id: pl.id,
                          pin: null,
                          list: "favorites",
                          category: pl.category,
                          note: null,
                        }).catch(() => {})
                      }
                      style={[
                        s.rowActionCircle,
                        { backgroundColor: "rgba(37, 99, 235, 0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="bookmark-outline"
                        size={16}
                        color={BLUE}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        Share.share({
                          message: `${pl.name} — ${pl.address}`,
                        }).catch(() => {})
                      }
                      style={[
                        s.rowActionCircle,
                        { backgroundColor: "rgba(37, 99, 235, 0.1)" },
                      ]}
                    >
                      <Ionicons name="share-outline" size={16} color={BLUE} />
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        onFocusCoords(pl.lat, pl.lng);
                        setMinimizedToMap(true);
                      }}
                      style={[
                        s.rowActionCircle,
                        { backgroundColor: "rgba(37, 99, 235, 0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={BLUE}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => goToRoutePlanner("to", pl)}
                      style={[
                        s.rowActionCircle,
                        { backgroundColor: "rgba(37, 99, 235, 0.1)" },
                      ]}
                    >
                      <Ionicons
                        name="return-up-forward"
                        size={16}
                        color={BLUE}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Right Rounded Thumbnail[cite: 15] */}
                <Image
                  source={{ uri: thumbUri }}
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 12,
                    backgroundColor: pillBg,
                  }}
                  contentFit="cover"
                />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  resultsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 20,
    zIndex: 14,
  },
  placeSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -5 },
    elevation: 22,
    zIndex: 14,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  sortPillActive: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  sortPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  hideListBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hideListText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: "700",
  },
  loadingBox: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  rowSub: {
    fontSize: 12.5,
  },
  badgesWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  distText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeTagText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  routesInline: {
    fontSize: 12,
    flex: 1,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowActionCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  minimizedWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 14,
  },
  viewListFloatingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  viewListText: {
    fontSize: 13,
    fontWeight: "700",
  },
  placeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 12,
  },
  placeTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },
  placeTitle: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  placeCategory: {
    fontSize: 12,
    fontWeight: "500",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  ratingScore: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "800",
  },
  starsWrap: {
    flexDirection: "row",
    gap: 1,
  },
  reviewCount: {
    fontSize: 12,
  },
  placeAddress: {
    fontSize: 12.5,
    marginTop: 3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  photoStrip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 10,
  },
  placePhoto: {
    width: 170,
    height: 112,
    borderRadius: 12,
  },
  placeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  leftIconGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roundActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  fromToGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fromBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  toBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 20,
  },
  fromToText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  minimizedBottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 16,
    zIndex: 13,
  },
});