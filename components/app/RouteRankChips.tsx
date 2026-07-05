// components/app/RouteRankChips.tsx
// Tradeoff chip bar for itinerary alternatives: Fastest / Cheapest /
// Least walking / Fewest transfers. Selecting a chip re-sorts the list;
// the active chip shows the winning stat ("Fastest · 32 min").
import React from "react";
import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RANKING_OPTIONS, RouteRanking, RankableRoute, rankingHeadline } from "@/utils/rankRoutes";

const ORANGE = "#FF6F00";

export default function RouteRankChips({
  routes,
  active,
  onSelect,
  dark,
}: {
  routes: RankableRoute[];
  active: RouteRanking;
  onSelect: (r: RouteRanking) => void;
  dark: boolean;
}) {
  if (routes.length < 2) return null;

  const chipBg    = dark ? "#2C2C2E" : "#F2F2F7";
  const chipText  = dark ? "#EBEBF5" : "#3A3A3C";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
    >
      {RANKING_OPTIONS.map((opt) => {
        const selected = opt.key === active;
        const headline = selected ? rankingHeadline(routes, opt.key) : null;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={({ pressed }) => [
              s.chip,
              { backgroundColor: selected ? ORANGE : chipBg, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name={opt.icon as any} size={13} color={selected ? "#FFFFFF" : chipText} />
            <Text style={[s.chipText, { color: selected ? "#FFFFFF" : chipText }]}>
              {opt.label}
              {headline ? ` · ${headline}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row:      { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip:     { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12.5, fontWeight: "700" },
});
