// app/route.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import {
  MapView as MapboxMapView,
  Camera as MapboxCamera,
  ShapeSource,
  LineLayer,
  PointAnnotation,
} from "@rnmapbox/maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStopSearch } from "@/hooks/useStopSearch";
import { MapService, type PlacePrediction } from "@/services/map";
import { RouteService, type Route, type RouteSegment } from "@/services/route";
import { useSavedStore } from "@/store/savedStore";
import { usePrefsStore } from "@/store/prefsStore";
import { UnifiedLocation, useJourneyStore } from "@/store/journeyStore";
import { extractFares, formatDurationParts, getRouteColor } from "@/utils/mapHelpers";
import { rankRoutes, type RouteRanking } from "@/utils/rankRoutes";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;
const NativePointAnnotation =
  PointAnnotation as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";
const HEADER_BLUE = "#3B7BF6";
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = SCREEN_W - 44;

type TopPlannerMode = "transit" | "car" | "walk" | "bicycle";
type TransitSubTab = "all" | "bus" | "rail" | "mixed";
const TRANSIT_TABS: TransitSubTab[] = ["all", "bus", "rail", "mixed"];

const SORT_OPTIONS: { key: RouteRanking; label: string; desc: string }[] = [
  { key: "fastest", label: "Recommendation", desc: "Best balance of time & transfers" },
  { key: "least_walking", label: "Shortest Walk", desc: "Minimizes walking distance" },
  { key: "fewest_transfers", label: "Fewest Transfers", desc: "Direct lines prioritized" },
  { key: "cheapest", label: "Lowest Fare", desc: "Most affordable transit options" },
];

const WHEEL_ITEM_H = 40;

