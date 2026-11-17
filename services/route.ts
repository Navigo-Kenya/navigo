// services/route.ts
import type { AlongLandmark, Landmark } from "@/utils/landmarks";
import type { UnifiedLocation } from "@/store/journeyStore";
import { fetchApi } from "./apiClient";

export interface WalkStep {
  instruction: string;
  note?: string | null;
  distance: number;
  duration?: number;
  lat: number;
  lng: number;
  /** Landmark at this manoeuvre ("after Java House"). */
  landmark?: Landmark | null;
}

export interface RouteStop {
  stop_id?: string | null;
  stop_code?: string | null;
  platform_code?: string | null;
  name: string;
  lat: number;
  lng: number;
}

export interface SegmentFare {
  amount: number;
  currency: string;
  confidence: "exact" | "zone";
}

export interface NextDepartureItem {
  departure_time: string;
  eta_seconds: number;
  eta_label: string;
  /** Stops the trip still serves before this one (null for headway-based trips). */
  stops_away: number | null;
  /** No occupancy feed yet: always null for now, never invented. */
  crowding: "Empty" | "Comfy" | "Busy" | null;
  headsign?: string | null;
  /** Set for headway-based trips ("every 15 min"). */
  headway_secs?: number | null;
  source?: "schedule" | "frequency";
}

export interface TrafficSegment {
  congestion: "low" | "moderate" | "heavy";
  color: string; // "#16A34A" | "#FACC15" | "#EF4444"
  coordinates: [number, number][]; // [[lat, lng], ...]
}

export interface RouteSegment {
  mode: "WALK" | "BUS" | "BRT" | "TRAM" | "SUBWAY" | "RAIL" | "FERRY" | "BICYCLE" | "CAR";
  route_type?: number | null;
  mode_badge?: string;
  duration: number;
  distance: number;
  route_id?: string | null;
  route_name?: string;
  route_long_name?: string | null;
  headsign?: string | null;
  agency_name?: string | null;
  route_color?: string | null;
  route_text_color?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  polyline?: string;
  coordinates: [number, number][];
  walk_steps: WalkStep[];
  stops?: RouteStop[];
  stop_count?: number;
  next_departures?: NextDepartureItem[];
  traffic_segments?: TrafficSegment[];
  from: {
    stop_id?: string | null;
    stop_code?: string | null;
    platform_code?: string | null;
    name: string;
    lat: number;
    lng: number;
    /** Where to board ("opposite Sarit Centre"); older payloads send a string. */
    landmark?: Landmark | string | null;
  };
  to: {
    stop_id?: string | null;
    stop_code?: string | null;
    platform_code?: string | null;
    name: string;
    lat: number;
    lng: number;
    /** Where to alight ("just after Oryx Energies"). */
    landmark?: Landmark | null;
  };
  /** Landmarks passed on this transit leg, in order. */
  landmarks_along?: AlongLandmark[];
  fare?: SegmentFare | null;
}

export interface Route {
  polyline_encoding: "google";
  is_ai_derived?: boolean;
  type: "direct" | "transfer";
  category?: "bus" | "rail" | "mixed" | "walk" | "bicycle" | "car";
  primary_modes?: string[];
  transfer_count?: number;
  departure_time?: string | null;
  arrival_time?: string | null;
  schedule_notice?: string | null;
  summary: string;
  total_duration: number;
  total_walk_distance: number;
  total_distance: number;
  route_badge?: string | null;
  segments: RouteSegment[];
  safety?: { score: number; safer: boolean };
}

function getLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLocalTime(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Nairobi",
  }).formatToParts(new Date());

  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ampm = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? "AM"
  ).toLowerCase();

  return `${hour}:${minute}${ampm}`;
}

export const RouteService = {
  async calculateJourney(
    fromLoc: UnifiedLocation,
    toLoc: UnifiedLocation,
    maxWalkMeters?: number,
    mode: "transit" | "bus" | "rail" | "walk" | "bicycle" | "car" = "transit",
    customTime?: { date?: string; time?: string; arriveBy?: boolean }
  ): Promise<Route[]> {
    const payload: Record<string, unknown> = {
      from: { lat: fromLoc.lat, lng: fromLoc.lng },
      to: { lat: toLoc.lat, lng: toLoc.lng },
      date: customTime?.date ?? getLocalDate(),
      time: customTime?.time ?? getLocalTime(),
      mode,
    };
    if (customTime?.arriveBy !== undefined) {
      payload.arrive_by = customTime.arriveBy;
    }
    if (maxWalkMeters !== undefined) payload.max_walk_distance = maxWalkMeters;

    try {
      const data = await fetchApi<{ data: Route[] }>("/journey/calculate", {
        method: "POST",
        body: JSON.stringify(payload),
        // Transit planning can take ~5-8 s cold (OTP + walk legs) and the
        // late-night fallback runs a second search: 15 s was too tight.
        timeout: 30000,
      });
      return data.data ?? [];
    } catch (error: any) {
      if (error?.status === 503) {
        throw new Error(
          error.message ??
            "Route planning is temporarily unavailable. Please try again in a moment."
        );
      }
      throw error;
    }
  },
};