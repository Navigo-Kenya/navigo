import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ShapeSource, LineLayer, PointAnnotation, CircleLayer } from "@rnmapbox/maps";
import type { IntermediateStop, LocMarker, NodeMarker, TransitLeg, WalkLeg } from "@/components/map/types";
import { DestinationPin, SquarePin, TrackedNodeMarker } from "@/components/map/RouteMarkers";

// Named imports (same pattern as StopsLayer) are used intentionally — the web .d.ts
// resolution that the IDE picks up may not expose all components on the default Mapbox
// namespace object, causing undefined at runtime. Named imports guarantee correct
// Metro resolution to the native module.
const NativeShapeSource     = ShapeSource     as unknown as React.ComponentType<any>;
const NativeLineLayer       = LineLayer       as unknown as React.ComponentType<any>;
const NativeCircleLayer     = CircleLayer     as unknown as React.ComponentType<any>;
const NativePointAnnotation = PointAnnotation as unknown as React.ComponentType<any>;

// Mount-gate: hold off rendering the PointAnnotation until 100 ms after the
// component mounts so the React Native layout pass has fully measured all
// sub-views before Mapbox rasterizes them. Keeping id/key stable after the
// initial mount avoids the "PointAnnotation supports max 1 subview" race that
// the previous key-flip approach could trigger.
function LocMarkerPin({ m }: { m: LocMarker }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <NativePointAnnotation
      key={m.id}
      id={m.id}
      coordinate={[m.coord.longitude, m.coord.latitude]}
      anchor={m.isStart ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.8 }}
    >
      {m.isStart ? <SquarePin isStart /> : <DestinationPin name={m.name} />}
    </NativePointAnnotation>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Returns only the coordinates of `coords` that lie AHEAD of the user position.
function trimPolylineAhead(
  coords: { latitude: number; longitude: number }[],
  userLat: number,
  userLng: number,
): { latitude: number; longitude: number }[] {
  if (coords.length < 2) return coords;

  let bestIdx  = 0;
  let bestFrac = 0;
  let minDist  = Infinity;

  for (let i = 0; i < coords.length - 1; i++) {
    const aLat = coords[i].latitude,     aLng = coords[i].longitude;
    const bLat = coords[i + 1].latitude, bLng = coords[i + 1].longitude;
    const dx = bLat - aLat, dy = bLng - aLng;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((userLat - aLat) * dx + (userLng - aLng) * dy) / lenSq));
    const d = Math.hypot(userLat - aLat - t * dx, userLng - aLng - t * dy);
    if (d < minDist) { minDist = d; bestIdx = i; bestFrac = t; }
  }

  const projLat = coords[bestIdx].latitude  + bestFrac * (coords[bestIdx + 1].latitude  - coords[bestIdx].latitude);
  const projLng = coords[bestIdx].longitude + bestFrac * (coords[bestIdx + 1].longitude - coords[bestIdx].longitude);

  return [{ latitude: projLat, longitude: projLng }, ...coords.slice(bestIdx + 1)];
}

interface RouteOverlayProps {
  walkLegs:           WalkLeg[];
  transitLegs:        TransitLeg[];
  nodeMarkers:        NodeMarker[];
  locMarkers:         LocMarker[];
  intermediateStops:  IntermediateStop[];
  onIntermStopPress:  (stop: IntermediateStop) => void;
  boardingNodeId?:    string | null;
  /** Index of the route segment being traversed (-1 when not navigating). */
  activeSegIdx?:      number;
  userLat?:           number;
  userLng?:           number;
}

/** Legs are created with ids `walk-<segIdx>` / `transit-<segIdx>`. */
function segIdxOf(id: string): number {
  const n = parseInt(id.split("-")[1], 10);
  return Number.isNaN(n) ? -1 : n;
}

