// hooks/useNavigation.ts
import { NavigationEngine, EngineResult } from "@/services/navigationEngine";
import { RouteService } from "@/services/route";
import { VoiceGuide } from "@/services/voiceGuide";
import { useJourneyStore } from "@/store/journeyStore";
import { usePrefsStore } from "@/store/prefsStore";
import { Coords } from "@/utils/mapHelpers";
import { LiveActivity } from "@/services/liveActivity";
import { useNavStateStore } from "@/store/navStateStore";
import { useNetworkStore } from "@/store/networkStore";
import { TraceRecorder } from "@/services/traceRecorder";
import { NavMetrics } from "@/services/navMetrics";
import { armAlightGeofence, disarmAlightGeofence, type AlightRegion } from "@/services/alightGeofence";
import { requestBackgroundPermission, startBackgroundTracking, stopBackgroundTracking } from "@/services/backgroundLocation";
import { navSession } from "@/store/navSessionStore";
import {
  scheduleAlightWarning,
  scheduleArrivalNotification,
  scheduleWrongDirectionAlert,
  cancelNotification,
} from "@/services/notifications";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import { asLandmark, progressAlong, withLandmark, PASSING_WINDOW_M } from "@/utils/landmarks";
import { isStreetMode, streetVerb } from "@/utils/streetModes";
import { journeyModeOf, legKind, legProfile, pickReroute, type LegProfile } from "@/services/navProfile";
import {
  AwayTracker,
  CUE_RANK,
  chainDistance,
  cueDistances,
  cueFor,
  legTurns,
  nextTurnIndex,
  riderCue,
  spokenDistance,
  turnSpeech,
  type LegTurn,
  type TurnCue,
} from "@/services/maneuvers";
import type { Maneuver } from "@/utils/mapHelpers";
import { PhaseTracker, phaseProfile, type NavPhase, type PhaseEvent } from "@/services/legPhase";
import { AppState, AppStateStatus, DeviceEventEmitter } from "react-native";

const EMA_LOC_WALK    = 0.25;
const EMA_LOC_TRANSIT = 0.60;
const EMA_SPD         = 0.50;
const EMA_HEAD        = 0.3;

// ── Puck glide (Google-Maps-style continuous motion) ─────────────────────────
// GPS fixes land ~1/s; rendering them directly makes the puck hop once a second.
// Instead each fix updates a *target*, and a 10 Hz loop (1) dead-reckons the
// target forward with the last known speed/heading so it never stalls between
// fixes, and (2) eases the displayed puck toward it with an exponential
// approach. New fixes shift the target, never teleport the puck → no rubber-band.
const GLIDE_TICK_MS   = 100;
/** Exponential-approach time constant (s): ~63% of the gap closed per τ. */
const GLIDE_TAU_S     = 0.35;
/** If display and target diverge beyond this (m), snap instead of glide. */
const GLIDE_SNAP_M    = 30;
/** Stop dead-reckoning the target when the last real fix is older than this. */
const GLIDE_COAST_MAX_S = 4;
/** Walk legs hug the route line within this distance (m). */
const SNAP_WALK_M     = 15;
/** Transit legs snap harder (Waze-style: the bus rides the route line). */
const SNAP_TRANSIT_M  = 40;

/** Stationary lock: at speed 0, ignore fixes that wander less than this (m). */
const STATIONARY_LOCK_M = 12;
/** Indoor detection hysteresis on the GPS-accuracy EMA (m). */
const INDOOR_ENTER_ACC_M = 32;
const INDOOR_EXIT_ACC_M  = 22;
/** Show the "I'm on board" button within this distance of the boarding stop (m). */
const BOARD_PROXIMITY_M  = 120;
/** At most one reroute per this long: each one is a routing call (and TomTom for cars). */
const REROUTE_MIN_INTERVAL_MS = 12_000;
/** Heading samples against the route before "wrong way". More in a vehicle: its route bends at junctions. */
const WRONG_WAY_STRIKES_ON_FOOT = 4;
const WRONG_WAY_STRIKES_VEHICLE = 6;
/** Closer than this, the arrival itself is the cue ("You have arrived"). */
const ARRIVAL_CUE_MIN_M = 30;

/** The next turn on a street leg: the banner, and the boda passenger's rider card. */
export interface NavTurn {
  leg: number;
  /** Index in the leg's turns; -1 when no turns are left (heading for the leg's end). */
  index: number;
  instruction: string;
  maneuver: Maneuver;
  distanceM: number;
  /** The turn after this one, when it follows within 300 m. */
  then: string | null;
  rider: { word: string; detail: string | null };
}

/** A phase change to show (and undo): "On board the 45K · Undo". */
export interface PhaseNotice {
  event: PhaseEvent;
  text: string;
  at: number;
  undoable: boolean;
}

function rolePrefs() {
  const { carRole, bodaRole } = usePrefsStore.getState().prefs;
  return { carRole, bodaRole };
}

const sameTurn = (a: NavTurn | null, b: NavTurn) =>
  !!a && a.leg === b.leg && a.index === b.index && a.instruction === b.instruction &&
  a.then === b.then && Math.round(a.distanceM / 5) === Math.round(b.distanceM / 5);

/**
 * On foot and on a bike: left = two taps, right = one strong, at the turn.
 * A boda passenger: two buzzes when the turn is near (time to tap the rider),
 * one strong at the turn.
 */
function turnHaptic(cue: TurnCue, maneuver: Maneuver, forRider: boolean) {
  const tap = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => {});
  const double = () => {
    tap(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => tap(Haptics.ImpactFeedbackStyle.Medium), 160);
  };
  if (forRider) {
    if (cue === "near") double();
    else if (cue === "now") tap(Haptics.ImpactFeedbackStyle.Heavy);
    return;
  }
  if (cue !== "now") return;
  if (maneuver.includes("left")) double();
  else if (maneuver.includes("right")) tap(Haptics.ImpactFeedbackStyle.Heavy);
  else tap(Haptics.ImpactFeedbackStyle.Medium);
}

function ema(prev: number, next: number, a: number) {
  return prev + a * (next - prev);
}

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

