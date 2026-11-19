// components/saved/SaveToListSheet.tsx
//
// "Save to list" (Google Maps' flow, KakaoMap's coloured folders): every
// list with a tick, so a place can be in several; Home and Work at the top;
// a new list made inline, ticked as it's made. Each tap saves at once (no
// Save button to forget); Done just closes.
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useDraggableSheet } from "@/hooks/useDraggableSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuthStore } from "@/store/authStore";
import { rowsFor, useSavedStore, type SaveTarget } from "@/store/savedStore";
import { allLists, useSavedListsStore } from "@/store/savedListsStore";
import { ListTile } from "./ListTile";
import { NewListForm, type ListDraft } from "./NewListForm";

const ORANGE = "#FF6F00";

export function SaveToListSheet({
  target,
  onClose,
}: {
  /** The place or stop to save; null hides the sheet. */
  target: SaveTarget | null;
  onClose: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  // A plain draggable sheet: slides up, drags down by its handle to close.
  const { translateY, backdrop, panHandlers, close } = useDraggableSheet(!!target, onClose);
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { places, customLists, toggleInList, addPlace, removePlace, fetch } = useSavedStore();
  const { custom, create, migrate } = useSavedListsStore();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => { if (target && isAuthenticated) fetch().catch(() => {}); }, [target, isAuthenticated, fetch]);
  useEffect(() => { migrate(customLists); }, [customLists, migrate]);
  useEffect(() => { if (!target) { setCreating(false); setCreateError(null); } }, [target]);

  const C = {
    sheet: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#27272A" : "#EEF0F3",
    chip: dark ? "#27272A" : "#F3F4F6",
    handle: dark ? "#3F3F46" : "#D1D5DB",
  };

  const lists = useMemo(
    () => allLists(custom, places.filter((p) => p.pin === null && p.list).map((p) => p.list as string)),
    [custom, places]
  );
  const mine = target ? rowsFor(places, target.place_id) : [];
  const inList = (key: string) => mine.some((p) => p.list === key && p.pin === null);
  const pinned = (pin: "home" | "work") => mine.some((p) => p.pin === pin);
  const countOf = (key: string) => places.filter((p) => p.list === key && p.pin === null).length;

  const run = async (key: string, job: () => Promise<unknown>) => {
    if (busy.has(key)) return;
    setBusy((b) => new Set(b).add(key));
    try {
      await job();
    } catch {
      Alert.alert("Couldn't save", "Check your connection and try again.");
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const toggle = (key: string) => {
    if (!target) return;
    Haptics.selectionAsync();
    run(key, () => toggleInList(target, key));
  };

  const togglePin = (pin: "home" | "work") => {
    if (!target) return;
    Haptics.selectionAsync();
    const row = mine.find((p) => p.pin === pin);
    run(pin, () =>
      row
        ? removePlace(row.id)
        : addPlace({
            name: target.name, lat: target.lat, lng: target.lng, type: target.type,
            place_id: target.place_id, pin, list: null, category: target.category ?? null, note: null,
          })
    );
  };

  const submitNew = (d: ListDraft) => {
    const meta = create(d.name, d.color, d.icon);
    if (!meta) {
      setCreateError("You already have a list with this name.");
      return;
    }
    setCreating(false);
    setCreateError(null);
    toggle(meta.key);
  };

  const savedSomewhere = mine.length > 0;

  return (
    <Modal visible={!!target} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      {target ? (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
          </Animated.View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.bottom} pointerEvents="box-none">
            <Animated.View
              style={[s.sheet, { backgroundColor: C.sheet, paddingBottom: Math.max(insets.bottom, 14), transform: [{ translateY }] }]}
            >
              {/* Drag by the handle and the header; the lists below scroll. */}
              <View {...panHandlers}>
                <View style={s.handleArea}>
                  <View style={[s.handle, { backgroundColor: C.handle }]} />
                </View>

                <View style={s.head}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.title, { color: C.text }]}>Save to list</Text>
                    <Text style={[s.sub, { color: C.sub }]} numberOfLines={1}>
                      {[target.name, target.category].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <PressableScale onPress={() => close()} style={[s.done, { backgroundColor: savedSomewhere ? ORANGE : C.chip }]}>
                    <Text style={[s.doneText, { color: savedSomewhere ? "#FFFFFF" : C.text }]}>Done</Text>
                  </PressableScale>
                </View>
              </View>

              {!isAuthenticated ? (
                <View style={s.guest}>
                  <ListTile icon="bookmark" color={ORANGE} size={52} />
                  <Text style={[s.guestTitle, { color: C.text }]}>Keep the places you love</Text>
                  <Text style={[s.guestSub, { color: C.sub }]}>
                    Sign in to save places to your lists, set Home and Work, and find them on every phone.
                  </Text>
                  <PressableScale
                    onPress={() => close(() => router.push("/(auth)/login" as any))}
                    style={[s.signIn, { backgroundColor: ORANGE }]}
                  >
                    <Text style={s.signInText}>Sign in</Text>
                  </PressableScale>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={s.pins}>
                    {(["home", "work"] as const).map((pin) => {
                      const on = pinned(pin);
                      return (
                        <PressableScale
                          key={pin}
                          onPress={() => togglePin(pin)}
                          containerStyle={{ flex: 1 }}
                          style={[s.pin, { backgroundColor: on ? ORANGE : C.chip }]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={pin === "home" ? "Set as Home" : "Set as Work"}
                        >
                          {busy.has(pin) ? (
                            <ActivityIndicator size="small" color={on ? "#FFFFFF" : C.sub} />
                          ) : (
                            <Icon name={pin === "home" ? "home" : "business"} size={16} color={on ? "#FFFFFF" : C.text} />
                          )}
                          <Text style={[s.pinText, { color: on ? "#FFFFFF" : C.text }]}>
                            {on ? (pin === "home" ? "Your Home" : "Your Work") : pin === "home" ? "Set as Home" : "Set as Work"}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>

                  <Text style={[s.section, { color: C.sub }]}>YOUR LISTS</Text>
                  {lists.map((l) => {
                    const on = inList(l.key);
                    const n = countOf(l.key);
                    return (
                      <Pressable
                        key={l.key}
                        onPress={() => toggle(l.key)}
                        style={({ pressed }) => [s.row, { borderBottomColor: C.line, opacity: pressed ? 0.7 : 1 }]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, busy: busy.has(l.key) }}
                        accessibilityLabel={`${l.name}, ${n} place${n === 1 ? "" : "s"}`}
                      >
                        <ListTile icon={l.icon} color={l.color} size={40} solid={on} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>{l.name}</Text>
                          <Text style={[s.rowSub, { color: C.sub }]}>
                            {n} place{n === 1 ? "" : "s"} · Private
                          </Text>
                        </View>
                        {busy.has(l.key) ? (
                          <ActivityIndicator size="small" color={l.color} />
                        ) : (
                          <View style={[s.check, on ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: C.sub }]}>
                            {on ? <Icon name="checkmark" size={14} color="#FFFFFF" /> : null}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}

                  {creating ? (
                    <View style={s.form}>
                      <NewListForm dark={dark} error={createError} onSubmit={submitNew} onCancel={() => { setCreating(false); setCreateError(null); }} />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => { Haptics.selectionAsync(); setCreating(true); }}
                      style={({ pressed }) => [s.row, { borderBottomWidth: 0, opacity: pressed ? 0.7 : 1 }]}
                      accessibilityRole="button"
                    >
                      <View style={[s.newTile, { borderColor: ORANGE }]}>
                        <Icon name="add" size={20} color={ORANGE} />
                      </View>
                      <Text style={[s.rowTitle, { color: ORANGE }]}>New list</Text>
                    </Pressable>
                  )}
                </ScrollView>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.38)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 0,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  // The same handle as the tab sheets (app/(tabs)/_layout.tsx).
  handleArea: { paddingTop: 14, paddingBottom: 10, alignItems: "center" },
  handle: { width: 42, height: 4, borderRadius: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  sub: { fontSize: 13, marginTop: 2 },
  done: { paddingHorizontal: 18, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  doneText: { fontSize: 15, fontWeight: "700" },
  pins: { flexDirection: "row", gap: 10, marginBottom: 14 },
  pin: { height: 44, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  pinText: { fontSize: 14, fontWeight: "700" },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 12.5, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  newTile: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  form: { paddingTop: 10 },
  guest: { alignItems: "center", gap: 10, paddingVertical: 18 },
  guestTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  guestSub: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 300 },
  signIn: { marginTop: 6, height: 46, paddingHorizontal: 40, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  signInText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
