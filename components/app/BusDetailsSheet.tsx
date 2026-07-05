// components/app/BusDetailsSheet.tsx
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BusStopMeta, SelectedBusInfo } from "@/components/map/BusLayer";
import { BUS_DWELL_S, BUS_SPEED_KPH } from "@/components/map/BusLayer";

const { height: SCREEN_H } = Dimensions.get("window");
const MAX_Y  = SCREEN_H * 0.08;
const PEEK_H = Math.min(Math.max(SCREEN_H * 0.58, 300), 540);
const MIN_Y  = SCREEN_H - PEEK_H;

// ─── ETA logic ────────────────────────────────────────────────────────────────
type StopState = "past" | "current" | "next" | "future";

function computeStopStates(
  bus:   SelectedBusInfo,
  nowMs: number,
): { states: StopState[]; etaSecs: number[] } {
  const N      = bus.stops.length;
  const states: StopState[]  = new Array(N).fill("future");
  const etaSecs: number[]    = new Array(N).fill(Infinity);
  const elapsed = (nowMs - bus.animStartEpoch) / 1000;
  let t = ((bus.initFrac * bus.cycleTime + elapsed) % bus.cycleTime + bus.cycleTime) % bus.cycleTime;

  for (let i = 0; i < N; i++) {
    if (t < BUS_DWELL_S) {
      // Dwelling at stop i
      for (let j = 0; j < i; j++) { states[j] = "past"; etaSecs[j] = -1; }
      states[i] = "current"; etaSecs[i] = 0;
      let future = BUS_DWELL_S - t;
      for (let j = i + 1; j < N; j++) {
        const leg = bus.stops[j].distKm - bus.stops[j - 1].distKm;
        future += (leg / BUS_SPEED_KPH) * 3600;
        states[j]  = j === i + 1 ? "next" : "future";
        etaSecs[j] = future;
        future += BUS_DWELL_S;
      }
      return { states, etaSecs };
    }
    t -= BUS_DWELL_S;

    if (i < N - 1) {
      const legDist = bus.stops[i + 1].distKm - bus.stops[i].distKm;
      const legTime = (legDist / BUS_SPEED_KPH) * 3600;
      if (t <= legTime) {
        // Traveling between stop i and i+1
        for (let j = 0; j <= i; j++) { states[j] = "past"; etaSecs[j] = -1; }
        const toNext = legTime - t;
        states[i + 1] = "next"; etaSecs[i + 1] = toNext;
        let future = toNext + BUS_DWELL_S;
        for (let j = i + 2; j < N; j++) {
          const d  = bus.stops[j].distKm - bus.stops[j - 1].distKm;
          future  += (d / BUS_SPEED_KPH) * 3600;
          states[j]  = "future";
          etaSecs[j] = future;
          future += BUS_DWELL_S;
        }
        return { states, etaSecs };
      }
      t -= legTime;
    }
  }

  // Reached or past last stop
  for (let j = 0; j < N - 1; j++) { states[j] = "past"; etaSecs[j] = -1; }
  states[N - 1] = "current"; etaSecs[N - 1] = 0;
  return { states, etaSecs };
}

