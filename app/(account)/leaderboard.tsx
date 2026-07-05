// app/(account)/leaderboard.tsx
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { ContributionService } from "@/services/contribution";
import { useAuthStore } from "@/store/authStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";
const GOLD   = "#F59E0B";
const SILVER = "#9CA3AF";
const BRONZE = "#B45309";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    border:   dark ? "#2C2C2E" : "#E5E7EB",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    ownRow:   dark ? "rgba(255,111,0,0.14)" : "#FFF3E0",
  };
}

type Entry = { id: number; name: string; avatar: string | null; points: number };

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ entry, size }: { entry: Entry; size: number }) {
  const showImg = entry.avatar && !entry.avatar.startsWith("data:");
  return showImg ? (
    <Image
      source={{ uri: entry.avatar! }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
    />
  ) : (
    <View
      style={[
        a.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: ORANGE },
      ]}
    >
      <Text style={[a.fallbackText, { fontSize: size * 0.36 }]}>{initials(entry.name)}</Text>
    </View>
  );
}

const a = StyleSheet.create({
  fallback:     { alignItems: "center", justifyContent: "center" },
  fallbackText: { color: "#FFF", fontWeight: "700" },
});

function PodiumStep({
  entry,
  rank,
  height,
  avatarSize,
  color,
  C,
}: {
  entry: Entry | undefined;
  rank: number;
  height: number;
  avatarSize: number;
  color: string;
  C: ReturnType<typeof makeC>;
}) {
  if (!entry) return <View style={{ flex: 1 }} />;
  const medal = rank === 1 ? "trophy" : "medal-outline";

  return (
    <View style={p.item}>
      <View style={p.topSection}>
        <Ionicons name={medal as any} size={rank === 1 ? 20 : 16} color={color} style={{ marginBottom: 4 }} />
        <View style={[p.avatarRing, { borderColor: color }]}>
          <Avatar entry={entry} size={avatarSize} />
        </View>
        <Text style={[p.name, { color: C.text }]} numberOfLines={1}>{entry.name}</Text>
        <Text style={[p.pts, { color: color }]}>{entry.points.toLocaleString()} pts</Text>
      </View>
      <View style={[p.step, { height, backgroundColor: color + "28", borderTopColor: color }]}>
        <Text style={[p.rank, { color }]}>#{rank}</Text>
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  item:       { flex: 1, alignItems: "center" },
  topSection: { alignItems: "center", paddingBottom: 10 },
  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 2, marginBottom: 6 },
  name:       { fontSize: 12, fontWeight: "700", maxWidth: 90, textAlign: "center" },
  pts:        { fontSize: 11, fontWeight: "600", marginTop: 2 },
  step:       { width: "100%", borderTopLeftRadius: 10, borderTopRightRadius: 10, borderTopWidth: 2, alignItems: "center", justifyContent: "center" },
  rank:       { fontSize: 18, fontWeight: "800" },
});

function RankRow({
  entry,
  rank,
  isOwn,
  C,
}: {
  entry: Entry;
  rank: number;
  isOwn: boolean;
  C: ReturnType<typeof makeC>;
}) {
  return (
    <View style={[r.row, { borderBottomColor: C.border }, isOwn && { backgroundColor: C.ownRow }]}>
      <Text style={[r.rank, { color: C.sub }]}>#{rank}</Text>
      <Avatar entry={entry} size={32} />
      <Text style={[r.name, { color: C.text }, isOwn && { color: ORANGE }]} numberOfLines={1}>
        {entry.name}
        {isOwn ? "  (You)" : ""}
      </Text>
      <Text style={[r.pts, { color: isOwn ? ORANGE : C.sub }]}>
        {entry.points.toLocaleString()} pts
      </Text>
    </View>
  );
}

const r = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 30, fontSize: 13, fontWeight: "700", textAlign: "center" },
  name: { flex: 1, fontSize: 14, fontWeight: "500" },
  pts:  { fontSize: 13, fontWeight: "700" },
});

