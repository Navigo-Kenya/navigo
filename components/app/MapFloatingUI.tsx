// components/app/MapFloatingUI.tsx
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { Step } from "@/utils/mapHelpers";
import { mToNice } from "@/utils/mapHelpers";
import type { ApproachPhase, EngineStatus } from "@/services/navigationEngine";
import {
  useExploreSearchStore,
  type SearchTabFilter,
} from "@/store/exploreSearchStore";
import { MapService } from "@/services/map";
import { StopService } from "@/services/stop";
import WeatherMeteoSheet, {
  fetchLiveMeteo,
  type LiveWeatherData,
} from "./WeatherMeteoSheet";

const ORANGE = "#FF6F00";

export const QUICK_CATEGORIES = [
  { key: "restaurant", label: "Restaurant", icon: "restaurant", color: "#EA580C" },
  { key: "cafe",       label: "Cafe",       icon: "cafe",       color: "#B45309" },
  { key: "gas",        label: "Gas Station",icon: "car",        color: "#2563EB" },
  { key: "hospital",   label: "Hospital",   icon: "medkit",     color: "#DC2626" },
  { key: "parking",    label: "Parking",    icon: "pricetag",   color: "#0284C7" },
  { key: "store",      label: "24h Store",  icon: "storefront", color: "#7C3AED" },
  { key: "pharmacy",   label: "Pharmacy",   icon: "bandage",    color: "#16A34A" },
  { key: "atm",        label: "ATM / Bank", icon: "card",       color: "#0D9488" },
] as const;

/**
 * Custom Original Navigo Map Layer Icon:
 * Isometric 3-deck diamond stack blending Navigo Orange (#FF6F00) with a warm highlight plate.
 */
function NavigoOriginalLayersIcon({ dark }: { dark: boolean }) {
  return (
    <View style={styles.customLayerIconWrap}>
      {/* Bottom Deck (Muted Slate/Amber) */}
      <View
        style={[
          styles.layerDiamond,
          {
            top: 15,
            backgroundColor: dark ? "#3F3F46" : "#FED7AA",
            borderColor: ORANGE,
          },
        ]}
      />
      {/* Middle Deck (Warm Orange) */}
      <View
        style={[
          styles.layerDiamond,
          {
            top: 10,
            backgroundColor: "#FB923C",
            borderColor: "#FFFFFF",
          },
        ]}
      />
      {/* Top Primary Deck (Signature #FF6F00 Orange) */}
      <View
        style={[
          styles.layerDiamond,
          {
            top: 5,
            backgroundColor: ORANGE,
            borderColor: "#FFFFFF",
          },
        ]}
      />
    </View>
  );
}

export interface MapFloatingUIProps {
  onRecenter: () => void;
  onOpenSearch: () => void;
  onOpenReport: () => void;
  onOpenLayers: () => void;
  onOpenKwame: () => void;
  navigating: boolean;
  followMe: boolean;
  waitingForBus: boolean;
  onToggleNav: () => void;
  nextPreview: string | null;
  nextStep?: Step;
  showNavSub?: boolean;
  eta: Date | null;
  remainingDistanceM: number | null;
  distanceToNextStepM: number | null;
  navStatus: EngineStatus | null;
  stopsRemaining: number | null;
  arrivalSoonShown: boolean;
  gpsLost: boolean;
  wrongDirection: boolean;
  currentSpeedKph?: number;
  activeJourney: any;
  onClearJourney: () => void;
  nextNextPreview: string | null;
  approachPhase: ApproachPhase;
  cameraHeading: number;
  onResetNorth: () => void;
  headingUp: boolean;
  stepEta: Date | null;
  walkInstruction: string | null;
  walkDestination: string | null;
  canBoardTransit: boolean;
  onBoardTransit: () => void;
  isIndoor: boolean;
  paused: boolean;
  onResume: () => void;
  showAR: boolean;
  onOpenAR: () => void;
  bottomOffset?: number;
  userLat?: number | null;
  userLng?: number | null;
}

