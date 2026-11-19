// components/leaderboard/LeagueView.tsx
//
// Your league this week (the leaderboard's first tab): a race you can win.
//   - The league in its metal (Shaba copper … Nyota), with the five on a
//     ladder and when the week resets.
//   - Last week's result, once: "You moved up to Dhahabu League".
//   - Your group of up to 30: the promotion zone at the top (green), the
//     drop zone at the bottom (red), you highlighted.
//   - You, pinned at the bottom: hold on, climb, or get out of the drop zone.
import { TIERS } from "@/components/badges/NavigoBadge";
import { LEVELS } from "@/components/badges/levels";
import { Icon } from "@/components/icons/Icon";
import { ContributionService, type League, type LeagueMember } from "@/services/contribution";
import { leagueLine, resetsIn } from "@/utils/leaderboard";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "./Avatar";

const ORANGE = "#FF6F00";
const GREEN = "#16A34A";
const RED = "#DC2626";

type Palette = { bg: string; card: string; text: string; sub: string; line: string; skel: string; mine: string };

const metalOf = (tier: number) => TIERS[Math.min(5, Math.max(1, tier)) - 1].metal;

function Row({ m, zone, C }: { m: LeagueMember; zone: "up" | "safe" | "down"; C: Palette }) {
  const color = zone === "up" ? GREEN : zone === "down" ? RED : C.sub;
  const level = LEVELS[Math.min(LEVELS.length, Math.max(1, m.level)) - 1];
  return (
    <View style={[s.row, m.me && { backgroundColor: C.mine }]}>
      <View style={s.rankCol}>
        <Text style={[s.rank, { color: m.me ? ORANGE : color }]}>{m.rank}</Text>
        {zone !== "safe" ? <Icon name={zone === "up" ? "caret-up" : "caret-down"} size={10} color={color} /> : null}
      </View>
      <Avatar person={m} size={34} ring={level.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, { color: m.me ? ORANGE : C.text }]} numberOfLines={1}>{m.me ? `${m.name} (you)` : m.name}</Text>
        <Text style={[s.level, { color: C.sub }]} numberOfLines={1}>{level.name}</Text>
      </View>
      <Text style={[s.pts, { color: m.me ? ORANGE : C.text }]}>{m.points.toLocaleString()}</Text>
    </View>
  );
}

function ZoneLine({ label, color, icon }: { label: string; color: string; icon: "caret-up" | "caret-down" }) {
  return (
    <View style={s.zoneLine}>
      <View style={[s.zoneRule, { backgroundColor: color }]} />
      <Icon name={icon} size={11} color={color} />
      <Text style={[s.zoneText, { color }]}>{label}</Text>
      <View style={[s.zoneRule, { backgroundColor: color }]} />
    </View>
  );
}

