// components/app/RouteStepsList.tsx
import {
  RouteStop,
  Step,
  WalkSubStep,
  getRouteColor,
  maneuverIcon,
  mToNice,
  sToMin,
  formatEta,
} from "@/utils/mapHelpers";
import { departureMeta } from "@/utils/departures";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const BLACK = "#111827";
const GREY = "#6B7280";
const BORDER = "#E5E7EB";
const BG = "#FFFFFF";

function formatStepEta(d: Date): string {
  if (!d || d.getTime() === 0) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const RAIL_W = 46;

function resolveTransitIcon(
  mode?: string
): keyof typeof MaterialIcons.glyphMap {
  const m = String(mode ?? "BUS").toUpperCase();
  if (m === "RAIL" || m === "SUBWAY" || m === "TRAM") return "train";
  if (m === "FERRY") return "directions-boat";
  if (m === "BICYCLE") return "directions-bike";
  if (m === "CAR") return "directions-car";
  return "directions-bus";
}

function WalkDots() {
  const dark = useColorScheme() === "dark";
  const dotColor = dark ? "#52525B" : "#CBD5E1";
  return (
    <View style={wd.railContainer}>
      <View style={[wd.dottedLine, { borderColor: dotColor }]} />
    </View>
  );
}
const wd = StyleSheet.create({
  railContainer: { width: RAIL_W, alignItems: "center", height: 24 },
  dottedLine: {
    width: 0,
    flex: 1,
    borderWidth: 1.5,
    borderStyle: "dotted",
    borderRadius: 1,
  },
});

function OriginNode() {
  const dark = useColorScheme() === "dark";
  const ringBg = dark ? "rgba(255,111,0,0.22)" : "#FFE2C2";
  const textColor = dark ? "#F9FAFB" : BLACK;
  const time = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={orig.row}>
      <View style={orig.rail}>
        <View style={[orig.outerRing, { backgroundColor: ringBg }]}>
          <View style={orig.innerDot} />
        </View>
      </View>
      <Text style={[orig.label, { color: textColor }]}>Your location</Text>
      <Text style={orig.time}>{time}</Text>
    </View>
  );
}
const orig = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  rail: { width: RAIL_W, alignItems: "center" },
  outerRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  innerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
  },
  label: { flex: 1, fontSize: 16, fontWeight: "700" },
  time: { fontSize: 13, color: GREY, fontWeight: "500" },
});

function SubStep({ sub, isLast }: { sub: WalkSubStep; isLast: boolean }) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#F9FAFB" : BLACK;
  const borderColor = dark ? "#27272A" : BORDER;

  return (
    <View
      style={[
        ss.row,
        !isLast && ss.divided,
        !isLast && { borderBottomColor: borderColor },
      ]}
    >
      <MaterialIcons
        name={maneuverIcon(sub.maneuver) as any}
        size={20}
        color={textColor}
        style={ss.icon}
      />
      <View style={ss.textCol}>
        <Text style={[ss.instruction, { color: textColor }]}>
          {sub.instruction}
        </Text>
        {sub.note && <Text style={ss.note}>{sub.note}</Text>}
      </View>
      {sub.distance > 0 && <Text style={ss.dist}>{mToNice(sub.distance)}</Text>}
    </View>
  );
}
const ss = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 4,
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { marginRight: 12, opacity: 0.8 },
  textCol: { flex: 1, paddingRight: 10 },
  instruction: { fontSize: 14.5, fontWeight: "500", lineHeight: 20 },
  note: { fontSize: 12.5, color: GREY, marginTop: 2, lineHeight: 17 },
  dist: { fontSize: 12.5, color: GREY, fontWeight: "600", flexShrink: 0 },
});

