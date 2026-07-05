// components/map/MapLayersSheet.tsx
import { useMapLayersStore, type MapLayers } from "@/store/mapLayersStore";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const ORANGE = "#FF6F00";
const { height: SH } = Dimensions.get("window");
const TRAVEL = SH * 0.7; 

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
  { id: "reports",   label: "Live report", image: require("@/assets/images/reports.png") },
  { id: "traffic",   label: "Traffic",     image: require("@/assets/images/traffic.png") },
  { id: "biking",    label: "Biking",      image: require("@/assets/images/biking.png") },
  // { id: "coolSpots", label: "Cool spots",  image: require("@/assets/images/cool_spots.png") },
  { id: "bus",       label: "Bus",         image: require("@/assets/images/bus.png") },
];

function LayerButton({ label, iconFamily, icon, image, color, active, onPress, dark }: any) {
  const C = {
    boxBg:        dark ? "#2C2C2E" : "#FFFFFF",
    boxBorder:    dark ? "#3A3A3C" : "#E5E7EB",
    text:         dark ? "#FFFFFF" : "#1C1C1E",
    activeBg:     dark ? "rgba(255,111,0,0.12)" : "#FFF3E0",
  };

  let IconComponent: any = Ionicons;
  if (iconFamily === "MaterialIcons") IconComponent = MaterialIcons;
  if (iconFamily === "MaterialCommunityIcons") IconComponent = MaterialCommunityIcons;

  return (
    <Pressable style={s.layerBtn} onPress={onPress}>
      <View
        style={[
          s.iconBox,
          { backgroundColor: active ? C.activeBg : C.boxBg, borderColor: active ? ORANGE : C.boxBorder },
          active && { borderWidth: 2, borderRadius: 14 },
        ]}
      >
        {image ? (
          <Image source={image} style={[s.mapImage, active && { borderRadius: 12 }]} />
        ) : (
          <IconComponent name={icon} size={28} color={active ? ORANGE : color} />
        )}
      </View>
      <Text style={[s.layerLabel, { color: active ? ORANGE : C.text }, active && { fontWeight: "700" }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MapLayersSheet({ visible, onDismiss, dark }: MapLayersSheetProps) {
  const layers = useMapLayersStore((s) => s.layers);
  const toggle = useMapLayersStore((s) => s.toggle);
  const setLayer = useMapLayersStore((s) => s.setLayer);

  const ty = useRef(new Animated.Value(TRAVEL)).current;
  const bg = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 240, mass: 0.9 }),
        Animated.timing(bg, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(ty, { toValue: TRAVEL, duration: 230, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(bg, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const C = {
    card:     dark ? "#1C1C1E" : "#FFFFFF",
    text:     dark ? "#FFFFFF" : "#1C1C1E",
    sub:      dark ? "#8E8E93" : "#6B7280",
    hairline: dark ? "#2C2C2E" : "#E5E7EB",
  };

  // 🛠️ FIX: Instead of returning null and destroying the images, we just disable touches
  // when the sheet is closed. The animation pushes it off-screen natively.
  return (
    <View style={s.root} pointerEvents={visible ? "box-none" : "none"}>
      <Animated.View style={[s.backdrop, { opacity: bg }]} pointerEvents={visible ? "auto" : "none"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <Animated.View style={[s.card, { backgroundColor: C.card, transform: [{ translateY: ty }] }]}>
        <View style={s.handle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          <View style={s.headerRow}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Map type</Text>
            <Pressable onPress={onDismiss} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.sub} />
            </Pressable>
          </View>

          <View style={s.grid}>
            {MAP_TYPES.map((mt) => (
              <LayerButton
                key={mt.id}
                {...mt}
                active={layers.mapType === mt.id}
                onPress={() => setLayer("mapType", mt.id)}
                dark={dark}
              />
            ))}
          </View>

          <View style={[s.divider, { backgroundColor: C.hairline }]} />

          <View style={s.headerRow}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Map details</Text>
          </View>

          <View style={s.grid}>
            {MAP_DETAILS.map((md) => (
              <LayerButton
                key={md.id}
                {...md}
                active={!!layers[md.id as keyof MapLayers]}
                onPress={() => toggle(md.id as keyof MapLayers)}
                dark={dark}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", zIndex: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  card: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    shadowColor:   "#000",
    shadowOpacity: 0.2,
    shadowRadius:  16,
    shadowOffset:  { width: 0, height: -4 },
    elevation:     20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#C7C7CC", alignSelf: "center", marginTop: 12, marginBottom: 8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "500", letterSpacing: -0.3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "flex-start" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 24 },
  layerBtn: { width: 76, alignItems: "center", marginBottom: 8 },
  iconBox: {
    width: 64, height: 64, alignItems: "center", justifyContent: "center",
    overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 8,
  },
  mapImage: { width: "100%", height: "100%" },
  layerLabel: { fontSize: 12, fontWeight: "500", textAlign: "center", lineHeight: 16 },
});