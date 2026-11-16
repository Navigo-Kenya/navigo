// components/map/PoiResultsLayer.tsx
//
// Pins for a category search (Restaurant, Fuel, ...): the results listed in
// the results sheet, drawn at every zoom with the POI badges (images come
// from PoiLayer). Nearest results sit on top; the selected one is enlarged
// and always named. Tapping a pin selects that place.
import React, { memo, useMemo } from "react";
import { ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import type { ExplorePlaceItem } from "@/store/exploreSearchStore";
import { POI_CATEGORIES } from "@/components/icons/poiCategories";
import type { PoiCategory } from "@/components/icons/NavigoIcons";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;

interface Props {
  places: ExplorePlaceItem[];
  category: PoiCategory;
  selectedId: string | null;
  dark: boolean;
  onPress: (place: ExplorePlaceItem) => void;
}

export const PoiResultsLayer = memo(function PoiResultsLayer({
  places,
  category,
  selectedId,
  dark,
  onPress,
}: Props) {
  const shape = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: places.map((p, i) => ({
        type: "Feature",
        id: p.id,
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          name: p.name,
          selected: p.id === selectedId,
          // Nearest on top; the selected pin above everything.
          sort: p.id === selectedId ? 1000 : places.length - i,
        },
      })),
    }),
    [places, selectedId]
  );

  const color = POI_CATEGORIES[category]?.color ?? "#6B7280";
  const isSelected = ["==", ["get", "selected"], true];

  return (
    <NativeShapeSource
      id="poi-results"
      shape={shape}
      hitbox={{ width: 30, height: 30 }}
      onPress={(e: any) => {
        const id = e?.features?.[0]?.properties?.id;
        const place = places.find((p) => p.id === id);
        if (place) onPress(place);
      }}
    >
      <NativeSymbolLayer
        id="poi-results-symbols"
        style={{
          iconImage: `poi-${category}`,
          iconSize: [
            "case",
            isSelected,
            1.3,
            ["interpolate", ["linear"], ["zoom"], 11, 0.78, 16, 0.95, 18, 1.05],
          ],
          iconAllowOverlap: true,
          iconPitchAlignment: "viewport",
          symbolSortKey: ["get", "sort"],
          textField: ["case", isSelected, ["get", "name"], ["step", ["zoom"], "", 15, ["get", "name"]]],
          textSize: ["case", isSelected, 13, 11.5],
          textColor: dark ? "#F4F4F5" : color,
          textHaloColor: dark ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.95)",
          textHaloWidth: 1.6,
          textVariableAnchor: ["left", "right", "top", "bottom"],
          textRadialOffset: 1.2,
          textJustify: "auto",
          textMaxWidth: 9,
          textOptional: true,
          textAllowOverlap: false,
        }}
      />
    </NativeShapeSource>
  );
});
