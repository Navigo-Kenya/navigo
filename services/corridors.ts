// services/corridors.ts
//
// "Your roads": the roads "Reports on my roads" follows, learned by the API
// from saved routes and Home/Work (api: CorridorController).
import api from "./apiClient";

export interface RoadWindow {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** "05:30", Nairobi time. */
  from: string;
  to: string;
}

export interface Road {
  id: number;
  source: "saved_route" | "home_work" | "work_home";
  label: string;
  windows: RoadWindow[];
  last_alerted_at: string | null;
  /** [lat, lng] pairs, simplified. */
  path: [number, number][];
}

export interface Roads {
  data: Road[];
  /** How many the person removed (they can bring them back). */
  removed: number;
}

export const CorridorService = {
  async list(): Promise<Roads> {
    const res = await api.get<Roads>("/user/corridors");
    return { data: res.data.data ?? [], removed: res.data.removed ?? 0 };
  },

  /** Builds them again now (a new route, a moved pin). */
  async refresh(): Promise<Roads> {
    const res = await api.post<Roads>("/user/corridors/refresh");
    return { data: res.data.data ?? [], removed: res.data.removed ?? 0 };
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/user/corridors/${id}`);
  },

  async restore(): Promise<Roads> {
    const res = await api.post<Roads>("/user/corridors/restore");
    return { data: res.data.data ?? [], removed: res.data.removed ?? 0 };
  },
};
