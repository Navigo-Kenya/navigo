// services/navProfile.ts
//
// What navigation does on each leg, and for whom.
//
// The leg's *planned* mode gives its kind (never the speed: a fast cyclist is
// still a cyclist). The role says whether the user controls the vehicle:
//
//   in control ("driver")  walking, cycling, driving, riding their own motorbike
//   passenger              matatu, bus, train, ferry, a boda or a taxi someone else drives
//
// A driver needs turn-by-turn by voice, timed to their speed, and nothing to
// read at length. A passenger needs to know where they are and when to act:
// get off, tell the rider "left after Total", notice that the car is heading
// away from where they're going. Guidance, rerouting, alerts and the camera
// all read from the profile built here.
import type { JourneyMode, Route } from "./route";

export type LegKind = "walk" | "bicycle" | "car" | "motorbike" | "transit";
export type Role = "driver" | "passenger";

export interface RolePrefs {
  /** Car trips: does the user drive (default) or ride (taxi, a friend's car)? */
  carRole: Role;
  /** Boda trips: the user is usually the passenger; "driver" = their own motorbike. */
  bodaRole: Role;
}

export function legKind(mode?: string | null): LegKind {
  switch (String(mode ?? "WALK").toUpperCase()) {
    case "WALK": return "walk";
    case "BICYCLE": return "bicycle";
    case "CAR": return "car";
    case "MOTORBIKE": return "motorbike";
    default: return "transit";
  }
}

/** Street legs follow roads the user (or their driver) chooses; transit follows a line. */
export const isStreetKind = (kind: LegKind) => kind !== "transit";

/** Who controls the vehicle on a leg of this kind. */
export function roleFor(kind: LegKind, prefs: RolePrefs): Role {
  switch (kind) {
    case "walk":
    case "bicycle": return "driver";
    case "car": return prefs.carRole;
    case "motorbike": return prefs.bodaRole;
    default: return "passenger";
  }
}

/** Only car and boda legs can be either: the user picks, and it's remembered. */
export const roleSwitchable = (kind: LegKind) => kind === "car" || kind === "motorbike";

/**
 * How to warn about going the wrong way:
 * - "turn-around": walking or cycling ("Turn around")
 * - "u-turn": driving ("Make a U-turn when it's safe")
 * - "heading-away": a passenger can't turn, but should know when the vehicle
 *   is taking them away from where they're going
 */
export type WrongWayCue = "turn-around" | "u-turn" | "heading-away";

export interface LegProfile {
  kind: LegKind;
  role: Role;
  /** Track the leg's manoeuvres (street legs). */
  turns: boolean;
  /** Speak the turns ("In 300 metres, turn left onto Ngong Road"). */
  voiceTurns: boolean;
  /** Vibrate before each turn: on foot, on a bike, and for a boda passenger who taps the rider. */
  hapticTurns: boolean;
  /** Boda passenger: a card to show (or read to) the rider instead of a driver's banner. */
  showTheRider: boolean;
  /** Leaving the line replans the rest of the trip, in the same mode. */
  reroute: boolean;
  /** Replan without "Recalculating": a passenger didn't choose the way. */
  silentReroute: boolean;
  wrongWay: WrongWayCue | null;
  /** Below this speed (m/s) a heading says nothing about direction (GPS wobble). */
  wrongWayMinSpeed: number;
}

export function legProfile(mode: string | null | undefined, prefs: RolePrefs): LegProfile {
  const kind = legKind(mode);
  const role = roleFor(kind, prefs);
  const base: LegProfile = {
    kind, role,
    turns: false, voiceTurns: false, hapticTurns: false, showTheRider: false,
    reroute: false, silentReroute: false, wrongWay: null, wrongWayMinSpeed: 1.2,
  };
  switch (kind) {
    case "walk":
      return { ...base, turns: true, voiceTurns: true, hapticTurns: true, reroute: true, wrongWay: "turn-around", wrongWayMinSpeed: 1.2 };
    case "bicycle":
      return { ...base, turns: true, voiceTurns: true, hapticTurns: true, reroute: true, wrongWay: "turn-around", wrongWayMinSpeed: 2.0 };
    case "car":
    case "motorbike":
      return role === "driver"
        ? {
            ...base, turns: true, voiceTurns: true,
            // A rider feels the phone in a pocket; a driver's phone sits in a mount.
            hapticTurns: kind === "motorbike",
            reroute: true, wrongWay: "u-turn", wrongWayMinSpeed: 3.0,
          }
        : {
            ...base, turns: true,
            hapticTurns: kind === "motorbike",
            showTheRider: kind === "motorbike",
            reroute: true, silentReroute: true, wrongWay: "heading-away", wrongWayMinSpeed: 3.0,
          };
    default:
      // Matatu, bus, train, ferry: stops and alight cues (useNavigation), no turns.
      return base;
  }
}

/** The planner mode to replan a trip in: the mode the user chose it in. */
export function journeyModeOf(route: Pick<Route, "category" | "segments"> | null | undefined): JourneyMode {
  switch (route?.category) {
    case "car": return "car";
    case "motorbike": return "motorbike";
    case "bicycle": return "bicycle";
    case "walk":
      // A transit search can answer "just walk": replanning on foot is right either way.
      return "walk";
    case "bus": return "bus";
    case "rail": return "rail";
    case "mixed": return "transit";
    default: {
      const modes = (route?.segments ?? []).map((s) => String(s.mode).toUpperCase());
      if (modes.length === 1 && ["CAR", "MOTORBIKE", "BICYCLE", "WALK"].includes(modes[0])) {
        return modes[0].toLowerCase() as JourneyMode;
      }
      return "transit";
    }
  }
}

/**
 * Options that are a preference, kept on a reroute: a driver who chose "No
 * tolls" shouldn't be sent back onto the Expressway. "fastest" and
 * "alternative_N" aren't preferences: the fastest way from here is right.
 */
const PREFERENCES = ["no_tolls", "safer", "safest", "flattest", "step_free"];

export function preferenceOf(route: Pick<Route, "route_options"> | null | undefined): string | null {
  return route?.route_options?.find((o) => PREFERENCES.includes(o)) ?? null;
}

/** Of the replanned routes, the one that keeps the user's preference (else the best). */
export function pickReroute<R extends Pick<Route, "route_options">>(routes: R[], original: Pick<Route, "route_options"> | null | undefined): R | null {
  if (!routes.length) return null;
  const pref = preferenceOf(original);
  if (pref) {
    const same = routes.find((r) => r.route_options?.includes(pref));
    if (same) return same;
  }
  return routes[0];
}
