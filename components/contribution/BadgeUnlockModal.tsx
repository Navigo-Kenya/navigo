// components/contribution/BadgeUnlockModal.tsx
// Animated celebration modal replacing Alert.alert for badge + points feedback.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

const ORANGE = "#FF6F00";
const GREEN  = "#10B981";

interface Props {
  visible:       boolean;
  onDismiss:     () => void;
  pointsAwarded?: number;
  badges?:        string[];
  streakDays?:    number;
}

export default function BadgeUnlockModal({ visible, onDismiss, pointsAwarded = 0, badges = [], streakDays }: Props) {
  const dark    = useColorScheme() === "dark";
  const scale   = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    scale.setValue(0.72);
    opacity.setValue(0);
    pulse.setValue(1);

    Animated.parallel([
      Animated.spring(scale,   { toValue: 1,   damping: 14, stiffness: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1,   duration: 180,              useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.09, duration: 680, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.00, duration: 680, useNativeDriver: true }),
        ]),
        { iterations: 3 }
      ).start();
    });

    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [visible]);

  const bg        = dark ? "#1C1C1E" : "#FFFFFF";
  const textColor = dark ? "#FFFFFF" : "#1C1C1E";
  const sub       = dark ? "#8E8E93" : "#6B7280";
  const hasBadge  = badges.length > 0;
  const accent    = hasBadge ? ORANGE : GREEN;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onDismiss}>
        <Animated.View style={[s.card, { backgroundColor: bg, opacity, transform: [{ scale }] }]}>

          {/* Pulsing icon ring */}
          <Animated.View style={[s.iconRing, { backgroundColor: accent + "1E", transform: [{ scale: pulse }] }]}>
            <Ionicons name={hasBadge ? "ribbon" : "star"} size={40} color={accent} />
          </Animated.View>

          {hasBadge ? (
            <>
              <Text style={[s.title, { color: textColor }]}>Badge Unlocked!</Text>
              <Text style={[s.badgeName, { color: accent }]} numberOfLines={2}>{badges[0]}</Text>
              {badges.length > 1 && (
                <Text style={[s.extra, { color: sub }]}>+{badges.length - 1} more</Text>
              )}
            </>
          ) : (
            <Text style={[s.title, { color: textColor }]}>Points Earned</Text>
          )}

          {pointsAwarded > 0 && (
            <View style={[s.pill, { backgroundColor: GREEN + "1A" }]}>
              <Ionicons name="add-circle" size={15} color={GREEN} />
              <Text style={[s.pillText, { color: GREEN }]}>+{pointsAwarded} Safiri Points</Text>
            </View>
          )}

          {streakDays != null && streakDays > 1 && (
            <View style={[s.pill, { backgroundColor: ORANGE + "14" }]}>
              <Text style={s.flame}>🔥</Text>
              <Text style={[s.pillText, { color: ORANGE }]}>{streakDays}-day streak!</Text>
            </View>
          )}

          <Text style={[s.hint, { color: sub }]}>Tap to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 284,
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.20,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title:     { fontSize: 21, fontWeight: "800", textAlign: "center" },
  badgeName: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  extra:     { fontSize: 13 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: { fontSize: 15, fontWeight: "700" },
  flame:    { fontSize: 16 },
  hint:     { fontSize: 12, marginTop: 4 },
});
