// components/app/stop/NewStopForm.tsx
//
// "Add a missing stage": where riders wait (drag the map under the pin),
// its name, what kind of stop it is, the landmark people use, and the lines
// that stop there. One new_stop contribution; a moderator checks it, and
// approval adds the stop and its points.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import * as Haptics from "expo-haptics";
import { useContributionStore } from "@/store/contributionStore";
import { showReward } from "@/store/rewardStore";
import { CONTRIBUTION_POINTS } from "@/services/contribution";
import { FormLabel, FormSheet, formColors } from "./FormSheet";
import { PinMapBox } from "./PinMapBox";

const GREEN = "#059669";
/** Kencom, when nothing better is known. */
const NAIROBI = { lat: -1.2864, lng: 36.8252 };

type Kind = "stage" | "bus_stop" | "station";
const KINDS: { key: Kind; label: string; sub: string }[] = [
  { key: "stage", label: "Matatu stage", sub: "Where matatus load" },
  { key: "bus_stop", label: "Bus stop", sub: "A stop along the road" },
  { key: "station", label: "Station", sub: "Train, BRT or terminus" },
];

export function NewStopForm({
  visible,
  onClose,
  near,
}: {
  visible: boolean;
  onClose: () => void;
  /** Where to start the map: the rider's position when known. */
  near?: { lat: number; lng: number } | null;
}) {
  const dark = useColorScheme() === "dark";
  const C = formColors(dark);
  const { submit } = useContributionStore();
  const [start] = useState(near ?? NAIROBI);
  const [pos, setPos] = useState(start);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("stage");
  const [landmark, setLandmark] = useState("");
  const [lines, setLines] = useState("");
  const [loading, setLoading] = useState(false);

  const ready = name.trim().length >= 3;

  const handleSubmit = async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const res = await submit({
        type: "new_stop",
        title: `New stop: ${name.trim()}`,
        data: {
          name: name.trim(),
          lat: pos.lat,
          lng: pos.lng,
          stop_type: kind,
          landmark: landmark.trim() || undefined,
          routes: lines.trim() || undefined,
        },
      });
      onClose();
      showReward({ points: 0, title: "New stage sent for review", pendingPoints: CONTRIBUTION_POINTS.new_stop, quests: res.quests_done, streak: res.streak_days });
    } catch {
      Alert.alert("Couldn't send it", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Add a missing stage"
      subtitle="Where riders wait that Navigo doesn't know"
      icon="add-circle-outline"
      accent={GREEN}
      submitLabel={ready ? "Send for review" : "Name the stage to send"}
      submitting={loading}
      submitDisabled={!ready}
      onSubmit={handleSubmit}
      footerHint={`A moderator checks it · +${CONTRIBUTION_POINTS.new_stop} Safiri Points if approved`}
    >
      <View>
        <FormLabel color={C.sub}>WHERE RIDERS WAIT</FormLabel>
        <PinMapBox initial={start} onMove={setPos} buttonBg={C.bg} />
        <Text style={[styles.help, { color: C.sub }]}>Drag the map so the pin sits where people wait, or use where you&apos;re standing.</Text>
      </View>

      <View>
        <FormLabel color={C.sub}>NAME</FormLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { backgroundColor: C.input, color: C.text }]}
          placeholder="What riders call it, e.g. Kangemi stage"
          placeholderTextColor={C.sub}
          maxLength={120}
        />
      </View>

      <View>
        <FormLabel color={C.sub}>WHAT KIND</FormLabel>
        <View style={styles.kinds}>
          {KINDS.map((k) => {
            const on = k.key === kind;
            return (
              <Pressable
                key={k.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setKind(k.key);
                }}
                style={[styles.kind, { backgroundColor: on ? GREEN + "18" : C.card, borderColor: on ? GREEN : "transparent" }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.kindLabel, { color: on ? GREEN : C.text }]} numberOfLines={1}>{k.label}</Text>
                <Text style={[styles.kindSub, { color: C.sub }]} numberOfLines={2}>{k.sub}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <FormLabel color={C.sub}>LANDMARK (OPTIONAL)</FormLabel>
        <TextInput
          value={landmark}
          onChangeText={setLandmark}
          style={[styles.input, { backgroundColor: C.input, color: C.text }]}
          placeholder="e.g. opposite the Total station"
          placeholderTextColor={C.sub}
          maxLength={160}
        />
      </View>

      <View>
        <FormLabel color={C.sub}>LINES THAT STOP HERE (OPTIONAL)</FormLabel>
        <TextInput
          value={lines}
          onChangeText={setLines}
          style={[styles.input, { backgroundColor: C.input, color: C.text }]}
          placeholder="e.g. 23, 58, 125A"
          placeholderTextColor={C.sub}
          maxLength={120}
        />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5 },
  help: { fontSize: 11.5, marginTop: 6 },
  kinds: { flexDirection: "row", gap: 8 },
  kind: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 10 },
  kindLabel: { fontSize: 13, fontWeight: "800" },
  kindSub: { fontSize: 11.5, marginTop: 2, lineHeight: 15 },
});
