// components/app/RateAppSheet.tsx
import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons/Icon";

const { height: SH } = Dimensions.get("window");
const SHEET_H = Math.min(320, Math.max(280, SH * 0.40));

const STORE_LABEL = Platform.OS === "ios" ? "Rate on the App Store" : "Rate on Google Play";

interface Props {
  onRate:  () => void;
  onLater: () => void;
}

export default function RateAppSheet({ onRate, onLater }: Props) {
  const insets = useSafeAreaInsets();
  const dark   = useColorScheme() === "dark";

  const sheetY    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropA = useRef(new Animated.Value(0)).current;

  // ── Entrance ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(sheetY, {
        toValue: 0, useNativeDriver: true,
        damping: 28, stiffness: 260, mass: 0.85,
      }),
      Animated.timing(backdropA, { toValue: 1, duration: 230, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Dismiss ───────────────────────────────────────────────────────────────────
  const dismiss = (cb: () => void) =>
    Animated.parallel([
      Animated.timing(sheetY,    { toValue: SHEET_H, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropA, { toValue: 0,        duration: 210, useNativeDriver: true }),
    ]).start(cb);

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) => g.dy > 5,
      onPanResponderMove:    (_, g) => { if (g.dy > 0) sheetY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.vy > 0.5 || g.dy > 90) {
          dismiss(onLater);
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 260 }).start();
        }
      },
    })
  ).current;

  // ── Palette ───────────────────────────────────────────────────────────────────
  const bg    = dark ? "#1C1C1E" : "#FFFFFF";
  const txt   = dark ? "#F2F2F7" : "#111111";
  const muted = dark ? "#8E8E93" : "#8A8A8E";
  const pill  = dark ? "#48484A" : "#D1D1D6";
  const ghost = dark ? "#3A3A3C" : "#E5E5EA";

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: backdropA }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss(onLater)} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: bg, transform: [{ translateY: sheetY }] }]}>

        {/* ── Drag zone ───────────────────────────────────────────────────────── */}
        <View {...pan.panHandlers}>
          <View style={s.pillWrap}>
            <View style={[s.pill, { backgroundColor: pill }]} />
          </View>
        </View>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <View style={s.body}>
          {/* Stars */}
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Icon key={i} name="star" size={28} color="#FF6F00" />
            ))}
          </View>

          <Text style={[s.title, { color: txt }]}>Enjoying Navigo?</Text>
          <Text style={[s.subtitle, { color: muted }]}>
            Your review helps other Nairobians find reliable matatu routes.
          </Text>
        </View>

        {/* ── Actions ─────────────────────────────────────────────────────────── */}
        <View style={[s.actions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={s.primaryBtn} onPress={() => dismiss(onRate)}>
            <Icon name="star-outline" size={16} color="#fff" />
            <Text style={s.primaryTxt}>{STORE_LABEL}</Text>
          </Pressable>

          <Pressable style={[s.ghostBtn, { borderColor: ghost }]} onPress={() => dismiss(onLater)}>
            <Text style={[s.ghostTxt, { color: muted }]}>Maybe Later</Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    zIndex: 29,
  },
  sheet: {
    position:             "absolute",
    bottom: 0, left: 0, right: 0,
    height:               SHEET_H,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -3 },
    shadowOpacity:        0.13,
    shadowRadius:         18,
    elevation:            30,
    zIndex:               30,
  },

  pillWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  pill:     { width: 36, height: 4, borderRadius: 2 },

  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },

  stars: { flexDirection: "row", gap: 6, marginBottom: 4 },

  title: {
    fontSize: 22, fontWeight: "800", letterSpacing: -0.4, textAlign: "center",
  },
  subtitle: {
    fontSize: 14, lineHeight: 20, textAlign: "center",
  },

  actions: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
  },
  primaryBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    backgroundColor: "#FF6F00",
    borderRadius:   16,
    paddingVertical: 15,
  },
  primaryTxt: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },

  ghostBtn: {
    alignItems:     "center",
    justifyContent: "center",
    borderRadius:   16,
    borderWidth:    1.5,
    paddingVertical: 13,
  },
  ghostTxt: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
});