function WalkSection({
  step,
  isActive,
  isPassed,
  stepEta,
  navigating,
}: {
  step: Step;
  isActive: boolean;
  isPassed: boolean;
  stepEta?: Date;
  navigating: boolean;
}) {
  const [open, setOpen] = useState<boolean>(isActive || true);
  const hasSubs = (step.subSteps?.length ?? 0) > 0;
  const dark = useColorScheme() === "dark";
  const C = { bg: dark ? "#18181B" : BG, text: dark ? "#F9FAFB" : BLACK };
  const dotColor = dark ? "#52525B" : "#CBD5E1";

  return (
    <View style={[ws.container, { opacity: isPassed ? 0.4 : 1 }]}>
      <View style={ws.railContainer}>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center" }]}>
          <View style={[ws.dottedLine, { borderColor: dotColor }]} />
        </View>
        <View style={[ws.iconBg, { backgroundColor: C.bg }]}>
          <MaterialIcons
            name="directions-walk"
            size={21}
            color={isActive ? ORANGE : GREY}
          />
        </View>
      </View>

      <View style={ws.content}>
        <Pressable
          style={ws.headerRow}
          onPress={() => hasSubs && setOpen(!open)}
          disabled={!hasSubs}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                ws.walkText,
                { color: C.text },
                isActive && { color: ORANGE },
              ]}
            >
              {step.instruction || "Walk"}
            </Text>
            <Text style={ws.metaText}>
              {sToMin(step.duration).replace("~", "")} ({mToNice(step.distance)}
              )
              {navigating && stepEta && stepEta.getTime() !== 0
                ? `  ·  Arrive at ${formatStepEta(stepEta)}`
                : ""}
            </Text>
          </View>
          {hasSubs && (
            <MaterialIcons
              name={open ? "expand-less" : "expand-more"}
              size={22}
              color={GREY}
            />
          )}
        </Pressable>

        {open && hasSubs && (
          <View style={ws.subContainer}>
            {step.subSteps!.map((sub, j) => (
              <SubStep
                key={j}
                sub={sub}
                isLast={j === step.subSteps!.length - 1}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
const ws = StyleSheet.create({
  container: { flexDirection: "row", minHeight: 40 },
  railContainer: { width: RAIL_W, alignItems: "center" },
  dottedLine: {
    width: 0,
    flex: 1,
    borderWidth: 1.5,
    borderStyle: "dotted",
    borderRadius: 1,
  },
  iconBg: {
    position: "absolute",
    top: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  content: { flex: 1, paddingBottom: 8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 48,
  },
  walkText: { fontSize: 15.5, fontWeight: "700" },
  metaText: { fontSize: 13, color: GREY, marginTop: 2 },
  subContainer: { marginLeft: 0, marginBottom: 8 },
});

function StopsList({
  stops,
  routeColor,
  routeName,
  mode,
  onSelectIntermStop,
}: {
  stops: RouteStop[];
  routeColor: string;
  routeName: string;
  mode?: string;
  onSelectIntermStop?: (
    stop: RouteStop,
    routeName: string,
    routeColor: string
  ) => void;
}) {
  const dark = useColorScheme() === "dark";
  const nameColor = dark ? "#D4D4D8" : "#374151";
  const pressedColor = dark ? "#27272A" : "#F3F4F6";
  const intermediate = stops.slice(1, -1);

  if (intermediate.length === 0) return null;
  const iconName = resolveTransitIcon(mode);

  return (
    <View style={[sl.container, { borderLeftColor: routeColor + "40" }]}>
      {intermediate.map((stop: any, idx) => (
        <Pressable
          key={idx}
          style={({ pressed }) => [
            sl.row,
            pressed && { backgroundColor: pressedColor },
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            onSelectIntermStop?.(stop, routeName, routeColor);
          }}
        >
          <MaterialIcons
            name={iconName}
            size={14}
            color={routeColor}
            style={sl.icon}
          />
          <Text style={[sl.name, { color: nameColor }]} numberOfLines={1}>
            {stop.name}
          </Text>
          {stop.stop_code && (
            <Text style={sl.codeText}>{stop.stop_code}</Text>
          )}
          <Icon name="locate-outline" size={13} color={GREY} />
        </Pressable>
      ))}
    </View>
  );
}
const sl = StyleSheet.create({
  container: {
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 6,
    paddingLeft: 12,
    borderLeftWidth: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
    gap: 8,
  },
  icon: { opacity: 0.8 },
  name: { flex: 1, fontSize: 13.5, fontWeight: "600", paddingVertical: 2 },
  codeText: { fontSize: 11, color: GREY, fontFamily: "monospace" },
});

function TransitSection({
  depart,
  arrive,
  routeColor,
  stopName,
  alightName,
  isActive,
  isPassed,
  stopsRemaining,
  boardEta,
  onSelectIntermStop,
}: {
  depart: Step;
  arrive: Step;
  routeColor: string;
  stopName: string;
  alightName: string;
  isActive: boolean;
  isPassed: boolean;
  stopsRemaining?: number | null;
  boardEta?: Date;
  onSelectIntermStop?: (
    stop: RouteStop,
    routeName: string,
    routeColor: string
  ) => void;
}) {
  const [rideExpanded, setRideExpanded] = useState(false);
  const dark = useColorScheme() === "dark";
  const C = {
    bg: dark ? "#18181B" : BG,
    text: dark ? "#F9FAFB" : BLACK,
    border: dark ? "#27272A" : BORDER,
  };

  const routeNameMatch = depart.instruction?.match(/^Board (?:Line )?(.+) at /);
  const routeName = routeNameMatch?.[1] ?? (depart as any).routeName ?? "";
  const mode = (depart as any).mode ?? "BUS";
  const modeBadge = (depart as any).modeBadge ?? "Bus";
  const platformCode = (depart as any).platformCode;
  const stopCode = (depart as any).stopCode;
  const nextDep = (depart as any).nextDeparture;

  const stops = depart.stops ?? [];
  const stopCount = stops.length > 1 ? stops.length - 1 : 1;
  const hasSubs = stops.length > 2;
  const rideDur = arrive ? sToMin(arrive.duration).replace("~", "") : "";
  const rideDist = arrive ? mToNice(arrive.distance) : "";
  const iconName = resolveTransitIcon(mode);

  return (
    <View style={[ts.wrapper, isPassed && { opacity: 0.35 }]}>
      <View style={ts.railContainer}>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center" }]}>
          <View style={[ts.solidLine, { backgroundColor: routeColor }]} />
        </View>
        <View style={[ts.busCircle, { backgroundColor: routeColor }]}>
          <MaterialIcons name={iconName} size={17} color="#FFFFFF" />
        </View>
        <View
          style={[
            ts.alightCircle,
            { borderColor: routeColor, backgroundColor: C.bg },
          ]}
        />
      </View>

      <View style={ts.content}>
        <View style={ts.boardingRow}>
          <View style={{ flex: 1 }}>
            <View style={ts.stopTitleLine}>
              <Text style={[ts.nodeTitle, { color: C.text }]}>{stopName}</Text>
              {stopCode && <Text style={ts.stopCode}>{stopCode}</Text>}
              {platformCode && (
                <View style={ts.platPill}>
                  <Text style={ts.platPillText}>Plat. {platformCode}</Text>
                </View>
              )}
            </View>
            {(depart as any).landmark ? (
              <Text style={[ts.landmarkSub, { color: routeColor }]}>
                {/* Already a phrase: "opposite Sarit Centre", "near Kencom House". */}
                {String((depart as any).landmark).replace(/^./, (c) => c.toUpperCase())}
              </Text>
            ) : null}
          </View>
          {isActive && boardEta && boardEta.getTime() !== 0 && (
            <Text style={[ts.etaText, { color: routeColor }]}>
              {formatStepEta(boardEta)}
            </Text>
          )}
        </View>

        <View style={ts.rideContent}>
          <View style={ts.routeInfoRow}>
            <View style={[ts.modeTag, { backgroundColor: routeColor }]}>
              <Text style={ts.modeTagText}>{modeBadge}</Text>
            </View>
            <Text style={[ts.routeNumText, { color: C.text }]}>
              {routeName}
            </Text>
            <Text
              style={[ts.destinationText, { color: GREY }]}
              numberOfLines={1}
            >
              → {alightName}
            </Text>
          </View>

          {nextDep && (
            <View style={ts.liveNextRow}>
              <Text style={ts.liveNextRed}>{formatEta(nextDep.eta_seconds)}</Text>
              {!!departureMeta(nextDep) && (
                <Text style={ts.liveNextMeta}>{departureMeta(nextDep)}</Text>
              )}
            </View>
          )}

          <Pressable
            style={[ts.rideSummary, { borderTopColor: C.border }]}
            onPress={() => hasSubs && setRideExpanded((v) => !v)}
            disabled={!hasSubs}
          >
            <Text
              style={[
                ts.rideSummaryText,
                { color: C.text },
                isActive && { color: ORANGE, fontWeight: "700" },
              ]}
            >
              {isActive && stopsRemaining != null
                ? `${stopsRemaining} stop${
                    stopsRemaining !== 1 ? "s" : ""
                  } remaining`
                : `Ride ${stopCount} stop${stopCount !== 1 ? "s" : ""}`}
              {rideDur || rideDist ? (
                <Text style={ts.rideDuration}>
                  {"  ·  "}
                  {rideDur}
                  {rideDur && rideDist ? "  ·  " : ""}
                  {rideDist}
                </Text>
              ) : null}
            </Text>
            {hasSubs && (
              <MaterialIcons
                name={rideExpanded ? "expand-less" : "expand-more"}
                size={22}
                color={GREY}
              />
            )}
          </Pressable>

          {rideExpanded && hasSubs && (
            <StopsList
              stops={stops}
              routeColor={routeColor}
              routeName={routeName}
              mode={mode}
              onSelectIntermStop={onSelectIntermStop}
            />
          )}
        </View>

        <View style={ts.alightingRow}>
          <Text style={[ts.nodeTitle, { color: C.text }]}>{alightName}</Text>
        </View>
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  wrapper: { flexDirection: "row", minHeight: 80, marginBottom: 8 },
  railContainer: { width: RAIL_W, alignItems: "center" },
  solidLine: { width: 6, flex: 1, borderRadius: 3 },
  busCircle: {
    position: "absolute",
    top: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  alightCircle: {
    position: "absolute",
    bottom: 16,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 4,
    zIndex: 2,
  },
  content: { flex: 1, paddingBottom: 0 },
  boardingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 46,
    justifyContent: "space-between",
  },
  stopTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  nodeTitle: { fontSize: 16, fontWeight: "700" },
  stopCode: { fontSize: 12, color: GREY, fontWeight: "500" },
  platPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  platPillText: { color: "#15803D", fontSize: 10.5, fontWeight: "700" },
  etaText: { fontSize: 14, fontWeight: "700" },
  rideContent: { paddingVertical: 6 },
  routeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },
  modeTag: { paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 5 },
  modeTagText: { fontSize: 10.5, fontWeight: "800", color: "#FFF" },
  routeNumText: { fontSize: 15, fontWeight: "800" },
  destinationText: { fontSize: 13.5, fontWeight: "500", flex: 1 },
  liveNextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  liveNextRed: { color: "#DC2626", fontSize: 12.5, fontWeight: "700" },
  liveNextMeta: { color: GREY, fontSize: 12 },
  rideSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rideSummaryText: { fontSize: 14.5, fontWeight: "600" },
  rideDuration: { fontSize: 13, fontWeight: "400", color: GREY },
  alightingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 44,
  },
  landmarkSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    fontStyle: "italic",
  },
});

function DestNode({ name }: { name: string }) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#F9FAFB" : BLACK;

  return (
    <View style={dn.row}>
      <View style={dn.rail}>
        <MaterialIcons name="place" size={26} color={ORANGE} />
      </View>
      <Text style={[dn.label, { color: textColor }]}>{name}</Text>
    </View>
  );
}
const dn = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 24,
  },
  rail: { width: RAIL_W, alignItems: "center" },
  label: { flex: 1, fontSize: 17, fontWeight: "800" },
});

