// services/navMetrics.ts
// Product telemetry for navigation quality: reroute rate, snap rate,
// GPS-lost duration, arrival precision, manual-vs-auto boarding. Buffered
// per trip and flushed once at trip end — never blocks navigation, silently
// drops on network failure. This data is how thresholds like ARRIVE_M,
// SNAP_WALK_M and the boarding radius get tuned from real rides.
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import api from "./apiClient";

interface MetricEvent {
  event: string;
  value?: number | null;
  meta?: Record<string, unknown>;
  at: number;
}

function uuid(): string {
  // RFC4122-ish v4, good enough for session correlation.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let sessionId: string | null = null;
let buffer: MetricEvent[] = [];

// Per-session counters for the summary event.
let updates = 0;
let snappedUpdates = 0;

export const NavMetrics = {
  beginSession() {
    sessionId = uuid();
    buffer = [];
    updates = 0;
    snappedUpdates = 0;
    // Correlate crash reports with this trip's telemetry (no-op without DSN).
    Sentry.setTag("nav_session", sessionId);
  },

  event(event: string, value?: number | null, meta?: Record<string, unknown>) {
    if (!sessionId || buffer.length >= 90) return;
    buffer.push({ event, value: value ?? null, meta, at: Date.now() });
    Sentry.addBreadcrumb({
      category: "nav",
      message: event,
      data: { value: value ?? undefined, ...meta },
      level: "info",
    });
  },

  /** Called once per engine update; aggregated into snap_rate at flush. */
  tick(snapped: boolean) {
    if (!sessionId) return;
    updates++;
    if (snapped) snappedUpdates++;
  },

  /** Flush at trip end. arrivalPrecisionM = final distance to destination. */
  async endSession(arrivalPrecisionM: number | null) {
    if (!sessionId) return;
    const sid = sessionId;
    sessionId = null;

    if (updates > 0) {
      buffer.push({
        event: "snap_rate",
        value: Math.round((snappedUpdates / updates) * 100),
        meta: { updates },
        at: Date.now(),
      });
    }
    if (arrivalPrecisionM != null) {
      buffer.push({ event: "arrival_precision", value: Math.round(arrivalPrecisionM), at: Date.now() });
    }
    buffer.push({ event: "session_summary", value: updates, at: Date.now() });

    const events = buffer.slice(0, 100);
    buffer = [];
    if (events.length === 0) return;

    try {
      await api.post(
        "/telemetry/nav-metrics",
        { session_id: sid, device: `${Platform.OS} ${Platform.Version}`, events },
        { timeout: 8000 },
      );
    } catch {
      // Telemetry is best-effort by definition.
    }
  },
};