function _RouteOverlay({
  walkLegs, transitLegs, nodeMarkers, locMarkers, intermediateStops, onIntermStopPress,
  boardingNodeId, activeSegIdx = -1, userLat, userLng,
}: RouteOverlayProps) {
  const intermGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: intermediateStops.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.coord.longitude, s.coord.latitude] },
      properties: { id: s.id, color: s.color },
    })),
  }), [intermediateStops]);

  const handleIntermPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const stop = intermediateStops.find((s) => s.id === feature.properties?.id);
    if (stop) onIntermStopPress(stop);
  }, [intermediateStops, onIntermStopPress]);

  return (
    <>
      {walkLegs.map((leg) => {
        const segIdx   = segIdxOf(leg.id);
        const isActive = activeSegIdx >= 0 && segIdx === activeSegIdx;
        const isPast   = activeSegIdx >= 0 && segIdx  < activeSegIdx;
        // Past walk legs fade almost out — during a transit leg they no
        // longer read as "still to walk".
        const color    = isPast ? hexWithAlpha("#8E8E93", 0.12) : "#8E8E93";
        const rawCoords = isActive && userLat != null && userLng != null
          ? trimPolylineAhead(leg.coords, userLat, userLng)
          : leg.coords;

        if (rawCoords.length < 2) return null;

        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: rawCoords.map((c) => [c.longitude, c.latitude]),
          },
          properties: {},
        };

        return (
          <NativeShapeSource key={leg.id} id={`walk-src-${leg.id}`} shape={geojson}>
            <NativeLineLayer
              id={`walk-line-${leg.id}`}
              style={{
                lineColor: color,
                lineWidth: 6,
                lineCap:   "round",
                lineJoin:  "round",
                lineDasharray: [0, 1.5],
              }}
            />
          </NativeShapeSource>
        );
      })}

      {transitLegs.map((leg) => {
        const segIdx   = segIdxOf(leg.id);
        const traveled = activeSegIdx >= 0 && segIdx < activeSegIdx;
        const isActive = activeSegIdx >= 0 && segIdx === activeSegIdx;

        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: leg.coords.map((c) => [c.longitude, c.latitude]),
          },
          properties: {},
        };

        // Consumed portion of the ACTIVE transit leg: the full line renders
        // dimmed underneath, the part still ahead renders bright on top and
        // shrinks as the bus advances.
        const aheadCoords = isActive && userLat != null && userLng != null
          ? trimPolylineAhead(leg.coords, userLat, userLng)
          : null;
        const aheadGeojson: GeoJSON.Feature<GeoJSON.LineString> | null =
          aheadCoords && aheadCoords.length >= 2
            ? {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: aheadCoords.map((c) => [c.longitude, c.latitude]),
                },
                properties: {},
              }
            : null;

        const baseColor = traveled
          ? hexWithAlpha(leg.color, 0.15)
          : isActive && aheadGeojson
            ? hexWithAlpha(leg.color, 0.30)
            : leg.color;

        return (
          <React.Fragment key={`${leg.id}-${leg.color}`}>
            <NativeShapeSource id={`transit-src-${leg.id}`} shape={geojson}>
              <NativeLineLayer
                id={`transit-line-${leg.id}`}
                style={{
                  lineColor:  baseColor,
                  lineWidth:  traveled ? 4 : 8,
                  lineCap:    "round",
                  lineJoin:   "round",
                }}
              />
            </NativeShapeSource>
            {aheadGeojson && (
              <NativeShapeSource id={`transit-ahead-src-${leg.id}`} shape={aheadGeojson}>
                <NativeLineLayer
                  id={`transit-ahead-line-${leg.id}`}
                  style={{
                    lineColor: leg.color,
                    lineWidth: 8,
                    lineCap:   "round",
                    lineJoin:  "round",
                  }}
                />
              </NativeShapeSource>
            )}
          </React.Fragment>
        );
      })}

      {intermediateStops.length > 0 && (
        <NativeShapeSource id="interm-stops" shape={intermGeoJson} onPress={handleIntermPress}>
          <NativeCircleLayer
            id="interm-stops-dots"
            style={{
              circleColor:       ["get", "color"],
              circleRadius:      6.5,
              circleStrokeWidth: 2,
              circleStrokeColor: "#FFFFFF",
            }}
          />
        </NativeShapeSource>
      )}

      {nodeMarkers.map((m) => (
        <TrackedNodeMarker key={m.id} m={m} isBoardingStop={m.id === boardingNodeId} />
      ))}

      {locMarkers.map((m) => (
        <LocMarkerPin key={m.id} m={m} />
      ))}
    </>
  );
}

export const RouteOverlay = React.memo(_RouteOverlay, (prev, next) =>
  prev.walkLegs          === next.walkLegs          &&
  prev.transitLegs       === next.transitLegs       &&
  prev.nodeMarkers       === next.nodeMarkers       &&
  prev.locMarkers        === next.locMarkers        &&
  prev.intermediateStops === next.intermediateStops &&
  prev.boardingNodeId    === next.boardingNodeId    &&
  prev.activeSegIdx      === next.activeSegIdx      &&
  prev.userLat           === next.userLat           &&
  prev.userLng           === next.userLng
);
