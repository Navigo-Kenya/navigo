// components/app/stop/StopReportForm.tsx
//
// Report a delay at a stop, for a line. Sends stop_id and route_id: three
// reports on one line within 15 minutes become an automatic service alert
// (API AggregateDelayReportsJob), which the old form could never trigger.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useContributionStore } from "@/store/contributionStore";
import { FormLabel, FormSheet, formColors } from "./FormSheet";

const RED = "#DC2626";

type Severity = "minor" | "major" | "cancelled";
const KINDS: { key: Severity; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "minor", label: "Running late", sub: "Under 20 minutes", icon: "time-outline", color: "#F59E0B" },
  { key: "major", label: "Very late", sub: "20 minutes or more", icon: "hourglass-outline", color: RED },
  { key: "cancelled", label: "Not running", sub: "No matatus coming", icon: "close-circle-outline", color: "#6B7280" },
];

export type ReportLine = { route_id: string; short_name: string; color?: string | null; headsign?: string | null };

export function StopReportForm({
  visible,
  onClose,
  stop,
  lines,
  initialRouteId,
}: {
  visible: boolean;
  onClose: () => void;
  stop: { id: string; name: string };
  lines: ReportLine[];
  initialRouteId?: string | null;
}) {
  const dark = useColorScheme() === "dark";
  const C = formColors(dark);
  const { submit } = useContributionStore();
  const [severity, setSeverity] = useState<Severity>("minor");
  const [routeId, setRouteId] = useState<string | null>(initialRouteId ?? (lines.length === 1 ? lines[0].route_id : null));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const line = lines.find((l) => l.route_id === routeId) ?? null;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const kind = KINDS.find((k) => k.key === severity)!;
      const res = await submit({
        type: "delay_report",
        stop_id: stop.id,
        title: `${kind.label}${line ? ` · Line ${line.short_name}` : ""} at ${stop.name}`,
        data: {
          severity,
          route_id: line?.route_id,
          route_name: line?.short_name,
          note: note.trim() || undefined,
        } as any,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      if (res.points_awarded > 0) Alert.alert("Thanks for the heads-up", `+${res.points_awarded} Navigo Points earned.`);
    } catch {
      Alert.alert("Couldn't send your report", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Report a delay"
      subtitle={stop.name}
      icon="alert-circle-outline"
      accent={RED}
      submitLabel="Send report"
      submitting={loading}
      onSubmit={handleSubmit}
      footerHint="+3 Navigo Points · riders nearby see it for 2 hours"
    >
      <View>
        <FormLabel color={C.sub}>{"WHAT'S HAPPENING?"}</FormLabel>
        <View style={{ gap: 8 }}>
          {KINDS.map((k) => {
            const on = severity === k.key;
            return (
              <Pressable
                key={k.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSeverity(k.key);
                }}
                style={[
                  styles.kind,
                  { backgroundColor: on ? k.color + "16" : C.card, borderColor: on ? k.color : "transparent" },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={k.icon} size={20} color={k.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kindLabel, { color: C.text }]}>{k.label}</Text>
                  <Text style={[styles.kindSub, { color: C.sub }]}>{k.sub}</Text>
                </View>
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? k.color : C.sub} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {lines.length > 0 && (
        <View>
          <FormLabel color={C.sub}>WHICH LINE?</FormLabel>
          <View style={styles.chips}>
            {lines.map((l) => {
              const on = l.route_id === routeId;
              const color = l.color || "#2563EB";
              return (
                <Pressable
                  key={l.route_id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRouteId(on ? null : l.route_id);
                  }}
                  style={[styles.chip, { backgroundColor: on ? color : C.card }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Line ${l.short_name}`}
                >
                  <Text style={[styles.chipText, { color: on ? "#FFFFFF" : C.text }]}>{l.short_name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.help, { color: C.sub }]}>
            {line
              ? `Reports on line ${line.short_name} help warn every rider waiting for it.`
              : "Pick the line so riders waiting for it are warned."}
          </Text>
        </View>
      )}

      <View>
        <FormLabel color={C.sub}>DETAILS (OPTIONAL)</FormLabel>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={[styles.textArea, { backgroundColor: C.input, color: C.text }]}
          placeholder="Traffic on Waiyaki Way, matatus diverting via Ring Road…"
          placeholderTextColor={C.sub}
          multiline
          maxLength={250}
        />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  kind: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  kindLabel: { fontSize: 14.5, fontWeight: "700" },
  kindSub: { fontSize: 12, marginTop: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, minWidth: 44, alignItems: "center" },
  chipText: { fontSize: 13.5, fontWeight: "800" },
  help: { fontSize: 11.5, marginTop: 6 },
  textArea: { minHeight: 70, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: "top" },
});
