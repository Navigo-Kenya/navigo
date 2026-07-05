// store/mapLayersStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface MapLayers {
  reports: boolean;
  traffic: boolean;
  biking: boolean;
  bus: boolean;
  coolSpots: boolean;
  mapType: "default" | "satellite" | "hybrid";
}

const DEFAULTS: MapLayers = {
  reports: true,
  traffic: false,
  biking: false,
  bus: false,
  coolSpots: false,
  mapType: "default",
};

interface MapLayersState {
  layers: MapLayers;
  toggle: (key: keyof MapLayers) => void;
  setLayer: (key: keyof MapLayers, value: any) => void;
}

export const useMapLayersStore = create<MapLayersState>()(
  persist(
    (set) => ({
      layers: DEFAULTS,
      toggle:   (key)        => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
      setLayer: (key, value) => set((s) => ({ layers: { ...s.layers, [key]: value } })),
    }),
    {
      name:    "navigo:store:map_layers",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ layers: s.layers }),
      merge: (persisted, current) => ({
        ...current,
        layers: { ...DEFAULTS, ...((persisted as { layers?: Partial<MapLayers> })?.layers ?? {}) },
      }),
    },
  ),
);