// components/map/RouteCorridorOverlay.tsx
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  ShapeSource,
  LineLayer,
  CircleLayer,
  SymbolLayer,
  PointAnnotation,
} from "@rnmapbox/maps";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { RouteCorridorResponse } from "@/services/stop";
import type { Stop } from "@/utils/mapHelpers";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativePointAnnotation =
  PointAnnotation as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";

export function RouteCorridorMapLayers({
  corridor,
  direction,
  onSelectStop,
}: {
  corridor: RouteCorridorResponse;
  direction: "0" | "1";
  onSelectStop: (stop: Stop) => void;
}) {
  const activeDir = corridor.directions[direction];
  const oppDir = corridor.directions[direction === "0" ? "1" : "0"];
  const color = corridor.route_color || ORANGE;

  const activeLineGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const pts = activeDir?.points ?? [];
    if (pts.length < 2) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: pts },
          properties: {},
        },
      ],
    };
  }, [activeDir]);

  const oppLineGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const pts = oppDir?.points ?? [];
    if (pts.length < 2) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: pts },
          properties: {},
        },
      ],
    };
  }, [oppDir]);

  const stopsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const stops = activeDir?.stops ?? [];
    return {
      type: "FeatureCollection",
      features: stops.map((st, idx) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [st.lng, st.lat] },
        properties: {
          stop_id: st.stop_id,
          name: st.name,
          seq: idx + 1,
          isTerminal: idx === 0 || idx === stops.length - 1,
        },
      })),
    };
  }, [activeDir]);

  const firstStop = activeDir?.stops?.[0];
  const lastStop =
    activeDir?.stops && activeDir.stops.length > 1
      ? activeDir.stops[activeDir.stops.length - 1]
      : null;

  return (
    <>
      {/* Opposite direction ghost corridor */}
      {oppLineGeoJson.features.length > 0 && (
        <NativeShapeSource id="corridor-opp-line-src" shape={oppLineGeoJson}>
          <NativeLineLayer
            id="corridor-opp-line"
            style={{
              lineColor: color,
              lineOpacity: 0.22,
              lineWidth: 4,
              lineDasharray: [1.5, 1.5],
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </NativeShapeSource>
      )}

      {/* Active direction bold corridor */}
      {activeLineGeoJson.features.length > 0 && (
        <NativeShapeSource id="corridor-active-line-src" shape={activeLineGeoJson}>
          <NativeLineLayer
            id="corridor-active-casing"
            style={{
              lineColor: "#FFFFFF",
              lineWidth: 10,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <NativeLineLayer
            id="corridor-active-line"
            style={{
              lineColor: color,
              lineWidth: 6.5,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </NativeShapeSource>
      )}

      {/* Corridor station nodes */}
      {stopsGeoJson.features.length > 0 && (
        <NativeShapeSource
          id="corridor-stops-src"
          shape={stopsGeoJson}
          hitbox={{ width: 24, height: 24 }}
          onPress={(e: any) => {
            const feat = e?.features?.[0];
            const sid = feat?.properties?.stop_id;
            const found = activeDir?.stops?.find((s) => s.stop_id === sid);
            if (found) {
              onSelectStop({
                id: found.stop_id,
                name: found.name,
                lat: found.lat,
                lng: found.lng,
              });
            }
          }}
        >
          <NativeCircleLayer
            id="corridor-stops-circles"
            style={{
              circleRadius: [
                "case",
                ["boolean", ["get", "isTerminal"], false],
                8,
                5.5,
              ],
              circleColor: "#FFFFFF",
              circleStrokeColor: color,
              circleStrokeWidth: [
                "case",
                ["boolean", ["get", "isTerminal"], false],
                3.5,
                2.5,
              ],
            }}
          />
          <NativeSymbolLayer
            id="corridor-stops-labels"
            minZoomLevel={13}
            style={{
              textField: ["get", "name"],
              textSize: 11,
              textOffset: [0, 1.2],
              textAnchor: "top",
              textColor: "#111827",
              textHaloColor: "#FFFFFF",
              textHaloWidth: 1.5,
              textOptional: true,
            }}
          />
        </NativeShapeSource>
      )}

      {/* Start & Terminus Badges */}
      {firstStop && (
        <NativePointAnnotation
          id="corridor-start-pin"
          coordinate={[firstStop.lng, firstStop.lat]}
          anchor={{ x: 0.5, y: 1.1 }}
        >
          <View style={[s.termPill, { backgroundColor: color }]}>
            <Text style={s.termPillText} numberOfLines={1}>
              Start · {firstStop.name}
            </Text>
          </View>
        </NativePointAnnotation>
      )}

      {lastStop && (
        <NativePointAnnotation
          id="corridor-end-pin"
          coordinate={[lastStop.lng, lastStop.lat]}
          anchor={{ x: 0.5, y: 1.1 }}
        >
          <View style={[s.termPill, { backgroundColor: "#111827" }]}>
            <Text style={s.termPillText} numberOfLines={1}>
              Terminus · {lastStop.name}
            </Text>
          </View>
        </NativePointAnnotation>
      )}
    </>
  );
}

export function RouteCorridorSheet({
  corridor,
  loading,
  direction,
  onChangeDirection,
  onFocusStop,
  onOpenStopDetails,
  onClose,
}: {
  corridor: RouteCorridorResponse | null;
  loading: boolean;
  direction: "0" | "1";
  onChangeDirection: (dir: "0" | "1") => void;
  onFocusStop: (lat: number, lng: number) => void;
  onOpenStopDetails: (stop: Stop) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const [minimized, setMinimized] = useState(false);

  if (!corridor && !loading) return null;

  const sheetBg = dark ? "#18181B" : "#FFFFFF";
  const cardBg = dark ? "#27272A" : "#F4F4F5";
  const textPrimary = dark ? "#F9FAFB" : "#111827";
  const textMuted = dark ? "#9CA3AF" : "#6B7280";
  const borderCol = dark ? "#27272A" : "#E5E7EB";

  const color = corridor?.route_color || ORANGE;
  const activeDir = corridor?.directions?.[direction];
  const hasInbound =
    (corridor?.directions?.["1"]?.points?.length ?? 0) > 0 ||
    (corridor?.directions?.["1"]?.stops?.length ?? 0) > 0;

  return (
    <View
      style={[
        s.sheet,
        {
          backgroundColor: sheetBg,
          paddingBottom: Math.max(insets.bottom, 16) + 64,
        },
      ]}
    >
      {/* Tap handle to toggle compact vs expanded stop list */}
      <Pressable
        onPress={() => setMinimized((v) => !v)}
        style={s.handleWrap}
      >
        <View
          style={[
            s.handle,
            { backgroundColor: dark ? "#3F3F46" : "#D1D5DB" },
          ]}
        />
      </Pressable>

      {loading || !corridor ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="small" color={ORANGE} />
          <Text style={{ color: textMuted, fontSize: 13 }}>
            Loading route corridor & stations…
          </Text>
        </View>
      ) : (
        <>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: borderCol }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.badgeRow}>
                <View style={[s.modeBadge, { backgroundColor: color }]}>
                  <Text style={s.modeBadgeText}>{corridor.mode_badge}</Text>
                </View>
                <Text style={[s.routeTitle, { color: textPrimary }]}>
                  Line {corridor.route_short_name}
                </Text>
                {corridor.agency_name && (
                  <Text
                    style={[s.agencyLabel, { color: textMuted }]}
                    numberOfLines={1}
                  >
                    · {corridor.agency_name}
                  </Text>
                )}
              </View>

              <Text
                style={[s.longName, { color: textMuted }]}
                numberOfLines={1}
              >
                {activeDir?.headsign || corridor.route_long_name}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={[s.closeBtn, { backgroundColor: cardBg }]}
            >
              <Ionicons name="close" size={18} color={textPrimary} />
            </Pressable>
          </View>

          {/* Outbound / Inbound Direction Switcher */}
          {hasInbound && (
            <View style={s.dirBar}>
              {(["0", "1"] as const).map((d) => {
                const isSel = direction === d;
                const dirInfo = corridor.directions[d];
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onChangeDirection(d);
                    }}
                    style={[
                      s.dirBtn,
                      {
                        backgroundColor: isSel ? color + "18" : cardBg,
                        borderColor: isSel ? color : "transparent",
                      },
                    ]}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={13}
                      color={isSel ? color : textMuted}
                    />
                    <Text
                      style={[
                        s.dirBtnText,
                        { color: isSel ? color : textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {dirInfo?.headsign ||
                        (d === "0" ? "Outbound" : "Inbound")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Ordered Corridor Stops Timeline */}
          {!minimized && (
            <FlatList
              data={activeDir?.stops ?? []}
              keyExtractor={(st, idx) => `${st.stop_id}-${idx}`}
              style={{ maxHeight: 230 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6 }}
              renderItem={({ item: st, index }) => {
                const total = activeDir?.stops?.length ?? 0;
                const isFirst = index === 0;
                const isLast = index === total - 1;

                return (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      onFocusStop(st.lat, st.lng);
                    }}
                    style={s.stopRow}
                  >
                    {/* Rail timeline column */}
                    <View style={s.railCol}>
                      {!isFirst && (
                        <View
                          style={[s.railLineTop, { backgroundColor: color }]}
                        />
                      )}
                      <View
                        style={[
                          s.railDot,
                          {
                            borderColor: color,
                            backgroundColor:
                              isFirst || isLast ? color : sheetBg,
                          },
                        ]}
                      />
                      {!isLast && (
                        <View
                          style={[
                            s.railLineBottom,
                            { backgroundColor: color },
                          ]}
                        />
                      )}
                    </View>

                    <View
                      style={[
                        s.stopBody,
                        { borderBottomColor: borderCol },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[s.stopName, { color: textPrimary }]}
                          numberOfLines={1}
                        >
                          {st.name}
                        </Text>
                        <Text style={[s.stopMeta, { color: textMuted }]}>
                          {st.stop_code
                            ? `${st.stop_code} · `
                            : ""}
                          {st.departure_time?.slice(0, 5) || "Scheduled"}
                          {st.platform_code
                            ? ` · Plat. ${st.platform_code}`
                            : ""}
                        </Text>
                      </View>

                      <View style={s.stopActions}>
                        <Pressable
                          onPress={() =>
                            onOpenStopDetails({
                              id: st.stop_id,
                              name: st.name,
                              lat: st.lat,
                              lng: st.lng,
                            })
                          }
                          style={[
                            s.miniBtn,
                            { backgroundColor: cardBg },
                          ]}
                        >
                          <Text
                            style={[
                              s.miniBtnText,
                              { color: textPrimary },
                            ]}
                          >
                            Arrivals
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/route" as any,
                              params: {
                                tLat: String(st.lat),
                                tLng: String(st.lng),
                                tName: st.name,
                              },
                            })
                          }
                          style={[
                            s.miniBtn,
                            { backgroundColor: color },
                          ]}
                        >
                          <Text
                            style={[
                              s.miniBtnText,
                              { color: "#FFFFFF" },
                            ]}
                          >
                            To
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  termPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    maxWidth: 160,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  termPillText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "800",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 22,
    zIndex: 18,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  loadingWrap: {
    height: 110,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  modeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "800",
  },
  routeTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  agencyLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  longName: {
    fontSize: 13,
    fontWeight: "500",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dirBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dirBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  dirBtnText: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  railCol: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  railLineTop: {
    position: "absolute",
    top: 0,
    bottom: "50%",
    width: 3,
  },
  railLineBottom: {
    position: "absolute",
    top: "50%",
    bottom: 0,
    width: 3,
  },
  railDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2.5,
    zIndex: 2,
  },
  stopBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  stopName: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  stopMeta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  stopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  miniBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
});