interface RouteStepsListProps {
  steps: Step[];
  nextStepIdx: number;
  navigating: boolean;
  selectedName: string;
  stopsRemaining?: number | null;
  scrollRef?: React.RefObject<ScrollView | null>;
  stepETAs?: Date[];
  onSelectIntermStop?: (
    stop: RouteStop,
    routeName: string,
    routeColor: string
  ) => void;
}

export default function RouteStepsList({
  steps,
  nextStepIdx,
  navigating,
  selectedName,
  stopsRemaining,
  scrollRef,
  stepETAs,
  onSelectIntermStop,
}: RouteStepsListProps) {
  const groupOffsets = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!navigating || !scrollRef?.current) return;
    const y = groupOffsets.current[nextStepIdx];
    if (y != null)
      scrollRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
  }, [nextStepIdx, navigating, scrollRef]);

  if (steps.length === 0) return null;

  type WalkGroup = { kind: "walk"; step: Step; flatIdx: number };
  type TransitGroup = {
    kind: "transit";
    depart: Step;
    arrive: Step;
    flatIdx: number;
  };
  const groups: Array<WalkGroup | TransitGroup> = [];

  let i = 0;
  while (i < steps.length) {
    if (steps[i].type === "depart" && steps[i + 1]?.type === "arrive") {
      groups.push({
        kind: "transit",
        depart: steps[i],
        arrive: steps[i + 1],
        flatIdx: i,
      });
      i += 2;
    } else {
      groups.push({ kind: "walk", step: steps[i], flatIdx: i });
      i++;
    }
  }

  const lastGroup = groups[groups.length - 1];

  return (
    <View style={{ paddingTop: 8, paddingBottom: 8 }}>
      <OriginNode />

      {(() => {
        let engineStepIdx = 0;
        return groups.map((g, gi) => {
          const myEngineIdx = engineStepIdx++;
          if (g.kind === "walk") {
            const isActive = navigating && nextStepIdx === g.flatIdx;
            const isPassed = navigating && nextStepIdx > g.flatIdx;
            const stepEta = stepETAs?.[myEngineIdx];
            return (
              <View
                key={gi}
                onLayout={(e) => {
                  const y = e?.nativeEvent?.layout?.y;
                  if (y != null && groupOffsets.current) {
                    groupOffsets.current[g.flatIdx] = y;
                  }
                }}
              >
                <WalkSection
                  step={g.step}
                  isActive={isActive}
                  isPassed={isPassed}
                  stepEta={stepEta}
                  navigating={navigating}
                />
              </View>
            );
          }

          const { depart, arrive } = g;
          const routeNameMatch =
            depart.instruction?.match(/^Board (?:Line )?(.+) at /);
          const routeName =
            routeNameMatch?.[1] ?? (depart as any).routeName ?? "";
          const routeColor =
            (depart as any).routeColor ?? getRouteColor(routeName);
          const stopName =
            depart.instruction?.replace(/^Board (?:Line )?.+ at /, "") ?? "";
          const alightName =
            arrive.instruction?.replace(/^Alight at /, "") ?? "";
          const isActive =
            navigating &&
            (nextStepIdx === g.flatIdx || nextStepIdx === g.flatIdx + 1);
          const isPassed = navigating && nextStepIdx > g.flatIdx + 1;
          const boardEta = stepETAs?.[myEngineIdx];

          return (
            <View
              key={gi}
              onLayout={(e) => {
                const y = e?.nativeEvent?.layout?.y;
                if (y != null && groupOffsets.current) {
                  groupOffsets.current[g.flatIdx] = y;
                }
              }}
            >
              <TransitSection
                depart={depart}
                arrive={arrive}
                routeColor={routeColor}
                stopName={stopName}
                alightName={alightName}
                isActive={isActive}
                isPassed={isPassed}
                stopsRemaining={stopsRemaining}
                boardEta={boardEta}
                onSelectIntermStop={onSelectIntermStop}
              />
            </View>
          );
        });
      })()}

      {lastGroup?.kind === "transit" && <WalkDots />}
      <DestNode name={selectedName} />
    </View>
  );
}