// app/(account)/badges.tsx
//
// Levels and badges: your level and the road to the next, then every badge
// by family, drawn by Navigo (components/badges/NavigoBadge), earned or with
// the real progress towards it. Tap a badge for what it takes.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  FAMILY_LABEL,
  FAMILY_ORDER,
  NavigoBadge,
  TIERS,
  badgeProgress,
  familyOf,
  tierOf,
  type BadgeFamily,
} from "@/components/badges/NavigoBadge";
import { LEVELS, levelProgress } from "@/components/badges/levels";
import type { Badge } from "@/services/contribution";
import { useContributionStore } from "@/store/contributionStore";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#F6F7F8",
    card: dark ? "#1C1C1F" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#2A2A2F" : "#EEF0F3",
    track: dark ? "#2A2A2F" : "#F1F5F9",
    hairline: dark ? "#2A2A2F" : "#E5E7EB",
  };
}
type P = ReturnType<typeof makeC>;

/** What a badge asks for, in plain words. */
function requirementText(b: Badge): string {
  const n = b.requirement_value;
  const s = (one: string, many: string) => (n === 1 ? one : many);
  const t = String(b.requirement_meta?.type ?? "");
  const report = t ? t.replace(/_/g, " ") : "";
  switch (b.requirement_type) {
    case "points": return `Reach ${n.toLocaleString()} Safiri Points`;
    case "total_count": return `Make ${n} ${s("contribution", "contributions")}`;
    case "report_count": return `Post ${n} road ${s("report", "reports")}`;
    case "report_type_count": return `Post ${n} ${report} ${s("report", "reports")}`;
    case "type_count":
      if (t === "stop_photo") return `Add ${n} stage ${s("photo", "photos")}`;
      if (t === "delay_report") return `Report ${n} ${s("delay", "delays")}`;
      if (t === "stop_review") return `Review ${n} ${s("stage", "stages")}`;
      return `Make ${n} ${s("contribution", "contributions")}`;
    case "approved_type_count":
      return `Get ${n} ${t === "new_stop" ? s("new stage", "new stages") : s("map edit", "map edits")} approved`;
    default: return b.description;
  }
}

