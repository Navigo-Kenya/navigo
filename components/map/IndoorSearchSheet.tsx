// components/map/IndoorSearchSheet.tsx
//
// "Find a shop" in the venue on screen, on every floor: what's typed
// matches the directory (shops, offices, the ticket office), named spaces
// and points (toilets, ATMs). Picking one switches to its floor, selects
// it and flies there. With nothing typed: the directory, A to Z.
import type { IndoorVenue } from "@/services/venues";
import { searchVenue, type IndoorHit } from "@/utils/indoor";
import { MapSheet, type MapSheetHandle } from "@/components/app/MapSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon } from "@/components/icons/Icon";
import React, { useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";

const { height: SH } = Dimensions.get("window");
const ORANGE = "#FF6F00";

interface Props {
  venue: IndoorVenue;
  onPick: (hit: IndoorHit) => void;
  onClose: () => void;
}

export function IndoorSearchSheet({ venue, onPick, onClose }: Props) {
  const dark = useColorScheme() === "dark";
  const sheet = useRef<MapSheetHandle>(null);
  const [q, setQ] = useState("");
  const C = {
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    field: dark ? "#27272A" : "#F1F5F9",
    line: dark ? "#3F3F46" : "#E5E7EB",
  };

  const hits = useMemo<IndoorHit[]>(() => {
    if (q.trim()) return searchVenue(venue, q);
    // Nothing typed yet: the directory, A to Z, each in its space.
    const levelName = new Map(venue.levels.map((l) => [l.id, l.name]));
    const level = new Map(venue.features.features.map((f) => [f.properties.id, f.properties.level]));
    return venue.occupants
      .filter((o) => o.unit && level.has(o.unit))
      .map((o) => ({
        featureId: o.unit!,
        levelId: level.get(o.unit!)!,
        title: o.name,
        sub: [venue.labels.occupants[o.category], levelName.get(level.get(o.unit!)!)].filter(Boolean).join(" · "),
        score: 0,
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 80);
  }, [venue, q]);

  const header = (
    <View style={s.headerWrap}>
      <View style={s.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: C.text }]}>Find in {venue.venue.name}</Text>
          <Text style={[s.sub, { color: C.sub }]}>Shops, offices, toilets, ATMs, on every floor</Text>
        </View>
        <PressableScale onPress={() => sheet.current?.close()} hitSlop={12} style={[s.roundBtn, { backgroundColor: C.field }]}
          accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" size={16} color={C.sub} />
        </PressableScale>
      </View>
      <View style={[s.field, { backgroundColor: C.field }]}>
        <Icon name="search" size={17} color={C.sub} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Carrefour, toilets, ATM…"
          placeholderTextColor={C.sub}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
          style={[s.input, { color: C.text }]}
          accessibilityLabel={`Search ${venue.venue.name}`}
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityLabel="Clear">
            <Icon name="close-circle" size={17} color={C.sub} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <MapSheet ref={sheet} snapPoints={[SH * 0.55, SH * 0.88]} onClose={onClose} header={header}>
      <View style={s.body}>
        {hits.map((h) => (
          <Pressable key={`${h.featureId}:${h.title}`} onPress={() => { onPick(h); sheet.current?.close(); }}
            style={({ pressed }) => [s.row, { borderBottomColor: C.line }, pressed && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel={`${h.title}, ${h.sub}`}>
            <View style={[s.dot, { backgroundColor: ORANGE }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{h.title}</Text>
              {!!h.sub && <Text style={[s.rowSub, { color: C.sub }]} numberOfLines={1}>{h.sub}</Text>}
            </View>
            <Icon name="chevron-forward" size={16} color={C.sub} />
          </Pressable>
        ))}
        {!hits.length ? (
          <Text style={[s.empty, { color: C.sub }]}>
            {q.trim() ? `Nothing called "${q.trim()}" here.` : "The directory is empty for now."}
          </Text>
        ) : null}
        {venue.venue.source?.name ? (
          <Text style={[s.credit, { color: C.sub }]}>
            Map: {venue.venue.source.name}{venue.venue.source.captured ? ` · checked ${venue.venue.source.captured}` : ""}
          </Text>
        ) : null}
      </View>
    </MapSheet>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  sub: { fontSize: 13, fontWeight: "500", marginTop: 2 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, height: 44 },
  input: { flex: 1, fontSize: 16, fontWeight: "500", paddingVertical: 0 },
  body: { paddingHorizontal: 20, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 13, fontWeight: "500", marginTop: 1 },
  empty: { fontSize: 14, paddingVertical: 16 },
  credit: { fontSize: 12, marginTop: 18 },
});
