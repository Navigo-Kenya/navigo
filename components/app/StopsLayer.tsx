// components/app/StopsLayer.tsx
import React, { useCallback, useMemo } from "react";
import { ShapeSource, CircleLayer, SymbolLayer, Images } from "@rnmapbox/maps";

type Stop = { id: string; name: string; lat: number; lng: number; route_nams?: string | null };

const ORANGE = "#FF6F00";
const STOPS_MIN_ZOOM = 13;

type Props = {
  allStops:   Stop[];
  viewCenter: { lat: number; lng: number } | null;
  viewZoom:   number;
  selected?:  Stop | null;
  onPress:    (stop: Stop) => void;
};

function StopsLayer({ allStops, viewZoom, selected, onPress }: Props) {
  // Feed all 4,000+ stops directly into the GPU pipeline
  const stopsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: allStops.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { id: s.id, name: s.name },
    })),
  }), [allStops]);

  const selectedId = selected?.id ?? null;

  const handleSourcePress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    
    // No more clusters to worry about checking!
    const stop = allStops.find((s) => s.id === feature.properties?.id);
    if (stop) onPress(stop);
  }, [allStops, onPress]);

  // Completely unmount the JSX if we are way too far zoomed out
  if (viewZoom < STOPS_MIN_ZOOM) return null;

  // If a stop is selected, filter it out of the main layer so we don't draw 2 icons on top of each other
  const unselectedFilter = selectedId
    ? (["!=", ["get", "id"], selectedId] as any)
    : undefined;

  const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
  const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
  const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
  const NativeImages      = Images      as unknown as React.ComponentType<any>;

  return (
    <>
      <NativeImages images={{ matatu: require("@/assets/images/matatu.png") }} />
      <NativeShapeSource
        id="stops"
        shape={stopsGeoJson}
        onPress={handleSourcePress}
        // Removed all cluster={}, clusterRadius={}, and clusterMaxZoom={} props!
      >
        {/* The entire fleet of unselected stops */}
        <NativeSymbolLayer
          id="individual-stops"
          filter={unselectedFilter}
          minZoomLevel={STOPS_MIN_ZOOM}
          style={{
            iconImage:           "matatu",
            iconSize:            ["interpolate", ["linear"], ["zoom"], 13, 0.02, 17, 0.035],
            iconAllowOverlap:    false,
            iconIgnorePlacement: false,
          }}
        />
        
        {/* The orange highlight ring for the selected stop */}
        {selectedId && (
          <NativeCircleLayer
            id="selected-stop-bg"
            filter={["==", ["get", "id"], selectedId] as any}
            minZoomLevel={STOPS_MIN_ZOOM}
            style={{
              circleColor:       ORANGE,
              circleRadius:      ["interpolate", ["linear"], ["zoom"], 13, 7, 17, 11],
              circleStrokeWidth: 2,
              circleStrokeColor: "#FFFFFF",
            }}
          />
        )}
        
        {/* The slightly enlarged icon for the selected stop */}
        {selectedId && (
          <NativeSymbolLayer
            id="selected-stop"
            filter={["==", ["get", "id"], selectedId] as any}
            minZoomLevel={STOPS_MIN_ZOOM}
            style={{
              iconImage:        "matatu",
              iconSize:         ["interpolate", ["linear"], ["zoom"], 13, 0.03, 17, 0.05],
              iconAllowOverlap: true,
            }}
          />
        )}
      </NativeShapeSource>
    </>
  );
}

export default React.memo(StopsLayer, (prev, next) =>
  prev.allStops     === next.allStops    &&
  prev.viewZoom     === next.viewZoom    &&
  prev.selected?.id === next.selected?.id &&
  prev.onPress      === next.onPress
);