export function LeagueView({ C }: { C: Palette }) {
  const insets = useSafeAreaInsets();
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLeague(await ContributionService.getLeague());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dismissResult = () => {
    Haptics.selectionAsync();
    setLeague((l) => (l ? { ...l, last_week: null } : l));
    ContributionService.leagueSeen().catch(() => {});
  };

  if (!league) {
    return error ? (
      <View style={s.center}>
        <Icon name="cloud-offline-outline" size={40} color={C.sub} />
        <Text style={[s.centerText, { color: C.sub }]}>Couldn&apos;t load your league.</Text>
        <Pressable onPress={load} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable>
      </View>
    ) : (
      <ActivityIndicator style={{ marginTop: 40 }} color={ORANGE} />
    );
  }

  const metal = metalOf(league.tier);
  const reset = resetsIn(league.resets_at);
  const last = league.last_week;
  const zoneOf = (rank: number): "up" | "safe" | "down" =>
    rank <= league.up ? "up" : rank > league.size - league.down ? "down" : "safe";

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ORANGE} />}
        showsVerticalScrollIndicator={false}
      >
        {/* The league, in its metal */}
        <LinearGradient colors={[metal[0], metal[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={s.kicker}>THIS WEEK&apos;S LEAGUE</Text>
          <Text style={s.leagueName}>{league.name} League</Text>
          <Text style={s.heroSub}>
            {[reset, league.joined ? `${league.size} in your group` : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={s.ladder}>
            {TIERS.map((t, i) => {
              const n = i + 1;
              const here = n === league.tier;
              return (
                <View key={t.key} style={s.rung}>
                  <LinearGradient
                    colors={[t.metal[0], t.metal[1]]}
                    style={[s.medal, { opacity: n <= league.tier ? 1 : 0.4 }, here && s.medalHere]}
                  >
                    {here ? <Icon name="star" size={11} color="#FFFFFF" /> : null}
                  </LinearGradient>
                  <Text style={[s.rungName, { opacity: here ? 1 : 0.75, fontWeight: here ? "900" : "700" }]} numberOfLines={1}>{t.name}</Text>
                </View>
              );
            })}
          </View>
        </LinearGradient>

        {/* How last week ended, once */}
        {last ? (
          <View style={[s.result, { backgroundColor: C.card, borderColor: last.outcome === "up" ? GREEN : last.outcome === "down" ? RED : C.line }]}>
            <Icon
              name={last.outcome === "up" ? "trending-up" : last.outcome === "down" ? "trending-down" : "remove"}
              size={22}
              color={last.outcome === "up" ? GREEN : last.outcome === "down" ? RED : C.sub}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.resultTitle, { color: C.text }]}>
                {last.outcome === "up" ? `You moved up to ${last.to} League!` : last.outcome === "down" ? `You're in ${last.to} League this week` : `You stayed in ${last.to} League`}
              </Text>
              <Text style={[s.resultSub, { color: C.sub }]}>
                {`#${last.rank} in ${last.from} last week, ${last.points.toLocaleString()} points.`}
                {last.outcome === "down" ? " One good week brings you back." : ""}
              </Text>
            </View>
            <Pressable onPress={dismissResult} hitSlop={10} accessibilityLabel="Dismiss">
              <Icon name="close" size={18} color={C.sub} />
            </Pressable>
          </View>
        ) : null}

        {!league.joined ? (
          <View style={[s.join, { backgroundColor: C.card }]}>
            <Icon name="flag" size={26} color={metal[1]} />
            <Text style={[s.joinTitle, { color: C.text }]}>Score this week to join a group</Text>
            <Text style={[s.joinSub, { color: C.sub }]}>
              Your first report, review or photo puts you in a {league.name} League group of up to 30 riders.
              {league.next ? ` On Monday the top of each group moves up to ${league.next}.` : ""}
            </Text>
          </View>
        ) : (
          <View style={[s.list, { backgroundColor: C.card }]}>
            {league.members.map((m) => (
              <View key={m.id}>
                {league.down > 0 && m.rank === league.size - league.down + 1 ? (
                  <ZoneLine label="DROP ZONE" color={RED} icon="caret-down" />
                ) : m.rank > 1 ? (
                  <View style={[s.sep, { backgroundColor: C.line }]} />
                ) : null}
                <Row m={m} zone={zoneOf(m.rank)} C={C} />
                {league.up > 0 && m.rank === league.up && league.size > league.up ? (
                  <ZoneLine label={league.next ? `MOVES UP TO ${league.next.toUpperCase()}` : "PROMOTION ZONE"} color={GREEN} icon="caret-up" />
                ) : null}
              </View>
            ))}
          </View>
        )}

        <Text style={[s.howto, { color: C.sub }]}>
          Groups of up to 30 in each league, Shaba to Nyota. Every Monday the top move up and the bottom move down.
          Points come from road reports, reviews, photos and fixes made that week.
        </Text>
      </ScrollView>

      {/* You, and what your week comes to */}
      <View style={[s.meBar, { backgroundColor: C.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={[s.meRank, { backgroundColor: league.me?.zone === "up" ? GREEN : league.me?.zone === "down" ? RED : ORANGE }]}>
          <Text style={s.meRankText}>{league.me ? `#${league.me.rank}` : "–"}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.meTitle, { color: C.text }]} numberOfLines={1}>
            You · {(league.me?.points ?? 0).toLocaleString()} pts this week
          </Text>
          <Text style={[s.meSub, { color: C.sub }]} numberOfLines={2}>{leagueLine(league)}</Text>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 22, padding: 16, gap: 4 },
  kicker: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  leagueName: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.2)", textShadowRadius: 4 },
  heroSub: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", opacity: 0.95 },
  ladder: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, backgroundColor: "rgba(0,0,0,0.14)", borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6 },
  rung: { alignItems: "center", gap: 4, flex: 1 },
  medal: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  medalHere: { width: 32, height: 32, borderRadius: 16, borderColor: "#FFFFFF", borderWidth: 3 },
  rungName: { color: "#FFFFFF", fontSize: 10.5 },

  result: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5 },
  resultTitle: { fontSize: 15.5, fontWeight: "800" },
  resultSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },

  join: { alignItems: "center", gap: 8, padding: 22, borderRadius: 20 },
  joinTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  joinSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  list: { borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rankCol: { width: 26, alignItems: "center" },
  rank: { fontSize: 14, fontWeight: "900" },
  name: { fontSize: 14.5, fontWeight: "700" },
  level: { fontSize: 12, marginTop: 1 },
  pts: { fontSize: 15, fontWeight: "900" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 92 },
  zoneLine: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  zoneRule: { flex: 1, height: 1.5, borderRadius: 1, opacity: 0.6 },
  zoneText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },

  howto: { fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 20 },

  center: { alignItems: "center", gap: 10, paddingTop: 50, paddingHorizontal: 36 },
  centerText: { fontSize: 14, textAlign: "center" },
  retry: { paddingHorizontal: 20, height: 42, borderRadius: 21, backgroundColor: ORANGE, justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontWeight: "800" },

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
