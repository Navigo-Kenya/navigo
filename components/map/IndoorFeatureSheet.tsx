// components/map/IndoorFeatureSheet.tsx
//
// A space, door or point tapped on the indoor map: what it is, on which
// floor, step-free or not, and who is there from the venue's directory
// (hours, phone, website). Draggable (MapSheet), no backdrop, so the map
// stays usable.
import type { IndoorOccupant, IndoorVenue } from "@/services/venues";
import { AMENITY_COLOR, featureLabel, OPENING_COLORS, occupantsOf, shade } from "@/utils/indoor";
import { MapSheet, type MapSheetHandle } from "@/components/app/MapSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon } from "@/components/icons/Icon";
import React, { useRef } from "react";
import { Dimensions, Linking, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

const { height: SH } = Dimensions.get("window");
const ORANGE = "#FF6F00";
const KIND = { unit: "Space", opening: "Door", amenity: "Point" } as const;

function OccupantRow({ o, venue, C }: { o: IndoorOccupant; venue: IndoorVenue; C: Record<string, string> }) {
  const site = o.website ? o.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  return (
    <View style={[s.occ, { backgroundColor: C.card }]}>
      <Text style={[s.occName, { color: C.text }]}>{o.name}</Text>
      <Text style={[s.occKind, { color: C.sub }]}>{venue.labels.occupants[o.category] ?? o.category}</Text>
      {!!o.description && <Text style={[s.occDesc, { color: C.text }]}>{o.description}</Text>}
      {!!o.hours && (
        <View style={s.fact}>
          <Icon name="time-outline" size={15} color={C.sub} />
          <Text style={[s.factTxt, { color: C.text }]}>{o.hours}</Text>
        </View>
      )}
      {(!!o.phone || !!site) && (
        <View style={s.actions}>
          {!!o.phone && (
            <Pressable onPress={() => Linking.openURL(`tel:${o.phone!.replace(/\s+/g, "")}`).catch(() => {})}
              style={[s.action, { backgroundColor: C.chip }]} accessibilityRole="button" accessibilityLabel={`Call ${o.name}`}>
              <Icon name="call-outline" size={15} color={ORANGE} />
              <Text style={[s.actionTxt, { color: C.text }]}>{o.phone}</Text>
            </Pressable>
          )}
          {!!site && (
            <Pressable onPress={() => Linking.openURL(o.website!.startsWith("http") ? o.website! : `https://${o.website}`).catch(() => {})}
              style={[s.action, { backgroundColor: C.chip }]} accessibilityRole="link" accessibilityLabel={`Open ${site}`}>
              <Icon name="globe-outline" size={15} color={ORANGE} />
              <Text style={[s.actionTxt, { color: C.text }]} numberOfLines={1}>{site}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

interface Props {
  venue: IndoorVenue;
  featureId: string;
  onClose: () => void;
}

export function IndoorFeatureSheet({ venue, featureId, onClose }: Props) {
  const dark = useColorScheme() === "dark";
  const sheet = useRef<MapSheetHandle>(null);
  const feature = venue.features.features.find((f) => f.properties.id === featureId);
  if (!feature) return null;
  const p = feature.properties;
  const level = venue.levels.find((l) => l.id === p.level);
  const occupants = p.kind === "unit" ? occupantsOf(venue, p.id) : [];

  const C = {
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    card: dark ? "#232326" : "#F6F6F8",
    chip: dark ? "#27272A" : "#F1F5F9",
  };
  const color =
    p.kind === "unit" ? shade(venue.colors[p.category] ?? "#F4F4F5", dark)
      : p.kind === "opening" ? OPENING_COLORS[p.category] ?? OPENING_COLORS.pedestrian
        : AMENITY_COLOR;
  const what = featureLabel(venue, { ...p, name: undefined });
  const title = featureLabel(venue, p);

  const header = (
    <View style={s.headerRow}>
      <View style={[s.swatch, { backgroundColor: color, borderColor: dark ? "#3F3F46" : "#D1D5DB" }]}>
        <Icon name={p.kind === "opening" ? "enter-outline" : p.kind === "amenity" ? "location-outline" : "business-outline"} size={20}
          color={p.kind === "unit" ? (dark ? "#E5E7EB" : "#374151") : "#FFFFFF"} />
      </View>
      <View style={s.headerText}>
        <Text style={[s.title, { color: C.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[s.sub, { color: C.sub }]} numberOfLines={1}>
          {title !== what ? `${what} · ` : `${KIND[p.kind]} · `}{level?.name ?? ""}
        </Text>
        <Text style={[s.sub, { color: C.sub }]} numberOfLines={1}>{venue.venue.name}</Text>
      </View>
      <PressableScale onPress={() => sheet.current?.close()} hitSlop={12} style={[s.roundBtn, { backgroundColor: C.chip }]}
        accessibilityRole="button" accessibilityLabel="Close">
        <Icon name="close" size={16} color={C.sub} />
      </PressableScale>
    </View>
  );

  return (
    <MapSheet ref={sheet} snapPoints={occupants.length ? [300, SH * 0.6] : [210]} onClose={onClose} header={header}>
      <View style={s.body}>
        {p.accessible ? (
          <View style={[s.badge, { backgroundColor: dark ? "rgba(22,163,74,0.18)" : "#DCFCE7" }]}>
            <Icon name="accessibility-outline" size={15} color="#16A34A" />
            <Text style={[s.badgeTxt, { color: dark ? "#86EFAC" : "#166534" }]}>Step-free</Text>
          </View>
        ) : null}
        {occupants.map((o) => <OccupantRow key={o.id} o={o} venue={venue} C={C} />)}
        {p.kind === "unit" && !occupants.length && !p.accessible ? (
          <Text style={[s.empty, { color: C.sub }]}>Nothing listed here yet.</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  swatch: { width: 48, height: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  sub: { fontSize: 13, fontWeight: "500" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, paddingBottom: 28, gap: 10 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { fontSize: 13, fontWeight: "700" },
  occ: { borderRadius: 16, padding: 14, gap: 4 },
  occName: { fontSize: 16, fontWeight: "700" },
  occKind: { fontSize: 13, fontWeight: "500" },
  occDesc: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  factTxt: { fontSize: 14, fontWeight: "500", flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, maxWidth: "100%" },
  actionTxt: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  empty: { fontSize: 14 },
  credit: { fontSize: 12, marginTop: 6 },
});
