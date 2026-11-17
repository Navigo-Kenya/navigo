import { ScreenHeader } from "@/components/app/ScreenHeader";
import { Badge } from "@/services/contribution";
import { useContributionStore } from "@/store/contributionStore";
import { useEffect } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREY   = "#8E8E93";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function requirementHint(badge: Badge): string {
  switch (badge.requirement_type) {
    case "total_count":
      return `Make ${badge.requirement_value} total contribution${badge.requirement_value > 1 ? "s" : ""}`;
    case "type_count": {
      const type = badge.requirement_meta?.type?.replace(/_/g, " ") ?? "contributions";
      return `Submit ${badge.requirement_value} ${type}${badge.requirement_value > 1 ? "s" : ""}`;
    }
    case "approved_type_count": {
      const type = badge.requirement_meta?.type?.replace(/_/g, " ") ?? "contributions";
      return `Get ${badge.requirement_value} approved ${type}${badge.requirement_value > 1 ? "s" : ""}`;
    }
    case "points":
      return `Reach ${badge.requirement_value} Safiri Points`;
    default:
      return badge.description;
  }
}

function BadgeCard({
  badge,
  earned,
  C,
}: {
  badge: Badge;
  earned: boolean;
  C: ReturnType<typeof makeC>;
}) {
  const handlePress = () => {
    Alert.alert(
      badge.name,
      `${badge.description}\n\nHow to earn: ${requirementHint(badge)}${badge.points_bonus > 0 ? `\n\nBonus: +${badge.points_bonus} Safiri Points` : ""}${badge.earned_at ? `\n\nEarned: ${formatDate(badge.earned_at)}` : ""}`,
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        s.badgeCard,
        {
          backgroundColor: C.card,
          borderColor:     C.border,
          opacity: pressed ? 0.7 : 1,
        },
        !earned && s.badgeCardLocked,
      ]}
    >
      <View
        style={[
          s.badgeCircle,
          { backgroundColor: earned ? badge.color + "22" : C.border + "60" },
        ]}
      >
        <Icon
          name={badge.icon as any}
          size={28}
          color={earned ? badge.color : GREY}
        />
      </View>
      <Text
        style={[s.badgeName, { color: earned ? C.text : C.sub }]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>
      {earned && badge.earned_at ? (
        <Text style={[s.badgeDate, { color: C.sub }]} numberOfLines={1}>
          {formatDate(badge.earned_at)}
        </Text>
      ) : (
        <Text style={[s.badgeHint, { color: C.sub }]} numberOfLines={2}>
          {requirementHint(badge)}
        </Text>
      )}
      {!earned && (
        <View style={s.lockOverlay}>
          <Icon name="lock-closed" size={12} color={GREY} />
        </View>
      )}
    </Pressable>
  );
}

export default function BadgesScreen() {
  const dark = useColorScheme() === "dark";
  const C    = makeC(dark);

  const { badges, stats, fetch } = useContributionStore();

  useEffect(() => { fetch().catch(() => {}); }, [fetch]);

  const total   = badges.earned.length + badges.locked.length;
  const earned  = badges.earned.length;

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Safiri Badges" C={{ bg: C.bg, text: C.text, hairline: C.hairline }} />

      <ScrollView contentContainerStyle={s.body}>
        {/* Stats card */}
        <View style={[s.statsCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: C.text }]}>{stats?.level ?? 1}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Level</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: C.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: C.text }]}>{stats?.points ?? 0}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Safiri Points</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: C.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: C.text }]}>{earned} / {total}</Text>
              <Text style={[s.statLbl, { color: C.sub }]}>Badges</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[s.progressBg, { backgroundColor: C.border }]}>
            <View
              style={[
                s.progressFill,
                { width: total > 0 ? `${Math.round((earned / total) * 100)}%` : "0%" },
              ]}
            />
          </View>
          <Text style={[s.progressLabel, { color: C.sub }]}>
            {total > 0 ? `${Math.round((earned / total) * 100)}%` : "0%"} of badges collected
          </Text>
        </View>

        {/* Earned section */}
        {badges.earned.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: C.sub }]}>EARNED</Text>
            <View style={s.grid}>
              {badges.earned.map((b) => (
                <BadgeCard key={b.slug} badge={b} earned C={C} />
              ))}
            </View>
          </>
        )}

        {/* Locked section */}
        {badges.locked.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: C.sub }]}>LOCKED</Text>
            <View style={s.grid}>
              {badges.locked.map((b) => (
                <BadgeCard key={b.slug} badge={b} earned={false} C={C} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 12 },

  statsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  statItem:    { flex: 1, alignItems: "center" },
  statNum:     { fontSize: 22, fontWeight: "800" },
  statLbl:     { fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },

  progressBg: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", backgroundColor: ORANGE, borderRadius: 3 },
  progressLabel: { fontSize: 12, textAlign: "center" },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  badgeCard: {
    width: "30%",
    flexGrow: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    position: "relative",
    overflow: "hidden",
  },
  badgeCardLocked: { opacity: 0.7 },

  badgeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeName: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  badgeDate: { fontSize: 10, textAlign: "center" },
  badgeHint: { fontSize: 10, textAlign: "center", lineHeight: 14 },

  lockOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});