export default function LeaderboardScreen() {
  const dark = useColorScheme() === "dark";
  const C    = makeC(dark);
  const { user } = useAuthStore();

  const [period, setPeriod]   = useState<"all" | "weekly">("all");
  const [data, setData]       = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const load = (p: "all" | "weekly" = period) => {
    setLoading(true);
    setError(false);
    ContributionService.getLeaderboard(p)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(period); }, [period]);

  const [second, first, third] = [data[1], data[0], data[2]];
  const rest = data.slice(3);

  return (
    <View style={[ls.root, { backgroundColor: C.bg }]}>
      <ScreenHeader
        title="Community Leaderboard"
        C={{ bg: C.card, text: C.text, hairline: C.hairline }}
      />

      {loading ? (
        <View style={ls.center}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : error ? (
        <View style={ls.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={C.sub} />
          <Text style={[ls.errorText, { color: C.sub }]}>Could not load leaderboard</Text>
          <Pressable style={ls.retryBtn} onPress={load}>
            <Text style={ls.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : data.length === 0 ? (
        <View style={ls.center}>
          <Ionicons name="trophy-outline" size={40} color={C.sub} />
          <Text style={[ls.errorText, { color: C.sub }]}>No entries yet</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Period tabs */}
          <View style={[ls.tabs, { backgroundColor: C.card }]}>
            {(["all", "weekly"] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[ls.tab, period === p && { backgroundColor: ORANGE }]}
              >
                <Text style={[ls.tabText, { color: period === p ? "#FFF" : C.sub }]}>
                  {p === "all" ? "All Time" : "This Week"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Podium */}
          <View style={[ls.podiumWrapper, { backgroundColor: C.card }]}>
            <Text style={[ls.podiumTitle, { color: C.sub }]}>
              {period === "weekly" ? "TOP THIS WEEK" : "TOP CONTRIBUTORS"}
            </Text>
            <View style={ls.podium}>
              <PodiumStep entry={second} rank={2} height={72}  avatarSize={44} color={SILVER} C={C} />
              <PodiumStep entry={first}  rank={1} height={100} avatarSize={56} color={GOLD}   C={C} />
              <PodiumStep entry={third}  rank={3} height={56}  avatarSize={40} color={BRONZE} C={C} />
            </View>
          </View>

          {/* Ranked list */}
          {rest.length > 0 && (
            <View style={[ls.listCard, { backgroundColor: C.card, borderColor: C.border }]}>
              {rest.map((entry, i) => (
                <RankRow
                  key={entry.id}
                  entry={entry}
                  rank={i + 4}
                  isOwn={entry.id === user?.id}
                  C={C}
                />
              ))}
            </View>
          )}

          {/* Current user's own position if in top 3 */}
          {data.slice(0, 3).some((e) => e.id === user?.id) && (
            <Text style={[ls.ownNote, { color: ORANGE }]}>
              You're in the top 3!
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const ls = StyleSheet.create({
  root:         { flex: 1 },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText:    { fontSize: 15, fontWeight: "500" },
  retryBtn:     { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: ORANGE, borderRadius: 10 },
  retryText:    { color: "#FFF", fontWeight: "700", fontSize: 14 },
  tabs:         { flexDirection: "row", marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 4, gap: 4 },
  tab:          { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  tabText:      { fontSize: 13, fontWeight: "600" },
  podiumWrapper:{ marginHorizontal: 16, marginTop: 10, borderRadius: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0, overflow: "hidden" },
  podiumTitle:  { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textAlign: "center", marginBottom: 16 },
  podium:       { flexDirection: "row", alignItems: "flex-end", gap: 8, minHeight: 200 },
  listCard:     { marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  ownNote:      { textAlign: "center", fontWeight: "700", fontSize: 13, marginTop: 12 },
});
