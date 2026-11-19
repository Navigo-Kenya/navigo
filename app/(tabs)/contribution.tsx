// app/(tabs)/contribution.tsx
//
// The Contribute tab: what you can do for the next rider, and what it earns.
//   - Your level, points and streak (tap: levels & badges), and where you
//     stand this week (tap: the leaderboard).
//   - On the road: the map's own road reports, with the type already
//     picked, and "Matatu late?" at a stage. Live for everyone nearby.
//   - Improve the map: review, photo, fix a stage, add a missing one. The
//     same forms as a stop's sheet (components/app/stop), after "Which
//     stage?" (nearby first, or search).
//   - Stages near you, with a one-tap review or photo (Google Maps' "rate
//     places you've been").
//   - Your contributions, badges, the leaderboard, and how points work.
// Every point shown comes from services/contribution, as the API awards
// it, and every contribution says thanks with the same toast (RewardToast).
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useContributionStore } from "@/store/contributionStore";
import { useMapIntentStore } from "@/store/mapIntentStore";
import {
  AUTO_APPROVED,
  CONTRIBUTION_POINTS as P,
  FIRST_PHOTO_BONUS,
  REPORT_POINTS,
} from "@/services/contribution";
import { StopService } from "@/services/stop";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import { hereWithoutAsking, type LatLng } from "@/services/here";
import { streakLine, syncStreakReminder } from "@/services/streakReminder";
import { deepen, levelProgress } from "@/components/badges/levels";
import { REPORT_TYPES, type ReportType } from "@/components/icons/reportIcons";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { StopTypeBadge } from "@/components/app/StopTypeBadge";
import { StopPickerSheet, type PickedStop } from "@/components/contribution/StopPickerSheet";
import { TodayQuests } from "@/components/contribution/TodayQuests";
import { StopReviewForm } from "@/components/app/stop/StopReviewForm";
import { StopEditForm } from "@/components/app/stop/StopEditForm";
import { StopReportForm, type ReportLine } from "@/components/app/stop/StopReportForm";
import { NewStopForm } from "@/components/app/stop/NewStopForm";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon, type IconName } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const AMBER = "#F59E0B";
const PURPLE = "#8B5CF6";
const BLUE = "#2563EB";
const GREEN = "#059669";
const RED = "#DC2626";

function makeC(dark: boolean) {
  return {
    card: dark ? "#1F1F23" : "#FFFFFF",
    tile: dark ? "#232326" : "#F6F6F8",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#2A2A2F" : "#EEF0F3",
    pressed: dark ? "#27272A" : "#F3F4F6",
  };
}
type Palette = ReturnType<typeof makeC>;

/** The road reports offered here, most common first; the rest are one tap away on the map. */
const ROAD: ReportType[] = ["traffic_jam", "accident", "police_check", "flooded_route", "road_blocked", "stage_queue"];

type Task = "review" | "photo" | "edit" | "late";
const TASKS: Record<Task, { title: string; subtitle: string; icon: IconName; color: string }> = {
  review: { title: "Review a stage", subtitle: "Which stage was it?", icon: "star", color: AMBER },
  photo: { title: "Add a photo", subtitle: "Which stage is it of?", icon: "camera", color: PURPLE },
  edit: { title: "Fix a stage", subtitle: "Which stage needs fixing?", icon: "create", color: BLUE },
  late: { title: "Matatu late?", subtitle: "Where are you waiting?", icon: "time", color: RED },
};

type Form =
  | { kind: "review"; stop: PickedStop }
  | { kind: "edit"; stop: PickedStop; landmark: string | null; lines: { id: string; short_name: string }[] }
  | { kind: "late"; stop: PickedStop; lines: ReportLine[] }
  | { kind: "new" };

/** "now" for what's approved at once, "if approved" for what a moderator checks. */
const when = (type: keyof typeof P) => (AUTO_APPROVED.includes(type) ? "now" : "if approved");

