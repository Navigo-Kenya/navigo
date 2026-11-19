// utils/roads.ts
//
// How "Your roads" reads a road: when it's in use, in words, and its line
// as a map image (Mapbox Static: one path, in Navigo orange).
import type { Road, RoadWindow } from "@/services/corridors";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function daysText(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const key = d.join(",");
  if (key === "1,2,3,4,5,6,7") return "Every day";
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "6,7") return "Weekends";
  return d.map((n) => DAY[n] ?? "").filter(Boolean).join(", ");
}

/** "Weekdays 05:30–09:30"; several windows joined. */
export function windowsText(windows: RoadWindow[]): string {
  if (!windows.length) return "Any time";
  return windows.map((w) => `${daysText(w.days)} ${w.from}–${w.to}`).join(" · ");
}

export function sourceText(source: Road["source"]): string {
  if (source === "home_work") return "From Home and Work";
  if (source === "work_home") return "From Home and Work";
  return "A saved route";
}

/** Google's encoded polyline (precision 5), as Mapbox Static's path() takes it. */
export function encodePolyline(points: [number, number][]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

/** The road on a map image, ends marked, framed to fit; null without a line. */
export function roadMapUrl(path: [number, number][], dark: boolean, token: string, size = { w: 640, h: 240 }): string | null {
  const pts = path.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pts.length < 2) return null;
  // Keep the URL short: at most ~120 points.
  const step = Math.max(1, Math.ceil(pts.length / 120));
  const thin = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const line = encodeURIComponent(encodePolyline(thin));
  const [aLat, aLng] = thin[0];
  const [bLat, bLng] = thin[thin.length - 1];
  const style = dark ? "dark-v11" : "streets-v12";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/` +
    `path-5+ff6f00-0.9(${line}),pin-s+10b981(${aLng.toFixed(5)},${aLat.toFixed(5)}),pin-s+ff6f00(${bLng.toFixed(5)},${bLat.toFixed(5)})` +
    `/auto/${size.w}x${size.h}@2x?padding=36&access_token=${token}`
  );
}
