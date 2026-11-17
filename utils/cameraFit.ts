// utils/cameraFit.ts
// Fit a set of coordinates in the visible part of the map (Web Mercator).
// Used instead of Camera.fitBounds, whose Android path (Mapbox's
// cameraForCoordinateBounds) also counts the padding left on the camera by
// the previous fit, so each refit zoomed out further.

export interface FitPadding { top: number; right: number; bottom: number; left: number }
export interface FitResult { center: [number, number]; zoom: number; padding: FitPadding }

/** Mapbox zoom z is 512·2^z px wide (512-px tiles). */
const TILE = 512;
export const FIT_MIN_ZOOM = 3;
export const FIT_MAX_ZOOM = 17;
/** The map area left between the paddings is never smaller than this. */
const MIN_VISIBLE = 96;

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const unmercX = (x: number) => x * 360 - 180;
const unmercY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** Scale two opposite paddings down so at least MIN_VISIBLE px stay between them. */
function shrink(a: number, b: number, size: number): [number, number] {
  const room = Math.max(0, size - MIN_VISIBLE);
  if (a + b <= room || a + b === 0) return [a, b];
  const k = room / (a + b);
  return [Math.floor(a * k), Math.floor(b * k)];
}

export function computeFit(
  coords: { latitude: number; longitude: number }[],
  padding: FitPadding,
  width: number,
  height: number,
): FitResult | null {
  if (!coords.length || width <= 0 || height <= 0) return null;
  const [top, bottom] = shrink(padding.top, padding.bottom, height);
  const [left, right] = shrink(padding.left, padding.right, width);

  const xs = coords.map((c) => mercX(c.longitude));
  const ys = coords.map((c) => mercY(c.latitude));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1e-12);
  const spanY = Math.max(maxY - minY, 1e-12);
  const fit = Math.log2(Math.min((width - left - right) / (spanX * TILE), (height - top - bottom) / (spanY * TILE)));
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, fit));

  return {
    center: [unmercX((minX + maxX) / 2), unmercY((minY + maxY) / 2)],
    zoom,
    padding: { top, right, bottom, left },
  };
}
