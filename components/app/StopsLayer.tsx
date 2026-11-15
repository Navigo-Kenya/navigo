// components/app/StopsLayer.tsx
import React, { useCallback, useMemo } from "react";
import { ShapeSource, CircleLayer, SymbolLayer, Images } from "@rnmapbox/maps";

type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stop_type?: string | null;
  location_t?: number;
  mode_badge?: string | null;
  route_nams?: string | null;
};

const ORANGE = "#FF6F00";
const STOPS_MIN_ZOOM = 11.5;

type Props = {
  allStops: Stop[];
  viewCenter: { lat: number; lng: number } | null;
  viewZoom: number;
  selected?: Stop | null;
  onPress: (stop: Stop) => void;
};

function resolveStopCategory(s: Stop): {
  category: "rail" | "metro" | "brt" | "ferry" | "terminal" | "bus";
  color: string;
  isMajor: boolean;
} {
  const st = String(s.stop_type ?? "").toLowerCase();
  const badge = String(s.mode_badge ?? "").toUpperCase();

  if (st.includes("rail") || badge === "SGR" || badge === "RAIL") {
    return { category: "rail", color: "#16A34A", isMajor: true };
  }
  if (st.includes("metro") || badge === "METRO") {
    return { category: "metro", color: "#7C3AED", isMajor: true };
  }
  if (st.includes("brt") || badge === "BRT") {
    return { category: "brt", color: "#DC2626", isMajor: true };
  }
  if (st.includes("ferry") || st.includes("tram")) {
    return { category: "ferry", color: "#0284C7", isMajor: true };
  }
  if (s.location_t === 1 || st.includes("terminal")) {
    return { category: "terminal", color: "#EA580C", isMajor: true };
  }
  return { category: "bus", color: "#2563EB", isMajor: false };
}

function StopsLayer({ allStops, viewZoom, selected, onPress }: Props) {
  const stopsGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: allStops.map((s) => {
        const meta = resolveStopCategory(s);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: {
            id: s.id,
            name: s.name,
            category: meta.category,
            color: meta.color,
            isMajor: meta.isMajor,
          },
        };
      }),
    }),
    [allStops]
  );

  const selectedId = selected?.id ?? null;

  const handleSourcePress = useCallback(
    (e: any) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const stop = allStops.find((s) => s.id === feature.properties?.id);
      if (stop) onPress(stop);
    },
    [allStops, onPress]
  );

  if (viewZoom < STOPS_MIN_ZOOM) return null;

  const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
  const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
  const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
  const NativeImages = Images as unknown as React.ComponentType<any>;

  return (
    <>
      <NativeImages images={{ matatu: require("@/assets/images/matatu.png") }} />
      <NativeShapeSource
        id="stops"
        shape={stopsGeoJson}
        hitbox={{ width: 22, height: 22 }}
        onPress={handleSourcePress}
      >
        {/* 1. Major Stations (Rail / Metro / BRT / Terminals) visible from zoom 11.5+ */}
        <NativeCircleLayer
          id="major-stations-bg"
          filter={["==", ["get", "isMajor"], true] as any}
          minZoomLevel={11.5}
          style={{
            circleColor: ["get", "color"],
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              11.5,
              6,
              15,
              9,
              18,
              12,
            ],
            circleStrokeWidth: 2.5,
            circleStrokeColor: "#FFFFFF",
            circlePitchAlignment: "viewport",
          }}
        />

        {/* 2. Regular Bus & Matatu Stops visible from zoom 13+ */}
        <NativeCircleLayer
          id="bus-stops-circle-bg"
          filter={
            selectedId
              ? ([
                  "all",
                  ["==", ["get", "isMajor"], false],
                  ["!=", ["get", "id"], selectedId],
                ] as any)
              : (["==", ["get", "isMajor"], false] as any)
          }
          minZoomLevel={13}
          style={{
            circleColor: "#2563EB",
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              4.5,
              16,
              7.5,
              18,
              9.5,
            ],
            circleStrokeWidth: 2,
            circleStrokeColor: "#FFFFFF",
            circlePitchAlignment: "viewport",
          }}
        />

        <NativeSymbolLayer
          id="individual-stops-icon"
          minZoomLevel={14}
          style={{
            iconImage: "matatu",
            iconSize: [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0.018,
              17,
              0.032,
            ],
            iconAllowOverlap: false,
            iconIgnorePlacement: false,
          }}
        />

        {/* 3. Selected Stop Highlight Ring */}
        {selectedId && (
          <NativeCircleLayer
            id="selected-stop-bg"
            filter={["==", ["get", "id"], selectedId] as any}
            minZoomLevel={11.5}
            style={{
              circleColor: ORANGE,
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                9,
                17,
                14,
              ],
              circleStrokeWidth: 3,
              circleStrokeColor: "#FFFFFF",
              circlePitchAlignment: "viewport",
            }}
          />
        )}
      </NativeShapeSource>
    </>
  );
}

export default React.memo(
  StopsLayer,
  (prev, next) =>
    prev.allStops === next.allStops &&
    prev.viewZoom === next.viewZoom &&
    prev.selected?.id === next.selected?.id &&
    prev.onPress === next.onPress
);