// components/app/MapFloatingUI.tsx
import { Step, mToNice, stepIcon } from "@/utils/mapHelpers";
import React, { JSX, useRef } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const RED    = "#FF3B30";
const BLACK  = "#1C1C1E";
const GREY   = "#8E8E93";
const WHITE  = "#FFFFFF";
const BLUE   = "#007AFF";
const GREEN  = "#34C759";

interface MapFloatingUIProps {
  onRecenter: () => void;
  onOpenSearch: () => void;
  onOpenKwame: () => void;
  onOpenReport: () => void;
  navigating: boolean;
  followMe: boolean;
  waitingForBus: boolean;
  onToggleNav: () => void;
  nextPreview: string | null;
  nextStep?: Step;
  showNavSub?: boolean;
  eta: Date | null;
  remainingDistanceM: number | null;
  distanceToNextStepM?: number | null;
  navStatus?: string | null;
  stopsRemaining?: number | null;
  arrivalSoonShown: boolean;
  activeJourney: any;
  onClearJourney: () => void;
  bottomOffset?: number;
  gpsLost?: boolean;
  currentSpeedKph?: number;
  wrongDirection?: boolean;
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

export default function MapFloatingUI({
  onRecenter, onOpenSearch, onOpenKwame,
  navigating, followMe, waitingForBus, onToggleNav,
  nextPreview, nextStep, showNavSub = true,
  eta, remainingDistanceM, distanceToNextStepM, navStatus, stopsRemaining,
  arrivalSoonShown, activeJourney, onClearJourney,
  bottomOffset = 0, gpsLost = false, currentSpeedKph, wrongDirection = false,
  onOpenReport,
}: MapFloatingUIProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const lastTap = useRef(0);
  const dark = useColorScheme() === "dark";
  const cardBg = dark ? "#1C1C1E" : WHITE;
  const textColor = dark ? "#FFFFFF" : BLACK;
  const lightBg = dark ? "#2C2C2E" : "#F2F2F7";
  const softOrange = dark ? "rgba(255,111,0,0.18)" : "#FFF3E0";

  const handleNavBtn = () => {
    const now = Date.now();
    if (now - lastTap.current <= 400) {
      onToggleNav();
      lastTap.current = 0;
    } else {
      onRecenter();
      lastTap.current = now;
    }
  };

  const showCountdown = distanceToNextStepM != null && distanceToNextStepM > 40;
  const instructionText = nextPreview ? showCountdown ? `In ${navDist(distanceToNextStepM!)}, ${nextPreview}` : nextPreview : null;

  const subText = (() => {
    if (stopsRemaining != null && stopsRemaining > 0) return `${stopsRemaining} stop${stopsRemaining === 1 ? "" : "s"} remaining`;
    if (showNavSub && remainingDistanceM != null) return `${mToNice(remainingDistanceM)} remaining`;
    return null;
  })();

  let topContent: React.ReactNode;

  if (arrivalSoonShown) {
    topContent = (
      <View style={[s.arrivalBanner, { backgroundColor: cardBg }]}>
        <Icon name="checkmark-circle" size={20} color={GREEN} />
        <Text style={s.arrivalText}>{"You've arrived!"}</Text>
      </View>
    );
  } else if (navigating && (navStatus === "off_route" || navStatus === "rerouting")) {
    const rerouting = navStatus === "rerouting";
    topContent = (
      <View style={s.offRouteBanner}>
        <View style={s.navIconBox}>
          <Icon name={rerouting ? "refresh" : "warning"} size={20} color={WHITE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction} numberOfLines={1}>{rerouting ? "Recalculating…" : "Off route"}</Text>
          <Text style={s.navSub}>{rerouting ? "Finding a new route" : "Move back toward the route"}</Text>
        </View>
      </View>
    );
  } else if (wrongDirection && navigating) {
    topContent = (
      <View style={s.offRouteBanner}>
        <View style={s.navIconBox}><Icon name="arrow-back-circle" size={20} color={WHITE} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction}>Wrong direction</Text>
          <Text style={s.navSub}>Turn around to get back on route</Text>
        </View>
      </View>
    );
  } else if (navigating && instructionText) {
    topContent = (
      <View style={s.navBanner}>
        <View style={s.navIconBox}><Icon name={nextStep ? stepIcon(nextStep.type) : "navigate"} size={20} color={WHITE} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.navInstruction} numberOfLines={1}>{instructionText}</Text>
          {subText && <Text style={s.navSub}>{subText}</Text>}
        </View>
        {eta && <Text style={s.navEta}>{formatEta(eta)}</Text>}
      </View>
    );
  } else if (waitingForBus && activeJourney) {
    const seg = activeJourney.route?.segments?.find((s: any) => s.mode !== "WALK");
    topContent = (
      <View style={[s.journeyBanner, { backgroundColor: cardBg }]}>
        <Icon name="time-outline" size={20} color={BLUE} />
        <View style={{ flex: 1 }}>
          <Text style={[s.journeyText, { color: textColor }]} numberOfLines={1}>Waiting for Line {seg?.route_name}</Text>
          <Text style={[s.waitingSub, { color: GREY }]} numberOfLines={1}>At {seg?.from?.name}</Text>
        </View>
        <Pressable onPress={onClearJourney} hitSlop={12} style={[s.bannerClose, { backgroundColor: lightBg }]}><Icon name="close" size={15} color={GREY} /></Pressable>
      </View>
    );
  } else if (activeJourney) {
    topContent = (
      <View style={[s.journeyBanner, { backgroundColor: cardBg }]}>
        <Icon name="navigate-circle" size={20} color={ORANGE} />
        <Text style={[s.journeyText, { color: textColor }]} numberOfLines={1}>To {activeJourney.toLoc.name}</Text>
        <Pressable onPress={onClearJourney} hitSlop={12} style={[s.bannerClose, { backgroundColor: lightBg }]}><Icon name="close" size={15} color={GREY} /></Pressable>
      </View>
    );
  } else {
    topContent = (
      <Pressable style={[s.searchBar, { backgroundColor: cardBg }]} onPress={onOpenSearch}>
        <View style={s.searchTouchable}>
          <Icon name="search" size={18} color={GREY} />
          <Text style={s.searchPlaceholder}>{"Search destination…"}</Text>
        </View>
        <Pressable onPress={onOpenKwame} style={[s.kwameChip, { backgroundColor: softOrange }]}>
          <Icon name="sparkles" size={14} color={ORANGE} />
          <Text style={s.kwameChipText}>AI</Text>
        </Pressable>
      </Pressable>
    );
  }

  const cameraUnlocked = navigating && !followMe;

  return (
    <>
      <View style={[s.topArea, { paddingTop: (insets.top || 44) + 8 }]}>
        {topContent}
      </View>

      {/* Top Right Floating Stack */}
      <View style={[s.topRightStack, { top: (insets.top || 44) + 16 }]}>
        <Pressable onPress={onOpenReport} style={[s.navBtn, { backgroundColor: cardBg }]}>
          <Icon name="megaphone-outline" size={22} color={RED} />
        </Pressable>
        <Pressable onPress={onOpenKwame} style={[s.navBtn, { backgroundColor: cardBg }]}>
          <Icon name="sparkles" size={22} color={ORANGE} />
        </Pressable>
      </View>

      {/* Bottom Stack: Only Recenter & Status Pills */}
      <View style={[s.stack, { bottom: (insets.bottom || 0) + 36 + bottomOffset }]}>
        {gpsLost && navigating && (
          <View style={s.gpsLostPill}><Icon name="warning-outline" size={12} color={WHITE} /><Text style={s.gpsLostText}>GPS lost</Text></View>
        )}
        {navigating && currentSpeedKph != null && currentSpeedKph > 1 && (
          <View style={[s.speedPill, { backgroundColor: cardBg }]}><Text style={[s.speedVal, { color: textColor }]}>{currentSpeedKph}</Text><Text style={s.speedUnit}>km/h</Text></View>
        )}
        <Pressable onPress={handleNavBtn} style={[s.navBtn, { backgroundColor: cameraUnlocked ? BLUE : cardBg }]}>
          <Icon name={cameraUnlocked ? "locate" : navigating ? "compass" : "navigate"} size={22} color={cameraUnlocked ? WHITE : navigating ? BLUE : ORANGE} />
        </Pressable>
        {cameraUnlocked && <View style={s.unlockedDot} />}
      </View>
    </>
  );
}

