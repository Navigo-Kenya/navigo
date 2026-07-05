// store/navStateStore.ts
// Lightweight mirror of the live navigation state, published by useNavigation
// so screens OUTSIDE the map (Kwame's in-trip copilot, widgets, live activity)
// can read trip progress without owning the hook.
import { create } from "zustand";

export interface LiveNavSnapshot {
  tripStatus:         "IDLE" | "WAITING_FOR_BUS" | "IN_TRANSIT" | "PAUSED" | "ARRIVED";
  destination:        string | null;
  nextInstruction:    string | null;
  currentSegmentMode: string | null;   // "WALK" | "BUS" | ...
  currentLine:        string | null;   // matatu route number on the current leg
  stopsRemaining:     number | null;
  currentStopName:    string | null;
  remainingDistanceM: number | null;
  etaIso:             string | null;
}

const EMPTY: LiveNavSnapshot = {
  tripStatus:         "IDLE",
  destination:        null,
  nextInstruction:    null,
  currentSegmentMode: null,
  currentLine:        null,
  stopsRemaining:     null,
  currentStopName:    null,
  remainingDistanceM: null,
  etaIso:             null,
};

interface NavStateStore {
  snapshot: LiveNavSnapshot;
  publish: (patch: Partial<LiveNavSnapshot>) => void;
  clear: () => void;
}

export const useNavStateStore = create<NavStateStore>((set) => ({
  snapshot: EMPTY,
  publish: (patch) => set((s) => ({ snapshot: { ...s.snapshot, ...patch } })),
  clear: () => set({ snapshot: EMPTY }),
}));
