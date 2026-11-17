import Mapbox from "@rnmapbox/maps";
import { useCallback, useMemo, type RefObject } from "react";
import { Dimensions } from "react-native";
import type { EdgePadding, LatLng } from "@/providers/map/types";
import { computeFit } from "@/utils/cameraFit";

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
        // Always set padding: the native camera keeps the last one (e.g. from
        // fitBounds), which would push every later move off-centre.
        padding: {
          paddingTop:    opts.padding?.top ?? 0,
          paddingRight:  opts.padding?.right ?? 0,
          paddingBottom: opts.padding?.bottom ?? 0,
          paddingLeft:   opts.padding?.left ?? 0,
        },
        animationDuration:  opts.duration ?? 400,
        // Default to flyTo for flights, linearTo for tight loop tracking, allow manual override.
        animationMode:      opts.mode ?? ((opts.duration ?? 400) <= 250 ? "linearTo" : "flyTo"),
      });
    },
    [cameraRef],
  );

  // Fit computed in JS (utils/cameraFit) rather than with Camera.fitBounds:
  // on Android that counts the padding left by the previous fit, so every
  // refit (new category, "Search this area") zoomed out further.
  const fitCoordinates = useCallback(
    (coords: LatLng[], padding: EdgePadding = {}, duration = 500) => {
      if (!cameraRef.current || coords.length === 0) return;
      const { width, height } = Dimensions.get("window");
      const fit = computeFit(
        coords,
        { top: padding.top ?? 60, right: padding.right ?? 40, bottom: padding.bottom ?? 80, left: padding.left ?? 40 },
        width,
        height,
      );
      if (!fit) return;
      cameraRef.current.setCamera({
        centerCoordinate:  fit.center,
        zoomLevel:         fit.zoom,
        heading:           0,
        pitch:             0,
        padding: {
          paddingTop:    fit.padding.top,
          paddingRight:  fit.padding.right,
          paddingBottom: fit.padding.bottom,
          paddingLeft:   fit.padding.left,
        },
        animationDuration: duration,
        animationMode:     "easeTo",
      });
    },
    [cameraRef],
  );

  return useMemo(() => ({ animateTo, fitCoordinates }), [animateTo, fitCoordinates]);
}
