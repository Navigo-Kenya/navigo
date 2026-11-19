// components/map/SelectedPlaceLayer.tsx
//
// The place open in the place sheet, always highlighted on the map: an
// enlarged category badge on an orange ring, with its name. Works for our
// POIs and for Google search results, from any entry point (map tap, list
// row, search screen). Badge images come from PoiLayer (poi-<category>).
// A place without a category (an address, a road, an area, a station) gets
// a plain orange pin in the ring instead of a badge (services/placeCategory).
import React, { memo, useMemo } from "react";
import { CircleLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import type { ExplorePlaceItem } from "@/store/exploreSearchStore";
import { poiCategoryOf } from "@/services/placeCategory";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";
const HAS_BADGE = ["!=", ["get", "icon"], ""];
const NO_BADGE = ["==", ["get", "icon"], ""];

/** POI category key from a place's category label ("Food" → food, "Shopping mall" → mall). */
export function poiCategoryKeyOf(label: string | undefined | null): string | null {
  return poiCategoryOf(label);
}

export const SelectedPlaceLayer = memo(function SelectedPlaceLayer({
  place,
  dark,
}: {
  place: ExplorePlaceItem | null;
  dark: boolean;
}) {
  const shape = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!place) return { type: "FeatureCollection", features: [] };
    const key = poiCategoryOf(place.category);
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [place.lng, place.lat] },
          properties: { icon: key ? `poi-${key}` : "", name: place.name },
        },
      ],
    };
  }, [place]);

  const text = useMemo(
    () => ({
      textField: ["get", "name"],
      textSize: 13.5,
      textColor: dark ? "#FDBA74" : "#C2410C",
      textHaloColor: dark ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.97)",
      textHaloWidth: 2,
      textVariableAnchor: ["top", "bottom", "left", "right"],
      textRadialOffset: 1.6,
      textMaxWidth: 11,
      textAllowOverlap: true,
    }),
    [dark]
  );

  // Always mounted (an empty shape when nothing is selected): no source churn.
  return (
    <NativeShapeSource id="selected-place" shape={shape}>
      <NativeCircleLayer
        id="selected-place-ring"
        style={{
          circleRadius: ["interpolate", ["linear"], ["zoom"], 11, 14, 17, 21],
          circleColor: ORANGE,
          circleOpacity: 0.2,
          circleStrokeColor: ORANGE,
          circleStrokeWidth: 2.5,
          circlePitchAlignment: "viewport",
        }}
      />
      {/* No category: a plain pin, not a stand-in badge. */}
      <NativeCircleLayer
        id="selected-place-dot"
        filter={NO_BADGE}
        style={{
          circleRadius: ["interpolate", ["linear"], ["zoom"], 11, 6, 17, 8],
          circleColor: ORANGE,
          circleStrokeColor: "#FFFFFF",
          circleStrokeWidth: 2.5,
          circlePitchAlignment: "viewport",
        }}
      />
      <NativeSymbolLayer
        id="selected-place-badge"
        filter={HAS_BADGE}
        style={{
          iconImage: ["get", "icon"],
          iconSize: ["interpolate", ["linear"], ["zoom"], 11, 1.05, 17, 1.35],
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
          iconPitchAlignment: "viewport",
          ...text,
        }}
      />
      <NativeSymbolLayer
        id="selected-place-name"
        filter={NO_BADGE}
        style={{ ...text, textRadialOffset: 1.3 }}
      />
    </NativeShapeSource>
  );
});