export function useNavigation() {
  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const setTripStatus = useJourneyStore((state) => state.setTripStatus);
  const tripStatus    = useJourneyStore((state) => state.tripStatus);
  const updateRoute   = useJourneyStore((state) => state.updateRoute);
  const navHints      = usePrefsStore((s) => s.prefs.navHints);
  const maxWalkMeters = usePrefsStore((s) => s.prefs.maxWalkMeters);

  const isNavigating = tripStatus !== "IDLE";

  const engineRef    = useRef<NavigationEngine | null>(null);
  const allCoordsRef = useRef<number[][]>([]);
  const watchRef     = useRef<Location.LocationSubscription | null>(null);
  const interpRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const meSmoothRef  = useRef<Coords | null>(null);
  const meSnapRef    = useRef<Coords | null>(null);
  /** Latest filtered+snapped fix — where the puck should be heading. */
  const glideTargetRef  = useRef<Coords | null>(null);
  /** What is currently rendered — glides toward glideTargetRef. */
  const glideDisplayRef = useRef<Coords | null>(null);
  /** Position lock while stationary — kills the wandering puck at rest. */
  const stationaryAnchorRef = useRef<Coords | null>(null);
  /** GPS accuracy EMA — high values ≈ indoors / urban canyon. */
  const accuracyEmaRef  = useRef<number | null>(null);
  const indoorRef       = useRef(false);
  /** Route bearing at the user's projected position (deg) — glide direction when snapped. */
  const routeBearingRef = useRef<number | null>(null);
  const snappedToRouteRef = useRef(false);
  /** Last engine remaining-distance — arrival precision for telemetry. */
  const lastRemainingMRef = useRef<number | null>(null);

  const stepIndexRef         = useRef<number>(0);
  const lastAnnouncedRef     = useRef<string>("");
  const prevStepIndexRef     = useRef<number>(0);
  const lastAlightAlertRef   = useRef<number>(-1);
  const lastAnnouncedStopRef  = useRef<string | null>(null);
  /** Landmarks already announced on this journey ("Passing Naivas"). */
  const announcedLandmarksRef = useRef<Set<number>>(new Set());
  const prevApproachPhaseRef  = useRef<string | null>(null);
  const reroutingRef          = useRef<boolean>(false);
  const lastGpsTimeRef       = useRef<number>(Date.now());
  const lastSpeedRef         = useRef<number>(0);
  const lastDeadReckonTimeRef = useRef<number>(Date.now());

  const wrongDirStrikesRef   = useRef<number>(0);
  const wrongDirAnnouncedRef = useRef<boolean>(false);
  const mountedRef           = useRef<boolean>(true);
  const lastSaveTimeRef      = useRef<number>(0);
  const prevSavedStepRef     = useRef<number>(-1);
  const restoredRef          = useRef<boolean>(false);

  const appStateRef            = useRef<AppStateStatus>(AppState.currentState);
  const alightNotifIdRef       = useRef<string | null>(null);
  const wrongDirNotifIdRef     = useRef<string | null>(null);
  const alightWarningFiredRef  = useRef<boolean>(false);

  const [navState, setNavState]                 = useState<EngineResult | null>(null);
  const [location, setLocation]                 = useState<Coords | null>(null);
  const [locationPermissionDenied, setPermDenied] = useState(false);
  const [gpsLost, setGpsLost]                   = useState(false);
  const [wrongDirection, setWrongDirection]     = useState(false);
  const [backgroundPermissionGranted, setBgPermGranted] = useState(false);
  const [isIndoor, setIsIndoor]                 = useState(false);
  const [canBoardTransit, setCanBoardTransit]   = useState(false);
  
  const fetchingRouteRef = useRef<boolean>(false);
  /** Each leg's turns, placed along it (street legs; empty for transit). */
  const legTurnsRef = useRef<LegTurn[][]>([]);
  /** Most urgent cue already given per turn ("leg:turn" → CUE_RANK). */
  const spokenCuesRef = useRef<Map<string, number>>(new Map());
  const awayRef = useRef(new AwayTracker());
  const headingAwayRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  /** Engine progress from a restored session: applied once, to that session's route. */
  const resumeProgressRef = useRef<{ highWaterMark: number; engineStrikes: number } | null>(null);
  const [turn, setTurn] = useState<NavTurn | null>(null);
  const [headingAway, setHeadingAway] = useState(false);
  /** Which part of the trip the user is in (services/legPhase): walking, waiting, on board… */
  const phaseRef = useRef(new PhaseTracker());
  const phaseLegRef = useRef(-1);
  const phaseValueRef = useRef<NavPhase>("walk");
  const lastPhaseEventRef = useRef<PhaseEvent | null>(null);
  /** Progress before an automatic "got off", to put back on undo. */
  const alightUndoRef = useRef<{ hwm: number; leg: number } | null>(null);
  const [phase, setPhase] = useState<NavPhase>("walk");
  const [phaseNotice, setPhaseNotice] = useState<PhaseNotice | null>(null);
  const [canAlight, setCanAlight] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    stepIndexRef.current = navState?.stepIndex ?? 0;
  }, [navState?.stepIndex]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    navSession.restore().then((session) => {
      if (!session || session.tripStatus !== "IN_TRANSIT") return;
      const store = useJourneyStore.getState();
      resumeProgressRef.current = { highWaterMark: session.highWaterMark, engineStrikes: session.engineStrikes };
      store.setJourney(session.activeJourney.fromLoc, session.activeJourney.toLoc, session.activeJourney.route);
      store.setTripStatus("IN_TRANSIT");
      stepIndexRef.current     = session.stepIndex;
      prevSavedStepRef.current = session.stepIndex;
      if (session.lastLat != null) {
        meSmoothRef.current = { latitude: session.lastLat, longitude: session.lastLng!, speed: session.lastSpeed };
      }
    });
  }, []);

  useEffect(() => {
    if (!activeJourney) {
      engineRef.current = null;
      allCoordsRef.current = [];
      setNavState(null);
      return;
    }

    if (!activeJourney.route) {
      if (!fetchingRouteRef.current) {
        fetchingRouteRef.current = true;
        RouteService.calculateJourney(activeJourney.fromLoc, activeJourney.toLoc, maxWalkMeters)
          .then((routes) => {
            if (routes.length > 0 && mountedRef.current) {
              updateRoute(routes[0]); 
            }
          })
          .catch((err) => console.error("Deep link route calc failed", err))
          .finally(() => { fetchingRouteRef.current = false; });
      }
      return; 
    }

    const segments = activeJourney.route.segments || [];
    if (segments.length === 0) return;

    const allCoords: [number, number][] = [];
    const engineSteps: any[]            = [];

    segments.forEach((seg: any, segIdx: number) => {
      (seg.coordinates as [number, number][]).forEach(([lat, lng]) =>
        allCoords.push([lng, lat]),
      );

      // A step's trigger point is the end of its leg: for walks, the stop or
      // place being walked to; for rides, the stop to alight at. Both carry
      // their landmark ("Alight at Westlands, just after Oryx Energies").
      const nextSeg = segments[segIdx + 1];
      const verb = streetVerb(seg.mode);
      const isStreet = isStreetMode(seg.mode);
      engineSteps.push({
        instruction: isStreet
          ? withLandmark(`${verb} to ${seg.to.name}`, nextSeg?.stops?.length ? asLandmark(nextSeg.from.landmark) : null)
          : withLandmark(`Alight at ${seg.to.name}`, asLandmark(seg.to.landmark)),
        distance: seg.distance,
        duration: seg.duration,
        location: [seg.to.lng, seg.to.lat] as [number, number],
        type:     seg.mode,
        subSteps: seg.walk_steps,
        stops:    seg.stops ?? [],
      });
    });

    allCoordsRef.current = allCoords; 
    engineRef.current = new NavigationEngine(allCoords, engineSteps);
    announcedLandmarksRef.current = new Set();
    legTurnsRef.current = segments.map((seg: any) =>
      legKind(seg.mode) === "transit" ? [] : legTurns(seg.coordinates ?? [], seg.walk_steps),
    );
    spokenCuesRef.current = new Map();
    setTurn(null);
    phaseLegRef.current = -1;

    // Progress saved with a session belongs to that session's route: apply it
    // once, when resuming. (Applied to every new route, a reroute inherited the
    // old route's progress; past the new route's length, the trip "arrived".)
    const resume = resumeProgressRef.current;
    if (resume) {
      resumeProgressRef.current = null;
      engineRef.current.restore(resume.highWaterMark, resume.engineStrikes);
    }
  }, [activeJourney, maxWalkMeters, updateRoute]);

  /**
   * OS-level geofence backup for the alight moment: armed when a transit leg
   * starts (alight stop r=180 m + final destination r=120 m). Fires even if
   * the JS nav loop is dead. Disarmed on walk legs / trip end.
   */
  const armGeofenceForLeg = useCallback((legIdx: number) => {
    const journey = useJourneyStore.getState().activeJourney;
    const seg = (journey?.route?.segments as any[] | undefined)?.[legIdx];
    if (!journey || !seg || legKind(seg.mode) !== "transit") return;

    const regions: AlightRegion[] = [];
    if (seg.to?.lat && seg.to?.lng) {
      regions.push({
        lat: seg.to.lat, lng: seg.to.lng, radiusM: 180,
        title: "Get ready to get off",
        body: `${seg.to.name ?? "Your stop"} is right ahead`,
      });
    }
    if (journey.toLoc?.lat && journey.toLoc?.lng) {
      regions.push({
        lat: journey.toLoc.lat, lng: journey.toLoc.lng, radiusM: 120,
        title: "Destination reached",
        body: `You're at ${journey.toLoc.name ?? "your destination"}`,
      });
    }
    armAlightGeofence(regions).catch(() => {});
  }, []);

  const syncPhase = useCallback((p: NavPhase) => {
    if (phaseValueRef.current === p) return;
    phaseValueRef.current = p;
    setPhase(p);
  }, []);

  /** What a phase change does: move the engine on if needed, say it, show it (with Undo). */
  const applyPhaseEvent = useCallback((ev: PhaseEvent, leg: number) => {
    const engine = engineRef.current;
    const segs = (useJourneyStore.getState().activeJourney?.route?.segments as any[] | undefined) ?? [];
    const hints = usePrefsStore.getState().prefs.navHints;
    const say = (text: string, always = false) => { if (always || hints !== "off") VoiceGuide.announce(text); };
    const notice = (text: string, undoable = true) => setPhaseNotice({ event: ev, text, at: Date.now(), undoable });
    // The ride concerned: this leg if it's a ride; else the next (boarding) or the previous (getting off).
    const rideIdx = legKind(segs[leg]?.mode) === "transit" ? leg
      : ev === "alighted" || ev === "missed_stop" ? leg - 1 : leg + 1;
    const ride = segs[rideIdx];
    const rail = ["RAIL", "SUBWAY", "TRAM"].includes(String(ride?.mode ?? "").toUpperCase());
    const line = ride?.route_name ? `the ${ride.route_name}` : rail ? "the train" : "the matatu";
    lastPhaseEventRef.current = ev;
    NavMetrics.event(`phase_${ev}`, null, { leg });

    switch (ev) {
      case "waiting": {
        const at = ride?.from?.name ?? "the stop";
        notice(`Waiting for ${line} at ${at}`);
        say(`You're at ${at}. Wait for ${line}.`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      }
      case "boarded":
      case "boarded_early": {
        // Waited short of the stop's end: the engine is still on the walk. Move it onto the ride.
        if (engine && ev === "boarded" && rideIdx === leg + 1 && engine.steps[rideIdx]) {
          engine.forceProgressTo((engine.steps[leg].routeOffset ?? 0) + 2);
          stepIndexRef.current = rideIdx;
          prevStepIndexRef.current = rideIdx;
          phaseLegRef.current = rideIdx;
          lastAnnouncedRef.current = "";
          lastAlightAlertRef.current = -1;
        }
        if (ride) armGeofenceForLeg(rideIdx);
        notice(`On board ${line}`);
        say(`On board ${line}. I'll tell you when to get off.`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        LiveActivity.update({ instruction: `Riding ${line}`, force: true }).catch(() => {});
        break;
      }
      case "alighted": {
        // Still on the ride's leg: move on to what follows it.
        if (engine && legKind(segs[leg]?.mode) === "transit") {
          alightUndoRef.current = { hwm: engine.getHighWaterMark(), leg };
          engine.forceProgressTo((engine.steps[leg].routeOffset ?? engine.totalDistM) + 2);
        }
        const at = ride?.to?.name ?? "your stop";
        notice(`Off at ${at}`);
        say(`Off at ${at}.`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      }
      case "back_to_stop":
        notice(`Still waiting for ${line}`);
        break;
      case "missed_stop": {
        const at = ride?.to?.name ?? "your stop";
        notice(`You've passed ${at}: get off at the next stop`, false);
        say(`You've passed ${at}. Get off at the next stop, and I'll find the way from there.`, true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        break;
      }
      case "ride_started":
        notice("Ride started");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
    }
  }, [armGeofenceForLeg]);

const handleLocationUpdate = useCallback((loc: Location.LocationObject) => {
    if (!mountedRef.current) return;

    const accuracy = loc.coords.accuracy ?? 0;

    // Raw fix into the session trace (pre-filter, so replays show rejects too).
    TraceRecorder.fix({
      t: loc.timestamp ?? Date.now(),
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      acc: Math.round(accuracy * 10) / 10,
      speed: loc.coords.speed ?? 0,
      heading: loc.coords.heading ?? null,
    });

    // ── INDOOR HEURISTIC ── high sustained accuracy radius ≈ inside a building.
    // Fed BEFORE the gate so rejected fixes still inform it. Hysteresis avoids
    // flapping at doorways.
    if (accuracy > 0) {
      accuracyEmaRef.current = accuracyEmaRef.current == null
        ? accuracy
        : ema(accuracyEmaRef.current, accuracy, 0.3);
      const nowIndoor = indoorRef.current
        ? accuracyEmaRef.current > INDOOR_EXIT_ACC_M
        : accuracyEmaRef.current > INDOOR_ENTER_ACC_M;
      if (nowIndoor !== indoorRef.current) {
        indoorRef.current = nowIndoor;
        setIsIndoor(nowIndoor);
      }
    }

    // Adaptive gate: stricter while standing still — drifty fixes hurt most at rest.
    const wasStationary = (meSmoothRef.current?.speed ?? 0) === 0;
    const accuracyCap = meSmoothRef.current === null ? 150 : wasStationary ? 30 : 45;
    if (accuracy > accuracyCap) return;

    // THE DRIFT FILTER: Smartphones wobble 5-10 meters when indoors or standing still.
    // The GPS chip reports this wobble as "speed". Human walking is ~1.4 m/s. 
    // If it's under 0.6 m/s (~2 km/h), we clamp it to exactly 0 to kill the sliding map dot.
    let rawSpeed = loc.coords.speed ?? 0;
    if (rawSpeed < 0.6) rawSpeed = 0;

    const currentStepType = engineRef.current?.steps[stepIndexRef.current]?.type ?? "WALK";
    const EMA_LOC = currentStepType !== "WALK" ? EMA_LOC_TRANSIT : EMA_LOC_WALK;

    const next: Coords = {
      latitude:  loc.coords.latitude,
      longitude: loc.coords.longitude,
      heading:   loc.coords.heading ?? meSmoothRef.current?.heading ?? 0,
      speed:     rawSpeed, // <── Inject clamped speed here
    };

    const p = meSmoothRef.current;
    if (!p) {
      meSmoothRef.current = next;
      meSnapRef.current   = next;
      glideTargetRef.current  = next;
      glideDisplayRef.current = next;
      setLocation(next);
      return;
    }

    if (!engineRef.current) {
      meSmoothRef.current = next;
      meSnapRef.current   = next;
      glideTargetRef.current  = next;
      glideDisplayRef.current = next;
      setLocation(next);
      return;
    }

    const lat     = ema(p.latitude,  next.latitude,  EMA_LOC);
    const lng     = ema(p.longitude, next.longitude, EMA_LOC);
    const h0      = p.heading ?? 0;
    const h1      = next.heading ?? h0;
    const dh      = ((h1 - h0 + 540) % 360) - 180;
    const heading = (h0 + EMA_HEAD * dh + 360) % 360;
    const speed   = ema(p.speed ?? 0, next.speed ?? 0, EMA_SPD);

    const rawSmoothed = { latitude: lat, longitude: lng, heading, speed };
    meSmoothRef.current = rawSmoothed;
    meSnapRef.current   = rawSmoothed; 
    lastGpsTimeRef.current = Date.now();
    lastSpeedRef.current   = speed;

    // ── STATIONARY LOCK ──
    // At rest, GPS fixes orbit the true position; the EMA turns that into a
    // slow random walk. Anchor the position and ignore wander under
    // STATIONARY_LOCK_M until the user genuinely moves.
    // Use the clamped rawSpeed (0 when <0.6 m/s) rather than the EMA speed
    // which takes several ticks to decay to 0 after stopping.
    if (rawSpeed === 0) {
      const anchor = stationaryAnchorRef.current;
      if (!anchor || distM(anchor.latitude, anchor.longitude, lat, lng) > STATIONARY_LOCK_M) {
        stationaryAnchorRef.current = { latitude: lat, longitude: lng, heading, speed: 0 };
      }
    } else {
      stationaryAnchorRef.current = null;
    }
    const effLat = stationaryAnchorRef.current?.latitude  ?? lat;
    const effLng = stationaryAnchorRef.current?.longitude ?? lng;

    // ── ENGINE FIRST ──
    // Run the projection engine BEFORE choosing a display position, then snap
    // the puck to the engine's own projected point. Unlike the old global
    // polyline projection, the engine search is windowed around the confirmed
    // progress and monotonic — no corner-cutting, no jumping to a parallel
    // section of the route, and route consumption uses the same offset.
    const inTransitTrip = useJourneyStore.getState().tripStatus === "IN_TRANSIT";
    let engineResult: EngineResult | null = null;
    if (inTransitTrip && engineRef.current) {
      engineResult = engineRef.current.update(effLng, effLat, speed, stepIndexRef.current);
      routeBearingRef.current = engineResult.routeBearing;
      lastRemainingMRef.current = engineResult.remainingDistanceM;
      TraceRecorder.engineTick(engineResult);
    }

    let displayLat = effLat;
    let displayLng = effLng;
    snappedToRouteRef.current = false;

    // Snap only when outdoors and near the line. While indoors (e.g. still
    // inside a building at journey start) the exact position is shown; once
    // outside, the glide loop eases the puck smoothly onto the route.
    if (engineResult && engineRef.current && !indoorRef.current) {
      const stepType = engineRef.current.steps[engineResult.stepIndex]?.type ?? "WALK";
      const snapMax  = stepType === "WALK" ? SNAP_WALK_M : SNAP_TRANSIT_M;
      if (engineResult.distanceFromRouteM < snapMax) {
        displayLat = engineResult.projectedPoint.latitude;
        displayLng = engineResult.projectedPoint.longitude;
        snappedToRouteRef.current = true;
      }
    }
    if (engineResult) NavMetrics.tick(snappedToRouteRef.current);

    const finalLocation = { latitude: displayLat, longitude: displayLng, heading, speed };
    // While navigating, the JS glide loop owns setLocation — unless native
    // follow is on, where Mapbox's CustomLocationProvider interpolates the
    // puck natively and 1 Hz snapped fixes are all it needs.
    glideTargetRef.current = finalLocation;
    if (!inTransitTrip || usePrefsStore.getState().prefs.nativeFollow) {
      glideDisplayRef.current = finalLocation;
      setLocation(finalLocation);
    }

    // ── "I'M ON BOARD" AVAILABILITY ──
    // GPS-based boarding detection lags badly; surface a manual trigger as
    // soon as the user is near the next boarding stop.
    {
      const status  = useJourneyStore.getState().tripStatus;
      const journey = useJourneyStore.getState().activeJourney;
      const engine  = engineRef.current;
      let boardable = false;
      if (engine && journey && (status === "WAITING_FOR_BUS" || status === "IN_TRANSIT")) {
        const curIdx  = status === "IN_TRANSIT" ? stepIndexRef.current : 0;
        const curType = engine.steps[curIdx]?.type ?? "WALK";
        if (status === "WAITING_FOR_BUS" || curType === "WALK") {
          const nextTransitIdx = engine.steps.findIndex((s, i) => i >= curIdx && legKind(s.type) === "transit");
          const seg = nextTransitIdx >= 0 ? (journey.route.segments as any[])[nextTransitIdx] : null;
          if (seg?.from) {
            boardable = distM(finalLocation.latitude, finalLocation.longitude, seg.from.lat, seg.from.lng) <= BOARD_PROXIMITY_M;
          }
        }
      }
      if (phaseRef.current.phase === "wait") boardable = true;
      setCanBoardTransit((prev) => (prev === boardable ? prev : boardable));
    }

    if (inTransitTrip && engineResult && engineRef.current) {
      const result = engineResult;

      const stepType = engineRef.current.steps[result.stepIndex]?.type;
      // The leg decides: on foot, on a bike, in a car or on a boda, leaving the
      // line replans; on a matatu or a train the driver picks the road.
      const legProf: LegProfile = legProfile(stepType, rolePrefs());

      // ── PHASE: walking, waiting at the stage, on board, off again (services/legPhase) ──
      const tracker = phaseRef.current;
      {
        const engine = engineRef.current;
        const leg = result.stepIndex;
        if (leg !== phaseLegRef.current) {
          phaseLegRef.current = leg;
          tracker.enterLeg(legProf.kind, legProf.role, { at: { lat: finalLocation.latitude, lng: finalLocation.longitude } });
        }
        const segs = (useJourneyStore.getState().activeJourney?.route?.segments as any[] | undefined) ?? [];
        const seg = segs[leg];
        const legStart = leg > 0 ? (engine.steps[leg - 1].routeOffset ?? 0) : 0;
        const legEnd = engine.steps[leg]?.routeOffset ?? engine.totalDistM;
        const toEnd = seg?.to ? distM(finalLocation.latitude, finalLocation.longitude, seg.to.lat, seg.to.lng) : Infinity;
        const gpsHeading = loc.coords.heading;
        const ev = tracker.update({
          now: Date.now(),
          lat: finalLocation.latitude,
          lng: finalLocation.longitude,
          speed: rawSpeed,
          heading: gpsHeading != null && gpsHeading >= 0 ? gpsHeading : null,
          legKind: legProf.kind,
          prevIsTransit: leg > 0 && legKind(segs[leg - 1]?.mode) === "transit",
          nextIsTransit: legKind(segs[leg + 1]?.mode) === "transit",
          distFromLineM: result.distanceFromRouteM,
          routeBearing: result.routeBearing,
          alongM: Math.max(0, engine.totalDistM - result.remainingDistanceM - legStart),
          legLengthM: Math.max(0, legEnd - legStart),
          toLegStartM: seg?.from ? distM(finalLocation.latitude, finalLocation.longitude, seg.from.lat, seg.from.lng) : Infinity,
          toLegEndM: toEnd,
        });
        if (ev) applyPhaseEvent(ev, leg);
        syncPhase(tracker.phase);
        // "I got off" within reach of the alight stop.
        const alightable = tracker.phase === "ride" && legProf.kind === "transit" && toEnd <= 400;
        setCanAlight((prev) => (prev === alightable ? prev : alightable));
      }
      const profile: LegProfile = phaseProfile(legProf, tracker.phase, tracker.inVehicleMotion);
      if (result.status === "off_route" && !profile.reroute) {
        result.status = "active";
      }

      if (result.status === "off_route") {
        // Offline: no reroute possible — keep guiding along the original
        // route (the engine still projects/announces) instead of showing an
        // endless "Recalculating…".
        if (!useNetworkStore.getState().isOnline) {
          result.status = "active";
        } else if (!reroutingRef.current && Date.now() - lastRerouteAtRef.current >= REROUTE_MIN_INTERVAL_MS) {
          reroutingRef.current = true;
          lastRerouteAtRef.current = Date.now();
          const journey = useJourneyStore.getState().activeJourney;
          // Replan in the trip's own mode, keeping the user's choice (No tolls,
          // Safest, Step-free…): a driver must not come back with a matatu trip.
          const mode = journeyModeOf(journey?.route);
          const silent = profile.silentReroute;
          NavMetrics.event("reroute", null, { stepIndex: result.stepIndex, mode, silent });
          if (journey && meSmoothRef.current) {
            const fromLoc = {
              ...journey.fromLoc,
              id: "current_location", name: "Current Location",
              lat: meSmoothRef.current.latitude,
              lng: meSmoothRef.current.longitude,
            };
            const maxWalk = usePrefsStore.getState().prefs.maxWalkMeters;
            RouteService.calculateJourney(fromLoc, journey.toLoc, maxWalk, mode)
              .then((routes) => {
                const next = pickReroute(routes, journey.route);
                if (next && mountedRef.current) {
                  useJourneyStore.getState().updateRoute(next);
                  const hints = usePrefsStore.getState().prefs.navHints;
                  // A passenger didn't choose the way: follow the driver quietly.
                  if (hints !== "off" && !silent) VoiceGuide.announce("Route recalculated.");
                  stepIndexRef.current     = 0;
                  prevStepIndexRef.current = 0;
                  lastAnnouncedRef.current = "";
                }
              })
              .catch(() => {})
              .finally(() => { reroutingRef.current = false; });
          } else {
            reroutingRef.current = false;
          }
        }
        if (result.status === "off_route") result.status = "rerouting";
      }

      let stepJustChanged = false;
      if (result.stepIndex !== prevStepIndexRef.current) {
        prevStepIndexRef.current    = result.stepIndex;
        lastAnnouncedRef.current    = "";
        lastAnnouncedStopRef.current = null;
        prevApproachPhaseRef.current = null;
        wrongDirStrikesRef.current   = 0;
        wrongDirAnnouncedRef.current = false;
        stepJustChanged = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        // Geofence backup follows the leg type: armed for transit, off for walks.
        const newStepType = engineRef.current.steps[result.stepIndex]?.type ?? "WALK";
        if (legKind(newStepType) === "transit") armGeofenceForLeg(result.stepIndex);
        else disarmAlightGeofence().catch(() => {});
      }

      if (result.status === "arrived") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (navHints !== "off") VoiceGuide.announce("You have arrived at your destination.");
        if (appStateRef.current !== "active") {
          const toLoc = useJourneyStore.getState().activeJourney?.toLoc.name ?? "your destination";
          scheduleArrivalNotification(toLoc).catch(() => {});
        }
      }

      const phaseKey = VoiceGuide.phaseKey(result.stepIndex, result.approachPhase);
      if (phaseKey !== lastAnnouncedRef.current) {
        const upcomingStep = engineRef.current.steps[result.stepIndex];
        const text = VoiceGuide.buildAnnouncement(
          result.approachPhase,
          upcomingStep,
          result.distanceToNextStepM,
          navHints,
        );
        if (text) {
          lastAnnouncedRef.current = phaseKey;
          if (stepJustChanged) VoiceGuide.urgentAnnounce(text);
          else VoiceGuide.announce(text);
        }
      }

      if (result.approachPhase !== prevApproachPhaseRef.current) {
        prevApproachPhaseRef.current = result.approachPhase;
        if (result.approachPhase === "near") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } else if (result.approachPhase === "imminent") {
          const upcomingStep = engineRef.current.steps[result.stepIndex];
          const maneuverText = upcomingStep?.subSteps?.[0]?.instruction || upcomingStep?.instruction || "";
          const lText = maneuverText.toLowerCase();

          if (lText.includes("left")) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              .then(() => setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 150))
              .catch(() => {});
          } else if (lText.includes("right")) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        }
      }

      // ── TURN BY TURN (street legs) ──
      // The next manoeuvre from the progress along the road, cues timed to the
      // mode and speed. A driver hears them; a boda passenger feels a buzz to
      // tap the rider and reads the rider card; a car passenger sees them.
      if (profile.turns) {
        const engine = engineRef.current;
        const leg = result.stepIndex;
        const turns = legTurnsRef.current[leg] ?? [];
        const legStart = leg > 0 ? (engine.steps[leg - 1].routeOffset ?? 0) : 0;
        const legEnd = engine.steps[leg]?.routeOffset ?? engine.totalDistM;
        const along = Math.max(0, engine.totalDistM - result.remainingDistanceM - legStart);
        const ti = nextTurnIndex(turns, along, profile.kind);
        const cues = cueDistances(profile.kind, speed);
        const onWheels = profile.kind !== "walk";
        // concise: the turn itself, plus one heads-up on wheels; detailed: every cue.
        const allowCue = (c: TurnCue) =>
          navHints === "detailed" || (navHints === "concise" && (c === "now" || (c === "near" && onWheels)));

        if (ti >= 0) {
          const t = turns[ti];
          const dist = Math.max(0, t.offsetM - along);
          const following = turns[ti + 1] ?? null;
          const gap = following ? following.offsetM - t.offsetM : Infinity;
          const chained = following && gap <= chainDistance(profile.kind, cues) ? following : null;
          const cue = cueFor(dist, cues);
          const key = `${leg}:${ti}`;
          if (cue && CUE_RANK[cue] > (spokenCuesRef.current.get(key) ?? 0)) {
            spokenCuesRef.current.set(key, CUE_RANK[cue]);
            // "Turn left, then turn right": the second turn's heads-up is already given.
            if (cue === "now" && chained) {
              const k2 = `${leg}:${ti + 1}`;
              spokenCuesRef.current.set(k2, Math.max(spokenCuesRef.current.get(k2) ?? 0, CUE_RANK.near));
            }
            if (profile.voiceTurns && navHints !== "off" && allowCue(cue)) {
              VoiceGuide.announce(turnSpeech(cue, t, dist, cue === "now" ? chained : null));
            }
            if (profile.hapticTurns) turnHaptic(cue, t.maneuver, profile.showTheRider);
          }
          const next: NavTurn = {
            leg, index: ti, instruction: t.instruction, maneuver: t.maneuver, distanceM: dist,
            then: following && gap <= 300 ? following.instruction : null,
            rider: riderCue(t),
          };
          setTurn((prev) => (sameTurn(prev, next) ? prev : next));
        } else {
          // No turns left on this leg: heading for its end (the destination, or the stage).
          const journey = useJourneyStore.getState().activeJourney;
          const seg = (journey?.route?.segments as any[] | undefined)?.[leg];
          const isLastLeg = leg === engine.steps.length - 1;
          const endName = isLastLeg ? (journey?.toLoc?.name ?? "your destination") : (seg?.to?.name ?? "the stop");
          const dist = Math.max(0, legEnd - legStart - along);
          const key = `${leg}:end`;
          if (isLastLeg && profile.voiceTurns && navHints !== "off" && dist <= cues.near && dist > ARRIVAL_CUE_MIN_M
              && !spokenCuesRef.current.has(key)) {
            spokenCuesRef.current.set(key, CUE_RANK.near);
            VoiceGuide.announce(`${endName} is ${spokenDistance(dist)} ahead.`);
          }
          const next: NavTurn = {
            leg, index: -1,
            instruction: isLastLeg ? `Arrive at ${endName}` : (engine.steps[leg]?.instruction ?? `Continue to ${endName}`),
            maneuver: "straight", distanceM: dist, then: null,
            rider: { word: "Straight on", detail: `to ${endName}` },
          };
          setTurn((prev) => (sameTurn(prev, next) ? prev : next));
        }
      } else {
        setTurn((prev) => (prev ? null : prev));
      }

      stepIndexRef.current = result.stepIndex;
      setNavState(result);
      if (result.status === "arrived") useJourneyStore.getState().setTripStatus("ARRIVED");

      LiveActivity.update({
        instruction:        engineRef.current.steps[result.stepIndex]?.instruction,
        remainingDistanceM: result.remainingDistanceM,
        eta:                result.eta,
        force:              stepJustChanged || result.status === "arrived",
      }).catch(() => {});

      // Publish a snapshot for out-of-map consumers (Kwame copilot, widgets).
      {
        const journey = useJourneyStore.getState().activeJourney;
        const seg = (journey?.route?.segments as any[] | undefined)?.[result.stepIndex];
        useNavStateStore.getState().publish({
          tripStatus:         "IN_TRANSIT",
          destination:        journey?.toLoc?.name ?? null,
          nextInstruction:    engineRef.current.steps[result.stepIndex]?.instruction ?? null,
          currentSegmentMode: result.currentSegmentMode,
          currentLine:        seg && seg.mode !== "WALK" ? (seg.route_name ?? null) : null,
          stopsRemaining:     result.stopsRemaining,
          currentStopName:    result.currentStopName,
          remainingDistanceM: result.remainingDistanceM,
          etaIso:             result.eta.toISOString(),
        });
      }

      if (navHints === "detailed" && result.currentStopName &&
          result.currentStopName !== lastAnnouncedStopRef.current) {
        lastAnnouncedStopRef.current = result.currentStopName;
        VoiceGuide.announce(`Now passing ${result.currentStopName}.`);
      }

      // Landmarks passed on the ride, once each: "Passing Naivas, on your left."
      const rideSeg: any = (useJourneyStore.getState().activeJourney?.route?.segments as any[] | undefined)?.[result.stepIndex];
      if (navHints === "detailed" && rideSeg?.landmarks_along?.length && rideSeg.coordinates?.length > 1) {
        const prog = progressAlong(rideSeg.coordinates, result.projectedPoint);
        for (const lm of rideSeg.landmarks_along) {
          if (Math.abs(lm.progress_m - prog) <= PASSING_WINDOW_M && !announcedLandmarksRef.current.has(lm.id)) {
            announcedLandmarksRef.current.add(lm.id);
            VoiceGuide.announce(`Passing ${lm.name}, on your ${lm.side}.`);
            break;
          }
        }
      }
      const alightLm = asLandmark(rideSeg?.to?.landmark);

      const stopsRem = result.stopsRemaining;
      if (stopsRem != null) {
        const last = lastAlightAlertRef.current;
        if (stopsRem > 2 && last !== -1) {
          lastAlightAlertRef.current = -1;
        } else if (stopsRem === 2 && last !== 2) {
          lastAlightAlertRef.current = 2;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          const alightStop2 = engineRef.current?.steps[result.stepIndex]?.stops?.at(-1)?.name;
          if (navHints !== "off") VoiceGuide.announce(
            alightStop2
              ? `${withLandmark(`Prepare to alight at ${alightStop2} in 2 stops`, alightLm)}.`
              : "Prepare to alight in 2 stops.",
          );
          if (appStateRef.current !== "active" && !alightWarningFiredRef.current) {
            alightWarningFiredRef.current = true;
            const step = engineRef.current?.steps[result.stepIndex];
            scheduleAlightWarning(
              Math.ceil((result.remainingDurationS ?? 120) / 60),
              step?.stops?.at(-1)?.name ?? "your stop",
            ).then((id) => { alightNotifIdRef.current = id; })
              .catch(() => {});
          }
        } else if (stopsRem === 1 && last !== 1) {
          lastAlightAlertRef.current = 1;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          const alightStop1 = engineRef.current?.steps[result.stepIndex]?.stops?.at(-1)?.name;
          if (navHints !== "off") VoiceGuide.announce(
            alightStop1
              ? `${withLandmark(`Prepare to alight at ${alightStop1}`, alightLm)}.`
              : "Prepare to alight at the next stop.",
          );
        } else if (stopsRem === 0 && last !== 0) {
          lastAlightAlertRef.current = 0;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          const alightStop0 = engineRef.current?.steps[result.stepIndex]?.stops?.at(-1)?.name;
          if (navHints !== "off") VoiceGuide.announce(
            alightStop0 ? `Alight now at ${alightStop0}.` : "Alight now.",
          );
        }
      }

      const smoothedHeading = rawSmoothed.heading ?? -1;
      // Whoever is in control can turn round: on foot, on a bike, at the wheel.
      const canTurnRound = profile.wrongWay === "turn-around" || profile.wrongWay === "u-turn";
      // Below the profile's speed a heading is GPS wobble, not a direction.
      const moving     = (rawSmoothed.speed ?? 0) > profile.wrongWayMinSpeed;
      const strikesNeeded = profile.kind === "walk" ? WRONG_WAY_STRIKES_ON_FOOT : WRONG_WAY_STRIKES_VEHICLE;

      if (canTurnRound && moving && smoothedHeading >= 0) {
        const delta = Math.abs(((smoothedHeading - result.routeBearing + 180) % 360) - 180);
        if (delta > 120) {
          wrongDirStrikesRef.current++;
          if (wrongDirStrikesRef.current >= strikesNeeded && !wrongDirAnnouncedRef.current) {
            wrongDirAnnouncedRef.current = true;
            NavMetrics.event("wrong_direction", null, { mode: profile.kind });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            if (navHints !== "off") VoiceGuide.announce(
              profile.wrongWay === "u-turn"
                ? "You're going the wrong way. Make a U-turn when it's safe."
                : "You're heading the wrong way. Turn around.",
            );
            if (appStateRef.current !== "active" && !wrongDirNotifIdRef.current) {
              scheduleWrongDirectionAlert()
                .then((id) => { wrongDirNotifIdRef.current = id; })
                .catch(() => {});
            }
          }
        } else {
          wrongDirStrikesRef.current = Math.max(0, wrongDirStrikesRef.current - 1);
          if (delta < 60) {
            wrongDirAnnouncedRef.current = false;
            if (wrongDirNotifIdRef.current) {
              cancelNotification(wrongDirNotifIdRef.current).catch(() => {});
              wrongDirNotifIdRef.current = null;
            }
          }
        }
      } else {
        wrongDirStrikesRef.current = 0;
      }
      setWrongDirection(wrongDirStrikesRef.current >= strikesNeeded);

      // A passenger can't turn round, but should know when the car or the boda
      // is carrying them away from where they're going.
      if (profile.wrongWay === "heading-away") {
        const end = (useJourneyStore.getState().activeJourney?.route?.segments as any[] | undefined)?.[result.stepIndex]?.to;
        if (end?.lat != null && end?.lng != null) {
          const away = awayRef.current.update(
            Date.now(),
            distM(finalLocation.latitude, finalLocation.longitude, end.lat, end.lng),
            rawSmoothed.speed ?? 0,
          );
          if (away && !headingAwayRef.current) {
            NavMetrics.event("heading_away", null, { mode: profile.kind });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          }
          if (away !== headingAwayRef.current) {
            headingAwayRef.current = away;
            setHeadingAway(away);
          }
        }
      } else if (headingAwayRef.current) {
        headingAwayRef.current = false;
        setHeadingAway(false);
      }

      const nowMs = Date.now();
      const stepChanged = result.stepIndex !== prevSavedStepRef.current;
      if (stepChanged || nowMs - lastSaveTimeRef.current > 10_000) {
        lastSaveTimeRef.current  = nowMs;
        prevSavedStepRef.current = result.stepIndex;
        const journey = useJourneyStore.getState().activeJourney;
        if (journey && engineRef.current) {
          navSession.save({
            version: 1, savedAt: nowMs, tripStatus: "IN_TRANSIT",
            stepIndex: result.stepIndex,
            highWaterMark: engineRef.current.getHighWaterMark(),
            engineStrikes: engineRef.current.getStrikes(),
            lastLat:   meSmoothRef.current?.latitude  ?? null,
            lastLng:   meSmoothRef.current?.longitude ?? null,
            lastSpeed: meSmoothRef.current?.speed     ?? 0,
            activeJourney: journey,
          }).catch(() => {});
        }
      }
    }

    if (useJourneyStore.getState().tripStatus === "WAITING_FOR_BUS") {
      const journey = useJourneyStore.getState().activeJourney;
      if (journey && engineRef.current) {
        const firstTransit = journey.route.segments.find((s: any) => legKind(s.mode) === "transit");
        if (firstTransit) {
          const d   = distM(finalLocation.latitude, finalLocation.longitude, firstTransit.from.lat, firstTransit.from.lng);
          const spd   = rawSmoothed.speed ?? 0;

          if (spd > 2.2 && d > 40) {
            NavMetrics.event("board_auto");
            const transitIdx = (journey.route.segments as any[]).findIndex((s: any) => legKind(s.mode) === "transit");
            if (transitIdx >= 0) armGeofenceForLeg(transitIdx);
            useJourneyStore.getState().setTripStatus("IN_TRANSIT");
            engineRef.current.resetProgress();
            stepIndexRef.current     = 0;
            prevStepIndexRef.current = 0;
            lastAnnouncedRef.current = "";
            lastAlightAlertRef.current = -1;

            const hints = usePrefsStore.getState().prefs.navHints;
            if (hints !== "off") {
              const routeName = firstTransit.route_name ?? "bus";
              VoiceGuide.announce(`Journey started. Riding Line ${routeName}.`);
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        }
      }
    }
  }, [navHints, applyPhaseEvent, syncPhase]);

  useEffect(() => {
    const gpsOptions = isNavigating
      ? { accuracy: Location.Accuracy.High,     timeInterval: 1_000,  distanceInterval: 3 }
      : { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 5 };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermDenied(true);
        return;
      }
      setPermDenied(false);

      requestBackgroundPermission().then((granted) => {
        if (mountedRef.current) setBgPermGranted(granted);
      });

      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
      if (lastKnown && mountedRef.current) handleLocationUpdate(lastKnown);

      watchRef.current = await Location.watchPositionAsync(gpsOptions, handleLocationUpdate);

      if (isNavigating && !usePrefsStore.getState().prefs.nativeFollow) {
        // ── PUCK GLIDE LOOP (JS fallback when native follow is off) ──
        // 10 Hz: dead-reckon the target forward, then ease the display toward it.
        interpRef.current = setInterval(() => {
          if (!mountedRef.current) return;
          const target = glideTargetRef.current;
          if (!target) return;

          const dt = GLIDE_TICK_MS / 1000;
          const sinceGps = (Date.now() - lastGpsTimeRef.current) / 1000;
          const spd = target.speed ?? 0;

          // 1. Advance the target with the last known velocity so the puck keeps
          //    moving between 1 Hz fixes. Frozen when stationary (drift filter
          //    already clamps GPS wobble to speed 0) or when fixes go stale.
          if (spd >= 0.5 && sinceGps <= GLIDE_COAST_MAX_S) {
            // When snapped to the route, coast ALONG the route (route bearing),
            // not along the noisy GPS heading — the puck stays glued to the line.
            const drHeading = snappedToRouteRef.current
              ? (routeBearingRef.current ?? target.heading ?? 0)
              : (target.heading ?? 0);
            const hRad   = (drHeading * Math.PI) / 180;
            const cosLat = Math.cos(target.latitude * Math.PI / 180);
            glideTargetRef.current = {
              ...target,
              latitude:  target.latitude  + ((spd * dt) / 111_320) * Math.cos(hRad),
              longitude: target.longitude + ((spd * dt) / 111_320) * Math.sin(hRad) / cosLat,
            };
          }

          const tgt  = glideTargetRef.current!;
          const disp = glideDisplayRef.current ?? tgt;

          const gapM = distM(disp.latitude, disp.longitude, tgt.latitude, tgt.longitude);
          if (gapM > GLIDE_SNAP_M) {
            // Reroute / tunnel exit: don't animate across the map.
            glideDisplayRef.current = tgt;
            setLocation(tgt);
            return;
          }

          // 2. Exponential approach — frame-rate independent easing.
          const k  = 1 - Math.exp(-dt / GLIDE_TAU_S);
          const dh = (((tgt.heading ?? 0) - (disp.heading ?? 0) + 540) % 360) - 180;
          const nextDisp: Coords = {
            latitude:  disp.latitude  + k * (tgt.latitude  - disp.latitude),
            longitude: disp.longitude + k * (tgt.longitude - disp.longitude),
            heading:   (((disp.heading ?? 0) + k * dh) + 360) % 360,
            speed:     (disp.speed ?? 0) + k * ((tgt.speed ?? 0) - (disp.speed ?? 0)),
          };
          glideDisplayRef.current = nextDisp;

          // Skip the re-render once converged (sub-5 cm) and settled.
          if (gapM < 0.05 && Math.abs(dh) < 0.3) return;
          setLocation(nextDisp);
        }, GLIDE_TICK_MS);
      }
    })();

    return () => {
      watchRef.current?.remove();
      if (interpRef.current !== null) {
        clearInterval(interpRef.current);
        interpRef.current = null;
      }
      VoiceGuide.stop();
      setWrongDirection(false);
      wrongDirStrikesRef.current   = 0;
      wrongDirAnnouncedRef.current = false;
    };
  }, [isNavigating, handleLocationUpdate]);

  useEffect(() => {
    if (!isNavigating) { setGpsLost(false); return; }

    const id = setInterval(() => {
      const now      = Date.now();
      const sinceGps = (now - lastGpsTimeRef.current) / 1000;
      const lost     = sinceGps > 8;
      setGpsLost((prev) => {
        if (lost && !prev) NavMetrics.event("gps_lost", Math.round(sinceGps));
        return lost;
      });

      if (lost && useJourneyStore.getState().tripStatus === "IN_TRANSIT" && engineRef.current) {
        const dt = (now - lastDeadReckonTimeRef.current) / 1000;
        engineRef.current.deadReckon(lastSpeedRef.current, dt);
      }
      lastDeadReckonTimeRef.current = now;
    }, 2000);

    return () => { clearInterval(id); setGpsLost(false); };
  }, [isNavigating]);

  useEffect(() => {
    if (isNavigating && backgroundPermissionGranted) startBackgroundTracking();
    else stopBackgroundTracking();
    return () => { stopBackgroundTracking(); };
  }, [isNavigating, backgroundPermissionGranted]);

  // ── Live activity (Uber-style persistent progress notification) ──────────
  useEffect(() => {
    if (tripStatus === "IN_TRANSIT") {
      const dest = useJourneyStore.getState().activeJourney?.toLoc?.name ?? "your destination";
      LiveActivity.start(dest).catch(() => {});
    } else if (tripStatus === "PAUSED") {
      LiveActivity.update({ instruction: "Trip paused", force: true }).catch(() => {});
    } else {
      LiveActivity.stop().catch(() => {});
    }
  }, [tripStatus]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("bgLocation", (loc: Location.LocationObject) => {
      handleLocationUpdate(loc);
    });
    return () => sub.remove();
  }, [handleLocationUpdate]);

  const startNavigation = useCallback(() => {
    if (activeJourney) {
      setTripStatus("IN_TRANSIT");

      wrongDirStrikesRef.current   = 0;
      wrongDirAnnouncedRef.current = false;
      lastSaveTimeRef.current      = 0;
      prevSavedStepRef.current     = -1;
      alightWarningFiredRef.current = false;
      alightNotifIdRef.current      = null;
      wrongDirNotifIdRef.current    = null;
      spokenCuesRef.current         = new Map();
      lastRerouteAtRef.current      = 0;
      phaseRef.current.reset();
      alightUndoRef.current         = null;
      lastPhaseEventRef.current     = null;
      setPhaseNotice(null);
      setCanAlight(false);
      {
        const first = legProfile(engineRef.current?.steps[0]?.type, rolePrefs());
        phaseRef.current.enterLeg(first.kind, first.role);
        phaseLegRef.current = 0;
        syncPhase(phaseRef.current.phase);
      }
      awayRef.current.reset();
      headingAwayRef.current        = false;
      setHeadingAway(false);

      glideTargetRef.current  = meSmoothRef.current;
      glideDisplayRef.current = meSmoothRef.current;

      TraceRecorder.begin(
        allCoordsRef.current as [number, number][],
        engineRef.current?.steps ?? [],
        activeJourney.toLoc?.name ?? null,
      );
      NavMetrics.beginSession();
      lastRemainingMRef.current = null;

      if (engineRef.current) {
        engineRef.current.resetProgress();
        stepIndexRef.current     = 0;
        prevStepIndexRef.current = 0;
        lastAnnouncedRef.current = "";

        const hints = usePrefsStore.getState().prefs.navHints;

        if (meSmoothRef.current) {
          const instantResult = engineRef.current.update(
            meSmoothRef.current.longitude,
            meSmoothRef.current.latitude,
            meSmoothRef.current.speed ?? 0,
            0,
          );
          stepIndexRef.current = instantResult.stepIndex;
          setNavState(instantResult);

          if (hints !== "off") {
            const firstStep = engineRef.current.steps[instantResult.stepIndex];
            const instruction = firstStep?.instruction ?? "";
            VoiceGuide.announce(
              instruction
                ? `Navigation started. ${instruction}.`
                : `Navigation started to ${activeJourney.toLoc.name}.`
            );
            lastAnnouncedRef.current = VoiceGuide.phaseKey(
              instantResult.stepIndex,
              instantResult.approachPhase,
            );
          }
        } else if (hints !== "off") {
          VoiceGuide.announce(`Navigation started to ${activeJourney.toLoc.name}.`);
        }
      }
    }
  }, [activeJourney, setTripStatus, syncPhase]);

  /**
   * Pause mid-trip (duka stop, phone call). Freezes engine progress and
   * silences guidance WITHOUT tearing down the journey — everything already
   * gates on tripStatus === "IN_TRANSIT", so PAUSED is inert by construction:
   * no engine updates, no announcements, no rerouting, no breadcrumbs.
   */
  const pauseNavigation = useCallback(() => {
    if (useJourneyStore.getState().tripStatus !== "IN_TRANSIT") return;
    useJourneyStore.getState().setTripStatus("PAUSED");
    useNavStateStore.getState().publish({ tripStatus: "PAUSED" });
    VoiceGuide.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const resumeNavigation = useCallback(() => {
    if (useJourneyStore.getState().tripStatus !== "PAUSED") return;
    useJourneyStore.getState().setTripStatus("IN_TRANSIT");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (usePrefsStore.getState().prefs.navHints !== "off") {
      const instruction = engineRef.current?.steps[stepIndexRef.current]?.instruction;
      VoiceGuide.announce(instruction ? `Resuming. ${instruction}.` : "Resuming navigation.");
    }
  }, []);

  const stopNavigation = useCallback(() => {
    navSession.clear();
    setWrongDirection(false);
    setTripStatus("IDLE");
    setNavState(null);
    setCanBoardTransit(false);
    setTurn(null);
    setHeadingAway(false);
    headingAwayRef.current = false;
    phaseRef.current.reset();
    phaseLegRef.current = -1;
    syncPhase("walk");
    setPhaseNotice(null);
    setCanAlight(false);
    stationaryAnchorRef.current = null;
    useNavStateStore.getState().clear();
    TraceRecorder.end().catch(() => {});
    NavMetrics.endSession(lastRemainingMRef.current).catch(() => {});
    disarmAlightGeofence().catch(() => {});
    VoiceGuide.stop();
  }, [setTripStatus, syncPhase]);

  /**
   * Manual boarding trigger ("I'm on board"). GPS-based transit detection is
   * slow and unreliable at the stop, so the user can force the engine onto
   * the next transit leg: progress jumps to the boarding stop and the trip
   * enters vehicle mode immediately.
   */
  const boardTransit = useCallback(() => {
    const engine  = engineRef.current;
    const journey = useJourneyStore.getState().activeJourney;
    if (!engine || !journey) return;

    const status = useJourneyStore.getState().tripStatus;
    const curIdx = status === "IN_TRANSIT" ? stepIndexRef.current : 0;
    const idx    = engine.steps.findIndex((s, i) => i >= curIdx && legKind(s.type) === "transit");
    if (idx < 0) return;

    // The transit leg starts where the previous step ends.
    const boardOffset = idx > 0 ? (engine.steps[idx - 1].routeOffset ?? 0) : 0;
    engine.forceProgressTo(boardOffset + 2);

    stepIndexRef.current         = idx;
    prevStepIndexRef.current     = idx;
    lastAnnouncedRef.current     = "";
    lastAnnouncedStopRef.current = null;
    prevApproachPhaseRef.current = null;
    lastAlightAlertRef.current   = -1;
    setCanBoardTransit(false);
    useJourneyStore.getState().setTripStatus("IN_TRANSIT");
    phaseRef.current.set("ride");
    phaseLegRef.current = idx;
    syncPhase("ride");
    setPhaseNotice(null);

    NavMetrics.event("board_manual");
    armGeofenceForLeg(idx);
    const routeName = (journey.route.segments as any[])[idx]?.route_name ?? "bus";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (usePrefsStore.getState().prefs.navHints !== "off") {
      VoiceGuide.announce(`On board Line ${routeName}. I'll tell you when to alight.`);
    }
    LiveActivity.update({ instruction: `Riding Line ${routeName}`, force: true }).catch(() => {});

    // Refresh nav state right away so the UI flips without waiting for a fix.
    if (meSmoothRef.current) {
      const r = engine.update(
        meSmoothRef.current.longitude,
        meSmoothRef.current.latitude,
        meSmoothRef.current.speed ?? 0,
        idx,
      );
      stepIndexRef.current = r.stepIndex;
      setNavState(r);
    }
  }, [syncPhase]);

  /** "I got off": leave the ride's leg now (GPS stops lag behind the doors). */
  const alightTransit = useCallback(() => {
    const engine = engineRef.current;
    const leg = stepIndexRef.current;
    const seg = (useJourneyStore.getState().activeJourney?.route?.segments as any[] | undefined)?.[leg];
    if (!engine || legKind(seg?.mode) !== "transit") return;
    engine.forceProgressTo((engine.steps[leg].routeOffset ?? engine.totalDistM) + 2);
    phaseRef.current.set("walk");
    syncPhase("walk");
    setCanAlight(false);
    setPhaseNotice(null);
    NavMetrics.event("alight_manual");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (usePrefsStore.getState().prefs.navHints !== "off") VoiceGuide.announce(`Off at ${seg.to?.name ?? "your stop"}.`);
    if (meSmoothRef.current) {
      const r = engine.update(meSmoothRef.current.longitude, meSmoothRef.current.latitude, meSmoothRef.current.speed ?? 0, leg);
      stepIndexRef.current = r.stepIndex;
      setNavState(r);
    }
  }, [syncPhase]);

  /** "We're off": a boda or taxi passenger's ride has started. */
  const startRide = useCallback(() => {
    phaseRef.current.set("go");
    syncPhase("go");
    setPhaseNotice(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [syncPhase]);

  /** Undo the last automatic phase change ("Not yet" on "On board the 45K"). */
  const undoPhase = useCallback(() => {
    const back = phaseRef.current.undo(Date.now());
    if (!back) return;
    const undo = alightUndoRef.current;
    if (lastPhaseEventRef.current === "alighted" && undo && engineRef.current) {
      engineRef.current.forceProgressTo(undo.hwm);
      stepIndexRef.current = undo.leg;
      prevStepIndexRef.current = undo.leg;
      phaseLegRef.current = undo.leg;
    }
    alightUndoRef.current = null;
    lastPhaseEventRef.current = null;
    syncPhase(back);
    setPhaseNotice(null);
    Haptics.selectionAsync().catch(() => {});
  }, [syncPhase]);

  const openLocationSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return {
    location,
    navState,
    locationPermissionDenied,
    openLocationSettings,
    gpsLost,
    wrongDirection,
    startNavigation,
    stopNavigation,
    pauseNavigation,
    resumeNavigation,
    isIndoor,
    canBoardTransit,
    boardTransit,
    turn,
    headingAway,
    phase,
    phaseNotice,
    undoPhase,
    canAlight,
    alightTransit,
    startRide,
  };
}