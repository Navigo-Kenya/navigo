// components/ar/ARWalkView.tsx
// AR walking guidance MVP (Live View equivalent): full-screen camera with a
// compass-driven direction arrow to the next waypoint (stage/boarding stop).
// Pure sensors — camera + magnetometer heading + GPS bearing — no ARKit/ARCore.
import { useHeadingStore } from "@/store/headingStore";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const GREEN  = "#30D158";

/** Bearing from user to target, degrees clockwise from north. */
function bearingTo(lat: number, lng: number, tLat: number, tLng: number): number {
  const la1 = (lat * Math.PI) / 180;
  const la2 = (tLat * Math.PI) / 180;
  const dLng = ((tLng - lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface ARWalkViewProps {
  visible: boolean;
  onClose: () => void;
  userLat: number | null;
  userLng: number | null;
  targetLat: number | null;
  targetLng: number | null;
  targetName?: string | null;
  instruction?: string | null;
  distanceM?: number | null;
}

export default function ARWalkView({
  visible, onClose, userLat, userLng, targetLat, targetLng,
  targetName, instruction, distanceM,
}: ARWalkViewProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Live device heading (12 Hz, EMA-smoothed in the store).
  const [deviceHeading, setDeviceHeading] = useState(useHeadingStore.getState().heading);
  useEffect(() => {
    if (!visible) return;
    return useHeadingStore.subscribe((s) => setDeviceHeading(s.heading));
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const targetBearing =
    userLat != null && userLng != null && targetLat != null && targetLng != null
      ? bearingTo(userLat, userLng, targetLat, targetLng)
      : null;

  // Arrow rotation relative to where the phone is pointing.
  const relative = targetBearing != null
    ? ((targetBearing - deviceHeading + 540) % 360) - 180
    : 0;
  const aligned = targetBearing != null && Math.abs(relative) <= 15;

  // Haptic tick when alignment is acquired.
  const wasAlignedRef = useRef(false);
  useEffect(() => {
    if (aligned && !wasAlignedRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    wasAlignedRef.current = aligned;
  }, [aligned]);

  // Gentle breathing on the arrow while hunting.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!visible) return null;

  const distText = distanceM != null
    ? distanceM < 1000 ? `${Math.round(distanceM / 5) * 5} m` : `${(distanceM / 1000).toFixed(1)} km`
    : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.noCam]}>
            <Ionicons name="videocam-off-outline" size={40} color="#8E8E93" />
            <Text style={s.noCamText}>
              Camera access is needed for AR guidance.{"\n"}Enable it in Settings.
            </Text>
          </View>
        )}

        {/* Direction arrow */}
        <View style={s.arrowLayer} pointerEvents="none">
          <Animated.View
            style={{
              transform: [{ rotate: `${relative}deg` }, { scale: aligned ? 1 : pulse }],
            }}
          >
            <Ionicons
              name="navigate"
              size={120}
              color={aligned ? GREEN : ORANGE}
              style={{ transform: [{ rotate: "-45deg" }] }} // glyph points NE by default
            />
          </Animated.View>
          {distText && (
            <Text style={[s.distText, { color: aligned ? GREEN : "#FFFFFF" }]}>{distText}</Text>
          )}
          <Text style={s.alignHint}>
            {aligned ? "Straight ahead — follow the arrow" : "Turn until the arrow points up"}
          </Text>
        </View>

        {/* Top bar */}
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
            <Ionicons name="chevron-down" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={s.topPill}>
            <Ionicons name="camera-outline" size={13} color={ORANGE} />
            <Text style={s.topPillText}>AR guidance</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Bottom card */}
        <View style={[s.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
          {instruction ? (
            <Text style={s.instruction} numberOfLines={2}>{instruction}</Text>
          ) : null}
          {targetName ? (
            <Text style={s.target} numberOfLines={1}>to {targetName}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#000" },
  noCam:     { alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  noCamText: { color: "#8E8E93", fontSize: 14, textAlign: "center", lineHeight: 20 },

  arrowLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  distText:  { fontSize: 30, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  alignHint: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  topPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  topPillText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "700" },

  bottomCard: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingTop: 14, paddingHorizontal: 20, gap: 2,
  },
  instruction: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  target:      { color: "rgba(255,255,255,0.75)", fontSize: 13 },
});