export default function BadgesScreen() {
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { badges, stats, fetch, refresh } = useContributionStore();
  const [open, setOpen] = useState<Badge | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetch().catch(() => {}); }, [fetch]);

  const all = useMemo(() => [...badges.earned, ...badges.locked], [badges]);
  const byFamily = useMemo(() => {
    const m = new Map<BadgeFamily, Badge[]>();
    for (const b of all) {
      const f = familyOf(b);
      m.set(f, [...(m.get(f) ?? []), b]);
    }
    for (const list of m.values()) list.sort((a, b) => a.requirement_value - b.requirement_value);
    return m;
  }, [all]);
  const earnedSlugs = useMemo(() => new Set(badges.earned.map((b) => b.slug)), [badges.earned]);

  const points = stats?.points ?? 0;
  const { level, next, ratio, toNext } = levelProgress(points);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } catch {} finally { setRefreshing(false); }
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Levels & badges" C={{ bg: C.bg, text: C.text, hairline: C.hairline }} />
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        {/* Level */}
        <LinearGradient colors={[level.color, shadeHex(level.color)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.levelDisc}>
              <Text style={s.levelNum}>{level.n}</Text>
              <Text style={s.levelWord}>LEVEL</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.heroName}>{level.name}</Text>
              <Text style={s.heroPoints}>{points.toLocaleString()} Safiri Points</Text>
            </View>
            {stats?.streak_days ? (
              <View style={s.streak}>
                <Icon name="flame" size={14} color="#FFFFFF" />
                <Text style={s.streakText}>{stats.streak_days}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.heroTrack}>
            <View style={[s.heroFill, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
          <Text style={s.heroNext}>
            {next ? `${toNext.toLocaleString()} points to ${next.name}` : "Top level: you're a Community Elder"}
          </Text>
          {stats?.rank?.all ? (
            <PressableScale onPress={() => router.push("/(account)/leaderboard" as any)} style={s.rankChip}>
              <Icon name="trophy" size={13} color="#FFFFFF" />
              <Text style={s.rankText}>
                #{stats.rank.all} all time{stats.rank.weekly ? ` · #${stats.rank.weekly} this week` : ""}
              </Text>
              <Icon name="chevron-forward" size={13} color="#FFFFFF" />
            </PressableScale>
          ) : null}
        </LinearGradient>

        {/* The ladder */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ladder}>
          {LEVELS.map((l) => {
            const reached = points >= l.from;
            const here = l.n === level.n;
            return (
              <View key={l.n} style={[s.rung, { backgroundColor: C.card, borderColor: here ? l.color : C.line }]}>
                <View style={[s.rungDot, { backgroundColor: reached ? l.color : C.track }]}>
                  {reached ? <Icon name="checkmark" size={12} color="#FFFFFF" /> : <Text style={[s.rungN, { color: C.sub }]}>{l.n}</Text>}
                </View>
                <Text style={[s.rungName, { color: C.text }]} numberOfLines={1}>{l.name}</Text>
                <Text style={[s.rungFrom, { color: C.sub }]}>{l.from.toLocaleString()} pts</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Count */}
        <View style={s.countRow}>
          <Text style={[s.countBig, { color: C.text }]}>{badges.earned.length}</Text>
          <Text style={[s.countSub, { color: C.sub }]}> of {all.length} badges earned</Text>
        </View>

        {/* Families */}
        {FAMILY_ORDER.filter((f) => byFamily.get(f)?.length).map((f) => (
          <View key={f} style={[s.family, { backgroundColor: C.card, borderColor: C.line }]}>
            <Text style={[s.familyTitle, { color: C.text }]}>{FAMILY_LABEL[f]}</Text>
            <View style={s.grid}>
              {byFamily.get(f)!.map((b) => {
                const earned = earnedSlugs.has(b.slug);
                const tier = tierOf(b, all);
                const prog = earned ? null : badgeProgress(b, stats);
                return (
                  <Pressable
                    key={b.slug}
                    onPress={() => { Haptics.selectionAsync(); setOpen(b); }}
                    style={({ pressed }) => [s.cell, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.name}, ${earned ? "earned" : "locked"}`}
                  >
                    <NavigoBadge
                      family={f}
                      tier={tier}
                      color={b.color}
                      icon={b.icon}
                      size={70}
                      locked={!earned}
                      progress={prog ? prog.current / prog.target : null}
                    />
                    <Text style={[s.cellName, { color: earned ? C.text : C.sub }]} numberOfLines={2}>{b.name}</Text>
                    <Text style={[s.cellSub, { color: earned ? TIERS[tier - 1].metal[1] : C.sub }]} numberOfLines={1}>
                      {earned ? TIERS[tier - 1].name : prog ? `${prog.current}/${prog.target}` : `Tier ${tier}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {all.length === 0 ? (
          <Text style={[s.empty, { color: C.sub }]}>{"Badges load when you're online."}</Text>
        ) : null}

        <Text style={[s.legend, { color: C.sub }]}>
          Tiers: {TIERS.map((t) => t.name).join(" · ")} — copper to star, in Swahili. The bead rim grows with each tier.
        </Text>
      </ScrollView>

      <BadgeModal badge={open} all={all} earned={open ? earnedSlugs.has(open.slug) : false} C={C} onClose={() => setOpen(null)} />
    </View>
  );
}

function BadgeModal({ badge, all, earned, C, onClose }: {
  badge: Badge | null;
  all: Badge[];
  earned: boolean;
  C: P;
  onClose: () => void;
}) {
  const stats = useContributionStore((st) => st.stats);
  if (!badge) return null;
  const f = familyOf(badge);
  const tier = tierOf(badge, all);
  const prog = earned ? null : badgeProgress(badge, stats);
  const earnedAt = badge.earned_at ?? all.find((b) => b.slug === badge.slug)?.earned_at ?? null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.modalWrap} onPress={onClose}>
        <Pressable style={[s.modalCard, { backgroundColor: C.card }]} onPress={() => {}}>
          <NavigoBadge family={f} tier={tier} color={badge.color} icon={badge.icon} size={132} locked={!earned} progress={prog ? prog.current / prog.target : null} />
          <Text style={[s.modalName, { color: C.text }]}>{badge.name}</Text>
          <Text style={[s.modalTier, { color: TIERS[tier - 1].metal[1] }]}>
            {FAMILY_LABEL[f]} · {TIERS[tier - 1].name}
          </Text>
          <Text style={[s.modalDesc, { color: C.sub }]}>{badge.description}</Text>
          <View style={[s.req, { backgroundColor: C.track }]}>
            <Icon name={earned ? "checkmark-circle" : "flag"} size={16} color={earned ? "#16A34A" : ORANGE} />
            <Text style={[s.reqText, { color: C.text }]}>{requirementText(badge)}</Text>
          </View>
          {prog ? (
            <View style={{ alignSelf: "stretch", gap: 6 }}>
              <View style={[s.track, { backgroundColor: C.track }]}>
                <View style={[s.fill, { width: `${Math.round((prog.current / prog.target) * 100)}%` }]} />
              </View>
              <Text style={[s.progText, { color: C.sub }]}>{prog.current} of {prog.target}</Text>
            </View>
          ) : null}
          <Text style={[s.modalFoot, { color: C.sub }]}>
            {earned
              ? earnedAt ? `Earned ${new Date(earnedAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}` : "Earned"
              : badge.points_bonus ? `+${badge.points_bonus} bonus points when you earn it` : "Keep contributing to earn it"}
          </Text>
          <PressableScale onPress={onClose} style={[s.closeBtn, { backgroundColor: ORANGE }]}>
            <Text style={s.closeText}>Close</Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function shadeHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * 0.62);
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, gap: 14 },
  hero: { borderRadius: 24, padding: 18, gap: 12 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  levelDisc: { width: 62, height: 62, borderRadius: 31, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  levelNum: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", lineHeight: 28 },
  levelWord: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, opacity: 0.9 },
  heroName: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  heroPoints: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600", marginTop: 2 },
  streak: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 10, height: 30, borderRadius: 15 },
  streakText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  heroTrack: { height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  heroFill: { height: "100%", borderRadius: 5, backgroundColor: "#FFFFFF" },
  heroNext: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  rankChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 12, height: 32, borderRadius: 16 },
  rankText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  ladder: { gap: 8, paddingRight: 6 },
  rung: { width: 112, borderRadius: 16, borderWidth: 1.5, padding: 10, gap: 4 },
  rungDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rungN: { fontSize: 12, fontWeight: "800" },
  rungName: { fontSize: 13, fontWeight: "700" },
  rungFrom: { fontSize: 11.5 },
  countRow: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: 4 },
  countBig: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  countSub: { fontSize: 15, fontWeight: "600" },
  family: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  familyTitle: { fontSize: 16, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  cell: { width: "33.33%", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  cellName: { fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  cellSub: { fontSize: 11.5, fontWeight: "700" },
  empty: { textAlign: "center", paddingVertical: 24 },
  legend: { fontSize: 12, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 26, padding: 22, alignItems: "center", gap: 10 },
  modalName: { fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 4 },
  modalTier: { fontSize: 13.5, fontWeight: "800" },
  modalDesc: { fontSize: 14.5, textAlign: "center", lineHeight: 20 },
  req: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch", padding: 12, borderRadius: 14 },
  reqText: { fontSize: 14.5, fontWeight: "700", flex: 1 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: ORANGE },
  progText: { fontSize: 12.5, textAlign: "right" },
  modalFoot: { fontSize: 13, textAlign: "center" },
  closeBtn: { marginTop: 6, height: 46, alignSelf: "stretch", borderRadius: 23, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
