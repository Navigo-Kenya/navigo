import { useTopUiBottom } from "@/components/app/mapSheetInsets";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";

export type OfflineVariant = "login" | "download" | "active";

interface OfflineNoticeProps {
  variant: OfflineVariant;
  dark:    boolean;
  onPress?: () => void;
}

const COPY: Record<OfflineVariant, { title: string; body: string; cta?: string; icon: keyof typeof Ionicons.glyphMap }> = {
  login: {
    title: "You're offline",
    body:  "Sign in to download offline maps and keep navigating without a connection.",
    cta:   "Sign in",
    icon:  "cloud-offline-outline",
  },
  download: {
    title: "You're offline",
    body:  "Download an offline map of this area to keep navigating.",
    cta:   "Download maps",
    icon:  "cloud-offline-outline",
  },
  active: {
    title: "Offline mode",
    body:  "Showing your downloaded map.",
    icon:  "cloud-done-outline",
  },
};

export function OfflineNotice({ variant, dark, onPress }: OfflineNoticeProps) {
  const insets = useSafeAreaInsets();
  const copy   = COPY[variant];
  // Sit just below the map's top bar (search + chips, or the nav banner),
  // whatever its current height, instead of at a fixed offset.
  const topUi  = useTopUiBottom();
  const top    = (topUi || (insets.top || 44) + 90) + 8;

  const bg   = dark ? "#1C1C1E" : "#FFFFFF";
  const text = dark ? "#FFFFFF" : "#1C1C1E";
  const sub  = dark ? "#8E8E93" : "#6B7280";

  // "active" is a compact pill; login/download are full cards with a CTA.
  if (variant === "active") {
    return (
      <View style={[s.pill, { top, backgroundColor: bg }]}>
        <Ionicons name={copy.icon} size={14} color={ORANGE} />
        <Text style={[s.pillText, { color: text }]}>{copy.title}</Text>
      </View>
    );
  }

  return (
    <View style={[s.card, { top, backgroundColor: bg }]}>
      <View style={s.iconWrap}>
        <Ionicons name={copy.icon} size={20} color={ORANGE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: text }]}>{copy.title}</Text>
        <Text style={[s.body, { color: sub }]}>{copy.body}</Text>
      </View>
      {copy.cta && onPress && (
        <Pressable onPress={onPress} style={s.cta} accessibilityRole="button" accessibilityLabel={copy.cta}>
          <Text style={s.ctaText}>{copy.cta}</Text>
        </Pressable>
      )}
    </View>
  );
}

const shadow = {
  shadowColor:   "#000",
  shadowOpacity: 0.18,
  shadowRadius:  12,
  shadowOffset:  { width: 0, height: 4 },
  elevation:     8,
} as const;

const s = StyleSheet.create({
  card: {
    position:          "absolute",
    left:              16,
    // leaves the right-hand button column (14 + 44 px) clear
    right:             68,
    flexDirection:     "row",
    alignItems:        "center",
    gap:               12,
    borderRadius:      16,
    paddingVertical:   12,
    paddingHorizontal: 14,
    zIndex:            12,
    ...shadow,
  },
  iconWrap: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: "rgba(255,111,0,0.12)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  title: { fontSize: 14, fontWeight: "700" },
  body:  { fontSize: 12, lineHeight: 16, marginTop: 1 },
  cta: {
    backgroundColor:   ORANGE,
    borderRadius:      10,
    paddingVertical:   9,
    paddingHorizontal: 12,
  },
  ctaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },

  pill: {
    position:          "absolute",
    alignSelf:         "center",
    flexDirection:     "row",
    alignItems:        "center",
    gap:               6,
    borderRadius:      999,
    paddingVertical:   6,
    paddingHorizontal: 12,
    zIndex:            12,
    ...shadow,
  },
  pillText: { fontSize: 12, fontWeight: "600" },
});
