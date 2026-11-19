// components/ui/ActionSheet.tsx
//
// A menu of actions in a plain draggable sheet (hooks/useDraggableSheet),
// Google Maps' "⋯" menu: an icon and a label per action, destructive ones
// in red. Replaces Alert menus, which Android cuts to three buttons (so a
// place's "Remove" could simply be missing), and ActionSheetIOS, which has
// no icons and looks different on each platform.
import React, { useCallback, useMemo, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useDraggableSheet } from "@/hooks/useDraggableSheet";
import { Icon, type IconName } from "@/components/icons/Icon";

const RED = "#DC2626";

export interface SheetAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  /** A line under the label. */
  hint?: string;
  run: () => void;
}

/** After the sheet is gone: a modal opened by an action must not race this one's dismissal (iOS). */
const RUN_AFTER_MS = 120;

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const { translateY, backdrop, panHandlers, close } = useDraggableSheet(visible, onClose);
  const C = {
    sheet: dark ? "#18181B" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    pressed: dark ? "#27272A" : "#F3F4F6",
    tile: dark ? "#27272A" : "#F3F4F6",
    handle: dark ? "#3F3F46" : "#D1D5DB",
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
        </Animated.View>
        <View style={s.bottom} pointerEvents="box-none">
          <Animated.View
            {...panHandlers}
            style={[s.sheet, { backgroundColor: C.sheet, paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY }] }]}
          >
            <View style={s.handleArea}>
              <View style={[s.handle, { backgroundColor: C.handle }]} />
            </View>
            {title ? (
              <View style={s.head}>
                <Text style={[s.title, { color: C.text }]} numberOfLines={2}>{title}</Text>
                {subtitle ? <Text style={[s.subtitle, { color: C.sub }]} numberOfLines={2}>{subtitle}</Text> : null}
              </View>
            ) : null}
            {actions.map((a) => {
              const color = a.destructive ? RED : C.text;
              return (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    Haptics.selectionAsync();
                    close(() => setTimeout(a.run, RUN_AFTER_MS));
                  }}
                  style={({ pressed }) => [s.row, { backgroundColor: pressed ? C.pressed : "transparent" }]}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  {a.icon ? (
                    <View style={[s.tile, { backgroundColor: a.destructive ? RED + "14" : C.tile }]}>
                      <Icon name={a.icon} size={18} color={a.destructive ? RED : C.text} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.label, { color }]} numberOfLines={1}>{a.label}</Text>
                    {a.hint ? <Text style={[s.hint, { color: C.sub }]} numberOfLines={2}>{a.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * One action sheet for a screen: `open(title, actions)` shows it, and
 * `element` goes once in the screen's tree.
 */
export function useActionSheet() {
  const [state, setState] = useState<{ title?: string; subtitle?: string; actions: SheetAction[] } | null>(null);
  const open = useCallback(
    (title: string | undefined, actions: SheetAction[], subtitle?: string) => setState({ title, subtitle, actions }),
    []
  );
  const onClose = useCallback(() => setState(null), []);
  const element = useMemo(
    () => (
      <ActionSheet
        visible={!!state}
        title={state?.title}
        subtitle={state?.subtitle}
        actions={state?.actions ?? []}
        onClose={onClose}
      />
    ),
    [state, onClose]
  );
  return { open, element };
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.32)" },
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handleArea: { paddingTop: 14, paddingBottom: 6, alignItems: "center" },
  handle: { width: 42, height: 4, borderRadius: 2 },
  head: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  title: { fontSize: 17, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14 },
  tile: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15.5, fontWeight: "600" },
  hint: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
});
