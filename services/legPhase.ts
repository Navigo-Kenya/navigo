// services/legPhase.ts
//
// Which part of the trip the user is in right now: walking to the stage,
// waiting there, on board, off again; for a boda or a taxi, waiting for the
// ride or riding it. The plan says what should come next; the phone's
// movement over the last seconds confirms it. One GPS reading never decides
// (a jump, a jog, a matatu stuck in traffic all fool a single sample).
//
// Every automatic change can be undone in one tap, and every change can be
// made by hand ("I'm on board", "I got off", "We're off").
//
// The conditions, all over a 12 s window of 1 Hz fixes, each holding for a
// few seconds before anything changes:
//
//   vehicle motion  median speed ≥ 4.5 m/s (16 km/h, faster than anyone runs
//                   for 12 s), or ≥ 2.5 m/s with a burst ≥ 6 m/s (traffic);
//                   ≥ 80% of fixes within 35 m of the line; the course within
//                   60° of the line's direction
//   slow            median speed ≤ the threshold of the change
//
//   walk → wait     next leg is a ride, within 40 m of its stop, slow (1.5 m/s) for 5 s
//   wait → ride     vehicle motion for 8 s, and 60 m from where they waited
//   walk → ride     next leg is a ride, vehicle motion along the walk for 10 s
//                   (boarded at an earlier stage on the same road)
//   ride → walk     within 80 m of the alight stop (or past its end), and slow
//                   (1.8 m/s) for 8 s or walking away from the line (30 m)
//   ride → wait     a false start: still within 150 m of the boarding stop,
//                   under 100 m along, slow for 60 s
//   missed stop     still riding 250 m past the alight stop
//   pickup → go     a boda or taxi passenger moving ≥ 4 m/s for 6 s (the
//                   rider picks the road, so no line condition)
import type { LegKind, LegProfile, Role } from "./navProfile";

export type NavPhase = "walk" | "wait" | "ride" | "pickup" | "go";

export type PhaseEvent =
  | "waiting"        // walk → wait
  | "boarded"        // wait → ride
  | "boarded_early"  // walk → ride
  | "alighted"       // ride → walk
  | "back_to_stop"   // ride → wait
  | "missed_stop"    // still riding past the stop
  | "ride_started";  // pickup → go

export const DETECT = {
  WINDOW_MS: 12_000,
  MIN_SAMPLES: 6,
  VEHICLE_MEDIAN_MPS: 4.5,
  TRAFFIC_MEDIAN_MPS: 2.5,
  TRAFFIC_PEAK_MPS: 6,
  ON_LINE_M: 35,
  ON_LINE_SHARE: 0.8,
  ALIGNED_DEG: 60,
  HOLD_MS: 8_000,
  EARLY_HOLD_MS: 10_000,
  BOARD_GAIN_M: 60,
  WAIT_NEAR_STOP_M: 40,
  WAIT_SLOW_MPS: 1.5,
  WAIT_HOLD_MS: 5_000,
  ALIGHT_NEAR_M: 80,
  ALIGHT_SLOW_MPS: 1.8,
  ALIGHT_OFF_LINE_M: 30,
  FALSE_START_MS: 60_000,
  FALSE_START_NEAR_M: 150,
  FALSE_START_ALONG_M: 100,
  MISSED_STOP_M: 250,
  RIDE_START_MPS: 4.0,
  RIDE_START_HOLD_MS: 6_000,
  /** An automatic change can be undone for this long. */
  UNDO_MS: 15_000,
} as const;

export interface PhaseInput {
  now: number;
  lat: number;
  lng: number;
  /** GPS speed (m/s), drift-clamped (0 under 0.6 m/s). */
  speed: number;
  /** Course over ground (deg), or null when unknown. */
  heading: number | null;
  /** The engine's current leg. */
  legKind: LegKind;
  /** The previous leg was a ride (this walk starts at its alight stop). */
  prevIsTransit: boolean;
  /** The next leg is a ride (this walk ends at its boarding stop). */
  nextIsTransit: boolean;
  /** Distance (m) from the current leg's line, and the line's bearing there. */
  distFromLineM: number;
  routeBearing: number;
  /** Progress along the current leg (m) and its length. */
  alongM: number;
  legLengthM: number;
  /** Straight-line distance (m) to the current leg's start and end. */
  toLegStartM: number;
  toLegEndM: number;
}

