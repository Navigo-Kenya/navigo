// components/contribution/StopPickerSheet.tsx
//
// "Which stage?": the first step of a contribution started from the
// Contribute tab (review, photo, fix, a late matatu). Stages near you come
// first, as Google Maps suggests places you've been; or search by name. A
// plain draggable sheet (hooks/useDraggableSheet), dragged by its header so
// the list can scroll.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useDraggableSheet } from "@/hooks/useDraggableSheet";
import { StopService } from "@/services/stop";
import { distanceM, formatDistance } from "@/services/exploreSearch";
import type { LatLng } from "@/services/here";
import { StopTypeBadge } from "@/components/app/StopTypeBadge";
import { Icon, type IconName } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const SH = Dimensions.get("window").height;

export interface PickedStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  route_nams?: string | null;
  stop_type?: string | null;
  mode_badge?: string | null;
  badge_color?: string | null;
}

/** After the sheet is gone, so a form's modal doesn't race its dismissal (iOS). */
const PICK_AFTER_MS = 120;

export function StopPickerSheet({
  visible,
  title,
  subtitle,
  icon,
  accent = ORANGE,
  near,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  icon: IconName;
  accent?: string;
  near: LatLng | null;
  onPick: (stop: PickedStop) => void;
  onClose: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const { translateY, backdrop, panHandlers, close } = useDraggableSheet(visible, onClose);
  const C = {
    sheet: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    field: dark ? "#27272A" : "#F3F4F6",
    line: dark ? "#27272A" : "#EEF0F3",
    pressed: dark ? "#27272A" : "#F3F4F6",
    handle: dark ? "#3F3F46" : "#D1D5DB",
  };

  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<PickedStop[] | null>(null);
  const [results, setResults] = useState<PickedStop[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stages near you, once per opening.
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    if (!near) { setNearby([]); return; }
    let live = true;
    setNearby(null);
    StopService.getNearbyStops(near.lat, near.lng, 1500, 12)
      .then((list) => { if (live) setNearby(list as PickedStop[]); })
      .catch(() => { if (live) setNearby([]); });
    return () => { live = false; };
  }, [visible, near]);

  // Search by name, debounced.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      StopService.searchStops(q, near?.lat, near?.lng)
        .then((list) => setResults((list as PickedStop[]).slice(0, 20)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, near]);

  const searchingMode = query.trim().length >= 2;
  const rows = searchingMode ? results : nearby ?? [];
  const dist = (s: PickedStop) => (near ? formatDistance(distanceM(near.lat, near.lng, s.lat, s.lng)) : null);

  const pick = (s: PickedStop) => {
    Haptics.selectionAsync();
    close(() => setTimeout(() => onPick(s), PICK_AFTER_MS));
  };

  const empty = (() => {
    if (searchingMode) return searching ? null : `No stage called "${query.trim()}". Try another spelling.`;
    if (nearby === null) return null;
    return near ? "No stages within 1.5 km. Search by name above." : "Search a stage by name. Turn on location to see the ones near you.";
  })();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.bottom} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.sheet, height: SH * 0.78, transform: [{ translateY }] }]}>
          <View {...panHandlers}>
            <View style={s.handleArea}>
              <View style={[s.handle, { backgroundColor: C.handle }]} />
            </View>
            <View style={s.head}>
              <View style={[s.headIcon, { backgroundColor: accent + "1F" }]}>
                <Icon name={icon} size={18} color={accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.title, { color: C.text }]} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={[s.subtitle, { color: C.sub }]} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={() => close()} hitSlop={10} style={[s.closeBtn, { backgroundColor: C.field }]} accessibilityLabel="Close">
                <Icon name="close" size={16} color={C.sub} />
              </Pressable>
            </View>
          </View>

          <View style={[s.search, { backgroundColor: C.field }]}>
            <Icon name="search" size={17} color={C.sub} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a stage or stop"
              placeholderTextColor={C.sub}
              style={[s.input, { color: C.text }]}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching ? <ActivityIndicator size="small" color={accent} /> : null}
            {!searching && query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
                <Icon name="close-circle" size={17} color={C.sub} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={rows}
            keyExtractor={(x) => x.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            ListHeaderComponent={
              rows.length ? (
                <Text style={[s.section, { color: C.sub }]}>{searchingMode ? "RESULTS" : "NEAR YOU"}</Text>
              ) : null
            }
            ListEmptyComponent={
              empty ? (
                <Text style={[s.empty, { color: C.sub }]}>{empty}</Text>
              ) : (
                <ActivityIndicator style={{ marginTop: 28 }} color={accent} />
              )
            }
            ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: C.line }]} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent" }]}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <StopTypeBadge stop={item as any} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
                  {item.route_nams ? (
                    <Text style={[s.lines, { color: C.sub }]} numberOfLines={1}>{item.route_nams}</Text>
                  ) : null}
                </View>
                {dist(item) ? <Text style={[s.dist, { color: C.sub }]}>{dist(item)}</Text> : null}
              </Pressable>
            )}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.38)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handleArea: { paddingTop: 12, paddingBottom: 6, alignItems: "center" },
  handle: { width: 42, height: 4, borderRadius: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  headIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, height: 46, borderRadius: 14 },
  input: { flex: 1, fontSize: 15.5 },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 11 },
  name: { fontSize: 15.5, fontWeight: "600" },
  lines: { fontSize: 12.5, marginTop: 1 },
  dist: { fontSize: 12.5, fontWeight: "600" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  empty: { fontSize: 14, textAlign: "center", paddingHorizontal: 32, paddingTop: 28, lineHeight: 20 },
});
