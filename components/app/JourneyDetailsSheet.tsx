// components/app/JourneyDetailsSheet.tsx
import { formatDist, usePrefsStore } from "@/store/prefsStore";
import { extractFares, formatDurationParts } from "@/utils/mapHelpers";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

const ORANGE = "#FF6F00";
const BLACK = "#111827";
const GREY = "#6B7280";
const LIGHT_GREY = "#F3F4F6";
const BORDER = "#E5E7EB";
const BG = "#FFFFFF";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MAX_Y = SCREEN_HEIGHT * 0.08;
const MID_Y = SCREEN_HEIGHT * 0.42;
const MIN_Y = SCREEN_HEIGHT - 300;

function arrivalTime(secs: number): string {
  return new Date(Date.now() + secs * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface JourneyDetailsSheetProps {
  activeJourney: any;
  routeLoading: boolean;
  routeInfo: any;
  navigating: boolean;
  paused?: boolean;
  onPauseToggle?: () => void;
  onPreview?: () => void;
  onToggleNav: (start: boolean) => void;
  onClose: () => void;
  mToNice: (m: number) => string;
  sToMin: (s: number) => string;
  isSaved?: boolean;
  onSave?: (label?: string) => Promise<void>;
  onUnsave?: () => Promise<void>;
  children?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  eta?: Date | null;
  remainingDistanceM?: number | null;
}

export default function JourneyDetailsSheet({
  activeJourney,
  routeLoading,
  routeInfo,
  navigating,
  paused = false,
  onPauseToggle,
  onPreview,
  onToggleNav,
  onClose,
  isSaved = false,
  onSave,
  onUnsave,
  children,
  scrollRef,
  remainingDistanceM = null,
}: JourneyDetailsSheetProps): React.JSX.Element | null {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const lastY = useRef(MIN_Y);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const navAnchorRef = useRef<{ initialDistM: number; durationS: number } | null>(
    null
  );
  useEffect(() => {
    if (
      navigating &&
      routeInfo &&
      remainingDistanceM != null &&
      !navAnchorRef.current
    ) {
      navAnchorRef.current = {
        initialDistM: remainingDistanceM,
        durationS: routeInfo.duration,
      };
    } else if (!navigating) {
      navAnchorRef.current = null;
    }
  }, [navigating, routeInfo, remainingDistanceM]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!navigating) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [navigating]);

  const dark = useColorScheme() === "dark";
  const { prefs } = usePrefsStore();
  const C = {
    bg: dark ? "#18181B" : BG,
    text: dark ? "#F9FAFB" : BLACK,
    sub: dark ? "#9CA3AF" : GREY,
    light: dark ? "#27272A" : LIGHT_GREY,
    border: dark ? "#27272A" : BORDER,
    handle: dark ? "#52525B" : "#CBD5E1",
  };

  const snapTo = (target: number, isExp: boolean) => {
    Animated.spring(translateY, {
      toValue: target,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
    lastY.current = target;
    setExpanded(isExp);
  };

  const handleClose = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 240,
      useNativeDriver: true,
    }).start(onClose);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        translateY.setValue(Math.max(MAX_Y, lastY.current + g.dy));
      },
      onPanResponderRelease: (_, g) => {
        const destY = lastY.current + g.dy;
        if (g.vy < -0.5 || g.dy < -50) {
          if (lastY.current > MID_Y + 20) snapTo(MID_Y, true);
          else snapTo(MAX_Y, true);
        } else if (g.vy > 0.5 || g.dy > 50) {
          if (lastY.current < MID_Y - 20) snapTo(MID_Y, true);
          else snapTo(MIN_Y, false);
        } else {
          const dMax = Math.abs(destY - MAX_Y);
          const dMid = Math.abs(destY - MID_Y);
          const dMin = Math.abs(destY - MIN_Y);
          if (dMax <= dMid && dMax <= dMin) snapTo(MAX_Y, true);
          else if (dMid <= dMax && dMid <= dMin) snapTo(MID_Y, true);
          else snapTo(MIN_Y, false);
        }
      },
    })
  ).current;

  useEffect(() => {
    if (activeJourney) snapTo(MIN_Y, false);
  }, [activeJourney]);

  if (!activeJourney) return null;

  const segs: any[] = activeJourney.route?.segments ?? [];
  const transitSegs = segs.filter((seg) => seg.mode !== "WALK");
  const transfers = Math.max(0, transitSegs.length - 1);
  const fare = prefs.showFares ? extractFares(segs) : null;
  const totalDistStr = routeInfo?.distance
    ? formatDist(routeInfo.distance, prefs.units)
    : null;
  const walkDistM = activeJourney.route?.total_walk_distance ?? 0;
  const walkDistStr =
    walkDistM > 0 ? formatDist(walkDistM, prefs.units) : null;

  const handleShare = async () => {
    const from = activeJourney.fromLoc;
    const to = activeJourney.toLoc;
    const fName = encodeURIComponent(from?.name || "Origin");
    const tName = encodeURIComponent(to?.name || "Destination");
    const url = `https://navigo.co.ke/route?fLat=${from.lat}&fLng=${from.lng}&tLat=${to.lat}&tLng=${to.lng}&fName=${fName}&tName=${tName}`;
    try {
      await Share.share({
        message: `Check out this route to ${
          to?.name || "your destination"
        } on Navigo:\n\n${url}`,
        title: "Shared Route",
      });
    } catch {}
  };

  const anchor = navAnchorRef.current;
  const liveRemainS =
    navigating &&
    anchor &&
    remainingDistanceM != null &&
    anchor.initialDistM > 0
      ? Math.round(
          anchor.durationS *
            Math.max(0, remainingDistanceM / anchor.initialDistM)
        )
      : null;

  const activeDurationS = liveRemainS ?? routeInfo?.duration ?? 0;
  const durParts = formatDurationParts(activeDurationS);

  const routeChainLabel =
    transitSegs.length > 0
      ? transitSegs
          .map((s) => s.route_name || s.mode_badge || "Transit")
          .join(" → ")
      : "Walk only";

  return (
    <Animated.View
      style={[
        s.panel,
        {
          backgroundColor: C.bg,
          height: SCREEN_HEIGHT - MAX_Y,
          transform: [{ translateY }],
        },
      ]}
    >
      <View {...panResponder.panHandlers}>
        <View style={s.handleWrap}>
          <View style={[s.handle, { backgroundColor: C.handle }]} />
        </View>

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            {routeLoading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color={ORANGE} />
                <Text style={s.loadingText}>Finding optimal route…</Text>
              </View>
            ) : (
              <>
                <View style={s.timeTitleRow}>
                  <Text style={[s.timeText, { color: C.text }]}>
                    {durParts.hours > 0 && (
                      <>
                        {durParts.hours}
                        <Text style={s.timeUnitText}>hr </Text>
                      </>
                    )}
                    {durParts.minutes > 0 || durParts.hours === 0 ? (
                      <>
                        {durParts.minutes}
                        <Text style={s.timeUnitText}>min</Text>
                      </>
                    ) : null}
                  </Text>

                  {fare?.found && (
                    <View style={s.farePill}>
                      <Text style={s.farePillText}>
                        {fare.confidence === "zone" ? "~" : ""}
                        {fare.currency} {fare.total}
                      </Text>
                    </View>
                  )}
                </View>

                {routeInfo && (
                  <Text style={[s.arrivalText, { color: C.sub }]}>
                    Arrive at{" "}
                    {liveRemainS != null
                      ? new Date(
                          Date.now() + liveRemainS * 1_000
                        ).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : arrivalTime(routeInfo.duration)}
                    {totalDistStr ? `  ·  ${totalDistStr}` : ""}
                  </Text>
                )}
              </>
            )}
          </View>

          {onPreview && !navigating && (
            <Pressable
              onPress={onPreview}
              hitSlop={12}
              style={[s.closeBtn, { backgroundColor: C.light }]}
              accessibilityLabel="Fly-through route preview"
            >
              <Ionicons name="play" size={15} color={ORANGE} />
            </Pressable>
          )}

          {navigating && onPauseToggle && (
            <Pressable
              onPress={onPauseToggle}
              hitSlop={12}
              style={[
                s.closeBtn,
                {
                  backgroundColor: paused
                    ? "rgba(245,158,11,0.14)"
                    : C.light,
                  borderWidth: paused ? 1 : 0,
                  borderColor: paused ? "#F59E0B" : "transparent",
                },
              ]}
            >
              <Ionicons
                name={paused ? "play" : "pause"}
                size={16}
                color={paused ? "#F59E0B" : C.text}
              />
            </Pressable>
          )}

          <Pressable
            onPress={handleClose}
            hitSlop={16}
            style={[s.closeBtn, { backgroundColor: C.light }]}
          >
            <Ionicons name="close" size={17} color={C.text} />
          </Pressable>
        </View>

        {/* Minimalist Summary Line above Start Navigation */}
        {!routeLoading && segs.length > 0 && (
          <View style={s.minimalMetaRow}>
            <View style={[s.minimalPill, { backgroundColor: C.light }]}>
              <Ionicons
                name={transitSegs.length > 0 ? "bus-outline" : "walk-outline"}
                size={13}
                color={ORANGE}
              />
              <Text
                style={[s.minimalPillText, { color: C.text }]}
                numberOfLines={1}
              >
                {routeChainLabel}
              </Text>
            </View>

            {transitSegs.length > 0 && (
              <Text style={[s.minimalDotText, { color: C.sub }]}>
                {transfers === 0
                  ? "Direct"
                  : `${transfers} transfer${transfers > 1 ? "s" : ""}`}
              </Text>
            )}

            {walkDistStr && (
              <Text style={[s.minimalDotText, { color: C.sub }]}>
                · {walkDistStr} walk
              </Text>
            )}
          </View>
        )}

        <View style={s.actionBar}>
          <Pressable
            style={({ pressed }) => [
              s.startBtn,
              {
                backgroundColor: navigating ? "#EF4444" : ORANGE,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
            onPress={() => onToggleNav(!navigating)}
          >
            <Ionicons
              name={navigating ? "stop-circle-outline" : "navigate"}
              size={17}
              color="#fff"
            />
            <Text style={s.startBtnText}>
              {navigating ? "End Navigation" : "Start Navigation"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.saveBtn,
              {
                borderColor: isSaved ? ORANGE : C.border,
                backgroundColor: isSaved
                  ? "rgba(255,111,0,0.1)"
                  : "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={async () => {
              if (saving) return;
              if (isSaved) {
                setSaving(true);
                try {
                  await onUnsave?.();
                } finally {
                  setSaving(false);
                }
              } else if (Platform.OS === "ios") {
                Alert.prompt(
                  "Save journey",
                  'Add an optional label (e.g. "Work commute")',
                  async (label: string) => {
                    setSaving(true);
                    try {
                      await onSave?.(label?.trim() || undefined);
                    } finally {
                      setSaving(false);
                    }
                  },
                  "plain-text",
                  ""
                );
              } else {
                setSaving(true);
                try {
                  await onSave?.();
                } finally {
                  setSaving(false);
                }
              }
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={ORANGE} />
            ) : (
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={16}
                color={ORANGE}
              />
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.saveBtn,
              {
                borderColor: C.border,
                backgroundColor: "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={16} color={GREY} />
          </Pressable>
        </View>

        <View style={[s.divider, { backgroundColor: C.border }]} />
      </View>

      <View style={s.scroll}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={expanded}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          bounces={false}
          style={{ flex: 1 }}
        >
          {children}

          <Pressable
            style={({ pressed }) => [
              s.mapsLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={() => {
              const { lat, lng } = activeJourney.toLoc;
              const name = encodeURIComponent(activeJourney.toLoc.name ?? "");
              let url: string;
              switch (prefs.mapApp) {
                case "google":
                  url = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`;
                  break;
                case "apple":
                  url = `maps://?daddr=${lat},${lng}`;
                  break;
                case "waze":
                  url = `waze://?ll=${lat},${lng}&navigate=yes`;
                  break;
                default:
                  url =
                    Platform.OS === "ios"
                      ? `maps://?daddr=${lat},${lng}&q=${name}`
                      : `geo:${lat},${lng}?q=${name}`;
              }
              Linking.canOpenURL(url).then((can) => {
                if (can) Linking.openURL(url);
                else {
                  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
                  Linking.openURL(web);
                }
              });
            }}
          >
            <Ionicons name="map-outline" size={14} color={GREY} />
            <Text style={s.mapsLinkText}>
              Open walking directions in{" "}
              {prefs.mapApp === "system"
                ? "Maps"
                : prefs.mapApp === "google"
                ? "Google Maps"
                : prefs.mapApp === "apple"
                ? "Apple Maps"
                : "Waze"}
            </Text>
            <Ionicons name="open-outline" size={13} color={GREY} />
          </Pressable>
        </ScrollView>

        {!expanded && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => snapTo(MID_Y, true)}
          />
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 22,
    zIndex: 20,
    flexDirection: "column",
    overflow: "hidden",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  timeTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  timeText: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  timeUnitText: {
    fontSize: 18,
    fontWeight: "600",
  },
  farePill: {
    backgroundColor: "rgba(255, 111, 0, 0.12)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  farePillText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "700",
  },
  arrivalText: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: "500",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 15,
    color: GREY,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  minimalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  minimalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "65%",
  },
  minimalPillText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  minimalDotText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  startBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 46,
    borderRadius: 14,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  saveBtn: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 120,
  },
  mapsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  mapsLinkText: {
    fontSize: 12,
    color: GREY,
    textAlign: "center",
  },
});