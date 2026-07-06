// components/app/MapFloatingUI.tsx
import { Step, detectManeuver, maneuverIcon, mToNice, stepIcon } from "@/utils/mapHelpers";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React, { JSX, useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const RED    = "#FF3B30";
const BLACK  = "#1C1C1E";
const GREY   = "#8E8E93";
const WHITE  = "#FFFFFF";
const BLUE   = "#007AFF";
const GREEN  = "#34C759";

/** Distance (m) at which the maneuver progress bar starts filling. */
const PROGRESS_RANGE_M = 300;

interface MapFloatingUIProps {
  onRecenter:         () => void;
  onOpenSearch:       () => void;
  onOpenKwame:        () => void;
  onOpenReport:       () => void;
  onOpenLayers:       () => void;
  navigating:         boolean;
  followMe:           boolean;
  waitingForBus:      boolean;
  onToggleNav:        () => void;
  nextPreview:        string | null;
  nextStep?:          Step;
  showNavSub?:        boolean;
  eta:                Date | null;
  remainingDistanceM: number | null;
  distanceToNextStepM?: number | null;
  navStatus?:         string | null;
  stopsRemaining?:    number | null;
  arrivalSoonShown:   boolean;
  activeJourney:      any;
  onClearJourney:     () => void;
  bottomOffset?:      number;
  gpsLost?:           boolean;
  currentSpeedKph?:   number;
  wrongDirection?:    boolean;
  nextNextPreview?:   string | null;
  approachPhase?:     string | null;
  cameraHeading?:     number;
  onResetNorth:       () => void;
  headingUp?:         boolean;
  stepEta?:           Date | null;
  walkInstruction?:   string | null;
  walkDestination?:   string | null;
  /** User is near the boarding stop — offer the manual "I'm on board" trigger. */
  canBoardTransit?:   boolean;
  onBoardTransit?:    () => void;
  /** User appears to be inside a building (GPS accuracy heuristic). */
  isIndoor?:          boolean;
  /** Trip is paused (duka stop) — guidance frozen, journey intact. */
  paused?:            boolean;
  onResume?:          () => void;
  /** AR walking guidance available (walk legs during navigation). */
  showAR?:            boolean;
  onOpenAR?:          () => void;
}

function formatEta(date: Date): string {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function navDist(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Slides + fades its content in whenever `bannerKey` changes, so switching
 * between banner states (search → journey → nav → arrival…) feels like one
 * surface morphing instead of components popping in and out.
 */
function AnimatedBanner({ bannerKey, children }: { bannerKey: string; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(1)).current;
  const prevKey = useRef(bannerKey);

  useEffect(() => {
    if (prevKey.current === bannerKey) return;
    prevKey.current = bannerKey;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 9, tension: 70, useNativeDriver: true }).start();
  }, [bannerKey, anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Round action button with press-down scale feedback. */
function Fab({
  onPress, bg, small = false, children,
}: { onPress: () => void; bg: string; small?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.fab,
        small && s.layerFab,
        { backgroundColor: bg, transform: [{ scale: pressed ? 0.9 : 1 }], opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function MapFloatingUI({
  onRecenter, onOpenSearch, onOpenKwame,
  navigating, followMe, waitingForBus, onToggleNav,
  nextPreview, nextStep, showNavSub = true,
  eta, remainingDistanceM, distanceToNextStepM, navStatus, stopsRemaining,
  arrivalSoonShown, activeJourney, onClearJourney,
  bottomOffset = 0, gpsLost = false, currentSpeedKph, wrongDirection = false,
  onOpenReport, onOpenLayers,
  nextNextPreview, approachPhase, cameraHeading, onResetNorth, headingUp = false,
  stepEta, walkInstruction, walkDestination,
  canBoardTransit = false, onBoardTransit, isIndoor = false,
  paused = false, onResume,
  showAR = false, onOpenAR,
}: MapFloatingUIProps): JSX.Element {
  const insets = useSafeAreaInsets();

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const bottomAnim   = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (approachPhase !== "imminent") { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 380, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0,  duration: 380, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [approachPhase, pulseAnim]);

  useEffect(() => {
    Animated.spring(bottomAnim, {
      toValue: -bottomOffset,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
  }, [bottomOffset, bottomAnim]);

  // Maneuver progress: fills as the user closes the last PROGRESS_RANGE_M
  // toward the next maneuver (Waze-style anticipation cue).
  useEffect(() => {
    if (!navigating || distanceToNextStepM == null) { progressAnim.setValue(0); return; }
    const p = 1 - Math.min(PROGRESS_RANGE_M, Math.max(0, distanceToNextStepM)) / PROGRESS_RANGE_M;
    Animated.timing(progressAnim, { toValue: p, duration: 350, useNativeDriver: false }).start();
  }, [navigating, distanceToNextStepM, progressAnim]);

  const dark       = useColorScheme() === "dark";
  const cardBg     = dark ? "#1C1C1E" : WHITE;
  const textColor  = dark ? "#FFFFFF" : BLACK;
  const lightBg    = dark ? "#2C2C2E" : "#F2F2F7";

  // Current leg is a transit ride (not a walk): color the banner blue, Waze-style.
  const transitLeg = !walkInstruction && nextStep?.type != null && nextStep.type !== "WALK";
  const bannerBg   = transitLeg ? BLUE : ORANGE;

  const subText = (() => {
    if (stopsRemaining != null && stopsRemaining > 0) return `${stopsRemaining} stop${stopsRemaining === 1 ? "" : "s"} remaining`;
    if (showNavSub && remainingDistanceM != null) return `${mToNice(remainingDistanceM)} remaining`;
    return null;
  })();

  let bannerKey: string;
  let topContent: React.ReactNode;

  if (paused) {
    bannerKey = "paused";
    topContent = (
      <Pressable onPress={onResume} style={s.pausedBanner}>
        <View style={s.navIconBox}>
          <Ionicons name="pause" size={22} color={WHITE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction}>Trip paused</Text>
          <Text style={s.navSub}>Progress is frozen — tap to resume</Text>
        </View>
        <View style={s.resumePill}>
          <Ionicons name="play" size={14} color="#B45309" />
          <Text style={s.resumePillText}>Resume</Text>
        </View>
      </Pressable>
    );
  } else if (arrivalSoonShown) {
    bannerKey = "arrival";
    topContent = (
      <View style={[s.arrivalBanner, { backgroundColor: cardBg }]}>
        <Ionicons name="checkmark-circle" size={20} color={GREEN} />
        <Text style={s.arrivalText}>{"You've arrived!"}</Text>
      </View>
    );
  } else if (navigating && (navStatus === "off_route" || navStatus === "rerouting")) {
    const rerouting = navStatus === "rerouting";
    bannerKey = "offroute";
    topContent = (
      <View style={s.offRouteBanner}>
        <View style={s.navIconBox}>
          <MaterialIcons name={rerouting ? "autorenew" : "warning-amber"} size={24} color={WHITE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction} numberOfLines={1}>
            {rerouting ? "Recalculating…" : "Off route"}
          </Text>
          <Text style={s.navSub}>
            {rerouting ? "Finding a new route" : "Move back toward the route"}
          </Text>
        </View>
      </View>
    );
  } else if (wrongDirection && navigating) {
    bannerKey = "wrongdir";
    topContent = (
      <View style={s.offRouteBanner}>
        <View style={s.navIconBox}>
          <MaterialIcons name="u-turn-left" size={24} color={WHITE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction}>Wrong direction</Text>
          <Text style={s.navSub}>Turn around to get back on route</Text>
        </View>
      </View>
    );
  } else if (navigating && (walkInstruction || nextPreview)) {
    const isWalkSub = !!walkInstruction;
    const mainText  = isWalkSub ? walkInstruction! : nextPreview!;
    const iconName  = isWalkSub
      ? maneuverIcon(detectManeuver(walkInstruction!))
      : (nextStep ? stepIcon(nextStep.type) : "navigation");

    // Distance lives under the maneuver icon (Waze layout), not in the sentence.
    const showDistance = distanceToNextStepM != null && distanceToNextStepM > 15;

    const navSubText = isWalkSub
      ? (walkDestination ? `to ${walkDestination}` : subText)
      : subText;

    const displayEta = isWalkSub && stepEta ? stepEta : eta;

    bannerKey = transitLeg ? "nav-transit" : "nav-walk";
    topContent = (
      <View style={[s.navBanner, { backgroundColor: bannerBg }]}>
        <View style={s.navBannerRow}>
          <Animated.View style={[s.navIconCol, { transform: [{ scale: pulseAnim }] }]}>
            <View style={s.navIconBox}>
              <MaterialIcons name={iconName as any} size={28} color={WHITE} />
            </View>
            {showDistance && (
              <Text style={s.navIconDist}>{navDist(distanceToNextStepM!)}</Text>
            )}
          </Animated.View>

          <View style={{ flex: 1 }}>
            <Text style={s.navInstruction} numberOfLines={2}>{mainText}</Text>
            {navSubText && <Text style={s.navSub} numberOfLines={1}>{navSubText}</Text>}

            {nextNextPreview && (
              <View style={s.thenChip}>
                <MaterialIcons name="subdirectory-arrow-right" size={14} color="rgba(255,255,255,0.70)" />
                <Text style={s.thenText} numberOfLines={1}>then {nextNextPreview}</Text>
              </View>
            )}
          </View>

          <View style={s.navEtaContainer}>
            <Pressable
              onPress={onOpenKwame}
              style={({ pressed }) => [s.navKwamePill, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="sparkles" size={12} color={bannerBg} />
              <Text style={[s.navKwamePillText, { color: bannerBg }]}>AI</Text>
            </Pressable>
            {displayEta && <Text style={s.navEta}>{formatEta(displayEta)}</Text>}
          </View>
        </View>

        {/* Approach progress toward the next maneuver */}
        <View style={s.progressTrack}>
          <Animated.View
            style={[
              s.progressFill,
              { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
            ]}
          />
        </View>
      </View>
    );
  } else if (waitingForBus && activeJourney) {
    const seg       = activeJourney.route?.segments?.find((s: any) => s.mode !== "WALK");
    const routeName = seg?.route_name ?? "";
    const boardStop = seg?.from?.name ?? "boarding stop";
    bannerKey = "waiting";
    topContent = (
      <View style={[s.journeyBanner, { backgroundColor: cardBg }]}>
        <MaterialIcons name="directions-bus" size={24} color={BLUE} />
        <View style={{ flex: 1 }}>
          <Text style={[s.journeyText, { color: textColor }]} numberOfLines={1}>
            Waiting for Line {routeName}
          </Text>
          <Text style={[s.waitingSub, { color: GREY }]} numberOfLines={1}>At {boardStop}</Text>
        </View>
        <Pressable onPress={onClearJourney} hitSlop={12} style={[s.bannerClose, { backgroundColor: lightBg }]}>
          <Ionicons name="close" size={15} color={GREY} />
        </Pressable>
      </View>
    );
  } else if (activeJourney) {
    bannerKey = "journey";
    topContent = (
      <View style={[s.journeyBanner, { backgroundColor: cardBg }]}>
        <MaterialIcons name="place" size={24} color={ORANGE} />
        <Text style={[s.journeyText, { color: textColor }]} numberOfLines={1}>
          To {activeJourney.toLoc.name}
        </Text>
        <Pressable onPress={onClearJourney} hitSlop={12} style={[s.bannerClose, { backgroundColor: lightBg }]}>
          <Ionicons name="close" size={15} color={GREY} />
        </Pressable>
      </View>
    );
  } else {
    bannerKey = "search";
    topContent = (
      <View style={[s.searchBar, { backgroundColor: cardBg }]}>
        <Pressable style={s.searchTouchable} onPress={onOpenSearch}>
          <Ionicons name="search" size={20} color={dark ? "#A0A0A5" : "#666"} />
          <Text style={[s.searchPlaceholder, { color: dark ? "#A0A0A5" : "#666" }]}>Search destination...</Text>
        </Pressable>

        <View style={[s.searchDivider, { backgroundColor: dark ? "#333" : "#E5E5EA" }]} />

        <Pressable
          onPress={onOpenKwame}
          hitSlop={10}
          style={({ pressed }) => [s.searchKwameBtn, pressed && { transform: [{ scale: 0.88 }] }]}
        >
          <Ionicons name="sparkles" size={22} color={ORANGE} />
        </Pressable>
      </View>
    );
  }

  const cameraUnlocked = navigating && !followMe;
  const isRotated = Math.abs(cameraHeading ?? 0) > 5;

  let actionIcon: keyof typeof Ionicons.glyphMap = "locate";
  let actionColor = ORANGE;
  let actionBg = cardBg;
  let actionHandler = onRecenter;

  if (navigating) {
    if (cameraUnlocked) {
      // Camera has been unlocked by a user gesture — tap to re-engage follow.
      actionIcon = "locate";
      actionColor = WHITE;
      actionBg = BLUE;
      actionHandler = onRecenter;
    } else {
      // Following — tap to toggle course-up (FPV) ↔ north-up.
      actionIcon = headingUp ? "compass" : "navigate";
      actionColor = BLUE;
      actionBg = cardBg;
      actionHandler = onResetNorth;
    }
  } else {
    if (isRotated && !followMe) {
      actionIcon = "compass-outline";
      actionColor = ORANGE;
      actionBg = cardBg;
      actionHandler = onResetNorth;
    } else {
      actionIcon = followMe ? "locate" : "locate-outline";
      actionColor = followMe ? BLUE : ORANGE;
      actionBg = cardBg;
      actionHandler = onRecenter;
    }
  }

  return (
    <>
      <View style={[s.topArea, { paddingTop: (insets.top || 44) + 8 }]}>
        <AnimatedBanner bannerKey={bannerKey}>
          {topContent}
        </AnimatedBanner>

        {!navigating && (
          <View style={s.layersContainer}>
            <Fab onPress={onOpenLayers} bg={cardBg} small>
              <Ionicons name="layers" size={20} color={ORANGE} />
            </Fab>
          </View>
        )}
      </View>

      {/* Indoor mini-map card (left side, mirrors the FAB stack) — taps into
          AR guidance, which is exactly what helps when GPS degrades indoors. */}
      {isIndoor && (
        <Animated.View
          style={[
            s.indoorCard,
            {
              backgroundColor: cardBg,
              bottom: (insets.bottom || 0) + 36,
              transform: [{ translateY: bottomAnim }],
            },
          ]}
        >
          <Pressable onPress={onOpenAR} disabled={!onOpenAR} style={{ alignItems: "center" }}>
            <View style={s.indoorGrid}>
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={i} style={[s.indoorCell, { borderColor: lightBg }]} />
              ))}
              <View style={s.indoorDot} />
            </View>
            <View style={s.indoorLabelRow}>
              <Ionicons name="business-outline" size={11} color={GREY} />
              <Text style={s.indoorLabel}>Indoor</Text>
            </View>
            <Text style={s.indoorSub}>{onOpenAR ? "Tap for AR view" : "AR view soon"}</Text>
          </Pressable>
        </Animated.View>
      )}

      <Animated.View
        style={[
          s.bottomRightStack,
          {
            bottom: (insets.bottom || 0) + 36,
            transform: [{ translateY: bottomAnim }],
          },
        ]}
      >
        {canBoardTransit && onBoardTransit && (
          <Pressable
            onPress={onBoardTransit}
            style={({ pressed }) => [s.boardPill, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <MaterialIcons name="directions-bus" size={18} color={WHITE} />
            <Text style={s.boardPillText}>{"I'm on board"}</Text>
          </Pressable>
        )}

        {showAR && onOpenAR && (
          <Fab onPress={onOpenAR} bg={cardBg}>
            <MaterialIcons name="view-in-ar" size={22} color={ORANGE} />
          </Fab>
        )}

        {gpsLost && navigating && (
          <View style={s.gpsLostPill}>
            <Ionicons name="warning-outline" size={12} color={WHITE} />
            <Text style={s.gpsLostText}>GPS lost</Text>
          </View>
        )}

        {navigating && currentSpeedKph != null && currentSpeedKph > 1 && (
          <View style={[s.speedPill, { backgroundColor: cardBg }]}>
            <Text style={[s.speedVal, { color: textColor }]}>{currentSpeedKph}</Text>
            <Text style={s.speedUnit}>km/h</Text>
          </View>
        )}

        <Fab onPress={onOpenReport} bg={cardBg}>
          <Ionicons name="warning" size={22} color={ORANGE} />
        </Fab>

        <Fab onPress={actionHandler} bg={actionBg}>
          <Ionicons name={actionIcon} size={24} color={actionColor} />
          {cameraUnlocked && <View style={s.unlockedDot} />}
        </Fab>
      </Animated.View>
    </>
  );
}

const mapShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
} as const;

const s = StyleSheet.create({
  topArea:           { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },

  searchBar:         { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, minHeight: 52, ...mapShadow },
  searchTouchable:   { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  searchPlaceholder: { fontSize: 16, fontWeight: "400" },
  searchDivider:     { width: 1, height: 24, marginHorizontal: 10 },
  searchKwameBtn:    { padding: 4 },

  layersContainer:   { alignItems: "flex-end", marginTop: 12 },

  journeyBanner:     { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, ...mapShadow },
  journeyText:       { flex: 1, fontSize: 16, fontWeight: "600" },
  bannerClose:       { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  navBanner:         { borderRadius: 16, overflow: "hidden", ...mapShadow },
  navBannerRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  offRouteBanner:    { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: RED, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, ...mapShadow },
  navIconCol:        { alignItems: "center", gap: 3 },
  navIconBox:        { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  navIconDist:       { color: WHITE, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  navInstruction:    { color: WHITE, fontSize: 16, fontWeight: "700" },
  navSub:            { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2, fontWeight: "500" },
  navEta:            { color: WHITE, fontSize: 15, fontWeight: "700", flexShrink: 0 },

  navEtaContainer:   { alignItems: "flex-end", justifyContent: "center", gap: 6 },
  navKwamePill:      { flexDirection: "row", alignItems: "center", backgroundColor: WHITE, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  navKwamePillText:  { fontSize: 10, fontWeight: "800" },

  progressTrack:     { height: 3, backgroundColor: "rgba(255,255,255,0.22)" },
  progressFill:      { height: 3, backgroundColor: WHITE, borderTopRightRadius: 2, borderBottomRightRadius: 2 },

  arrivalBanner:     { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20, ...mapShadow },
  arrivalText:       { fontSize: 16, fontWeight: "700", color: GREEN },
  waitingSub:        { fontSize: 12, marginTop: 1 },

  bottomRightStack:  { position: "absolute", right: 16, alignItems: "flex-end", gap: 12, zIndex: 15 },
  fab:               { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", ...mapShadow },
  layerFab:          { width: 44, height: 44, borderRadius: 12 },

  boardPill:         { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: BLUE, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, ...mapShadow },
  boardPillText:     { color: WHITE, fontSize: 14, fontWeight: "800" },

  pausedBanner:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F59E0B", borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, ...mapShadow },
  resumePill:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: WHITE, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  resumePillText:    { color: "#B45309", fontSize: 13, fontWeight: "800" },

  indoorCard:        { position: "absolute", left: 16, width: 92, borderRadius: 18, padding: 8, alignItems: "center", zIndex: 15, ...mapShadow },
  indoorGrid:        { width: 74, height: 56, flexDirection: "row", flexWrap: "wrap", borderRadius: 10, overflow: "hidden", backgroundColor: "rgba(142,142,147,0.10)" },
  indoorCell:        { width: "33.33%", height: "33.33%", borderWidth: StyleSheet.hairlineWidth },
  indoorDot:         { position: "absolute", top: 24, left: 34, width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE, borderWidth: 1.5, borderColor: WHITE },
  indoorLabelRow:    { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  indoorLabel:       { fontSize: 11, fontWeight: "700", color: GREY },
  indoorSub:         { fontSize: 9, color: GREY, marginTop: 1 },

  unlockedDot:       { position: "absolute", top: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE, borderWidth: 2, borderColor: WHITE },
  gpsLostPill:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, ...mapShadow },
  gpsLostText:       { color: WHITE, fontSize: 11, fontWeight: "600" },
  speedPill:         { alignItems: "center", borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, ...mapShadow },
  speedVal:          { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  speedUnit:         { fontSize: 10, color: GREY, fontWeight: "500", marginTop: -1 },
  thenChip:          { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  thenText:          { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
});
