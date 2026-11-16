// store/exploreSearchStore.ts
import { create } from "zustand";
import type { Stop, MobilitySearchRouteItem } from "@/services/stop";

export type SearchTabFilter = "all" | "place" | "bus" | "stop";

export interface ExplorePlaceItem {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  distanceM?: number;
  photos?: string[];
  phone?: string;
  /** From Google; undefined when unknown (never assume open). */
  openNow?: boolean;
}

interface ExploreSearchState {
  active: boolean;
  query: string;
  activeTab: SearchTabFilter;
  sortBy: "map" | "location";
  minimizedToMap: boolean; // true = show floating "[:= View List]" pill like KakaoMap
  places: ExplorePlaceItem[];
  stops: Stop[];
  routes: MobilitySearchRouteItem[];
  selectedPlace: ExplorePlaceItem | null;
  loading: boolean;

  startSearch: (payload: {
    query: string;
    activeTab?: SearchTabFilter;
    places?: ExplorePlaceItem[];
    stops?: Stop[];
    routes?: MobilitySearchRouteItem[];
    selectedPlace?: ExplorePlaceItem | null;
  }) => void;
  setResults: (payload: {
    places?: ExplorePlaceItem[];
    stops?: Stop[];
    routes?: MobilitySearchRouteItem[];
  }) => void;
  setActiveTab: (tab: SearchTabFilter) => void;
  setSortBy: (sort: "map" | "location") => void;
  setMinimizedToMap: (min: boolean) => void;
  selectPlace: (place: ExplorePlaceItem | null) => void;
  setLoading: (loading: boolean) => void;
  clearSearch: () => void;
}

export const useExploreSearchStore = create<ExploreSearchState>((set) => ({
  active: false,
  query: "",
  activeTab: "all",
  sortBy: "location",
  minimizedToMap: false,
  places: [],
  stops: [],
  routes: [],
  selectedPlace: null,
  loading: false,

  startSearch: ({
    query,
    activeTab = "all",
    places = [],
    stops = [],
    routes = [],
    selectedPlace = null,
  }) =>
    set({
      active: true,
      query,
      activeTab,
      minimizedToMap: false,
      places,
      stops,
      routes,
      selectedPlace,
    }),

  setResults: ({ places, stops, routes }) =>
    set((s) => ({
      places: places ?? s.places,
      stops: stops ?? s.stops,
      routes: routes ?? s.routes,
      loading: false,
    })),

  setActiveTab: (activeTab) => set({ activeTab, minimizedToMap: false }),
  setSortBy: (sortBy) => set({ sortBy }),
  setMinimizedToMap: (minimizedToMap) => set({ minimizedToMap }),
  selectPlace: (selectedPlace) =>
    set({ selectedPlace, minimizedToMap: false }),
  setLoading: (loading) => set({ loading }),
  clearSearch: () =>
    set({
      active: false,
      query: "",
      activeTab: "all",
      minimizedToMap: false,
      places: [],
      stops: [],
      routes: [],
      selectedPlace: null,
      loading: false,
    }),
}));