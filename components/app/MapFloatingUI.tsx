// components/app/MapFloatingUI.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MapLayersIcon,
  PlaceCategoryIcon,
  ReportIcon,
  type PlaceCategoryKey,
  type PoiCategory,
} from "@/components/icons/NavigoIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { Step } from "@/utils/mapHelpers";
import { mToNice } from "@/utils/mapHelpers";
import type { ApproachPhase, EngineStatus } from "@/services/navigationEngine";
import {
  useExploreSearchStore,
  type SearchTabFilter,
} from "@/store/exploreSearchStore";
import { distanceM, runCategorySearch } from "@/services/exploreSearch";
import WeatherMeteoSheet, {
  fetchLiveMeteo,
  type LiveWeatherData,
} from "./WeatherMeteoSheet";
import {
  fadeWhenSheetAbove,
  floatAboveSheet,
  setTopUiBottom,
  useSheetAccessoryHeight,
  useSheetTop,
} from "./mapSheetInsets";

const ORANGE = "#FF6F00";
const WINDOW_H = Dimensions.get("window").height;

// Geometry shared by the layout maths below and the stylesheet.
const FAB = 44;
const STACK_GAP = 10;
const STACK_STEP = FAB + STACK_GAP;
const SHEET_GAP = 12;
const BOARD_CHIP_H = 40;
/** Clearance above the floating tab bar when no sheet is open. */
const TAB_BAR_CLEARANCE = 74;
/** Nairobi CBD, used until the first GPS fix. */
const FALLBACK_LAT = -1.2864;
const FALLBACK_LNG = 36.8172;

/** Quick-search chips. Icons come from PlaceCategoryIcon, keyed by `key`. */
/** Category chips; `poi` is the POI category they search (config/pois.php). */
export const QUICK_CATEGORIES: readonly {
  key: PlaceCategoryKey;
  poi: PoiCategory;
  label: string;
  color: string;
}[] = [
  { key: "restaurant", poi: "food",     label: "Restaurant",  color: "#EA580C" },
  { key: "cafe",       poi: "cafe",     label: "Cafe",        color: "#B45309" },
  { key: "gas",        poi: "fuel",     label: "Gas Station", color: "#2563EB" },
  { key: "hospital",   poi: "health",   label: "Hospital",    color: "#DC2626" },
  { key: "parking",    poi: "parking",  label: "Parking",     color: "#0284C7" },
  { key: "store",      poi: "grocery",  label: "Groceries",   color: "#7C3AED" },
  { key: "pharmacy",   poi: "pharmacy", label: "Pharmacy",    color: "#16A34A" },
  { key: "atm",        poi: "bank",     label: "ATM / Bank",  color: "#0D9488" },
];