export default function ContributeScreen() {
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const router = useRouter();
  const { stats, contributions, fetch: fetchStore } = useContributionStore();

  const [near, setNear] = useState<LatLng | null>(null);
  const [nearby, setNearby] = useState<PickedStop[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(false);

  useEffect(() => { fetchStore().catch(() => {}); }, [fetchStore]);
  // Where you are, if location is already allowed: never a prompt here.
  useEffect(() => { hereWithoutAsking().then(setNear); }, []);
  useEffect(() => {
    if (!near) return;
    StopService.getNearbyStops(near.lat, near.lng, 800, 8)
      .then((list) => setNearby(list as PickedStop[]))
      .catch(() => {});
  }, [near]);
  // Tonight's streak reminder follows the latest stats (and the settings).
  useEffect(() => {
    syncStreakReminder(stats ? { streak_days: stats.streak_days, contributed_today: stats.contributed_today, streak: stats.streak } : null);
  }, [stats?.streak_days, stats?.contributed_today, stats?.streak?.weekends]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(() => contributions.filter((c) => c.status === "pending").length, [contributions]);

  const report = (type: ReportType | null) => {
    Haptics.selectionAsync();
    // The map opens its report sheet; the tab sheet makes way.
    useMapIntentStore.getState().show({ kind: "report", type });
  };

  const start = (t: Task) => {
    Haptics.selectionAsync();
    setTask(t);
  };

  /** The stop's lines and landmark, for the forms that need them. */
  const details = async (stop: PickedStop) => {
    setOpening(stop.name);
    try {
      return await StopService.getStopDetails(stop.id);
    } catch {
      return null;
    } finally {
      setOpening(null);
    }
  };

  const picked = async (t: Task, stop: PickedStop) => {
    if (t === "review") { setForm({ kind: "review", stop }); return; }
    if (t === "photo") {
      router.push({ pathname: "/(account)/add-photo", params: { stopId: stop.id, stopName: stop.name } } as any);
      return;
    }
    const d = await details(stop);
    const routes = d?.routes ?? [];
    if (t === "edit") {
      setForm({
        kind: "edit",
        stop,
        landmark: (d?.stop as any)?.landmark ?? null,
        lines: routes.map((r) => ({ id: r.id, short_name: r.short_name })),
      });
    } else {
      setForm({
        kind: "late",
        stop,
        lines: routes.map((r) => ({ route_id: r.id, short_name: r.short_name, color: r.route_color ?? null })),
      });
    }
  };

  const level = levelProgress(stats?.points ?? 0);
  const streak = stats?.streak_days ?? 0;
  const weekly = stats?.rank?.weekly ?? null;

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: C.text }]}>Contribute</Text>
          <Text style={[s.subtitle, { color: C.sub }]}>Every report, photo and fix helps the next rider.</Text>
        </View>
      </View>

      {opening ? (
        <View style={[s.opening, { backgroundColor: C.tile }]}>
          <ActivityIndicator size="small" color={ORANGE} />
          <Text style={[s.openingText, { color: C.sub }]} numberOfLines={1}>Opening {opening}…</Text>
        </View>
      ) : null}

      {/* Level, points, streak */}
      {stats ? (
        <PressableScale pressedScale={0.98} onPress={() => router.push("/(account)/badges" as any)} accessibilityRole="button" accessibilityLabel={`Level ${level.level.n}, ${level.level.name}, ${stats.points} Safiri Points. Levels and badges`}>
          <LinearGradient colors={[level.level.color, deepen(level.level.color)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={s.heroTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.heroKicker} numberOfLines={1}>LEVEL {level.level.n} · {level.level.name.toUpperCase()}</Text>
                <Text style={s.heroPoints} numberOfLines={1}>
                  {stats.points.toLocaleString()} <Text style={s.heroUnit}>Safiri Points</Text>
                </Text>
              </View>
              <View style={s.flame} accessibilityLabel={`${streak}-day streak`}>
                <Icon name="flame" size={17} color="#FFFFFF" />
                <Text style={s.flameN}>{streak}</Text>
              </View>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(level.ratio * 100)}%` }]} />
            </View>
            <View style={s.heroFoot}>
              <Text style={s.heroNext} numberOfLines={2}>
                {streakLine(streak, stats.contributed_today)}
                {level.next ? ` · ${level.toNext.toLocaleString()} to ${level.next.name}` : ""}
              </Text>
              {weekly ? (
                <Pressable onPress={() => router.push("/(account)/leaderboard" as any)} style={s.rankChip} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Number ${weekly} this week. Leaderboard`}>
                  <Icon name="trophy" size={12} color="#FFFFFF" />
                  <Text style={s.rankText}>#{weekly} this week</Text>
                </Pressable>
              ) : null}
            </View>
          </LinearGradient>
        </PressableScale>
      ) : (
        <View style={[s.heroPlaceholder, { backgroundColor: C.tile }]}>
          <ActivityIndicator color={ORANGE} />
        </View>
      )}

      {/* Today: three quests, and the streak as it works */}
      {stats ? <TodayQuests C={C} /> : null}

      {/* On the road */}
      <Section title="On the road" sub="Live for everyone nearby, gone when it clears" C={C} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roadRow}>
        {ROAD.map((t) => (
          <PressableScale key={t} onPress={() => report(t)} style={[s.roadTile, { backgroundColor: C.tile }]} accessibilityRole="button" accessibilityLabel={`Report ${REPORT_TYPES[t].label}`}>
            <ReportTypeIcon type={t} size={44} />
            <Text style={[s.roadLabel, { color: C.text }]} numberOfLines={1}>{REPORT_TYPES[t].label}</Text>
            <Text style={[s.roadPts, { color: C.sub }]}>+{REPORT_POINTS[t] ?? 2}</Text>
          </PressableScale>
        ))}
        <PressableScale onPress={() => start("late")} style={[s.roadTile, { backgroundColor: C.tile }]} accessibilityRole="button" accessibilityLabel="Matatu late at a stage">
          <View style={[s.roadGlyph, { backgroundColor: RED + "1A" }]}>
            <Icon name="time" size={22} color={RED} />
          </View>
          <Text style={[s.roadLabel, { color: C.text }]} numberOfLines={1}>Matatu late</Text>
          <Text style={[s.roadPts, { color: C.sub }]}>+{P.delay_report}</Text>
        </PressableScale>
        <PressableScale onPress={() => report(null)} style={[s.roadTile, { backgroundColor: C.tile }]} accessibilityRole="button" accessibilityLabel="All road alerts">
          <View style={[s.roadGlyph, { backgroundColor: C.line }]}>
            <Icon name="grid" size={20} color={C.sub} />
          </View>
          <Text style={[s.roadLabel, { color: C.text }]} numberOfLines={1}>All alerts</Text>
          <Text style={[s.roadPts, { color: C.sub }]}> </Text>
        </PressableScale>
      </ScrollView>

      {/* Improve the map */}
      <Section title="Improve the map" sub="Stays for every rider who comes after you" C={C} />
      <View style={s.grid}>
        <ActionCard C={C} icon="star" color={AMBER} title="Review a stage" sub="Safety, comfort, how clean" pts={`+${P.stop_review} ${when("stop_review")}`} onPress={() => start("review")} />
        <ActionCard C={C} icon="camera" color={PURPLE} title="Add a photo" sub="The sign, the queue, the shelter" pts={`+${P.stop_photo} ${when("stop_photo")}`} onPress={() => start("photo")} />
        <ActionCard C={C} icon="create" color={BLUE} title="Fix a stage" sub="Name, landmark, where it is" pts={`+${P.stop_edit} ${when("stop_edit")}`} onPress={() => start("edit")} />
        <ActionCard C={C} icon="add-circle" color={GREEN} title="Add a missing stage" sub="Where riders wait" pts={`+${P.new_stop} ${when("new_stop")}`} onPress={() => { Haptics.selectionAsync(); setForm({ kind: "new" }); }} />
      </View>

      {/* Stages near you */}
      {nearby.length > 0 ? (
        <>
          <Section title="Stages near you" sub="Been there? Tell the next rider" C={C} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nearRow}>
            {nearby.slice(0, 6).map((st) => (
              <View key={st.id} style={[s.nearCard, { backgroundColor: C.card, borderColor: C.line }]}>
                <View style={s.nearTop}>
                  <StopTypeBadge stop={st as any} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.nearName, { color: C.text }]} numberOfLines={2}>{st.name}</Text>
                    <Text style={[s.nearMeta, { color: C.sub }]} numberOfLines={1}>
                      {[near ? formatDistance(distanceM(near.lat, near.lng, st.lat, st.lng)) : null, st.route_nams].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
                <View style={s.nearBtns}>
                  <PressableScale onPress={() => { Haptics.selectionAsync(); setForm({ kind: "review", stop: st }); }} style={[s.nearBtn, { backgroundColor: AMBER + "1A" }]} accessibilityRole="button" accessibilityLabel={`Review ${st.name}`}>
                    <Icon name="star" size={14} color={AMBER} />
                    <Text style={[s.nearBtnText, { color: AMBER }]}>Review</Text>
                  </PressableScale>
                  <PressableScale onPress={() => picked("photo", st)} style={[s.nearBtn, { backgroundColor: PURPLE + "1A" }]} accessibilityRole="button" accessibilityLabel={`Add a photo of ${st.name}`}>
                    <Icon name="camera" size={14} color={PURPLE} />
                    <Text style={[s.nearBtnText, { color: PURPLE }]}>Photo</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Yours */}
      <View style={[s.card, { backgroundColor: C.card, borderColor: C.line, marginTop: 18 }]}>
        <LinkRow C={C} icon="trophy" color={AMBER} title="Leaderboard" value={weekly ? `#${weekly} this week` : "This week's top riders"} onPress={() => router.push("/(account)/leaderboard" as any)} />
        <View style={[s.sep, { backgroundColor: C.line }]} />
        <LinkRow
          C={C}
          icon="file-tray-full"
          color={BLUE}
          title="Your contributions"
          value={stats?.submissions_count ? `${stats.submissions_count} sent${pending ? ` · ${pending} waiting` : ""}` : "None yet"}
          onPress={() => router.push("/(account)/submissions" as any)}
        />
        <View style={[s.sep, { backgroundColor: C.line }]} />
        <LinkRow C={C} icon="ribbon" color={ORANGE} title="Levels & badges" value={stats ? `${stats.badges_count} earned` : ""} onPress={() => router.push("/(account)/badges" as any)} />
      </View>

      {/* How points work */}
      <Pressable onPress={() => setShowPoints((v) => !v)} style={s.pointsHead} accessibilityRole="button" accessibilityState={{ expanded: showPoints }}>
        <Icon name="information-circle-outline" size={17} color={C.sub} />
        <Text style={[s.pointsHeadText, { color: C.sub }]}>How points work</Text>
        <Icon name={showPoints ? "chevron-up" : "chevron-down"} size={15} color={C.sub} />
      </Pressable>
      {showPoints ? (
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.line, paddingVertical: 6 }]}>
          <PointsRow C={C} what="Road report" pts={`+${Math.min(...Object.values(REPORT_POINTS))} to +${Math.max(...Object.values(REPORT_POINTS))}`} when="now; accidents and floods earn most" />
          <PointsRow C={C} what="Matatu late at a stage" pts={`+${P.delay_report}`} when="now" />
          <PointsRow C={C} what="Stage review" pts={`+${P.stop_review}`} when="now" />
          <PointsRow C={C} what="Photo" pts={`+${P.stop_photo}`} when={`if approved; +${FIRST_PHOTO_BONUS} more for a stage's first photo`} />
          <PointsRow C={C} what="Fix a stage" pts={`+${P.stop_edit}`} when="each change approved" />
          <PointsRow C={C} what="Missing stage" pts={`+${P.new_stop}`} when="if approved" />
          <PointsRow C={C} what="5 people confirm your report" pts="+5" when="once per report" />
          <Text style={[s.pointsFoot, { color: C.sub }]}>
            A streak adds +1 a day to reviews and late-matatu reports, up to +7. Any trip with Navigo, vote, report, review or photo keeps it going, and weekends never break it. Daily quests pay on top.
          </Text>
        </View>
      ) : null}

      <StopPickerSheet
        visible={task !== null}
        title={task ? TASKS[task].title : ""}
        subtitle={task ? TASKS[task].subtitle : undefined}
        icon={task ? TASKS[task].icon : "location"}
        accent={task ? TASKS[task].color : ORANGE}
        near={near}
        onPick={(stop) => { if (task) picked(task, stop); }}
        onClose={() => setTask(null)}
      />
      {form?.kind === "review" ? (
        <StopReviewForm visible onClose={() => setForm(null)} stop={form.stop} onSubmitted={() => {}} />
      ) : null}
      {form?.kind === "edit" ? (
        <StopEditForm visible onClose={() => setForm(null)} stop={{ ...form.stop, landmark: form.landmark }} lines={form.lines} />
      ) : null}
      {form?.kind === "late" ? (
        <StopReportForm visible onClose={() => setForm(null)} stop={form.stop} lines={form.lines} />
      ) : null}
      {form?.kind === "new" ? <NewStopForm visible onClose={() => setForm(null)} near={near} /> : null}
    </View>
  );
}

