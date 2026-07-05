// services/navigationEngine.ts
//
// Projection-based navigation engine.
// Instead of checking "am I close to step N's endpoint?" we project the user
// onto the full route polyline, compute how far along the route they are, and
// derive every navigation metric from that single number (distanceAlongRoute).
//
// This makes step advancement, ETA, and off-route detection robust against
// the 5–15 m GPS noise that breaks endpoint-proximity approaches.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NavStep {
  instruction: string;
  distance:    number;   // metres
  duration:    number;   // scheduled seconds, used for hybrid transit ETA
  location:    [number, number]; // [lng, lat] – GeoJSON convention
  type?:       string;
  subSteps?:   any;
  /** Ordered stops along this leg (transit only). Populated by caller. */
  stops?:      Array<{ name: string; lat: number; lng: number }>;
  /** Populated internally by the engine. Do not set manually. */
  routeOffset?:  number;
  /** Populated internally: each stop's position along the route (m). */
  _stopOffsets?: Array<{ name: string; offset: number }>;
}

export type EngineStatus  = "active" | "off_route" | "rerouting" | "arrived";
/** How far the user is from the next maneuver. Null when already at final step. */
export type ApproachPhase = "preview" | "far" | "near" | "imminent" | null;

export interface EngineResult {
  status:             EngineStatus;
  /** Index into the steps array the user is currently heading toward. */
  stepIndex:          number;
  remainingDistanceM: number;
  remainingDurationS: number;
  eta:                Date;
  /** Distance to the *next* step's trigger point along the route. */
  distanceToNextStepM: number;
  /** Tiered pre-announcement zone based on distanceToNextStepM. */
  approachPhase:      ApproachPhase;
  /** Route bearing at the user's current projected position (degrees, 0 = north). */
  routeBearing:       number;
  /** Perpendicular distance from user to the nearest route segment (m). */
  distanceFromRouteM: number;
  /** The nearest point on the route polyline to the user's GPS position [lng, lat]. */
  projectedPoint: { latitude: number; longitude: number };
  /** Stops ahead on the current transit leg. Null when on a walk leg. */
  stopsRemaining:     number | null;
  /** Name of the stop the user most recently passed. Null when on a walk leg. */
  currentStopName:    string | null;
  /** Mode of the current segment ("WALK", "BUS", etc.). */
  currentSegmentMode: string | null;
  /** ETA at each step's endpoint. Index i < stepIndex → new Date(0) (already passed). */
  stepETAs: Date[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EARTH_R_M          = 6_371_000;
/** How far off the line (m) counts as a strike. */
const OFF_ROUTE_THRESH_M = 45;
/** How many consecutive strikes before we declare off-route. */
const OFF_ROUTE_STRIKES  = 3;
/** Within this many metres of the final coordinate = arrived. */
const ARRIVE_M           = 5;
/** Fallback walking speed when GPS speed is unreliable (m/s). */
const WALK_SPEED_MPS     = 1.4;
/** GPS speed below which we use the fallback (m/s). */
const MIN_RELIABLE_SPEED = 0.5;
/** Local projection window: metres to look back from last known offset. */
const SEARCH_BACK_M      = 150;
/** Local projection window: metres to look ahead from last known offset. */
const SEARCH_AHEAD_M     = 500;
/** Early-advance buffer: treat a step as reached when within this many m. */
const STEP_REACH_M       = 18;
// Approach-phase thresholds (metres to next maneuver) — 4-stage system:
// preview (>500 m, silent) → far (~500 m) → near (~300 m) → imminent (<100 m)
const PHASE_PREVIEW_M    = 500;
const PHASE_FAR_M        = 300;
const PHASE_NEAR_M       = 100;
// Exit hysteresis: phase only reverts when distance rises past these wider bounds.
// Prevents voice-cue re-triggering at GPS jitter boundaries.
const PHASE_PREVIEW_EXIT_M = 560;
const PHASE_FAR_EXIT_M   = 340;
const PHASE_NEAR_EXIT_M  = 130;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in metres between two [lng, lat] points. */
function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project point P onto segment AB.
 * Returns the parameterised position `t` ∈ [0,1] along AB,
 * the exact snapped point, and the perpendicular distance from P to the segment.
 *
 * We work in degrees (flat-earth approximation) because the segments are
 * short enough (< 200 m typically) that the error is well under 1 m.
 */
function projectOntoSegment(
  P: [number, number],
  A: [number, number],
  B: [number, number],
): { t: number; point: [number, number]; distM: number } {
  const [ax, ay] = A;
  const [bx, by] = B;
  const [px, py] = P;

  const abx = bx - ax, aby = by - ay;
  const ab2 = abx * abx + aby * aby;

  let t = 0;
  if (ab2 > 0) {
    t = ((px - ax) * abx + (py - ay) * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
  }

  const point: [number, number] = [ax + t * abx, ay + t * aby];
  const distM = haversineM(P, point);
  return { t, point, distM };
}

/** Initial bearing from A → B in degrees [0, 360). */
function bearingDeg(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const dLng = toRad(lng2 - lng1);
  const la1  = toRad(lat1);
  const la2  = toRad(lat2);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** True for any transit mode (bus, tram, rail, ferry, subway). */
function isTransit(type?: string): boolean {
  if (!type) return false;
  const t = type.toUpperCase();
  return t !== "WALK";
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class NavigationEngine {
  /** Full route polyline as [lng, lat] pairs. */
  private readonly coords: [number, number][];
  /** Length of each polyline segment (coords[i] → coords[i+1]), in metres. */
  private readonly segLen: number[];
  /** Cumulative distance from route start to the *start* of segment i (m). */
  private readonly cumDist: number[];
  /** Total route length (m). */
  readonly totalDistM: number;
  /** Steps with `routeOffset` and `_stopOffsets` pre-computed. */
  readonly steps: NavStep[];

  private offRouteStrikes = 0;
  /** The furthest distanceAlongRoute we've ever confirmed. Prevents backward snap. */
  private highWaterMark = 0;
  /** Persisted approach phase — guards against flip-flopping at threshold boundaries. */
  private _approachPhase: ApproachPhase = null;

  constructor(rawCoords: [number, number][], steps: NavStep[]) {
    // ── Degenerate route guard: remove consecutive duplicate coordinates ──────
    const coords: [number, number][] = [rawCoords[0]];
    for (let i = 1; i < rawCoords.length; i++) {
      const prev = coords[coords.length - 1];
      const curr = rawCoords[i];
      if (curr[0] !== prev[0] || curr[1] !== prev[1]) {
        coords.push(curr);
      }
    }
    if (coords.length < 2) {
      throw new Error("NavigationEngine: need at least 2 distinct coordinates.");
    }
    this.coords = coords;

    // Pre-compute segment metrics
    this.segLen  = [];
    this.cumDist = [0];
    for (let i = 0; i < coords.length - 1; i++) {
      const d = haversineM(coords[i], coords[i + 1]);
      this.segLen.push(d);
      this.cumDist.push(this.cumDist[i] + d);
    }
    this.totalDistM = this.cumDist[this.cumDist.length - 1];

    // Pre-compute each step's position along the route + stop offsets
    this.steps = steps.map((step) => {
      const routeOffset = this.computeOffsetForPoint(step.location);
      const _stopOffsets = (step.stops ?? []).map((s) => ({
        name:   s.name,
        offset: this.computeOffsetForPoint([s.lng, s.lat]),
      }));
      return { ...step, routeOffset, _stopOffsets };
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Find where on the polyline a point is, returning metres from route start. */
  private computeOffsetForPoint(pt: [number, number]): number {
    let bestDistM  = Infinity;
    let bestOffset = 0;

    for (let i = 0; i < this.coords.length - 1; i++) {
      const { t, distM } = projectOntoSegment(pt, this.coords[i], this.coords[i + 1]);
      if (distM < bestDistM) {
        bestDistM  = distM;
        bestOffset = this.cumDist[i] + t * this.segLen[i];
      }
    }
    return bestOffset;
  }

  /**
   * Project the user onto the polyline using a local search window.
   * Only scans segments immediately around the user's last known location
   * to avoid unnecessary JS thread work on long routes.
   */
  private projectUser(
    pt: [number, number],
    lastConfirmedOffset: number,
  ): { offset: number; distFromRouteM: number; segIdx: number; projPoint: [number, number] } {
    const searchStart = Math.max(0, lastConfirmedOffset - SEARCH_BACK_M);
    const searchEnd   = lastConfirmedOffset + SEARCH_AHEAD_M;

    let bestDistM  = Infinity;
    let bestOffset = lastConfirmedOffset;
    let bestSeg    = 0;
    let bestPoint: [number, number] = [pt[0], pt[1]];

    for (let i = 0; i < this.coords.length - 1; i++) {
      if (this.cumDist[i + 1] < searchStart) continue;
      if (this.cumDist[i] > searchEnd) break;

      const { t, point, distM } = projectOntoSegment(pt, this.coords[i], this.coords[i + 1]);
      if (distM < bestDistM) {
        bestDistM  = distM;
        bestOffset = this.cumDist[i] + t * this.segLen[i];
        bestSeg    = i;
        bestPoint  = point;
      }
    }

    // Global fallback: user teleported (tunnel exit, long GPS gap)
    if (bestDistM > 100) {
      bestDistM = Infinity;
      for (let i = 0; i < this.coords.length - 1; i++) {
        const { t, point, distM } = projectOntoSegment(pt, this.coords[i], this.coords[i + 1]);
        if (distM < bestDistM) {
          bestDistM  = distM;
          bestOffset = this.cumDist[i] + t * this.segLen[i];
          bestSeg    = i;
          bestPoint  = point;
        }
      }
    }

    return { offset: bestOffset, distFromRouteM: bestDistM, segIdx: bestSeg, projPoint: bestPoint };
  }

  /**
   * Hybrid ETA: transit legs use their scheduled duration (proportionally
   * for the current leg); walk legs use live GPS speed or the walk fallback.
   * This avoids the wild swings caused by bus GPS speed at traffic lights.
   */
  private computeHybridETA(
    confirmedOffset: number,
    stepIndex:       number,
    speedMps:        number,
  ): number {
    const speed = speedMps >= MIN_RELIABLE_SPEED ? speedMps : WALK_SPEED_MPS;
    let totalS  = 0;

    for (let i = stepIndex; i < this.steps.length; i++) {
      const step      = this.steps[i];
      const stepStart = i > 0 ? (this.steps[i - 1].routeOffset ?? 0) : 0;
      const stepEnd   = step.routeOffset ?? this.totalDistM;
      const stepDist  = Math.max(0, stepEnd - stepStart);

      // How much of this step is still ahead of the user?
      const remainFrac = stepDist > 0
        ? Math.max(0, Math.min(1, (stepEnd - confirmedOffset) / stepDist))
        : 0;

      if (i === stepIndex) {
        // Current (partially traversed) step
        if (isTransit(step.type) && step.duration > 0) {
          totalS += remainFrac * step.duration;
        } else {
          totalS += Math.max(0, stepEnd - confirmedOffset) / speed;
        }
      } else {
        // Future steps, use full scheduled duration for transit, else walk speed
        if (isTransit(step.type) && step.duration > 0) {
          totalS += step.duration;
        } else {
          totalS += stepDist / speed;
        }
      }
    }

    return totalS;
  }

  /**
   * Build per-step ETAs in one pass using the same hybrid logic as computeHybridETA.
   * Index i holds the Date when the user is expected to reach step i's endpoint.
   * Steps before newStepIndex are filled with new Date(0) (already passed).
   */
  private buildStepETAs(
    confirmedOffset: number,
    newStepIndex:    number,
    speedMps:        number,
    now:             number,
  ): Date[] {
    const speed = speedMps >= MIN_RELIABLE_SPEED ? speedMps : WALK_SPEED_MPS;
    const etas: Date[] = new Array(this.steps.length).fill(null).map(() => new Date(0));
    let cumulativeS = 0;

    for (let i = newStepIndex; i < this.steps.length; i++) {
      const step      = this.steps[i];
      const stepStart = i > 0 ? (this.steps[i - 1].routeOffset ?? 0) : 0;
      const stepEnd   = step.routeOffset ?? this.totalDistM;
      const stepDist  = Math.max(0, stepEnd - stepStart);
      const remainFrac = stepDist > 0
        ? Math.max(0, Math.min(1, (stepEnd - confirmedOffset) / stepDist))
        : 0;

      if (i === newStepIndex) {
        cumulativeS += isTransit(step.type) && step.duration > 0
          ? remainFrac * step.duration
          : Math.max(0, stepEnd - confirmedOffset) / speed;
      } else {
        cumulativeS += isTransit(step.type) && step.duration > 0
          ? step.duration
          : stepDist / speed;
      }
      etas[i] = new Date(now + cumulativeS * 1_000);
    }
    return etas;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Feed the engine a smoothed location update.
   *
   * @param lng      Smoothed longitude
   * @param lat      Smoothed latitude
   * @param speedMps Smoothed GPS speed (m/s)
   * @param stepIndex The step index the caller thinks is current
   */
  update(
    lng:       number,
    lat:       number,
    speedMps:  number,
    stepIndex: number,
  ): EngineResult {
    const pt: [number, number] = [lng, lat];

    // ── 1. Project user onto polyline ──────────────────────────────────────
    const { offset, distFromRouteM, segIdx, projPoint } = this.projectUser(pt, this.highWaterMark);

    // Monotonically advance the high water mark to prevent backward snap
    const confirmedOffset = Math.max(offset, this.highWaterMark);
    if (offset > this.highWaterMark + 2) {
      this.highWaterMark = offset;
    }

    // ── 2. Off-route detection ─────────────────────────────────────────────
    if (distFromRouteM > OFF_ROUTE_THRESH_M) {
      this.offRouteStrikes = Math.min(this.offRouteStrikes + 1, OFF_ROUTE_STRIKES + 2);
    } else {
      this.offRouteStrikes = Math.max(0, this.offRouteStrikes - 1);
    }
    const offRoute = this.offRouteStrikes >= OFF_ROUTE_STRIKES;

    // ── 3. Advance step index ──────────────────────────────────────────────
    // Step i's routeOffset is the offset of ITS OWN endpoint: once the user
    // passes it (minus the reach buffer), the next step becomes current.
    // (Regression note: comparing against steps[i+1].routeOffset here delayed
    // every leg transition by one full segment — walk→bus flipped only near
    // the END of the bus ride. Covered by navigationEngine.test.ts.)
    let newStepIndex = stepIndex;
    for (let i = stepIndex; i < this.steps.length - 1; i++) {
      const stepEndOffset = this.steps[i].routeOffset ?? this.totalDistM;
      if (confirmedOffset >= stepEndOffset - STEP_REACH_M) {
        newStepIndex = i + 1;
      } else {
        break;
      }
    }
    // Reset approach phase when the user advances to a new step so the new
    // step's phase initialises fresh rather than inheriting the old one.
    if (newStepIndex !== stepIndex) this._approachPhase = null;

    // ── 4. Hybrid ETA ─────────────────────────────────────────────────────
    const now                 = Date.now();
    const remainingDurationS  = this.computeHybridETA(confirmedOffset, newStepIndex, speedMps);
    const remainingDistanceM  = Math.max(0, this.totalDistM - confirmedOffset);
    const eta                 = new Date(now + remainingDurationS * 1_000);
    const stepETAs            = this.buildStepETAs(confirmedOffset, newStepIndex, speedMps, now);

    // ── 5. Distance to next step + approach phase ──────────────────────────
    const upcomingStep        = this.steps[newStepIndex];
    const upcomingStepOffset  = upcomingStep?.routeOffset ?? this.totalDistM;
    const distanceToNextStepM = Math.max(0, upcomingStepOffset - confirmedOffset);

    let approachPhase: ApproachPhase = null;
    if (upcomingStep && newStepIndex < this.steps.length - 1) {
      const d = distanceToNextStepM;
      if (this._approachPhase === null) {
        // First update for this step: initialise from current distance.
        if      (d >= PHASE_PREVIEW_M) this._approachPhase = "preview";
        else if (d >  PHASE_FAR_M)     this._approachPhase = "far";
        else if (d >  PHASE_NEAR_M)    this._approachPhase = "near";
        else                           this._approachPhase = "imminent";
      } else {
        // Hysteresis: only transition when distance clearly crosses the exit bound.
        const p = this._approachPhase;
        if      (p === "preview"  && d <  PHASE_PREVIEW_M)     this._approachPhase = "far";
        else if (p === "far"      && d >= PHASE_PREVIEW_EXIT_M) this._approachPhase = "preview";
        else if (p === "far"      && d <= PHASE_FAR_M)          this._approachPhase = "near";
        else if (p === "near"     && d >  PHASE_FAR_EXIT_M)     this._approachPhase = "far";
        else if (p === "near"     && d <= PHASE_NEAR_M)         this._approachPhase = "imminent";
        else if (p === "imminent" && d >  PHASE_NEAR_EXIT_M)    this._approachPhase = "near";
      }
      approachPhase = this._approachPhase;
    }

    // ── 6. Route bearing ──────────────────────────────────────────────────
    const safeSegIdx  = Math.min(segIdx, this.coords.length - 2);
    const routeBearing = bearingDeg(this.coords[safeSegIdx], this.coords[safeSegIdx + 1]);

    // ── 7. Arrival ────────────────────────────────────────────────────────
    const distToEnd = haversineM(pt, this.coords[this.coords.length - 1]);
    const arrived   = distToEnd <= ARRIVE_M || remainingDistanceM <= ARRIVE_M;

    // ── 8. Transit stop tracking ───────────────────────────────────────────
    let stopsRemaining:  number | null = null;
    let currentStopName: string | null = null;
    const currentSegmentMode = upcomingStep?.type ?? null;

    if (isTransit(upcomingStep?.type) && upcomingStep._stopOffsets?.length) {
      const ahead  = upcomingStep._stopOffsets.filter((s) => s.offset > confirmedOffset);
      const passed = upcomingStep._stopOffsets.filter((s) => s.offset <= confirmedOffset);
      stopsRemaining  = ahead.length;
      currentStopName = passed.length > 0 ? passed[passed.length - 1].name : null;
    }

    return {
      status:             arrived ? "arrived" : offRoute ? "off_route" : "active",
      stepIndex:          newStepIndex,
      remainingDistanceM,
      remainingDurationS,
      eta,
      stepETAs,
      distanceToNextStepM,
      approachPhase,
      routeBearing,
      distanceFromRouteM: distFromRouteM,
      projectedPoint: { latitude: projPoint[1], longitude: projPoint[0] },
      stopsRemaining,
      currentStopName,
      currentSegmentMode,
    };
  }

  /** Reset progress (call when rerouting or restarting navigation). */
  resetProgress() {
    this.highWaterMark   = 0;
    this.offRouteStrikes = 0;
    this._approachPhase  = null;
  }

  /**
   * Jump progress to a specific offset along the route (m). Used when the
   * user manually confirms boarding a vehicle: GPS often lags the real
   * transition, so the UI can force the engine onto the transit leg.
   */
  forceProgressTo(offsetM: number) {
    this.highWaterMark   = Math.max(0, Math.min(offsetM, this.totalDistM));
    this.offRouteStrikes = 0;
    this._approachPhase  = null;
  }

  /**
   * Advance position by dead-reckoning when GPS is unavailable.
   * Moves the high-water mark forward using the last known speed.
   */
  deadReckon(speedMps: number, elapsedS: number) {
    // Clamp to 30 m/s (108 km/h) so a stale high-speed reading during GPS outage
    // can't teleport the dead-reckoned position by kilometres.
    const clamped = Math.min(Math.max(0, speedMps), 30);
    this.highWaterMark = Math.min(this.highWaterMark + clamped * elapsedS, this.totalDistM);
  }

  getHighWaterMark(): number { return this.highWaterMark; }
  getStrikes(): number { return this.offRouteStrikes; }

  /** Restore engine state from a persisted session. Call after construction. */
  restore(highWaterMark: number, strikes: number): void {
    this.highWaterMark   = highWaterMark;
    this.offRouteStrikes = strikes;
  }
}
