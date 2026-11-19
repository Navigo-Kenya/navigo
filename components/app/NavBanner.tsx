// components/app/NavBanner.tsx
//
// The guidance banner, Google Maps' way:
//   - the manoeuvre arrow and the distance to it, large, on the left;
//   - the street you turn into as the main words, the verb small above it,
//     the landmark under it ("after Java House");
//   - a "Then" tab under it when the next turn follows close behind;
//   - Navigo orange while you're in control (walking, cycling, driving), a
//     calm dark banner when you're carried (matatu, passenger, waiting).
// Under it, only what matters now: the trip's state (rerouting, weak GPS),
// a road report ahead or "Still there?" once passed (Waze), a short note.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Icon, type IconName } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { maneuverIcon } from "@/utils/mapHelpers";
import { splitInstruction } from "@/services/maneuvers";
import { hazardLabel } from "@/services/hazardsAhead";
import type { NavHazard, NavToast, NavTurn } from "@/hooks/useNavigation";
import type { LegKind, Role } from "@/services/navProfile";
import type { NavPhase } from "@/services/legPhase";
import type { RideCue } from "@/utils/landmarks";

const ORANGE = "#FF6F00";
/** In control: Navigo orange, deep enough for white text (5.2:1). */
const CONTROL = { bg: "#C2410C", dark: "#9A3412", soft: "rgba(255,255,255,0.82)" };
/** Carried: calm. */
const CALM = { bg: "#1F2937", dark: "#111827", soft: "rgba(229,231,235,0.85)" };

