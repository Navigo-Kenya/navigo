// utils/flyThrough.ts
// Route-preview fly-through: keyframes sampled at equal distance along the
// journey polyline, each with the local travel bearing, so the camera can
// sweep the whole route in ~4 s before "Start" (Google Maps-style).

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface FlyKeyframe {
  center: LatLng;
  heading: number; // travel bearing at this point (deg, 0 = north)
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distM(a: LatLng, b: LatLng): number {
  const dy = (b.latitude - a.latitude) * 111_320;
  const dx = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Sample `count` keyframes at equal distance intervals along the polyline.
 * Headings are smoothed against the previous keyframe so the camera doesn't
 * whip around at jagged vertices.
 */
export function buildFlyThroughKeyframes(coords: LatLng[], count = 6): FlyKeyframe[] {
  if (coords.length < 2) return [];

  // Cumulative distances.
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distM(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1];
  if (total < 50) return []; // journeys under 50 m aren't worth a tour

  const frames: FlyKeyframe[] = [];
  let prevHeading: number | null = null;

  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);

    // Segment containing this distance.
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const segStart = coords[i - 1];
    const segEnd   = coords[i];
    const segLen   = cum[i] - cum[i - 1];
    const t        = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;

    const center: LatLng = {
      latitude:  segStart.latitude  + t * (segEnd.latitude  - segStart.latitude),
      longitude: segStart.longitude + t * (segEnd.longitude - segStart.longitude),
    };

    // Look-ahead bearing (toward a point ~10% further along), smoothed.
    const aheadIdx = Math.min(coords.length - 1, i + Math.ceil(coords.length * 0.08));
    let heading = bearingDeg(center, coords[aheadIdx]);
    if (prevHeading != null) {
      const diff = ((heading - prevHeading + 540) % 360) - 180;
      heading = (prevHeading + diff * 0.6 + 360) % 360;
    }
    prevHeading = heading;

    frames.push({ center, heading });
  }

  return frames;
}

/** Zoom that keeps the sweep legible for the journey's size. */
export function flyThroughZoom(totalDistanceM: number): number {
  if (totalDistanceM < 1500)  return 15.5;
  if (totalDistanceM < 5000)  return 14.5;
  if (totalDistanceM < 12000) return 13.5;
  return 12.5;
}
