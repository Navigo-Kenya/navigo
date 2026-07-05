// utils/mapHelpers.ts
import { Ionicons } from "@expo/vector-icons";
import type { RouteSegment } from "@/services/route";

export type Coords = {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
};

export type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dist?: number;
  route_nams?: string | null;
  location_t?: number;
};

export type RouteInfo = {
  distance: number;
  duration: number;
};

// ── EXPANDED MANEUVER DICTIONARY ──
export type Maneuver =
  | "straight" | "turn-left" | "turn-right"
  | "slight-left" | "slight-right" | "sharp-left" | "sharp-right"
  | "u-turn" | "cross" | "roundabout" | "merge" | "start";

export type WalkSubStep = {
  instruction: string;
  note?: string;
  distance: number;
  duration: number;
  lat: number;
  lng: number;
  maneuver: Maneuver;
};

export type RouteStop = { name: string; lat: number; lng: number };

export type Step = {
  instruction?: string;
  name?: string;
  distance: number;
  duration: number;
  location: [number, number];
  type?: "walk" | "depart" | "arrive" | string;
  subSteps?: WalkSubStep[];
  routeName?: string;
  routeColor?: string;
  stops?: RouteStop[];
};

export function dMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function projectOnPolyline(lat: number, lng: number, coords: number[][]): { lat: number, lng: number, dist: number } {
  let minDist = Infinity;
  let pLat = lat;
  let pLng = lng;
  const cosLat = Math.cos(lat * Math.PI / 180);

  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];

    const dx = (lng2 - lng1) * cosLat;
    const dy = (lat2 - lat1);
    const lenSq = dx * dx + dy * dy;

    const px = (lng - lng1) * cosLat;
    const py = (lat - lat1);

    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));

    const projLat = lat1 + t * (lat2 - lat1);
    const projLng = lng1 + t * (lng2 - lng1);

    const d = dMeters({ latitude: lat, longitude: lng }, { latitude: projLat, longitude: projLng });
    if (d < minDist) {
      minDist = d;
      pLat = projLat;
      pLng = projLng;
    }
  }
  return { lat: pLat, lng: pLng, dist: minDist };
}

export function sumLineDistanceMeters(coords: number[][]) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    total += dMeters(
      { latitude: lat1, longitude: lng1 },
      { latitude: lat2, longitude: lng2 },
    );
  }
  return total;
}

export function fallbackInfoBetween(
  from: Coords,
  to: Stop,
  walkMps = 1.35,
): RouteInfo {
  const distance = dMeters(from, { latitude: to.lat, longitude: to.lng });
  const duration = distance / walkMps;
  return { distance, duration };
}

export function bboxFromCoords(
  coords: number[][],
): [number, number, number, number] {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });
  return [minLng, minLat, maxLng, maxLat];
}

export function mToNice(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function sToMin(s: number) {
  if (!s) return "";
  const min = Math.round(s / 60);
  return min <= 1 ? "~1 min" : `~${min} min`;
}

export function humanizeStep(st: Step) {
  if (st.instruction) return st.instruction;
  return `Continue`;
}


// ── STEP ICONS (Mapped to MaterialIcons) ──
export function stepIcon(t?: string) {
  if (t === "arrive") return "place";
  if (t === "depart") return "directions-bus";
  if (t === "walk")   return "directions-walk";
  return "radio-button-checked";
}

// ── NLP INSTRUCTION PARSER ──
export function detectManeuver(instruction: string): Maneuver {
  const s = instruction.toLowerCase();
  if (s.includes("u-turn") || s.includes("uturn")) return "u-turn";
  if (s.includes("roundabout"))                    return "roundabout";
  if (s.includes("sharp left"))                    return "sharp-left";
  if (s.includes("sharp right"))                   return "sharp-right";
  if (s.includes("slight left") || s.includes("keep left") || s.includes("fork left"))  return "slight-left";
  if (s.includes("slight right")|| s.includes("keep right")|| s.includes("fork right")) return "slight-right";
  if (s.includes("merge"))                         return "merge";
  if (s.includes("cross"))                         return "cross";
  if (s.includes("turn left") || s.match(/\bleft\b/))   return "turn-left";
  if (s.includes("turn right") || s.match(/\bright\b/)) return "turn-right";
  return "straight";
}

// ── MANEUVER ICONS (Mapped to MaterialIcons) ──
export function maneuverIcon(m: Maneuver) {
  switch (m) {
    case "turn-left":    return "turn-left";
    case "turn-right":   return "turn-right";
    case "slight-left":  return "turn-slight-left";
    case "slight-right": return "turn-slight-right";
    case "sharp-left":   return "turn-sharp-left";
    case "sharp-right":  return "turn-sharp-right";
    case "u-turn":       return "u-turn-left";
    case "roundabout":   return "roundabout-left";
    case "cross":        return "directions-walk";
    case "merge":        return "merge-type";
    case "start":        return "navigation";
    case "straight":     return "straight";
    default:             return "straight";
  }
}

export function getRouteColor(routeName: string): string {
  if (!routeName) return "#FF6F00"; 
  let hash = 0;
  for (let i = 0; i < routeName.length; i++) {
    hash = routeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 85; 
  const l = 45; 
  const lNorm = l / 100;
  const a = (s * Math.min(lNorm, 1 - lNorm)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export type FareResult =
  | {
      found:      true;
      total:      number;
      currency:   string;
      confidence: "exact" | "zone";
      breakdown:  { routeName: string; amount: number }[];
    }
  | { found: false };

export function extractFares(segments: RouteSegment[]): FareResult {
  const transit = segments.filter((s) => s.mode !== "WALK");
  if (transit.length === 0) return { found: false };
  if (transit.every((s) => !s.fare)) return { found: false };

  const breakdown = transit
    .filter((s) => s.fare != null)
    .map((s) => ({ routeName: s.route_name ?? "Bus", amount: s.fare!.amount }));

  const total    = breakdown.reduce((acc, b) => acc + b.amount, 0);
  const currency = transit.find((s) => s.fare)?.fare?.currency ?? "KES";
  const confidence: "exact" | "zone" = transit.some((s) => s.fare?.confidence === "zone")
    ? "zone"
    : "exact";

  return { found: true, total, currency, confidence, breakdown };
}

export function getReportIcon(type: string) {
  switch (type) {
    case 'stage_queue':   return '🚶‍♂️';
    case 'accident':      return '💥';
    case 'police_check':  return '👮';
    case 'flooded_route': return '🌧️';
    case 'fare_hike':     return '💸';
    default:              return '⚠️';
  }
}