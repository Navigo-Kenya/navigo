// components/map/IndoorLayer.tsx
//
// The inside of the venue the map is looking at, one level at a time, drawn
// over the street map from zoom 16: the floor (the level's outline, its
// corridor), spaces filled by what they are (platform, hall, shop), their
// edges, the venue's outline, doors as coloured strokes and points as their
// badges (escalator, lift, stairs, WC, ATM...: navigo-icons), with names
// from zoom 17 written the way the plan writes them (lines, size, angle).
//
// Always mounted, empty when there's nothing to show: a source added later
// would land above the route, stops and reports.
import type { IndoorVenue } from "@/services/venues";
import { NAVIGO_BADGES } from "@/assets/icons/navigo/badges";
import { INDOOR_KEEP_ZOOM, INDOOR_MIN_ZOOM, levelShape } from "@/utils/indoor";
import { FillLayer, Images, LineLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import React, { memo, useMemo, useRef } from "react";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeFillLayer = FillLayer as unknown as React.ComponentType<any>;
const NativeLineLayer = LineLayer as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeImages = Images as unknown as React.ComponentType<any>;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const RANK: Record<string, number> = { amenity: 3, opening: 2, unit: 1 };
/** Fades in over the first half zoom, so the floor doesn't pop. */
const fade = (to: number) => ["interpolate", ["linear"], ["zoom"], INDOOR_KEEP_ZOOM, 0, INDOOR_MIN_ZOOM + 0.3, to];
/** A label's size: its plan size at zoom 19, smaller further out, larger closer in. */
const LABEL_SIZE = ["interpolate", ["exponential", 1.6], ["zoom"], 17, ["*", ["get", "px"], 0.55], 19, ["get", "px"], 21, ["*", ["get", "px"], 1.8]];

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
    // Points over doors over spaces; a placed label stands for its space; the floor and outline aren't places.
    const top = [...(e?.features ?? [])]
      .map((f: any) => (f?.properties?.kind === "label" ? { properties: { id: f.properties.of, kind: "unit" } } : f))
      .filter((f: any) => f?.properties?.kind in RANK)
      .sort((a: any, b: any) => RANK[b.properties.kind] - RANK[a.properties.kind])[0];
    if (top?.properties?.id) onPressRef.current(String(top.properties.id));
  };

  const isKind = (k: string) => ["==", ["get", "kind"], k];
  const edge = dark ? "#4B5563" : "#A3AEBD";
  const text = {
    textColor: dark ? "#E5E7EB" : "#1F2937",
    textHaloColor: dark ? "#111827" : "#FFFFFF",
    textHaloWidth: 1.4,
    textSize: LABEL_SIZE,
    textRotate: ["get", "labelRotate"],
    textRotationAlignment: "map",
    textEmissiveStrength: 1,
  };

  return (
    <>
      <NativeImages images={NAVIGO_BADGES} />
      <NativeShapeSource id="indoor-src" shape={shape} onPress={handlePress} hitbox={{ width: 14, height: 14 }}>
        <NativeFillLayer
          id="indoor-floor"
          minZoomLevel={INDOOR_KEEP_ZOOM}
          filter={isKind("floor")}
          style={{ fillColor: ["get", "color"], fillOpacity: fade(0.97), fillEmissiveStrength: 1 }}
        />
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
          id="indoor-floor-wall"
          minZoomLevel={INDOOR_KEEP_ZOOM}
          filter={isKind("floor")}
          style={{
            lineColor: dark ? "#E5E7EB" : "#2B2A27",
            lineWidth: ["interpolate", ["linear"], ["zoom"], 16, 1, 19, 2.6],
            lineOpacity: fade(0.95),
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
            lineOpacity: fade(0.6),
            lineDasharray: [3, 2],
            lineEmissiveStrength: 1,
          }}
        />
        <NativeLineLayer
          id="indoor-selected"
          minZoomLevel={INDOOR_KEEP_ZOOM}
          filter={["all", ["==", ["get", "id"], selectedId ?? ""], ["any", isKind("unit"), isKind("opening")]]}
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
        <NativeSymbolLayer
          id="indoor-amenities"
          minZoomLevel={17}
          filter={isKind("amenity")}
          style={{
            iconImage: ["get", "icon"],
            // The images are 84 px (28 at 3x): about 18 px at zoom 17, 34 at 20.
            iconSize: ["interpolate", ["linear"], ["zoom"], 17, ["case", ["==", ["get", "id"], selectedId ?? ""], 0.3, 0.22], 20, ["case", ["==", ["get", "id"], selectedId ?? ""], 0.52, 0.4]],
            iconRotate: ["get", "rotate"],
            iconRotationAlignment: "map",
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
          }}
        />
        <NativeSymbolLayer
          id="indoor-labels"
          minZoomLevel={17}
          filter={["all", ["!=", ["get", "label"], ""], ["any", isKind("unit"), isKind("amenity")]]}
          style={{
            ...text,
            textField: ["get", "label"],
            textMaxWidth: 8,
            // A named point writes its name under its symbol.
            textOffset: ["case", isKind("amenity"), ["literal", [0, 1.3]], ["literal", [0, 0]]],
            textAnchor: ["case", isKind("amenity"), "top", "center"],
            // Points' names win over spaces' when they collide; anchors' over small shops'.
            symbolSortKey: ["-", 0, ["+", ["get", "rank"], ["/", ["get", "px"], 100]]],
          }}
        />
        <NativeSymbolLayer
          id="indoor-placed-labels"
          minZoomLevel={17}
          filter={isKind("label")}
          style={{ ...text, textField: ["get", "label"], textMaxWidth: 12 }}
        />
      </NativeShapeSource>
    </>
  );
});