interface Sample { t: number; speed: number; onLine: boolean; delta: number | null }

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat2 - lat1) * 110_574;
  const dx = (lng2 - lng1) * 111_320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/** The phase a leg starts in. */
export function initialPhase(kind: LegKind, role: Role, ridingAlready = false): NavPhase {
  switch (kind) {
    case "transit": return ridingAlready ? "ride" : "wait";
    case "walk": return ridingAlready ? "ride" : "walk";
    case "bicycle": return "go";
    default: return role === "driver" ? "go" : "pickup";
  }
}

export class PhaseTracker {
  phase: NavPhase = "walk";
  private samples: Sample[] = [];
  /** Named conditions and since when they've held (ms). */
  private timers = new Map<string, number>();
  private waitAt: { lat: number; lng: number } | null = null;
  private missedWarned = false;
  private undoable: { from: NavPhase; at: number } | null = null;

  /**
   * A new leg (the engine advanced, a reroute, a start). Riding carries over a
   * leg change (boarded early, or still aboard past the stop), and so does a
   * boda or taxi ride already under way (a reroute mid-ride).
   */
  enterLeg(kind: LegKind, role: Role, opts: { at?: { lat: number; lng: number } } = {}) {
    const riding = this.phase === "ride";
    const moving = this.phase === "go" && (kind === "car" || kind === "motorbike" || kind === "bicycle");
    this.phase = moving ? "go" : initialPhase(kind, role, riding && (kind === "transit" || kind === "walk"));
    this.timers.clear();
    this.waitAt = this.phase === "wait" ? (opts.at ?? null) : null;
    if (kind === "transit") this.missedWarned = false;
  }

  /** Set by hand ("I'm on board", "I got off", "We're off"): not undoable, it's the user's word. */
  set(phase: NavPhase, at?: { lat: number; lng: number }) {
    this.phase = phase;
    this.timers.clear();
    this.waitAt = phase === "wait" ? (at ?? null) : null;
    this.undoable = null;
  }

  /** Revert the last automatic change, if recent. Returns the phase restored, or null. */
  undo(now: number): NavPhase | null {
    if (!this.undoable || now - this.undoable.at > DETECT.UNDO_MS) return null;
    const back = this.undoable.from;
    this.set(back);
    return back;
  }

  reset() {
    this.phase = "walk";
    this.samples = [];
    this.timers.clear();
    this.waitAt = null;
    this.missedWarned = false;
    this.undoable = null;
  }

  /** Vehicle motion along the line right now (over the window), whatever the phase. */
  get inVehicleMotion(): boolean {
    return this.timers.has("motion");
  }

  /** Track a condition; returns how long (ms) it has held, or -1 when it doesn't. */
  private hold(key: string, cond: boolean, now: number): number {
    if (!cond) {
      this.timers.delete(key);
      return -1;
    }
    const since = this.timers.get(key) ?? now;
    this.timers.set(key, since);
    return now - since;
  }

