// components/app/StopQuickCard.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  StopService,
  type StopDeparturesResponse,
  type StopRouteBoardItem,
} from "@/services/stop";
import type { Stop } from "@/utils/mapHelpers";

const BLUE_PRIMARY = "#2563EB";
const RED_ARRIVAL = "#DC2626";

interface StopQuickCardProps {
  stop: Stop;
  onClose: () => void;
  onGoToStop: () => void;
  onViewDetails: () => void;
  loading?: boolean;
}

export default function StopQuickCard({
  stop,
  onClose,
  onGoToStop,
  onViewDetails,
  loading = false,
}: StopQuickCardProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";

  const [board, setBoard] = useState<StopDeparturesResponse | null>(null);
  const [fetchingBoard, setFetchingBoard] = useState(true);

  const loadDepartures = useCallback(async () => {
    setFetchingBoard(true);
    try {
      const data = await StopService.getStopDepartures(stop.id);
      setBoard(data);
    } catch {
      // Fallback if offline
    } finally {
      setFetchingBoard(false);
    }
  }, [stop.id]);

  useEffect(() => {
    loadDepartures();
  }, [loadDepartures]);

  const cardBg = dark ? "#18181B" : "#FFFFFF";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textSecondary = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#F3F4F6";

  const stopCode =
    board?.stop.stop_code ??
    (stop as any).stop_code ??
    stop.id.slice(-5).toUpperCase();
  const directionLabel =
    board?.stop.direction_label ??
    (stop as any).direction_label ??
    "Transit Stop & Station";

  return (
    <View
      style={[
        styles.sheetContainer,
        {
          backgroundColor: cardBg,
          paddingBottom: Math.max(insets.bottom, 16) + 66, // Clears floating tab dock
        },
      ]}
    >
      {/* Top Drag Handle */}
      <View style={styles.handleWrap}>
        <View
          style={[
            styles.handle,
            { backgroundColor: dark ? "#3F3F46" : "#D1D5DB" },
          ]}
        />
      </View>

      {/* Header: Stop Name + Stop Code · Direction + Close Button[cite: 3] */}
      <View style={[styles.header, { borderBottomColor: borderCol }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.stopTitle, { color: textPrimary }]}
              numberOfLines={1}
            >
              {stop.name}
            </Text>
            {board?.stop.platform_code && (
              <View style={styles.platformBadge}>
                <Text style={styles.platformText}>
                  Plat. {board.stop.platform_code}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.subtitle, { color: textSecondary }]}
            numberOfLines={1}
          >
            {stopCode} · {directionLabel}
          </Text>
        </View>

        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[
            styles.closeBtn,
            { backgroundColor: dark ? "#27272A" : "#F3F4F6" },
          ]}
        >
          <Ionicons name="close" size={18} color={textPrimary} />
        </Pressable>
      </View>

      {/* Live Route Arrivals List[cite: 3] */}
      <View style={styles.listWrapper}>
        {fetchingBoard && !board ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#FF6F00" />
            <Text style={[styles.loadingText, { color: textSecondary }]}>
              Loading live arrivals…
            </Text>
          </View>
        ) : (board?.routes?.length ?? 0) === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {stop.route_nams
                ? `Served by lines: ${stop.route_nams}`
                : "No scheduled departures at this time"}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.routesScroll}
            showsVerticalScrollIndicator={false}
          >
            {board!.routes.map((r: StopRouteBoardItem, idx: number) => (
              <View
                key={`${r.route_id}-${r.direction_id}-${idx}`}
                style={[styles.routeRow, { borderBottomColor: borderCol }]}
              >
                {/* Left: Mode Badge + Route Short Name + Headsign[cite: 3] */}
                <View style={styles.routeLeft}>
                  <View style={styles.routeBadgeRow}>
                    <View
                      style={[
                        styles.modePill,
                        { backgroundColor: r.badge_color || BLUE_PRIMARY },
                      ]}
                    >
                      <Text style={styles.modePillText}>{r.mode_badge}</Text>
                    </View>
                    <Text
                      style={[styles.routeShortName, { color: textPrimary }]}
                    >
                      {r.route_short_name}
                    </Text>
                  </View>
                  <Text
                    style={[styles.routeHeadsign, { color: textSecondary }]}
                    numberOfLines={1}
                  >
                    {r.headsign}
                  </Text>
                </View>

                {/* Center/Right: Next 2 Arrival Countdowns in Red[cite: 3] */}
                <View style={styles.arrivalsCol}>
                  {r.arrivals.length === 0 ? (
                    <Text style={[styles.noDataText, { color: textSecondary }]}>
                      No Data
                    </Text>
                  ) : (
                    r.arrivals.map((arr, aIdx) => (
                      <Text
                        key={aIdx}
                        style={styles.arrivalLine}
                        numberOfLines={1}
                      >
                        <Text style={styles.arrivalTimeRed}>
                          {arr.eta_label}
                        </Text>{" "}
                        <Text
                          style={[
                            styles.arrivalMeta,
                            { color: textSecondary },
                          ]}
                        >
                          ({arr.stops_away} stops left, {arr.crowding})
                        </Text>
                      </Text>
                    ))
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Floating Refresh Button (KakaoMap Bottom-Right of List)[cite: 3] */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            loadDepartures();
          }}
          style={[
            styles.refreshFab,
            {
              backgroundColor: cardBg,
              borderColor: dark ? "#3F3F46" : "#E5E7EB",
            },
          ]}
        >
          <Ionicons name="refresh" size={18} color={textPrimary} />
        </Pressable>
      </View>

      {/* Bottom Action Bar: [🕒 Schedule] on Left, [From] and [To] Pills on Right[cite: 2, 3] */}
      <View style={styles.footerActions}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onViewDetails();
          }}
          style={[
            styles.schedulePill,
            { backgroundColor: dark ? "#27272A" : "#F3F4F6" },
          ]}
        >
          <Ionicons name="time-outline" size={16} color={BLUE_PRIMARY} />
          <Text style={[styles.scheduleText, { color: textPrimary }]}>
            Schedule
          </Text>
        </Pressable>

        <View style={styles.fromToGroup}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(
                `/(tabs)/search?mode=planner&fLat=${stop.lat}&fLng=${stop.lng}&fName=${encodeURIComponent(
                  stop.name
                )}&fId=${encodeURIComponent(stop.id)}` as any
              );
            }}
            style={styles.fromBtn}
          >
            <Text style={styles.fromToBtnText}>From</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onGoToStop();
            }}
            disabled={loading}
            style={styles.toBtn}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.fromToBtnText}>To</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 22,
    zIndex: 12,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stopTitle: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  platformBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  platformText: {
    color: "#15803D",
    fontSize: 11,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    fontWeight: "500",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  listWrapper: {
    position: "relative",
    maxHeight: 210,
    minHeight: 90,
  },
  loadingBox: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  routesScroll: {
    paddingHorizontal: 18,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  routeLeft: {
    flex: 1,
    minWidth: 0,
  },
  routeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modePillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  routeShortName: {
    fontSize: 16,
    fontWeight: "700",
  },
  routeHeadsign: {
    fontSize: 12,
    marginTop: 2,
  },
  arrivalsCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  arrivalLine: {
    fontSize: 12,
  },
  arrivalTimeRed: {
    color: RED_ARRIVAL,
    fontWeight: "700",
  },
  arrivalMeta: {
    fontSize: 11,
  },
  noDataText: {
    fontSize: 12,
    fontWeight: "500",
  },
  refreshFab: {
    position: "absolute",
    right: 16,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  schedulePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  scheduleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  fromToGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fromBtn: {
    backgroundColor: BLUE_PRIMARY,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  toBtn: {
    backgroundColor: "#FF6F00",
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 20,
    minWidth: 68,
    alignItems: "center",
  },
  fromToBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});