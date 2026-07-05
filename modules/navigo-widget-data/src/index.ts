import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

let mod: { writeWidgetData(json: string): void } | null = null;

try {
  mod = requireNativeModule("NavigoWidgetData");
} catch {
  // Module not linked yet.
}

/**
 * Writes the canonical widget payload to the native shared container
 * (iOS App Group UserDefaults / Android SharedPreferences) so the
 * home-screen widget can read it without launching the app.
 */
export function writeWidgetData(json: string): void {
  mod?.writeWidgetData(json);
}

/** True when the native module is linked and the host widget can receive data. */
export const isWidgetDataSupported = (): boolean => mod !== null;
