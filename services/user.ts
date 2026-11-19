import api from "@/services/apiClient";
import { AuthUser } from "@/store/authStore";
import { Route } from "@/services/route";

export interface SavedPlace {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type: "stop" | "location";
  place_id: string | null;
  list: string | null;
  pin: "home" | "work" | null;
  category: string | null;
  note: string | null;
  created_at: string;
}

export interface SavedJourney {
  id: number;
  label: string | null;
  from_name: string;
  from_lat: number;
  from_lng: number;
  from_id: string | null;
  from_type: "stop" | "location";
  to_name: string;
  to_lat: number;
  to_lng: number;
  to_id: string | null;
  to_type: "stop" | "location";
  summary: string;
  duration: number;
  route: Route;
  created_at: string;
}

export const UserService = {
  async updateProfile(data: { name?: string; avatar?: string }): Promise<AuthUser> {
    const res = await api.patch("/auth/profile", data);
    return res.data;
  },

  async uploadAvatar(uri: string, mimeType: string = "image/jpeg"): Promise<AuthUser> {
    const ext = mimeType.split("/")[1] ?? "jpg";
    const formData = new FormData();
    formData.append("avatar", { uri, name: `avatar.${ext}`, type: mimeType } as any);
    const res = await api.post("/auth/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async getSavedPlaces(): Promise<SavedPlace[]> {
    const res = await api.get("/user/saved-places");
    return res.data;
  },

  async savePlace(data: Omit<SavedPlace, "id" | "created_at">): Promise<SavedPlace> {
    const res = await api.post("/user/saved-places", data);
    return res.data;
  },

  async deletePlace(id: number): Promise<void> {
    await api.delete(`/user/saved-places/${id}`);
  },

  /** Sets a saved place's note; a blank note clears it. */
  async setPlaceNote(id: number, note: string): Promise<SavedPlace> {
    const res = await api.patch(`/user/saved-places/${id}`, { note });
    return res.data;
  },

  async getSavedJourneys(): Promise<SavedJourney[]> {
    const res = await api.get("/user/saved-journeys");
    return res.data;
  },

  async saveJourney(
    data: Omit<SavedJourney, "id" | "created_at">
  ): Promise<SavedJourney> {
    const res = await api.post("/user/saved-journeys", data);
    return res.data;
  },

  async deleteJourney(id: number): Promise<void> {
    await api.delete(`/user/saved-journeys/${id}`);
  },
};