function formatEta(state: StopState, secs: number): string {
  if (state === "past")    return "";
  if (state === "current") return "At stop";
  if (secs < 60)           return "< 1 min";
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatRouteName(longName: string): string {
  const parts = longName.split("-").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return longName;
  return `${parts[0]} → ${parts[parts.length - 1]}`;
}

// ─── Stop row ─────────────────────────────────────────────────────────────────
function StopRow({
  stop, state, etaSecs, isLast, accent, C,
}: {
  stop:    BusStopMeta;
  state:   StopState;
  etaSecs: number;
  isLast:  boolean;
  accent:  string;
  C: { text: string; sub: string };
}) {
  const isPast    = state === "past";
  const isCurrent = state === "current";
  const isNext    = state === "next";

  const dotBg     = isCurrent ? accent : "transparent";
  const dotBorder = isPast ? "#D1D1D6" : isCurrent ? accent : "#C7C7CC";
  const dotSize   = isCurrent ? 14 : 10;
  const lineColor = isPast ? "#E5E5EA" : isCurrent ? accent : "#E5E5EA";
  const nameColor = isPast ? C.sub : C.text;
  const etaText   = formatEta(state, etaSecs);
  const etaColor  = isCurrent ? accent : isNext ? "#FF9500" : C.sub;

  return (
    <View style={row.wrap}>
      {/* Left indicator */}
      <View style={row.indicator}>
        <View
          style={[
            row.dot,
            {
              width:           dotSize,
              height:          dotSize,
              borderRadius:    dotSize / 2,
              backgroundColor: dotBg,
              borderColor:     dotBorder,
              marginTop:       isCurrent ? 1 : 3,
            },
          ]}
        />
        {!isLast && (
          <View style={[row.line, { backgroundColor: lineColor }]} />
        )}
      </View>

      {/* Right content */}
      <View style={row.content}>
        <Text
          style={[
            row.stopName,
            {
              color:      nameColor,
              fontWeight: isCurrent ? "600" : "400",
              fontSize:   isCurrent ? 15 : 14,
            },
          ]}
          numberOfLines={1}
        >
          {stop.name}
        </Text>
        {etaText !== "" && (
          <Text style={[row.eta, { color: etaColor, fontWeight: isCurrent || isNext ? "600" : "400" }]}>
            {etaText}
          </Text>
        )}
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  wrap:      { flexDirection: "row", minHeight: 44 },
  indicator: { width: 22, alignItems: "center", paddingTop: 2 },
  dot:       { borderWidth: 2 },
  line:      { flex: 1, width: 2, marginVertical: 2, minHeight: 20 },
  content:   { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingLeft: 10, paddingBottom: 14 },
  stopName:  { flex: 1, paddingRight: 8 },
  eta:       { fontSize: 13, minWidth: 52, textAlign: "right" },
});

// ─── Sheet ────────────────────────────────────────────────────────────────────
interface Props {
  bus:       SelectedBusInfo | null;
  following: boolean;
  onFollow:  () => void;
  onDismiss: () => void;
}

export default function BusDetailsSheet({ bus, following, onFollow, onDismiss }: Props) {
  const dark   = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();

  const [mounted,  setMounted]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tick,     setTick]     = useState(Date.now());

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;
  const lastY      = useRef(MIN_Y);

  // ── Live ETA ticker ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bus) return;
    const iv = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [bus]);

  const { states, etaSecs } = useMemo(
    () => (bus ? computeStopStates(bus, tick) : { states: [] as StopState[], etaSecs: [] as number[] }),
    [bus, tick],
  );

  // ── Mount / dismiss animation ────────────────────────────────────────────────
  useEffect(() => {
    if (!bus) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_H, duration: 280, useNativeDriver: true }),
        Animated.timing(backdrop,   { toValue: 0,        duration: 280, useNativeDriver: true }),
      ]).start(() => { setMounted(false); setExpanded(false); lastY.current = MIN_Y; translateY.setValue(SCREEN_H); });
    } else {
      setMounted(true);
    }
  }, [bus]);

  useEffect(() => {
    if (!mounted) return;
    lastY.current = MIN_Y;
    Animated.parallel([
      Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 22, stiffness: 200 }),
      Animated.timing(backdrop,   { toValue: 1,     duration: 240, useNativeDriver: true }),
    ]).start();
  }, [mounted]);

  const expandSheet = useCallback(() => {
    lastY.current = MAX_Y; setExpanded(true);
    Animated.spring(translateY, { toValue: MAX_Y, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
  }, []);

  const collapseSheet = useCallback(() => {
    lastY.current = MIN_Y; setExpanded(false);
    Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        translateY.setValue(Math.max(MAX_Y, lastY.current + g.dy));
      },
      onPanResponderRelease: (_, g) => {
        const atPeek = lastY.current >= MIN_Y - 10;
        if      (g.vy < -0.5 || g.dy < -40)                    expandSheet();
        else if (atPeek && (g.vy > 0.5 || g.dy > 80))          onDismiss();
        else if (!atPeek && (g.vy > 0.5 || g.dy > 40))         collapseSheet();
        else    lastY.current === MAX_Y ? expandSheet() : collapseSheet();
      },
    }),
  ).current;

  if (!mounted && !bus) return null;

  const C = {
    bg:     dark ? "#1C1C1E" : "#FFFFFF",
    text:   dark ? "#FFFFFF" : "#1C1C1E",
    sub:    dark ? "#98989D" : "#6C6C70",
    border: dark ? "#38383A" : "#E5E5EA",
    card:   dark ? "#2C2C2E" : "#F2F2F7",
  };
  const accent = bus?.color ?? "#007AFF";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}
        pointerEvents={mounted ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      {/* ── Follow Bus button — floats above sheet peek ── */}
      {bus && (
        <Animated.View
          style={[s.followWrap, { bottom: PEEK_H + 12, opacity: backdrop }]}
          pointerEvents="auto"
        >
          <Pressable
            onPress={onFollow}
            style={[
              s.followBtn,
              { backgroundColor: following ? "#34C759" : accent },
            ]}
          >
            <MaterialIcons
              name={following ? "gps-fixed" : "near-me"}
              size={15}
              color="#FFF"
            />
            <Text style={s.followBtnText}>
              {following ? "Following" : "Follow bus"}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Sheet panel ── */}
      <Animated.View
        style={[s.panel, { backgroundColor: C.bg, transform: [{ translateY }] }]}
      >
        {/* Drag zone */}
        <View {...panResponder.panHandlers}>
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: C.border }]} />
          </View>

          {bus && (
            <View style={s.header}>
              {/* Route badge */}
              <View style={[s.routeBadge, { backgroundColor: accent }]}>
                <Text style={s.routeBadgeText}>{bus.label}</Text>
              </View>

              {/* Route info */}
              <View style={s.headerInfo}>
                <Text style={[s.routeName, { color: C.text }]} numberOfLines={1}>
                  {formatRouteName(bus.routeName)}
                </Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: "#34C759" }]} />
                  <Text style={[s.statusText, { color: C.sub }]}>In service</Text>
                </View>
              </View>

              <Pressable onPress={onDismiss} hitSlop={12} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={C.sub} />
              </Pressable>
            </View>
          )}

          <View style={[s.divider, { backgroundColor: C.border }]} />

          {/* Summary row */}
          {bus && (() => {
            const totalMin  = Math.round((bus.cycleTime / 2) / 60);
            const totalKm   = bus.stops.length > 0 ? bus.stops[bus.stops.length - 1].distKm : 0;
            const nextStop  = bus.stops[states.findIndex((st) => st === "next" || st === "current")];
            return (
              <View style={[s.summaryRow, { backgroundColor: C.card }]}>
                <View style={s.summaryItem}>
                  <MaterialIcons name="directions-bus" size={14} color={accent} />
                  <Text style={[s.summaryVal, { color: C.text }]}>{bus.stops.length} stops</Text>
                </View>
                <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
                <View style={s.summaryItem}>
                  <MaterialIcons name="schedule" size={14} color={accent} />
                  <Text style={[s.summaryVal, { color: C.text }]}>{totalMin} min route</Text>
                </View>
                <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
                <View style={s.summaryItem}>
                  <MaterialIcons name="straighten" size={14} color={accent} />
                  <Text style={[s.summaryVal, { color: C.text }]}>{totalKm.toFixed(1)} km</Text>
                </View>
              </View>
            );
          })()}
        </View>

        {/* Scrollable timeline */}
        <View style={{ flex: 1 }}>
          {!expanded && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={expandSheet}
            />
          )}
          <ScrollView
            scrollEnabled={expanded}
            contentContainerStyle={[
              s.scrollContent,
              { paddingBottom: insets.bottom + 28 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Section label */}
            <Text style={[s.sectionLabel, { color: C.sub }]}>
              STOPS ({bus?.stops.length ?? 0})
            </Text>

            {bus?.stops.map((stop, i) => (
              <StopRow
                key={i}
                stop={stop}
                state={states[i] ?? "future"}
                etaSecs={etaSecs[i] ?? Infinity}
                isLast={i === bus.stops.length - 1}
                accent={accent}
                C={C}
              />
            ))}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  followWrap: {
    position:  "absolute",
    right:     16,
    zIndex:    25,
    elevation: 25,
  },
  followBtn: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              6,
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderRadius:     24,
    shadowColor:      "#000",
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.22,
    shadowRadius:     6,
    elevation:        6,
  },
  followBtnText: {
    color:      "#FFF",
    fontSize:   14,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  panel: {
    position:              "absolute",
    top:                   0,
    left:                  0,
    right:                 0,
    height:                SCREEN_H - MAX_Y,
    borderTopLeftRadius:   22,
    borderTopRightRadius:  22,
    zIndex:                20,
    elevation:             20,
    overflow:              "hidden",
    shadowColor:           "#000",
    shadowOffset:          { width: 0, height: -3 },
    shadowOpacity:         0.12,
    shadowRadius:          10,
  },
  handleWrap: {
    alignItems:    "center",
    paddingTop:    10,
    paddingBottom: 6,
  },
  handle: {
    width:        36,
    height:       4,
    borderRadius: 2,
  },
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 16,
    paddingTop:        4,
    paddingBottom:     12,
    gap:               12,
  },
  routeBadge: {
    width:          48,
    height:         48,
    borderRadius:   24,
    alignItems:     "center",
    justifyContent: "center",
  },
  routeBadgeText: {
    color:      "#FFF",
    fontSize:   13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerInfo: { flex: 1 },
  routeName: {
    fontSize:   16,
    fontWeight: "700",
    marginBottom: 3,
  },
  statusRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           5,
  },
  statusDot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
  },
  statusText: { fontSize: 12 },
  closeBtn:   { padding: 4 },
  divider:    { height: 1 },
  summaryRow: {
    flexDirection:     "row",
    alignItems:        "center",
    marginHorizontal:  16,
    marginTop:         10,
    marginBottom:      4,
    borderRadius:      12,
    paddingVertical:   10,
    paddingHorizontal: 14,
  },
  summaryItem: {
    flex:           1,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            5,
  },
  summaryVal: { fontSize: 12, fontWeight: "500" },
  summaryDivider: { width: 1, height: 20 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        14,
  },
  sectionLabel: {
    fontSize:     11,
    fontWeight:   "600",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
});
