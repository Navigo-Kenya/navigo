// components/app/stop/FormSheet.tsx
//
// Bottom-sheet form shell for contributions (review, suggest an edit,
// report, a new stop): a plain draggable sheet (hooks/useDraggableSheet:
// slides up, no spring), keyboard-aware, sticky submit button, drag the
// handle down (or tap outside) to dismiss. Forms stay in a native Modal so
// text inputs and the keyboard behave on both platforms.
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "@/components/ui/PressableScale";
import { Icon } from "@/components/icons/Icon";
import { useDraggableSheet } from "@/hooks/useDraggableSheet";

const SH = Dimensions.get("window").height;
const ORANGE = "#FF6F00";

export function formColors(dark: boolean) {
  return {
    bg: dark ? "#18181B" : "#FFFFFF",
    card: dark ? "#27272A" : "#F4F4F5",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    line: dark ? "#3F3F46" : "#E5E7EB",
    input: dark ? "#27272A" : "#F4F4F5",
  };
}

export function FormSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  accent = ORANGE,
  submitLabel,
  submitting,
  submitDisabled,
  onSubmit,
  footerHint,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  submitLabel: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  /** Small line above the button ("+10 Safiri Points"). */
  footerHint?: string;
  children: React.ReactNode;
}) {
  const dark = useColorScheme() === "dark";
  const C = formColors(dark);
  const insets = useSafeAreaInsets();
  const { translateY, backdrop, panHandlers, close } = useDraggableSheet(visible, onClose);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.sheet, { backgroundColor: C.bg, transform: [{ translateY }], maxHeight: SH * 0.9 }]}
        >
          <View {...panHandlers}>
            <View style={styles.handleWrap}>
              <View style={[styles.handle, { backgroundColor: C.line }]} />
            </View>
            <View style={styles.header}>
              <View style={[styles.iconCircle, { backgroundColor: accent + "1F" }]}>
                <Icon name={icon} size={18} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>
                  {title}
                </Text>
                {!!subtitle && (
                  <Text style={[styles.subtitle, { color: C.sub }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              <PressableScale
                onPress={() => close()}
                hitSlop={10}
                style={[styles.closeBtn, { backgroundColor: C.card }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={16} color={C.sub} />
              </PressableScale>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: C.line, paddingBottom: Math.max(insets.bottom, 14) }]}>
            {!!footerHint && <Text style={[styles.hint, { color: C.sub }]}>{footerHint}</Text>}
            <PressableScale
              onPress={onSubmit}
              disabled={submitting || submitDisabled}
              style={[
                styles.submit,
                { backgroundColor: accent },
                (submitting || submitDisabled) && { opacity: 0.45 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </PressableScale>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Section label inside a form. */
export function FormLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return <Text style={[styles.label, { color }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18, gap: 16 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 },
  footer: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  hint: { fontSize: 11.5, textAlign: "center" },
  submit: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "800" },
});
