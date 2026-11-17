// components/map/RouteCorridorOverlay.tsx
//
// A transit line ("corridor") on the map plus its sheet: the line in both
// directions, its stops (start and terminus highlighted), and a KakaoMap-style
// draggable sheet with a direction switcher and the stop timeline.
import { MapSheet, type MapSheetHandle } from "@/components/app/MapSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import React, { useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { ShapeSource, LineLayer, CircleLayer, SymbolLayer } from "@rnmapbox/maps";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { RouteCorridorResponse } from "@/services/stop";
import type { Stop } from "@/utils/mapHelpers";
import { Icon } from "@/components/icons/Icon";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";
const INK = "#111827";
const { height: SH } = Dimensions.get("window");

// ─── Map layers ──────────────────────────────────────────────────────────────

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

  const line = (pts?: [number, number][]): GeoJSON.FeatureCollection =>
    !pts || pts.length < 2
      ? { type: "FeatureCollection", features: [] }
      : {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} }],
        };

  const activeLineGeoJson = useMemo(() => line(activeDir?.points), [activeDir]);
  const oppLineGeoJson = useMemo(() => line(oppDir?.points), [oppDir]);

  const stopsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const stops = activeDir?.stops ?? [];
    const last = stops.length - 1;
    return {
      type: "FeatureCollection",
      features: stops.map((st, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === last && last > 0;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [st.lng, st.lat] },
          properties: {
            stop_id: st.stop_id,
            name: st.name,
            seq: idx + 1,
            isTerminal: isStart || isEnd,
            isStart,
            isEnd,
            termLabel: isStart ? `Start · ${st.name}` : isEnd ? `Terminus · ${st.name}` : "",
          },
        };
      }),
    };
  }, [activeDir]);

  const isTerminal = ["boolean", ["get", "isTerminal"], false];
  const isStart = ["boolean", ["get", "isStart"], false];

  return (
    <>
      {/* Opposite direction: ghost line */}
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

      {/* Active direction: bold line with a white casing */}
      {activeLineGeoJson.features.length > 0 && (
        <NativeShapeSource id="corridor-active-line-src" shape={activeLineGeoJson}>
          <NativeLineLayer
            id="corridor-active-casing"
            style={{ lineColor: "#FFFFFF", lineWidth: 10, lineCap: "round", lineJoin: "round" }}
          />
          <NativeLineLayer
            id="corridor-active-line"
            style={{ lineColor: color, lineWidth: 6.5, lineCap: "round", lineJoin: "round" }}
          />
        </NativeShapeSource>
      )}

      {/* Stops. Start / terminus are native markers (no PointAnnotation
          snapshots), so they render reliably and stay crisp. Layers must be
          direct children of the ShapeSource. */}
      {stopsGeoJson.features.length > 0 && (
        <NativeShapeSource
          id="corridor-stops-src"
          shape={stopsGeoJson}
          hitbox={{ width: 24, height: 24 }}
          onPress={(e: any) => {
            const sid = e?.features?.[0]?.properties?.stop_id;
            const found = activeDir?.stops?.find((s) => s.stop_id === sid);
            if (found) {
              onSelectStop({ id: found.stop_id, name: found.name, lat: found.lat, lng: found.lng });
            }
          }}
        >
          <NativeCircleLayer
            id="corridor-stops-circles"
            style={{
              circleRadius: ["case", isTerminal, 8.5, 5.5],
              circleColor: ["case", isStart, color, ["boolean", ["get", "isEnd"], false], INK, "#FFFFFF"],
              circleStrokeColor: ["case", isTerminal, "#FFFFFF", color],
              circleStrokeWidth: ["case", isTerminal, 3, 2.5],
              circlePitchAlignment: "viewport",
            }}
          />
          <NativeSymbolLayer
            id="corridor-terminal-labels"
            filter={isTerminal}
            style={{
              textField: ["get", "termLabel"],
              textSize: 12.5,
              textColor: ["case", isStart, color, INK],
              textHaloColor: "#FFFFFF",
              textHaloWidth: 2,
              textOffset: [0, 1.25],
              textAnchor: "top",
              textMaxWidth: 12,
              textAllowOverlap: true,
              textPitchAlignment: "viewport",
            }}
          />
          <NativeSymbolLayer
            id="corridor-stops-labels"
            filter={["!", isTerminal]}
            minZoomLevel={13}
            style={{
              textField: ["get", "name"],
              textSize: 11,
              textOffset: [0, 1.1],
              textAnchor: "top",
              textColor: "#374151",
              textHaloColor: "#FFFFFF",
              textHaloWidth: 1.5,
              textOptional: true,
            }}
          />
        </NativeShapeSource>
      )}
    </>
  );
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

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
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const sheet = useRef<MapSheetHandle>(null);

  if (!corridor && !loading) return null;

  const C = {
    text: dark ? "#F4F4F5" : "#111827",
    sub:  dark ? "#A1A1AA" : "#6B7280",
    chip: dark ? "#27272A" : "#F1F5F9",
    line: dark ? "#27272A" : "#EEF0F3",
    bg:   dark ? "#18181B" : "#FFFFFF",
  };

  const color = corridor?.route_color || ORANGE;
  const activeDir = corridor?.directions?.[direction];
  const stops = activeDir?.stops ?? [];
  const hasInbound =
    (corridor?.directions?.["1"]?.points?.length ?? 0) > 0 ||
    (corridor?.directions?.["1"]?.stops?.length ?? 0) > 0;

  const header = (
    <View style={s.headerWrap}>
      <View style={s.header}>
        <View style={{ flex: 1, gap: 4 }}>
          {corridor ? (
            <>
              <View style={s.badgeRow}>
                <View style={[s.modeBadge, { backgroundColor: color }]}>
                  <Text style={s.modeBadgeText}>{corridor.mode_badge}</Text>
                </View>
                <Text style={[s.routeTitle, { color: C.text }]} numberOfLines={1}>
                  Line {corridor.route_short_name}
                </Text>
              </View>
              <Text style={[s.longName, { color: C.sub }]} numberOfLines={1}>
                {[corridor.agency_name, `${stops.length} stops`].filter(Boolean).join(" · ")}
              </Text>
            </>
          ) : (
            <Text style={[s.routeTitle, { color: C.text }]}>Loading line…</Text>
          )}
        </View>
        <PressableScale
          onPress={() => sheet.current?.close()}
          hitSlop={12}
          style={[s.roundBtn, { backgroundColor: C.chip }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={16} color={C.sub} />
        </PressableScale>
      </View>

      {/* Direction switcher */}
      {corridor && hasInbound && (
        <View style={[s.segment, { backgroundColor: C.chip }]}>
          {(["0", "1"] as const).map((d) => {
            const isSel = direction === d;
            const headsign = corridor.directions[d]?.headsign || (d === "0" ? "Outbound" : "Inbound");
            return (
              <Pressable
                key={d}
                onPress={() => {
                  if (isSel) return;
                  Haptics.selectionAsync();
                  onChangeDirection(d);
                }}
                style={[s.segBtn, isSel && [s.segBtnActive, { backgroundColor: C.bg }]]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSel }}
              >
                <Icon name="arrow-forward" size={12} color={isSel ? color : C.sub} />
                <Text style={[s.segText, { color: isSel ? C.text : C.sub }]} numberOfLines={1}>
                  To {headsign}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {corridor && !hasInbound && activeDir?.headsign ? (
        <Text style={[s.singleDir, { color: C.sub }]} numberOfLines={1}>
          Towards {activeDir.headsign}
        </Text>
      ) : null}
    </View>
  );

  return (
    <MapSheet
      ref={sheet}
      snapPoints={[hasInbound ? 236 : 196, SH * 0.52, SH * 0.88]}
      onClose={onClose}
      header={header}
    >
      {loading || !corridor ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="small" color={ORANGE} />
          <Text style={{ color: C.sub, fontSize: 13 }}>Loading stops…</Text>
        </View>
      ) : (
        <View style={s.timeline}>
          {stops.map((st, index) => {
            const isFirst = index === 0;
            const isLast = index === stops.length - 1;
            const terminal = isFirst || isLast;
            const meta = [st.stop_code, st.departure_time?.slice(0, 5), st.platform_code ? `Plat. ${st.platform_code}` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable
                key={`${st.stop_id}-${index}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  onFocusStop(st.lat, st.lng);
                }}
                style={({ pressed }) => [s.stopRow, pressed && { backgroundColor: C.chip }]}
                accessibilityRole="button"
                accessibilityLabel={`${st.name}, show on map`}
              >
                {/* Rail */}
                <View style={s.railCol}>
                  {!isFirst && <View style={[s.railTop, { backgroundColor: color }]} />}
                  {!isLast && <View style={[s.railBottom, { backgroundColor: color }]} />}
                  <View
                    style={[
                      s.railDot,
                      terminal && s.railDotTerminal,
                      {
                        borderColor: terminal ? "#FFFFFF" : color,
                        backgroundColor: isFirst ? color : isLast ? INK : C.bg,
                      },
                    ]}
                  />
                </View>

                <View style={[s.stopBody, { borderBottomColor: C.line }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[s.stopName, { color: C.text }, terminal && s.stopNameTerminal]}
                      numberOfLines={1}
                    >
                      {st.name}
                    </Text>
                    {!!meta && (
                      <Text style={[s.stopMeta, { color: C.sub }]} numberOfLines={1}>
                        {isFirst ? "Start · " : isLast ? "Terminus · " : ""}
                        {meta}
                      </Text>
                    )}
                  </View>

                  <PressableScale
                    onPress={() =>
                      onOpenStopDetails({ id: st.stop_id, name: st.name, lat: st.lat, lng: st.lng })
                    }
                    hitSlop={6}
                    style={[s.iconBtn, { backgroundColor: C.chip }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Departures at ${st.name}`}
                  >
                    <Icon name="time-outline" size={16} color={C.text} />
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: "/route" as any,
                        params: { tLat: String(st.lat), tLng: String(st.lng), tName: st.name },
                      })
                    }
                    hitSlop={6}
                    style={[s.iconBtn, { backgroundColor: color }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Directions to ${st.name}`}
                  >
                    <Icon name="navigate" size={15} color="#FFFFFF" />
                  </PressableScale>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </MapSheet>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 18, paddingBottom: 12, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  modeBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  routeTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1 },
  longName: { fontSize: 12.5, fontWeight: "500" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  segment: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 3 },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  segBtnActive: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segText: { fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  singleDir: { fontSize: 12.5, fontWeight: "600" },

  loadingWrap: { height: 110, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },

  timeline: { paddingHorizontal: 10 },
  stopRow: { flexDirection: "row", alignItems: "stretch", borderRadius: 12 },
  railCol: { width: 32, alignItems: "center", justifyContent: "center" },
  railTop: { position: "absolute", top: 0, bottom: "50%", width: 4 },
  railBottom: { position: "absolute", top: "50%", bottom: 0, width: 4 },
  railDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
  railDotTerminal: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },

  stopBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingRight: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stopName: { fontSize: 14.5, fontWeight: "600" },
  stopNameTerminal: { fontWeight: "800" },
  stopMeta: { fontSize: 11.5, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
