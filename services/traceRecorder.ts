// services/traceRecorder.ts
// Records anonymized navigation sessions (raw GPS fixes + engine decisions)
// so field bugs can be replayed on the dev-replay screen and exported as
// golden-trace fixtures for services/__tests__/. Recording is on only in
// __DEV__ builds or when the hidden `devTraces` pref is enabled.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePrefsStore } from "@/store/prefsStore";
import type { EngineResult, NavStep } from "./navigationEngine";

const STORE_KEY     = "navigo:traces";
const MAX_SESSIONS  = 5;
const MAX_FIXES     = 6000; // ~100 min at 1 Hz

export interface RecordedFix {
  t: number;
  lat: number;
  lng: number;
  acc: number;
  speed: number;
  heading: number | null;
}

export interface RecordedEngineTick {
  t: number;
  stepIndex: number;
  status: string;
  distFromRouteM: number;
  remainingM: number;
}

export interface RecordedSession {
  version: 1;
  id: string;
  startedAt: number;
  endedAt: number | null;
  destination: string | null;
  route: { coords: [number, number][]; steps: NavStep[] };
  fixes: RecordedFix[];
  engine: RecordedEngineTick[];
}

let active: RecordedSession | null = null;

function enabled(): boolean {
  return __DEV__ || usePrefsStore.getState().prefs.devTraces;
}

export const TraceRecorder = {
  begin(coords: [number, number][], steps: NavStep[], destination: string | null) {
    if (!enabled() || coords.length < 2) { active = null; return; }
    active = {
      version: 1,
      id: `trace-${Date.now()}`,
      startedAt: Date.now(),
      endedAt: null,
      destination,
      // Strip engine-internal fields so the JSON round-trips into a fresh engine.
      route: {
        coords,
        steps: steps.map(({ routeOffset, _stopOffsets, ...s }) => s as NavStep),
      },
      fixes: [],
      engine: [],
    };
  },

  fix(f: RecordedFix) {
    if (!active || active.fixes.length >= MAX_FIXES) return;
    active.fixes.push(f);
  },

  engineTick(result: EngineResult) {
    if (!active || active.engine.length >= MAX_FIXES) return;
    active.engine.push({
      t: Date.now(),
      stepIndex: result.stepIndex,
      status: result.status,
      distFromRouteM: Math.round(result.distanceFromRouteM * 10) / 10,
      remainingM: Math.round(result.remainingDistanceM),
    });
  },

  async end() {
    if (!active) return;
    const session = active;
    active = null;
    if (session.fixes.length < 10) return; // nothing worth keeping
    session.endedAt = Date.now();
    try {
      const sessions = await TraceRecorder.list();
      const next = [session, ...sessions].slice(0, MAX_SESSIONS);
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // storage full/unavailable — recording is best-effort
    }
  },

  async list(): Promise<RecordedSession[]> {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as RecordedSession[]) : [];
    } catch {
      return [];
    }
  },

  async remove(id: string) {
    const sessions = await TraceRecorder.list();
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(sessions.filter((s) => s.id !== id)));
  },
};
