// components/map/SelectedPlaceLayer.tsx
//
// The place open in the place sheet, always highlighted on the map: an
// enlarged category badge on an orange ring, with its name. Works for our
// POIs and for Google search results, from any entry point (map tap, list
// row, search screen). Badge images come from PoiLayer (poi-<category>).
import React, { memo, useMemo } from "react";
import { CircleLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import type { ExplorePlaceItem } from "@/store/exploreSearchStore";
import { POI_CATEGORIES, POI_CATEGORY_KEYS } from "@/components/icons/poiCategories";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";

/** POI category key from a place's category label ("Food" → food). */
export function poiCategoryKeyOf(label: string | undefined | null): string {
  const l = String(label ?? "").toLowerCase();
  const byLabel = POI_CATEGORY_KEYS.find((k) => POI_CATEGORIES[k].label.toLowerCase() === l);
  if (byLabel) return byLabel;
  // Google categories (restaurant, hospital, gas station…) → our closest badge.
  if (/restaurant|food|eat/.test(l)) return "food";
  if (/cafe|coffee/.test(l)) return "cafe";
  if (/hospital|clinic|health|doctor/.test(l)) return "health";
  if (/pharmac|chemist/.test(l)) return "pharmacy";
  if (/gas|fuel|petrol/.test(l)) return "fuel";
  if (/hotel|lodg|guest/.test(l)) return "lodging";
  if (/mall/.test(l)) return "mall";
  if (/bank|atm/.test(l)) return "bank";
  if (/school|universit|college/.test(l)) return "education";
  if (/church|mosque|temple|worship/.test(l)) return "worship";
  if (/supermarket|grocer|store/.test(l)) return "grocery";
  if (/park|garden|nature|forest/.test(l)) return "park";
  if (/cinema|movie|theat|music|casino|entertain/.test(l)) return "entertainment";
  if (/stadium|gym|fitness|sport|golf|pool/.test(l)) return "sport";
  if (/museum|monument|attraction|historic|gallery|zoo/.test(l)) return "attraction";
  return "services";
}

export const SelectedPlaceLayer = memo(function SelectedPlaceLayer({
  place,
  dark,
}: {
  place: ExplorePlaceItem | null;
  dark: boolean;
}) {
  const shape = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: place
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [place.lng, place.lat] },
              properties: { icon: `poi-${poiCategoryKeyOf(place.category)}`, name: place.name },
            },
          ]
        : [],
    }),
    [place]
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
      <NativeSymbolLayer
        id="selected-place-badge"
        style={{
          iconImage: ["get", "icon"],
          iconSize: ["interpolate", ["linear"], ["zoom"], 11, 1.05, 17, 1.35],
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
          iconPitchAlignment: "viewport",
          textField: ["get", "name"],
          textSize: 13.5,
          textColor: dark ? "#FDBA74" : "#C2410C",
          textHaloColor: dark ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.97)",
          textHaloWidth: 2,
          textVariableAnchor: ["top", "bottom", "left", "right"],
          textRadialOffset: 1.6,
          textMaxWidth: 11,
          textAllowOverlap: true,
        }}
      />
    </NativeShapeSource>
  );
});