function WheelColumn<T extends string | number>({
  items,
  selectedIndex,
  onSelectIndex,
  width,
  textPrimary,
  textMuted,
}: {
  items: { label: string; value: T }[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  width: number;
  textPrimary: string;
  textMuted: string;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * WHEEL_ITEM_H,
        animated: false,
      });
    }, 50);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  return (
    <View style={{ width, height: WHEEL_ITEM_H * 5 }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * 2 }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.max(
            0,
            Math.min(
              items.length - 1,
              Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H)
            )
          );
          if (idx !== selectedIndex) {
            Haptics.selectionAsync();
            onSelectIndex(idx);
          }
        }}
      >
        {items.map((item, idx) => {
          const dist = Math.abs(idx - selectedIndex);
          const isSel = idx === selectedIndex;
          return (
            <Pressable
              key={`${item.label}-${idx}`}
              onPress={() => {
                Haptics.selectionAsync();
                onSelectIndex(idx);
                scrollRef.current?.scrollTo({
                  y: idx * WHEEL_ITEM_H,
                  animated: true,
                });
              }}
              style={{
                height: WHEEL_ITEM_H,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: isSel ? 17 : dist === 1 ? 15 : 13,
                  fontWeight: isSel ? "700" : "500",
                  color: isSel ? textPrimary : textMuted,
                  opacity: isSel ? 1 : dist === 1 ? 0.65 : 0.32,
                }}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DepartureTimeSheet({
  visible,
  onClose,
  onApply,
  dark,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (config: {
    label: string;
    date?: string;
    time?: string;
    arriveBy?: boolean;
  }) => void;
  dark: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [arriveBy, setArriveBy] = useState(false);

  // Build 14 days around Today
  const dayItems = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const label =
        i === 0
          ? "Today"
          : `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
      return { label, value: `${y}-${m}-${day}` };
    });
  }, []);

  const hourItems = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({
        label: String(h),
        value: h,
      })),
    []
  );

  const minItems = useMemo(
    () =>
      Array.from({ length: 60 }, (_, m) => ({
        label: String(m).padStart(2, "0"),
        value: m,
      })),
    []
  );

  const ampmItems = useMemo(
    () => [
      { label: "AM", value: "am" as const },
      { label: "PM", value: "pm" as const },
    ],
    []
  );

  const now = new Date();
  const [dayIdx, setDayIdx] = useState(0);
  const [hourIdx, setHourIdx] = useState(() => {
    const h = now.getHours() % 12;
    return (h === 0 ? 12 : h) - 1;
  });
  const [minIdx, setMinIdx] = useState(() => now.getMinutes());
  const [ampmIdx, setAmpmIdx] = useState(() => (now.getHours() >= 12 ? 1 : 0));

  if (!visible) return null;

  const sheetBg = dark ? "#18181B" : "#FFFFFF";
  const highlightBg = dark ? "#27272A" : "#F3F4F6";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";

  const handleLeaveNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onApply({ label: "Departs Now" });
    onClose();
  };

  const handleComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const chosenDay = dayItems[dayIdx] ?? dayItems[0];
    const chosenHr = hourItems[hourIdx]?.value ?? 12;
    const chosenMin = minItems[minIdx]?.value ?? 0;
    const chosenAmPm = ampmItems[ampmIdx]?.value ?? "am";

    const hrPad = String(chosenHr).padStart(2, "0");
    const minPad = String(chosenMin).padStart(2, "0");
    const dayPrefix = dayIdx === 0 ? "" : `${chosenDay.label} `;

    onApply({
      label: `${dayPrefix}${chosenHr}:${minPad} ${chosenAmPm.toUpperCase()} ${
        arriveBy ? "Arrive" : "Start"
      }`,
      date: chosenDay.value,
      time: `${hrPad}:${minPad}${chosenAmPm}`,
      arriveBy,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            s.timeSheet,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Top Handle */}
          <View style={s.sheetHandleWrap}>
            <View
              style={[
                s.sheetHandle,
                { backgroundColor: dark ? "#52525B" : "#CBD5E1" },
              ]}
            />
          </View>

          {/* Centered Title (Tap to toggle Set Departure Time vs Set Arrival Time) */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setArriveBy((v) => !v);
            }}
            style={{ alignItems: "center", paddingVertical: 8 }}
          >
            <Text style={[s.timeSheetTitle, { color: textPrimary }]}>
              {arriveBy ? "Set Arrival Time" : "Set Departure Time"}
            </Text>
          </Pressable>

          {/* Subtitle Row with Checkmark */}
          <View
            style={[
              s.subtitleCheckRow,
              { borderTopColor: borderCol, borderBottomColor: borderCol },
            ]}
          >
            <Text style={{ color: textMuted, fontSize: 13, flex: 1 }}>
              Based on intervals, wait times, and service status
            </Text>
            <Ionicons name="checkmark" size={18} color={HEADER_BLUE} />
          </View>

          {/* 4-Column KakaoMap Wheel Drum Picker */}
          <View style={s.wheelContainer}>
            {/* Center Selection Highlight Bar */}
            <View
              pointerEvents="none"
              style={[
                s.wheelSelectionBar,
                { backgroundColor: highlightBg },
              ]}
            />

            <WheelColumn
              items={dayItems}
              selectedIndex={dayIdx}
              onSelectIndex={setDayIdx}
              width={135}
              textPrimary={textPrimary}
              textMuted={textMuted}
            />
            <WheelColumn
              items={hourItems}
              selectedIndex={hourIdx}
              onSelectIndex={setHourIdx}
              width={54}
              textPrimary={textPrimary}
              textMuted={textMuted}
            />
            <WheelColumn
              items={minItems}
              selectedIndex={minIdx}
              onSelectIndex={setMinIdx}
              width={54}
              textPrimary={textPrimary}
              textMuted={textMuted}
            />
            <WheelColumn
              items={ampmItems}
              selectedIndex={ampmIdx}
              onSelectIndex={setAmpmIdx}
              width={56}
              textPrimary={textPrimary}
              textMuted={textMuted}
            />
          </View>

          {/* Bottom Two-Button Row: [Leave Now] + [Complete] */}
          <View style={s.wheelFooterRow}>
            <Pressable
              onPress={handleLeaveNow}
              style={[s.leaveNowBtn, { borderColor: borderCol }]}
            >
              <Text style={[s.leaveNowText, { color: textPrimary }]}>
                Leave Now
              </Text>
            </Pressable>

            <Pressable onPress={handleComplete} style={s.completeBtn}>
              <Text style={s.completeBtnText}>Complete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}


function ProportionalDurationBar({
  segments,
  totalDuration,
  dark,
}: {
  segments: RouteSegment[];
  totalDuration: number;
  dark: boolean;
}) {
  const safeTotal = Math.max(1, totalDuration);
  const walkBg = dark ? "#27272A" : "#E5E7EB";
  const walkText = dark ? "#D4D4D8" : "#4B5563";

  return (
    <View style={[s.propBarTrack, { backgroundColor: walkBg }]}>
      {segments.map((seg, idx) => {
        const mins = Math.max(1, Math.round(seg.duration / 60));
        const flexWeight = Math.max(0.12, seg.duration / safeTotal);

        if (seg.mode === "WALK") {
          return (
            <View key={idx} style={[s.propWalkSeg, { flex: flexWeight }]}>
              <Text style={[s.propWalkText, { color: walkText }]} numberOfLines={1}>
                {mins}m
              </Text>
            </View>
          );
        }

        const color =
          seg.route_color ||
          (seg.mode === "RAIL"
            ? "#16A34A"
            : seg.mode === "SUBWAY"
            ? "#7C3AED"
            : seg.mode === "BRT"
            ? "#DC2626"
            : getRouteColor(seg.route_name ?? "Bus"));

        const modeIcon =
          seg.mode === "RAIL" || seg.mode === "SUBWAY" || seg.mode === "TRAM"
            ? "train"
            : seg.mode === "BICYCLE"
            ? "bicycle"
            : seg.mode === "CAR"
            ? "car"
            : "bus";

        return (
          <View
            key={idx}
            style={[
              s.propTransitSeg,
              { flex: flexWeight, backgroundColor: color },
            ]}
          >
            <View style={s.propTransitIconCircle}>
              <Ionicons name={modeIcon as any} size={11} color={color} />
            </View>
            <Text style={s.propTransitText} numberOfLines={1}>
              {mins}m
            </Text>
          </View>
        );
      })}
    </View>
  );
}



export default function MultiModalRoutePlannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";

  const dlParams = useLocalSearchParams<{
    fLat?: string;
    fLng?: string;
    fName?: string;
    tLat?: string;
    tLng?: string;
    tName?: string;
  }>();

  const [topMode, setTopMode] = useState<TopPlannerMode>("transit");
  const [subTab, setSubTab] = useState<TransitSubTab>("all");
  const [sortBy, setSortBy] = useState<RouteRanking>("fastest");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Departure Time state
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [timeConfig, setTimeConfig] = useState<{
    label: string;
    date?: string;
    time?: string;
    arriveBy?: boolean;
  }>({ label: "Departs Now" });

  // Header shrink state: shrinks to a compact single-line pill once routes load!
  const [headerExpanded, setHeaderExpanded] = useState(true);

  const [currentLocation, setCurrentLocation] =
    useState<UnifiedLocation | null>(null);
  const [fromQ, setFromQ] = useState("Current Location");
  const [toQ, setToQ] = useState("");
  const [fromLoc, setFromLoc] = useState<UnifiedLocation | null>(null);
  const [toLoc, setToLoc] = useState<UnifiedLocation | null>(null);
  const [focusedField, setFocusedField] = useState<"from" | "to" | null>("to");

  const [routes, setRoutes] = useState<Route[]>([]);
  const [fetching, setFetching] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Active swiped route index for Car / Walk / Bicycle interactive map view
  const [selectedMapRouteIdx, setSelectedMapRouteIdx] = useState(0);
  const mapCameraRef = useRef<MapboxCamera>(null);
  const transitPagerRef = useRef<ScrollView>(null);

  const toInputRef = useRef<TextInput>(null);
  const setJourney = useJourneyStore((st) => st.setJourney);
  const { places: savedPlaces, fetch: fetchSaved } = useSavedStore();
  const { prefs } = usePrefsStore();

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
        const cur: UnifiedLocation = {
          _type: "location",
          id: "current_location",
          name: "Current Location",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setCurrentLocation(cur);
        if (!dlParams.fLat) {
          setFromLoc(cur);
          setFromQ("Current Location");
        }
      }
    })();
  }, [dlParams.fLat]);

  useEffect(() => {
    if (dlParams.fLat && dlParams.fLng) {
      const f: UnifiedLocation = {
        _type: "location",
        id: dlParams.fName || "Origin",
        name: dlParams.fName || "Origin",
        lat: parseFloat(dlParams.fLat),
        lng: parseFloat(dlParams.fLng),
      };
      setFromLoc(f);
      setFromQ(f.name);
    }
    if (dlParams.tLat && dlParams.tLng) {
      const t: UnifiedLocation = {
        _type: "location",
        id: dlParams.tName || "Destination",
        name: dlParams.tName || "Destination",
        lat: parseFloat(dlParams.tLat),
        lng: parseFloat(dlParams.tLng),
      };
      setToLoc(t);
      setToQ(t.name);
      setFocusedField(null);
      setHeaderExpanded(false);
    }
  }, [
    dlParams.fLat,
    dlParams.fLng,
    dlParams.fName,
    dlParams.tLat,
    dlParams.tLng,
    dlParams.tName,
  ]);

  const activeQuery =
    focusedField === "from"
      ? fromQ === "Current Location"
        ? ""
        : fromQ
      : focusedField === "to"
      ? toQ
      : "";

  const {
    stops,
    places: placeResults,
    recents,
    pushRecent,
    isSearchingStops,
    isSearchingPlaces,
  } = useStopSearch(
    activeQuery,
    currentLocation
      ? { latitude: currentLocation.lat, longitude: currentLocation.lng }
      : null
  );

  // Calculate routes whenever endpoints, mode, or departure time changes
  useEffect(() => {
    if (!fromLoc || !toLoc) {
      setRoutes([]);
      return;
    }
    Keyboard.dismiss();
    setFocusedField(null);
    setHeaderExpanded(false); // Shrink header into compact KakaoMap pill!
    setFetching(true);
    setSelectedMapRouteIdx(0);

    RouteService.calculateJourney(
      fromLoc,
      toLoc,
      prefs.maxWalkMeters,
      topMode,
      timeConfig.time
        ? {
            date: timeConfig.date,
            time: timeConfig.time,
            arriveBy: timeConfig.arriveBy,
          }
        : undefined
    )
      .then((res) => {
        // For Car/Walk/Bike, if OTP returns 1 route, synthesize a 2nd alternative ("Shortest" vs "Main Roads") if only 1 exists
        setRoutes(res);
      })
      .catch(() => setRoutes([]))
      .finally(() => setFetching(false));
  }, [fromLoc, toLoc, topMode, prefs.maxWalkMeters, timeConfig]);

  const tabCounts = useMemo(() => {
    return {
      all: routes.length,
      bus: routes.filter((r) => r.category === "bus").length,
      rail: routes.filter((r) => r.category === "rail").length,
      mixed: routes.filter((r) => r.category === "mixed").length,
    };
  }, [routes]);

  const getRankedForSubTab = (tab: TransitSubTab) => {
    const base =
      topMode !== "transit" || tab === "all"
        ? routes
        : routes.filter((r) => r.category === tab);
    return rankRoutes(base, sortBy);
  };

  const activeMapRoutes = useMemo(
    () => rankRoutes(routes, sortBy),
    [routes, sortBy]
  );

  // Fit Mapbox camera whenever selectedMapRouteIdx changes in Car/Walk/Bike mode
  useEffect(() => {
    if (topMode === "transit" || activeMapRoutes.length === 0) return;
    const chosen = activeMapRoutes[selectedMapRouteIdx] ?? activeMapRoutes[0];
    const pts = (chosen?.segments ?? []).flatMap((s) => s.coordinates ?? []);
    if (pts.length < 2) return;

    const lngs = pts.map((p) => p[1]);
    const lats = pts.map((p) => p[0]);
    const t = setTimeout(() => {
      mapCameraRef.current?.fitBounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
        [70, 50, 230, 50],
        500
      );
    }, 150);
    return () => clearTimeout(t);
  }, [topMode, activeMapRoutes, selectedMapRouteIdx]);

  const bg = dark ? "#0F0F0F" : "#F3F4F6";
  const cardBg = dark ? "#18181B" : "#FFFFFF";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";

  const handleSelectEndpoint = (loc: UnifiedLocation) => {
    pushRecent(loc);
    if (focusedField === "from") {
      setFromLoc(loc);
      setFromQ(loc.name);
      if (!toLoc) {
        setFocusedField("to");
        toInputRef.current?.focus();
      } else {
        setFocusedField(null);
        setHeaderExpanded(false);
      }
    } else {
      setToLoc(loc);
      setToQ(loc.name);
      setFocusedField(null);
      if (fromLoc) setHeaderExpanded(false);
    }
  };

  const handleSelectPlacePrediction = async (pred: PlacePrediction) => {
    setResolvingId(pred.place_id);
    const det = await MapService.getPlaceDetails(pred.place_id);
    setResolvingId(null);
    if (!det) return;
    handleSelectEndpoint({
      _type: "location",
      id: pred.place_id,
      name: pred.main_text,
      lat: det.lat,
      lng: det.lng,
    });
  };

  const swapEndpoints = () => {
    Haptics.selectionAsync();
    const prevFromLoc = fromLoc;
    const prevFromQ = fromQ;
    setFromLoc(toLoc);
    setFromQ(toQ);
    setToLoc(prevFromLoc);
    setToQ(prevFromQ);
  };

  const handleStartJourney = (route: Route) => {
    if (!fromLoc || !toLoc) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJourney(fromLoc, toLoc, route);
    router.replace("/(tabs)/map" as any);
  };

  const showAutocompleteList = focusedField !== null || !fromLoc || !toLoc;
  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Recommendation";

  const renderTransitItineraryCard = (route: Route, index: number) => {
    const totalMins = Math.max(1, Math.round(route.total_duration / 60));
    const durParts = formatDurationParts(route.total_duration);
    const distKm = (route.total_distance / 1000).toFixed(1);
    const fare = extractFares(route.segments ?? []);
    const transitLegs = (route.segments ?? []).filter(
      (seg) =>
        seg.mode !== "WALK" && seg.mode !== "BICYCLE" && seg.mode !== "CAR"
    );

    const depTimeStr =
      route.departure_time ??
      new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    const arrTimeStr =
      route.arrival_time ??
      new Date(Date.now() + route.total_duration * 1000).toLocaleTimeString(
        [],
        { hour: "numeric", minute: "2-digit" }
      );

    return (
      <View
        key={`it-${index}`}
        style={[
          s.itineraryCard,
          { backgroundColor: cardBg, borderColor: borderCol },
        ]}
      >
        {(index === 0 || route.safety?.safer) && (
          <View style={s.topBadgeRow}>
            {index === 0 && (
              <View style={s.TagBlue}>
                <Text style={s.TagBlueText}>{activeSortLabel}</Text>
              </View>
            )}
            {route.safety?.safer && (
              <View style={s.TagGreen}>
                <Text style={s.TagGreenText}>Safer Night Route</Text>
              </View>
            )}
          </View>
        )}

        <View style={s.headlineRow}>
          <Text style={[s.bigDuration, { color: textPrimary }]}>
            {durParts.hours > 0 && (
              <>
                {durParts.hours}
                <Text style={s.bigDurationUnit}>hr </Text>
              </>
            )}
            {durParts.minutes > 0 || durParts.hours === 0 ? (
              <>
                {durParts.minutes}
                <Text style={s.bigDurationUnit}>min</Text>
              </>
            ) : null}
          </Text>

          <Text style={[s.timeAndFareText, { color: textMuted }]}>
            {depTimeStr} - {arrTimeStr} ·{" "}
            {fare.found ? `${fare.currency} ${fare.total}` : `${distKm}km`}
          </Text>
        </View>

        <ProportionalDurationBar
          segments={route.segments ?? []}
          totalDuration={route.total_duration}
          dark={dark}
        />

        {transitLegs.length > 0 && (
          <View style={s.timelineList}>
            {transitLegs.map((leg, lIdx) => {
              const legColor =
                leg.route_color || getRouteColor(leg.route_name ?? "Bus");
              const stopCode =
                leg.from.stop_code ??
                (leg.from.stop_id
                  ? leg.from.stop_id.slice(-5).toUpperCase()
                  : "");
              const departures = leg.next_departures ?? [];

              return (
                <View key={lIdx} style={s.timelineLegBlock}>
                  <View style={s.timelineNodeRow}>
                    <View
                      style={[
                        s.timelineModeCircle,
                        { borderColor: legColor },
                      ]}
                    >
                      <Ionicons
                        name={
                          leg.mode === "RAIL" || leg.mode === "SUBWAY"
                            ? "train"
                            : "bus"
                        }
                        size={12}
                        color={legColor}
                      />
                    </View>
                    <Text
                      style={[s.timelineStopName, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      {leg.from.name}{" "}
                      {stopCode ? (
                        <Text
                          style={{
                            color: textMuted,
                            fontWeight: "400",
                            fontSize: 12,
                          }}
                        >
                          {stopCode}
                        </Text>
                      ) : null}
                    </Text>
                  </View>

                  <View
                    style={[
                      s.timelineDeparturesBox,
                      { borderLeftColor: borderCol },
                    ]}
                  >
                    {departures.length > 0 ? (
                      departures.map((dep, dIdx) => (
                        <View key={dIdx} style={s.departureBadgeLine}>
                          <View
                            style={[
                              s.modeMiniBadge,
                              { backgroundColor: legColor },
                            ]}
                          >
                            <Text style={s.modeMiniBadgeText}>
                              {leg.mode_badge ?? "Bus"}
                            </Text>
                          </View>
                          <Text
                            style={[s.depRouteNum, { color: textPrimary }]}
                          >
                            {leg.route_name}
                          </Text>
                          <Text style={s.depRedEta}>{dep.eta_label}</Text>
                          <Text style={[s.depCrowding, { color: textMuted }]}>
                            · {dep.crowding}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <View style={s.departureBadgeLine}>
                        <View
                          style={[
                            s.modeMiniBadge,
                            { backgroundColor: legColor },
                          ]}
                        >
                          <Text style={s.modeMiniBadgeText}>
                            {leg.mode_badge ?? "Bus"}
                          </Text>
                        </View>
                        <Text style={[s.depRouteNum, { color: textPrimary }]}>
                          {leg.route_name}
                        </Text>
                        <Text style={[s.depCrowding, { color: textMuted }]}>
                          · {leg.stop_count ?? 1} stops
                        </Text>
                      </View>
                    )}
                  </View>

                  {lIdx === transitLegs.length - 1 && (
                    <View style={s.timelineNodeRow}>
                      <View style={s.timelineEndDot} />
                      <Text
                        style={[s.timelineStopName, { color: textPrimary }]}
                        numberOfLines={1}
                      >
                        {leg.to.name}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={() => handleStartJourney(route)}
          style={({ pressed }) => [
            s.startNavBtn,
            {
              borderColor: borderCol,
              backgroundColor: pressed
                ? dark
                  ? "#27272A"
                  : "#F9FAFB"
                : "transparent",
            },
          ]}
        >
          <Ionicons name="navigate" size={15} color={textPrimary} />
          <Text style={[s.startNavText, { color: textPrimary }]}>
            Start Navigation
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* ─── 1. KAKAOMAP SHRINKING / EXPANDABLE TOP HEADER (IMG_6287 / IMG_6288 / IMG_6291)[cite: 7, 8, 10] ─── */}
      <View
        style={[
          s.plannerHeader,
          { paddingTop: Math.max(insets.top, 12) + 4 },
        ]}
      >
        <View style={s.modeTabsBar}>
          <View style={s.modeIconsCenter}>
            {(
              [
                { id: "car", icon: "car" },
                { id: "transit", icon: "bus" },
                { id: "walk", icon: "walk" },
                { id: "bicycle", icon: "bicycle" },
              ] as const
            ).map((m) => {
              const isAct = topMode === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTopMode(m.id);
                  }}
                  style={[s.modeIconPill, isAct && s.modeIconPillActive]}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={20}
                    color={isAct ? HEADER_BLUE : "rgba(255,255,255,0.85)"}
                  />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={s.headerCloseBtn}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Compact Single-Line Pill vs Expanded Dual Input Stack[cite: 7, 8, 10] */}
        {!headerExpanded && !showAutocompleteList && fromLoc && toLoc ? (
          <View style={s.compactPillRow}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setHeaderExpanded(true);
              }}
              style={s.compactOriginDestPill}
            >
              <Text style={s.compactPillText} numberOfLines={1}>
                {fromLoc.name}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={14}
                color="rgba(255,255,255,0.85)"
              />
              <Text style={s.compactPillText} numberOfLines={1}>
                {toLoc.name}
              </Text>
            </Pressable>

            <Pressable
              onPress={swapEndpoints}
              hitSlop={10}
              style={s.compactMoreBtn}
            >
              <Ionicons name="swap-vertical" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={s.inputsRow}>
            <View style={s.inputsBox}>
              <TextInput
                value={fromQ}
                onFocus={() => setFocusedField("from")}
                onChangeText={(t) => {
                  setFromQ(t);
                  setFromLoc(null);
                }}
                placeholder="Origin or Current Location"
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={s.plannerInput}
              />
              <View style={s.inputDivider} />
              <TextInput
                ref={toInputRef}
                value={toQ}
                autoFocus={!dlParams.tLat}
                onFocus={() => setFocusedField("to")}
                onChangeText={(t) => {
                  setToQ(t);
                  setToLoc(null);
                }}
                placeholder="Destination"
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={s.plannerInput}
              />
            </View>

            <View style={s.rightInputActions}>
              <Pressable onPress={swapEndpoints} hitSlop={10} style={s.swapBtn}>
                <Ionicons name="swap-vertical" size={20} color="#FFFFFF" />
              </Pressable>
              {fromLoc && toLoc && (
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setFocusedField(null);
                    setHeaderExpanded(false);
                  }}
                  hitSlop={10}
                  style={s.swapBtn}
                >
                  <Ionicons name="chevron-up" size={20} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ─── 2. AUTOCOMPLETE VIEW ─── */}
      {showAutocompleteList ? (
        <View style={{ flex: 1, backgroundColor: cardBg }}>
          <View style={[s.homeWorkBar, { borderBottomColor: borderCol }]}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 18 }}
            >
              {currentLocation && focusedField === "from" && (
                <Pressable
                  onPress={() => handleSelectEndpoint(currentLocation)}
                  style={s.quickPinBtn}
                >
                  <Ionicons name="locate" size={15} color={ORANGE} />
                  <Text style={[s.quickPinText, { color: ORANGE }]}>
                    Current Location
                  </Text>
                </Pressable>
              )}
              {homePlace && (
                <Pressable
                  onPress={() =>
                    handleSelectEndpoint({
                      _type: "location",
                      id: `home_${homePlace.id}`,
                      name: homePlace.name,
                      lat: homePlace.lat,
                      lng: homePlace.lng,
                    })
                  }
                  style={s.quickPinBtn}
                >
                  <Ionicons name="home" size={15} color={textMuted} />
                  <Text style={[s.quickPinText, { color: textPrimary }]}>
                    Home
                  </Text>
                </Pressable>
              )}
              {workPlace && (
                <Pressable
                  onPress={() =>
                    handleSelectEndpoint({
                      _type: "location",
                      id: `work_${workPlace.id}`,
                      name: workPlace.name,
                      lat: workPlace.lat,
                      lng: workPlace.lng,
                    })
                  }
                  style={s.quickPinBtn}
                >
                  <Ionicons name="business" size={15} color={textMuted} />
                  <Text style={[s.quickPinText, { color: textPrimary }]}>
                    Work/School
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 80 }}
          >
            {(isSearchingStops || isSearchingPlaces) && (
              <View style={s.searchingRow}>
                <ActivityIndicator size="small" color={ORANGE} />
                <Text style={{ color: textMuted, fontSize: 13 }}>
                  Searching locations…
                </Text>
              </View>
            )}

            {activeQuery.length > 0 ? (
              <>
                {stops.map((st) => (
                  <Pressable
                    key={`st-${st.id}`}
                    onPress={() => handleSelectEndpoint(st)}
                    style={[s.autoRow, { borderBottomColor: borderCol }]}
                  >
                    <View
                      style={[
                        s.autoIcon,
                        { backgroundColor: "rgba(37, 99, 235, 0.12)" },
                      ]}
                    >
                      <Ionicons name="bus" size={16} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[s.autoTitle, { color: textPrimary }]}
                        numberOfLines={1}
                      >
                        {st.name}
                      </Text>
                      {st.route_nams && (
                        <Text
                          style={[s.autoSub, { color: textMuted }]}
                          numberOfLines={1}
                        >
                          Lines: {st.route_nams}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))}

                {placeResults.map((p) => (
                  <Pressable
                    key={`pl-${p.place_id}`}
                    onPress={() => handleSelectPlacePrediction(p)}
                    style={[s.autoRow, { borderBottomColor: borderCol }]}
                  >
                    <View
                      style={[
                        s.autoIcon,
                        { backgroundColor: dark ? "#27272A" : "#F3F4F6" },
                      ]}
                    >
                      {resolvingId === p.place_id ? (
                        <ActivityIndicator size="small" color={ORANGE} />
                      ) : (
                        <Ionicons
                          name="location-outline"
                          size={16}
                          color={textPrimary}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[s.autoTitle, { color: textPrimary }]}
                        numberOfLines={1}
                      >
                        {p.main_text}
                      </Text>
                      <Text
                        style={[s.autoSub, { color: textMuted }]}
                        numberOfLines={1}
                      >
                        {p.secondary_text}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            ) : (
              recents.map((r) => (
                <Pressable
                  key={`rec-${r.id}`}
                  onPress={() => handleSelectEndpoint(r)}
                  style={[s.autoRow, { borderBottomColor: borderCol }]}
                >
                  <View
                    style={[
                      s.autoIcon,
                      { backgroundColor: dark ? "#27272A" : "#F3F4F6" },
                    ]}
                  >
                    <Ionicons name="time-outline" size={16} color={textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.autoTitle, { color: textPrimary }]}
                      numberOfLines={1}
                    >
                      {r.name}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : topMode === "transit" ? (
        /* ─── 3A. TRANSIT MODE: SWIPEABLE SUB-TABS + DEPARTURE TIME SHEET + SORT DROPDOWN ─── */
        <View style={{ flex: 1 }}>
          {/* Sub-Mode Filter Tabs */}
          <View
            style={[
              s.subTabsBar,
              { backgroundColor: cardBg, borderBottomColor: borderCol },
            ]}
          >
            {(
              [
                { id: "all", label: "All", count: tabCounts.all },
                { id: "bus", label: "Bus", count: tabCounts.bus },
                { id: "rail", label: "Subway / Rail", count: tabCounts.rail },
                { id: "mixed", label: "Bus + Rail", count: tabCounts.mixed },
              ] as const
            ).map((tab, tIdx) => {
              const isSel = subTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSubTab(tab.id);
                    transitPagerRef.current?.scrollTo({
                      x: tIdx * SCREEN_W,
                      animated: true,
                    });
                  }}
                  style={[
                    s.subTabItem,
                    isSel && [
                      s.subTabItemActive,
                      { borderBottomColor: textPrimary },
                    ],
                  ]}
                >
                  <Text
                    style={[
                      s.subTabLabel,
                      { color: isSel ? textPrimary : textMuted },
                    ]}
                  >
                    {tab.label}{" "}
                    <Text style={{ fontWeight: "500", color: textMuted }}>
                      {tab.count}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Departure Time Trigger & Sort Dropdown Trigger Strip[cite: 7] */}
          <View
            style={[
              s.metaControlStrip,
              { backgroundColor: cardBg, borderBottomColor: borderCol },
            ]}
          >
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setTimeSheetOpen(true);
              }}
              style={s.timeSelectBtn}
            >
              <Ionicons name="time-outline" size={14} color={ORANGE} />
              <Text style={[s.timeSelectText, { color: textPrimary }]}>
                {timeConfig.label} ⌄
              </Text>
            </Pressable>

            <View style={{ position: "relative" }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSortDropdownOpen((v) => !v);
                }}
                style={s.sortSelectBtn}
              >
                <Text style={[s.timeSelectText, { color: textMuted }]}>
                  {activeSortLabel} ⌄
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Floating Sort Dropdown Menu */}
          {sortDropdownOpen && (
            <View
              style={[
                s.sortDropdownMenu,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy(opt.key);
                      setSortDropdownOpen(false);
                    }}
                    style={[
                      s.sortDropdownItem,
                      { borderBottomColor: borderCol },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.sortDropdownLabel,
                          { color: active ? ORANGE : textPrimary },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={{ color: textMuted, fontSize: 11 }}>
                        {opt.desc}
                      </Text>
                    </View>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={ORANGE} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {fetching ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={ORANGE} />
              <Text style={{ color: textMuted, marginTop: 12, fontSize: 13 }}>
                Calculating optimal transit itineraries…
              </Text>
            </View>
          ) : (
            /* Horizontally Swipeable Pager across All | Bus | Subway/Rail | Bus+Rail */
            <ScrollView
              ref={transitPagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const pageIdx = Math.round(
                  e.nativeEvent.contentOffset.x / SCREEN_W
                );
                const nextTab = TRANSIT_TABS[pageIdx] ?? "all";
                if (nextTab !== subTab) {
                  Haptics.selectionAsync();
                  setSubTab(nextTab);
                }
              }}
            >
              {TRANSIT_TABS.map((tabKey) => {
                const pageRoutes = getRankedForSubTab(tabKey);
                return (
                  <View key={tabKey} style={{ width: SCREEN_W, flex: 1 }}>
                    {pageRoutes.length === 0 ? (
                      <View style={s.centerBox}>
                        <Ionicons
                          name="trail-sign-outline"
                          size={42}
                          color={textMuted}
                        />
                        <Text
                          style={[
                            s.emptyTitle,
                            { color: textPrimary, marginTop: 10 },
                          ]}
                        >
                          No {tabKey === "all" ? "" : tabKey} routes found
                        </Text>
                        <Text
                          style={{
                            color: textMuted,
                            fontSize: 13,
                            marginTop: 4,
                          }}
                        >
                          Swipe left/right to view other transit modes.
                        </Text>
                      </View>
                    ) : (
                      <FlatList
                        data={pageRoutes}
                        keyExtractor={(_, idx) => `${tabKey}-it-${idx}`}
                        contentContainerStyle={{
                          paddingBottom: 40,
                          gap: 10,
                        }}
                        renderItem={({ item, index }) =>
                          renderTransitItineraryCard(item, index)
                        }
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : (
        /* ─── 3B. CAR / WALK / BICYCLE MODE: INTERACTIVE MAP + SWIPEABLE BOTTOM ROUTE CARDS (IMG_6291 / IMG_6296 / IMG_6297)[cite: 10, 11, 13] ─── */
        <View style={{ flex: 1 }}>
          <MapboxMapView
            style={{ flex: 1 }}
            styleURL={
              dark
                ? "mapbox://styles/mapbox/dark-v11"
                : process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ??
                  "mapbox://styles/mapbox/streets-v12"
            }
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
          >
            <MapboxCamera
              ref={mapCameraRef}
              defaultSettings={{
                centerCoordinate: [
                  fromLoc?.lng ?? 36.8172,
                  fromLoc?.lat ?? -1.2864,
                ],
                zoomLevel: 13.5,
              }}
            />

            {/* Unselected alternative routes rendered in muted grey-blue underneath[cite: 10, 11, 13] */}
            {activeMapRoutes.map((rt, rIdx) => {
              if (rIdx === selectedMapRouteIdx) return null;
              const coords = (rt.segments ?? [])
                .flatMap((s) => s.coordinates ?? [])
                .map(([lat, lng]) => [lng, lat]);
              if (coords.length < 2) return null;

              return (
                <NativeShapeSource
                  key={`alt-route-${rIdx}`}
                  id={`alt-route-src-${rIdx}`}
                  shape={{
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: { idx: rIdx },
                  }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedMapRouteIdx(rIdx);
                  }}
                >
                  <NativeLineLayer
                    id={`alt-route-line-${rIdx}`}
                    style={{
                      lineColor: "#94A3B8",
                      lineWidth: 7,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </NativeShapeSource>
              );
            })}

            {/* Currently Selected Route rendered brightly on top[cite: 10, 11, 13] */}
            {(() => {
              const selRoute =
                activeMapRoutes[selectedMapRouteIdx] ?? activeMapRoutes[0];
              if (!selRoute) return null;
              const coords = (selRoute.segments ?? [])
                .flatMap((s) => s.coordinates ?? [])
                .map(([lat, lng]) => [lng, lat]);
              if (coords.length < 2) return null;

              const primaryLineColor =
                topMode === "car"
                  ? "#EF4444" // KakaoMap Car Traffic Red/Amber highlight
                  : topMode === "walk"
                  ? "#2563EB" // KakaoMap Walk Blue highlight
                  : "#16A34A";

              return (
                <NativeShapeSource
                  id="selected-mode-route-src"
                  shape={{
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: {},
                  }}
                >
                  <NativeLineLayer
                    id="selected-mode-route-casing"
                    style={{
                      lineColor: "#FFFFFF",
                      lineWidth: 11,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  <NativeLineLayer
                    id="selected-mode-route-line"
                    style={{
                      lineColor: primaryLineColor,
                      lineWidth: 7.5,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </NativeShapeSource>
              );
            })()}

            {/* KakaoMap Blue "Start" & Red "Arr." Teardrop Markers[cite: 10, 11, 13] */}
            {fromLoc && (
              <NativePointAnnotation
                id="mode-map-start"
                coordinate={[fromLoc.lng, fromLoc.lat]}
                anchor={{ x: 0.5, y: 1.0 }}
              >
                <View style={[s.mapEndpointPin, { backgroundColor: "#2563EB" }]}>
                  <Text style={s.mapEndpointPinText}>Start</Text>
                </View>
              </NativePointAnnotation>
            )}

            {toLoc && (
              <NativePointAnnotation
                id="mode-map-arr"
                coordinate={[toLoc.lng, toLoc.lat]}
                anchor={{ x: 0.5, y: 1.0 }}
              >
                <View style={[s.mapEndpointPin, { backgroundColor: "#DC2626" }]}>
                  <Text style={s.mapEndpointPinText}>Arr.</Text>
                </View>
              </NativePointAnnotation>
            )}
          </MapboxMapView>

          {/* Floating "[🕒 Later]" Button on Top-Left of Map (IMG_6296.PNG)[cite: 11, 13] */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setTimeSheetOpen(true);
            }}
            style={[
              s.mapLaterPill,
              { backgroundColor: cardBg, borderColor: borderCol },
            ]}
          >
            <Ionicons name="time-outline" size={16} color={textPrimary} />
            <Text style={[s.mapLaterText, { color: textPrimary }]}>
              {timeConfig.time ? timeConfig.label : "Later"}
            </Text>
          </Pressable>

          {/* Bottom Horizontally Swipeable Route Cards (IMG_6291 / IMG_6296 / IMG_6297)[cite: 10, 11, 13] */}
          <View
            style={[
              s.bottomCarouselWrap,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            {fetching ? (
              <View
                style={[
                  s.mapSwipeCard,
                  {
                    backgroundColor: cardBg,
                    width: CARD_W,
                    alignSelf: "center",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 150,
                  },
                ]}
              >
                <ActivityIndicator size="large" color={ORANGE} />
                <Text style={{ color: textMuted, marginTop: 8, fontSize: 13 }}>
                  Finding best {topMode} routes…
                </Text>
              </View>
            ) : (
              <FlatList
                data={activeMapRoutes}
                keyExtractor={(_, idx) => `map-card-${idx}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_W + 12}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: 22, gap: 12 }}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(
                    e.nativeEvent.contentOffset.x / (CARD_W + 12)
                  );
                  if (
                    idx >= 0 &&
                    idx < activeMapRoutes.length &&
                    idx !== selectedMapRouteIdx
                  ) {
                    Haptics.selectionAsync();
                    setSelectedMapRouteIdx(idx);
                  }
                }}
                renderItem={({ item: rt, index }) => {
                  const mins = Math.max(1, Math.round(rt.total_duration / 60));
                  const km = (rt.total_distance / 1000).toFixed(1);
                  const kcal = Math.max(
                    12,
                    Math.round((rt.total_distance / 1000) * 48)
                  );
                  const taxiKes = Math.max(
                    250,
                    Math.round(150 + (rt.total_distance / 1000) * 65)
                  );
                  const isSel = index === selectedMapRouteIdx;

                  const badgeTitle =
                    topMode === "car"
                      ? index === 0
                        ? "Recommended · Main Roads Priority"
                        : "Shortest Distance"
                      : index === 0
                      ? "Shortest Route"
                      : "Main Boulevard";

                  return (
                    <Pressable
                      onPress={() => setSelectedMapRouteIdx(index)}
                      style={[
                        s.mapSwipeCard,
                        {
                          width: CARD_W,
                          backgroundColor: cardBg,
                          borderColor: isSel ? HEADER_BLUE : borderCol,
                        },
                      ]}
                    >
                      <Text style={s.mapCardBadgeText}>{badgeTitle}</Text>
                      <Text style={[s.mapCardDuration, { color: textPrimary }]}>
                        {mins}min
                      </Text>
                      <Text style={[s.mapCardSub, { color: textMuted }]}>
                        {topMode === "car"
                          ? `${km}km · Toll: KES 0 · Est. Taxi: KES ${taxiKes}`
                          : `${km}km · ${kcal} kcal`}
                      </Text>

                      <Pressable
                        onPress={() => handleStartJourney(rt)}
                        style={s.mapCardStartBtn}
                      >
                        <Ionicons name="navigate" size={16} color="#FFFFFF" />
                        <Text style={s.mapCardStartBtnText}>Start Navi</Text>
                      </Pressable>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      )}

      {/* Draggable Set Departure Time Bottom Sheet */}
      <DepartureTimeSheet
        visible={timeSheetOpen}
        onClose={() => setTimeSheetOpen(false)}
        onApply={(cfg) => setTimeConfig(cfg)}
        dark={dark}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  plannerHeader: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: 14,
    paddingBottom: 12,
    zIndex: 20,
  },
  modeTabsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modeIconsCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginLeft: 24,
  },
  modeIconPill: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modeIconPillActive: {
    backgroundColor: "#FFFFFF",
  },
  headerCloseBtn: { padding: 4 },
  compactPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactOriginDestPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  compactPillText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  compactMoreBtn: {
    padding: 6,
  },
  inputsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputsBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 10,
    overflow: "hidden",
  },
  plannerInput: {
    height: 42,
    paddingHorizontal: 14,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  inputDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  rightInputActions: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  swapBtn: { padding: 6 },
  homeWorkBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quickPinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  quickPinText: { fontSize: 13, fontWeight: "600" },
  searchingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  autoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  autoTitle: { fontSize: 15, fontWeight: "600" },
  autoSub: { fontSize: 12, marginTop: 2 },
  subTabsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 18,
  },
  subTabItem: {
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subTabItemActive: { borderBottomWidth: 2.5 },
  subTabLabel: { fontSize: 14, fontWeight: "700" },
  metaControlStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 15,
  },
  timeSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  sortSelectBtn: { paddingVertical: 2 },
  timeSelectText: { fontSize: 13, fontWeight: "600" },
  sortDropdownMenu: {
    position: "absolute",
    top: 86,
    right: 14,
    width: 240,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 20,
    zIndex: 50,
    overflow: "hidden",
  },
  sortDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sortDropdownLabel: { fontSize: 13.5, fontWeight: "700" },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  itineraryCard: { padding: 18, borderBottomWidth: 1 },
  topBadgeRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  TagBlue: {
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  TagBlueText: { color: "#2563EB", fontSize: 11, fontWeight: "700" },
  TagGreen: {
    backgroundColor: "rgba(22, 163, 74, 0.14)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  TagGreenText: { color: "#16A34A", fontSize: 11, fontWeight: "700" },
  headlineRow: { marginBottom: 12 },
  bigDuration: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  bigDurationUnit: { fontSize: 18, fontWeight: "600" },
  timeAndFareText: { fontSize: 13.5, fontWeight: "500", marginTop: 2 },
  propBarTrack: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    marginBottom: 16,
  },
  propWalkSeg: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  propWalkText: { fontSize: 10.5, fontWeight: "600" },
  propTransitSeg: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    borderRadius: 11,
    paddingHorizontal: 6,
    gap: 4,
  },
  propTransitIconCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  propTransitText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },
  timelineList: { marginBottom: 14 },
  timelineLegBlock: { marginBottom: 2 },
  timelineNodeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timelineModeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineStopName: { fontSize: 15, fontWeight: "600", flex: 1 },
  timelineDeparturesBox: {
    marginLeft: 10,
    paddingLeft: 20,
    paddingVertical: 6,
    borderLeftWidth: 1.5,
    gap: 5,
  },
  departureBadgeLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  modeMiniBadge: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
  modeMiniBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  depRouteNum: { fontSize: 13.5, fontWeight: "700" },
  depRedEta: { color: "#DC2626", fontSize: 13, fontWeight: "700" },
  depCrowding: { fontSize: 12.5 },
  timelineEndDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#9CA3AF",
    marginLeft: 7.5,
  },
  startNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  startNavText: { fontSize: 14, fontWeight: "700" },

  // Car / Walk / Bike Interactive Map + Swipeable Cards
  mapEndpointPin: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  mapEndpointPinText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  mapLaterPill: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  mapLaterText: { fontSize: 13, fontWeight: "700" },
  bottomCarouselWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapSwipeCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 14,
  },
  mapCardBadgeText: {
    color: HEADER_BLUE,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  mapCardDuration: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  mapCardSub: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
    marginBottom: 14,
  },
  mapCardStartBtn: {
    backgroundColor: HEADER_BLUE,
    height: 46,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapCardStartBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // Set Departure Time Sheet
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  timeSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  timeSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  timeSheetTitle: { fontSize: 18, fontWeight: "800" },
  depArrToggle: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 2,
  },
  depArrBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  depArrText: { fontSize: 12, fontWeight: "700" },
  quickTimeRow: { gap: 8, paddingVertical: 10 },
  quickTimeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  quickTimeChipText: { fontSize: 12.5, fontWeight: "700" },
  pickerSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  dayRow: { flexDirection: "row", gap: 8 },
  dayPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  numCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  minAndAmPmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  minPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ampmBox: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 2,
  },
  ampmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  applyTimeBtn: {
    backgroundColor: ORANGE,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  applyTimeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  subtitleCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  wheelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 10,
  },
  wheelSelectionBar: {
    position: "absolute",
    left: 4,
    right: 4,
    height: WHEEL_ITEM_H,
    borderRadius: 12,
  },
  wheelFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  leaveNowBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  leaveNowText: {
    fontSize: 15,
    fontWeight: "600",
  },
  completeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: HEADER_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});