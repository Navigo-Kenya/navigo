// components/contribution/RewardToast.tsx
//
// The thanks after a contribution: a card that slides down from the top for
// a few seconds. "+10 Safiri Points · 5-day streak"; a new badge, drawn as
// Navigo draws it (tap to see your badges); or "Sent for review" with what
// approval will earn. Mounted once in app/_layout.tsx, fed by rewardStore.
// Not a modal: it never blocks the screen or fights a closing sheet.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { rewardLines, useRewardStore } from "@/store/rewardStore";
import { useContributionStore } from "@/store/contributionStore";
import { NavigoBadge, familyOf, tierOf } from "@/components/badges/NavigoBadge";
import { Icon } from "@/components/icons/Icon";

const ORANGE = "#FF6F00";
const GREEN = "#10B981";
const SHOW_MS = 3600;
const SHOW_BADGE_MS = 5200;

export function RewardToast() {
  const reward = useRewardStore((s) => s.reward);
  const clear = useRewardStore((s) => s.clear);
  const badges = useContributionStore((s) => s.badges);
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // The badge as the API knows it, once the store has it (it refreshes the
  // badges after a contribution that earned one).
  const slug = reward?.badges?.[0] ?? null;
  const badge = useMemo(() => {
    if (!slug) return null;
    const all = [...badges.earned, ...badges.locked];
    const b = all.find((x) => x.slug === slug);
    return b ? { b, family: familyOf(b), tier: tierOf(b, all) } : null;
  }, [slug, badges]);

  useEffect(() => {
    if (!reward) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    y.setValue(-160);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(hide, reward.badges?.length ? SHOW_BADGE_MS : SHOW_MS);
    return () => clearTimeout(t);
    // A new reward (its `at`) restarts the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward?.at]);

  function hide() {
    Animated.parallel([
      Animated.timing(y, { toValue: -160, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => clear());
  }

  if (!reward) return null;
  const { title, sub } = rewardLines(reward, badge?.b.name ?? null);
  const pending = !!reward.pendingPoints && !reward.badges?.length;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.wrap, { top: insets.top + 8, opacity, transform: [{ translateY: y }] }]}
    >
      <Pressable
        onPress={() => {
          hide();
          if (slug) router.push("/(account)/badges" as any);
        }}
        style={[s.card, { backgroundColor: dark ? "#27272A" : "#111827" }]}
        accessibilityRole="button"
        accessibilityLabel={[title, sub].filter(Boolean).join(", ")}
        accessibilityLiveRegion="polite"
      >
        {badge ? (
          <NavigoBadge family={badge.family} tier={badge.tier} color={badge.b.color} icon={badge.b.icon} size={46} />
        ) : (
          <View style={[s.coin, { backgroundColor: (pending ? ORANGE : GREEN) + "26" }]}>
            <Icon name={pending ? "hourglass" : slug ? "ribbon" : "star"} size={20} color={pending ? ORANGE : GREEN} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          {sub ? <Text style={s.sub} numberOfLines={2}>{sub}</Text> : null}
        </View>
        {slug ? <Icon name="chevron-forward" size={16} color="#A1A1AA" /> : null}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 1000, elevation: 30 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  coin: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sub: { color: "#D4D4D8", fontSize: 12.5, marginTop: 2 },
});
