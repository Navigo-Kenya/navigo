// services/ai.ts
import api, { fetchApi } from "./apiClient";

export interface LatLng { lat: number; lng: number; name?: string; }

export interface UserContext {
  currentLocation?: LatLng;
  aliases?: Record<string, LatLng>;
  userId?: string;
}

export interface TransitPlace { name: string; lat: number; lng: number; }

export interface TransitLeg {
  mode: string;
  routeNumber?: string;
  durationSeconds: number;
  from: TransitPlace;
  to: TransitPlace;
}

export interface RouteSummary {
  summary: string;
  total_duration: number;
  total_walk_distance: number;
  legs: TransitLeg[];
}

export interface SavedPlaceResponse {
  id: number;
  name: string;
  lat: number;
  lng: number;
  pin: "home" | "work" | null;
  category: string | null;
}

export interface LocationResolutionAction {
  errorType: "unresolved_location";
  field: "from" | "to";
  unresolvedName: string;
  isAuthenticated: boolean;
  savedPlaces: SavedPlaceResponse[];
}

export interface KwamePlace {
  name:           string;
  address?:       string | null;
  lat:            number;
  lng:            number;
  rating?:        number | null;
  ratings_count?: number | null;
  category?:      string | null;
  open_now?:      boolean | null;
}

export interface CalendarEventContext {
  title:     string;
  start:     string;      // human-readable, e.g. "Today 14:30"
  location?: string;
}

/** Live trip snapshot so Kwame can answer "how many stops left?" mid-ride. */
export interface NavContext {
  trip_status:      string;
  destination?:     string | null;
  next_instruction?: string | null;
  segment_mode?:    string | null;
  current_line?:    string | null;
  stops_remaining?: number | null;
  current_stop?:    string | null;
  remaining_m?:     number | null;
  eta?:             string | null;   // human-readable local time
}

export interface KwameContext {
  calendar_events?: CalendarEventContext[];
  nav?: NavContext;
}

export interface AiPlanResponse {
  routes?: RouteSummary[];
  spoken_response?: string;
  holding_phrase?: string | null;
  tts_audio?: string | null;
  actionRequired?: LocationResolutionAction; // Intercepts failed geocoding safely
  places?: KwamePlace[];       // place cards (find_places / find_nearby_stops)
  suggestions?: string[];      // tappable reply chips (suggest_replies)
}

export function mapboxThumb(lng: number, lat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},15/300x160@2x?access_token=${token}`;
}

export function mapboxJourneyThumb(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `pin-s+FF6F00(${fromLng},${fromLat}),pin-s+10B981(${toLng},${toLat})` +
    `/auto/320x130@2x?padding=35&access_token=${token}`
  );
}

export interface VoiceSettings {
  voice_name?:     string;
  speaking_rate?:  number;
  pitch?:          number;
  language_code?:  string;
  response_style?: "casual" | "professional" | "brief";
}

// AI Service for handling route planning and voice interactions
export const AiService = {
  async planRoute(
    sessionId: string,
    text?: string,
    audioBase64?: string,
    mimeType?: string,
    currentLat?: number,
    currentLng?: number,
    aliases?: UserContext['aliases'],
    voiceSettings?: VoiceSettings,
    context?: KwameContext,
  ): Promise<AiPlanResponse> {
    const payload: Record<string, any> = { session_id: sessionId };

    if (text) payload.text = text.trim();
    if (audioBase64) {
      payload.audio = { base64: audioBase64, mime: mimeType ?? 'audio/mp4' };
    }

    if (currentLat != null && currentLng != null) {
      payload.lat = currentLat;
      payload.lng = currentLng;
    }

    if (aliases && Object.keys(aliases).length > 0) payload.aliases = aliases;
    if (voiceSettings) payload.voice_settings = voiceSettings;
    if (context?.calendar_events?.length || context?.nav) payload.context = context;

    try {
      const response = await api.post<AiPlanResponse>("/journey/ai-plan", payload, {
        timeout: 90000,
      });
      return response.data;
    } catch (error: any) {
      if (error?.status === 503) {
        throw new Error(error.message ?? "Route planning is temporarily unavailable. Please try again in a moment.");
      }
      console.error("AI Routing Network Error:", error);
      throw error;
    }
  },

  // Text-to-Speech using the Kwame TTS endpoint
  async speak(text: string, voiceSettings?: VoiceSettings): Promise<{ audio: string }> {
    const response = await api.post<{ audio: string }>("/kwame/speak", {
      text,
      ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
    }, { timeout: 15000 });
    return response.data;
  },

  // Transcribe audio to text using the Kwame STT endpoint
  async transcribeAudio(audioBase64: string): Promise<string> {
    try {
      const response = await api.post("/kwame/transcribe", {
        audio_base64: audioBase64
      }, { timeout: 20000 });
      
      return response.data.transcript || "🗣️ Voice message";
    } catch (error) {
      console.error("Transcription error:", error);
      return "🗣️ Voice message";
    }
  },
};