/** "350 m", "1.2 km", "Now"; or feet and miles. */
export function bannerDistance(m: number, units: "km" | "mi" = "km"): string {
  if (m < 15) return "Now";
  if (units === "mi") {
    const ft = m * 3.281;
    if (ft < 528) return `${Math.max(50, Math.round(ft / 50) * 50)} ft`;
    return `${(m / 1609.34).toFixed(1)} mi`;
  }
  if (m < 100) return `${Math.round(m / 10) * 10} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  const km = m / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
}

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

function modeIcon(kind: LegKind | null | undefined, mode?: string | null): IconName {
  switch (kind) {
    case "walk": return "walk";
    case "bicycle": return "bicycle";
    case "car": return "car";
    case "motorbike": return "motorbike" as IconName;
    default: {
      const m = String(mode ?? "").toUpperCase();
      if (["RAIL", "SUBWAY", "TRAM", "MONORAIL"].includes(m)) return "train";
      if (m === "FERRY") return "boat";
      return "bus";
    }
  }
}

export function NavBanner({
  turn,
  legKind,
  legRole,
  phase,
  stepMode,
  waitInfo,
  pickupInfo,
  nextPreview,
  nextNextPreview,
  distanceToNextStepM,
  stopsRemaining,
  walkDestination,
  destinationName,
  rideCue,
  wrongDirection,
  headingAway,
  gpsLost,
  rerouting,
  isIndoor,
  paused,
  onResume,
  roleStrip,
  hazard,
  onHazardVote,
  toast,
  units = "km",
}: {
  turn: NavTurn | null;
  legKind: LegKind | null | undefined;
  legRole: Role | null | undefined;
  phase: NavPhase | null | undefined;
  /** The step's mode (BUS, RAIL…), for the banner's icon on a ride. */
  stepMode?: string | null;
  waitInfo?: { line: string | null; stop: string | null; next: string | null; mode: string } | null;
  pickupInfo?: { destination: string | null; fare: string | null } | null;
  nextPreview?: string | null;
  nextNextPreview?: string | null;
  distanceToNextStepM?: number | null;
  stopsRemaining?: number | null;
  walkDestination?: string | null;
  destinationName?: string | null;
  rideCue?: RideCue | null;
  wrongDirection: boolean;
  headingAway: boolean;
  gpsLost: boolean;
  rerouting: boolean;
  isIndoor: boolean;
  paused: boolean;
  onResume?: () => void;
  /** The "You're driving · I'm a passenger" strip, when the leg has a role. */
  roleStrip?: React.ReactNode;
  hazard?: NavHazard | null;
  onHazardVote?: (id: string, stillThere: boolean) => void;
  toast?: NavToast | null;
  units?: "km" | "mi";
}) {
  const inControl = !!turn && legRole === "driver" && phase !== "wait" && phase !== "pickup";
  const tone = inControl ? CONTROL : CALM;

  // ── What the banner says ──
  let icon: React.ReactNode;
  let distance: string | null = null;
  let verb: string | null = null;
  let primary: string;
  let secondary: string | null = null;
  let thenText: string | null = null;
  let thenManeuver: string | null = null;

  if (phase === "wait" && waitInfo) {
    icon = <Icon name={modeIcon("transit", waitInfo.mode)} size={36} color="#FFFFFF" />;
    verb = waitInfo.stop ? `At ${waitInfo.stop}` : "At the stop";
    primary = `Wait for ${waitInfo.line ? `the ${waitInfo.line}` : "your ride"}`;
    secondary = waitInfo.next ? `Next one ${waitInfo.next}` : null;
  } else if (phase === "pickup") {
    icon = <Icon name={modeIcon(legKind)} size={36} color="#FFFFFF" />;
    primary = "Waiting for your ride";
    secondary = [destinationName ? `To ${destinationName}` : null, pickupInfo?.fare ?? null].filter(Boolean).join(" · ") || null;
  } else if (turn && inControl) {
    const split = splitInstruction(turn.instruction, turn.landmark);
    icon = <MaterialIcons name={maneuverIcon(turn.maneuver) as any} size={50} color="#FFFFFF" />;
    distance = bannerDistance(turn.distanceM, units);
    verb = split.street ? split.verb : null;
    primary = split.street ?? split.verb;
    secondary = split.landmark;
    if (turn.then) {
      thenText = splitInstruction(turn.then).street;
      thenManeuver = turn.thenManeuver ? maneuverIcon(turn.thenManeuver) : null;
    }
  } else if (turn) {
    // A passenger: where you're being taken, and the next turn, quietly.
    icon = <Icon name={modeIcon(legKind)} size={34} color="#FFFFFF" />;
    primary = destinationName ? `To ${destinationName}` : "On your way";
    secondary = `Next: ${turn.instruction.charAt(0).toLowerCase()}${turn.instruction.slice(1)} · ${bannerDistance(turn.distanceM, units)}`;
  } else {
    icon = <Icon name={modeIcon(legKind, stepMode)} size={36} color="#FFFFFF" />;
    distance = distanceToNextStepM != null && stopsRemaining == null ? bannerDistance(distanceToNextStepM, units) : null;
    primary = nextPreview ?? "Follow the highlighted route";
    const bits = [
      stopsRemaining != null && stopsRemaining > 0 ? `${stopsRemaining} stop${stopsRemaining === 1 ? "" : "s"} left` : null,
      walkDestination ? `To ${walkDestination}` : null,
    ].filter(Boolean);
    secondary = bits.length ? bits.join(" · ") : null;
    if (nextNextPreview && stopsRemaining == null) thenText = nextNextPreview;
  }

  // ── The trip's state, one line at a time ──
  const status: { text: string; icon: IconName } | null = paused
    ? { text: "Navigation paused", icon: "pause" as IconName }
    : rerouting
    ? { text: legRole === "passenger" ? "Following your driver's way" : "Finding a new route…", icon: "refresh" }
    : wrongDirection
    ? { text: "Wrong way: turn around", icon: "swap-vertical" }
    : headingAway
    ? { text: `Heading away from ${destinationName ?? "your destination"}`, icon: "warning" }
    : gpsLost
    ? { text: "GPS lost: estimating your position", icon: "locate" }
    : isIndoor
    ? { text: "Weak signal indoors", icon: "locate" }
    : null;

  // A note shows for 3 s.
  const [toastShown, setToastShown] = useState(false);
  useEffect(() => {
    if (!toast) { setToastShown(false); return; }
    setToastShown(true);
    const id = setTimeout(() => setToastShown(false), 3_000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View
        style={[s.banner, { backgroundColor: tone.bg }, thenText ? s.bannerWithTab : null]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={[distance && distance !== "Now" ? `In ${distance}` : null, verb, primary, secondary].filter(Boolean).join(", ")}
      >
        <View style={s.row}>
          <View style={s.lead}>
            {icon}
            {distance ? <Text style={s.distance} numberOfLines={1}>{distance}</Text> : null}
          </View>
          <View style={s.body}>
            {verb ? <Text style={[s.verb, { color: tone.soft }]} numberOfLines={1}>{verb}</Text> : null}
            <Text style={[s.primary, !inControl && s.primaryCalm]} numberOfLines={2}>{primary}</Text>
            {secondary ? <Text style={[s.secondary, { color: tone.soft }]} numberOfLines={1}>{secondary}</Text> : null}
          </View>
        </View>

        {rideCue && (rideCue.alight || rideCue.passing || rideCue.next) ? (
          <View style={[s.ride, { backgroundColor: rideCue.alight ? ORANGE : tone.dark }]}>
            <Icon name={rideCue.alight ? "notifications" : "location"} size={15} color="#FFFFFF" />
            <Text style={s.rideText} numberOfLines={1}>
              {rideCue.alight
                ? rideCue.alight
                : rideCue.passing
                ? `Passing ${rideCue.passing.name}, on your ${rideCue.passing.side}`
                : `Next: ${rideCue.next!.landmark.name} · ${bannerDistance(rideCue.next!.inM, units)}`}
            </Text>
          </View>
        ) : null}
      </View>

      {thenText ? (
        <View style={[s.thenTab, { backgroundColor: tone.dark }]}>
          <Text style={s.thenWord}>Then</Text>
          {thenManeuver ? <MaterialIcons name={thenManeuver as any} size={22} color="#FFFFFF" /> : null}
          <Text style={s.thenText} numberOfLines={1}>{thenText}</Text>
        </View>
      ) : null}

      {roleStrip}

      {status ? (
        <View style={s.status}>
          <Icon name={status.icon} size={15} color="#FDE68A" />
          <Text style={s.statusText} numberOfLines={1}>{status.text}</Text>
          {paused && onResume ? (
            <PressableScale onPress={onResume} style={s.resume} accessibilityRole="button">
              <Text style={s.resumeText}>Resume</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}

      {hazard ? (
        <View style={s.hazard} accessibilityLiveRegion="polite">
          <ReportTypeIcon type={hazard.type} size={40} />
          {hazard.passed ? (
            <>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.hazardTitle} numberOfLines={1}>Still there?</Text>
                <Text style={s.hazardSub} numberOfLines={1}>{hazardLabel(hazard.type)} reported here</Text>
              </View>
              <PressableScale
                onPress={() => onHazardVote?.(hazard.id, false)}
                style={[s.vote, s.voteNo]}
                accessibilityRole="button"
                accessibilityLabel="Not there any more"
              >
                <Text style={s.voteNoText}>No</Text>
              </PressableScale>
              <PressableScale
                onPress={() => onHazardVote?.(hazard.id, true)}
                style={[s.vote, s.voteYes]}
                accessibilityRole="button"
                accessibilityLabel="Still there"
              >
                <Text style={s.voteYesText}>Yes</Text>
              </PressableScale>
            </>
          ) : (
            <>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.hazardTitle} numberOfLines={1}>{hazardLabel(hazard.type)} reported</Text>
                <Text style={s.hazardSub} numberOfLines={1}>
                  {hazard.source === "tomtom"
                    ? "Live traffic data"
                    : [ago(hazard.createdAt), hazard.upvotes ? `${hazard.upvotes} confirmed` : null].filter(Boolean).join(" · ") || "From the community"}
                </Text>
              </View>
              {hazard.aheadM != null ? <Text style={s.hazardDist}>{bannerDistance(hazard.aheadM, units)}</Text> : null}
            </>
          )}
        </View>
      ) : null}

      {toastShown && toast ? (
        <Pressable onPress={() => setToastShown(false)} style={s.toast} accessibilityLiveRegion="polite">
          <Icon name="checkmark-circle" size={15} color="#FFFFFF" />
          <Text style={s.toastText} numberOfLines={1}>{toast.text}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const shadow = {
  shadowColor: "#000",
  shadowOpacity: 0.25,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 12,
};

const s = StyleSheet.create({
  wrap: { gap: 0 },
  banner: { borderRadius: 18, overflow: "hidden", ...shadow },
  bannerWithTab: { borderBottomLeftRadius: 0 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14, minHeight: 92 },
  lead: { width: 70, alignItems: "center", justifyContent: "center", gap: 2 },
  distance: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  body: { flex: 1, minWidth: 0, justifyContent: "center" },
  verb: { fontSize: 14.5, fontWeight: "600", marginBottom: 1 },
  primary: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 31 },
  primaryCalm: { fontSize: 22, lineHeight: 27 },
  secondary: { fontSize: 15, fontWeight: "600", marginTop: 2 },
  ride: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  rideText: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  thenTab: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "70%",
    paddingLeft: 14,
    paddingRight: 16,
    paddingVertical: 8,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    ...shadow,
  },
  thenWord: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  thenText: { flexShrink: 1, color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  status: {
    marginTop: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#111827",
    ...shadow,
  },
  statusText: { flexShrink: 1, color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },
  resume: { backgroundColor: ORANGE, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  resumeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  hazard: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    ...shadow,
  },
  hazardTitle: { color: "#111827", fontSize: 16, fontWeight: "800" },
  hazardSub: { color: "#6B7280", fontSize: 13, fontWeight: "600", marginTop: 1 },
  hazardDist: { color: "#111827", fontSize: 18, fontWeight: "800" },
  vote: { height: 44, minWidth: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  voteYes: { backgroundColor: ORANGE },
  voteNo: { backgroundColor: "#F3F4F6" },
  voteYesText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  voteNoText: { color: "#111827", fontSize: 15, fontWeight: "800" },
  toast: {
    marginTop: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#111827",
    ...shadow,
  },
  toastText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },
});
