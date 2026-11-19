// components/map/ReportLayer.tsx
//
// Crowdsourced reports on the map, drawn natively by Mapbox:
//   - each report is a 3D pin (pre-rendered PNG, same artwork as ReportSheet)
//     anchored at its tip, newest drawn on top
//   - nearby reports merge into a count bubble via Mapbox clustering
//
// Replaces one <PointAnnotation> per report: those are React views
// snapshotted into bitmaps, which is unreliable on the new architecture
// (pins rendered blank when the icon font wasn't loaded yet) and only fire
// onSelected once until deselected, so tapping a pin a second time did nothing.
//
// Always mounted, with the zoom limit on the layers themselves. Before, the
// source was removed below zoom 11.5 and whenever the list was empty, then
// added back: pinching around 11.5, or a fetch answering with nothing for a
// moment, made every pin blink out and come back (and re-added layers could
// land above the route). The zoom also came from map state that isn't
// updated during the camera's own moves, so pins could stay hidden when
// zoomed in. Mapbox now decides from the real zoom, natively.
import type { TransitReport } from "@/services/report";
import { REPORT_TYPES } from "@/components/icons/reportIcons";
import { Images, ShapeSource, SymbolLayer, CircleLayer } from "@rnmapbox/maps";
import type { MapView } from "@rnmapbox/maps";
import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export const REPORTS_MIN_ZOOM = 11.5;
const CLUSTER_COLOR = "#FF6F00";

/** One pin image per type; regenerate the PNGs when reportIcons.ts changes. */
const REPORT_PIN_IMAGES = {
  "report-traffic_jam":   require("@/assets/images/reports/report-traffic_jam.png"),
  "report-accident":      require("@/assets/images/reports/report-accident.png"),
  "report-road_blocked":  require("@/assets/images/reports/report-road_blocked.png"),
  "report-stage_queue":   require("@/assets/images/reports/report-stage_queue.png"),
  "report-police_check":  require("@/assets/images/reports/report-police_check.png"),
  "report-flooded_route": require("@/assets/images/reports/report-flooded_route.png"),
  "report-breakdown":     require("@/assets/images/reports/report-breakdown.png"),
  "report-security":      require("@/assets/images/reports/report-security.png"),
  "report-fare_hike":     require("@/assets/images/reports/report-fare_hike.png"),
} as const;

export interface ReportLayerHandle {
  /** Kept for compatibility with map.tsx; native layers need no projection. */
  project(): void;
}

interface ReportLayerProps {
  reports:   TransitReport[];
  mapRef:    React.RefObject<MapView | null>;
  /** Hidden without unmounting (the "Live reports" layer switched off). */
  visible?:  boolean;
  /** No longer used: the layers apply their zoom limit natively. */
  viewZoom?: number;
  onPress:   (report: TransitReport, count: number) => void;
}

const NativeShapeSource = ShapeSource as unknown as React.ComponentType<any>;
const NativeSymbolLayer = SymbolLayer as unknown as React.ComponentType<any>;
const NativeCircleLayer = CircleLayer as unknown as React.ComponentType<any>;
const NativeImages = Images as unknown as React.ComponentType<any>;

const isCluster = ["has", "point_count"];
const notCluster = ["!", isCluster];

export const ReportLayer = memo(forwardRef<ReportLayerHandle, ReportLayerProps>(
  function ReportLayer({ reports, visible = true, onPress }, ref) {
    useImperativeHandle(ref, () => ({ project: () => {} }), []);
    const sourceRef = useRef<any>(null);

    // Taps read the latest list through a ref, so a list update never
    // re-renders the source just for a new onPress.
    const byIdRef = useRef(new Map<string, TransitReport>());
    byIdRef.current = useMemo(() => {
      const m = new Map<string, TransitReport>();
      for (const r of reports) m.set(r.id, r);
      return m;
    }, [reports]);
    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;

    const shape = useMemo<GeoJSON.FeatureCollection>(() => ({
      type: "FeatureCollection",
      features: reports
        // Never hand Mapbox a bad coordinate: it crashes natively.
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
        .map((r) => ({
          type: "Feature",
          id: r.id,
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          properties: {
            id: r.id,
            icon: r.type in REPORT_TYPES ? `report-${r.type}` : "report-breakdown",
            // Seconds, so newer reports sort (and draw) above older ones.
            // TomTom incidents have none (0): community reports stay on top.
            ts: Math.floor(new Date(r.created_at).getTime() / 1000) || 0,
            tomtom: r.source === "tomtom",
          },
        })),
    }), [reports]);

    const handlePress = useCallback(async (e: any) => {
      const feature = e?.features?.[0];
      if (!feature) return;

      const count = feature.properties?.point_count;
      if (!count) {
        const report = byIdRef.current.get(feature.properties?.id);
        if (report) onPressRef.current(report, 1);
        return;
      }

      // A cluster: open its newest report, with the cluster size.
      try {
        const leaves = await sourceRef.current?.getClusterLeaves(feature, 100, 0);
        const newest = [...(leaves?.features ?? [])].sort(
          (a: any, b: any) => (b.properties?.ts ?? 0) - (a.properties?.ts ?? 0)
        )[0];
        const report = newest && byIdRef.current.get(newest.properties?.id);
        if (report) onPressRef.current(report, count);
      } catch {
        // Leaves unavailable (e.g. the source just updated): ignore the tap.
      }
    }, []);

    const visibility = visible ? "visible" : "none";

    return (
      <>
        <NativeImages images={REPORT_PIN_IMAGES} />
        <NativeShapeSource
          ref={sourceRef}
          id="reports"
          shape={shape}
          cluster
          clusterRadius={42}
          clusterMaxZoomLevel={15}
          hitbox={{ width: 30, height: 30 }}
          onPress={handlePress}
        >
          {/* Layers must be direct children of ShapeSource (no fragments). */}
          <NativeCircleLayer
            id="reports-cluster"
            filter={isCluster}
            minZoomLevel={REPORTS_MIN_ZOOM}
            style={{
              visibility,
              circleColor: CLUSTER_COLOR,
              circleRadius: ["step", ["get", "point_count"], 15, 5, 18, 15, 22],
              circleStrokeWidth: 3,
              circleStrokeColor: "#FFFFFF",
              circlePitchAlignment: "viewport",
            }}
          />
          <NativeSymbolLayer
            id="reports-cluster-count"
            filter={isCluster}
            minZoomLevel={REPORTS_MIN_ZOOM}
            style={{
              visibility,
              textField: ["get", "point_count_abbreviated"],
              textSize: 13,
              textColor: "#FFFFFF",
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <NativeSymbolLayer
            id="reports-pin"
            filter={notCluster}
            minZoomLevel={REPORTS_MIN_ZOOM}
            style={{
              visibility,
              iconImage: ["get", "icon"],
              iconAnchor: "bottom",
              // The image ends with a ground shadow below the tail; shift it
              // down so the tail tip, not the shadow, marks the location.
              iconOffset: [0, 4],
              // TomTom incidents a little smaller than community reports.
              // ["zoom"] must stay the top-level interpolate input.
              iconSize: [
                "interpolate", ["linear"], ["zoom"],
                11.5, ["case", ["get", "tomtom"], 0.6, 0.72],
                16, ["case", ["get", "tomtom"], 0.85, 1],
              ],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: "viewport",
              symbolSortKey: ["get", "ts"],
            }}
          />
        </NativeShapeSource>
      </>
    );
  }
));
