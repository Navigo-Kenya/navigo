// components/app/PostJourneySheet.tsx
import { FeedbackService } from "@/services/feedback";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ORANGE = "#FF6F00";
const GREEN  = "#34C759";
const GREY   = "#8E8E93";
const WHITE  = "#FFFFFF";

const { height: SCREEN_H } = Dimensions.get("window");
// Mirror JourneyDetailsSheet coordinate model exactly:
//   MAX_Y = top offset when fully expanded (8 % from top)
//   PEEK_H = height visible when peeked
//   MIN_Y  = translateY that shows only PEEK_H from the bottom
const MAX_Y  = SCREEN_H * 0.08;
const PEEK_H = Math.min(Math.max(SCREEN_H * 0.50, 220), 480);
const MIN_Y  = SCREEN_H - PEEK_H;

const STAR_LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Excellent"];

const TAGS: Array<{ id: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: "on_time",    label: "On time",          icon: "time-outline" },
  { id: "crowded",    label: "Crowded",           icon: "people-outline" },
  { id: "safe",       label: "Safe driver",       icon: "shield-checkmark-outline" },
  { id: "clean",      label: "Clean vehicle",     icon: "checkmark-circle-outline" },
  { id: "value",      label: "Good value",        icon: "pricetag-outline" },
  { id: "helpful",    label: "Helpful conductor", icon: "person-outline" },
  { id: "late",       label: "Ran late",          icon: "alert-circle-outline" },
  { id: "overcharge", label: "Overcharged",       icon: "cash-outline" },
];

export interface PostJourneySheetProps {
  visible:        boolean;
  onDismiss:      () => void;
  toName?:        string;
  journeyRoute?:  string;
  estimatedFare?: { amount: number; currency: string } | null;
}

// ─── Star row ─────────────────────────────────────────────────────────────────

