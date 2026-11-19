// app/(account)/leaderboard.tsx
//
// Who keeps Navigo honest. This week first (from Monday, Nairobi time, so
// everyone starts level and there's a reset to count down to), all time
// beside it.
//   - The top three on a podium, in the badge tiers' metals: Dhahabu gold,
//     Fedha silver, Shaba copper.
//   - Everyone else with their level.
//   - You, pinned at the bottom wherever you are, with what's next: "12
//     points to pass Wanjiru".
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { TIERS } from "@/components/badges/NavigoBadge";
import { LEVELS, levelFor } from "@/components/badges/levels";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { Avatar } from "@/components/leaderboard/Avatar";
import { LeagueView } from "@/components/leaderboard/LeagueView";
import { ContributionService, type Leaderboard, type LeaderboardEntry, type Standing } from "@/services/contribution";
import { useAuthStore } from "@/store/authStore";
import { useContributionStore } from "@/store/contributionStore";
import { firstName, nextStep, resetsIn } from "@/utils/leaderboard";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
type Period = "weekly" | "all";
/** The league first: the race you can win; the boards beside it. */
type Tab = "league" | Period;

function makeC(dark: boolean) {
  return {
    bg: dark ? "#0F0F10" : "#F6F7F8",
    card: dark ? "#1C1C1F" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#232326" : "#EEF0F3",
    seg: dark ? "#232326" : "#E9EAEE",
    mine: dark ? "rgba(255,111,0,0.16)" : "#FFF4EB",
    skel: dark ? "#232326" : "#ECEDF0",
  };
}
type Palette = ReturnType<typeof makeC>;

/** Podium metals, from the badge tiers. */
const METAL = { 1: TIERS[2].metal, 2: TIERS[1].metal, 3: TIERS[0].metal } as const;
const METAL_NAME = { 1: TIERS[2].name, 2: TIERS[1].name, 3: TIERS[0].name } as const;

function levelOf(e: LeaderboardEntry, period: Period) {
  if (e.level) return LEVELS[Math.min(LEVELS.length, Math.max(1, e.level)) - 1];
  return levelFor(period === "all" ? e.points : e.total_points ?? 0);
}

