import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const SETTINGS_KEY = "navigo:kwame_settings";

export interface KwameSettings {
  voiceName:          string;
  speakingRate:       number;
  pitch:              number;
  languageCode:       string;
  responseStyle:      "casual" | "professional" | "brief";
  autoListen:         boolean;
  silenceThresholdDb: number;
  silenceHoldMs:      number;
}

const DEFAULTS: KwameSettings = {
  voiceName:          "en-US-Neural2-D",
  speakingRate:       1.05,
  pitch:              0.0,
  languageCode:       "en-US",
  responseStyle:      "casual",
  autoListen:         true,
  silenceThresholdDb: -35,
  // Auto-submit after this much sustained user silence (clamped 2000-3000 ms
  // by the adaptive VAD in kwame.tsx).
  silenceHoldMs:      2500,
};

interface KwameSettingsStore {
  settings: KwameSettings;
  loaded:   boolean;
  load(): Promise<void>;
  set<K extends keyof KwameSettings>(key: K, value: KwameSettings[K]): Promise<void>;
}

export const useKwameSettingsStore = create<KwameSettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded:   false,

  async load() {
    if (get().loaded) return;
    try {
      const raw   = await AsyncStorage.getItem(SETTINGS_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<KwameSettings>) : {};
      set({ settings: { ...DEFAULTS, ...saved }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async set(key, value) {
    const next = { ...get().settings, [key]: value };
    set({ settings: next });
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  },
}));