function Section({ title, sub, C }: { title: string; sub: string; C: Palette }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: C.text }]}>{title}</Text>
      <Text style={[s.sectionSub, { color: C.sub }]}>{sub}</Text>
    </View>
  );
}

function ActionCard({ C, icon, color, title, sub, pts, onPress }: {
  C: Palette;
  icon: IconName;
  color: string;
  title: string;
  sub: string;
  pts: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} pressedScale={0.97} containerStyle={s.cardCell} style={[s.action, { backgroundColor: C.card, borderColor: C.line }]} accessibilityRole="button" accessibilityLabel={`${title}, ${pts} Safiri Points`}>
      <View style={[s.actionIcon, { backgroundColor: color + "1A" }]}>
        <Icon name={icon} size={19} color={color} />
      </View>
      <Text style={[s.actionTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[s.actionSub, { color: C.sub }]} numberOfLines={1}>{sub}</Text>
      <Text style={[s.actionPts, { color }]}>{pts}</Text>
    </PressableScale>
  );
}

function LinkRow({ C, icon, color, title, value, onPress }: {
  C: Palette;
  icon: IconName;
  color: string;
  title: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.link, { backgroundColor: pressed ? C.pressed : "transparent" }]} accessibilityRole="button" accessibilityLabel={`${title}, ${value}`}>
      <View style={[s.linkIcon, { backgroundColor: color + "1A" }]}>
        <Icon name={icon} size={17} color={color} />
      </View>
      <Text style={[s.linkTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[s.linkValue, { color: C.sub }]} numberOfLines={1}>{value}</Text>
      <Icon name="chevron-forward" size={16} color={C.sub} />
    </Pressable>
  );
}

