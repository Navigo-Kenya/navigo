// components/map/IndoorLayer.tsx
//
// The inside of the venue the map is looking at, one level at a time, drawn
// over the street map from zoom 16: spaces filled by what they are (platform,
// hall, shop), their edges, the venue's outline, doors as coloured strokes
// and points (tickets, toilets) as dots, with names from zoom 17.
//
// Always mounted, empty when there's nothing to show: a source added later
// would land above the route, stops and reports.
import type { IndoorVenue } from "@/services/venues";
import { INDOOR_KEEP_ZOOM, INDOOR_MIN_ZOOM, levelShape } from "@/utils/indoor";
import { CircleLayer, FillLayer, LineLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import React, { memo, useMemo, useRef } from "react";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeFillLayer = FillLayer as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const RANK: Record<string, number> = { amenity: 3, opening: 2, unit: 1 };
/** Fades in over the first half zoom, so the floor doesn't pop. */
const fade = (to: number) => ["interpolate", ["linear"], ["zoom"], INDOOR_KEEP_ZOOM, 0, INDOOR_MIN_ZOOM + 0.3, to];

interface Props {
  venue: IndoorVenue | null;
  levelId: string | null;
  selectedId: string | null;
  dark: boolean;
  /** A space, door or point tapped (the one on top). */
  onPress: (featureId: string) => void;
}

export const IndoorLayer = memo(function IndoorLayer({ venue, levelId, selectedId, dark, onPress }: Props) {
  const shape = useMemo(() => (venue ? levelShape(venue, levelId, dark) : EMPTY), [venue, levelId, dark]);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const handlePress = (e: any) => {
    // Points over doors over spaces; the outline isn't a place.
    const top = [...(e?.features ?? [])]
      .filter((f: any) => f?.properties?.kind in RANK)
      .sort((a: any, b: any) => RANK[b.properties.kind] - RANK[a.properties.kind])[0];
    if (top?.properties?.id) onPressRef.current(String(top.properties.id));
  };

  const isKind = (k: string) => ["==", ["get", "kind"], k];
  const edge = dark ? "#4B5563" : "#A3AEBD";

  return (
    <NativeShapeSource id="indoor-src" shape={shape} onPress={handlePress} hitbox={{ width: 14, height: 14 }}>
      <NativeFillLayer
        id="indoor-units"
        minZoomLevel={INDOOR_KEEP_ZOOM}
        filter={isKind("unit")}
        style={{ fillColor: ["get", "color"], fillOpacity: fade(0.96), fillEmissiveStrength: 1 }}
      />
      <NativeLineLayer
        id="indoor-units-edge"
        minZoomLevel={INDOOR_KEEP_ZOOM}
        filter={isKind("unit")}
        style={{
          lineColor: edge,
          lineWidth: ["interpolate", ["linear"], ["zoom"], 16, 0.5, 19, 1.3],
          lineOpacity: fade(1),
          lineEmissiveStrength: 1,
        }}
      />
      <NativeLineLayer
        id="indoor-outline"
        minZoomLevel={INDOOR_KEEP_ZOOM}
        filter={isKind("outline")}
        style={{
          lineColor: dark ? "#CBD5E1" : "#334155",
          lineWidth: ["interpolate", ["linear"], ["zoom"], 16, 1, 19, 2.4],
          lineOpacity: fade(0.9),
          lineEmissiveStrength: 1,
        }}
      />
      <NativeLineLayer
        id="indoor-selected"
        minZoomLevel={INDOOR_KEEP_ZOOM}
        filter={["all", ["==", ["get", "id"], selectedId ?? ""], ["!=", ["get", "kind"], "amenity"]]}
        style={{ lineColor: "#FF6F00", lineWidth: ["interpolate", ["linear"], ["zoom"], 16, 2, 19, 4], lineEmissiveStrength: 1 }}
      />
      <NativeLineLayer
        id="indoor-openings"
        minZoomLevel={INDOOR_MIN_ZOOM}
        filter={isKind("opening")}
        style={{
          lineColor: ["get", "color"],
          lineWidth: ["interpolate", ["linear"], ["zoom"], 16, 2, 18, 4, 20, 8],
          lineCap: "round",
          lineEmissiveStrength: 1,
        }}
      />
      <NativeCircleLayer
        id="indoor-amenities"
        minZoomLevel={17}
        filter={isKind("amenity")}
        style={{
          circleRadius: ["interpolate", ["linear"], ["zoom"], 17, 3.5, 19, 6.5],
          circleColor: ["get", "color"],
          circleStrokeColor: ["case", ["==", ["get", "id"], selectedId ?? ""], "#FF6F00", "#FFFFFF"],
          circleStrokeWidth: ["case", ["==", ["get", "id"], selectedId ?? ""], 3, 1.5],
          circleEmissiveStrength: 1,
        }}
      />
      <NativeSymbolLayer
        id="indoor-labels"
        minZoomLevel={17}
        filter={["!=", ["get", "label"], ""]}
        style={{
          textField: ["get", "label"],
          textSize: ["interpolate", ["linear"], ["zoom"], 17, 10.5, 19, 13],
          textColor: dark ? "#E5E7EB" : "#1F2937",
          textHaloColor: dark ? "#111827" : "#FFFFFF",
          textHaloWidth: 1.4,
          textMaxWidth: 8,
          textOffset: ["case", ["==", ["get", "kind"], "amenity"], ["literal", [0, 1.15]], ["literal", [0, 0]]],
          textAnchor: ["case", ["==", ["get", "kind"], "amenity"], "top", "center"],
          // Points' labels win over spaces' when they collide.
          symbolSortKey: ["-", 0, ["get", "rank"]],
          textEmissiveStrength: 1,
        }}
      />
    </NativeShapeSource>
  );
});
