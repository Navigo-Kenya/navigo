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
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MapLayersIcon,
  PlaceCategoryIcon,
  ReportIcon,
  type PlaceCategoryKey,
  type PoiCategory,
} from "@/components/icons/NavigoIcons";
import type { RideCue } from "@/utils/landmarks";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { Step } from "@/utils/mapHelpers";
import { maneuverIcon, mToNice } from "@/utils/mapHelpers";
import type { NavHazard, NavToast, NavTurn, PhaseNotice } from "@/hooks/useNavigation";
import { NavBanner } from "./NavBanner";
import { usePrefsStore } from "@/store/prefsStore";
import type { NavPhase } from "@/services/legPhase";
import type { LegKind, Role } from "@/services/navProfile";
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
import { Icon } from "@/components/icons/Icon";

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

/**
 * Category chips under the search bar, in the results sheet and on the search
 * screen. `poi` is the POI category they search (api config/pois.php); icons
 * come from PlaceCategoryIcon, keyed by `key`. Everyday needs first.
 */
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
  // Colours from poiCategories.ts, so a chip matches its map pins.
  { key: "hotel",         poi: "lodging",       label: "Hotels",        color: "#0891B2" },
  { key: "mall",          poi: "mall",          label: "Malls",         color: "#7C3AED" },
  { key: "shopping",      poi: "shopping",      label: "Shopping",      color: "#A855F7" },
  { key: "attraction",    poi: "attraction",    label: "Attractions",   color: "#0D9488" },
  { key: "park",          poi: "park",          label: "Parks",         color: "#65A30D" },
  { key: "entertainment", poi: "entertainment", label: "Entertainment", color: "#DB2777" },
  { key: "nightlife",     poi: "nightlife",     label: "Nightlife",     color: "#9333EA" },
  { key: "sport",         poi: "sport",         label: "Sport & gyms",  color: "#CA8A04" },
  { key: "school",        poi: "education",     label: "Schools",       color: "#4F46E5" },
  { key: "worship",       poi: "worship",       label: "Worship",       color: "#64748B" },
  { key: "government",    poi: "government",    label: "Government",    color: "#475569" },
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
  /** Live ride feed: landmark being passed, the next one, and the alight cue. */
  rideCue?: RideCue | null;
  approachPhase: ApproachPhase;
  cameraHeading: number;
  onResetNorth: () => void;
  headingUp: boolean;
  stepEta: Date | null;
  /** Street legs: the next turn, along the road. */
  turn?: NavTurn | null;
  /** The leg being travelled, and whether the user controls the vehicle on it. */
  legKind?: LegKind | null;
  legRole?: Role | null;
  /** Car and boda legs: switch between driving and being a passenger. */
  onSwitchRole?: () => void;
  /** A passenger's car or boda is carrying them away from the destination. */
  headingAway?: boolean;
  destinationName?: string | null;
  /** Which part of the trip the user is in (services/legPhase). */
  phase?: NavPhase | null;
  /** The last automatic phase change, shown for a few seconds with Undo. */
  phaseNotice?: PhaseNotice | null;
  onUndoPhase?: () => void;
  /** A road report ahead, or just passed ("Still there?"). */
  hazard?: NavHazard | null;
  onHazardVote?: (id: string, stillThere: boolean) => void;
  /** A short note: "New route", "Thanks". */
  toast?: NavToast | null;
  /** Waiting at the stage: the line, the stop, the next departure. */
  waitInfo?: { line: string | null; stop: string | null; next: string | null; mode: string } | null;
  /** Waiting for a boda or taxi: where to, and the usual fare. */
  pickupInfo?: { destination: string | null; fare: string | null } | null;
  canAlight?: boolean;
  onAlight?: () => void;
  onStartRide?: () => void;
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
  rideCue,
  cameraHeading,
  onResetNorth,
  headingUp,
  turn,
  legKind,
  legRole,
  onSwitchRole,
  headingAway = false,
  destinationName,
  phase = null,
  phaseNotice = null,
  onUndoPhase,
  hazard = null,
  onHazardVote,
  toast = null,
  waitInfo = null,
  pickupInfo = null,
  canAlight = false,
  onAlight,
  onStartRide,
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

  // Waiting at the stage or for the ride, the card says so; the turns come once moving.
  const showTurn = turn && phase !== "wait" && phase !== "pickup" ? turn : null;
  const units = usePrefsStore((s) => s.prefs.units);

  // The phase notice ("On board the 45K · Undo") shows for 8 s.
  const [noticeShown, setNoticeShown] = useState(false);
  useEffect(() => {
    if (!phaseNotice) { setNoticeShown(false); return; }
    setNoticeShown(true);
    const id = setTimeout(() => setNoticeShown(false), 8000);
    return () => clearTimeout(id);
  }, [phaseNotice]);

  // One action at a time at the bottom: board, get off, or start the ride.
  const phaseAction = canAlight && onAlight
    ? { label: "I got off", icon: "log-out", onPress: onAlight }
    : canBoardTransit || waitingForBus
    ? { label: "I'm on board", icon: "checkmark-circle", onPress: onBoardTransit }
    : phase === "pickup" && onStartRide
    ? { label: legKind === "motorbike" ? "We're off" : "My ride has started", icon: "navigate", onPress: onStartRide }
    : null;
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
  // Results-sheet category row: keep the selected chip in view (a chip near
  // the end, picked from the bar under the search box, would start off-screen).
  const categoryTabsRef = useRef<ScrollView>(null);
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
          <Icon
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
          <Icon name="camera-outline" size={20} color="#FFFFFF" />
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
            <Icon name="refresh" size={15} color={ORANGE} />
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
                <Icon name="chevron-back" size={20} color={textPrimary} />
              </PressableScale>

              <PressableScale
                containerStyle={{ flex: 1 }}
                pressedScale={0.98}
                onPress={onOpenSearch}
                style={[styles.activeSearchField, { backgroundColor: dark ? "#27272A" : "#F4F4F5" }]}
                accessibilityRole="search"
                accessibilityLabel={`Search: ${searchContextQuery}. Tap to edit`}
              >
                <Icon name="search" size={17} color={ORANGE} />
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
                  <Icon name="close" size={14} color={textPrimary} />
                </PressableScale>
              </PressableScale>
            </View>

            {activeCategory ? (
              /* Category search: switch category in place (tabs would be empty). */
              <ScrollView
                ref={categoryTabsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.contextTabsRow}
              >
                {QUICK_CATEGORIES.map((cat) => {
                  const isSel = cat.poi === activeCategory.poi;
                  return (
                    <PressableScale
                      key={cat.key}
                      onLayout={
                        isSel
                          ? (e) =>
                              categoryTabsRef.current?.scrollTo({
                                x: Math.max(0, e.nativeEvent.layout.x - 24),
                                animated: true,
                              })
                          : undefined
                      }
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
                <Icon name="search" size={20} color={ORANGE} />
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
                  <Icon name="sparkles" size={16} color={ORANGE} />
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
        /* Navigation banner: turn-by-turn for whoever is in control, the
           rider card for a boda passenger, stops and alight cues on a ride. */
        <View
          pointerEvents="box-none"
          style={[styles.topContainer, { paddingTop: insets.top + 8 }]}
        >
          {legKind === "motorbike" && legRole === "passenger" && (phase === "pickup" ? pickupInfo : showTurn) ? (
            <View style={styles.riderCard}>
              <View style={styles.riderTop}>
                <Text style={styles.riderLabel}>SHOW THE RIDER</Text>
                <PressableScale onPress={onClearJourney} hitSlop={10} style={styles.riderCloseBtn}>
                  <Icon name="close" size={18} color="#111827" />
                </PressableScale>
              </View>
              {phase === "pickup" || !showTurn ? (
                // Before the ride: where to, big enough to show the rider, and the usual fare.
                <View style={styles.riderMain}>
                  <Icon name="location" size={52} color={ORANGE} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.riderWord} numberOfLines={2} adjustsFontSizeToFit>
                      {pickupInfo?.destination ?? destinationName ?? "Your destination"}
                    </Text>
                    {pickupInfo?.fare ? (
                      <Text style={styles.riderDetail} numberOfLines={1}>
                        {pickupInfo.fare}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.riderMain}>
                  <MaterialIcons name={maneuverIcon(showTurn.maneuver) as any} size={58} color={ORANGE} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.riderWord} numberOfLines={1} adjustsFontSizeToFit>
                      {showTurn.rider.word}
                    </Text>
                    {showTurn.rider.detail ? (
                      <Text style={styles.riderDetail} numberOfLines={2}>
                        {showTurn.rider.detail}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.riderDistance}>{turnDistanceLabel(showTurn.distanceM)}</Text>
                </View>
              )}
              {phase !== "pickup" && showTurn?.then ? (
                <Text style={styles.riderThen} numberOfLines={1}>
                  Then: {showTurn.then}
                </Text>
              ) : null}
              {onSwitchRole ? (
                <RoleStrip kind={legKind} role={legRole} onPress={onSwitchRole} light />
              ) : null}
              {(headingAway || navStatus === "rerouting" || gpsLost || paused) && (
                <View style={styles.statusAlertStrip}>
                  <Icon name="alert-circle" size={16} color="#FEF08A" />
                  <Text style={styles.statusAlertText}>
                    {paused
                      ? "Navigation paused"
                      : headingAway
                      ? `Heading away from ${destinationName ?? "your destination"}`
                      : navStatus === "rerouting"
                      ? "Following the rider's way…"
                      : "Weak GPS signal"}
                  </Text>
                  {paused && (
                    <PressableScale onPress={onResume} style={styles.resumePill}>
                      <Text style={styles.resumePillText}>Resume</Text>
                    </PressableScale>
                  )}
                </View>
              )}
            </View>
          ) : (
          <NavBanner
            turn={showTurn}
            legKind={legKind}
            legRole={legRole}
            phase={phase}
            stepMode={(nextStep as any)?.mode ?? null}
            waitInfo={waitInfo}
            pickupInfo={pickupInfo}
            nextPreview={nextPreview}
            nextNextPreview={phase !== "wait" && phase !== "pickup" ? nextNextPreview : null}
            distanceToNextStepM={distanceToNextStepM}
            stopsRemaining={stopsRemaining}
            walkDestination={walkDestination}
            destinationName={destinationName}
            rideCue={rideCue}
            wrongDirection={wrongDirection}
            headingAway={headingAway}
            gpsLost={gpsLost}
            rerouting={navStatus === "rerouting"}
            isIndoor={isIndoor}
            paused={paused}
            onResume={onResume}
            roleStrip={onSwitchRole ? <RoleStrip kind={legKind ?? null} role={legRole ?? null} onPress={onSwitchRole} /> : null}
            hazard={hazard}
            onHazardVote={onHazardVote}
            toast={toast}
            units={units}
          />
          )}
          {noticeShown && phaseNotice ? (
            <View style={styles.phaseNotice}>
              <Icon name="checkmark-circle" size={16} color="#FFFFFF" />
              <Text style={styles.phaseNoticeText} numberOfLines={1}>{phaseNotice.text}</Text>
              {phaseNotice.undoable && onUndoPhase ? (
                <PressableScale onPress={onUndoPhase} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.phaseUndo}>Undo</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
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
            <Icon
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
      {phaseAction && (
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
              phaseAction.onPress();
            }}
            style={styles.boardChip}
            accessibilityRole="button"
          >
            <Icon name={phaseAction.icon as any} size={18} color="#FFFFFF" />
            <Text style={styles.boardChipText}>{phaseAction.label}</Text>
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
          <Icon
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

/** "300 m", "1.2 km", or "Now" at the turn. */
function turnDistanceLabel(m: number): string {
  return m < 15 ? "Now" : mToNice(m);
}


const ROLE_TEXT: Record<"car" | "motorbike", Record<Role, { now: string; other: string; icon: string }>> = {
  car: {
    driver: { now: "You're driving", other: "I'm a passenger", icon: "car" },
    passenger: { now: "You're a passenger", other: "I'm driving", icon: "person" },
  },
  motorbike: {
    driver: { now: "You're riding", other: "I'm the passenger", icon: "motorbike" },
    passenger: { now: "You're the passenger", other: "I'm riding", icon: "person" },
  },
};

/** Car and boda legs: who's in control, switchable in one tap (remembered). */
function RoleStrip({ kind, role, onPress, light = false }: {
  kind: LegKind | null; role: Role | null; onPress: () => void; light?: boolean;
}) {
  if ((kind !== "car" && kind !== "motorbike") || !role) return null;
  const t = ROLE_TEXT[kind][role];
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.roleStrip, light && styles.roleStripLight]}
      accessibilityRole="button"
      accessibilityLabel={`${t.now}. Switch to: ${t.other}`}
    >
      <Icon name={t.icon as any} size={15} color={light ? "#374151" : "#D1D5DB"} />
      <Text style={[styles.roleText, light && styles.roleTextLight]} numberOfLines={1}>{t.now}</Text>
      <Text style={styles.roleSwitch} numberOfLines={1}>{t.other}</Text>
    </PressableScale>
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
  phaseNotice: {
    marginTop: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  phaseNoticeText: { flexShrink: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  phaseUndo: { color: ORANGE, fontSize: 13, fontWeight: "800" },
  roleStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#0B1220",
  },
  roleStripLight: { backgroundColor: "#F3F4F6" },
  roleText: { flex: 1, color: "#D1D5DB", fontSize: 12.5, fontWeight: "600" },
  roleTextLight: { color: "#374151" },
  roleSwitch: { color: ORANGE, fontSize: 12.5, fontWeight: "700" },
  // Boda passenger: a card to show the rider, readable in the sun at arm's length.
  riderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  riderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  riderLabel: { color: ORANGE, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  riderCloseBtn: { padding: 6, borderRadius: 16, backgroundColor: "#F3F4F6" },
  riderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  riderWord: { color: "#111827", fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  riderDetail: { color: "#374151", fontSize: 17, fontWeight: "600", marginTop: 2 },
  riderDistance: { color: "#111827", fontSize: 18, fontWeight: "800" },
  riderThen: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingBottom: 12,
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