// components/app/DepartureEmpty.tsx
//
// Empty states for departure boards: shown instead of invented times when
// the timetable has nothing for a stop or a line.
import React from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { arrivalsStatusCopy, type ArrivalsStatus } from "@/utils/departures";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";

/**
 * Whole-board empty state: the stop has no timetable data at all.
 * Soft illustration, plain explanation, optional "Suggest edits" action.
 */
export function NoDeparturesState({
  title = "No departure data yet",
  body = "We don’t have a timetable for this stop yet. Lines and times show up here as soon as they’re mapped.",
  actionLabel,
  onAction,
}: {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const C = {
    disc: dark ? "#27272A" : "#F4F4F5",
    ring: dark ? "#3F3F46" : "#E4E4E7",
    icon: dark ? "#A1A1AA" : "#71717A",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
  };
  return (
    <View style={s.wrap} accessibilityRole="summary">
      <View style={[s.discOuter, { borderColor: C.ring }]}>
        <View style={[s.disc, { backgroundColor: C.disc }]}>
          <Icon name="time-outline" size={28} color={C.icon} />
          <View style={[s.slash, { backgroundColor: C.icon }]} />
        </View>
      </View>
      <Text style={[s.title, { color: C.text }]}>{title}</Text>
      <Text style={[s.body, { color: C.sub }]}>{body}</Text>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [s.action, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          <Icon name="create-outline" size={14} color={ORANGE} />
          <Text style={s.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Inline status for one line on the board (right-hand column). */
export function LineNoDepartures({ status }: { status?: ArrivalsStatus | string | null }) {
  const dark = useColorScheme() === "dark";
  const copy = arrivalsStatusCopy(status);
  const info = copy.tone === "info";
  const fg = info ? "#2563EB" : dark ? "#A1A1AA" : "#6B7280";
  const bg = info
    ? dark ? "rgba(37,99,235,0.16)" : "#EFF6FF"
    : dark ? "#27272A" : "#F4F4F5";
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Icon name={copy.icon} size={12} color={fg} />
      <Text style={[s.pillText, { color: fg }]} numberOfLines={1}>
        {copy.title}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 28, gap: 8 },
  discOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  disc: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  slash: {
    position: "absolute",
    width: 36,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: "-40deg" }],
  },
  title: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2, textAlign: "center" },
  body: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,111,0,0.1)",
  },
  actionText: { color: ORANGE, fontSize: 13, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 170,
  },
  pillText: { fontSize: 11.5, fontWeight: "700" },
});