function Podium({ top, period, meId, C }: { top: LeaderboardEntry[]; period: Period; meId?: number; C: Palette }) {
  // 2 · 1 · 3, the middle step highest.
  const order: [LeaderboardEntry | undefined, 1 | 2 | 3][] = [[top[1], 2], [top[0], 1], [top[2], 3]];
  return (
    <View style={s.podium}>
      {order.map(([e, rank]) => {
        if (!e) return <View key={rank} style={{ flex: 1 }} />;
        const metal = METAL[rank];
        const big = rank === 1;
        return (
          <View key={rank} style={s.podItem}>
            {big ? <Icon name="trophy" size={20} color={metal[1]} style={{ marginBottom: 4 }} /> : null}
            <Avatar person={e} size={big ? 62 : 50} ring={metal[1]} />
            <Text style={[s.podName, { color: C.text }]} numberOfLines={1}>{e.id === meId ? "You" : firstName(e.name)}</Text>
            {period === "all" || e.level || e.total_points ? (
              <Text style={[s.podLevel, { color: levelOf(e, period).color }]} numberOfLines={1}>{levelOf(e, period).name}</Text>
            ) : null}
            <Text style={[s.podPts, { color: C.sub }]}>{e.points.toLocaleString()} pts</Text>
            <LinearGradient colors={[metal[0], metal[1]]} style={[s.step, { height: big ? 74 : rank === 2 ? 56 : 44 }]}>
              <Text style={s.stepRank}>{rank}</Text>
              <Text style={s.stepMetal}>{METAL_NAME[rank].toUpperCase()}</Text>
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

function RankRow({ e, rank, mine, period, C }: { e: LeaderboardEntry; rank: number; mine: boolean; period: Period; C: Palette }) {
  const lvl = levelOf(e, period);
  return (
    <View style={[s.row, mine && { backgroundColor: C.mine }]}>
      <Text style={[s.rank, { color: mine ? ORANGE : C.sub }]}>{rank}</Text>
      <Avatar person={e} size={34} ring={lvl.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, { color: mine ? ORANGE : C.text }]} numberOfLines={1}>{mine ? `${e.name} (you)` : e.name}</Text>
        <Text style={[s.level, { color: C.sub }]} numberOfLines={1}>{lvl.name}</Text>
      </View>
      <Text style={[s.pts, { color: mine ? ORANGE : C.text }]}>{e.points.toLocaleString()}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const insets = useSafeAreaInsets();
  const user = useAuthStore((st) => st.user);
  const stats = useContributionStore((st) => st.stats);

  const [tab, setTab] = useState<Tab>(user ? "league" : "weekly");
  const period: Period = tab === "all" ? "all" : "weekly";
  const [boards, setBoards] = useState<Partial<Record<Period, Leaderboard>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: Period) => {
    setError(false);
    try {
      const b = await ContributionService.getLeaderboard(p);
      setBoards((x) => ({ ...x, [p]: b }));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (tab === "league" || boards[period]) return;
    setLoading(true);
    load(period).finally(() => setLoading(false));
  }, [tab, period, boards, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  };

  const board = boards[period];
  const data = board?.data ?? [];
  const weekly = period === "weekly";
  // Older APIs don't send `me`: the profile's rank stands in.
  const me: Standing | null =
    board?.me ??
    (stats?.rank
      ? { rank: weekly ? stats.rank.weekly : stats.rank.all, points: weekly ? stats.rank.weekly_points : stats.points, ahead: null }
      : null);
  const myIndex = data.findIndex((e) => e.id === user?.id);
  const reset = weekly ? resetsIn(board?.resets_at) : null;

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Leaderboard" C={{ bg: C.bg, text: C.text, hairline: C.line }} />

      <View style={[s.seg, { backgroundColor: C.seg }]}>
        {((user ? ["league", "weekly", "all"] : ["weekly", "all"]) as Tab[]).map((p) => {
          const on = p === tab;
          return (
            <Pressable
              key={p}
              onPress={() => { Haptics.selectionAsync(); setTab(p); }}
              style={[s.segBtn, on && { backgroundColor: C.card }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.segText, { color: on ? C.text : C.sub }]}>{p === "league" ? "League" : p === "weekly" ? "This week" : "All time"}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "league" ? <LeagueView C={C} /> : null}
      {tab !== "league" && reset ? (
        <View style={s.resetRow}>
          <Icon name="time-outline" size={13} color={C.sub} />
          <Text style={[s.resetText, { color: C.sub }]}>{reset} · Monday 00:00</Text>
        </View>
      ) : null}

      {tab !== "league" ? (
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (user ? 110 : 24), flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ORANGE} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !board ? (
          <View style={{ padding: 16, gap: 12 }}>
            <View style={[s.skelPodium, { backgroundColor: C.skel }]} />
            {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.skelRow, { backgroundColor: C.skel }]} />)}
          </View>
        ) : error && !board ? (
          <View style={s.center}>
            <Icon name="cloud-offline-outline" size={40} color={C.sub} />
            <Text style={[s.centerText, { color: C.sub }]}>Couldn&apos;t load the board.</Text>
            <PressableScale onPress={() => { setLoading(true); load(period).finally(() => setLoading(false)); }} style={s.retry}>
              <Text style={s.retryText}>Try again</Text>
            </PressableScale>
          </View>
        ) : data.length === 0 ? (
          <View style={s.center}>
            <Icon name="trophy-outline" size={44} color={C.sub} />
            <Text style={[s.centerTitle, { color: C.text }]}>{weekly ? "A fresh week" : "No one yet"}</Text>
            <Text style={[s.centerText, { color: C.sub }]}>
              {weekly ? "Nobody has scored this week. One road report puts you first." : "Be the first: report a jam or review a stage."}
            </Text>
          </View>
        ) : (
          <>
            <View style={[s.podiumCard, { backgroundColor: C.card }]}>
              <Podium top={data.slice(0, 3)} period={period} meId={user?.id} C={C} />
            </View>
            {data.length > 3 ? (
              <View style={[s.list, { backgroundColor: C.card }]}>
                {data.slice(3).map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <View style={[s.sep, { backgroundColor: C.line }]} /> : null}
                    <RankRow e={e} rank={i + 4} mine={e.id === user?.id} period={period} C={C} />
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={[s.howto, { color: C.sub }]}>
              Points come from road reports, reviews, photos and fixes{weekly ? " made since Monday" : ""}. Reports the community dismisses don&apos;t count.
            </Text>
          </>
        )}
      </ScrollView>

      ) : null}

      {/* You, wherever you are on the board */}
      {tab !== "league" && user && board ? (
        <View style={[s.meBar, { backgroundColor: C.card, paddingBottom: insets.bottom + 12 }]}>
          <View style={[s.meRank, { backgroundColor: ORANGE }]}>
            <Text style={s.meRankText}>{me?.rank ? `#${me.rank}` : "–"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.meTitle, { color: C.text }]} numberOfLines={1}>
              You · {(me?.points ?? 0).toLocaleString()} pts{weekly ? " this week" : ""}
            </Text>
            <Text style={[s.meSub, { color: C.sub }]} numberOfLines={2}>
              {myIndex >= 0 && myIndex < 3 ? `On the podium, ${METAL_NAME[(myIndex + 1) as 1 | 2 | 3]}. ` : ""}
              {nextStep(me, weekly)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  seg: { flexDirection: "row", marginHorizontal: 16, marginTop: 10, padding: 4, borderRadius: 14 },
  segBtn: { flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segText: { fontSize: 14, fontWeight: "800" },
  resetRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingTop: 8 },
  resetText: { fontSize: 12.5, fontWeight: "600" },

  podiumCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 22, paddingTop: 18, paddingHorizontal: 10, overflow: "hidden" },
  podium: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  podItem: { flex: 1, alignItems: "center" },
  podName: { fontSize: 13.5, fontWeight: "800", marginTop: 6, maxWidth: "100%" },
  podPts: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  step: { width: "100%", borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: "center", justifyContent: "center" },
  stepRank: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 3 },
  stepMetal: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  podLevel: { fontSize: 11, fontWeight: "800", marginTop: 1 },

  list: { marginHorizontal: 14, marginTop: 12, borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rank: { width: 26, fontSize: 14, fontWeight: "900", textAlign: "center" },
  name: { fontSize: 14.5, fontWeight: "700" },
  level: { fontSize: 12, marginTop: 1 },
  pts: { fontSize: 15, fontWeight: "900" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 92 },
  howto: { fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 28, paddingTop: 14 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 36, paddingBottom: 40 },
  centerTitle: { fontSize: 19, fontWeight: "800" },
  centerText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retry: { marginTop: 6, paddingHorizontal: 20, height: 42, borderRadius: 21, backgroundColor: ORANGE, justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  skelPodium: { height: 200, borderRadius: 22 },
  skelRow: { height: 54, borderRadius: 14 },

  meBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  meRank: { minWidth: 52, height: 40, borderRadius: 12, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  meRankText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  meTitle: { fontSize: 15, fontWeight: "800" },
  meSub: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
});
