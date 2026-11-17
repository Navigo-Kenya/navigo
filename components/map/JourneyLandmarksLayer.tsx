// components/map/JourneyLandmarksLayer.tsx
//
// The landmarks of the active journey, always named on the map: where to
// board, where to get off (orange ring + "Get off after …"), what you pass on
// the ride and what marks each turn. Badges come from PoiLayer's images
// (poi-<category>), so the two layers look like one.
import React, { memo, useMemo } from "react";
import { CircleLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import type { Route } from "@/services/route";
import { asLandmark } from "@/utils/landmarks";

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;

const ORANGE = "#FF6F00";

type Role = "alight" | "board" | "along" | "turn";

interface Props {
  route: Route | null | undefined;
  dark: boolean;
}

/** POI ids drawn here, so PoiLayer can leave them out (no double badges). */
export function journeyLandmarkIds(route: Route | null | undefined): string[] {
  return buildFeatures(route).map((f) => String(f.properties.poiId)).filter((id) => id !== "null");
}

function buildFeatures(route: Route | null | undefined) {
  const out: { type: "Feature"; geometry: GeoJSON.Point; properties: Record<string, any> }[] = [];
  const seen = new Set<string>();
  const push = (lm: any, role: Role, label: string) => {
    const l = asLandmark(lm);
    if (!l || l.lat == null || l.lng == null) return;
    const key = l.id != null ? String(l.id) : `${l.lat},${l.lng}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: {
        poiId: l.id,
        icon: `poi-${l.category ?? "services"}`,
        role,
        label,
        // Draw order: alight on top, then boarding, turns, ride landmarks.
        sort: role === "alight" ? 4 : role === "board" ? 3 : role === "turn" ? 2 : 1,
      },
    });
  };

  for (const seg of route?.segments ?? []) {
    if (seg.stops?.length) {
      push(seg.to.landmark, "alight", `Get off after ${asLandmark(seg.to.landmark)?.name ?? ""}`);
      push(seg.from.landmark, "board", asLandmark(seg.from.landmark)?.name ?? "");
      for (const a of seg.landmarks_along ?? []) {
        push({ ...a, relation: "near", text: a.name }, "along", a.name);
      }
    }
    for (const st of seg.walk_steps ?? []) {
      if (st.landmark) push(st.landmark, "turn", st.landmark.name);
    }
  }
  return out;
}

export const JourneyLandmarksLayer = memo(function JourneyLandmarksLayer({ route, dark }: Props) {
  const shape = useMemo<GeoJSON.FeatureCollection>(
    () => ({ type: "FeatureCollection", features: buildFeatures(route) }),
    [route]
  );
  const isAlight = ["==", ["get", "role"], "alight"];

  return (
    <NativeShapeSource id="journey-landmarks" shape={shape}>
      {/* Pulse-like ring under the stop to get off at. */}
      <NativeCircleLayer
        id="journey-landmarks-alight-ring"
        filter={isAlight}
        style={{
          circleRadius: ["interpolate", ["linear"], ["zoom"], 12, 11, 17, 19],
          circleColor: ORANGE,
          circleOpacity: 0.18,
          circleStrokeColor: ORANGE,
          circleStrokeWidth: 2.5,
          circlePitchAlignment: "viewport",
        }}
      />
      <NativeSymbolLayer
        id="journey-landmarks-symbols"
        style={{
          iconImage: ["get", "icon"],
          // ["zoom"] must be top level (nested in a case, Mapbox drops the layer).
          iconSize: [
            "interpolate", ["linear"], ["zoom"],
            11, ["case", isAlight, 0.95, 0.7],
            16, ["case", isAlight, 1.1, 0.92],
          ],
          iconAllowOverlap: true,
          iconPitchAlignment: "viewport",
          symbolSortKey: ["get", "sort"],
          textField: ["get", "label"],
          textSize: ["case", isAlight, 13, 11.5],
          textColor: ["case", isAlight, ORANGE, dark ? "#F4F4F5" : "#1F2937"],
          textHaloColor: dark ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.96)",
          textHaloWidth: 1.8,
          textVariableAnchor: ["left", "right", "top", "bottom"],
          textRadialOffset: 1.25,
          textJustify: "auto",
          textMaxWidth: 10,
          textOptional: true,
          // Not data-driven in Mapbox: the alight label wins via its sort key.
          textAllowOverlap: false,
        }}
      />
    </NativeShapeSource>
  );
});
