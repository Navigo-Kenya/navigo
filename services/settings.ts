import api from "@/services/apiClient";

export interface UserSettings {
  notifications: {
    master:           boolean;
    sound:            boolean;
    route_changes:    boolean;
    disruptions:      boolean;
    stop_updates:     boolean;
    bus_arriving:     boolean;
    journey_reminder: boolean;
    turn_by_turn:     boolean;
    nearby_contrib:   boolean;
    points_earned:    boolean;
    /** "Reports on my roads" (newer APIs). */
    route_reports?:   boolean;
    tips:             boolean;
    app_news:         boolean;
  };
  privacy: {
    two_fa:             boolean;
    analytics:          boolean;
    anonymous_reports:  boolean;
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const SettingsService = {
  async get(): Promise<UserSettings> {
    const res = await api.get("/auth/settings");
    return res.data;
  },

  async update(patch: DeepPartial<UserSettings>): Promise<UserSettings> {
    const res = await api.patch("/auth/settings", patch);
    return res.data;
  },
};
