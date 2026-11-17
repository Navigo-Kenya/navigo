// utils/traffic.ts
// Plain-language traffic lines for a car / boda route (from the API's
// `traffic`, timed live by TomTom). Nothing is shown without live data.
import type { RouteTraffic, TrafficIncident } from "@/services/route";

export type TrafficTone = "low" | "moderate" | "heavy";

export interface TrafficSummary {
  tone: TrafficTone;
  /** "Light traffic", "+9 min in traffic", "Heavy traffic · +27 min". */
  headline: string;
  /** "2 min slower than usual", "Quicker than usual", "Usual for this time". */
  vsUsual: string | null;
  /** The biggest incident on the route, or "No incidents on this route". */
  incident: string;
  hasIncident: boolean;
}

const mins = (s: number) => Math.max(1, Math.round(s / 60));

export function incidentLine(i: TrafficIncident): string {
  const where = i.from && i.to ? `${i.from} → ${i.to}` : i.from ?? i.to ?? i.road ?? "";
  const delay = i.delay_s && i.delay_s >= 60 ? `${mins(i.delay_s)} min` : null;
  return [i.description, where, delay].filter(Boolean).join(" · ");
}

export function trafficSummary(t?: RouteTraffic | null): TrafficSummary | null {
  if (!t?.live || t.delay_s == null) return null;
  const tone: TrafficTone = t.level ?? "low";
  const delay = t.delay_s;

  const headline =
    delay < 60
      ? "Clear roads"
      : tone === "heavy"
      ? `Heavy traffic · +${mins(delay)} min`
      : tone === "moderate"
      ? `+${mins(delay)} min in traffic`
      : `Light traffic · +${mins(delay)} min`;

  let vsUsual: string | null = null;
  if (t.vs_typical_s != null) {
    const d = t.vs_typical_s;
    vsUsual =
      Math.abs(d) < 120
        ? "Usual for this time"
        : d > 0
        ? `${mins(d)} min slower than usual`
        : `${mins(-d)} min quicker than usual`;
  }

  const first = t.incidents?.[0];
  return {
    tone,
    headline,
    vsUsual,
    incident: first ? incidentLine(first) : "No incidents on this route",
    hasIncident: !!first,
  };
}
