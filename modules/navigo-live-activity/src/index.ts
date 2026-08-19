import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// Matches NavigoActivityAttributes.ContentState on the Swift side.
export interface NavActivityState {
  instruction: string;
  remainingDistanceText: string;
  eta: string;
  progress: number; // 0.0 – 1.0
  isPaused: boolean;
}

let mod: {
  isSupported(): boolean;
  startActivity(destination: string, initialState: NavActivityState): Promise<boolean>;
  updateActivity(state: NavActivityState): Promise<boolean>;
  endActivity(): Promise<boolean>;
} | null = null;

if (Platform.OS === "ios") {
  try {
    mod = requireNativeModule("NavigoLiveActivity");
  } catch {
    // Module not linked, Phase 3 build not yet done.
  }
}

/** True on iOS 16.2+ when the native module is linked. */
export const isLiveActivitySupported = (): boolean =>
  mod?.isSupported() ?? false;

export const startNavActivity = (
  destination: string,
  initialState: NavActivityState
): Promise<boolean> =>
  mod?.startActivity(destination, initialState) ?? Promise.resolve(false);

export const updateNavActivity = (state: NavActivityState): Promise<boolean> =>
  mod?.updateActivity(state) ?? Promise.resolve(false);

export const stopNavActivity = (): Promise<boolean> =>
  mod?.endActivity() ?? Promise.resolve(false);
