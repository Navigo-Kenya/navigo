// components/notifications/InAppBanner.tsx
//
// A notification that arrives while the app is open, Snapchat's way: a
// small rounded card drops from the top, with a coloured circle for its
// kind, the title and a line of text. Swipe it up to dismiss, tap it to
// open what it's about; it leaves on its own after a few seconds (not
// while a finger is on it). Several waiting at once become one card,
// "3 new notifications", which opens the inbox. Mounted once in
// app/_layout.tsx; fed by services/inAppNotifications.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { KIND_META, bannerView, useInAppBannerStore, type BannerView } from "@/services/inAppNotifications";
import { useRewardStore } from "@/store/rewardStore";
import { Icon } from "@/components/icons/Icon";

const HIDDEN_Y = -200;
const SHOW_MS = 4500;
const INBOX = "/(account)/notification-inbox";

function viewKey(v: BannerView | null): string | null {
  if (!v) return null;
  return v.mode === "one" ? `one:${v.item.id}` : `many:${v.count}`;
}

export function InAppBanner() {
  const queue = useInAppBannerStore((s) => s.queue);
  // The thanks after a contribution has the top first; the banner waits.
  const rewardShowing = useRewardStore((s) => !!s.reward);
  const view = rewardShowing ? null : bannerView(queue);
  const key = viewKey(view);

  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(HIDDEN_Y)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const startTimer = () => {
    stopTimer();
    timer.current = setTimeout(() => dismiss(), SHOW_MS);
  };

  /** Slides away; then the next card (or nothing), and `after`. */
  function dismiss(after?: () => void) {
    if (leaving.current) return;
    leaving.current = true;
    stopTimer();
    const shown = viewRef.current;
    Animated.timing(y, { toValue: HIDDEN_Y, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      const st = useInAppBannerStore.getState();
      if (shown?.mode === "many") st.clear();
      else st.shift();
      after?.();
    });
  }

  useEffect(() => {
    if (!key) return;
    leaving.current = false;
    y.setValue(HIDDEN_Y);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(y, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    startTimer();
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => stopTimer(),
      // Up follows the finger; down only gives a little.
      onPanResponderMove: (_, g) => y.setValue(g.dy < 0 ? g.dy : g.dy * 0.15),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24 || g.vy < -0.5) { dismiss(); return; }
        Animated.timing(y, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        startTimer();
      },
      onPanResponderTerminate: () => {
        Animated.timing(y, { toValue: 0, duration: 160, useNativeDriver: true }).start();
        startTimer();
      },
    })
  ).current;

  if (!view) return null;

  const C = {
    card: dark ? "#1C1C1E" : "#FFFFFF",
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    grab: dark ? "#3F3F46" : "#E5E7EB",
  };

  const open = () => {
    const v = viewRef.current;
    const to = v?.mode === "one" ? v.item.screen ?? INBOX : INBOX;
    dismiss(() => router.push(to as any));
  };

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[s.wrap, { top: insets.top + 6, transform: [{ translateY: y }] }]}
    >
      <Pressable
        onPress={open}
        onPressIn={stopTimer}
        onPressOut={() => { if (!leaving.current) startTimer(); }}
        style={({ pressed }) => [s.card, { backgroundColor: C.card, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          view.mode === "one" ? `${view.item.title}. ${view.item.body}` : `${view.count} new notifications`
        }
        accessibilityHint="Opens it. Swipe up to dismiss."
      >
        {view.mode === "one" ? (
          <>
            <View style={[s.avatar, { backgroundColor: KIND_META[view.item.kind].color }]}>
              <Icon name={KIND_META[view.item.kind].icon} size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.top}>
                <Text style={[s.kind, { color: KIND_META[view.item.kind].color }]} numberOfLines={1}>
                  {KIND_META[view.item.kind].label.toUpperCase()}
                </Text>
                <Text style={[s.when, { color: C.sub }]}>now</Text>
              </View>
              <Text style={[s.title, { color: C.text }]} numberOfLines={1}>{view.item.title}</Text>
              {view.item.body ? <Text style={[s.body, { color: C.sub }]} numberOfLines={2}>{view.item.body}</Text> : null}
            </View>
          </>
        ) : (
          <>
            <View style={[s.stack, { width: 42 + (view.kinds.length - 1) * 14 }]}>
              {view.kinds.map((k, i) => (
                <View key={k} style={[s.avatar, s.stacked, { left: i * 14, backgroundColor: KIND_META[k].color, borderColor: C.card }]}>
                  <Icon name={KIND_META[k].icon} size={18} color="#FFFFFF" />
                </View>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, { color: C.text }]} numberOfLines={1}>{view.count} new notifications</Text>
              <Text style={[s.body, { color: C.sub }]} numberOfLines={1}>
                {view.kinds.map((k) => KIND_META[k].label).join(", ")}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.sub} />
          </>
        )}
        <View style={[s.grab, { backgroundColor: C.grab }]} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 10, right: 10, zIndex: 999, elevation: 28 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 12,
    paddingRight: 14,
    paddingTop: 12,
    paddingBottom: 16,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  stack: { height: 42 },
  stacked: { position: "absolute", top: 0, borderWidth: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  kind: { flex: 1, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.7 },
  when: { fontSize: 11.5, fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "800", marginTop: 1 },
  body: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  grab: { position: "absolute", bottom: 6, alignSelf: "center", left: "50%", marginLeft: -16, width: 32, height: 4, borderRadius: 2 },
});
