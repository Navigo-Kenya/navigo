// components/contribution/TodayQuests.tsx
//
// Today on the Contribute tab: three small quests (each one something that
// helps someone else, each worth points, +5 for all three), and the streak
// as it really works: any useful act keeps it, weekends excused, freezes
// held for a missed day. Tap the streak line to choose weekdays or every
// day. Hidden on APIs without quests.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityService, type TodayQuests as Today } from "@/services/activity";
import { useContributionStore } from "@/store/contributionStore";
import { OptionSheet } from "@/components/ui/OptionSheet";
import { Icon, type IconName } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREEN = "#16A34A";
const ICE = "#0EA5E9";

type Palette = { card: string; tile: string; text: string; sub: string; line: string };

export function TodayQuests({ C }: { C: Palette }) {
  const [today, setToday] = useState<Today | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Refetch when the stats move (a contribution, a trip, a vote).
  const stamp = useContributionStore((s) => `${s.stats?.points ?? 0}:${s.stats?.streak_days ?? 0}`);

  const load = useCallback(() => {
    ActivityService.today().then(setToday).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, stamp]);

  if (!today) return null;
  const done = today.quests.filter((q) => q.done).length;
  const st = today.streak;

  const setWeekends = async (weekends: boolean) => {
    setToday((t) => (t ? { ...t, streak: { ...t.streak, weekends } } : t));
    try {
      const streak = await ActivityService.setWeekends(weekends);
      setToday((t) => (t ? { ...t, streak } : t));
      useContributionStore.getState().noteActivity(streak);
    } catch {
      load();
    }
  };

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.line }]}>
      <View style={s.head}>
        <Text style={[s.title, { color: C.text }]}>Today&apos;s quests</Text>
        <Text style={[s.count, { color: today.all_done ? GREEN : C.sub }]}>
          {today.all_done ? "All done" : `${done} of ${today.quests.length} · +${today.bonus} for all three`}
        </Text>
      </View>

      {today.quests.map((q) => (
        <View key={q.key} style={s.row}>
          <View style={[s.icon, { backgroundColor: q.done ? GREEN : ORANGE + "1A" }]}>
            <Icon name={(q.done ? "checkmark" : q.icon) as IconName} size={17} color={q.done ? "#FFFFFF" : ORANGE} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.qTitle, { color: C.text, textDecorationLine: q.done ? "line-through" : "none" }]} numberOfLines={1}>{q.title}</Text>
            <Text style={[s.qDesc, { color: C.sub }]} numberOfLines={1}>{q.desc}</Text>
            {q.target > 1 && !q.done ? (
              <View style={[s.track, { backgroundColor: C.tile }]}>
                <View style={[s.fill, { width: `${Math.round((q.progress / q.target) * 100)}%` }]} />
              </View>
            ) : null}
          </View>
          <Text style={[s.pts, { color: q.done ? GREEN : ORANGE }]}>
            {q.target > 1 && !q.done ? `${q.progress}/${q.target} · ` : ""}+{q.points}
          </Text>
        </View>
      ))}

      <Pressable onPress={() => setChoosing(true)} style={[s.streak, { borderTopColor: C.line }]} accessibilityRole="button">
        <Icon name="flame" size={15} color={ORANGE} />
        <Text style={[s.streakText, { color: C.sub }]} numberOfLines={2}>
          {st.weekends ? "Every day counts" : "Weekdays count, weekends never break it"}
          {st.freezes ? ` · ${st.freezes} freeze${st.freezes === 1 ? "" : "s"} held` : ""}
          {st.best > 1 ? ` · best ${st.best} days` : ""}
        </Text>
        {st.freezes ? <Icon name="snow" size={14} color={ICE} /> : null}
        <Icon name="chevron-forward" size={14} color={C.sub} />
      </Pressable>

      <OptionSheet
        visible={choosing}
        title="Your streak"
        subtitle="Any trip with Navigo, vote, report, review or photo keeps it. A freeze, earned every 7 days, covers a missed day on its own."
        options={[
          { value: false, label: "Weekdays", description: "A commuter's week: Saturday and Sunday never break it." },
          { value: true, label: "Every day", description: "Weekends count too, for a 7-day streak." },
        ]}
        value={st.weekends}
        onSelect={setWeekends}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingHorizontal: 14, paddingBottom: 4 },
  title: { fontSize: 16, fontWeight: "800" },
  count: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  qTitle: { fontSize: 14.5, fontWeight: "700" },
  qDesc: { fontSize: 12, marginTop: 1 },
  track: { height: 4, borderRadius: 2, marginTop: 5, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: ORANGE },
  pts: { fontSize: 13, fontWeight: "900" },
  streak: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 11, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  streakText: { flex: 1, fontSize: 12.5, fontWeight: "600" },
});
