// store/mapIntentStore.ts
//
// Asks the map screen to show something, from a sheet that lives outside it
// (the Transit and Saved tabs): a stop with its departures, a line with its
// stops. The map takes the intent once (consume) and
// acts as if the user had tapped it there.
import { create } from "zustand";
import type { Stop } from "@/utils/mapHelpers";

export type MapIntent =
  | { kind: "stop"; stop: Stop }
  | { kind: "line"; routeId: string };

interface MapIntentState {
  intent: (MapIntent & { at: number }) | null;
  show: (intent: MapIntent) => void;
  consume: () => (MapIntent & { at: number }) | null;
}

export const useMapIntentStore = create<MapIntentState>((set, get) => ({
  intent: null,
  show: (intent) => set({ intent: { ...intent, at: Date.now() } }),
  consume: () => {
    const i = get().intent;
    if (i) set({ intent: null });
    return i;
  },
}));
