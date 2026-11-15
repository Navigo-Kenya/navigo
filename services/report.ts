// services/report.ts
import api from "./apiClient";

export type ReportCategory =
  | "stage_queue"
  | "accident"
  | "police_check"
  | "flooded_route"
  | "fare_hike"
  | "traffic_jam"
  | "road_blocked"
  | "breakdown"
  | "security";

export interface TransitReport {
  id:         string;
  type:       ReportCategory;
  lat:        number;
  lng:        number;
  upvotes:    number;
  downvotes:  number;
  created_at: string;
  expires_at: string;
  reporter:   { name: string; level: string } | null;
}

export const ReportService = {
  async getReportsInViewport(
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<TransitReport[]> {
    const bounds = { north, south, east, west };
    if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
      throw new Error("Cannot fetch reports without finite viewport bounds");
    }

    // Put the bounds directly in the URL. This keeps them in the query string
    // across React Native Axios adapters, where params may otherwise be lost.
    const query = new URLSearchParams(
      Object.entries(bounds).map(([key, value]) => [key, String(value)]),
    ).toString();
    const { data } = await api.get<{ data: TransitReport[] }>(`/reports/viewport?${query}`);
    console.info(`Fetched ${data.data.length} reports in viewport`);
    return data.data;
  },

  async createReport(lat: number, lng: number, type: ReportCategory): Promise<void> {
    await api.post("/reports", { lat, lng, type });
  },

  async voteReport(
    id: string,
    vote: "up" | "down"
  ): Promise<{ upvotes: number; downvotes: number }> {
    const { data } = await api.post<{ data: { upvotes: number; downvotes: number } }>(
      `/reports/${id}/vote`,
      { vote }
    );
    return data.data;
  },
};
