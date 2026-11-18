// utils/traffic.ts
// Plain-language traffic lines for a car / boda route (from the API's
// `traffic`, timed live by TomTom). Nothing is shown without live data.
import type { LegTraffic, RouteTraffic, TrafficIncident } from "@/services/route";

export type TrafficTone = "low" | "moderate" | "heavy";

/** Traffic text colours (amber darkened so it reads on white cards too). */
export const TRAFFIC_TONE: Record<TrafficTone, string> = {
  low: "#16A34A",
  moderate: "#D97706",
  heavy: "#DC2626",
};

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

export interface LegTrafficLine {
  tone: TrafficTone;
  /** "~7 min slower than usual: stationary traffic on Thika Road". */
  text: string;
}

/**
 * Matatu leg: a line only when today's traffic adds time (the API already
 * added it to the leg's times). Usual traffic says nothing.
 */
export function legTrafficLine(t?: LegTraffic | null): LegTrafficLine | null {
  if (!t || !t.delay_s || t.delay_s < 60) return null;
  const text = t.note?.trim() || `~${mins(t.delay_s)} min slower than usual`;
  const tone: TrafficTone = t.level === "heavy" ? "heavy" : "moderate";
  return { tone, text };
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
