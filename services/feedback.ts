// services/feedback.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "./apiClient";

const GUEST_TOKEN_KEY = "navigo:guest_token";

function makeUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getGuestToken(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(GUEST_TOKEN_KEY);
    if (stored) return stored;
    const token = makeUUID();
    await AsyncStorage.setItem(GUEST_TOKEN_KEY, token);
    return token;
  } catch {
    return makeUUID(); // ephemeral fallback if storage fails
  }
}

export interface FeedbackPayload {
  status:          "submitted" | "dismissed";
  rating?:         number | null;
  fare_choice?:    "matched" | "more" | "less" | null;
  custom_fare?:    number | null;
  estimated_fare?: number | null;
  currency?:       string | null;
  tags?:           string[];
  to_name?:        string | null;
  route_summary?:  string | null;
}

export const FeedbackService = {
  async submit(payload: FeedbackPayload): Promise<void> {
    const guest_token = await getGuestToken();
    await api.post("/journey/feedback", { ...payload, guest_token });
  },
};