function StarRow({ rating, onRate }: { rating: number; onRate: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const scales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  const commit = (n: number) => {
    Animated.sequence([
      Animated.timing(scales[n - 1], { toValue: 1.45, duration: 90, useNativeDriver: true }),
      Animated.spring(scales[n - 1], { toValue: 1.0, damping: 8, stiffness: 200, useNativeDriver: true }),
    ]).start();
    onRate(n);
  };

  const active = hovered || rating;

  return (
    <View style={sr.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Animated.View key={n} style={{ transform: [{ scale: scales[n - 1] }] }}>
          <Pressable
            onPress={() => commit(n)}
            onPressIn={() => setHovered(n)}
            onPressOut={() => setHovered(0)}
            hitSlop={10}
          >
            <Ionicons
              name={n <= active ? "star" : "star-outline"}
              size={42}
              color={n <= active ? ORANGE : "rgba(142,142,147,0.32)"}
            />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const sr = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function PostJourneySheet({
  visible,
  onDismiss,
  toName,
  journeyRoute,
  estimatedFare,
}: PostJourneySheetProps) {
  const dark   = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();

  const [rating,     setRating]     = useState(0);
  const [fareChoice, setFareChoice] = useState<"matched" | "more" | "less" | null>(null);
  const [customFare, setCustomFare] = useState("");
  const [tags,       setTags]       = useState<string[]>([]);
  const [submitted,  setSubmitted]  = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [mounted,    setMounted]    = useState(false);

  // Exact same Animated.Value strategy as JourneyDetailsSheet
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;
  const lastY      = useRef(MIN_Y);

  // ── Sheet positions (identical logic to JourneyDetailsSheet) ───────────────

  const expandSheet = () => {
    Animated.spring(translateY, { toValue: MAX_Y, useNativeDriver: true, damping: 24, stiffness: 200 }).start();
    lastY.current = MAX_Y;
    setExpanded(true);
  };

  const collapseSheet = () => {
    Keyboard.dismiss();
    Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 24, stiffness: 200 }).start();
    lastY.current = MIN_Y;
    setExpanded(false);
  };

  const handleClose = (cb?: () => void, dismissed = false) => {
    if (dismissed) {
      // Fire-and-forget: record the dismissal for analytics
      FeedbackService.submit({
        status:        "dismissed",
        to_name:       toName,
        route_summary: journeyRoute,
      }).catch(() => {});
    }
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_H, duration: 280, useNativeDriver: true }),
      Animated.timing(backdrop,   { toValue: 0,        duration: 240, useNativeDriver: true }),
    ]).start(() => { setMounted(false); cb?.(); });
  };

  useEffect(() => {
    if (visible) {
      setRating(0); setFareChoice(null); setCustomFare(""); setTags([]); setSubmitted(false);
      setExpanded(false);
      translateY.setValue(SCREEN_H);
      backdrop.setValue(0);
      setMounted(true);
      // Animate in to peek — same spring params as JourneyDetailsSheet
      Animated.parallel([
        Animated.spring(translateY, { toValue: MIN_Y, useNativeDriver: true, damping: 24, stiffness: 200 }),
        Animated.timing(backdrop,   { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      lastY.current = MIN_Y;
    }
  }, [visible]);

  // ── PanResponder — exact copy of JourneyDetailsSheet ──────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove:    (_, g) => { translateY.setValue(Math.max(MAX_Y, lastY.current + g.dy)); },
      onPanResponderRelease: (_, g) => {
        if      (g.vy < -0.5 || g.dy < -40) expandSheet();
        else if (g.vy >  0.5 || g.dy >  40) collapseSheet();
        else lastY.current === MAX_Y ? expandSheet() : collapseSheet();
      },
    })
  ).current;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    setSubmitted(true);
    FeedbackService.submit({
      status:          "submitted",
      rating:          rating || null,
      fare_choice:     fareChoice,
      custom_fare:     (fareChoice === "more" || fareChoice === "less") && customFare
                         ? parseInt(customFare, 10) || null
                         : null,
      estimated_fare:  estimatedFare?.amount ?? null,
      currency:        estimatedFare?.currency ?? "KES",
      tags:            tags.length > 0 ? tags : undefined,
      to_name:         toName,
      route_summary:   journeyRoute,
    }).catch(() => {}); // fire-and-forget — never block the UI
    setTimeout(() => handleClose(onDismiss), 1400);
  };

  const toggleTag = (id: string) =>
    setTags((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]));

  // ── Colors ─────────────────────────────────────────────────────────────────

  const C = {
    bg:       dark ? "#1C1C1E" : WHITE,
    text:     dark ? WHITE     : "#1C1C1E",
    sub:      dark ? "rgba(235,235,245,0.55)" : "#6B7280",
    hairline: dark ? "#3A3A3C" : "#E5E7EB",
    pill:     dark ? "#2C2C2E" : "#F2F2F7",
    pillSel:  dark ? "rgba(255,111,0,0.20)" : "#FFF3E0",
    input:    dark ? "#3A3A3C" : "#F2F2F7",
    handle:   dark ? "#3A3A3C" : "#D1D1D6",
  };

  if (!mounted && !visible) return null;

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: 20 }]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => handleClose(onDismiss, true)} />
      </Animated.View>

      {/* Panel — same position model as JourneyDetailsSheet */}
      <Animated.View
        style={[
          s.panel,
          { backgroundColor: C.bg, height: SCREEN_H - MAX_Y, transform: [{ translateY }] },
        ]}
      >
        {/* ── DRAG ZONE ── */}
        <View {...panResponder.panHandlers}>
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: C.handle }]} />
          </View>

          {!submitted && (
            <View style={s.header}>
              <View style={[s.doneChip, { backgroundColor: dark ? "rgba(52,199,89,0.14)" : "#ECFDF5" }]}>
                <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                <Text style={s.doneChipText}>Journey complete</Text>
              </View>
              <Text style={[s.destName, { color: C.text }]} numberOfLines={1}>
                {toName ?? "Destination"}
              </Text>
              {journeyRoute ? (
                <Text style={[s.routeTag, { color: C.sub }]}>{journeyRoute}</Text>
              ) : null}
            </View>
          )}

          <View style={[s.divider, { backgroundColor: C.hairline }]} />
        </View>

        {/* ── SCROLLABLE CONTENT ── */}
        <View style={s.scroll}>
          {submitted ? (
            <View style={s.successWrap}>
              <View style={[s.successCircle, { backgroundColor: dark ? "rgba(52,199,89,0.15)" : "#ECFDF5" }]}>
                <Ionicons name="checkmark-circle" size={52} color={GREEN} />
              </View>
              <Text style={[s.successTitle, { color: C.text }]}>Thanks for the feedback!</Text>
              <Text style={[s.successSub,   { color: C.sub  }]}>
                Your report makes Navigo more accurate for everyone.
              </Text>
            </View>
          ) : (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <ScrollView
                scrollEnabled={expanded}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                nestedScrollEnabled
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              >
                {/* Stars */}
                <View style={[s.section, { borderTopColor: C.hairline }]}>
                  <Text style={[s.sectionLabel, { color: C.sub }]}>How was the journey?</Text>
                  <StarRow rating={rating} onRate={setRating} />
                  <Text style={[s.starLabel, { color: rating > 0 ? ORANGE : "transparent" }]}>
                    {STAR_LABELS[rating]}
                  </Text>
                </View>

                {/* Fare */}
                <View style={[s.section, { borderTopColor: C.hairline }]}>
                  <Text style={[s.sectionLabel, { color: C.sub }]}>What did you pay?</Text>
                  {estimatedFare ? (
                    <Text style={[s.fareHint, { color: C.sub }]}>
                      We estimated{" "}
                      <Text style={{ color: C.text, fontWeight: "600" }}>
                        {estimatedFare.currency} {estimatedFare.amount}
                      </Text>
                    </Text>
                  ) : null}

                  <View style={s.fareRow}>
                    {(["matched", "more", "less"] as const).map((opt) => {
                      const sel   = fareChoice === opt;
                      const label =
                        opt === "matched"
                          ? estimatedFare ? `✓  KES ${estimatedFare.amount}` : "✓  Matched"
                          : opt === "more" ? "↑  Paid more" : "↓  Paid less";
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setFareChoice(sel ? null : opt)}
                          style={[
                            s.fareChip,
                            {
                              backgroundColor: sel ? C.pillSel : C.pill,
                              borderColor:     sel ? ORANGE : "transparent",
                              borderWidth:     sel ? 1.5 : 1,
                              flex:            opt === "matched" ? 1.45 : 1,
                            },
                          ]}
                        >
                          <Text style={[s.fareChipText, { color: sel ? ORANGE : C.text }]} numberOfLines={1}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {(fareChoice === "more" || fareChoice === "less") && (
                    <View style={[s.customFareWrap, { backgroundColor: C.input }]}>
                      <Text style={[s.currencyLabel, { color: C.sub }]}>KES</Text>
                      <TextInput
                        style={[s.fareInput, { color: C.text }]}
                        placeholder="Enter amount"
                        placeholderTextColor={GREY}
                        keyboardType="numeric"
                        value={customFare}
                        onChangeText={(t) => setCustomFare(t.replace(/[^0-9]/g, ""))}
                        autoFocus
                        maxLength={6}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                  )}
                </View>

                {/* Tags */}
                <View style={[s.section, { borderTopColor: C.hairline }]}>
                  <View style={s.sectionLabelRow}>
                    <Text style={[s.sectionLabel, { color: C.sub }]}>Anything to note?</Text>
                    <Text style={[s.optionalLabel, { color: C.hairline }]}>Optional</Text>
                  </View>
                  <View style={s.tagGrid}>
                    {TAGS.map((tag) => {
                      const sel = tags.includes(tag.id);
                      return (
                        <Pressable
                          key={tag.id}
                          onPress={() => toggleTag(tag.id)}
                          style={[
                            s.tagChip,
                            {
                              backgroundColor: sel ? C.pillSel : C.pill,
                              borderColor:     sel ? ORANGE : "transparent",
                              borderWidth:     sel ? 1.5 : 1,
                            },
                          ]}
                        >
                          <Ionicons name={tag.icon} size={12} color={sel ? ORANGE : C.sub} />
                          <Text style={[s.tagText, { color: sel ? ORANGE : C.text }]}>
                            {tag.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* CTAs inside scroll so they're always reachable */}
                <View style={[s.ctas, { borderTopColor: C.hairline }]}>
                  <Pressable
                    onPress={handleSubmit}
                    style={({ pressed }) => [s.submitBtn, { opacity: pressed ? 0.82 : 1 }]}
                  >
                    <Text style={s.submitText}>Submit feedback</Text>
                  </Pressable>
                  <Pressable onPress={() => handleClose(onDismiss, true)} hitSlop={14} style={s.skipBtn}>
                    <Text style={[s.skipText, { color: C.sub }]}>Skip</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* Tap-to-expand overlay when peeking */}
          {!expanded && !submitted && (
            <Pressable style={StyleSheet.absoluteFill} onPress={expandSheet} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)",
  },

  // Identical to JourneyDetailsSheet panel
  panel: {
    position:             "absolute",
    top: 0, left: 0, right: 0,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    shadowColor:          "#000",
    shadowOffset:         { width: 0, height: -3 },
    shadowOpacity:        0.09,
    shadowRadius:         16,
    elevation:            20,
    zIndex:               20,
    flexDirection:        "column",
    overflow:             "hidden",
  },

  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 14 },
  handle:     { width: 40, height: 4, borderRadius: 2 },

  divider: { height: StyleSheet.hairlineWidth },

  // ── Header
  header: {
    paddingHorizontal: 24,
    paddingBottom:     18,
    alignItems:        "center",
    gap:               6,
  },
  doneChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    borderRadius:      999,
    paddingHorizontal: 12,
    paddingVertical:   5,
  },
  doneChipText: { color: GREEN, fontSize: 12, fontWeight: "600" },
  destName:     { fontSize: 22, fontWeight: "700", textAlign: "center" },
  routeTag:     { fontSize: 13, textAlign: "center" },

  // ── Scroll area
  scroll: { flex: 1 },

  // ── Sections
  section: {
    paddingHorizontal: 24,
    paddingTop:        18,
    paddingBottom:     18,
    borderTopWidth:    StyleSheet.hairlineWidth,
    gap:               12,
  },
  sectionLabel: {
    fontSize:      12,
    fontWeight:    "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionalLabel:   { fontSize: 11, fontWeight: "500" },

  // ── Stars
  starLabel: { fontSize: 14, fontWeight: "600", marginTop: -4, textAlign: "center" },

  // ── Fare
  fareHint: { fontSize: 13, marginTop: -4 },
  fareRow:  { flexDirection: "row", gap: 8 },
  fareChip: {
    paddingVertical:   11,
    paddingHorizontal: 10,
    borderRadius:      12,
    alignItems:        "center",
    justifyContent:    "center",
  },
  fareChipText:   { fontSize: 13, fontWeight: "600" },
  customFareWrap: {
    flexDirection:     "row",
    alignItems:        "center",
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   12,
    gap:               8,
  },
  currencyLabel: { fontSize: 15, fontWeight: "700" },
  fareInput:     { flex: 1, fontSize: 17, fontWeight: "600" },

  // ── Tags
  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    borderRadius:      20,
    paddingVertical:   8,
    paddingHorizontal: 12,
  },
  tagText: { fontSize: 13, fontWeight: "500" },

  // ── CTAs
  ctas: {
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     8,
    borderTopWidth:    StyleSheet.hairlineWidth,
    gap:               12,
    alignItems:        "center",
  },
  submitBtn: {
    backgroundColor: ORANGE,
    borderRadius:    14,
    paddingVertical: 15,
    alignItems:      "center",
    alignSelf:       "stretch",
  },
  submitText: { color: WHITE, fontSize: 16, fontWeight: "700" },
  skipBtn:    { paddingBottom: 4 },
  skipText:   { fontSize: 14, fontWeight: "500" },

  // ── Success
  successWrap: {
    flex:              1,
    alignItems:        "center",
    justifyContent:    "center",
    paddingHorizontal: 32,
    gap:               12,
  },
  successCircle: {
    width:          88,
    height:         88,
    borderRadius:   44,
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   4,
  },
  successTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  successSub:   { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
