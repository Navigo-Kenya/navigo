import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSearch } from "../../store/app";
import { Icon } from "@/components/icons/Icon";

// Core Brand Palette
const COLORS = {
  primary: "#FF6F00",
  primaryLight: "#FFF4E5",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  border: "#F0F0F0",
  textHeading: "#111827",
  textBody: "#4B5563",
  textMuted: "#9CA3AF",
  alertBg: "#FEF9C3",
  alertText: "#854D0E",
  skeleton: "#E5E7EB",
  urgency: "#DC2626", // Red for urgent context
};

// Mock Data - Now with Contextual Urgency
const PREDICTIVE_ROUTES = [
  {
    id: "1",
    title: "Université",
    subtitle: "Ligne 12 • Last bus in 8 mins!", // Urgency added
    eta: "15 min",
    icon: "school-outline",
    isUrgent: true,
  },
  {
    id: "2",
    title: "Gym / Sports",
    subtitle: "Ligne 04 • Fast route",
    eta: "8 min",
    icon: "barbell-outline",
    isUrgent: false,
  },
];

const COMMUNITY_ALERTS = [
  { id: "1", type: "warning", text: "Heavy traffic reported near Rond-Point." },
  { id: "2", type: "warning", text: "Construction work on Rue de la Paix." },
];

// Reusable Skeleton Card Component
const SkeletonCard = () => {
  const fadeAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.predictiveCard,
        { opacity: fadeAnim, borderColor: "transparent" },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: COLORS.skeleton }]} />
      <View style={styles.cardInfo}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonSubtitle} />
      </View>
    </Animated.View>
  );
};

export default function Home() {
  const router = useRouter();
  const { setFrom, setTo } = useSearch();
  const insets = useSafeAreaInsets();

  // Simulated Loading State for the Python Bridge
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate a 1.5s network request to your predictive API
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleNavigation = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const handlePredictiveRouting = (destination: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTo(destination);
    router.push("/(tabs)/map");
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Personalized Greeting with Gamification Badge */}
      <View style={styles.headerArea}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>Good afternoon, Arden</Text>
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 5-day streak</Text>
          </View>
        </View>
        <Text style={styles.headline}>Where to?</Text>
      </View>

      {/* Primary Action: Flat, Clean Search Pill */}
      <Pressable
        style={({ pressed }) => [
          styles.searchPill,
          pressed && { backgroundColor: "#F9FAFB" },
        ]}
        onPress={() => handleNavigation("/(tabs)/search")}
      >
        <View style={styles.searchLeft}>
          <View style={styles.searchDot} />
          <Text style={styles.searchText}>Search destination or stage</Text>
        </View>
        <View style={styles.searchRight}>
          <Icon name="time-outline" size={18} color={COLORS.textHeading} />
          <Text style={styles.searchRightText}>Now</Text>
        </View>
      </Pressable>

      {/* Predictive Hub */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested for you</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {isLoading ? (
            // Render 2 skeletons while "fetching"
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            PREDICTIVE_ROUTES.map((route) => (
              <Pressable
                key={route.id}
                style={({ pressed }) => [
                  styles.predictiveCard,
                  pressed && { borderColor: COLORS.primary },
                  route.isUrgent && {
                    borderColor: COLORS.primaryLight,
                    backgroundColor: "#FFFAFA",
                  },
                ]}
                onPress={() => handlePredictiveRouting(route.title)}
              >
                <View style={styles.cardIcon}>
                  <Icon
                    name={route.icon as any}
                    size={22}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{route.title}</Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      route.isUrgent && {
                        color: COLORS.urgency,
                        fontWeight: "500",
                      },
                    ]}
                  >
                    {route.subtitle}
                  </Text>
                </View>
                <View style={styles.etaBadge}>
                  <Text style={styles.etaText}>{route.eta}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Community Layer */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community Pulse</Text>
        {COMMUNITY_ALERTS.map((alert) => (
          <View key={alert.id} style={styles.alertCard}>
            <Icon
              name="warning-outline"
              size={20}
              color={COLORS.alertText}
            />
            <Text style={styles.alertText}>{alert.text}</Text>
          </View>
        ))}

        {/* Primary Map CTA */}
        <Pressable
          style={({ pressed }) => [styles.mapCta, pressed && { opacity: 0.85 }]}
          onPress={() => handleNavigation("/(tabs)/map")}
        >
          <Icon name="map-outline" size={20} color="#FFFFFF" />
          <Text style={styles.mapCtaText}>Explore Live Map</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  headerArea: {
    marginBottom: 28,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  greeting: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  streakBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  headline: {
    fontSize: 28,
    fontWeight: "600",
    color: COLORS.textHeading,
    letterSpacing: -0.5,
  },
  searchPill: {
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchDot: {
    width: 8,
    height: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    marginRight: 12,
  },
  searchText: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  searchRight: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  searchRightText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textHeading,
    marginLeft: 4,
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.textHeading,
    marginBottom: 16,
  },
  horizontalScroll: {
    gap: 12,
    paddingRight: 20,
  },
  predictiveCard: {
    backgroundColor: COLORS.surface,
    width: 250,
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIcon: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textHeading,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textBody,
    fontWeight: "400",
  },
  etaBadge: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  etaText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textHeading,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.alertBg,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  alertText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.alertText,
    marginLeft: 12,
    flex: 1,
  },
  mapCta: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
  },
  mapCtaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  // Skeleton Styles
  skeletonTitle: {
    width: "70%",
    height: 14,
    backgroundColor: COLORS.skeleton,
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonSubtitle: {
    width: "40%",
    height: 10,
    backgroundColor: COLORS.skeleton,
    borderRadius: 4,
  },
});
