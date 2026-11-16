// components/map/IntermStopInfoCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { IntermediateStop } from "@/components/map/types";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  floatAboveSheet,
  setSheetAccessoryHeight,
  useSheetTop,
  useTopUiBottom,
} from "@/components/app/mapSheetInsets";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StopService, type StopDeparturesResponse } from "@/services/stop";
import { formatEta } from "@/utils/mapHelpers";
import { departureMeta } from "@/utils/departures";

interface IntermStopInfoCardProps {
  stop: IntermediateStop;
  onClose: () => void;
  onInspectStop?: (stop: {
    id: string;
    name: string;
    lat: number;
    lng: number;
  }) => void;
  dark: boolean;
}

export function IntermStopInfoCard({
  stop,
  onClose,
  onInspectStop,
  dark,
}: IntermStopInfoCardProps) {
  const router = useRouter();
  const [board, setBoard] = useState<StopDeparturesResponse | null>(null);

  useEffect(() => {
    let active = true;
    const rawStopId = (stop as any).stop_id;
    if (rawStopId) {
      StopService.getStopDepartures(rawStopId)
        .then((res) => {
          if (active) setBoard(res);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [stop]);

  const bg = dark ? "#18181B" : "#FFFFFF";
  const border = dark ? "#27272A" : "#E5E7EB";
  const text = dark ? "#F9FAFB" : "#111827";
  const sub = dark ? "#9CA3AF" : "#6B7280";
  const pillBg = dark ? "#27272A" : "#F3F4F6";

  const matchedRoute = board?.routes?.find(
    (r) => r.route_short_name === stop.routeName
  ) ?? board?.routes?.[0];
  const nextArrival = matchedRoute?.arrivals?.[0];

  // Ride on top of the journey sheet wherever it is dragged, instead of a
  // fixed offset that only matched the sheet's peek height.
  const insets = useSafeAreaInsets();
  const sheetTop = useSheetTop();
  const topUi = useTopUiBottom();
  const [cardH, setCardH] = useState(150);
  const float = useMemo(
    () =>
      floatAboveSheet(sheetTop, {
        height: cardH,
        restTop: WINDOW_H - 356 - cardH,
        minTop: (topUi || insets.top + 120) + 8,
        gap: CARD_GAP,
      }),
    [sheetTop, cardH, topUi, insets.top]
  );

  // Reserve our height so the floating map buttons stack above this card.
  useEffect(() => {
    setSheetAccessoryHeight(cardH + CARD_GAP);
    return () => setSheetAccessoryHeight(0);
  }, [cardH]);

  return (
    <Animated.View
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0) setCardH(h);
      }}
      style={[
        s.card,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: float.opacity,
          transform: [{ translateY: float.translateY }],
        },
      ]}
    >
      <View style={s.cardInner}>
        {/* Top Row: Route Pill + Live Arrival Countdown + Close */}
        <View style={s.topRow}>
          <View style={s.badgeGroup}>
            <View
              style={[
                s.chip,
                {
                  backgroundColor: stop.color + "18",
                  borderColor: stop.color + "55",
                },
              ]}
            >
              <View style={[s.chipDot, { backgroundColor: stop.color }]} />
              <Text style={[s.chipText, { color: stop.color }]}>
                Line {stop.routeName || "Transit"} · En-Route Stop
              </Text>
            </View>

            {nextArrival && (
              <View style={s.liveEtaPill}>
                <Text style={s.liveEtaText}>
                  {formatEta(nextArrival.eta_seconds)}
                  {departureMeta(nextArrival) ? ` · ${departureMeta(nextArrival)}` : ""}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={[s.closeBtn, { backgroundColor: pillBg }]}
          >
            <Ionicons name="close" size={16} color={sub} />
          </Pressable>
        </View>

        {/* Stop Name & Actions */}
        <View style={s.bottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.stopName, { color: text }]} numberOfLines={2}>
              {stop.name}
            </Text>
            <Text style={[s.coordSub, { color: sub }]}>
              {board?.stop?.stop_code
                ? `Code ${board.stop.stop_code} · `
                : ""}
              {board?.stop?.direction_label ||
                `${stop.coord.latitude.toFixed(4)}, ${stop.coord.longitude.toFixed(4)}`}
            </Text>
          </View>

          <View style={s.actionsGroup}>
            {onInspectStop && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  const sid = (stop as any).stop_id || stop.id;
                  onClose();
                  onInspectStop({
                    id: sid,
                    name: stop.name,
                    lat: stop.coord.latitude,
                    lng: stop.coord.longitude,
                  });
                }}
                style={[s.infoBtn, { backgroundColor: pillBg }]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={text}
                />
                <Text style={[s.infoBtnText, { color: text }]}>Details</Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
                router.push({
                  pathname: "/route" as any,
                  params: {
                    tLat: String(stop.coord.latitude),
                    tLng: String(stop.coord.longitude),
                    tName: stop.name,
                  },
                });
              }}
              style={[
                s.routeToBtn,
                { backgroundColor: stop.color || "#FF6F00" },
              ]}
            >
              <Ionicons name="navigate" size={13} color="#FFFFFF" />
              <Text style={s.routeToText}>To Here</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const WINDOW_H = Dimensions.get("window").height;
const CARD_GAP = 12;

const s = StyleSheet.create({
  card: {
    position: "absolute",
    // Placed by translateY (see floatAboveSheet) so it follows the sheet.
    top: 0,
    left: 14,
    right: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    // Kept just under the journey sheet (zIndex 20 / elevation 22): if the
    // sheet is dragged over the card it covers it, rather than leaving an
    // invisible card catching taps on top of the sheet.
    elevation: 18,
    zIndex: 19,
  },
  cardInner: { padding: 15, gap: 10 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 11.5, fontWeight: "700" },
  liveEtaPill: {
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  liveEtaText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "700",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stopName: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  coordSub: { fontSize: 11.5, marginTop: 2 },
  actionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 16,
  },
  infoBtnText: { fontSize: 12, fontWeight: "700" },
  routeToBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  routeToText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});