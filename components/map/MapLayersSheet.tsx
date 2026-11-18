// components/map/MapLayersSheet.tsx
//
// Map type + map details picker. KakaoMap-style draggable sheet with no
// backdrop, so each toggle is visible on the map right away.
import { MapSheet, type MapSheetHandle } from "@/components/app/MapSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { useMapLayersStore, type MapLayers } from "@/store/mapLayersStore";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const { height: SH } = Dimensions.get("window");

interface MapLayersSheetProps {
  visible: boolean;
  onDismiss: () => void;
  dark: boolean;
}

const MAP_TYPES = [
  { id: "default",   label: "Default",   image: require("@/assets/images/default.png") },
  { id: "satellite", label: "Satellite", image: require("@/assets/images/satellite.png") },
  { id: "hybrid",    label: "Terrain",   image: require("@/assets/images/terrain.png") },
];

const MAP_DETAILS = [
  { id: "reports", label: "Live reports", image: require("@/assets/images/reports.png") },
  { id: "traffic", label: "Traffic",      image: require("@/assets/images/traffic.png") },
  { id: "biking",  label: "Biking",       image: require("@/assets/images/biking.png") },
  { id: "bus",     label: "Buses",        image: require("@/assets/images/bus.png") },
];

export function MapLayersSheet({ visible, onDismiss, dark }: MapLayersSheetProps) {
  const layers = useMapLayersStore((s) => s.layers);
  const toggle = useMapLayersStore((s) => s.toggle);
  const setLayer = useMapLayersStore((s) => s.setLayer);
  const sheet = useRef<MapSheetHandle>(null);

  const C = {
    text: dark ? "#F4F4F5" : "#111827",
    sub:  dark ? "#A1A1AA" : "#6B7280",
    chip: dark ? "#27272A" : "#F1F5F9",
    tile: dark ? "#232326" : "#F6F6F8",
    ring: dark ? "#3F3F46" : "#E5E7EB",
  };

  const header = (
    <View style={s.header}>
      <Text style={[s.title, { color: C.text }]}>Map layers</Text>
      <PressableScale
        onPress={() => sheet.current?.close()}
        hitSlop={12}
        style={[s.closeBtn, { backgroundColor: C.chip }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Icon name="close" size={16} color={C.sub} />
      </PressableScale>
    </View>
  );

  return (
    <MapSheet
      ref={sheet}
      visible={visible}
      snapPoints={[Math.min(470, SH * 0.66)]}
      onClose={onDismiss}
      header={header}
    >
      <View style={s.body}>
        <Text style={[s.section, { color: C.sub }]}>MAP TYPE</Text>
        <View style={s.typeRow}>
          {MAP_TYPES.map((mt) => {
            const active = layers.mapType === mt.id;
            return (
              <PressableScale
                key={mt.id}
                containerStyle={{ flex: 1 }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setLayer("mapType", mt.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${mt.label} map`}
                style={s.typeItem}
              >
                <View style={[s.typeThumbWrap, { borderColor: active ? ORANGE : C.ring }]}>
                  <Image source={mt.image} style={s.typeThumb} />
                  {active && (
                    <View style={s.checkBadge}>
                      <Icon name="checkmark" size={11} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={[s.itemLabel, { color: active ? ORANGE : C.text }, active && s.itemLabelActive]}>
                  {mt.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={[s.divider, { backgroundColor: C.ring }]} />

        <Text style={[s.section, { color: C.sub }]}>MAP DETAILS</Text>
        <View style={s.detailsGrid}>
          {MAP_DETAILS.map((md) => {
            const active = !!layers[md.id as keyof MapLayers];
            return (
              <PressableScale
                key={md.id}
                containerStyle={s.detailWrap}
                onPress={() => {
                  Haptics.selectionAsync();
                  toggle(md.id as keyof MapLayers);
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: active }}
                accessibilityLabel={md.label}
                style={s.detailItem}
              >
                <View
                  style={[
                    s.detailThumbWrap,
                    { borderColor: active ? ORANGE : C.ring, backgroundColor: C.tile },
                  ]}
                >
                  <Image source={md.image} style={[s.detailThumb, !active && { opacity: 0.55 }]} />
                  <View style={[s.toggleDot, { backgroundColor: active ? ORANGE : C.ring }]}>
                    <Icon name={active ? "checkmark" : "add"} size={11} color={active ? "#FFFFFF" : C.sub} />
                  </View>
                </View>
                <Text
                  style={[s.itemLabel, { color: active ? ORANGE : C.text }, active && s.itemLabelActive]}
                  numberOfLines={1}
                >
                  {md.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <Text style={[s.credit, { color: C.sub }]}>
          Traffic and live incidents © TomTom.
        </Text>
      </View>
    </MapSheet>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  body: { paddingHorizontal: 18 },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 10 },
  credit: { fontSize: 11.5, fontWeight: "500", marginTop: 12 },

  typeRow: { flexDirection: "row", gap: 10 },
  typeItem: { alignItems: "center", gap: 7 },
  typeThumbWrap: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
  },
  typeThumb: { width: "100%", height: "100%" },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },

  detailsGrid: { flexDirection: "row", gap: 10 },
  detailWrap: { flex: 1 },
  detailItem: { alignItems: "center", gap: 7 },
  detailThumbWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    overflow: "hidden",
  },
  detailThumb: { width: "100%", height: "100%" },

  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  toggleDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: { fontSize: 12.5, fontWeight: "600", textAlign: "center" },
  itemLabelActive: { fontWeight: "800" },
});
