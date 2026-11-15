// components/map/IntermStopInfoCard.tsx
import React, { useEffect, useState } from "react";
import type { IntermediateStop } from "@/components/map/types";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StopService, type StopDeparturesResponse } from "@/services/stop";

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

  return (
    <View style={[s.card, { backgroundColor: bg, borderColor: border }]}>
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
                  {nextArrival.eta_label} ({nextArrival.crowding})
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
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute",
    left: 14,
    right: 14,
    // Sits cleanly above JourneyDetailsSheet peek height (340px) with zIndex: 45
    bottom: 356,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 32,
    zIndex: 45,
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