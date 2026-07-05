// store/journeyStore.ts
import type { Route } from "@/services/route";
import { create } from "zustand";

export type TripStatus = "IDLE" | "WAITING_FOR_BUS" | "IN_TRANSIT" | "PAUSED" | "ARRIVED";

// We create a unified interface so the app can handle both physical Stops and Mapbox Locations (like "KFC")
export interface UnifiedLocation {
  _type: "stop" | "location";
  id: string;
  name: string;
  lat: number;
  lng: number;
  route_ids?: string; 
  route_nams?: string;
}

interface JourneyState {
  activeJourney: {
    fromLoc: UnifiedLocation;
    toLoc: UnifiedLocation;
    route: Route;
  } | null;
  tripStatus: TripStatus;
  setJourney: (
    fromLoc: UnifiedLocation,
    toLoc: UnifiedLocation,
    route: Route,
  ) => void;
  /** Replace the active route without touching tripStatus (used during re-routing). */
  updateRoute: (route: Route) => void;
  setTripStatus: (status: TripStatus) => void;
  clearJourney: () => void;
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  activeJourney: null,
  tripStatus: "IDLE",
  setJourney: (fromLoc, toLoc, route) =>
    set({
      activeJourney: { fromLoc, toLoc, route },
      tripStatus: "WAITING_FOR_BUS",
    }),
  updateRoute: (route) => {
    const j = get().activeJourney;
    if (!j) return;
    // Skip if OTP returned the same route (no-op reroute) — prevents a full map re-render.
    // Route has no server-assigned id; use summary + distance as a cheap identity key.
    if (j.route?.summary === route.summary && j.route?.total_distance === route.total_distance) return;
    set({ activeJourney: { ...j, route } });
  },
  setTripStatus: (status) => set({ tripStatus: status }),
  clearJourney: () => set({ activeJourney: null, tripStatus: "IDLE" }),
}));
