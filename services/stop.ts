// services/stop.ts
import api from "./apiClient";

/**
 * Stop types as stored in the API (`stops.stop_type`, see the api's
 * ConsoleStopController::STOP_TYPES). Set from the stop's dominant route type
 * on every GTFS import. `bus_terminal` is only ever inferred on the fly by
 * MobilityExplorerController.
 */
export type StopPoiCategory =
  | "bus_stop"
  | "matatu_stage"
  | "bus_terminal"
  | "intermodal_hub"
  | "brt_station"
  | "rail_station"
  | "metro_station"
  | "tram_stop"
  | "ferry_terminal"
  | "airport"
  | "cable_station";

export interface StopRoute {
  id: string;
  short_name: string;
  long_name?: string;
  route_color?: string | null;
  route_type?: number | null;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stop_code?: string | null;
  stop_type?: StopPoiCategory | string | null;
  location_t?: number;
  platform_code?: string | null;
  landmark?: string | null;
  direction_label?: string | null;
  distance_m?: number | null;
  route_nams?: string | null;
  mode?: "RAIL" | "SUBWAY" | "TRAM" | "BRT" | "FERRY" | "BUS";
  mode_badge?: string;
  badge_color?: string;
}

export interface StopArrivalCountdown {
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

export interface StopRouteBoardItem {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  mode: "RAIL" | "SUBWAY" | "TRAM" | "BRT" | "FERRY" | "BUS";
  mode_badge: string;
  badge_color: string;
  route_color: string;
  agency_name?: string | null;
  direction_id: number;
  headsign: string;
  arrivals: StopArrivalCountdown[];
  /** Why `arrivals` is empty (older API builds omit it). */
  arrivals_status?: "scheduled" | "ended" | "terminates_here" | "not_running_today";
}

export interface StopDeparturesResponse {
  stop: {
    id: string;
    name: string;
    stop_code: string;
    stop_type: StopPoiCategory;
    platform_code?: string | null;
    landmark?: string | null;
    direction_label: string;
    wheelchair_boarding: boolean;
    lat: number;
    lng: number;
  };
  updated_at: string;
  routes: StopRouteBoardItem[];
}

export interface MobilitySearchRouteItem {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  mode: "RAIL" | "SUBWAY" | "TRAM" | "BRT" | "FERRY" | "BUS";
  mode_badge: string;
  route_color: string;
  agency_name?: string | null;
}

export interface MobilitySearchResponse {
  stops: Stop[];
  routes: MobilitySearchRouteItem[];
}

export interface RouteCorridorDirection {
  headsign: string;
  points: [number, number][]; // [lng, lat][]
  stops: Array<{
    stop_id: string;
    name: string;
    stop_code?: string | null;
    stop_type?: string | null;
    platform_code?: string | null;
    lat: number;
    lng: number;
    arrival_time: string;
    departure_time: string;
  }>;
}

export interface RouteCorridorResponse {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  mode: string;
  mode_badge: string;
  route_color: string;
  agency_name?: string | null;
  directions: {
    "0": RouteCorridorDirection;
    "1": RouteCorridorDirection;
  };
}

export const StopService = {
  async getAllStops(): Promise<Stop[]> {
    const res = await api.get<{ data?: Stop[] } | Stop[]>("/stops/all");
    const raw = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return raw.map((s: any) => ({
      ...s,
      lat: Number(s.lat),
      lng: Number(s.lng),
    }));
  },

  async getStopDetails(stopId: string): Promise<{ stop: Stop; routes: StopRoute[] }> {
    try {
      const res = await api.get(`/stops/${encodeURIComponent(stopId)}`);
      const payload = res.data?.data ?? res.data ?? {};
      const routes: StopRoute[] = (payload.routes ?? []).map((r: any) => ({
        id: String(r.route_id ?? r.id ?? r.short_name),
        short_name: String(r.route_short_name ?? r.short_name ?? r.name ?? ""),
        long_name: r.route_long_name ?? r.long_name ?? "",
        route_color: r.route_color ?? null,
        route_type: r.route_type ?? 3,
      }));
      return { stop: payload, routes };
    } catch {
      const dep = await this.getStopDepartures(stopId);
      const routes: StopRoute[] = dep.routes.map((r) => ({
        id: r.route_id,
        short_name: r.route_short_name,
        long_name: r.route_long_name,
        route_color: r.route_color,
        route_type: r.route_type,
      }));
      return { stop: dep.stop as unknown as Stop, routes };
    }
  },

  async getNearbyStops(
    lat: number,
    lng: number,
    radius = 2000,
    limit = 8
  ): Promise<any[]> {
    const res = await api.get("/stops/nearby", {
      params: { lat, lng, radius, limit },
    });
    const list = res.data?.data ?? res.data ?? [];
    return list.map((s: any) => ({
      _type: "stop" as const,
      id: String(s.id),
      name: s.name,
      lat: Number(s.lat),
      lng: Number(s.lng),
      stop_code: s.stop_code ?? null,
      stop_type: s.stop_type ?? null,
      platform_code: s.platform_code ?? null,
      direction_label: s.direction_label ?? s.landmark ?? null,
      route_nams: s.route_nams ?? null,
      mode_badge: s.mode_badge ?? null,
      badge_color: s.badge_color ?? null,
    }));
  },

  async searchStops(query: string, lat?: number, lng?: number): Promise<Stop[]> {
    const res = await api.get<MobilitySearchResponse>("/mobility/search", {
      params: { q: query, lat, lng },
    });
    return res.data?.stops ?? [];
  },

  async searchMobility(
    query: string,
    lat?: number,
    lng?: number
  ): Promise<MobilitySearchResponse> {
    const res = await api.get<MobilitySearchResponse>("/mobility/search", {
      params: { q: query, lat, lng },
    });
    return {
      stops: res.data?.stops ?? [],
      routes: res.data?.routes ?? [],
    };
  },

  async getStopDepartures(stopId: string): Promise<StopDeparturesResponse> {
    const res = await api.get<StopDeparturesResponse>(
      `/stops/${encodeURIComponent(stopId)}/departures`
    );
    return res.data;
  },

  async getRouteCorridor(routeId: string): Promise<RouteCorridorResponse> {
    const res = await api.get<RouteCorridorResponse>(
      `/routes/${encodeURIComponent(routeId)}/corridor`
    );
    return res.data;
  },
};