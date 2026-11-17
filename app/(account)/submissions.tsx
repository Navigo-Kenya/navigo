import { ScreenHeader } from "@/components/app/ScreenHeader";
import { Contribution } from "@/services/contribution";
import { useContributionStore } from "@/store/contributionStore";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const GREY   = "#8E8E93";

function makeC(dark: boolean) {
  return {
    bg:       dark ? "#0F0F0F" : "#F6F7F8",
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? GREY      : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
    border:   dark ? "#3A3A3C" : "#E5E7EB",
    pill:     dark ? "#2C2C2E" : "#F3F4F6",
    pillActive: dark ? ORANGE + "22" : "#FFF3E0",
  };
}

type FilterKey = "all" | "pending" | "approved" | "rejected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "pending",  label: "Pending"  },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function typeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "delay_report":     return "time-outline";
    case "stop_review":      return "chatbubbles-outline";
    case "stop_photo":       return "camera-outline";
    case "stop_edit":        return "create-outline";
    case "route_correction": return "git-merge-outline";
    case "new_stop":         return "location-outline";
    default:                 return "ellipse-outline";
  }
}

function typeColor(type: string): string {
  switch (type) {
    case "delay_report":     return RED;
    case "stop_review":      return "#F59E0B";
    case "stop_photo":       return "#8B5CF6";
    case "stop_edit":        return "#3B82F6";
    case "route_correction": return "#3B82F6";
    case "new_stop":         return GREEN;
    default:                 return GREY;
  }
}

function statusColor(status: string): string {
  if (status === "approved" || status === "auto_approved") return GREEN;
  if (status === "rejected") return RED;
  return "#F59E0B";
}

function statusLabel(status: string): string {
  if (status === "approved" || status === "auto_approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function SubmissionsScreen() {
  const dark = useColorScheme() === "dark";
  const C    = makeC(dark);

  const { contributions, loaded, fetch, refresh, removeContribution } = useContributionStore();
  const [filter, setFilter]       = useState<FilterKey>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetch().catch(() => {}); }, [fetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const visible = contributions.filter((c) => {
    if (filter === "all") return true;
    if (filter === "approved") return c.status === "approved" || c.status === "auto_approved";
    return c.status === filter;
  });

  const handleLongPress = (item: Contribution) => {
    if (item.status !== "pending") return;
    Alert.alert("Delete submission", "Remove this pending submission?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          removeContribution(item.id).catch(() =>
            Alert.alert("Error", "Could not delete. Please try again.")
          ),
      },
    ]);
  };

  const renderItem = ({ item }: { item: Contribution }) => {
    const color = typeColor(item.type);
    const sc    = statusColor(item.status);

    return (
      <Pressable
        onLongPress={() => handleLongPress(item)}
        style={({ pressed }) => [
          s.row,
          { borderBottomColor: C.hairline, backgroundColor: pressed ? C.pill : C.card },
        ]}
      >
        <View style={[s.iconCircle, { backgroundColor: color + "18" }]}>
          <Icon name={typeIcon(item.type)} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
            {item.title ?? item.type.replace(/_/g, " ")}
          </Text>
          {item.stop?.name && (
            <Text style={[s.rowStop, { color: C.sub }]} numberOfLines={1}>
              {item.stop.name}
            </Text>
          )}
          <View style={s.rowMeta}>
            <View style={[s.statusBadge, { backgroundColor: sc + "18" }]}>
              <Text style={[s.statusText, { color: sc }]}>{statusLabel(item.status)}</Text>
            </View>
            {item.points_awarded > 0 && (
              <View style={[s.statusBadge, { backgroundColor: GREEN + "18" }]}>
                <Text style={[s.statusText, { color: GREEN }]}>+{item.points_awarded} pts</Text>
              </View>
            )}
            <Text style={[s.rowTime, { color: C.sub }]}>{relativeTime(item.created_at)}</Text>
          </View>
        </View>
        {item.status === "pending" && (
          <Icon name="ellipsis-horizontal" size={16} color={C.sub} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <ScreenHeader title="Your Submissions" C={{ bg: C.bg, text: C.text, hairline: C.hairline }} />

      {/* Filter pills */}
      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[
              s.filterPill,
              {
                backgroundColor: filter === f.key ? C.pillActive : C.pill,
                borderColor:     filter === f.key ? ORANGE       : "transparent",
              },
            ]}
          >
            <Text
              style={[s.filterText, { color: filter === f.key ? ORANGE : C.sub }]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[
          s.listContent,
          visible.length === 0 && { flex: 1 },
        ]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="checkmark-circle-outline" size={48} color={C.sub} />
            <Text style={[s.emptyText, { color: C.sub }]}>
              {loaded ? "No submissions here" : "Loading…"}
            </Text>
            {filter !== "all" && (
              <Text style={[s.emptySub, { color: C.sub }]}>
                Try switching the filter above.
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  filters: {
    flexDirection:   "row",
    gap:             8,
    paddingHorizontal: 16,
    paddingVertical:  12,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius:    999,
    alignItems:      "center",
    borderWidth:     1,
  },
  filterText: { fontSize: 13, fontWeight: "600" },

  listContent: { paddingBottom: 40 },

  row: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width:  38,
    height: 38,
    borderRadius: 19,
    alignItems:  "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  rowStop:  { fontSize: 12, marginBottom: 4 },
  rowMeta:  { flexDirection: "row", alignItems: "center", gap: 6 },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      6,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  rowTime:    { fontSize: 12 },

  empty:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySub:  { fontSize: 13, textAlign: "center" },
});
