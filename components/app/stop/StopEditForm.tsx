// components/app/stop/StopEditForm.tsx
//
// "Suggest an edit" for a stop. Riders fix what they know: the name, the
// landmark people use to find the stage ("opposite Hilton"), where it really
// is (drag the map under the pin), and which lines stop here. Each changed
// field becomes its own stop_edit contribution (with stop_id, so moderators
// see the stop and an approved landmark is applied to it).
import React, { useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import * as Haptics from "expo-haptics";
import { useContributionStore } from "@/store/contributionStore";
import { showReward } from "@/store/rewardStore";
import { CONTRIBUTION_POINTS } from "@/services/contribution";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { FormLabel, FormSheet, formColors } from "./FormSheet";
import { PinMapBox, type PinMapBoxHandle } from "./PinMapBox";
import { Icon } from "@/components/icons/Icon";

const BLUE = "#2563EB";
/** Moves smaller than this are GPS noise, not an edit. */
const MIN_MOVE_M = 8;

type Line = { id: string; short_name: string };

export function StopEditForm({
  visible,
  onClose,
  stop,
  lines,
}: {
  visible: boolean;
  onClose: () => void;
  stop: { id: string; name: string; lat: number; lng: number; landmark?: string | null };
  lines: Line[];
}) {
  const dark = useColorScheme() === "dark";
  const C = formColors(dark);
  const { submit } = useContributionStore();
  const mapRef = useRef<PinMapBoxHandle>(null);

  const [name, setName] = useState(stop.name);
  const [landmark, setLandmark] = useState(stop.landmark ?? "");
  const [pos, setPos] = useState({ lat: stop.lat, lng: stop.lng });
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const moved = distanceM(stop.lat, stop.lng, pos.lat, pos.lng);
  const addedLines = added.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

  const changes = useMemo(() => {
    const out: { field: string; current: string; proposed: string; label: string }[] = [];
    if (name.trim() && name.trim() !== stop.name) {
      out.push({ field: "name", current: stop.name, proposed: name.trim(), label: "Name" });
    }
    if (landmark.trim() !== (stop.landmark ?? "").trim() && landmark.trim()) {
      out.push({ field: "landmark", current: stop.landmark ?? "", proposed: landmark.trim(), label: "Landmark" });
    }
    if (moved >= MIN_MOVE_M) {
      out.push({
        field: "location",
        current: `${stop.lat.toFixed(6)}, ${stop.lng.toFixed(6)}`,
        proposed: `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`,
        label: `Location (${formatDistance(moved)} away)`,
      });
    }
    if (removed.length || addedLines.length) {
      const kept = lines.filter((l) => !removed.includes(l.id)).map((l) => l.short_name);
      out.push({
        field: "routes",
        current: lines.map((l) => l.short_name).join(", "),
        proposed: [...kept, ...addedLines].join(", "),
        label: "Lines",
      });
    }
    return out;
  }, [name, landmark, moved, pos, removed, addedLines, lines, stop]);

  const handleSubmit = async () => {
    if (!changes.length) return;
    setLoading(true);
    try {
      for (const c of changes) {
        await submit({
          type: "stop_edit",
          stop_id: stop.id,
          title: `Edit ${c.field}: ${stop.name}`,
          data: {
            field: c.field,
            current_value: c.current || undefined,
            proposed_value: c.proposed,
            note: note.trim() || undefined,
          },
        });
      }
      onClose();
      showReward({
        points: 0,
        title: changes.length === 1 ? "Edit sent for review" : `${changes.length} edits sent for review`,
        pendingPoints: CONTRIBUTION_POINTS.stop_edit * changes.length,
      });
    } catch {
      Alert.alert("Couldn't send your edit", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Suggest an edit"
      subtitle={stop.name}
      icon="create-outline"
      accent={BLUE}
      submitLabel={changes.length ? `Send ${changes.length} change${changes.length === 1 ? "" : "s"}` : "Change something to send"}
      submitting={loading}
      submitDisabled={!changes.length}
      onSubmit={handleSubmit}
      footerHint={`A moderator checks every edit · +${CONTRIBUTION_POINTS.stop_edit} Safiri Points each`}
    >
      <View>
        <FormLabel color={C.sub}>NAME</FormLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { backgroundColor: C.input, color: C.text }]}
          placeholder="Stop or stage name"
          placeholderTextColor={C.sub}
          maxLength={120}
        />
      </View>

      <View>
        <FormLabel color={C.sub}>LANDMARK RIDERS USE</FormLabel>
        <TextInput
          value={landmark}
          onChangeText={setLandmark}
          style={[styles.input, { backgroundColor: C.input, color: C.text }]}
          placeholder="e.g. opposite Kencom House, next to the Total station"
          placeholderTextColor={C.sub}
          maxLength={160}
        />
        <Text style={[styles.help, { color: C.sub }]}>{'Shown in directions: "Board at … opposite …"'}</Text>
      </View>

      <View>
        <View style={styles.rowBetween}>
          <FormLabel color={C.sub}>WHERE THE STOP REALLY IS</FormLabel>
          {moved >= MIN_MOVE_M && (
            <Pressable onPress={() => mapRef.current?.moveTo(stop.lat, stop.lng, 17)} hitSlop={8}>
              <Text style={[styles.link, { color: BLUE }]}>Reset</Text>
            </Pressable>
          )}
        </View>
        <PinMapBox ref={mapRef} initial={{ lat: stop.lat, lng: stop.lng }} onMove={setPos} buttonBg={C.bg} />
        <Text style={[styles.help, { color: C.sub }]}>
          {moved >= MIN_MOVE_M
            ? `Moved ${formatDistance(moved)} from the current position`
            : "Drag the map under the pin, or use where you're standing"}
        </Text>
      </View>

      <View>
        <FormLabel color={C.sub}>LINES THAT STOP HERE</FormLabel>
        <View style={styles.chips}>
          {lines.map((l) => {
            const off = removed.includes(l.id);
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setRemoved((r) => (off ? r.filter((x) => x !== l.id) : [...r, l.id]));
                }}
                style={[styles.chip, { backgroundColor: C.card, opacity: off ? 0.55 : 1 }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !off }}
                accessibilityLabel={`Line ${l.short_name}`}
              >
                <Text style={[styles.chipText, { color: C.text, textDecorationLine: off ? "line-through" : "none" }]}>
                  {l.short_name}
                </Text>
                <Icon name={off ? "add" : "close"} size={13} color={C.sub} />
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={added}
          onChangeText={setAdded}
          style={[styles.input, { backgroundColor: C.input, color: C.text, marginTop: 8 }]}
          placeholder="Missing lines, e.g. 46, 111"
          placeholderTextColor={C.sub}
          maxLength={80}
        />
        <Text style={[styles.help, { color: C.sub }]}>Tap a line that no longer stops here to strike it out.</Text>
      </View>

      <View>
        <FormLabel color={C.sub}>NOTE FOR THE MODERATOR (OPTIONAL)</FormLabel>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={[styles.input, styles.textArea, { backgroundColor: C.input, color: C.text }]}
          placeholder="How you know: you use this stage daily, the sign changed…"
          placeholderTextColor={C.sub}
          multiline
          maxLength={300}
        />
      </View>

      {changes.length > 0 && (
        <View style={[styles.summary, { backgroundColor: BLUE + "12" }]}>
          {changes.map((c) => (
            <Text key={c.field} style={[styles.summaryLine, { color: C.text }]} numberOfLines={2}>
              <Text style={{ fontWeight: "800" }}>{c.label}: </Text>
              {c.field === "location" ? "new position" : c.proposed}
            </Text>
          ))}
        </View>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5 },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  help: { fontSize: 11.5, marginTop: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  link: { fontSize: 12.5, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  chipText: { fontSize: 13, fontWeight: "700" },
  summary: { borderRadius: 12, padding: 12, gap: 4 },
  summaryLine: { fontSize: 13 },
});
