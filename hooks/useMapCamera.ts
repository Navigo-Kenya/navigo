import Mapbox from "@rnmapbox/maps";
import { useCallback, useMemo, type RefObject } from "react";
import type { CameraOptions, EdgePadding, LatLng } from "@/providers/map/types";

/**
 * Wraps the @rnmapbox/maps camera API in a stable interface.
 * Accepts a mapRef (MapView) for non-camera operations and a cameraRef (Camera)
 * for all camera animations. Callers in map.tsx are unchanged.
 */
export function useMapCamera(
  mapRef: RefObject<Mapbox.MapView | null>,
  cameraRef: RefObject<Mapbox.Camera | null>,
) {
  const animateTo = useCallback(
    (opts: any) => { // Assumes opts supports your new mode property
      if (!cameraRef.current) return;
      cameraRef.current.setCamera({
        centerCoordinate: opts.center
          ? [opts.center.longitude, opts.center.latitude]
          : undefined,
        zoomLevel:          opts.zoom,
        ...(opts.heading !== undefined ? { heading: opts.heading } : {}),
        pitch:              opts.pitch ?? 0,
        animationDuration:  opts.duration ?? 400,
        // Default to flyTo for flights, linearTo for tight loop tracking, allow manual override.
        animationMode:      opts.mode ?? ((opts.duration ?? 400) <= 250 ? "linearTo" : "flyTo"),
      });
    },
    [cameraRef],
  );

  const fitCoordinates = useCallback(
    (coords: LatLng[], padding: EdgePadding = {}, duration = 500) => {
      if (!cameraRef.current || coords.length === 0) return;
      const lngs = coords.map((c) => c.longitude);
      const lats  = coords.map((c) => c.latitude);
      cameraRef.current.fitBounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
        [padding.top ?? 60, padding.right ?? 40, padding.bottom ?? 80, padding.left ?? 40],
        duration,
      );
    },
    [cameraRef],
  );

  return useMemo(() => ({ animateTo, fitCoordinates }), [animateTo, fitCoordinates]);
}
