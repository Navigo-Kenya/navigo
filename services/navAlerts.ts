// services/navAlerts.ts
//
// One voice for navigation, and a calm one (Google Maps' and Waze's habits):
//   - priorities: "turn now" or "get off at the next stop" interrupts a
//     landmark; a landmark never interrupts a turn;
//   - expiry: a cue that waited too long (its turn has passed) is dropped,
//     never spoken late;
//   - one of each: the same key is said once (a route's cues carry its
//     generation, so a new route can say its own);
//   - breathing room: chatter (landmarks, stops passed) only fills a quiet
//     gap, and is dropped when anything else is waiting;
//   - one buzz per alert, never two within 1.5 s (critical ones excepted).
// Pure, with the speaker and the clock injected, so it's tested as is.

export const P = { info: 0, normal: 1, high: 2, critical: 3 } as const;
export type AlertPriority = (typeof P)[keyof typeof P];

export interface SpokenAlert {
  /** Said once per key: "g3:turn:0:4:near", "alight:1:next". */
  key: string;
  text: string;
  priority: AlertPriority;
  /** How long it may wait before it's stale (ms). */
  ttlMs?: number;
}

export interface Speaker {
  speak(text: string, onDone: () => void): void;
  stop(): void;
}

/** How long each kind may wait in line before it no longer applies. */
const DEFAULT_TTL: Record<AlertPriority, number> = { 0: 4_000, 1: 8_000, 2: 6_000, 3: 12_000 };
/** Chatter needs this much silence before it, so it never runs into a cue. */
export const INFO_GAP_MS = 6_000;
/** Buzzes closer than this blur into one: the later one is skipped. */
export const HAPTIC_GAP_MS = 1_500;
const MAX_KEYS = 400;

interface Item extends SpokenAlert {
  at: number;
  expires: number;
}

export class VoiceQueue {
  private queue: Item[] = [];
  private current: Item | null = null;
  private said = new Set<string>();
  private lastDoneAt = -Infinity;

  constructor(private speaker: Speaker, private now: () => number = Date.now) {}

  /** Queues an alert; false when it's dropped (said already, or chatter at a bad time). */
  say(a: SpokenAlert): boolean {
    const t = this.now();
    if (!a.text.trim()) return false;
    if (this.said.has(a.key) || this.current?.key === a.key || this.queue.some((q) => q.key === a.key)) return false;
    if (a.priority === P.info && (this.current || this.queue.length > 0 || t - this.lastDoneAt < INFO_GAP_MS)) {
      return false;
    }
    const item: Item = { ...a, at: t, expires: t + (a.ttlMs ?? DEFAULT_TTL[a.priority]) };

    // Something important cuts in over something lesser (a turn over a landmark).
    if (this.current && a.priority >= P.high && a.priority > this.current.priority) {
      this.current = null; // first, so the stopped item's callback is ignored
      this.speaker.stop();
    }
    // Chatter never waits behind anything.
    this.queue = this.queue.filter((q) => q.priority > P.info);
    this.queue.push(item);
    this.queue.sort((x, y) => y.priority - x.priority || x.at - y.at);
    this.pump();
    return true;
  }

  /** Drops what's waiting under a key prefix (the turn was passed, the leg ended). */
  forget(prefix: string): void {
    this.queue = this.queue.filter((q) => !q.key.startsWith(prefix));
  }

  /** Lets keys be said again (a new trip). */
  resetKeys(): void {
    this.said.clear();
  }

  /** Silence, now: the trip ended or was paused. */
  clear(): void {
    this.queue = [];
    const speaking = this.current != null;
    this.current = null;
    if (speaking) this.speaker.stop();
  }

  get speaking(): boolean {
    return this.current != null;
  }

  get pending(): number {
    return this.queue.length;
  }

  private pump(): void {
    if (this.current) return;
    const t = this.now();
    this.queue = this.queue.filter((q) => q.expires > t);
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    this.said.add(next.key);
    if (this.said.size > MAX_KEYS) this.said = new Set([...this.said].slice(-MAX_KEYS / 2));
    this.speaker.speak(next.text, () => {
      if (this.current !== next) return;
      this.current = null;
      this.lastDoneAt = this.now();
      this.pump();
    });
  }
}

/** One buzz per alert: a second within 1.5 s is skipped, unless it's critical. */
export class HapticGate {
  private last = -Infinity;
  constructor(private now: () => number = Date.now) {}

  allow(priority: AlertPriority): boolean {
    const t = this.now();
    if (priority < P.critical && t - this.last < HAPTIC_GAP_MS) return false;
    this.last = t;
    return true;
  }
}

// ── What gets said when a matatu ride nears its stop ─────────────────────────

export type AlightCue = "soon" | "next" | "now";

/**
 * Two warnings, not three: "in 2 stops", then "at the next stop". "Get off
 * now" only when the stop arrives long after the last warning (a long gap
 * between stops), so close stops don't get three messages in a minute.
 */
export function alightCue(stopsLeft: number, lastCue: AlightCue | null, lastCueAt: number, now: number): AlightCue | null {
  if (stopsLeft === 2 && lastCue == null) return "soon";
  if (stopsLeft === 1 && lastCue !== "next" && lastCue !== "now") return "next";
  if (stopsLeft === 0 && lastCue !== "now") {
    if (lastCue == null || now - lastCueAt >= 60_000) return "now";
  }
  return null;
}

export function alightText(cue: AlightCue, stop: string | null, landmark: string | null): string {
  const at = stop ? ` at ${stop}` : "";
  const lm = landmark ? `, ${landmark}` : "";
  switch (cue) {
    case "soon": return `Get off in 2 stops${at}.`;
    case "next": return `Get off at the next stop${stop ? `, ${stop}` : ""}${lm}.`;
    case "now": return `Get off here${stop ? `: ${stop}` : ""}.`;
  }
}

// ── Arrival ──────────────────────────────────────────────────────────────────

/**
 * Which side of the way the destination is, from the last stretch of the
 * route (a → b) and the destination point: "left", "right", or null when it
 * sits on the line (within 6 m) or the stretch is too short to say.
 */
export function sideOfWay(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): "left" | "right" | null {
  const kx = 111_320 * Math.cos((b.lat * Math.PI) / 180);
  const ky = 110_540;
  const ux = (b.lng - a.lng) * kx, uy = (b.lat - a.lat) * ky;
  const vx = (dest.lng - a.lng) * kx, vy = (dest.lat - a.lat) * ky;
  const len = Math.hypot(ux, uy);
  if (len < 3) return null;
  const cross = (ux * vy - uy * vx) / len; // metres off the line, left positive
  if (Math.abs(cross) < 6) return null;
  return cross > 0 ? "left" : "right";
}

export function arrivalText(name: string, side: "left" | "right" | null): string {
  return side ? `You've arrived. ${name} is on your ${side}.` : `You've arrived at ${name}.`;
}
