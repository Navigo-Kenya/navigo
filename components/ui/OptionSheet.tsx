// components/ui/OptionSheet.tsx
//
// Pick one option from a bottom sheet: each option with a line of
// explanation and a tick on the current one. Replaces the Alert pickers,
// which put a "✓" in front of a label and couldn't say what an option does.
// A plain draggable sheet (hooks/useDraggableSheet): it slides up, and drags
// down (or a tap outside) to close.
import React from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useDraggableSheet } from "@/hooks/useDraggableSheet";

const ORANGE = "#FF6F00";

export interface Option<T> {
  value: T;
  label: string;
  description?: string;
}

export function OptionSheet<T extends string | number | boolean>({
  visible,
  title,
  subtitle,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: Option<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const { translateY, backdrop, panHandlers, close } = useDraggableSheet(visible, onClose);
  const C = {
    sheet: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#27272A" : "#EEF0F3",
    on: dark ? "rgba(255,111,0,0.14)" : "#FFF4EB",
    handle: dark ? "#3F3F46" : "#D1D5DB",
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
        </Animated.View>
        <View style={s.bottom} pointerEvents="box-none">
          {/* The whole sheet drags: the options are few, so no inner scroll fights it. */}
          <Animated.View
            {...panHandlers}
            style={[s.sheet, { backgroundColor: C.sheet, paddingBottom: Math.max(insets.bottom, 14), transform: [{ translateY }] }]}
          >
            <View style={s.handleArea}>
              <View style={[s.handle, { backgroundColor: C.handle }]} />
            </View>
            <Text style={[s.title, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[s.subtitle, { color: C.sub }]}>{subtitle}</Text> : null}
            <View style={{ marginTop: 4 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onSelect(o.value);
                      close();
                    }}
                    style={({ pressed }) => [s.row, { backgroundColor: on ? C.on : pressed ? C.line : "transparent" }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.label, { color: on ? ORANGE : C.text }]}>{o.label}</Text>
                      {o.description ? <Text style={[s.desc, { color: C.sub }]}>{o.description}</Text> : null}
                    </View>
                    <View style={[s.radio, { borderColor: on ? ORANGE : C.sub }]}>
                      {on ? <View style={s.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.32)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  // The same handle as the tab sheets (app/(tabs)/_layout.tsx).
  handleArea: { paddingTop: 14, paddingBottom: 10, alignItems: "center" },
  handle: { width: 42, height: 4, borderRadius: 2 },
  title: { fontSize: 19, fontWeight: "800", paddingHorizontal: 8 },
  subtitle: { fontSize: 13.5, paddingHorizontal: 8, marginTop: 3, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 14, marginTop: 4 },
  label: { fontSize: 16, fontWeight: "700" },
  desc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: ORANGE },
});