function PointsRow({ C, what, pts, when: w }: { C: Palette; what: string; pts: string; when: string }) {
  return (
    <View style={s.pointsRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.pointsWhat, { color: C.text }]}>{what}</Text>
        <Text style={[s.pointsWhen, { color: C.sub }]}>{w}</Text>
      </View>
      <Text style={s.pointsPts}>{pts}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 14, paddingTop: 2 },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 2, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13.5, marginTop: 2 },

  opening: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 36, borderRadius: 12, marginBottom: 10 },
  openingText: { fontSize: 13, fontWeight: "600", flex: 1 },

  hero: { borderRadius: 22, padding: 16, gap: 10 },
  heroPlaceholder: { height: 132, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroKicker: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  heroPoints: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },
  heroUnit: { fontSize: 14, fontWeight: "700", letterSpacing: 0 },
  flame: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 11, height: 34, borderRadius: 17 },
  flameN: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: "#FFFFFF" },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroNext: { flex: 1, color: "#FFFFFF", fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
  rankChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.22)", paddingHorizontal: 10, height: 28, borderRadius: 14 },
  rankText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  section: { marginTop: 20, marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  sectionSub: { fontSize: 12.5, marginTop: 1 },

  roadRow: { gap: 8, paddingRight: 6 },
  roadTile: { width: 92, borderRadius: 18, paddingVertical: 12, alignItems: "center", gap: 6 },
  roadGlyph: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roadLabel: { fontSize: 12, fontWeight: "700", paddingHorizontal: 6 },
  roadPts: { fontSize: 11, fontWeight: "700", marginTop: -3 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardCell: { width: "48.5%", flexGrow: 1 },
  action: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 3 },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  actionTitle: { fontSize: 14.5, fontWeight: "800" },
  actionSub: { fontSize: 12 },
  actionPts: { fontSize: 12, fontWeight: "800", marginTop: 6 },

  nearRow: { gap: 10, paddingRight: 6 },
  nearCard: { width: 228, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 12 },
  nearTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nearName: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  nearMeta: { fontSize: 12, marginTop: 2 },
  nearBtns: { flexDirection: "row", gap: 8 },
  nearBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 12 },
  nearBtnText: { fontSize: 13, fontWeight: "800" },

  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  link: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  linkIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 15, fontWeight: "600", flexShrink: 0 },
  linkValue: { flex: 1, fontSize: 13, textAlign: "right" },

  pointsHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  pointsHeadText: { fontSize: 13, fontWeight: "700" },
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  pointsWhat: { fontSize: 14, fontWeight: "600" },
  pointsWhen: { fontSize: 12, marginTop: 1 },
  pointsPts: { fontSize: 14, fontWeight: "900", color: ORANGE },
  pointsFoot: { fontSize: 12, lineHeight: 17, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 },
});
