// components/app/StopsLayer.tsx
import React, { useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import { ShapeSource, CircleLayer, SymbolLayer, Images } from "@rnmapbox/maps";
import type { StopCategory } from "@/components/icons/NavigoIcons";

type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stop_type?: string | null;
  location_t?: number;
  mode_badge?: string | null;
  mode?: string | null;
  route_nams?: string | null;
};

const ORANGE = "#FF6F00";
const STOPS_MIN_ZOOM = 11.5;

/** Zoom at which major stations switch from dots to icon badges. */
const MAJOR_ICON_ZOOM = 13;
/** Zoom at which regular stops switch from dots to icon badges. */
const BUS_ICON_ZOOM = 14.5;
/** Zoom at which station names appear next to their badge. */
const MAJOR_LABEL_ZOOM = 14.5;
/** Zoom at which regular stop names appear (they're dense, so later). */
const BUS_LABEL_ZOOM = 16;

/** Colour per stop type. Shared by the dots and the badges. */
/** Lighter shades for stop names on the dark map style. */
const STOP_LABEL_COLORS_DARK: Record<StopCategory, string> = {
  rail: "#4ADE80",
  metro: "#A78BFA",
  brt: "#F87171",
  ferry: "#38BDF8",
  tram: "#F472B6",
  airport: "#CBD5E1",
  cable: "#A3E635",
  terminal: "#FB923C",
  bus: "#60A5FA",
};

export const STOP_COLORS: Record<StopCategory, string> = {
  rail: "#16A34A",
  metro: "#7C3AED",
  brt: "#DC2626",
  ferry: "#0284C7",
  tram: "#DB2777",
  airport: "#334155",
  cable: "#65A30D",
  terminal: "#EA580C",
  bus: "#2563EB",
};

/**
 * Marker badge per stop type: a 30pt circle in the type's colour with a white
 * ring and the white StopTypeGlyph from NavigoIcons, on a 36pt transparent
 * canvas (room for a soft shadow). Pre-rendered at @1x/@2x/@3x.
 *
 * These are static PNGs on purpose: rendering React views into map images at
 * runtime (rnmapbox <Image> children) is unreliable on the new architecture
 * ("Image supports max 1 subview", badges never appearing). If a glyph or
 * colour changes, regenerate the PNGs.
 */
const STOP_BADGE_IMAGES: Record<`stop-${StopCategory}`, number> = {
  "stop-bus": require("@/assets/images/stops/stop-bus.png"),
  "stop-terminal": require("@/assets/images/stops/stop-terminal.png"),
  "stop-rail": require("@/assets/images/stops/stop-rail.png"),
  "stop-metro": require("@/assets/images/stops/stop-metro.png"),
  "stop-brt": require("@/assets/images/stops/stop-brt.png"),
  "stop-ferry": require("@/assets/images/stops/stop-ferry.png"),
  "stop-tram": require("@/assets/images/stops/stop-tram.png"),
  "stop-airport": require("@/assets/images/stops/stop-airport.png"),
  "stop-cable": require("@/assets/images/stops/stop-cable.png"),
};

/** Backend stop types (api ConsoleStopController::STOP_TYPES) → marker. */
const STOP_TYPE_CATEGORY: Record<string, StopCategory> = {
  bus_stop: "bus",
  matatu_stage: "bus",
  bus_terminal: "terminal",
  intermodal_hub: "terminal",
  airport: "airport",
  cable_station: "cable",
  rail_station: "rail",
  tram_stop: "tram",
  metro_station: "metro",
  brt_station: "brt",
  ferry_terminal: "ferry",
};

type Props = {
  allStops: Stop[];
  viewCenter: { lat: number; lng: number } | null;
  viewZoom: number;
  selected?: Stop | null;
  onPress: (stop: Stop) => void;
};

export function resolveStopCategory(s: Stop): {
  category: StopCategory;
  color: string;
  isMajor: boolean;
} {
  const st = String(s.stop_type ?? "").toLowerCase();
  const mode = String(s.mode ?? "").toUpperCase();
  const badge = String(s.mode_badge ?? "").toUpperCase();

  // `stop_type` comes from the API (classified from route types on every GTFS
  // import) and is the source of truth. `mode` / `mode_badge` are fallbacks
  // for payloads that only carry the serving route's mode.
  let category: StopCategory =
    STOP_TYPE_CATEGORY[st] ??
    (mode === "RAIL" || badge === "SGR" || badge === "RAIL" ? "rail"
      : mode === "TRAM" ? "tram"
      : mode === "SUBWAY" || badge === "METRO" ? "metro"
      : mode === "BRT" || badge === "BRT" ? "brt"
      : mode === "FERRY" ? "ferry"
      : "bus");
  // A GTFS station (location_type 1) is at least a terminal.
  if (category === "bus" && s.location_t === 1) category = "terminal";

  return {
    category,
    color: STOP_COLORS[category],
    isMajor: category !== "bus",
  };
}

