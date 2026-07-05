import api, { dedupedGet } from "./apiClient";

export type ContributionType =
  | "delay_report"
  | "stop_review"
  | "stop_photo"
  | "stop_edit"
  | "route_correction"
  | "new_stop";

export type ContributionStatus = "pending" | "auto_approved" | "approved" | "rejected";

export interface Contribution {
  id: number;
  user_id: number;
  type: ContributionType;
  stop_id: string | null;
  title: string | null;
  description: string | null;
  data: Record<string, any> | null;
  status: ContributionStatus;
  points_awarded: number;
  expires_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  stop?: { id: string; name: string };
}

export interface Badge {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requirement_type: string;
  requirement_value: number;
  requirement_meta: Record<string, any> | null;
  points_bonus: number;
  earned?: boolean;
  earned_at?: string | null;
}

export interface CommunityStats {
  points: number;
  level: number;
  level_label: string;
  points_to_next_level: number;
  next_level_label: string;
  submissions_count: number;
  badges_count: number;
  badges_preview: Pick<Badge, "slug" | "name" | "icon" | "color">[];
  streak_days: number;
  contributed_today: boolean;
}

export interface StopReview {
  id: number;
  user_id: number;
  user: { id: number; name: string; avatar: string | null } | null;
  data: { safety: number; comfort: number; cleanliness: number; text?: string };
  created_at: string;
}

export interface StopPhoto {
  id: number;
  data: { photo_url: string; mime_type: string };
  created_at: string;
}

export interface CreateContributionResult {
  data: Contribution;
  points_awarded: number;
  new_badges: string[];
  new_level: number | null;
  streak_days: number;
}

export interface CreateContributionPayload {
  type: ContributionType;
  stop_id?: string | null;
  title?: string;
  description?: string;
  data?: Record<string, any>;
}

export const ContributionService = {
  async getContributions(): Promise<Contribution[]> {
    return dedupedGet("contributions", async () => {
      const res = await api.get<{ data: Contribution[] }>("/user/contributions");
      return res.data.data;
    });
  },

  async createContribution(payload: CreateContributionPayload): Promise<CreateContributionResult> {
    const res = await api.post<CreateContributionResult>("/user/contributions", payload);
    return res.data;
  },

  async deleteContribution(id: number): Promise<void> {
    await api.delete(`/user/contributions/${id}`);
  },

  async vote(id: number, vote: "up" | "down"): Promise<void> {
    await api.post(`/contributions/${id}/vote`, { vote });
  },

  async getNearby(lat: number, lng: number, radius = 5000): Promise<Contribution[]> {
    const res = await api.get<{ data: Contribution[] }>("/contributions/nearby", {
      params: { lat, lng, radius },
    });
    return res.data.data;
  },

  async getStats(): Promise<CommunityStats> {
    return dedupedGet("community_stats", async () => {
      const res = await api.get<CommunityStats>("/user/community/stats");
      return res.data;
    });
  },

  async getBadges(): Promise<{ earned: Badge[]; locked: Badge[] }> {
    return dedupedGet("badges", async () => {
      const res = await api.get<{ earned: Badge[]; locked: Badge[] }>("/user/badges");
      return res.data;
    });
  },

  async getLeaderboard(period: "all" | "weekly" = "all"): Promise<{ id: number; name: string; avatar: string | null; points: number }[]> {
    const res = await api.get<{ data: any[]; period: string }>("/community/leaderboard", { params: { period } });
    return res.data.data;
  },

  async getStopReviews(stopId: string): Promise<StopReview[]> {
    const res = await api.get<{ data: StopReview[] }>(`/stops/${stopId}/reviews`);
    return res.data.data;
  },

  async getStopPhotos(stopId: string): Promise<StopPhoto[]> {
    const res = await api.get<{ data: StopPhoto[] }>(`/stops/${stopId}/photos`);
    return res.data.data;
  },

  async updateContribution(id: number, data: Record<string, any>): Promise<void> {
    await api.patch(`/user/contributions/${id}`, { data });
  },
};