  update(i: PhaseInput): PhaseEvent | null {
    const delta = i.heading != null && i.speed >= 2
      ? Math.abs(((i.heading - i.routeBearing + 540) % 360) - 180)
      : null;
    this.samples.push({ t: i.now, speed: i.speed, onLine: i.distFromLineM <= DETECT.ON_LINE_M, delta });
    while (this.samples.length && i.now - this.samples[0].t > DETECT.WINDOW_MS) this.samples.shift();
    if (this.samples.length < DETECT.MIN_SAMPLES) return null;

    const speeds = this.samples.map((s) => s.speed);
    const med = median(speeds);
    const peak = Math.max(...speeds);
    const fast = med >= DETECT.VEHICLE_MEDIAN_MPS || (med >= DETECT.TRAFFIC_MEDIAN_MPS && peak >= DETECT.TRAFFIC_PEAK_MPS);
    const onLine = this.samples.filter((s) => s.onLine).length / this.samples.length >= DETECT.ON_LINE_SHARE;
    const deltas = this.samples.map((s) => s.delta).filter((d): d is number => d != null);
    const aligned = !deltas.length || median(deltas) <= DETECT.ALIGNED_DEG;
    const motion = this.hold("motion", fast && onLine && aligned, i.now);

    // "Slow" is judged on the last 8 s only: a stop shows sooner than over the whole window.
    const slowMed = median(this.samples.filter((s) => i.now - s.t <= 8_000).map((s) => s.speed));

    const change = (to: NavPhase, ev: PhaseEvent): PhaseEvent => {
      this.undoable = { from: this.phase, at: i.now };
      this.phase = to;
      this.timers.clear();
      this.waitAt = to === "wait" ? { lat: i.lat, lng: i.lng } : null;
      return ev;
    };

    switch (this.phase) {
      case "walk": {
        if (i.legKind !== "walk" || !i.nextIsTransit) return null;
        if (motion >= DETECT.EARLY_HOLD_MS) return change("ride", "boarded_early");
        const waiting = this.hold("wait", i.toLegEndM <= DETECT.WAIT_NEAR_STOP_M && slowMed <= DETECT.WAIT_SLOW_MPS, i.now);
        if (waiting >= DETECT.WAIT_HOLD_MS) return change("wait", "waiting");
        return null;
      }
      case "wait": {
        if (!this.waitAt) this.waitAt = { lat: i.lat, lng: i.lng };
        const gone = metres(this.waitAt.lat, this.waitAt.lng, i.lat, i.lng) >= DETECT.BOARD_GAIN_M;
        if (motion >= DETECT.HOLD_MS && gone) return change("ride", "boarded");
        return null;
      }
      case "ride": {
        if (i.legKind === "transit") {
          const atStop = i.toLegEndM <= DETECT.ALIGHT_NEAR_M || i.alongM >= i.legLengthM - 20;
          const walkingAway = atStop && i.distFromLineM >= DETECT.ALIGHT_OFF_LINE_M && i.speed <= 2;
          const stopped = this.hold("alight", atStop && slowMed <= DETECT.ALIGHT_SLOW_MPS, i.now);
          if (walkingAway || stopped >= DETECT.HOLD_MS) return change("walk", "alighted");
          // A false start: a burst of speed at the stage, then standing there again.
          const backAtStop = !atStop && i.toLegStartM <= DETECT.FALSE_START_NEAR_M && i.alongM < DETECT.FALSE_START_ALONG_M;
          const standing = this.hold("false-start", backAtStop && slowMed <= DETECT.WAIT_SLOW_MPS, i.now);
          if (standing >= DETECT.FALSE_START_MS) return change("wait", "back_to_stop");
          return null;
        }
        if (i.legKind === "walk" && i.prevIsTransit) {
          // The engine moved on to the walk after the ride: are they off, or still aboard?
          if (!this.missedWarned && fast && i.toLegStartM >= DETECT.MISSED_STOP_M) {
            this.missedWarned = true;
            return "missed_stop";
          }
          const stopped = this.hold("alight", slowMed <= DETECT.ALIGHT_SLOW_MPS, i.now);
          if (stopped >= DETECT.HOLD_MS) return change("walk", "alighted");
          return null;
        }
        return null; // boarded early: still on the walk to the stage; the ride's leg comes next
      }
      case "pickup": {
        // The rider or driver picks the road: speed alone, held, starts the ride.
        const moving = this.hold("ride", med >= DETECT.RIDE_START_MPS, i.now);
        if (moving >= DETECT.RIDE_START_HOLD_MS) return change("go", "ride_started");
        return null;
      }
      default:
        return null;
    }
  }
}

/**
 * The leg's profile in this phase. Waiting at the stage or for a boda, the
 * walk's guidance stops (no replanning, no "wrong way" while standing); on a
 * matatu boarded at an earlier stage, the walk to the stage no longer
 * applies; moving like a vehicle on a walk (a lift, a boda instead), a
 * walking replan would chase the wrong mode.
 */
export function phaseProfile(p: LegProfile, phase: NavPhase, vehicleMotion: boolean): LegProfile {
  if (phase === "ride" && p.kind === "walk") {
    return { ...p, turns: false, voiceTurns: false, hapticTurns: false, reroute: false, wrongWay: null };
  }
  if (phase === "wait") return { ...p, reroute: false, wrongWay: null };
  if (phase === "pickup") return { ...p, voiceTurns: false, hapticTurns: false, reroute: false, wrongWay: null };
  if (p.kind === "walk" && vehicleMotion) return { ...p, reroute: false, wrongWay: null };
  return p;
}
