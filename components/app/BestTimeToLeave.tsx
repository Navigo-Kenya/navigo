// components/app/BestTimeToLeave.tsx
//
// "Best time to leave" on a car / boda route card. On tap only (each check
// costs TomTom calls): the same roads timed now and at 4 later departures,
// shown as one line of advice and a small bar per departure (taller = slower,
// the suggested one in green).
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/icons/Icon";
import { RouteService, type DepartureAdvice, type Route } from "@/services/route";

const BLUE = "#3B7BF6";
const GREEN = "#16A34A";
const BAR_MAX_H = 34;

interface Props {
  route: Route;
  dark: boolean;
  textPrimary: string;
  textMuted: string;
}

export function BestTimeToLeave({ route, dark, textPrimary, textMuted }: Props) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done"; data: DepartureAdvice }
  >({ kind: "idle" });

  const load = () => {
    Haptics.selectionAsync();
    setState({ kind: "loading" });
    RouteService.getDepartureTimes(route)
      .then((data) => setState({ kind: "done", data }))
      .catch(() => setState({ kind: "error" }));
  };

  if (state.kind === "idle" || state.kind === "error") {
    return (
      <Pressable
        onPress={load}
        style={s.link}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Best time to leave"
      >
        <Icon name="time-outline" size={15} color={BLUE} />
        <Text style={[s.linkText, { color: BLUE }]}>
          {state.kind === "error" ? "Couldn't check. Try again" : "Best time to leave"}
        </Text>
      </Pressable>
    );
  }

  if (state.kind === "loading") {
    return (
      <View style={s.link}>
        <ActivityIndicator size="small" color={BLUE} />
        <Text style={[s.linkText, { color: textMuted }]}>Checking traffic for later…</Text>
      </View>
    );
  }

  const { data } = state;
  const suggested = data.saves_s > 0 ? data.best_index : -1;
  return (
    <View
      style={[s.box, { backgroundColor: dark ? "rgba(255,255,255,0.05)" : "#F8FAFC" }]}
      accessibilityLabel={`${data.advice}. ${data.slots
        .map((sl) => `${sl.label}: ${Math.round(sl.duration_s / 60)} minutes`)
        .join(", ")}`}
    >
      <Text style={[s.advice, { color: suggested > 0 ? GREEN : textPrimary }]} numberOfLines={2}>
        {data.advice}
      </Text>
      <View style={s.bars}>
        {data.slots.map((sl, i) => {
          const isBest = i === suggested;
          const color = isBest ? GREEN : sl.live ? BLUE : dark ? "#52525B" : "#CBD5E1";
          return (
            <View key={sl.depart_at} style={s.barCol}>
              <Text style={[s.barMin, { color: isBest ? GREEN : textMuted }]}>
                {Math.round(sl.duration_s / 60)}′
              </Text>
              <View style={[s.bar, { height: Math.max(6, sl.relative * BAR_MAX_H), backgroundColor: color }]} />
              <Text style={[s.barLabel, { color: isBest ? GREEN : textMuted }]} numberOfLines={1}>
                {sl.label.replace(/ (AM|PM)$/, "")}
              </Text>
            </View>
          );
        })}
      </View>
      {suggested > 0 && (
        <Text style={[s.foot, { color: textMuted }]} numberOfLines={1}>
          Arrive {data.slots[suggested].arrive_label} · leaving now: {data.slots[0].arrive_label}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  link: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, minHeight: 22 },
  linkText: { fontSize: 13, fontWeight: "700" },
  box: { borderRadius: 12, padding: 10, marginBottom: 12, gap: 8 },
  advice: { fontSize: 13.5, fontWeight: "800" },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  barCol: { flex: 1, alignItems: "center", gap: 3 },
  bar: { width: "70%", borderRadius: 4 },
  barMin: { fontSize: 11, fontWeight: "700" },
  barLabel: { fontSize: 10.5, fontWeight: "600" },
  foot: { fontSize: 11.5, fontWeight: "500" },
});
