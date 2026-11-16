// components/map/PoiLayer.tsx
//
// Navigo's own points of interest (Overture Maps + console edits), drawn from
// the API's vector tiles (/tiles/pois/{z}/{x}/{y}.pbf, layer "pois"):
//   - a small badge per category (pre-rendered PNGs, assets/images/pois/)
//   - names from zoom 16, in the category's colour
//   - collisions resolved by importance (hospitals / fuel / hotels win)
// Mapbox's own POIs are hidden while this layer is on, so there's one set of
// places on the map. Tiles are cached by Mapbox's tile cache and the API.
import React, { memo, useMemo } from "react";
import {
  Images,
  StyleImport,
  SymbolLayer,
  VectorSource,
} from "@rnmapbox/maps";
import { BASE_URL } from "@/services/apiClient";
import { POI_CATEGORIES, POI_CATEGORY_KEYS } from "@/components/icons/poiCategories";

const NativeVectorSource = VectorSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeImages = Images as unknown as React.ComponentType<any>;
const NativeStyleImport = StyleImport as unknown as React.ComponentType<any>;

/** One badge per category; regenerate the PNGs when glyphs / colours change. */
const POI_IMAGES = {
  "poi-health":     require("@/assets/images/pois/poi-health.png"),
  "poi-fuel":       require("@/assets/images/pois/poi-fuel.png"),
  "poi-lodging":    require("@/assets/images/pois/poi-lodging.png"),
  "poi-mall":       require("@/assets/images/pois/poi-mall.png"),
  "poi-attraction": require("@/assets/images/pois/poi-attraction.png"),
  "poi-food":       require("@/assets/images/pois/poi-food.png"),
  "poi-cafe":       require("@/assets/images/pois/poi-cafe.png"),
  "poi-nightlife":  require("@/assets/images/pois/poi-nightlife.png"),
  "poi-grocery":    require("@/assets/images/pois/poi-grocery.png"),
  "poi-pharmacy":   require("@/assets/images/pois/poi-pharmacy.png"),
  "poi-bank":       require("@/assets/images/pois/poi-bank.png"),
  "poi-education":  require("@/assets/images/pois/poi-education.png"),
  "poi-worship":    require("@/assets/images/pois/poi-worship.png"),
  "poi-government": require("@/assets/images/pois/poi-government.png"),
  "poi-parking":    require("@/assets/images/pois/poi-parking.png"),
  "poi-shopping":   require("@/assets/images/pois/poi-shopping.png"),
  "poi-services":   require("@/assets/images/pois/poi-services.png"),
};

/** Lighter label colours for the dark map. */
function lighten(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.round(c + (255 - c) * a).toString(16).padStart(2, "0"))
    .join("");
}

export interface TappedPoi {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

interface Props {
  /** Show Navigo POIs (and hide Mapbox's). */
  visible: boolean;
  /**
   * Navigation mode: landmarks only (importance 1: hospitals, fuel, hotels,
   * malls, attractions), quieter badges, no taps. Riders orient by landmarks,
   * but the route, stops and instructions must stay on top.
   */
  navigating?: boolean;
  /** Category search: show only this category (results draw their own pins). */
  focusCategory?: string | null;
  /** POI ids (numeric, as strings) drawn by PoiResultsLayer; left out here. */
  excludeIds?: string[];
  /** The active map style is Mapbox Standard (POIs hidden via its config). */
  standardStyle: boolean;
  dark: boolean;
  onPress: (poi: TappedPoi) => void;
}

const LANDMARKS_ONLY = ["==", ["get", "importance"], 1];

export const PoiLayer = memo(function PoiLayer({
  visible,
  navigating = false,
  focusCategory = null,
  excludeIds,
  standardStyle,
  dark,
  onPress,
}: Props) {
  const filter = useMemo(() => {
    if (navigating) return LANDMARKS_ONLY;
    // Always a real filter: going back to `undefined` may not clear the
    // previous one on the native layer.
    if (!focusCategory) return ["has", "category"];
    const parts: any[] = [["==", ["get", "category"], focusCategory]];
    if (excludeIds?.length) {
      parts.push(["!", ["in", ["to-string", ["get", "id"]], ["literal", excludeIds]]]);
    }
    return ["all", ...parts];
  }, [navigating, focusCategory, excludeIds]);

  const labelColor = useMemo(
    () => [
      "match",
      ["get", "category"],
      ...POI_CATEGORY_KEYS.flatMap((k) => [
        k,
        dark ? lighten(POI_CATEGORIES[k].color, 0.45) : POI_CATEGORIES[k].color,
      ]),
      dark ? "#D4D4D8" : "#4B5563",
    ],
    [dark]
  );

  return (
    <>
      {/* Mapbox's own POIs off while ours are on. */}
      {standardStyle ? (
        <NativeStyleImport
          id="basemap"
          existing
          config={{ showPointOfInterestLabels: !visible }}
        />
      ) : (
        visible && (
          <NativeSymbolLayer id="poi-label" existing style={{ visibility: "none" }} />
        )
      )}

      {visible && (
        <>
          <NativeImages images={POI_IMAGES} />
          <NativeVectorSource
            id="navigo-pois"
            tileUrlTemplates={[`${BASE_URL}/tiles/pois/{z}/{x}/{y}.pbf`]}
            minZoomLevel={11}
            maxZoomLevel={17}
            hitbox={{ width: 26, height: 26 }}
            onPress={(e: any) => {
              if (navigating) return; // no place sheet mid-trip
              const f = e?.features?.[0];
              const [lng, lat] = f?.geometry?.coordinates ?? [];
              if (!f || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
              onPress({
                id: String(f.properties?.id ?? ""),
                name: String(f.properties?.name ?? ""),
                category: String(f.properties?.category ?? "services"),
                lat,
                lng,
              });
            }}
          >
            {/* Layers must be direct children of the source (no fragments). */}
            <NativeSymbolLayer
              id="navigo-pois-symbols"
              sourceLayerID="pois"
              filter={filter}
              style={{
                iconImage: ["concat", "poi-", ["get", "category"]],
                iconSize: navigating
                  ? ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 0.65, 18, 0.8]
                  : ["interpolate", ["linear"], ["zoom"], 11, 0.62, 15, 0.8, 18, 1],
                iconOpacity: navigating ? 0.75 : 1,
                textOpacity: navigating ? 0.8 : 1,
                iconAllowOverlap: false,
                iconPitchAlignment: "viewport",
                symbolSortKey: ["get", "importance"],
                textField: ["step", ["zoom"], "", 16, ["get", "name"]],
                textSize: ["interpolate", ["linear"], ["zoom"], 16, 11, 18, 12.5],
                textColor: labelColor,
                textHaloColor: dark ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.95)",
                textHaloWidth: 1.5,
                textVariableAnchor: ["left", "right", "top", "bottom"],
                textRadialOffset: 1.05,
                textJustify: "auto",
                textMaxWidth: 8,
                textOptional: true,
              }}
            />
          </NativeVectorSource>
        </>
      )}
    </>
  );
});
