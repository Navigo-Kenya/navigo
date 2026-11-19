import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserService, SavedPlace, SavedJourney } from "@/services/user";
import { syncWidgetData } from "@/services/widgetBridge";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const CUSTOM_LISTS_KEY = "navigo:custom_lists";

/** What can be saved: a place or a stop, as the place sheet and the stop sheet know it. */
export interface SaveTarget {
  name: string;
  lat: number;
  lng: number;
  type: "stop" | "location";
  /** Google place id, "poi:<id>" for ours, or the stop id. */
  place_id: string;
  category?: string | null;
}

/** The rows that save this target (one per list, plus Home/Work pins). */
export function rowsFor(places: SavedPlace[], placeId: string): SavedPlace[] {
  return places.filter((p) => p.place_id === placeId);
}
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
  /** Adds the target to the list, or takes it out if it's there. Resolves to "in the list now". */
  toggleInList:      (target: SaveTarget, list: string) => Promise<boolean>;
  /** Moves every place of a list to another name (the API keys custom lists by name). */
  renameList:        (from: string, to: string) => Promise<void>;
  /** Deletes a list's places (a list is its places on the API). */
  deleteListPlaces:  (list: string) => Promise<void>;
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

      async toggleInList(target, list) {
        const row = get().places.find((p) => p.place_id === target.place_id && p.list === list && p.pin === null);
        if (row) {
          await get().removePlace(row.id);
          return false;
        }
        await get().addPlace({
          name: target.name,
          lat: target.lat,
          lng: target.lng,
          type: target.type,
          place_id: target.place_id,
          pin: null,
          list,
          category: target.category ?? null,
          note: null,
        });
        return true;
      },

      async renameList(from, to) {
        // One at a time, adding before removing: an error midway leaves the
        // place in a list (old or new), never in none.
        const rows = get().places.filter((p) => p.list === from && p.pin === null);
        for (const p of rows) {
          await get().addPlace({
            name: p.name, lat: p.lat, lng: p.lng, type: p.type, place_id: p.place_id,
            pin: null, list: to, category: p.category, note: p.note,
          });
          await get().removePlace(p.id);
        }
      },

      async deleteListPlaces(list) {
        const rows = get().places.filter((p) => p.list === list && p.pin === null);
        for (const p of rows) await get().removePlace(p.id);
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
