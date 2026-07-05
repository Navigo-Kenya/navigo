import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserService, SavedPlace, SavedJourney } from "@/services/user";
import { syncWidgetData } from "@/services/widgetBridge";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const CUSTOM_LISTS_KEY = "navigo:custom_lists";
const STALE_MS = 5 * 60 * 1000; // 5 minutes

interface SavedStore {
  places:        SavedPlace[];
  journeys:      SavedJourney[];
  loaded:        boolean;
  customLists:   string[];
  lastFetchedAt: number;
  fetch:             () => Promise<void>;
  refresh:           () => Promise<void>;
  reset:             () => void;
  addPlace:          (data: Omit<SavedPlace, "id" | "created_at">) => Promise<SavedPlace>;
  removePlace:       (id: number) => Promise<void>;
  addJourney:        (data: Omit<SavedJourney, "id" | "created_at">) => Promise<SavedJourney>;
  removeJourney:     (id: number) => Promise<void>;
  addCustomList:     (name: string) => Promise<void>;
  removeCustomList:  (name: string) => Promise<void>;
}

export const useSavedStore = create<SavedStore>()(
  persist(
    (set, get) => ({
      places:        [],
      journeys:      [],
      loaded:        false,
      customLists:   [],
      lastFetchedAt: 0,

      async fetch() {
        const { loaded, lastFetchedAt } = get();
        const isStale = !lastFetchedAt || Date.now() - lastFetchedAt > STALE_MS;

        if (loaded && !isStale) return;          // fresh, nothing to do
        if (loaded && isStale) {
          get().refresh();                       // stale, background refresh, don't await
          return;
        }

        // First load: data already hydrated by persist, just mark loaded and trigger refresh
        set({ loaded: true });
        get().refresh();
      },

      async refresh() {
        // Also restore custom lists from AsyncStorage (not in persist partialize)
        const [places, journeys, rawCustom] = await Promise.all([
          UserService.getSavedPlaces(),
          UserService.getSavedJourneys(),
          AsyncStorage.getItem(CUSTOM_LISTS_KEY).catch(() => null),
        ]);
        set({
          places,
          journeys,
          loaded:        true,
          lastFetchedAt: Date.now(),
          customLists:   rawCustom ? (JSON.parse(rawCustom) as string[]) : get().customLists,
        });
      },

      reset() {
        set({ places: [], journeys: [], loaded: false, lastFetchedAt: 0 });
      },

      async addPlace(data) {
        const place = await UserService.savePlace(data);
        set((s) => {
          const filtered = data.pin
            ? s.places.filter((p) => p.pin !== data.pin)
            : s.places;
          return { places: [place, ...filtered] };
        });
        // Keep widget data in sync for home/work pins.
        if (data.pin === "home" || data.pin === "work") {
          syncWidgetData({
            [data.pin]: { name: data.name, lat: data.lat, lng: data.lng },
          }).catch(() => {});
        }
        return place;
      },

      async removePlace(id) {
        const removing = get().places.find((p) => p.id === id);
        set((s) => ({ places: s.places.filter((p) => p.id !== id) }));
        await UserService.deletePlace(id);
        if (removing?.pin === "home" || removing?.pin === "work") {
          syncWidgetData({ [removing.pin as "home" | "work"]: null }).catch(() => {});
        }
      },

      async addJourney(data) {
        const journey = await UserService.saveJourney(data);
        set((s) => ({ journeys: [journey, ...s.journeys] }));
        return journey;
      },

      async removeJourney(id) {
        set((s) => ({ journeys: s.journeys.filter((j) => j.id !== id) }));
        await UserService.deleteJourney(id);
      },

      async addCustomList(name) {
        const trimmed = name.trim();
        if (!trimmed) return;
        const next = [...new Set([...get().customLists, trimmed])];
        set({ customLists: next });
        await AsyncStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(next));
      },

      async removeCustomList(name) {
        const next = get().customLists.filter((l) => l !== name);
        set({ customLists: next });
        await AsyncStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(next));
      },
    }),
    {
      name:    "navigo:store:saved",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        places:        state.places,
        journeys:      state.journeys,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
