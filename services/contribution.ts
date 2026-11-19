import api, { dedupedGet } from "./apiClient";

export type ContributionType =
  | "delay_report"
  | "stop_review"
  | "stop_photo"
  | "stop_edit"
  | "route_correction"
  | "new_stop";

export type ContributionStatus = "pending" | "auto_approved" | "approved" | "rejected";

/**
 * Points as the API awards them (ContributionService::POINTS_MAP). The one
 * place the app reads them from; keep in step with the API.
 */
export const CONTRIBUTION_POINTS: Record<ContributionType, number> = {
  delay_report: 3,
  stop_review: 10,
  stop_photo: 5,
  stop_edit: 15,
  route_correction: 15,
  new_stop: 50,
};

/** Extra for the first approved photo of a stop (ContributionService::approve). */
export const FIRST_PHOTO_BONUS = 20;

/** Points for a road report by type (ReportService::REPORT_POINTS). */
export const REPORT_POINTS: Record<string, number> = {
  accident: 5,
  flooded_route: 5,
  security: 4,
  road_blocked: 4,
  police_check: 3,
  breakdown: 3,
  traffic_jam: 2,
  stage_queue: 2,
  fare_hike: 2,
};

/** Approved at once (points straight away); the rest wait for a moderator. */
export const AUTO_APPROVED: ContributionType[] = ["delay_report", "stop_review"];

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
  /** The counts badges are earned from (newer APIs), for exact progress. */
  progress?: {
    total: number;
    by_type: Record<string, number>;
    approved_by_type: Record<string, number>;
    report_total: number;
    report_by_type: Record<string, number>;
  };
  /** The streak as newer APIs count it: any useful act, weekends excused, freezes. */
  streak?: { days: number; best: number; freezes: number; weekends: boolean; active_today: boolean };
  /** Leaderboard positions (newer APIs); null where the user has no points yet. */
  rank?: {
    all: number | null;
    weekly: number | null;
    weekly_points: number;
  };
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
  /** Daily quests it completed (newer APIs). */
  quests_done?: { key: string; title: string; points: number }[];
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  avatar: string | null;
  /** Points on this board: this week's, or all of them. */
  points: number;
  /** Newer APIs: the person's total and level, on both boards. */
  total_points?: number;
  level?: number;
}

/** Where the signed-in person stands on a board. */
export interface Standing {
  rank: number | null;
  points: number;
  /** The person just above: the next one to pass. */
  ahead: { name: string; points: number } | null;
}

export interface Leaderboard {
  data: LeaderboardEntry[];
  period: "all" | "weekly";
  /** Newer APIs: when the weekly board starts over (Monday 00:00, Nairobi). */
  resets_at?: string | null;
  /** Newer APIs, signed in: where you stand. */
  me?: Standing | null;
}

export interface LeagueMember {
  rank: number;
  id: number;
  name: string;
  avatar: string | null;
  points: number;
  level: number;
  me: boolean;
}

/** Where you stand in your group, and what it takes to move. */
export interface LeagueMe {
  rank: number;
  points: number;
  zone: "up" | "safe" | "down";
  /** Points to reach the last promotion place. */
  to_up: number | null;
  /** Points to climb out of the drop zone. */
  to_safe: number | null;
}

/** Your league this week (api: LeagueController). */
export interface League {
  tier: number;
  name: string;
  next: string | null;
  prev: string | null;
  week_start: string;
  resets_at: string;
  /** In a group yet (you join when you first score this week). */
  joined: boolean;
  size: number;
  /** How many go up, and down, on Monday. */
  up: number;
  down: number;
  members: LeagueMember[];
  me: LeagueMe | null;
  /** How last week ended, until seen. */
  last_week: { outcome: "up" | "stay" | "down"; rank: number; points: number; from: string; to: string } | null;
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

  async getLeaderboard(period: "all" | "weekly" = "all"): Promise<Leaderboard> {
    const res = await api.get<Leaderboard>("/community/leaderboard", { params: { period } });
    return { ...res.data, data: res.data.data ?? [], period };
  },

  async getLeague(): Promise<League> {
    const res = await api.get<League>("/user/league");
    return res.data;
  },

  /** Last week's result was shown: don't show it again. */
  async leagueSeen(): Promise<void> {
    await api.post("/user/league/seen");
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
