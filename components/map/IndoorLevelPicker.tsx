// components/map/IndoorLevelPicker.tsx
//
// The floor picker of the venue on screen, top floor on top, under the top
// bar on the left (the right side holds the map's buttons). Shown when the
// venue has more than one level.
import type { IndoorVenue } from "@/services/venues";
import { levelsTopDown } from "@/utils/indoor";
import { useTopUiBottom } from "@/components/app/mapSheetInsets";
import { Icon } from "@/components/icons/Icon";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

const ORANGE = "#FF6F00";

interface Props {
  venue: IndoorVenue;
  levelId: string | null;
  dark: boolean;
  onPick: (levelId: string) => void;
}

export function IndoorLevelPicker({ venue, levelId, dark, onPick }: Props) {
  const top = useTopUiBottom();
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [appear]);

  const levels = levelsTopDown(venue);
  if (levels.length < 2) return null;

  const C = {
    bg: dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.97)",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#3F3F46" : "#E5E7EB",
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        s.wrap,
        {
          top: top + 12,
          opacity: appear,
          transform: [{ translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <View style={[s.pill, { backgroundColor: C.bg, borderColor: C.line }]} accessibilityRole="radiogroup" accessibilityLabel={`${venue.venue.name} floors`}>
        <View style={[s.head, { borderBottomColor: C.line }]}>
          <Icon name="layers-outline" size={15} color={C.sub} />
        </View>
        {levels.map((l) => {
          const on = l.id === levelId;
          return (
            <Pressable
              key={l.id}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                onPick(l.id);
              }}
              hitSlop={{ left: 8, right: 8 }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={l.name}
              style={[s.level, on && { backgroundColor: ORANGE }]}
            >
              <Text style={[s.levelTxt, { color: on ? "#FFFFFF" : C.text }]} numberOfLines={1}>
                {l.short_name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 14 },
  pill: {
    width: 46,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  head: { height: 30, alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  level: { height: 42, alignItems: "center", justifyContent: "center", marginHorizontal: 4, marginVertical: 2, borderRadius: 12 },
  levelTxt: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});