export default function MapFloatingUI({
  onRecenter,
  onOpenSearch,
  onOpenReport,
  onOpenLayers,
  onOpenKwame,
  navigating,
  followMe,
  waitingForBus,
  nextPreview,
  nextStep,
  distanceToNextStepM,
  navStatus,
  stopsRemaining,
  gpsLost,
  wrongDirection,
  currentSpeedKph,
  activeJourney,
  onClearJourney,
  nextNextPreview,
  cameraHeading,
  onResetNorth,
  headingUp,
  walkInstruction,
  walkDestination,
  canBoardTransit,
  onBoardTransit,
  isIndoor,
  paused,
  onResume,
  showAR,
  onOpenAR,
  bottomOffset = 0,
  userLat,
  userLng,
}: MapFloatingUIProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";

  const [weatherOpen, setWeatherOpen] = useState(false);
  const [liveMeteo, setLiveMeteo] = useState<LiveWeatherData | null>(null);

  const {
    active: searchContextActive,
    query: searchContextQuery,
    activeTab: searchContextTab,
    setActiveTab: setSearchContextTab,
    startSearch,
    setResults,
    setLoading,
    clearSearch,
  } = useExploreSearchStore();

  useEffect(() => {
    fetchLiveMeteo(userLat ?? -1.2864, userLng ?? 36.8172)
      .then(setLiveMeteo)
      .catch(() => {});
  }, [userLat, userLng]);

  const handleCategoryPress = async (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startSearch({ query: label, activeTab: "all" });
    setLoading(true);

    try {
      const [preds, mobility] = await Promise.all([
        MapService.placesAutocomplete(
          label,
          userLat ?? -1.2864,
          userLng ?? 36.8172
        ),
        StopService.searchMobility(
          label,
          userLat ?? -1.2864,
          userLng ?? 36.8172
        ),
      ]);

      const resolvedPlaces = await Promise.all(
        preds.slice(0, 4).map(async (p) => {
          const det = await MapService.getPlaceDetails(p.place_id);
          if (!det) return null;
          return {
            id: p.place_id,
            name: p.main_text,
            address: p.secondary_text || p.description,
            category: label,
            lat: det.lat,
            lng: det.lng,
            rating: 4.3,
            reviewCount: 19,
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

  const cardBg = dark ? "rgba(24, 24, 27, 0.96)" : "rgba(255, 255, 255, 0.97)";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "rgba(63, 63, 70, 0.7)" : "rgba(229, 231, 235, 0.9)";

  const effectiveBottom =
    bottomOffset > 0
      ? bottomOffset + Math.max(insets.bottom, 12)
      : searchContextActive
      ? 310 + Math.max(insets.bottom, 12)
      : Math.max(insets.bottom, 12) + 74;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ─── 1. TOP BAR ─── */}
      {!activeJourney ? (
        searchContextActive ? (
          /* KakaoMap Active Search Context Header on Map (< query X + Place | Bus | Bus Stop tabs)[cite: 5, 12] */
          <View
            pointerEvents="box-none"
            style={[
              styles.activeSearchHeader,
              { paddingTop: insets.top + 8, backgroundColor: cardBg },
            ]}
          >
            <View
              style={[
                styles.activeSearchBox,
                { borderColor: borderCol, backgroundColor: dark ? "#27272A" : "#F9FAFB" },
              ]}
            >
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onOpenSearch();
                }}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={22} color={textPrimary} />
              </Pressable>
              <Pressable
                onPress={onOpenSearch}
                style={{ flex: 1, paddingHorizontal: 8 }}
              >
                <Text
                  style={[styles.activeSearchQueryText, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {searchContextQuery}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  clearSearch();
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={textPrimary} />
              </Pressable>
            </View>

            {/* Place | Bus | Bus Stop Sub-Tabs[cite: 5] */}
            <View style={styles.contextTabsRow}>
              {(
                [
                  { id: "all", label: "All", icon: "apps" },
                  { id: "place", label: "Place", icon: "location" },
                  { id: "bus", label: "Bus / Rail", icon: "bus" },
                  { id: "stop", label: "Bus Stop", icon: "radio-button-on" },
                ] as const
              ).map((t) => {
                const isSel = searchContextTab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSearchContextTab(t.id as SearchTabFilter);
                    }}
                    style={[
                      styles.contextTabItem,
                      isSel && styles.contextTabItemActive,
                    ]}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={14}
                      color={isSel ? "#2563EB" : textMuted}
                    />
                    <Text
                      style={[
                        styles.contextTabLabel,
                        { color: isSel ? "#2563EB" : textMuted },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          /* Default Explore Map Top Search + Square [↱ Route] Button + Category Badges[cite: 9] */
          <View
            pointerEvents="box-none"
            style={[styles.topContainer, { paddingTop: insets.top + 8 }]}
          >
            <View style={styles.topSearchRow}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onOpenSearch();
                }}
                style={[
                  styles.searchBarPill,
                  { backgroundColor: cardBg, borderColor: borderCol },
                ]}
              >
                <Ionicons name="search" size={20} color={ORANGE} />
                <Text
                  style={[styles.searchPlaceholder, { color: textMuted }]}
                  numberOfLines={1}
                >
                  Search places, buses, stations…
                </Text>
                <Pressable
                  hitSlop={10}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onOpenKwame();
                  }}
                  style={styles.kwameMicBtn}
                >
                  <Ionicons name="sparkles" size={16} color={ORANGE} />
                </Pressable>
              </Pressable>

              {/* Dedicated [↱ Route] Button -> Opens `app/route.tsx`[cite: 9] */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/route" as any);
                }}
                style={({ pressed }) => [
                  styles.routeSquareBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                ]}
              >
                <MaterialCommunityIcons
                  name="directions-fork"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.routeSquareText}>Route</Text>
              </Pressable>
            </View>

            {/* KakaoMap Category Badges Under Search Bar (Restaurant, Cafe, Gas Station, Hospital, Parking...)[cite: 9] */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {QUICK_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => handleCategoryPress(cat.label)}
                  style={[
                    styles.modeChip,
                    { backgroundColor: cardBg, borderColor: borderCol },
                  ]}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={cat.color}
                  />
                  <Text style={[styles.modeChipText, { color: textPrimary }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )
      ) : navigating ? (
        /* Active Turn-by-Turn Navigation Top Guidance Banner */
        <View
          pointerEvents="box-none"
          style={[styles.topContainer, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.navBanner}>
            <View style={styles.navBannerMain}>
              <View style={styles.navIconBox}>
                <Ionicons
                  name={
                    nextStep?.type === "walk"
                      ? "walk"
                      : nextStep?.type === "arrive"
                      ? "location"
                      : "train"
                  }
                  size={24}
                  color="#FFFFFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navPrimaryText} numberOfLines={2}>
                  {walkInstruction ?? nextPreview ?? "Follow highlighted route"}
                </Text>
                <View style={styles.navMetaRow}>
                  {distanceToNextStepM != null && (
                    <Text style={styles.navSubText}>
                      In {mToNice(distanceToNextStepM)}
                    </Text>
                  )}
                  {stopsRemaining != null && stopsRemaining > 0 && (
                    <Text style={styles.navSubBadge}>
                      {stopsRemaining} stop{stopsRemaining === 1 ? "" : "s"} left
                    </Text>
                  )}
                  {walkDestination && (
                    <Text style={styles.navSubText} numberOfLines={1}>
                      · To {walkDestination}
                    </Text>
                  )}
                </View>
              </View>
              <Pressable
                onPress={onClearJourney}
                hitSlop={10}
                style={styles.navCloseBtn}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {nextNextPreview && (
              <View style={styles.navThenStrip}>
                <Text style={styles.navThenText} numberOfLines={1}>
                  Then: {nextNextPreview}
                </Text>
              </View>
            )}

            {(wrongDirection ||
              gpsLost ||
              navStatus === "rerouting" ||
              isIndoor ||
              paused) && (
              <View style={styles.statusAlertStrip}>
                <Ionicons name="alert-circle" size={16} color="#FEF08A" />
                <Text style={styles.statusAlertText}>
                  {paused
                    ? "Navigation paused"
                    : wrongDirection
                    ? "Wrong direction — turn around"
                    : navStatus === "rerouting"
                    ? "Recalculating best route…"
                    : gpsLost
                    ? "Weak GPS signal — dead-reckoning"
                    : "Indoor signal — head outside for lock"}
                </Text>
                {paused && (
                  <Pressable onPress={onResume} style={styles.resumePill}>
                    <Text style={styles.resumePillText}>Resume</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* ─── 2. RIGHT-SIDE FLOATING STACK (Report + Original Orange Map Layers + Compass)[cite: 9] ─── */}
      <View
        pointerEvents="box-none"
        style={[
          styles.rightStack,
          { top: insets.top + (activeJourney ? 135 : 118) },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onOpenReport();
          }}
          style={[
            styles.circleFab,
            { backgroundColor: cardBg, borderColor: borderCol },
          ]}
          accessibilityLabel="Report transit issue"
        >
          <Ionicons name="megaphone-outline" size={20} color={textPrimary} />
        </Pressable>

        {/* Original Navigo Orange Isometric Layer Button */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenLayers();
          }}
          style={[
            styles.circleFab,
            {
              backgroundColor: cardBg,
              borderColor: "rgba(255, 111, 0, 0.45)",
            },
          ]}
          accessibilityLabel="Map layers"
        >
          <NavigoOriginalLayersIcon dark={dark} />
        </Pressable>

        {(Math.abs(cameraHeading) > 2 || navigating) && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onResetNorth();
            }}
            style={[
              styles.circleFab,
              { backgroundColor: cardBg, borderColor: borderCol },
            ]}
            accessibilityLabel="Compass / Toggle 3D heading"
          >
            <Ionicons
              name={headingUp ? "navigate" : "compass-outline"}
              size={20}
              color={headingUp ? ORANGE : textPrimary}
            />
          </Pressable>
        )}

        {showAR && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onOpenAR();
            }}
            style={[
              styles.circleFab,
              { backgroundColor: ORANGE, borderColor: ORANGE },
            ]}
            accessibilityLabel="Open AR Walk View"
          >
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      {/* ─── 3. BOTTOM-LEFT: Interactive Meteo & PM10 Pill OR Speedometer[cite: 1, 9] ─── */}
      <View
        pointerEvents="box-none"
        style={[styles.bottomLeftAnchor, { bottom: effectiveBottom }]}
      >
        {navigating && currentSpeedKph !== undefined ? (
          <View
            style={[
              styles.speedPill,
              { backgroundColor: cardBg, borderColor: borderCol },
            ]}
          >
            <Text style={[styles.speedVal, { color: textPrimary }]}>
              {currentSpeedKph}
            </Text>
            <Text style={[styles.speedUnit, { color: textMuted }]}>km/h</Text>
          </View>
        ) : !activeJourney ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setWeatherOpen(true);
            }}
            style={({ pressed }) => [
              styles.weatherPill,
              { backgroundColor: cardBg, borderColor: borderCol },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <Ionicons
              name={liveMeteo?.iconName ?? "partly-sunny"}
              size={18}
              color="#F59E0B"
            />
            <Text style={[styles.weatherTemp, { color: textPrimary }]}>
              {liveMeteo?.tempC ?? 23}°
            </Text>
            <View
              style={[
                styles.aqiBadge,
                { backgroundColor: liveMeteo?.aqiBg ?? "#DCFCE7" },
              ]}
            >
              <Text
                style={[
                  styles.aqiText,
                  { color: liveMeteo?.aqiColor ?? "#15803D" },
                ]}
              >
                PM10
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* ─── 4. BOTTOM-CENTER: "I'm On Board" Quick Trigger ─── */}
      {(canBoardTransit || waitingForBus) && (
        <View
          pointerEvents="box-none"
          style={[styles.boardChipWrap, { bottom: effectiveBottom + 6 }]}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onBoardTransit();
            }}
            style={styles.boardChip}
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.boardChipText}>I'm on board</Text>
          </Pressable>
        </View>
      )}

      {/* ─── 5. BOTTOM-RIGHT: Recenter Crosshair Button[cite: 1, 9] ─── */}
      <View
        pointerEvents="box-none"
        style={[styles.bottomRightAnchor, { bottom: effectiveBottom }]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onRecenter();
          }}
          style={[
            styles.circleFab,
            {
              backgroundColor: cardBg,
              borderColor: followMe ? ORANGE : borderCol,
            },
          ]}
          accessibilityLabel="Recenter on my location"
        >
          <Ionicons
            name={followMe ? "locate" : "locate-outline"}
            size={21}
            color={followMe ? ORANGE : textPrimary}
          />
        </Pressable>
      </View>

      {/* Interactive Meteo & Air Quality Modal Sheet */}
      <WeatherMeteoSheet
        visible={weatherOpen}
        onClose={() => setWeatherOpen(false)}
        userLat={userLat}
        userLng={userLng}
        onWeatherLoaded={setLiveMeteo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topContainer: {
    paddingHorizontal: 14,
    gap: 8,
  },
  topSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBarPill: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  kwameMicBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255, 111, 0, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  routeSquareBtn: {
    width: 52,
    height: 48,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ORANGE,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  routeSquareText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  chipsScroll: {
    gap: 7,
    paddingRight: 16,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  modeChipText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  activeSearchHeader: {
    paddingHorizontal: 14,
    paddingBottom: 2,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  activeSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  activeSearchQueryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  contextTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 6,
  },
  contextTabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  contextTabItemActive: {
    borderBottomColor: "#2563EB",
  },
  contextTabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  customLayerIconWrap: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  layerDiamond: {
    position: "absolute",
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    transform: [{ rotate: "45deg" }, { scaleY: 0.72 }],
  },
  navBanner: {
    backgroundColor: "#111827",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  navBannerMain: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  navIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  navPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  navMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  navSubText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
  },
  navSubBadge: {
    backgroundColor: "rgba(255, 111, 0, 0.25)",
    color: "#FDBA74",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  navCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  navThenStrip: {
    backgroundColor: "#1F2937",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  navThenText: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "500",
  },
  statusAlertStrip: {
    backgroundColor: "#991B1B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusAlertText: {
    color: "#FEF2F2",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  resumePill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resumePillText: {
    color: "#991B1B",
    fontSize: 11,
    fontWeight: "700",
  },
  rightStack: {
    position: "absolute",
    right: 14,
    gap: 10,
  },
  circleFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bottomLeftAnchor: {
    position: "absolute",
    left: 14,
  },
  weatherPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    alignItems: "center",
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  weatherTemp: {
    fontSize: 13,
    fontWeight: "800",
  },
  aqiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  aqiText: {
    fontSize: 9,
    fontWeight: "800",
  },
  speedPill: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
  },
  speedVal: {
    fontSize: 17,
    fontWeight: "800",
  },
  speedUnit: {
    fontSize: 9,
    fontWeight: "600",
  },
  boardChipWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  boardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#16A34A",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: "#16A34A",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  boardChipText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  bottomRightAnchor: {
    position: "absolute",
    right: 14,
  },
});