// components/ui/OptionSheet.tsx
//
// Pick one option from a bottom sheet: each option with a line of
// explanation and a tick on the current one. Replaces the Alert pickers,
// which put a "✓" in front of a label and couldn't say what an option does.
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import Reanimated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/icons/Icon";

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
  const C = {
    sheet: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#27272A" : "#EEF0F3",
    on: dark ? "rgba(255,111,0,0.14)" : "#FFF4EB",
    handle: dark ? "#3F3F46" : "#D1D5DB",
  };
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, s.backdrop]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          </Reanimated.View>
          <View style={s.bottom} pointerEvents="box-none">
            <Reanimated.View
              entering={SlideInDown.springify().damping(22).stiffness(260)}
              style={[s.sheet, { backgroundColor: C.sheet, paddingBottom: Math.max(insets.bottom, 14) }]}
            >
              <View style={[s.handle, { backgroundColor: C.handle }]} />
              <Text style={[s.title, { color: C.text }]}>{title}</Text>
              {subtitle ? <Text style={[s.subtitle, { color: C.sub }]}>{subtitle}</Text> : null}
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {options.map((o) => {
                  const on = o.value === value;
                  return (
                    <Pressable
                      key={String(o.value)}
                      onPress={() => { Haptics.selectionAsync(); onSelect(o.value); onClose(); }}
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
              </ScrollView>
            </Reanimated.View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

/** A yes/no setting's tick, for rows that toggle in place. */
export function Check({ on }: { on: boolean }) {
  return on ? <Icon name="checkmark" size={18} color={ORANGE} /> : null;
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.38)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 14, paddingTop: 8 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 19, fontWeight: "800", paddingHorizontal: 8 },
  subtitle: { fontSize: 13.5, paddingHorizontal: 8, marginTop: 3, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 14, marginTop: 4 },
  label: { fontSize: 16, fontWeight: "700" },
  desc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: ORANGE },
});
