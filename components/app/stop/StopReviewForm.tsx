// components/app/stop/StopReviewForm.tsx
//
// Write / edit a stop review: an overall rating, the three aspects the app
// has always stored (safety, comfort, cleanliness: averages depend on them),
// quick tags riders care about, and a comment. One review per user per stop
// (the API upserts).
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useContributionStore } from "@/store/contributionStore";
import { CONTRIBUTION_POINTS, type StopReview } from "@/services/contribution";
import { showReward } from "@/store/rewardStore";
import { FormLabel, FormSheet, formColors } from "./FormSheet";
import { Icon } from "@/components/icons/Icon";

const AMBER = "#F59E0B";
const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export const REVIEW_TAGS: { key: string; label: string; good: boolean }[] = [
  { key: "safe_night", label: "Safe at night", good: true },
  { key: "well_lit", label: "Well lit", good: true },
  { key: "shelter", label: "Covered shelter", good: true },
  { key: "clean", label: "Clean", good: true },
  { key: "easy_find", label: "Easy to find", good: true },
  { key: "frequent", label: "Frequent matatus", good: true },
  { key: "touts", label: "Touts", good: false },
  { key: "crowded", label: "Crowded", good: false },
  { key: "pickpockets", label: "Pickpockets", good: false },
  { key: "no_shelter", label: "No shelter", good: false },
  { key: "poor_light", label: "Poor lighting", good: false },
  { key: "flooding", label: "Floods when it rains", good: false },
];

type Aspect = "safety" | "comfort" | "cleanliness";
const ASPECTS: { key: Aspect; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "safety", label: "Safety", icon: "shield-checkmark-outline" },
  { key: "comfort", label: "Comfort", icon: "happy-outline" },
  { key: "cleanliness", label: "Cleanliness", icon: "sparkles-outline" },
];

export function StopReviewForm({
  visible,
  onClose,
  stop,
  existing,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  stop: { id: string; name: string };
  existing?: StopReview;
  onSubmitted: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const C = formColors(dark);
  const { submit } = useContributionStore();
  const d = existing?.data as (StopReview["data"] & { overall?: number; tags?: string[] }) | undefined;

  const [overall, setOverall] = useState(d?.overall ?? 0);
  const [aspects, setAspects] = useState<Record<Aspect, number>>({
    safety: d?.safety ?? 0,
    comfort: d?.comfort ?? 0,
    cleanliness: d?.cleanliness ?? 0,
  });
  const [tags, setTags] = useState<string[]>(d?.tags ?? []);
  const [text, setText] = useState(d?.text ?? "");
  const [loading, setLoading] = useState(false);

  const setOverallAndFill = (n: number) => {
    Haptics.selectionAsync();
    setOverall(n);
    // Untouched aspects follow the overall rating (one tap reviews).
    setAspects((a) => ({
      safety: a.safety || n,
      comfort: a.comfort || n,
      cleanliness: a.cleanliness || n,
    }));
  };

  const ready = overall > 0 && aspects.safety > 0 && aspects.comfort > 0 && aspects.cleanliness > 0;

  const handleSubmit = async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const res = await submit({
        type: "stop_review",
        stop_id: stop.id,
        title: `Review: ${stop.name}`,
        data: { overall, ...aspects, tags, text: text.trim() || undefined } as any,
      });
      onSubmitted();
      onClose();
      showReward({
        points: res.points_awarded,
        badges: res.new_badges,
        streak: res.streak_days,
        title: existing ? "Review updated" : "Review posted",
        quests: res.quests_done,
      });
    } catch {
      Alert.alert("Couldn't send your review", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={existing ? "Edit your review" : "Review this stop"}
      subtitle={stop.name}
      icon="star"
      accent={AMBER}
      submitLabel={existing ? "Update review" : "Post review"}
      submitting={loading}
      submitDisabled={!ready}
      onSubmit={handleSubmit}
      footerHint={
        existing
          ? "Your review is updated for everyone."
          : `+${CONTRIBUTION_POINTS.stop_review} Safiri Points · visible to other riders`
      }
    >
      {/* Overall */}
      <View style={[styles.overallCard, { backgroundColor: C.card }]}>
        <Stars value={overall} onSet={setOverallAndFill} size={36} idle={C.sub} />
        <Text style={[styles.overallWord, { color: overall ? AMBER : C.sub }]}>
          {overall ? RATING_WORDS[overall] : "Tap to rate"}
        </Text>
      </View>

      {/* Aspects */}
      <View>
        <FormLabel color={C.sub}>THE DETAILS</FormLabel>
        <View style={[styles.aspectCard, { backgroundColor: C.card }]}>
          {ASPECTS.map((a, i) => (
            <View
              key={a.key}
              style={[styles.aspectRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }]}
            >
              <Icon name={a.icon} size={17} color={C.sub} />
              <Text style={[styles.aspectLabel, { color: C.text }]}>{a.label}</Text>
              <Stars
                value={aspects[a.key]}
                onSet={(n) => {
                  Haptics.selectionAsync();
                  setAspects((s) => ({ ...s, [a.key]: n }));
                }}
                size={22}
                idle={C.sub}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Tags */}
      <View>
        <FormLabel color={C.sub}>WHAT STANDS OUT? (OPTIONAL)</FormLabel>
        <View style={styles.tags}>
          {REVIEW_TAGS.map((t) => {
            const on = tags.includes(t.key);
            const color = t.good ? "#16A34A" : "#DC2626";
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTags((s) => (on ? s.filter((k) => k !== t.key) : [...s, t.key]));
                }}
                style={[
                  styles.tag,
                  { borderColor: on ? color : C.line, backgroundColor: on ? color + "18" : "transparent" },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                {on && <Icon name="checkmark" size={13} color={color} />}
                <Text style={[styles.tagText, { color: on ? color : C.text }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Comment */}
      <View>
        <FormLabel color={C.sub}>TELL OTHER RIDERS (OPTIONAL)</FormLabel>
        <TextInput
          style={[styles.textArea, { backgroundColor: C.input, color: C.text }]}
          placeholder="Where exactly to wait, which side to board, anything to watch out for…"
          placeholderTextColor={C.sub}
          multiline
          value={text}
          onChangeText={setText}
          maxLength={400}
        />
        <Text style={[styles.counter, { color: C.sub }]}>{text.length}/400</Text>
      </View>
    </FormSheet>
  );
}

export function Stars({
  value,
  onSet,
  size,
  idle,
}: {
  value: number;
  onSet?: (n: number) => void;
  size: number;
  idle: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: size > 26 ? 6 : 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = n <= value ? "star" : n - 0.5 <= value ? "star-half" : "star-outline";
        const star = <Icon name={icon as any} size={size} color={n - 0.5 <= value ? AMBER : idle} />;
        return onSet ? (
          <Pressable key={n} onPress={() => onSet(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} stars`}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overallCard: { alignItems: "center", gap: 8, paddingVertical: 18, borderRadius: 16 },
  overallWord: { fontSize: 15, fontWeight: "800" },
  aspectCard: { borderRadius: 14, paddingHorizontal: 14 },
  aspectRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  aspectLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  tagText: { fontSize: 12.5, fontWeight: "600" },
  textArea: { minHeight: 90, borderRadius: 14, padding: 12, fontSize: 14, textAlignVertical: "top" },
  counter: { fontSize: 11, textAlign: "right", marginTop: 4 },
});