function StopsLayer({ allStops, selected, onPress }: Props) {
  const dark = useColorScheme() === "dark";
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
            icon: `stop-${meta.category}`,
            color: meta.color,
            labelColor: dark
              ? STOP_LABEL_COLORS_DARK[meta.category]
              : meta.color,
            isMajor: meta.isMajor,
          },
        };
      }),
    }),
    [allStops, dark]
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

  // No early return below STOPS_MIN_ZOOM: every layer has its own
  // minZoomLevel. Removing and re-adding the "stops" source while zooming in
  // and out around the threshold raced on the native side ("Source 'stops'
  // is not in style") and could crash the map.

  const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
  const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
  const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
  const NativeImages = Images as unknown as React.ComponentType<any>;

  // The selected stop is drawn by its own layer on top, so the regular
  // layers leave it out.
  const notSelected = (f: any[]) =>
    selectedId ? (["all", f, ["!=", ["get", "id"], selectedId]] as any) : (f as any);
  // Matches nothing when no stop is selected (stop ids are never empty).
  const selectedFilter = ["==", ["get", "id"], selectedId ?? ""] as any;
  const isMajor = ["==", ["get", "isMajor"], true];
  const isRegular = ["==", ["get", "isMajor"], false];

  // Stop name beside its badge, Google-Maps style: in the stop type's colour
  // with a halo, placed wherever it fits (right first). Shown from `fromZoom`;
  // Mapbox drops a name that would collide, but keeps the badge.
  const label = (fromZoom: number, size: [number, number]) => ({
    textField: ["step", ["zoom"], "", fromZoom, ["get", "name"]],
    textSize: ["interpolate", ["linear"], ["zoom"], fromZoom, size[0], 18, size[1]],
    textColor: ["get", "labelColor"],
    textHaloColor: dark ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.95)",
    textHaloWidth: 1.6,
    textHaloBlur: 0.4,
    textVariableAnchor: ["left", "right", "top", "bottom"],
    textRadialOffset: 1.15,
    textJustify: "auto",
    textMaxWidth: 9,
    textOptional: true,
    textPitchAlignment: "viewport",
  });

  // Badges grow with zoom.
  const badgeSize = (from: number, small: number, large: number) => [
    "interpolate",
    ["linear"],
    ["zoom"],
    from,
    small,
    18,
    large,
  ];

  return (
    <>
      <NativeImages images={STOP_BADGE_IMAGES} />

      <NativeShapeSource
        id="stops"
        shape={stopsGeoJson}
        hitbox={{ width: 22, height: 22 }}
        onPress={handleSourcePress}
      >
        {/* 1. Zoomed out: plain coloured dots. Major stations from 11.5,
               regular stops from 13; each hands over to its badge. */}
        <NativeCircleLayer
          id="major-stations-bg"
          filter={notSelected(isMajor)}
          minZoomLevel={STOPS_MIN_ZOOM}
          maxZoomLevel={MAJOR_ICON_ZOOM}
          style={{
            circleColor: ["get", "color"],
            circleRadius: ["interpolate", ["linear"], ["zoom"], 11.5, 5, 13, 7],
            circleStrokeWidth: 2,
            circleStrokeColor: "#FFFFFF",
            circlePitchAlignment: "viewport",
          }}
        />

        <NativeCircleLayer
          id="bus-stops-circle-bg"
          filter={notSelected(isRegular)}
          minZoomLevel={13}
          maxZoomLevel={BUS_ICON_ZOOM}
          style={{
            circleColor: ["get", "color"],
            circleRadius: ["interpolate", ["linear"], ["zoom"], 13, 3.5, 14.5, 5.5],
            circleStrokeWidth: 1.5,
            circleStrokeColor: "#FFFFFF",
            circlePitchAlignment: "viewport",
          }}
        />

        {/* 2. Zoomed in: icon badges per stop type. Major stations always
               show; regular stops thin out where they'd collide. */}
        <NativeSymbolLayer
          id="major-stations-icon"
          filter={notSelected(isMajor)}
          minZoomLevel={MAJOR_ICON_ZOOM}
          style={{
            iconImage: ["get", "icon"],
            iconSize: badgeSize(MAJOR_ICON_ZOOM, 0.62, 1),
            iconAllowOverlap: true,
            iconPitchAlignment: "viewport",
            ...label(MAJOR_LABEL_ZOOM, [11.5, 13.5]),
          }}
        />

        <NativeSymbolLayer
          id="bus-stops-icon"
          filter={notSelected(isRegular)}
          minZoomLevel={BUS_ICON_ZOOM}
          style={{
            iconImage: ["get", "icon"],
            iconSize: badgeSize(BUS_ICON_ZOOM, 0.6, 0.86),
            iconAllowOverlap: false,
            iconPitchAlignment: "viewport",
            ...label(BUS_LABEL_ZOOM, [11, 12.5]),
          }}
        />

        {/* 3. Selected stop, at any zoom: soft orange halo plus an enlarged
               badge, drawn last so nothing covers it.
               These must be direct children of ShapeSource (no fragment):
               ShapeSource hands its id only to direct children, and a layer
               without it falls back to Mapbox's "composite" source. They stay
               mounted and simply match nothing when no stop is selected. */}
        <NativeCircleLayer
          id="selected-stop-bg"
          filter={selectedFilter}
          minZoomLevel={STOPS_MIN_ZOOM}
          style={{
            circleColor: ORANGE,
            circleOpacity: 0.22,
            circleRadius: ["interpolate", ["linear"], ["zoom"], 12, 13, 17, 23],
            circleStrokeWidth: 2.5,
            circleStrokeColor: ORANGE,
            circlePitchAlignment: "viewport",
          }}
        />
        <NativeSymbolLayer
          id="selected-stop-icon"
          filter={selectedFilter}
          minZoomLevel={STOPS_MIN_ZOOM}
          style={{
            iconImage: ["get", "icon"],
            iconSize: badgeSize(STOPS_MIN_ZOOM, 0.7, 1.15),
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconPitchAlignment: "viewport",
            // The selected stop's name always shows, a size up. (No custom
            // textFont: a font missing from the style renders no text at all.)
            ...label(STOPS_MIN_ZOOM, [12.5, 14.5]),
            textAllowOverlap: true,
          }}
        />
      </NativeShapeSource>
    </>
  );
}

export default React.memo(
  StopsLayer,
  (prev, next) =>
    prev.allStops === next.allStops &&
    prev.selected?.id === next.selected?.id &&
    prev.onPress === next.onPress
);
