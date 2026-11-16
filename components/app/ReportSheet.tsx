import { ReportCategory, ReportService } from "@/services/report";
import { REPORT_TYPES, REPORT_TYPE_ORDER } from "@/components/icons/reportIcons";
import { ReportTypeIcon } from "@/components/icons/ReportTypeIcon";
import { useAuthStore } from "@/store/authStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SW, height: SH } = Dimensions.get("window");
const SHEET_H = Math.min(580, Math.max(440, SH * 0.72));

// Report types in display order (most common / most urgent first, fare hike
// last as the wide card). Labels, colours and icons: components/icons/reportIcons.
const CATS: {
  id:    ReportCategory;
  label: string;
  desc:  string;
  color: string;
}[] = REPORT_TYPE_ORDER.map((id) => ({ id, ...REPORT_TYPES[id] }));

// All but the last entry go into the 2-column grid; the last is the wide card.
const GRID_CATS = CATS.slice(0, -1);
const WIDE_CAT  = CATS[CATS.length - 1];

interface Props {
  onClose:  () => void;
  userLat?: number | null;
  userLng?: number | null;
}

export default function ReportSheet({ onClose, userLat, userLng }: Props) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [selectedCat, setSelectedCat] = useState<ReportCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showAuthWall, setShowAuthWall] = useState(false);

  const sheetY    = useRef(new Animated.Value(SHEET_H)).current;
  const backdropA = useRef(new Animated.Value(0)).current;

  // ── Entrance ────────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(sheetY, {
        toValue: 0, useNativeDriver: true,
        damping: 28, stiffness: 260, mass: 0.85,
      }),
      Animated.timing(backdropA, { toValue: 1, duration: 230, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Dismiss ─────────────────────────────────────────────────────────────────
  const dismiss = () =>
    Animated.parallel([
      Animated.timing(sheetY,    { toValue: SHEET_H, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropA, { toValue: 0,        duration: 210, useNativeDriver: true }),
    ]).start(onClose);

  // ── Drag-to-dismiss (handle + header only) ──────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) => g.dy > 5,
      onPanResponderMove:    (_, g) => { if (g.dy > 0) sheetY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.vy > 0.5 || g.dy > 90) {
          dismiss();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 260 }).start();
        }
      },
    })
  ).current;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!selectedCat) return;
    if (!isAuthenticated) { setShowAuthWall(true); return; }
    if (!userLat || !userLng) {
      Alert.alert("Location needed", "We need your current position to pin a report.");
      return;
    }
    setBusy(true);
    try {
      await ReportService.createReport(userLat, userLng, selectedCat);
      setDone(true);
      setTimeout(dismiss, 1600);
    } catch {
      Alert.alert("Couldn't submit", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Palette ──────────────────────────────────────────────────────────────────
  const bg      = dark ? "#1C1C1E" : "#FFFFFF";
  const txt     = dark ? "#F2F2F7" : "#111111";
  const muted   = dark ? "#8E8E93" : "#8A8A8E";
  const cardBg  = dark ? "#2C2C2E" : "#F2F2F7";
  const pill    = dark ? "#48484A" : "#D1D1D6";
  const divider = dark ? "#2C2C2E" : "#E5E5EA";

  const selected = selectedCat ? CATS.find((c) => c.id === selectedCat) : null;

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: backdropA }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[s.sheet, { backgroundColor: bg, transform: [{ translateY: sheetY }] }]}
      >
        {/* ── Drag zone ─────────────────────────────────────────────────────── */}
        <View {...pan.panHandlers}>
          <View style={s.pillWrap}>
            <View style={[s.pill, { backgroundColor: pill }]} />
          </View>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: txt }]}>
                {done ? "Alert pinned" : "Report an issue"}
              </Text>
              <Text style={[s.subtitle, { color: muted }]}>
                {done
                  ? "Thanks for keeping Nairobi moving."
                  : "Select what's happening, then confirm."}
              </Text>
            </View>
            <Pressable
              onPress={dismiss}
              hitSlop={14}
              style={[s.closeBtn, { backgroundColor: cardBg }]}
            >
              <Ionicons name="close" size={15} color={muted} />
            </Pressable>
          </View>
        </View>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {busy ? (
            <View style={s.stateBox}>
              <ActivityIndicator size="large" color="#FF6F00" />
              <Text style={[s.stateNote, { color: muted }]}>Submitting…</Text>
            </View>
          ) : done ? (
            <View style={s.stateBox}>
              <View style={s.successCircle}>
                <Ionicons name="checkmark" size={34} color="#34C759" />
              </View>
              <Text style={[s.stateHeading, { color: txt }]}>Done!</Text>
              <Text style={[s.stateNote, { color: muted }]}>
                Your alert is live for nearby commuters.
              </Text>
            </View>
          ) : (
            <View style={s.grid}>
              {/* Dynamic 2-column grid — pairs GRID_CATS into rows */}
              {Array.from({ length: Math.ceil(GRID_CATS.length / 2) }, (_, ri) => (
                <View key={ri} style={s.row}>
                  {GRID_CATS.slice(ri * 2, ri * 2 + 2).map((c) => (
                    <CategoryCard
                      key={c.id} cat={c}
                      bg={cardBg} txt={txt} muted={muted}
                      isSelected={selectedCat === c.id}
                      onPress={() => setSelectedCat(selectedCat === c.id ? null : c.id)}
                    />
                  ))}
                </View>
              ))}
              {/* Wide card always at the bottom */}
              <WideCard
                cat={WIDE_CAT}
                bg={cardBg} txt={txt} muted={muted}
                isSelected={selectedCat === WIDE_CAT.id}
                onPress={() => setSelectedCat(selectedCat === WIDE_CAT.id ? null : WIDE_CAT.id)}
              />
            </View>
          )}
        </ScrollView>

        {/* ── Confirmation footer ────────────────────────────────────────────── */}
        {selected && !busy && !done && (
          <View style={[s.footer, { borderTopColor: divider, backgroundColor: bg, paddingBottom: insets.bottom + 12 }]}>
            <View style={s.footerInner}>
              <ReportTypeIcon type={selected.id} size={34} />
              <Text style={[s.footerLabel, { color: txt }]} numberOfLines={1}>
                {selected.label}
              </Text>
              <Pressable
                onPress={() => setSelectedCat(null)}
                hitSlop={10}
                style={[s.cancelBtn, { backgroundColor: cardBg }]}
              >
                <Text style={[s.cancelText, { color: muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                style={[s.sendBtn, { backgroundColor: selected.color }]}
              >
                <Text style={s.sendText}>Send alert</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>

      {/* ── Auth wall ────────────────────────────────────────────────────────── */}
      {showAuthWall && (
        <Modal visible transparent animationType="none" onRequestClose={() => setShowAuthWall(false)}>
          <Pressable style={s.wallBackdrop} onPress={() => setShowAuthWall(false)} />
          <View style={[s.wallSheet, { backgroundColor: bg }]}>
            <View style={s.pillWrap}>
              <View style={[s.pill, { backgroundColor: pill }]} />
            </View>
            <View style={[s.wallIconWrap, { backgroundColor: "#FF6F0018" }]}>
              <Ionicons name="lock-closed" size={28} color="#FF6F00" />
            </View>
            <Text style={[s.wallTitle, { color: txt }]}>Sign in to report</Text>
            <Text style={[s.wallSub, { color: muted }]}>
              Help Nairobi commuters stay informed. Sign in to pin a live alert on the map.
            </Text>
            <Pressable
              onPress={() => { setShowAuthWall(false); dismiss(); router.push("/(auth)/login" as any); }}
              style={s.wallPrimaryBtn}
            >
              <Text style={s.wallPrimaryTxt}>Sign In</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => { setShowAuthWall(false); dismiss(); router.push("/(auth)/register" as any); }}
              style={[s.wallSecondaryBtn, { borderColor: dark ? "#48484A" : "#D1D1D6" }]}
            >
              <Text style={[s.wallSecondaryTxt, { color: txt }]}>Create Account</Text>
            </Pressable>
            <Pressable onPress={() => setShowAuthWall(false)} hitSlop={10}>
              <Text style={[s.wallNotNow, { color: muted }]}>Not now</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CardProps {
  cat:        (typeof CATS)[0];
  bg:         string;
  txt:        string;
  muted:      string;
  isSelected: boolean;
  onPress:    () => void;
}

function CategoryCard({ cat, bg, txt, muted, isSelected, onPress }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.card,
        {
          backgroundColor: isSelected ? cat.color + "18" : bg,
          borderWidth:     isSelected ? 1.5 : 0,
          borderColor:     isSelected ? cat.color : "transparent",
        },
      ]}
    >
      <ReportTypeIcon type={cat.id} size={46} />
      <View style={s.cardText}>
        <Text style={[s.cardLabel, { color: txt }]} numberOfLines={1}>{cat.label}</Text>
        <Text style={[s.cardDesc,  { color: muted }]} numberOfLines={2}>{cat.desc}</Text>
      </View>
    </Pressable>
  );
}

function WideCard({ cat, bg, txt, muted, isSelected, onPress }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.wideCard,
        {
          backgroundColor: isSelected ? cat.color + "18" : bg,
          borderWidth:     isSelected ? 1.5 : 0,
          borderColor:     isSelected ? cat.color : "transparent",
        },
      ]}
    >
      <ReportTypeIcon type={cat.id} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, { color: txt }]}>{cat.label}</Text>
        <Text style={[s.cardDesc,  { color: muted }]}>{cat.desc}</Text>
      </View>
      {isSelected
        ? <Ionicons name="checkmark-circle" size={18} color={cat.color} />
        : <Ionicons name="chevron-forward"  size={14} color={muted} />
      }
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const GAP    = 10;
const CARD_W = (SW - 32 - GAP) / 2;

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    zIndex:          29,
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
    flexDirection:        "column",
  },

  pillWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  pill:     { width: 36, height: 4, borderRadius: 2 },

  header: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 12,
  },
  title:    { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, marginBottom: 3 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },

  scroll: { flex: 1 },
  body:   { paddingHorizontal: 16, paddingBottom: 8 },

  grid: { gap: GAP },
  row:  { flexDirection: "row", gap: GAP },

  card: {
    width: CARD_W, height: CARD_W * 0.85,
    borderRadius: 18, padding: 16,
    justifyContent: "space-between",
  },
  iconBox:   { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardText:  { gap: 2 },
  cardLabel: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  cardDesc:  { fontSize: 11, lineHeight: 15 },

  wideCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 14,
  },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12, // base; insets.bottom added inline
  },
  footerInner:    { flexDirection: "row", alignItems: "center", gap: 10 },
  footerIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  footerLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  cancelBtn: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
  },
  cancelText: { fontSize: 13, fontWeight: "600" },
  sendBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
  },
  sendText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  stateBox: { alignItems: "center", paddingTop: 28, paddingBottom: 8, gap: 10 },
  successCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "#34C75918",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  stateHeading: { fontSize: 20, fontWeight: "700" },
  stateNote:    { fontSize: 13, textAlign: "center", lineHeight: 19 },

  // ── Auth wall ──────────────────────────────────────────────────────────────
  wallBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  wallSheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingHorizontal: 26,
    paddingTop: 14,
    paddingBottom: 36,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 40,
  },
  wallIconWrap: {
    width: 66, height: 66, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
    marginBottom: 2,
  },
  wallTitle:        { fontSize: 21, fontWeight: "800", letterSpacing: -0.4, textAlign: "center" },
  wallSub:          { fontSize: 13.5, lineHeight: 20, textAlign: "center", marginBottom: 6, paddingHorizontal: 4 },
  wallPrimaryBtn:   { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: "#FF6F00" },
  wallPrimaryTxt:   { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  wallSecondaryBtn: { width: "100%", alignItems: "center", paddingVertical: 14, borderRadius: 16, borderWidth: 1.5 },
  wallSecondaryTxt: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  wallNotNow:       { fontSize: 13, fontWeight: "500", marginTop: 2 },
});
