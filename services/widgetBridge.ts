// services/widgetBridge.ts
// Data bridge for home-screen widgets (Phase 3).
//
// Writes canonical widget state to two places:
//   1. AsyncStorage — JS layer, always available
//   2. Native shared container (navigo-widget-data module):
//      iOS  — App Group UserDefaults (group.com.navigo.ke) + WidgetCenter reload
//      Android — SharedPreferences("navigo_widget_data") + AppWidgetManager refresh
//
// Call syncWidgetData() after any event that changes the fields below:
//   • saved places change (home / work)
//   • contribution submitted or streak changes
//   • journey completed (last destination)
import AsyncStorage from "@react-native-async-storage/async-storage";

// Native writer — gracefully absent until the Phase 3 EAS build links the module.
let nativeWriter: ((json: string) => void) | null = null;
try {
  const mod = require("navigo-widget-data");
  nativeWriter = mod.writeWidgetData ?? null;
} catch { /* not yet installed / built */ }

const WIDGET_KEY = "navigo:widget-data-v1";

export interface WidgetData {
  /** Home pin — null when not set. */
  home: { name: string; lat: number; lng: number } | null;
  /** Work pin — null when not set. */
  work: { name: string; lat: number; lng: number } | null;
  /** Current streak length (0 when no active streak). */
  streakDays: number;
  /** Name of last journey destination (for "Continue to X" quick action). */
  lastDestination: string | null;
  updatedAt: number;
}

const EMPTY: WidgetData = {
  home:            null,
  work:            null,
  streakDays:      0,
  lastDestination: null,
  updatedAt:       0,
};

// Build the snake_case payload that the Swift/Kotlin widget parsers expect.
function toNativePayload(data: WidgetData): string {
  return JSON.stringify({
    home_name:        data.home?.name ?? null,
    home_lat:         data.home?.lat  ?? null,
    home_lng:         data.home?.lng  ?? null,
    work_name:        data.work?.name ?? null,
    work_lat:         data.work?.lat  ?? null,
    work_lng:         data.work?.lng  ?? null,
    streak_days:      data.streakDays,
    last_destination: data.lastDestination,
    updated_at:       data.updatedAt,
  });
}

export async function syncWidgetData(patch: Partial<WidgetData>): Promise<void> {
  try {
    const raw  = await AsyncStorage.getItem(WIDGET_KEY);
    const prev: WidgetData = raw ? JSON.parse(raw) : EMPTY;
    const next: WidgetData = { ...prev, ...patch, updatedAt: Date.now() };
    await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(next));
    // Push to native widget layer (triggers WidgetCenter reload / AppWidgetManager refresh).
    nativeWriter?.(toNativePayload(next));
  } catch {
    // Best-effort — widget sync must never break navigation or contributions.
  }
}

export async function getWidgetData(): Promise<WidgetData> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_KEY);
    return raw ? (JSON.parse(raw) as WidgetData) : EMPTY;
  } catch {
    return EMPTY;
  }
}