/** Camera moved this far from the last category search: offer "Search this area". */
const SEARCH_AREA_MOVE_M = 500;

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
  userLat?: number | null;
  userLng?: number | null;
  /** Centre of the map camera: weather describes the area being looked at. */
  areaLat?: number | null;
  areaLng?: number | null;
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
  userLat,
  userLng,
  areaLat,
  areaLng,
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
    places: searchPlaces,
    routes: searchRoutes,
    stops: searchStops,
    loading: searchLoading,
    poiCategory,
    searchCenter,
    selectedPlace,
    setLoading,
    clearSearch,
  } = useExploreSearchStore();

  // Weather for the area on screen (camera centre), falling back to the
  // user's position. Snapped to ~5 km cells: panning within a neighbourhood
  // doesn't refetch, and fetchLiveMeteo caches each cell for 10 minutes.
  const meteoLat = Math.round((areaLat ?? userLat ?? FALLBACK_LAT) * 20) / 20;
  const meteoLng = Math.round((areaLng ?? userLng ?? FALLBACK_LNG) * 20) / 20;
  useEffect(() => {
    let alive = true;
    fetchLiveMeteo(meteoLat, meteoLng)
      .then((m) => {
        if (alive) setLiveMeteo(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [meteoLat, meteoLng]);

  // ─── Layout: everything is derived from two measured edges ───
  //   topEdge  – bottom of the top bar (search + chips, or the nav banner)
  //   sheetTop – top of whichever bottom sheet is open, tracked live
  const sheetTop = useSheetTop();
  const [screenH, setScreenH] = useState(WINDOW_H);
  const [topBarBottom, setTopBarBottom] = useState(0);
  const [leftWidgetH, setLeftWidgetH] = useState(62);

  const hasTopBar = !activeJourney || navigating;
  const topEdge = !hasTopBar
    ? insets.top + 4
    : topBarBottom || insets.top + 118;

  useEffect(() => {
    setTopUiBottom(topEdge);
  }, [topEdge]);

  const showCompass = Math.abs(cameraHeading) > 2 || navigating;
  const stackTop = topEdge + STACK_GAP;
  const restBottom = Math.max(insets.bottom, 12) + TAB_BAR_CLEARANCE;

  // A card riding on the sheet (intermediate-stop info) reserves its height;
  // bottom controls follow this "lifted" edge so they sit above the card, and
  // glide back down when it closes (the reserved height is animated too).
  const accessoryH = useSheetAccessoryHeight();
  const liftedTop = useMemo(
    () => Animated.subtract(sheetTop, accessoryH),
    [sheetTop, accessoryH]
  );

  // Recenter is the control people reach for most, so it gets priority: it
  // may rise into the right stack's column, and stack buttons give way
  // (bottom-most first) once it needs their space.
  const stackYieldY = (i: number) =>
    stackTop + i * STACK_STEP + FAB + STACK_GAP + FAB + SHEET_GAP;

  const anim = useMemo(() => {
    const restTop = (h: number) => screenH - restBottom - h;
    const ride = (height: number, rest: number) =>
      floatAboveSheet(liftedTop, {
        height,
        restTop: rest,
        minTop: stackTop,
        gap: SHEET_GAP,
      });
    return {
      // The top bar fades when the sheet itself reaches it.
      topBar: fadeWhenSheetAbove(sheetTop, topEdge - 24),
      stack: [0, 1, 2, 3].map((i) =>
        fadeWhenSheetAbove(liftedTop, stackYieldY(i))
      ),
      recenter: ride(FAB, restTop(FAB)),
      left: ride(leftWidgetH, restTop(leftWidgetH)),
      board: ride(BOARD_CHIP_H, restTop(BOARD_CHIP_H) - 6),
    };
    // stackYieldY only depends on stackTop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetTop, liftedTop, screenH, restBottom, topEdge, stackTop, leftWidgetH]);

  // Faded controls must not keep catching taps. Opacity runs on the native
  // driver; these listeners only flip state when a threshold is crossed.
  // The last positions survive re-subscription (a sheet handoff or a taller
  // nav banner), so state is re-evaluated against where things really are.
  const [topCovered, setTopCovered] = useState(false);
  const [stackVisible, setStackVisible] = useState(4);
  const lastSheetY = useRef(Number.POSITIVE_INFINITY);
  const lastLiftedY = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const applyTop = (y: number) => {
      lastSheetY.current = y;
      setTopCovered(y < topEdge - 30);
    };
    const applyStack = (y: number) => {
      lastLiftedY.current = y;
      let visible = 0;
      while (visible < 4 && y >= stackYieldY(visible) - 6) visible++;
      setStackVisible(visible);
    };
    applyTop(lastSheetY.current);
    applyStack(lastLiftedY.current);
    const a = sheetTop.addListener(({ value }) => applyTop(value));
    const b = liftedTop.addListener(({ value }) => applyStack(value));
    return () => {
      sheetTop.removeListener(a);
      liftedTop.removeListener(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetTop, liftedTop, topEdge, stackTop]);

  // Category chips: our POIs of that category nearest the area being looked
  // at (camera centre), falling back to the user. List + pins on the map.
  const handleCategoryPress = (cat: (typeof QUICK_CATEGORIES)[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    runCategorySearch(cat.poi, cat.label, {
      lat: areaLat ?? userLat,
      lng: areaLng ?? userLng,
    }).catch(() => setLoading(false));
  };

  // "Search this area" once the camera has moved away from the last search.
  const activeCategory = QUICK_CATEGORIES.find((c) => c.poi === poiCategory) ?? null;
  const showSearchArea =
    !!activeCategory &&
    !selectedPlace &&
    !searchLoading &&
    searchCenter != null &&
    areaLat != null &&
    areaLng != null &&
    distanceM(searchCenter.lat, searchCenter.lng, areaLat, areaLng) > SEARCH_AREA_MOVE_M;

  const cardBg = dark ? "rgba(24, 24, 27, 0.96)" : "rgba(255, 255, 255, 0.97)";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "rgba(63, 63, 70, 0.7)" : "rgba(229, 231, 235, 0.9)";

  // Right-side stack, top to bottom. Built as a list so each button knows its
  // slot and can yield individually when a sheet rises.
  const stackButtons: { key: string; node: React.ReactNode }[] = [
    {
      key: "report",
      node: (
        <PressableScale
          onPress={() => {
            Haptics.selectionAsync();
            onOpenReport();
          }}
          style={[
            styles.circleFab,
            { backgroundColor: cardBg, borderColor: borderCol },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Report transit issue"
        >
          <ReportIcon color={textPrimary} />
        </PressableScale>
      ),
    },
    {
      key: "layers",
      node: (
        <PressableScale
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenLayers();
          }}
          style={[
            styles.circleFab,
            { backgroundColor: cardBg, borderColor: borderCol },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Map layers"
        >
          <MapLayersIcon color={textPrimary} />
        </PressableScale>
      ),
    },
  ];
  if (showCompass) {
    stackButtons.push({
      key: "compass",
      node: (
        <PressableScale
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
        </PressableScale>
      ),
    });
  }
  if (showAR) {
    stackButtons.push({
      key: "ar",
      node: (
        <PressableScale
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
        </PressableScale>
      ),
    });
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => setScreenH(Math.round(e.nativeEvent.layout.height))}
    >
      {/* "Search this area": re-run the category search at the camera centre. */}
      {showSearchArea && !activeJourney && !topCovered && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.searchAreaWrap, { top: topEdge + 10, opacity: anim.topBar }]}
        >
          <PressableScale
            onPress={() => activeCategory && handleCategoryPress(activeCategory)}
            style={[styles.searchAreaPill, { backgroundColor: cardBg, borderColor: borderCol }]}
            accessibilityRole="button"
            accessibilityLabel={`Search ${activeCategory?.label ?? ""} in this area`}
          >
            <Ionicons name="refresh" size={15} color={ORANGE} />
            <Text style={[styles.searchAreaText, { color: textPrimary }]}>Search this area</Text>
          </PressableScale>
        </Animated.View>
      )}

      {/* ─── 1. TOP BAR (fades out when a sheet is dragged over it) ─── */}
      {hasTopBar && (
      <Animated.View
        pointerEvents={topCovered ? "none" : "box-none"}
        style={{ opacity: anim.topBar }}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setTopBarBottom(Math.round(y + height));
        }}
      >
      {!activeJourney ? (
        searchContextActive ? (
          /* Search results header: back, the query (tap to edit, X clears), tabs with counts */
          <View
            pointerEvents="box-none"
            style={[
              styles.activeSearchHeader,
              { paddingTop: insets.top + 8, backgroundColor: cardBg },
            ]}
          >
            <View style={styles.activeSearchRow}>
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync();
                  onOpenSearch();
                }}
                hitSlop={8}
                style={[styles.headerCircle, { backgroundColor: dark ? "#27272A" : "#F4F4F5" }]}
                accessibilityRole="button"
                accessibilityLabel="Back to search"
              >
                <Ionicons name="chevron-back" size={20} color={textPrimary} />
              </PressableScale>

              <PressableScale
                containerStyle={{ flex: 1 }}
                pressedScale={0.98}
                onPress={onOpenSearch}
                style={[styles.activeSearchField, { backgroundColor: dark ? "#27272A" : "#F4F4F5" }]}
                accessibilityRole="search"
                accessibilityLabel={`Search: ${searchContextQuery}. Tap to edit`}
              >
                <Ionicons name="search" size={17} color={ORANGE} />
                <Text
                  style={[styles.activeSearchQueryText, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {searchContextQuery}
                </Text>
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync();
                    clearSearch();
                  }}
                  hitSlop={10}
                  style={[styles.clearBtn, { backgroundColor: dark ? "#3F3F46" : "#E4E4E7" }]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close" size={14} color={textPrimary} />
                </PressableScale>
              </PressableScale>
            </View>

            {activeCategory ? (
              /* Category search: switch category in place (tabs would be empty). */
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.contextTabsRow}
              >
                {QUICK_CATEGORIES.map((cat) => {
                  const isSel = cat.poi === activeCategory.poi;
                  return (
                    <PressableScale
                      key={cat.key}
                      onPress={() => !isSel && handleCategoryPress(cat)}
                      style={[
                        styles.contextTab,
                        { backgroundColor: isSel ? cat.color : dark ? "#27272A" : "#F4F4F5" },
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isSel }}
                      accessibilityLabel={isSel ? `${cat.label}, ${searchPlaces.length} results` : cat.label}
                    >
                      <PlaceCategoryIcon category={cat.key} size={14} color={isSel ? "#FFFFFF" : cat.color} />
                      <Text style={[styles.contextTabLabel, { color: isSel ? "#FFFFFF" : textMuted }]}>
                        {cat.label}
                      </Text>
                      {isSel && !searchLoading && (
                        <Text style={[styles.contextTabCount, { color: "#FFFFFF" }]}>
                          {searchPlaces.length}
                        </Text>
                      )}
                    </PressableScale>
                  );
                })}
              </ScrollView>
            ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.contextTabsRow}
            >
              {(
                [
                  { id: "all", label: "All", count: searchPlaces.length + searchRoutes.length + searchStops.length },
                  { id: "place", label: "Places", count: searchPlaces.length },
                  { id: "bus", label: "Lines", count: searchRoutes.length },
                  { id: "stop", label: "Stops", count: searchStops.length },
                ] as const
              ).map((tab) => {
                const isSel = searchContextTab === tab.id;
                const empty = !searchLoading && tab.count === 0 && tab.id !== "all";
                return (
                  <PressableScale
                    key={tab.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSearchContextTab(tab.id as SearchTabFilter);
                    }}
                    style={[
                      styles.contextTab,
                      { backgroundColor: isSel ? textPrimary : dark ? "#27272A" : "#F4F4F5" },
                      empty && !isSel && { opacity: 0.5 },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${tab.label}, ${tab.count} results`}
                  >
                    <Text style={[styles.contextTabLabel, { color: isSel ? cardBg : textMuted }]}>
                      {tab.label}
                    </Text>
                    {!searchLoading && (
                      <Text style={[styles.contextTabCount, { color: isSel ? cardBg : textMuted }]}>
                        {tab.count}
                      </Text>
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
            )}
          </View>
        ) : (
          /* Default Explore Map Top Search + Square [↱ Route] Button + Category Badges[cite: 9] */
          <View
            pointerEvents="box-none"
            style={[styles.topContainer, { paddingTop: insets.top + 8 }]}
          >
            <View style={styles.topSearchRow}>
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync();
                  onOpenSearch();
                }}
                containerStyle={{ flex: 1 }}
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
                <PressableScale
                  hitSlop={10}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onOpenKwame();
                  }}
                  style={styles.kwameMicBtn}
                >
                  <Ionicons name="sparkles" size={16} color={ORANGE} />
                </PressableScale>
              </PressableScale>

              {/* Dedicated [↱ Route] Button -> Opens `app/route.tsx`[cite: 9] */}
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/route" as any);
                }}
                style={styles.routeSquareBtn}
              >
                <MaterialCommunityIcons
                  name="directions-fork"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.routeSquareText}>Route</Text>
              </PressableScale>
            </View>

            {/* KakaoMap Category Badges Under Search Bar (Restaurant, Cafe, Gas Station, Hospital, Parking...)[cite: 9] */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {QUICK_CATEGORIES.map((cat) => (
                <PressableScale
                  key={cat.key}
                  onPress={() => handleCategoryPress(cat)}
                  style={[
                    styles.modeChip,
                    { backgroundColor: cardBg, borderColor: borderCol },
                  ]}
                >
                  <PlaceCategoryIcon
                    category={cat.key}
                    size={16}
                    color={cat.color}
                  />
                  <Text style={[styles.modeChipText, { color: textPrimary }]}>
                    {cat.label}
                  </Text>
                </PressableScale>
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
              <PressableScale
                onPress={onClearJourney}
                hitSlop={10}
                style={styles.navCloseBtn}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </PressableScale>
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
                  <PressableScale onPress={onResume} style={styles.resumePill}>
                    <Text style={styles.resumePillText}>Resume</Text>
                  </PressableScale>
                )}
              </View>
            )}
          </View>
        </View>
      ) : null}
      </Animated.View>
      )}

      {/* ─── 2. RIGHT-SIDE STACK: anchored under the measured top bar.
           Buttons yield bottom-first when a sheet (and Recenter riding on
           it) needs the space. ─── */}
      <View
        pointerEvents="box-none"
        style={[styles.rightStack, { top: stackTop }]}
      >
        {stackButtons.map((b, i) => (
          <Animated.View
            key={b.key}
            pointerEvents={i < stackVisible ? "box-none" : "none"}
            style={{ opacity: anim.stack[i] }}
          >
            {b.node}
          </Animated.View>
        ))}
      </View>

      {/* ─── 3. BOTTOM-LEFT: Meteo & PM10 pill, or speedometer while
           navigating. Rides on top of the open sheet. ─── */}
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0) setLeftWidgetH(h);
        }}
        style={[
          styles.bottomLeftAnchor,
          {
            opacity: anim.left.opacity,
            transform: [{ translateY: anim.left.translateY }],
          },
        ]}
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
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setWeatherOpen(true);
            }}
            style={[
              styles.weatherPill,
              { backgroundColor: cardBg, borderColor: borderCol },
            ]}
          >
            <Ionicons
              name={liveMeteo?.iconName ?? "partly-sunny"}
              size={18}
              color="#F59E0B"
            />
            <Text style={[styles.weatherTemp, { color: textPrimary }]}>
              {liveMeteo ? `${liveMeteo.tempC}°` : "--"}
            </Text>
            <View
              style={[
                styles.aqiBadge,
                { backgroundColor: liveMeteo?.aqiBg ?? (dark ? "#3F3F46" : "#E5E7EB") },
              ]}
            >
              <Text
                style={[
                  styles.aqiText,
                  { color: liveMeteo?.aqiColor ?? textMuted },
                ]}
              >
                PM10
              </Text>
            </View>
          </PressableScale>
        ) : null}
      </Animated.View>

      {/* ─── 4. BOTTOM-CENTER: "I'm On Board" Quick Trigger ─── */}
      {(canBoardTransit || waitingForBus) && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.boardChipWrap,
            {
              opacity: anim.board.opacity,
              transform: [{ translateY: anim.board.translateY }],
            },
          ]}
        >
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onBoardTransit();
            }}
            style={styles.boardChip}
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.boardChipText}>I&apos;m on board</Text>
          </PressableScale>
        </Animated.View>
      )}

      {/* ─── 5. BOTTOM-RIGHT: Recenter. Always reachable: follows the sheet
           up and takes over the right stack's column if it has to. ─── */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.bottomRightAnchor,
          {
            opacity: anim.recenter.opacity,
            transform: [{ translateY: anim.recenter.translateY }],
          },
        ]}
      >
        <PressableScale
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
        </PressableScale>
      </Animated.View>

      {/* Interactive Meteo & Air Quality Modal Sheet */}
      <WeatherMeteoSheet
        visible={weatherOpen}
        onClose={() => setWeatherOpen(false)}
        userLat={areaLat ?? userLat}
        userLng={areaLng ?? userLng}
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
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  activeSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  searchAreaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  searchAreaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchAreaText: { fontSize: 13, fontWeight: "700" },
  activeSearchField: {
    height: 44,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeSearchQueryText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  contextTabsRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  contextTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  contextTabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  contextTabCount: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.8,
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
    gap: STACK_GAP,
  },
  circleFab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  // The three bottom anchors sit at top: 0 and are placed by translateY, so
  // they can follow the open sheet on the native driver.
  bottomLeftAnchor: {
    position: "absolute",
    top: 0,
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
    top: 0,
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
    height: BOARD_CHIP_H,
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
    top: 0,
    right: 14,
  },
});