const mapShadow = { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 } as const;

const s = StyleSheet.create({
  topArea: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  topRightStack: { position: "absolute", right: 16, zIndex: 15, gap: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, ...mapShadow },
  searchPlaceholder: { flex: 1, fontSize: 16, color: GREY, fontWeight: "400" },
  searchTouchable: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  kwameChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  kwameChipText: { fontSize: 12, fontWeight: "700", color: ORANGE },
  journeyBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, ...mapShadow },
  journeyText: { flex: 1, fontSize: 16, fontWeight: "600" },
  bannerClose: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  navBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: ORANGE, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, ...mapShadow },
  offRouteBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: RED, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, ...mapShadow },
  navIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  navInstruction: { color: WHITE, fontSize: 15, fontWeight: "600" },
  navSub: { color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 },
  navEta: { color: WHITE, fontSize: 15, fontWeight: "700", flexShrink: 0 },
  arrivalBanner: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20, ...mapShadow },
  arrivalText: { fontSize: 16, fontWeight: "700", color: GREEN },
  waitingSub: { fontSize: 12, marginTop: 1 },
  stack: { position: "absolute", right: 16, alignItems: "center", gap: 12, zIndex: 5 },
  navBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", ...mapShadow },
  unlockedDot: { position: "absolute", top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE, borderWidth: 2, borderColor: WHITE },
  gpsLostPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  gpsLostText: { color: WHITE, fontSize: 11, fontWeight: "600" },
  speedPill: { alignItems: "center", borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, ...mapShadow },
  speedVal: { fontSize: 15, fontWeight: "700" },
  speedUnit: { fontSize: 10, color: GREY, fontWeight: "500", marginTop: -1 },
});