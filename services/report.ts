// services/report.ts
import api from "./apiClient";
import type { ReportType } from "@/components/icons/reportIcons";

/** Report types. Labels, colours and icons live in components/icons/reportIcons. */
export type ReportCategory = ReportType;

export type ReportVote = "up" | "down";

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
  /** 0–1, how much the community trusts this report. */
  reliability?: number;
  /** The signed-in user's own vote, from the server. */
  my_vote?:   ReportVote | null;
  /** "tomtom" for a live incident shown as a pin (no votes, no reporter). */
  source?:    "community" | "tomtom";
  /** Set when source is "tomtom". */
  incident?:  MapIncident;
}

/** A live TomTom incident in the viewport, as the API sends it. */
export interface MapIncident {
  id:          string;
  type:        "jam" | "accident" | "road_closed" | "lane_closed" | "roadworks" | "flooding" | "broken_down_vehicle" | "incident";
  /** 1 moderate · 2 heavy */
  level:       1 | 2;
  description: string;
  from:        string | null;
  to:          string | null;
  road:        string | null;
  delay_s:     number | null;
  length_m:    number | null;
  /** [lat, lng] */
  point:       [number, number];
  /** Jams only: the road stretch, [lat, lng][]. */
  line:        [number, number][] | null;
}

export interface ReportVoteResult {
  upvotes:   number;
  downvotes: number;
  my_vote:   ReportVote | null;
  /** "dismissed" once the community has voted the report down. */
  status:    "active" | "dismissed" | string;
}

export const ReportService = {
  async getReportsInViewport(
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<TransitReport[]> {
    return (await this.getViewport(north, south, east, west)).reports;
  },

  /**
   * Community reports in the viewport, plus live TomTom incidents (from the
   * API's shared per-city list: no TomTom request per user). Older APIs send
   * no `incidents`, which is the same as none.
   */
  async getViewport(
    north: number,
    south: number,
    east: number,
    west: number
  ): Promise<{ reports: TransitReport[]; incidents: MapIncident[] }> {
    const bounds = { north, south, east, west };
    if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
      throw new Error("Cannot fetch reports without finite viewport bounds");
    }

    // Put the bounds directly in the URL. This keeps them in the query string
    // across React Native Axios adapters, where params may otherwise be lost.
    const query = new URLSearchParams(
      Object.entries(bounds).map(([key, value]) => [key, String(value)]),
    ).toString();
    const { data } = await api.get<{ data: TransitReport[]; incidents?: MapIncident[] }>(
      `/reports/viewport?${query}`
    );
    return { reports: data.data, incidents: data.incidents ?? [] };
  },

  /** Sends a report; resolves to what it earned (signed in), as the API says. */
  async createReport(
    lat: number,
    lng: number,
    type: ReportCategory
  ): Promise<{ points_awarded: number; new_badges: string[]; streak_days: number | null }> {
    const res = await api.post("/reports", { lat, lng, type });
    const d = res.data?.data ?? {};
    return {
      points_awarded: Number(d.points_awarded ?? 0),
      new_badges: Array.isArray(d.new_badges) ? d.new_badges : [],
      streak_days: typeof d.streak_days === "number" ? d.streak_days : null,
    };
  },

  /**
   * Set the user's vote. "clear" removes it. Idempotent on the server:
   * re-sending the current vote changes nothing.
   */
  async voteReport(id: string, vote: ReportVote | "clear"): Promise<ReportVoteResult> {
    const { data } = await api.post<{ data: ReportVoteResult }>(
      `/reports/${id}/vote`,
      { vote }
    );
    return {
      upvotes:   data.data.upvotes,
      downvotes: data.data.downvotes,
      // Older API builds return counts only; assume the vote we sent stuck.
      my_vote:   data.data.my_vote !== undefined
        ? data.data.my_vote
        : vote === "clear" ? null : vote,
      status:    data.data.status ?? "active",
    };
  },
};
