// components/app/ScreenHeader.tsx
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";

export interface HeaderColors {
  bg: string;
  text: string;
  hairline: string;
}

interface ScreenHeaderProps {
  title: string;
  C: HeaderColors;
  /** Replaces "‹ Back" with plain text, use for edit Cancel */
  leftLabel?: string;
  leftAction?: () => void;
  rightLabel?: string;
  rightAction?: () => void;
  rightColor?: string;
  rightLoading?: boolean;
  /** Arbitrary right-side node, takes precedence over rightLabel/rightAction when provided */
  rightNode?: ReactNode;
}

export function ScreenHeader({
  title,
  C,
  leftLabel,
  leftAction,
  rightLabel,
  rightAction,
  rightColor = ORANGE,
  rightLoading = false,
  rightNode,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleLeft = leftAction ?? (() => router.back());

  return (
    <View
      style={[
        sh.header,
        {
          paddingTop:        insets.top + 10,
          backgroundColor:   C.bg,
          borderBottomColor: C.hairline,
        },
      ]}
    >
      {/* Left */}
      <Pressable
        onPress={handleLeft}
        hitSlop={14}
        style={({ pressed }) => [sh.side, { opacity: pressed ? 0.5 : 1 }]}
      >
        {leftLabel ? (
          <Text style={[sh.sideText, { color: "#FF3B30" }]}>{leftLabel}</Text>
        ) : (
          <>
            <Icon name="chevron-back" size={22} color={ORANGE} />
            <Text style={[sh.sideText, { color: ORANGE }]}>Back</Text>
          </>
        )}
      </Pressable>

      {/* Title */}
      <Text style={[sh.title, { color: C.text }]} numberOfLines={1}>
        {title}
      </Text>

      {/* Right */}
      <View style={[sh.side, sh.rightSide]}>
        {rightNode ?? (rightLabel && rightAction && (
          <Pressable
            onPress={rightLoading ? undefined : rightAction}
            hitSlop={14}
            style={({ pressed }) => [{ opacity: pressed || rightLoading ? 0.5 : 1 }]}
          >
            {rightLoading ? (
              <ActivityIndicator size="small" color={rightColor} />
            ) : (
              <Text style={[sh.sideText, { color: rightColor }]}>{rightLabel}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  header: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal: 16,
    paddingBottom:    12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side:      { flex: 1, flexDirection: "row", alignItems: "center", gap: 2 },
  rightSide: { justifyContent: "flex-end" },
  title:     { fontSize: 17, fontWeight: "600", textAlign: "center" },
  sideText:  { fontSize: 17, fontWeight: "500" },
});
