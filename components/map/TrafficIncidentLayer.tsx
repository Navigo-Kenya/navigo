// components/map/TrafficIncidentLayer.tsx
//
// Live TomTom jams as coloured road lines (amber = queuing / slow, red =
// stationary), drawn under the report pins. This is the map's "Traffic" layer:
// the same TomTom data that times car, boda and matatu routes. Closures,
// accidents and roadworks are pins in "Live reports" instead.
//
// The source is always mounted (empty when there's nothing to show) so the
// layer is never added and removed while the style changes, which is what
// caused the "Source … is not in style" errors elsewhere.
import { LineLayer, ShapeSource } from "@rnmapbox/maps";
import React, { memo, useMemo } from "react";
import type { JamLine } from "@/utils/incidents";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;

/** Jams show from this zoom: below it the lines are noise at city scale. */
const MIN_ZOOM = 12;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  jams: JamLine[];
  visible: boolean;
}

export const TrafficIncidentLayer = memo(function TrafficIncidentLayer({ jams, visible }: Props) {
  const shape = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!visible || jams.length === 0) return EMPTY;
    return {
      type: "FeatureCollection",
      features: jams.map((j) => ({
        type: "Feature",
        id: j.id,
        geometry: { type: "LineString", coordinates: j.coordinates },
        properties: { level: j.level },
      })),
    };
  }, [jams, visible]);

  return (
    <NativeShapeSource id="traffic-incidents" shape={shape}>
      <NativeLineLayer
        id="traffic-incidents-casing"
        minZoomLevel={MIN_ZOOM}
        style={{
          lineColor: "#FFFFFF",
          lineOpacity: 0.7,
          lineWidth: ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 9],
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      <NativeLineLayer
        id="traffic-incidents-line"
        minZoomLevel={MIN_ZOOM}
        style={{
          lineColor: ["match", ["get", "level"], 2, "#DC2626", "#F59E0B"],
          lineOpacity: 0.9,
          lineWidth: ["interpolate", ["linear"], ["zoom"], 12, 2.2, 16, 5.5],
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </NativeShapeSource>
  );
});
